import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ContractFunctionExecutionError,ContractFunctionRevertedError,decodeFunctionData,encodeAbiParameters,encodeErrorResult,encodeEventTopics,keccak256,zeroAddress} from 'viem';
import {sendRecordedOnce} from '../live-test/deploy-mainnet.mjs';
import {json} from '../live-test/preflight.mjs';
import * as entitlement from './entitlement.mjs';

// Public immutable inputs and compiled ABI only; every client is synthetic.
// Never read .env, private keys, live journals/budgets, or connect to an RPC.
const readJson=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url),'utf8'));
const [sessionFixture,manifestFixture,vaultArtifact,factoryArtifact,bemArtifact,nftArtifact]=await Promise.all([
  readJson('../mainnet-test/session.json'),readJson('../mainnet-test/live-manifest.json'),
  readJson('../out/GroupBuyVault.sol/GroupBuyVault.json'),readJson('../out/GroupBuyFactory.sol/GroupBuyFactory.json'),
  readJson('../out/IERC20.sol/IERC20.json'),readJson('../out/IERC721.sol/IERC721.json'),
]);
const vaultAbi=vaultArtifact.abi,factoryAbi=factoryArtifact.abi,bemAbi=bemArtifact.abi,nftAbi=nftArtifact.abi;
const clone=value=>structuredClone(value),same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const H='0x'+'ab'.repeat(32),OTHER_H='0x'+'cd'.repeat(32),TX='0x'+'ef'.repeat(32),OTHER='0x0000000000000000000000000000000000000099';
const SESSION_HASH='0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c';
const BLOCK=128000000n,TIME=1792423200n,GAS=1200000n,PRICE=50000000n;
const A0=13665485n,P0=13665400n,Q0=136654n,R0=85n,H1=12345n,DELTA=124n,A1=13677830n,Q1=136778n,R1=30n;
const ALL_IDS=Array.from({length:100},(_,n)=>BigInt(n+1));
function input(step='new-harvest'){
  const session=clone(sessionFixture),manifest=clone(manifestFixture);
  return {session,manifest,vaultAbi,factoryAbi,sessionHash:SESSION_HASH,sessionFile:'mainnet-test/session.json',bindings:{manifestHash:H},
    toolHash:'f'.repeat(64),rewardsToolHash:'e'.repeat(64),completionToolHash:'a'.repeat(64),fundingToolHash:'b'.repeat(64),poolToolHash:'c'.repeat(64),sellerToolHash:'d'.repeat(64),
    rpcMode:'EXPLICIT_PUBLIC_RPC_FALLBACK',primaryEndpoint:'https://bsc-dataseed.defibit.io',independentEndpoint:'https://bsc-dataseed.bnbchain.org',
    action:entitlement.buildAction(session,manifest,vaultAbi,step)};
}
function wire(abi,name,address,args,index){
  const event=abi.find(e=>e.type==='event'&&e.name===name);assert.ok(event);const plain=event.inputs.filter(p=>!p.indexed);
  return {address,topics:encodeEventTopics({abi:[event],eventName:name,args}),data:encodeAbiParameters(plain,plain.map(p=>args[p.name])),
    blockNumber:BLOCK,blockHash:H,transactionHash:TX,transactionIndex:7,logIndex:index,removed:false};
}
function receipt(i,patch={}){
  const pool=i.action.pool,sync=(args,index)=>wire(vaultAbi,'RewardsSynced',pool,args,index),transfer=(args,index)=>wire(bemAbi,'Transfer',i.manifest.config.bem,args,index);
  const logs=i.action.step==='new-harvest'?[
    sync({received:0n,totalAccounted:A0,accPerShare:Q0,remainder:R0,...patch.firstSync},1),
    transfer({from:zeroAddress,to:pool,value:H1,...patch.bemTransfer},2),
    sync({received:H1,totalAccounted:A1,accPerShare:Q1,remainder:R1,...patch.sync},3),
    wire(vaultAbi,'Harvested',pool,{caller:i.action.from,received:H1,...patch.harvested},4),
  ]:i.action.step==='transfer-share'?[
    wire(vaultAbi,'TransferSingle',pool,{operator:i.session.creator,from:i.session.creator,to:i.session.buyerB,id:1n,value:1n,...patch.shareTransfer},1),
  ]:[
    sync({received:0n,totalAccounted:A1,accPerShare:Q1,remainder:R1,...patch.sync},1),
    wire(vaultAbi,'RewardClaimed',pool,{holder:i.session.buyerB,id:1n,amount:DELTA,...patch.claim},2),
    transfer({from:pool,to:i.session.buyerB,value:DELTA,...patch.bemTransfer},3),
  ];
  return {transactionHash:TX,blockNumber:BLOCK,blockHash:H,transactionIndex:7,from:i.action.from,to:pool,status:'success',
    gasUsed:1000000n,effectiveGasPrice:PRICE,cumulativeGasUsed:1500000n,logs};
}
function baseline(amount=H1){const d=(amount+R0)/100n;return {receivedRaw:String(amount),perShareIncrementRaw:String(d),totalAccountedRaw:String(A0+amount),
  totalPaidBeforeRaw:String(P0),accPerShareRaw:String(Q0+d),remainderRaw:String((amount+R0)%100n),previousAccPerShareRaw:String(Q0),previousRemainderRaw:String(R0),decimals:8};}
test('three zero-value actions target the Vault and freeze nonce, actor and only share1',()=>{
  for(const [step,nonce,actor,fn,args]of [
    ['new-harvest',13,'creator','harvest',[]],
    ['transfer-share',14,'creator','safeTransferFrom',[sessionFixture.creator,sessionFixture.buyerB,1n,1n,'0x']],
    ['buyer-b-claim',6,'buyerB','claim',[1n]],
  ]){
    const i=input(step),a=i.action,decoded=decodeFunctionData({abi:vaultAbi,data:a.data});assert.equal(a.step,step);assert.equal(a.nonce,nonce);
    assert.equal(a.from,i.session[actor]);assert.equal(a.valueWei,'0');assert.ok(same(a.to,i.session.pool.address));assert.ok(!same(a.to,i.session.collection));
    assert.equal(decoded.functionName,fn);assert.deepEqual(decoded.args??[],args);assert.equal(a.dataHash,keccak256(a.data));
  }
});
test('new harvest carries old85 units into integer distribution rather than dropping them',()=>{
  const i=input(),result=entitlement.checkEntitlementEvents(receipt(i),i);
  assert.deepEqual(result.baseline,baseline());assert.equal(result.positiveTest.status,'PASS');
  assert.equal(DELTA*100n+R1,H1+R0);assert.equal(A1-P0,H1+R0);
});
test('new inflow14 fails positive test but15 and99 pass because old remainder participates',()=>{
  for(const [amount,status]of [[0n,'FAIL'],[14n,'FAIL'],[15n,'PASS'],[99n,'PASS']]){
    const i=input(),b=baseline(amount),r=receipt(i,{bemTransfer:{value:amount},sync:{received:amount,totalAccounted:BigInt(b.totalAccountedRaw),accPerShare:BigInt(b.accPerShareRaw),remainder:BigInt(b.remainderRaw)},harvested:{received:amount}});
    const result=entitlement.checkEntitlementEvents(r,i);assert.equal(result.positiveTest.status,status);assert.deepEqual(result.baseline,b);
  }
});
test('harvest rejects dropped old ledger, direct donation and mismatched actual mint',()=>{
  for(const patch of [{firstSync:{received:1n}},{firstSync:{totalAccounted:0n}},{firstSync:{accPerShare:0n}},{firstSync:{remainder:0n}},
    {bemTransfer:{from:manifestFixture.config.mining}},{bemTransfer:{to:OTHER}},{bemTransfer:{value:H1+1n}},
    {sync:{totalAccounted:H1}},{sync:{accPerShare:Q1-1n}},{sync:{remainder:45n}},{harvested:{caller:OTHER}}]){
    const i=input();assert.throws(()=>entitlement.checkEntitlementEvents(receipt(i,patch),i));
  }
});
test('transfer emits only exact single Vault share1 movement and no reward or miner event',()=>{
  const i=input('transfer-share');assert.ok(entitlement.checkEntitlementEvents(receipt(i),i,baseline()));
  for(const shareTransfer of [{operator:OTHER},{from:OTHER},{to:OTHER},{id:3204n},{id:2n},{value:0n},{value:2n}])assert.throws(()=>entitlement.checkEntitlementEvents(receipt(i,{shareTransfer}),i,baseline()));
  for(const extra of [
    wire(vaultAbi,'RewardsSynced',i.action.pool,{received:0n,totalAccounted:A1,accPerShare:Q1,remainder:R1},2),
    wire(vaultAbi,'Harvested',i.action.pool,{caller:i.action.from,received:1n},2),
    wire(bemAbi,'Transfer',i.manifest.config.bem,{from:i.action.pool,to:i.session.buyerB,value:1n},2),
    wire(nftAbi,'Transfer',i.session.collection,{from:i.action.pool,to:i.session.buyerB,tokenId:3204n},2),
  ]){const r=receipt(i);r.logs.push(extra);assert.throws(()=>entitlement.checkEntitlementEvents(r,i,baseline()));}
});
test('B claims only delta for ID1, never accumulated Q1 or other IDs',()=>{
  const i=input('buyer-b-claim'),result=entitlement.checkEntitlementEvents(receipt(i),i,baseline());assert.equal(result.paymentRaw,String(DELTA));
  for(const patch of [{sync:{received:1n}},{sync:{accPerShare:Q1+1n}},{sync:{totalAccounted:A1+1n}},{sync:{remainder:R1+1n}},
    {claim:{holder:i.session.creator}},{claim:{id:68n}},{claim:{amount:Q1}},{bemTransfer:{value:Q1}},{bemTransfer:{to:OTHER}}])assert.throws(()=>entitlement.checkEntitlementEvents(receipt(i,patch),i,baseline()));
  for(const change of [r=>r.logs.splice(1,1),r=>r.logs.push({...clone(r.logs[1]),logIndex:4}),r=>r.logs.push(wire(vaultAbi,'Harvested',i.action.pool,{caller:i.action.from,received:1n},4))]){
    const r=receipt(i);change(r);assert.throws(()=>entitlement.checkEntitlementEvents(r,i,baseline()));
  }
});
test('all receipts reject wrong emitter, removed or mixed transaction and unordered logs',()=>{
  for(const step of ['new-harvest','transfer-share','buyer-b-claim']){
    const i=input(step);
    for(const change of [r=>r.logs[0].address=OTHER,r=>r.logs[0].removed=true,r=>r.logs[0].transactionHash=OTHER_H,r=>r.logs[0].blockNumber=BLOCK+1n,
      r=>r.logs[0].transactionIndex=8,r=>r.logs.push(clone(r.logs[0]))]){
      const r=receipt(i);change(r);assert.throws(()=>entitlement.checkEntitlementEvents(r,i,step==='new-harvest'?null:baseline()));
    }
  }
});
function snapshot(i,{after=false}={}){
  const step=i.action.step,harvested=step!=='new-harvest'||after,transferred=step==='buyer-b-claim'||(step==='transfer-share'&&after),claimed=step==='buyer-b-claim'&&after;
  const holder=id=>(BigInt(id)===1n&&transferred)||BigInt(id)>=68n?i.session.buyerB:i.session.creator;
  const paid=P0+(claimed?DELTA:0n),accounted=harvested?A1:A0;
  const code=`0x363d3d373d3d3d363d73${i.action.template.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
  return {blockNumber:String(BLOCK),blockHash:H,timestamp:String(TIME),state:'2',soldCount:'100',fundedWei:'0',totalPrincipalIn:'303000000000000000',totalPrincipalRefunded:'0',purchaseSpent:'303000000000000000',soldBitmap:String((1n<<100n)-1n),
    totalAccounted:String(accounted),totalPaid:String(paid),accPerShare:String(harvested?Q1:Q0),remainder:String(harvested?R1:R0),
    shares:ALL_IDS.map(id=>({id:String(id),holder:holder(id),supply:'1',claimed:String(id===1n&&claimed?Q1:Q0),claimable:String(harvested&&!(id===1n&&claimed)?DELTA:0n)})),
    creatorBalances:ALL_IDS.map(id=>same(holder(id),i.session.creator)?'1':'0'),buyerBalances:ALL_IDS.map(id=>same(holder(id),i.session.buyerB)?'1':'0'),
    decimals:8,bemBalances:{vault:String(accounted-paid),creator:'1000',buyerB:'2000',sellerA:'3000'},vaultBemRaw:String(accounted-paid),
    nftOwner:i.action.pool,poolCode:code,isPool:true,actorCode:'0x',recipientCode:'0x',actorNativeWei:'1000000000000000000',vaultNativeWei:'0',minerKey:H,pendingRaw:'0',pendingIsNotGuaranteedClaimAmount:true};
}
test('all100 states preserve accrued rights through transfer and update only ID1 on B claim',()=>{
  for(const step of ['new-harvest','transfer-share','buyer-b-claim'])for(const after of [false,true]){
    const i=input(step),s=snapshot(i,{after});assert.doesNotThrow(()=>entitlement.assertEntitlementState(s,i,step==='new-harvest'&&!after?null:baseline(),{after}));
    if(step==='transfer-share'&&after){assert.equal(s.shares.filter(r=>same(r.holder,i.session.creator)).length,66);assert.equal(s.shares.filter(r=>same(r.holder,i.session.buyerB)).length,34);assert.equal(s.shares[0].claimed,String(Q0));assert.equal(s.shares[0].claimable,String(DELTA));}
    if(step==='buyer-b-claim'&&after){assert.equal(s.vaultBemRaw,'12306');assert.equal(s.totalPaid,'13665524');assert.equal(s.shares[0].claimed,String(Q1));assert.equal(s.shares[0].claimable,'0');assert.ok(s.shares.slice(1).every(r=>r.claimed===String(Q0)&&r.claimable===String(DELTA)));}
  }
});
test('state rejects other share transfer, paid or claimed drift, new donation and moved miner',()=>{
  for(const change of [s=>s.shares[1].holder=OTHER,s=>s.shares[0].claimed=String(Q1),s=>s.shares[0].claimable='0',s=>s.totalPaid=String(P0+1n),
    s=>s.vaultBemRaw=String(H1+R0+1n),s=>s.nftOwner=OTHER,s=>s.shares[99].supply='0',s=>s.creatorBalances[0]='1']){
    const i=input('transfer-share'),s=snapshot(i,{after:true});change(s);assert.throws(()=>entitlement.assertEntitlementState(s,i,baseline(),{after:true}));
  }
});
function reverted(name='NotHolder'){return new ContractFunctionRevertedError({abi:vaultAbi,data:encodeErrorResult({abi:vaultAbi,errorName:name}),functionName:'claim'});}
test('former holder denial accepts only genuine decoded NotHolder, including nested viem errors',()=>{
  const i=input('transfer-share'),wrapped=new ContractFunctionExecutionError(reverted(),{abi:vaultAbi,functionName:'claim',args:[1n],contractAddress:i.action.pool,sender:i.session.creator});
  assert.equal(entitlement.expectedNotHolder(reverted()),true);assert.equal(entitlement.expectedNotHolder(wrapped),true);
  for(const e of [reverted('InvalidIds'),new Error('execution reverted NotHolder'),Object.assign(new Error('timeout'),{name:'TimeoutError'}),
    {name:'ContractFunctionRevertedError',data:{errorName:'NotHolder'}},new ContractFunctionRevertedError({abi:vaultAbi,data:'0x12345678',functionName:'claim'})])assert.equal(entitlement.expectedNotHolder(e),false);
});
test('read-only former holder check pins creator claim1 to exact block and cannot accept network failure',async()=>{
  const i=input('transfer-share');let calls=0;
  const result=await entitlement.checkFormerHolderDenied({simulateContract:async q=>{calls++;assert.equal(q.account,i.session.creator);assert.equal(q.address,i.action.pool);assert.equal(q.functionName,'claim');assert.deepEqual(q.args,[1n]);assert.equal(q.blockNumber,BLOCK);assert.ok(q.gas>0n);throw reverted();}},i,BLOCK);
  assert.equal(result.status,'PASS');assert.equal(calls,1);
  for(const fn of [async()=>({result:undefined}),async()=>{throw new Error('NETWORK_FAILURE');},async()=>{throw reverted('InvalidState');}])await assert.rejects(()=>entitlement.checkFormerHolderDenied({simulateContract:fn},i,BLOCK));
});
function fakeClient(i,{after=false,...overrides}={}){
  const s=snapshot(i,{after}),readable=['state','soldCount','fundedWei','totalPrincipalIn','totalPrincipalRefunded','purchaseSpent','soldBitmap','totalAccounted','totalPaid','accPerShare','remainder'];
  return {getBlock:async({blockNumber}={})=>({number:blockNumber??BLOCK,hash:H,timestamp:TIME}),getBlockNumber:async()=>BLOCK+14n,
    getTransactionCount:async()=>i.action.nonce,getBalance:async({address})=>BigInt(same(address,i.action.pool)?s.vaultNativeWei:s.actorNativeWei),
    getCode:async({address})=>same(address,i.action.from)||same(address,i.session.buyerB)?'0x':s.poolCode,
    readContract:async({address,functionName,args=[],blockNumber})=>{
      assert.equal(blockNumber,BLOCK,`${functionName} must remain pinned`);
      if(readable.includes(functionName))return BigInt(s[functionName]);
      if(['holderOf','totalSupply','claimed','claimable'].includes(functionName)){
        const row=s.shares[Number(args[0])-1];return functionName==='holderOf'?row.holder:BigInt(row[functionName==='totalSupply'?'supply':functionName]);
      }
      if(functionName==='balanceOfBatch')return args[1].map((id,n)=>same(args[0][n],s.shares[Number(id)-1].holder)?1n:0n);
      if(functionName==='balanceOf'){
        if(same(address,i.action.pool))return same(args[0],s.shares[Number(args[1])-1].holder)?1n:0n;
        assert.ok(same(address,i.manifest.config.bem));return BigInt(same(args[0],i.action.pool)?s.vaultBemRaw:same(args[0],i.session.creator)?s.bemBalances.creator:same(args[0],i.session.buyerB)?s.bemBalances.buyerB:s.bemBalances.sellerA);
      }
      if(functionName==='isPool')return true;if(functionName==='ownerOf')return s.nftOwner;if(functionName==='decimals')return 8;
      if(functionName==='minerKey')return H;if(functionName==='pending')return 0n;
      throw new Error(`Unexpected mock function ${functionName}`);
    },getGasPrice:async()=>PRICE,estimateGas:async()=>1000000n,call:async()=>({data:'0x'}),simulateContract:async()=>{throw reverted();},...overrides};
}
const guards=i=>({chainCheck:async()=>({verified:true}),identityCheck:async()=>({verified:true}),
  previousCheck:async()=>({oldRewards:{status:'PASS'},baseline:i.action.step==='new-harvest'?null:baseline(),entitlementPrerequisites:[]})});
test('three preflights simulate only exact zero-value calls with fixed nonce and current state',async()=>{
  for(const step of ['new-harvest','transfer-share','buyer-b-claim']){
    const i=input(step);let calls=0;
    const p=await entitlement.preview(fakeClient(i,{call:async q=>{calls++;assert.equal(q.data,i.action.data);assert.equal(q.value,0n);assert.equal(q.gasPrice,PRICE);}}),i,guards(i));
    assert.equal(calls,1);assert.equal(p.nonce,i.action.nonce);assert.equal(p.valueWei,'0');assert.equal(p.dataHash,i.action.dataHash);
  }
});
test('preflight refuses nonce drift, prior evidence failure, insufficient gas and excess gas',async()=>{
  const i=input();
  for(const [changes,error]of [[{getTransactionCount:async()=>99},/NONCE_CHANGED/],[{getBalance:async()=>0n},/GAS_BALANCE_INSUFFICIENT/],[{estimateGas:async()=>100000000n},/GAS_LIMIT_EXCEEDED/]]){
    let calls=0;await assert.rejects(()=>entitlement.preview(fakeClient(i,{...changes,call:async()=>calls++}),i,guards(i)),error);assert.equal(calls,0);
  }
  let calls=0;await assert.rejects(()=>entitlement.preview(fakeClient(i,{call:async()=>calls++}),i,{...guards(i),previousCheck:async()=>{throw new Error('PRIOR_EVIDENCE_CHANGED');}}),/PRIOR_EVIDENCE_CHANGED/);assert.equal(calls,0);
});
test('one-shot sending keeps reserved fee and signed hash after unknown outcome',async()=>{
  const events=[];let hash;
  await assert.rejects(()=>sendRecordedOnce({reservation:async()=>events.push('reserve'),saveReserved:async()=>events.push('journal'),sign:async()=>{events.push('sign');return '0x1234';},
    saveSigned:async h=>{events.push('hash');hash=h;},send:async()=>{events.push('send');throw new Error('OUTCOME_UNKNOWN');}}),/OUTCOME_UNKNOWN/);
  assert.deepEqual(events,['reserve','journal','sign','hash','send']);assert.equal(hash,keccak256('0x1234'));
  for(const failure of ['reserve','hash']){let sent=false;await assert.rejects(()=>sendRecordedOnce({reservation:async()=>{if(failure==='reserve')throw new Error('STOP');},saveReserved:async()=>{},sign:async()=> '0x1234',saveSigned:async()=>{if(failure==='hash')throw new Error('STOP');},send:async()=>sent=true}),/STOP/);assert.equal(sent,false);}
});
function receiptFixture(step='new-harvest'){
  const i=input(step),a=i.action,r=receipt(i),entry={...a,status:'SUBMITTED',transactionHash:TX,planHash:H,gas:String(GAS),gasPrice:String(PRICE),maxFeeWei:String(GAS*PRICE)};
  const tx={hash:TX,chainId:56,from:a.from,to:a.to,value:0n,input:a.data,nonce:a.nonce,gas:GAS,gasPrice:PRICE,blockNumber:BLOCK,blockHash:H},calls={receipts:0,storage:0,denials:0};
  const client=fakeClient(i,{after:true,getChainId:async()=>56,request:async()=> 'Geth/offline-entitlement-fixture',
    getTransactionReceipt:async()=>{calls.receipts++;return r;},getTransaction:async()=>tx,simulateContract:async()=>{calls.denials++;throw reverted();}});
  return {i,entry,r,tx,client,calls};
}
test('canonical receipts preserve share rights on transfer and pay only B ID1',async()=>{
  for(const [step,vault,paid,claimedOne,payment]of [
    ['new-harvest','12430',String(P0),String(Q0),'0'],['transfer-share','12430',String(P0),String(Q0),'0'],['buyer-b-claim','12306','13665524',String(Q1),'124'],
  ]){
    const f=receiptFixture(step);let saved;
    const result=await entitlement.verifyEntitlementReceipt(f.client,f.i,f.entry,{baseline:step==='new-harvest'?null:baseline(),identityCheck:async()=>({verified:true}),onReceipt:async e=>saved=e});
    assert.equal(result.status,'CONFIRMED');assert.equal(result.positiveTest.status,'PASS');assert.equal(result.paymentRaw,payment);
    assert.equal(result.after.vaultBemRaw,vault);assert.equal(result.after.totalPaid,paid);assert.equal(result.after.shares[0].claimed,claimedOne);
    assert.ok(result.after.shares.slice(1).every(s=>s.claimed===String(Q0)&&s.claimable===String(DELTA)));
    assert.equal(f.calls.receipts,1);assert.deepEqual(saved.receipt,{...f.r,contractAddress:null});
    if(step!=='new-harvest')assert.ok(f.calls.denials>=1,'former holder denial is tested after transfer');
  }
});
test('canonical receipt is retained before event, poststate or former-holder denial failure',async()=>{
  for(const mode of ['event','poststate','denial']){
    const f=receiptFixture('transfer-share'),base=f.client.readContract;let saved;
    if(mode==='event')f.r.logs.pop();if(mode==='poststate')f.client.readContract=async q=>q.functionName==='claimed'?Q1:base(q);
    if(mode==='denial')f.client.simulateContract=async()=>{throw new Error('NETWORK_DOWN');};
    await assert.rejects(()=>entitlement.verifyEntitlementReceipt(f.client,f.i,f.entry,{baseline:baseline(),identityCheck:async()=>({verified:true}),onReceipt:async e=>saved=e}));
    assert.deepEqual(saved.receipt,{...f.r,contractAddress:null});assert.equal(f.calls.receipts,1);
  }
});
test('all three receipts bind canonical15 confirmations, exact actor/value/data/nonce and fee',async()=>{
  for(const step of ['new-harvest','transfer-share','buyer-b-claim'])for(const change of [
    f=>f.tx.from=OTHER,f=>f.tx.to=f.i.session.collection,f=>f.tx.value=1n,f=>f.tx.input='0x12',f=>f.tx.nonce++,f=>f.tx.gas++,
    f=>f.tx.gasPrice++,f=>f.r.gasUsed=GAS+1n,f=>f.client.getBlockNumber=async()=>BLOCK+13n,f=>f.client.getBlock=async()=>({number:BLOCK,hash:OTHER_H,timestamp:TIME}),
  ]){
    const f=receiptFixture(step);change(f);let saved=0;
    await assert.rejects(()=>entitlement.verifyEntitlementReceipt(f.client,f.i,f.entry,{baseline:step==='new-harvest'?null:baseline(),identityCheck:async()=>({verified:true}),onReceipt:async()=>saved++}));assert.equal(saved,0);
  }
});
test('frozen plan permits head/pending drift but rejects actor, source, history and accrued-right changes',async()=>{
  const i=input('transfer-share'),p=clone(await entitlement.preview(fakeClient(i),i,guards(i))),observed=clone(p);
  observed.before.blockNumber=String(BLOCK+1n);observed.before.blockHash=OTHER_H;observed.before.pendingRaw='99999';observed.before.bemBalances.creator='88888';
  assert.doesNotThrow(()=>entitlement.assertPlanUnchanged(p,observed));
  for(const change of [x=>x.entitlementToolHash='changed',x=>x.rewardsToolHash='changed',x=>x.from=OTHER,x=>x.to=i.session.collection,x=>x.nonce++,x=>x.valueWei='1',
    x=>x.data='0x12',x=>x.ids=[2n],x=>x.bindings.manifestHash=OTHER_H,x=>x.baseline.previousRemainderRaw='0',x=>x.prerequisite.oldRewards={status:'CHANGED'},
    x=>x.before.shares[0].claimed=String(Q1),x=>x.before.shares[0].holder=i.session.buyerB,x=>x.before.vaultBemRaw='12431',x=>x.before.recipientCode='0x1234']){
    const changed=clone(p);change(changed);assert.throws(()=>entitlement.assertPlanUnchanged(p,changed));
  }
});
test('historical checkpoint prefix binds entries even when numerical baseline is unchanged',()=>{
  const expected={oldRewards:{entryHash:H},baseline:baseline(),entitlementPrerequisites:[{step:'new-harvest',entryHash:H}]};
  assert.doesNotThrow(()=>entitlement.assertPriorCheckpoint({prerequisite:clone(expected)},expected));
  for(const change of [p=>p.oldRewards.entryHash=OTHER_H,p=>p.entitlementPrerequisites[0].entryHash=OTHER_H,p=>p.entitlementPrerequisites=[],p=>p.baseline.previousRemainderRaw='0']){
    const altered=clone(expected);change(altered);assert.throws(()=>entitlement.assertPriorCheckpoint({prerequisite:altered},expected));
  }
});
test('prior canonical receipts rebuild entitlement without historical storage and reject changed evidence',async()=>{
  for(const step of ['new-harvest','transfer-share']){
    const make=async()=>{
      const f=receiptFixture(step);f.plan=clone(await entitlement.preview(fakeClient(f.i),f.i,guards(f.i)));
      Object.assign(f.entry,{status:'CONFIRMED',baseline:baseline(),positiveTest:{status:'PASS'}});
      for(const method of ['readContract','getCode','getBalance','getStorageAt','simulateContract'])f.client[method]=async()=>{f.calls.storage++;throw new Error('missing trie node');};
      return f;
    };
    const f=await make(),b=step==='new-harvest'?null:baseline();
    const result=await entitlement.verifyPriorEntitlementReceipt(f.client,f.i,f.entry,f.plan,b);
    assert.deepEqual(result.baseline,baseline());assert.equal(result.entryHash,keccak256(Buffer.from(json(f.entry))));assert.equal(f.calls.storage,0);assert.equal(f.calls.receipts,1);
    for(const change of [v=>v.entry.baseline.perShareIncrementRaw='125',v=>v.entry.positiveTest.status='FAIL',v=>v.plan.rewardsToolHash='changed',
      v=>v.plan.bindings.manifestHash=OTHER_H,v=>v.r.logs.pop(),v=>v.tx.nonce++]){
      const altered=await make();change(altered);await assert.rejects(()=>entitlement.verifyPriorEntitlementReceipt(altered.client,altered.i,altered.entry,altered.plan,b));assert.equal(altered.calls.storage,0);
    }
  }
});
test('budget refuses reset or fabricated prior reservations without reading the live ledger',()=>{
  const i=input(),journal={schemaVersion:1,chainId:56,sessionHash:SESSION_HASH,steps:[]};
  assert.throws(()=>entitlement.assertEntitlementLedger(journal,{spentAndReservedWei:'0',reservations:[]},i),/OLD_TWELVE_BUDGET_RESERVATIONS_CHANGED/);
  const reservations=Array.from({length:12},(_,n)=>({command:`synthetic-old-${n}`,to:i.action.pool,calldataHash:H,valueWei:'0',maxFeeWei:'1',status:'RECEIPT_VERIFIED'}));
  assert.throws(()=>entitlement.assertEntitlementLedger(journal,{spentAndReservedWei:'12',reservations},i),/OLD_TWELVE_BUDGET_RESERVATIONS_CHANGED/);
  assert.throws(()=>entitlement.assertEntitlementLedger(journal,{spentAndReservedWei:'1',reservations},i),/BUDGET_TOTAL_DOES_NOT_MATCH_RESERVATIONS/);
});
