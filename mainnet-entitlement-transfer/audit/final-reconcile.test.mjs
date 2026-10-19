import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {encodeAbiParameters,encodeErrorResult,encodeEventTopics,keccak256,zeroAddress} from 'viem';
import {json} from '../../live-test/preflight.mjs';
import * as audit from './final-reconcile.mjs';

// Only public session/manifest/compiled ABIs. All saved-looking evidence is
// synthetic; no .env, network, actual journal or actual budget is accessed.
const readJson=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const [session,manifest,vaultArtifact,bemArtifact,nftArtifact]=await Promise.all([
  readJson('../../mainnet-test/session.json'),readJson('../../mainnet-test/live-manifest.json'),
  readJson('../../out/GroupBuyVault.sol/GroupBuyVault.json'),readJson('../../out/IERC20.sol/IERC20.json'),readJson('../../out/IERC721.sol/IERC721.json'),
]);
const vaultAbi=vaultArtifact.abi,bemAbi=bemArtifact.abi,nftAbi=nftArtifact.abi,clone=v=>structuredClone(v);
const H='0x'+'ab'.repeat(32),TX='0x'+'cd'.repeat(32),OTHER='0x0000000000000000000000000000000000000099';
const A0=13665485n,P0=13665400n,Q0=136654n,R0=85n,X=32254n,D=323n,A1=13697739n,Q1=136977n,R1=39n;
const IDS=Array.from({length:100},(_,n)=>BigInt(n+1));
const baseline=()=>({receivedRaw:String(X),perShareIncrementRaw:String(D),totalAccountedRaw:String(A1),totalPaidBeforeRaw:String(P0),accPerShareRaw:String(Q1),
  remainderRaw:String(R1),previousAccPerShareRaw:String(Q0),previousRemainderRaw:String(R0),decimals:8});
function context(step='new-harvest'){
  return {session,manifest,vaultAbi,bemAbi,action:{step,pool:session.pool.address,to:session.pool.address,from:step==='buyer-b-claim'?session.buyerB:session.creator,
    ids:step==='new-harvest'?[]:[1n],nonce:step==='new-harvest'?13:step==='transfer-share'?14:6,valueWei:'0',template:manifest.template.address}};
}
function wire(abi,name,address,args,index){
  const event=abi.find(e=>e.type==='event'&&e.name===name),plain=event.inputs.filter(p=>!p.indexed);
  return {address,topics:encodeEventTopics({abi:[event],eventName:name,args}),data:encodeAbiParameters(plain,plain.map(p=>args[p.name])),
    transactionHash:TX,blockHash:H,blockNumber:100n,transactionIndex:2,logIndex:index,removed:false};
}
function receipt(c,patch={}){
  const pool=c.action.pool,sync=(v,n)=>wire(vaultAbi,'RewardsSynced',pool,v,n),bem=(v,n)=>wire(bemAbi,'Transfer',manifest.config.bem,v,n);
  const logs=c.action.step==='new-harvest'?[
    sync({received:0n,totalAccounted:A0,accPerShare:Q0,remainder:R0,...patch.first},1),
    bem({from:zeroAddress,to:pool,value:X,...patch.bem},2),
    sync({received:X,totalAccounted:A1,accPerShare:Q1,remainder:R1,...patch.sync},3),
    wire(vaultAbi,'Harvested',pool,{caller:session.creator,received:X,...patch.harvest},4),
  ]:c.action.step==='transfer-share'?[
    wire(vaultAbi,'TransferSingle',pool,{operator:session.creator,from:session.creator,to:session.buyerB,id:1n,value:1n,...patch.share},1),
  ]:[sync({received:0n,totalAccounted:A1,accPerShare:Q1,remainder:R1,...patch.sync},1),
    wire(vaultAbi,'RewardClaimed',pool,{holder:session.buyerB,id:1n,amount:D,...patch.claim},2),
    bem({from:pool,to:session.buyerB,value:D,...patch.bem},3)];
  return {status:'success',from:c.action.from,to:pool,contractAddress:null,transactionHash:TX,blockHash:H,blockNumber:100n,transactionIndex:2,logs};
}
test('audit is not ready until exactly three ordered confirmed positive steps exist',()=>{
  const journal={steps:['new-harvest','transfer-share','buyer-b-claim'].map(step=>({step,status:'CONFIRMED',positiveTest:{status:'PASS'}}))};
  assert.equal(audit.readiness(journal).ready,true);assert.equal(audit.readiness(undefined).ready,false);
  for(const change of [j=>j.steps.pop(),j=>j.steps[2].status='SUBMITTED',j=>j.steps[0].positiveTest.status='FAIL',j=>j.steps.reverse()]){
    const j=clone(journal);change(j);assert.equal(audit.readiness(j).ready,false);
  }
});
test('math pays increment323 and leaves99 unpaid shares plus39 remainder, never paying cumulative accumulator',()=>{
  assert.ok(audit.reconcileMath(baseline(),'323','32016'));assert.equal(X+R0,D+32016n);assert.equal(99n*D+R1,32016n);
  for(const args of [[baseline(),String(Q1),'32016'],[baseline(),'323','32015'],[baseline(),'324','32015'],
    [{...baseline(),previousRemainderRaw:'0'},'323','32016'],[{...baseline(),perShareIncrementRaw:'322'},'323','32016']])assert.throws(()=>audit.reconcileMath(...args));
});
test('new harvest independently decodes actual mint with nonzero old ledger and remainder',()=>{
  const c=context(),result=audit.decodeStep(receipt(c),c);assert.deepEqual(result.baseline,baseline());assert.equal(result.paymentRaw,'0');
  for(const patch of [{first:{totalAccounted:0n}},{first:{remainder:0n}},{first:{received:1n}},{bem:{from:manifest.config.mining}},
    {bem:{to:OTHER}},{bem:{value:X+1n}},{sync:{accPerShare:Q1-1n}},{sync:{totalAccounted:X}}])assert.throws(()=>audit.decodeStep(receipt(c,patch),c));
});
test('transfer permits only exact Vault share1 creator to B and no BEM, miner or reward events',()=>{
  const c=context('transfer-share');assert.ok(audit.decodeStep(receipt(c),c,baseline()));
  for(const share of [{operator:OTHER},{from:OTHER},{to:OTHER},{id:3204n},{id:2n},{value:2n}])assert.throws(()=>audit.decodeStep(receipt(c,{share}),c,baseline()));
  for(const extra of [wire(vaultAbi,'RewardsSynced',c.action.pool,{received:0n,totalAccounted:A1,accPerShare:Q1,remainder:R1},2),
    wire(bemAbi,'Transfer',manifest.config.bem,{from:c.action.pool,to:session.buyerB,value:1n},2),
    wire(nftAbi,'Transfer',session.collection,{from:c.action.pool,to:session.buyerB,tokenId:3204n},2)]){
    const r=receipt(c);r.logs.push(extra);assert.throws(()=>audit.decodeStep(r,c,baseline()));
  }
});
test('B claim1 pays only323 and rejects cumulative amount, other recipient or new inflow',()=>{
  const c=context('buyer-b-claim'),result=audit.decodeStep(receipt(c),c,baseline());assert.equal(result.paymentRaw,'323');
  for(const patch of [{claim:{amount:Q1}},{claim:{id:68n}},{claim:{holder:session.creator}},{bem:{value:Q1}},{bem:{to:OTHER}},
    {sync:{received:1n}},{sync:{totalAccounted:A1+1n}},{sync:{accPerShare:Q1+1n}}])assert.throws(()=>audit.decodeStep(receipt(c,patch),c,baseline()));
  const missing=receipt(c);missing.logs.splice(1,1);assert.throws(()=>audit.decodeStep(missing,c,baseline()));
});
test('raw receipt identity rejects foreign transaction/block, removed, duplicate or unordered logs',()=>{
  for(const step of ['new-harvest','transfer-share','buyer-b-claim']){
    const c=context(step);
    for(const change of [r=>r.status='reverted',r=>r.logs[0].transactionHash=H,r=>r.logs[0].blockNumber=101n,r=>r.logs[0].transactionIndex=3,
      r=>r.logs[0].removed=true,r=>r.logs.push(clone(r.logs[0]))]){
      const r=receipt(c);change(r);assert.throws(()=>audit.decodeStep(r,c,step==='new-harvest'?null:baseline()));
    }
  }
});
function snapshot(c,{after=false}={}){
  const step=c.action.step,harvested=step!=='new-harvest'||after,transferred=step==='buyer-b-claim'||(step==='transfer-share'&&after),claimed=step==='buyer-b-claim'&&after;
  const holder=id=>(id===1n&&transferred)||id>=68n?session.buyerB:session.creator;
  const accounted=harvested?A1:A0,paid=P0+(claimed?D:0n),vault=accounted-paid;
  return {blockNumber:'100',blockHash:H,timestamp:'1000',state:'2',soldCount:'100',fundedWei:'0',totalPrincipalIn:'303000000000000000',totalPrincipalRefunded:'0',purchaseSpent:'303000000000000000',
    soldBitmap:String((1n<<100n)-1n),totalAccounted:String(accounted),totalPaid:String(paid),accPerShare:String(harvested?Q1:Q0),remainder:String(harvested?R1:R0),vaultBemRaw:String(vault),
    bemBalances:{vault:String(vault),creator:'1000',buyerB:'2000',sellerA:'3000'},nftOwner:c.action.pool,
    poolCode:`0x363d3d373d3d3d363d73${manifest.template.address.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`,isPool:true,actorCode:'0x',recipientCode:'0x',decimals:8,vaultNativeWei:'0',
    shares:IDS.map(id=>({id:String(id),holder:holder(id),supply:'1',claimed:String(id===1n&&claimed?Q1:Q0),claimable:String(harvested&&!(id===1n&&claimed)?D:0n)})),
    creatorBalances:IDS.map(id=>holder(id)===session.creator?'1':'0'),buyerBalances:IDS.map(id=>holder(id)===session.buyerB?'1':'0'),
    formerHolderDenied:transferred?{status:'PASS',account:session.creator,id:'1',expectedError:'NotHolder',blockNumber:'100',transactionsSent:0}:null};
}
test('saved all100 snapshots preserve transferred rights and require former-holder NotHolder evidence',()=>{
  for(const step of ['new-harvest','transfer-share','buyer-b-claim'])for(const after of [false,true]){
    const c=context(step);assert.doesNotThrow(()=>audit.checkSnapshot(snapshot(c,{after}),c,step==='new-harvest'&&!after?null:baseline(),{after}));
  }
  const c=context('transfer-share');
  for(const change of [s=>s.shares[0].claimed='0',s=>s.shares[0].claimable='0',s=>s.shares[1].holder=session.buyerB,s=>s.totalPaid=String(P0+D),
    s=>s.vaultBemRaw='0',s=>s.formerHolderDenied.expectedError='TimeoutError',s=>s.formerHolderDenied.status='FAIL',s=>s.formerHolderDenied.account=OTHER,
    s=>s.formerHolderDenied.id='2',s=>s.formerHolderDenied.blockNumber='99',s=>s.formerHolderDenied.transactionsSent=1,s=>delete s.formerHolderDenied]){
    const s=snapshot(c,{after:true});change(s);assert.throws(()=>audit.checkSnapshot(s,c,baseline(),{after:true}));
  }
});
test('plan source and history hashes are bound, fabricated old budgets fail, and final PASS path is preserved',()=>{
  const input={...context('transfer-share'),sessionHash:audit.SESSION_HASH,completionToolHash:'a'.repeat(64),fundingToolHash:'b'.repeat(64),poolToolHash:'c'.repeat(64),sellerToolHash:'d'.repeat(64),bindings:{manifestHash:H}};
  const action=audit.actionFor(input,'transfer-share'),entry={planHash:H,gas:'100000',gasPrice:'50000000',maxFeeWei:'5000000000000'};
  const prerequisite={oldRewards:{journalHash:H},baseline:baseline(),entitlementPrerequisites:[{step:'new-harvest',entryHash:H}]};
  const saved={hash:H,value:{status:'FROZEN_UNSIGNED_ENTITLEMENT_PLAN',chainId:56,sessionHash:audit.SESSION_HASH,entitlementToolHash:audit.TOOL_HASH,
    rewardsToolHash:'501b3ba397abf2d824216a7e246fb90a79d5f81b79046e9cd8b89ed77a5e1649',completionToolHash:input.completionToolHash,fundingToolHash:input.fundingToolHash,
    poolToolHash:input.poolToolHash,sellerRuntimeToolHash:input.sellerToolHash,bindings:clone(input.bindings),...action,gas:entry.gas,gasPrice:entry.gasPrice,maxFeeWei:entry.maxFeeWei,
    maximumSpendWei:entry.maxFeeWei,baseline:baseline(),prerequisite:clone(prerequisite)}};
  assert.equal(audit.checkPlan(saved,input,action,entry,baseline(),prerequisite),true);
  for(const change of [s=>s.hash=TX,s=>s.value.entitlementToolHash='changed',s=>s.value.rewardsToolHash='changed',s=>s.value.completionToolHash='changed',
    s=>s.value.bindings.manifestHash=TX,s=>s.value.nonce++,s=>s.value.to=session.collection,s=>s.value.ids=[2n],s=>s.value.data='0x12',s=>s.value.gasPrice='1',
    s=>s.value.baseline.previousRemainderRaw='0',s=>s.value.prerequisite.oldRewards.journalHash=TX,s=>s.value.prerequisite.entitlementPrerequisites[0].entryHash=TX]){
    const altered=clone(saved);change(altered);assert.throws(()=>audit.checkPlan(altered,input,action,entry,baseline(),prerequisite));
  }
  const journal={schemaVersion:1,chainId:56,sessionHash:audit.SESSION_HASH,steps:[{},{},{}]};
  assert.throws(()=>audit.checkBudget({spentAndReservedWei:'0',reservations:[]},journal,input),/OLD_TWELVE_RESERVATIONS_CHANGED/);
  const reservations=Array.from({length:12},(_,n)=>({command:`synthetic-${n}`,to:action.pool,calldataHash:H,valueWei:'0',maxFeeWei:'1',status:'RECEIPT_VERIFIED'}));
  assert.throws(()=>audit.checkBudget({spentAndReservedWei:'12',reservations},journal,input),/OLD_TWELVE_RESERVATIONS_CHANGED/);
  assert.throws(()=>audit.checkBudget({spentAndReservedWei:'0',reservations},journal,input),/BUDGET_TOTAL_DOES_NOT_MATCH_RESERVATIONS/);
  assert.equal(audit.outputPathFor('PASS'),'mainnet-entitlement-transfer/audit/latest-attempt.json');
  assert.equal(audit.outputPathFor('FAIL'),'mainnet-entitlement-transfer/audit/final-reconciliation.json');
});
test('saved raw NotHolder bytes independently decode and bind to transferred but unclaimed ID1 state',()=>{
  const input=context('transfer-share'),transfer={step:'transfer-share',transactionHash:TX,receipt:{blockNumber:'100',blockHash:H}},claim={receipt:{blockNumber:'110'}},captureHash='a'.repeat(64);
  const record={status:'PASS',scope:'LIVE_READ_ONLY_FORMER_HOLDER_DENIAL',chainId:56,sourceHash:audit.TOOL_HASH,scriptSha256:captureHash,transactionsSent:0,privateKeysUsed:false,
    vault:manifest.vault.address,account:session.creator,newHolder:session.buyerB,functionName:'claim',args:['1'],callValueWei:'0',callGas:'3000000',
    transferTransactionHash:TX,transferEntryHash:keccak256(Buffer.from(json(transfer))),transferReceiptBlockNumber:'100',blockNumber:'100',blockHash:H,
    state:{holder:session.buyerB,creatorBalance:'0',buyerBBalance:'1',claimedRaw:String(Q0),claimableRaw:String(D),accPerShareRaw:String(Q1),vaultCodeHash:manifest.vault.codeHash},
    rawRevertData:encodeErrorResult({abi:vaultAbi,errorName:'NotHolder'}),decodedErrorName:'NotHolder',decodedArgs:[]};
  const result=audit.checkRawDenial(record,input,transfer,claim,baseline(),captureHash);
  assert.equal(result.status,'PASS');assert.equal(result.decodedErrorName,'NotHolder');assert.equal(result.scope,'INDEPENDENT_DECODE_OF_SAVED_REVERT_BYTES');assert.equal(result.freshRpcSimulation,'NOT_RUN');
  for(const change of [r=>r.rawRevertData=encodeErrorResult({abi:vaultAbi,errorName:'InvalidIds'}),r=>r.rawRevertData='0x',r=>r.decodedErrorName='TimeoutError',
    r=>r.sourceHash='changed',r=>r.scriptSha256='changed',r=>r.transferEntryHash=H,r=>r.transferTransactionHash=H,r=>r.blockNumber='99',r=>r.blockNumber='110',r=>r.blockHash=TX,
    r=>r.args=['2'],r=>r.state.claimedRaw=String(Q1),r=>r.state.claimableRaw='0',r=>r.state.accPerShareRaw=String(D),r=>r.state.holder=session.creator]){
    const altered=clone(record);change(altered);assert.throws(()=>audit.checkRawDenial(altered,input,transfer,claim,baseline(),captureHash));
  }
});
