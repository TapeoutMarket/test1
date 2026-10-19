import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {decodeFunctionData, encodeAbiParameters, encodeEventTopics, keccak256, zeroAddress} from 'viem';
import {parseOrderEnvelope} from '../sdk/order-envelope.ts';
import {sendRecordedOnce} from '../live-test/deploy-mainnet.mjs';

// Offline fixtures only: no .env/RPC access and no real budget/journal writes.
const readJson=async relative=>JSON.parse(await fs.readFile(new URL(relative,import.meta.url),'utf8'));
const [sessionFixture,manifestFixture,envelopeFixture,vaultArtifact,factoryArtifact]=await Promise.all([
  readJson('../mainnet-test/session.json'),readJson('../mainnet-test/live-manifest.json'),
  readJson('../mainnet-test/order-envelope.json'),readJson('../out/GroupBuyVault.sol/GroupBuyVault.json'),
  readJson('../out/GroupBuyFactory.sol/GroupBuyFactory.json'),
]);
const vaultAbi=vaultArtifact.abi,factoryAbi=factoryArtifact.abi;
const clone=value=>structuredClone(value),same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const H='0x'+'ab'.repeat(32),OTHER_H='0x'+'cd'.repeat(32),TX='0x'+'ef'.repeat(32);
const OTHER='0x0000000000000000000000000000000000000099';
const SESSION_HASH='0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c';
const IDS=Array.from({length:67},(_,n)=>BigInt(n+1));
const ALL_IDS=Array.from({length:100},(_,n)=>BigInt(n+1));
const PRINCIPAL=203010000000000000n,UNIT=3030000000000000n;
const BLOCK=128577000n,TIME=1792423200n;
function wireLog(name,address,args,index){
  const event=vaultAbi.find(item=>item.type==='event'&&item.name===name);assert.ok(event);
  return {address,topics:encodeEventTopics({abi:[event],eventName:name,args}),
    data:encodeAbiParameters(event.inputs.filter(x=>!x.indexed),event.inputs.filter(x=>!x.indexed).map(x=>args[x.name])),
    blockNumber:BLOCK,blockHash:H,transactionHash:TX,transactionIndex:5,logIndex:index,removed:false};
}
import {
  argumentsFor,buildAction,preview,checkContributionEvents,assertPlanUnchanged,
  assertFundingLedger,verifyContributed,
} from './creator-contribute.mjs';
import {buildAction as buildPoolAction} from '../mainnet-pool/create-pool.mjs';

function input(){
  const session=clone(sessionFixture),manifest=clone(manifestFixture),envelope=parseOrderEnvelope(clone(envelopeFixture));
  const shared={session,manifest,envelope,vaultAbi,factoryAbi,sessionHash:SESSION_HASH,sessionFile:'mainnet-test/session.json'};
  return {...shared,action:buildAction(session,manifest,vaultAbi),poolInput:{...shared,action:buildPoolAction(session,manifest,envelope,factoryAbi)},
    toolHash:'a'.repeat(64),poolToolHash:'b'.repeat(64),sellerToolHash:'c'.repeat(64),
    bindings:{manifestHash:H,orderEnvelopeHash:OTHER_H},rpcMode:'EXPLICIT_PUBLIC_RPC_FALLBACK',
    primaryEndpoint:'https://bsc-dataseed.defibit.io',independentEndpoint:'https://bsc-dataseed.bnbchain.org'};
}
const argv=['--env','../.env','--session','mainnet-test/session.json'];
test('default creator contribution entry only prepares an unsigned plan',()=>{
  const options=argumentsFor(argv);assert.equal(options.step,'creator-contribute');assert.equal(options.broadcast,false);assert.equal(options.reconcile,false);
});
for(const [name,args] of [
  ['different operation',[...argv,'--step','buyer-b-complete']],
  ['missing env',['--session','mainnet-test/session.json']],
  ['unreviewed broadcast',[...argv,'--broadcast']],
  ['broadcast and reconcile',[...argv,'--broadcast','--reconcile']],
  ['duplicate flag',[...argv,'--reconcile','--reconcile']],
  ['arbitrary IDs',[...argv,'--ids','1,2']],
  ['value override',[...argv,'--value','1']],
  ['raw signed transaction',[...argv,'--raw-transaction','0x12']],
  ['nonce override',[...argv,'--nonce','11']],
])test(`CLI refuses ${name}`,()=>assert.throws(()=>argumentsFor(args)));
test('action encodes all creator IDs 1 through 67, exact principal and completion=false',()=>{
  const {action,session,manifest}=input(),d=decodeFunctionData({abi:vaultAbi,data:action.data});
  assert.equal(action.step,'creator-contribute');assert.equal(action.nonce,10);assert.equal(action.from,session.creator);
  assert.equal(action.to,manifest.vault.address);assert.equal(action.pool,manifest.vault.address);
  assert.equal(action.valueWei,String(PRINCIPAL));assert.equal(action.requireCompletion,false);assert.deepEqual(action.ids,IDS);
  assert.equal(d.functionName,'contribute');assert.deepEqual(d.args,[IDS,false,session.pool.payload]);
  assert.equal(action.dataHash,keccak256(action.data));assert.equal(action.payloadHash,manifest.vault.payloadHash);
  assert.equal(action.orderHash,session.seaport.orderHash);assert.equal(UNIT*BigInt(action.ids.length),PRINCIPAL);
});
for(const [name,change] of [
  ['other creator',i=>i.session.creator=OTHER],
  ['other clone',i=>i.session.pool.address=OTHER],
  ['other manifest clone',i=>i.manifest.vault.address=OTHER],
  ['changed creator allocation address',i=>i.session.plannedContributions[0].address=OTHER],
  ['changed creator allocation role',i=>i.session.plannedContributions[0].role='buyerB'],
  ['incomplete IDs',i=>i.session.plannedContributions[0].ids='1..66'],
  ['other IDs',i=>i.session.plannedContributions[0].ids='2..68'],
  ['changed share count',i=>i.session.plannedContributions[0].shares=66],
  ['lower principal',i=>i.session.plannedContributions[0].valueWei=String(PRINCIPAL-1n)],
  ['higher principal',i=>i.session.plannedContributions[0].valueWei=String(PRINCIPAL+1n)],
  ['changed payload',i=>i.session.pool.payload='0x12'],
  ['missing createPool prerequisite',i=>i.session.steps['creator-contribute'].requiresStep='seller-validate'],
  ['unsafe nonce',i=>i.session.steps['creator-contribute'].nonce='9007199254740992'],
])test(`action refuses ${name}`,()=>{const i=input();change(i);assert.throws(()=>buildAction(i.session,i.manifest,vaultAbi));});

function receipt(i=input(),contribution={},mint={}){
  const a=i.action;
  return {transactionHash:TX,blockNumber:BLOCK,blockHash:H,transactionIndex:5,from:a.from,to:a.to,status:'success',
    gasUsed:1000000n,effectiveGasPrice:50000000n,cumulativeGasUsed:1500000n,
    logs:[wireLog('TransferBatch',a.to,{operator:a.from,from:zeroAddress,to:a.from,ids:IDS,values:IDS.map(()=>1n),...mint},1),
      wireLog('Contributed',a.to,{participant:a.from,ids:IDS,principal:PRINCIPAL,soldCount:67n,...contribution},2)]};
}
test('real core mint uses one exact TransferBatch and one Contributed',()=>{
  const i=input(),r=receipt(i);assert.equal(r.logs[0].topics.length,4);assert.equal(r.logs[1].topics.length,2);
  assert.ok(checkContributionEvents(r,i));
});
for(const [field,value] of [
  ['participant',OTHER],['ids',IDS.slice(1)],['ids',[...IDS.slice(0,66),66n]],['ids',[...IDS].reverse()],
  ['principal',PRINCIPAL-1n],['principal',PRINCIPAL+1n],['soldCount',66n],['soldCount',100n],
])test(`Contributed rejects altered ${field} ${Array.isArray(value)?value.slice(0,2):value}`,()=>{
  const i=input();assert.throws(()=>checkContributionEvents(receipt(i,{[field]:value}),i));
});
for(const [name,change] of [
  ['operator',{operator:OTHER}],['nonzero mint source',{from:OTHER}],['recipient',{to:OTHER}],
  ['missing ID',{ids:IDS.slice(0,66),values:IDS.slice(0,66).map(()=>1n)}],
  ['duplicate ID',{ids:[...IDS.slice(0,66),66n]}],['wrong ID',{ids:[...IDS.slice(0,66),68n]}],
  ['reordered IDs',{ids:[...IDS].reverse()}],['missing value',{values:IDS.slice(0,66).map(()=>1n)}],
  ['value two',{values:IDS.map((_,n)=>n===0?2n:1n)}],['value zero',{values:IDS.map((_,n)=>n===66?0n:1n)}],
])test(`mint rejects ${name}`,()=>{const i=input();assert.throws(()=>checkContributionEvents(receipt(i,{},change),i));});
for(const [name,change] of [
  ['missing Contributed',r=>r.logs.pop()],['duplicate Contributed',r=>r.logs.push(clone(r.logs[1]))],
  ['missing mint',r=>r.logs.shift()],['duplicate mint',r=>r.logs.push(clone(r.logs[0]))],
  ['wrong contribution emitter',r=>r.logs[1].address=OTHER],['wrong mint emitter',r=>r.logs[0].address=OTHER],
  ['removed log',r=>r.logs[0].removed=true],['other transaction',r=>r.logs[0].transactionHash=OTHER_H],
  ['other block',r=>r.logs[0].blockHash=OTHER_H],
])test(`receipt event check refuses ${name}`,()=>{const i=input(),r=receipt(i);change(r);assert.throws(()=>checkContributionEvents(r,i));});
test('creator contribution must not report a purchase',()=>{
  const i=input(),r=receipt(i);r.logs.push(wireLog('Purchased',i.action.to,{market:i.session.market,collection:i.session.collection,tokenId:3204n,paid:303000000000000000n,orderHash:i.action.orderHash,listingId:0n},3));
  assert.throws(()=>checkContributionEvents(r,i));
});
test('unexpected single transfer alongside core batch is rejected',()=>{
  const i=input(),r=receipt(i);r.logs.push(wireLog('TransferSingle',i.action.to,{operator:i.action.from,from:i.action.from,to:OTHER,id:1n,value:1n},3));
  assert.throws(()=>checkContributionEvents(r,i));
});
test('67 Single events cannot substitute for this core version exact batch mint',()=>{
  const i=input(),r=receipt(i);r.logs=[...IDS.map((id,n)=>wireLog('TransferSingle',i.action.to,{operator:i.action.from,from:zeroAddress,to:i.action.from,id,value:1n},n+1)),r.logs[1]];
  assert.throws(()=>checkContributionEvents(r,i));
});

function fakeClient(i,overrides={}){
  const runtime=`0x363d3d373d3d3d363d73${i.action.template.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
  const values={isPool:true,state:0,soldCount:0n,fundedWei:0n,totalPrincipalIn:0n,totalPrincipalRefunded:0n,purchaseSpent:0n,soldBitmap:0n,marketStatus:0,
    ownerOf:i.session.seller,getApproved:i.session.market,isApprovedForAll:false,
    information:[i.session.seaport.version,i.session.seaport.domainSeparator,zeroAddress],getCounter:BigInt(i.session.seaport.counter),
    getOrderHash:i.action.orderHash,getOrderStatus:[true,false,0n,0n]};
  return {getBlock:async({blockNumber}={})=>({number:blockNumber??BLOCK,hash:H,timestamp:TIME}),
    getTransactionCount:async()=>10,getBalance:async({address})=>same(address,i.action.from)?1000000000000000000n:0n,
    getCode:async({address})=>same(address,i.action.from)?'0x':runtime,
    readContract:async({functionName,args=[]})=>{
      if(functionName==='holderOf')return zeroAddress;
      if(functionName==='totalSupply'||functionName==='balanceOf')return 0n;
      if(functionName==='balanceOfBatch')return args[1].map(()=>0n);
      if(functionName==='costOf')return UNIT;
      assert.ok(Object.hasOwn(values,functionName),`Unexpected fake RPC function ${functionName}`);return clone(values[functionName]);
    },getGasPrice:async()=>50000000n,estimateGas:async()=>1000001n,call:async()=>({data:'0x'}),...overrides};
}
function guards(i,overrides={}){return {chainCheck:async()=>{},previousCheck:async()=>({createPoolTransactionHash:H}),
  identityCheck:async()=>({verified:true}),protocolCheck:async()=>({executable:true,orderHash:i.action.orderHash}),...overrides};}
test('preview checks all share slots and every creator share cost, then simulates exact native principal',async()=>{
  const i=input(),holderReads=[],supplyReads=[],costReads=[],calls=[],base=fakeClient(i);
  const p=await preview(fakeClient(i,{
    readContract:async q=>{
      if(q.functionName==='holderOf')holderReads.push(q.args[0]);
      if(q.functionName==='totalSupply')supplyReads.push(q.args[0]);
      if(q.functionName==='costOf')costReads.push(q.args[0]);
      if(q.functionName==='balanceOfBatch'){assert.deepEqual(q.args[1],ALL_IDS);assert.ok(q.args[0].every(x=>same(x,i.action.from)));}
      return base.readContract(q);
    },estimateGas:async q=>{calls.push('estimate');assert.equal(q.value,PRINCIPAL);assert.equal(q.gasPrice,50000000n);assert.equal(q.gas,undefined);return 1000001n;},
    call:async q=>{calls.push('call');assert.equal(q.value,PRINCIPAL);assert.equal(q.gas,1200002n);assert.equal(q.gasPrice,50000000n);assert.equal(q.to,i.action.to);assert.equal(q.data,i.action.data);},
  }),i,guards(i,{identityCheck:async(_client,manifest,options)=>{assert.equal(manifest,i.manifest);assert.equal(options.command,'contribute');assert.equal(options.target,i.action.pool);assert.deepEqual(options.args,[IDS,false,i.session.pool.payload]);return {verified:true};}}));
  assert.deepEqual(holderReads,ALL_IDS);assert.deepEqual(supplyReads,ALL_IDS);assert.deepEqual(costReads,IDS);
  assert.deepEqual(calls,['estimate','call']);assert.equal(p.valueWei,String(PRINCIPAL));assert.equal(p.gas,'1200002');
  assert.equal(p.gasPrice,'50000000');assert.equal(p.maxFeeWei,'60000100000000');assert.equal(p.nonce,10);
});
for(const [name,fn,value] of [
  ['unregistered pool','isPool',false],['not FUNDING','state',2],['already sold','soldCount',1n],
  ['already funded','fundedWei',1n],['prior principal','totalPrincipalIn',1n],['prior refund','totalPrincipalRefunded',1n],
  ['prior purchase','purchaseSpent',1n],['unexecutable market','marketStatus',10],['NFT no longer owned by seller','ownerOf',OTHER],
  ['missing single-token approval','getApproved',zeroAddress],['collection-wide approval','isApprovedForAll',true],
  ['counter drift','getCounter',1n],['other order hash','getOrderHash',OTHER_H],
  ['unvalidated order','getOrderStatus',[false,false,0n,0n]],['cancelled order','getOrderStatus',[true,true,0n,0n]],
  ['filled order','getOrderStatus',[true,false,1n,1n]],
])test(`preview refuses ${name}`,async()=>{
  const i=input(),base=fakeClient(i);await assert.rejects(()=>preview(fakeClient(i,{readContract:async q=>q.functionName===fn?value:base.readContract(q)}),i,guards(i)));
});
test('all 100 slots must be empty even when an occupied ID is outside the creator allocation',async()=>{
  const i=input();
  for(const fn of ['holderOf','totalSupply']){const base=fakeClient(i);await assert.rejects(()=>preview(fakeClient(i,{readContract:async q=>q.functionName===fn&&BigInt(q.args[0])===100n?(fn==='holderOf'?OTHER:1n):base.readContract(q)}),i,guards(i)));}
  const base=fakeClient(i);await assert.rejects(()=>preview(fakeClient(i,{readContract:async q=>q.functionName==='balanceOfBatch'?ALL_IDS.map(id=>id===100n?1n:0n):base.readContract(q)}),i,guards(i)));
});
test('one share cost mismatch rejects even when the total could be counterbalanced',async()=>{
  const i=input(),base=fakeClient(i);
  await assert.rejects(()=>preview(fakeClient(i,{readContract:async q=>q.functionName==='costOf'?(BigInt(q.args[0])===1n?UNIT+1n:BigInt(q.args[0])===2n?UNIT-1n:UNIT):base.readContract(q)}),i,guards(i)));
});
test('creator principal plus maximum gas must both fit available native balance',async()=>{
  const i=input();let called=false;
  await assert.rejects(()=>preview(fakeClient(i,{getBalance:async({address})=>same(address,i.action.from)?PRINCIPAL:0n,call:async()=>{called=true;}}),i,guards(i)));
  assert.equal(called,false);
});
test('nonempty Vault balance is not accepted as an empty initial funding pool',async()=>{
  const i=input();await assert.rejects(()=>preview(fakeClient(i,{getBalance:async({address})=>same(address,i.action.from)?1000000000000000000n:1n}),i,guards(i)));
});
test('creator pending nonce, smart-account code, and changed clone code stop preview',async()=>{
  const i=input(),base=fakeClient(i);
  for(const overrides of [
    {getTransactionCount:async({blockTag})=>blockTag==='pending'?11:10},
    {getCode:async q=>same(q.address,i.action.from)?'0x6000':base.getCode(q)},
    {getCode:async q=>same(q.address,i.action.to)?'0x6000':base.getCode(q)},
  ])await assert.rejects(()=>preview(fakeClient(i,overrides),i,guards(i)));
});
test('missing creation receipt and protocol failure are rejected before gas work',async()=>{
  const i=input();let estimated=0;
  for(const options of [
    {previousCheck:async()=>{throw new Error('NO_CONFIRMED_CREATE_RECEIPT');}},
    {identityCheck:async()=>{throw new Error('WRONG_CLONE_IDENTITY');}},
    {protocolCheck:async()=>({executable:false,orderHash:i.action.orderHash})},
    {protocolCheck:async()=>({executable:true,orderHash:OTHER_H})},
  ])await assert.rejects(()=>preview(fakeClient(i,{estimateGas:async()=>{estimated++;return 1n;}}),i,guards(i,options)));
  assert.equal(estimated,0);
});
test('excessive gas and nonpositive gas price prevent simulation',async()=>{
  const i=input();let called=0;
  for(const overrides of [{estimateGas:async()=>8000000n},{getGasPrice:async()=>0n}])await assert.rejects(()=>preview(fakeClient(i,{...overrides,call:async()=>{called++;}}),i,guards(i)));
  assert.equal(called,0);
});
test('simulation rejection never retries or returns a signed plan',async()=>{
  const i=input();let called=0;
  await assert.rejects(()=>preview(fakeClient(i,{call:async()=>{called++;throw new Error('CONTRIBUTION_REVERTED');}}),i,guards(i)),/CONTRIBUTION_REVERTED/);
  assert.equal(called,1);
});

test('reservation failure stops before journal, signing, or broadcasting',async()=>{
  const calls=[];
  await assert.rejects(()=>sendRecordedOnce({reservation:async()=>{calls.push('reserve');throw new Error('TOTAL_BUDGET_EXCEEDED');},
    saveReserved:async()=>calls.push('journal'),sign:async()=>{calls.push('sign');return '0x1234';},saveSigned:async()=>calls.push('hash'),send:async()=>calls.push('send')}),/TOTAL_BUDGET_EXCEEDED/);
  assert.deepEqual(calls,['reserve']);
});
test('journal failure after reservation prevents signature and send',async()=>{
  const calls=[];
  await assert.rejects(()=>sendRecordedOnce({reservation:async()=>calls.push('reserve'),saveReserved:async()=>{calls.push('journal');throw new Error('DISK_FAILURE');},
    sign:async()=>{calls.push('sign');return '0x1234';},saveSigned:async()=>calls.push('hash'),send:async()=>calls.push('send')}),/DISK_FAILURE/);
  assert.deepEqual(calls,['reserve','journal']);
});
test('signed-hash persistence failure prevents any broadcast',async()=>{
  const calls=[];
  await assert.rejects(()=>sendRecordedOnce({reservation:async()=>calls.push('reserve'),saveReserved:async()=>calls.push('journal'),
    sign:async()=>{calls.push('sign');return '0x1234';},saveSigned:async hash=>{calls.push('hash');assert.equal(hash,keccak256('0x1234'));throw new Error('HASH_WRITE_FAILED');},send:async()=>calls.push('send')}),/HASH_WRITE_FAILED/);
  assert.deepEqual(calls,['reserve','journal','sign','hash']);
});
test('unknown broadcast outcome keeps principal reservation and one recorded hash without retry',async()=>{
  const calls=[],principalReservation={valueWei:String(PRINCIPAL),maxFeeWei:'60000100000000'};let recordedHash;
  await assert.rejects(()=>sendRecordedOnce({reservation:async()=>{calls.push('reserve');return principalReservation;},saveReserved:async()=>calls.push('journal'),
    sign:async()=>{calls.push('sign');return '0x1234';},saveSigned:async hash=>{calls.push('hash');recordedHash=hash;},send:async()=>{calls.push('send');throw new Error('SUBMISSION_OUTCOME_UNKNOWN');}}),/SUBMISSION_OUTCOME_UNKNOWN/);
  assert.deepEqual(calls,['reserve','journal','sign','hash','send']);assert.equal(recordedHash,keccak256('0x1234'));
  assert.deepEqual(principalReservation,{valueWei:String(PRINCIPAL),maxFeeWei:'60000100000000'});
});

for(const field of ['fundingToolHash','poolToolHash','sellerRuntimeToolHash','rpcMode','primaryEndpoint','nonce','to','valueWei','dataHash','pool','requireCompletion','gas','gasPrice','maxFeeWei','maximumSpendWei'])test(`confirmation freezes ${field}`,async()=>{
  const i=input(),a=await preview(fakeClient(i),i,guards(i)),b=clone(a);b[field]=String(b[field])+'1';
  assert.throws(()=>assertPlanUnchanged(a,b),/REVIEWED_CONTRIBUTION_CHANGED/);
});
test('full IDs, prerequisites, slot ownership and costs stay frozen during confirmation',async()=>{
  const i=input(),a=await preview(fakeClient(i),i,guards(i));
  for(const [change,error] of [
    [b=>b.ids.pop(),/FROZEN_CONTRIBUTION_EVIDENCE_CHANGED/],
    [b=>b.ids.reverse(),/FROZEN_CONTRIBUTION_EVIDENCE_CHANGED/],
    [b=>b.prerequisite.createPoolTransactionHash=OTHER_H,/FROZEN_CONTRIBUTION_EVIDENCE_CHANGED/],
    [b=>b.before.soldBitmap='1',/FROZEN_FUNDING_STATE_CHANGED/],
    [b=>b.before.shares.holders[99]=OTHER,/FROZEN_SHARES_OR_ORDER_CHANGED/],
    [b=>b.before.costs[0]=String(UNIT+1n),/FROZEN_SHARES_OR_ORDER_CHANGED/],
    [b=>b.before.orderStatus=[true,false,'1','1'],/FROZEN_SHARES_OR_ORDER_CHANGED/],
  ]){const b=clone(a);change(b);assert.throws(()=>assertPlanUnchanged(a,b),error);}
  const b=clone(a);b.before.blockNumber=String(BLOCK+1n);b.before.timestamp=String(TIME+1n);assert.doesNotThrow(()=>assertPlanUnchanged(a,b));
});
test('unexpected sold bitmap alone stops an apparently empty pool',async()=>{
  const i=input(),base=fakeClient(i);await assert.rejects(()=>preview(fakeClient(i,{readContract:async q=>q.functionName==='soldBitmap'?1n:base.readContract(q)}),i,guards(i)),/EMPTY_EXECUTABLE_FUNDING_POOL_REQUIRED/);
});

function ledgerFixture(){
  const i=input(),id=`funding-${SESSION_HASH.slice(2)}-creator-contribute`,prior=756665200000000n,fee=60000100000000n;
  const entry={step:'creator-contribute',status:'SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN',nonce:10,to:i.action.to,pool:i.action.pool,valueWei:String(PRINCIPAL),dataHash:i.action.dataHash,planHash:H,reservationId:id,maxFeeWei:String(fee),transactionHash:TX};
  const reservation={reservationId:id,operation:'creator-contribute',sender:i.action.from,nonce:'10',valueWei:String(PRINCIPAL),maxFeeWei:String(fee),bundleHash:SESSION_HASH,initCodeHash:i.action.dataHash,status:'RESERVED_BEFORE_SEND'};
  // The historical total is an explicit snapshot fixture, not a read of the real ledger.
  const old={command:'prior-deployments-seller-pool',to:i.manifest.factory.address,calldataHash:OTHER_H,valueWei:'0',maxFeeWei:String(prior),status:'RECEIPT_VERIFIED'};
  return {i,entry,reservation,prior,fee,journal:{schemaVersion:1,chainId:56,sessionHash:SESSION_HASH,steps:[entry]},ledger:{spentAndReservedWei:String(prior+PRINCIPAL+fee),reservations:[old,reservation]}};
}
test('global budget includes historical .0007566652 BNB plus .20301 principal plus frozen fee',()=>{
  const x=ledgerFixture();assert.doesNotThrow(()=>assertFundingLedger(x.journal,x.ledger,x.i));
  assert.equal(x.ledger.spentAndReservedWei,'203826665300000000');
  assert.equal(BigInt(x.ledger.spentAndReservedWei),x.prior+PRINCIPAL+x.fee);
});
for(const [name,change,error] of [
  ['missing principal in sum',x=>x.ledger.spentAndReservedWei=String(x.prior+x.fee),/BUDGET_TOTAL_DOES_NOT_MATCH_RESERVATIONS/],
  ['reset historical budget',x=>x.ledger.spentAndReservedWei=String(PRINCIPAL+x.fee),/BUDGET_TOTAL_DOES_NOT_MATCH_RESERVATIONS/],
  ['principal zero in reservation',x=>{x.reservation.valueWei='0';x.ledger.spentAndReservedWei=String(x.prior+x.fee);},/FUNDING_BUDGET_BINDING_MISMATCH/],
  ['incorrect journal principal',x=>x.entry.valueWei=String(PRINCIPAL-1n),/FUNDING_JOURNAL_BINDING_MISMATCH/],
  ['numeric instead of canonical string principal',x=>x.entry.valueWei=Number(PRINCIPAL),/FUNDING_JOURNAL_BINDING_MISMATCH/],
  ['exponent-form principal',x=>x.entry.valueWei='2.0301e17',/FUNDING_JOURNAL_BINDING_MISMATCH/],
  ['nonce changed',x=>x.entry.nonce=11,/FUNDING_JOURNAL_BINDING_MISMATCH/],
  ['fee changed',x=>x.entry.maxFeeWei='1',/FUNDING_BUDGET_BINDING_MISMATCH/],
  ['orphan reservation',x=>x.journal.steps=[],/ORPHAN_FUNDING_RESERVATION/],
  ['signed state missing hash',x=>delete x.entry.transactionHash,/FUNDING_SIGNED_HASH_STATE_MISMATCH/],
  ['another target',x=>x.entry.to=OTHER,/FUNDING_JOURNAL_BINDING_MISMATCH/],
])test(`funding journal rejects ${name}`,()=>{const x=ledgerFixture();change(x);assert.throws(()=>assertFundingLedger(x.journal,x.ledger,x.i),error);});

function verifiedContext(){
  const i=input(),r=receipt(i),a=i.action,gas=1200002n,gasPrice=50000000n;
  const entry={transactionHash:TX,gas:String(gas),gasPrice:String(gasPrice),maxFeeWei:String(gas*gasPrice)};
  const tx={hash:TX,from:a.from,to:a.to,value:PRINCIPAL,input:a.data,chainId:56,blockNumber:BLOCK,blockHash:H,nonce:10,gas,gasPrice};
  const values={isPool:true,state:0,soldCount:67n,fundedWei:PRINCIPAL,totalPrincipalIn:PRINCIPAL,totalPrincipalRefunded:0n,purchaseSpent:0n,soldBitmap:(1n<<67n)-1n,ownerOf:i.session.seller};
  const runtime=`0x363d3d373d3d3d363d73${a.template.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
  const holder=id=>BigInt(id)<=67n?a.from:zeroAddress,amount=id=>BigInt(id)<=67n?1n:0n;
  let receiptReads=0;const saved=[];
  const client={getChainId:async()=>56,request:async()=> 'Geth/offline-fixture',getTransactionReceipt:async()=>{receiptReads++;return r;},getTransaction:async()=>tx,
    getBlock:async()=>({number:BLOCK,hash:H}),getBlockNumber:async()=>BLOCK+14n,getCode:async()=>runtime,getBalance:async()=>PRINCIPAL,
    readContract:async({functionName,args=[],blockNumber})=>{
      assert.equal(blockNumber,BLOCK);
      if(functionName==='holderOf')return holder(args[0]);if(functionName==='totalSupply')return amount(args[0]);
      if(functionName==='balanceOfBatch')return args[1].map(amount);
      assert.ok(Object.hasOwn(values,functionName),`Unexpected post-state RPC function ${functionName}`);return values[functionName];
    }};
  const options={identityCheck:async(_client,_manifest,call)=>{assert.equal(call.command,'contribute');assert.equal(call.target,a.pool);return {verified:true};},
    postconditions:async(_client,command,target,actor,args)=>{assert.equal(command,'contribute');assert.equal(target,a.pool);assert.equal(actor,a.from);assert.deepEqual(args,[IDS,false,i.session.pool.payload]);return {verified:true};},
    onReceipt:async evidence=>{saved.push(clone(evidence));}};
  return {i,r,tx,entry,values,runtime,client,options,saved,receiptReads:()=>receiptReads};
}
test('canonical receipt proves 67 exact holdings and principal while miner stays with seller',async()=>{
  const x=verifiedContext(),result=await verifyContributed(x.client,x.i,x.entry,x.options);
  assert.equal(x.receiptReads(),1);assert.equal(x.saved.length,1);assert.equal(result.status,'CONFIRMED');
  assert.equal(result.actualPrincipalWei,String(PRINCIPAL));assert.equal(result.actualGasFeeWei,'50000000000000');
  assert.equal(result.after.state,0);assert.equal(result.after.soldCount,'67');assert.equal(result.after.fundedWei,String(PRINCIPAL));
  assert.equal(result.after.totalPrincipalIn,String(PRINCIPAL));assert.equal(result.after.vaultNativeWei,String(PRINCIPAL));
  assert.equal(result.after.soldBitmap,String((1n<<67n)-1n));assert.equal(result.after.nftOwner,x.i.session.seller);
  assert.equal(result.after.shares.holders.length,100);assert.equal(result.after.shares.balances.filter(x=>x==='1').length,67);
});
for(const [name,change,error] of [
  ['reverted receipt',x=>x.r.status='reverted',/MISMATCH_RECEIPTSUCCESS/],
  ['only 14 confirmations',x=>x.client.getBlockNumber=async()=>BLOCK+13n,/WAITING_CONFIRMATIONS/],
  ['wrong transaction native amount',x=>x.tx.value=PRINCIPAL-1n,/MISMATCH_VALUE/],
  ['wrong transaction nonce',x=>x.tx.nonce=11,/CONTRIBUTION_RECEIPT_FROZEN_FIELDS_CHANGED/],
  ['wrong transaction gas',x=>x.tx.gas++,/CONTRIBUTION_RECEIPT_FROZEN_FIELDS_CHANGED/],
  ['wrong transaction gas price',x=>x.tx.gasPrice++,/CONTRIBUTION_RECEIPT_FROZEN_FIELDS_CHANGED/],
  ['unexpected ACTIVE state',x=>x.values.state=2,/CONTRIBUTION_FUNDING_STATE_MISMATCH/],
  ['soldCount 100',x=>x.values.soldCount=100n,/CONTRIBUTION_FUNDING_STATE_MISMATCH/],
  ['incorrect funded principal',x=>x.values.fundedWei=PRINCIPAL-1n,/CONTRIBUTION_FUNDING_STATE_MISMATCH/],
  ['incorrect totalPrincipalIn',x=>x.values.totalPrincipalIn=PRINCIPAL+1n,/CONTRIBUTION_FUNDING_STATE_MISMATCH/],
  ['unexpected refund',x=>x.values.totalPrincipalRefunded=1n,/CONTRIBUTION_FUNDING_STATE_MISMATCH/],
  ['purchase unexpectedly spent principal',x=>x.values.purchaseSpent=PRINCIPAL,/CONTRIBUTION_FUNDING_STATE_MISMATCH/],
  ['incorrect bitmap',x=>x.values.soldBitmap=1n,/CONTRIBUTION_FUNDING_STATE_MISMATCH/],
  ['incorrect native Vault balance',x=>x.client.getBalance=async()=>PRINCIPAL-1n,/CONTRIBUTION_FUNDING_STATE_MISMATCH/],
  ['miner transferred to Vault',x=>x.values.ownerOf=x.i.action.pool,/CONTRIBUTION_FUNDING_STATE_MISMATCH/],
  ['other clone code',x=>x.client.getCode=async()=> '0x6000',/CONTRIBUTION_CLONE_IDENTITY_MISMATCH/],
  ['unregistered Vault',x=>x.values.isPool=false,/CONTRIBUTION_CLONE_IDENTITY_MISMATCH/],
])test(`contribution receipt rejects ${name}`,async()=>{const x=verifiedContext();change(x);await assert.rejects(()=>verifyContributed(x.client,x.i,x.entry,x.options),error);});
test('holder, supply and creator balance for all 100 IDs must agree with 67 minted shares',async()=>{
  for(const [name,replacement]of [['holderOf',OTHER],['totalSupply',2n],['balanceOfBatch',ALL_IDS.map(id=>id===67n?0n:id<=67n?1n:0n)]]){
    const x=verifiedContext(),read=x.client.readContract;x.client.readContract=async q=>q.functionName===name?replacement:read(q);
    await assert.rejects(()=>verifyContributed(x.client,x.i,x.entry,x.options),/EXACT_SHARE_OWNERSHIP_MISMATCH/);
  }
});
test('canonical receipt is retained before any event or business postcondition failure',async()=>{
  for(const change of [x=>x.r.logs.pop(),x=>x.options.postconditions=async()=>({verified:false}),x=>x.values.soldCount=100n]){
    const x=verifiedContext();change(x);await assert.rejects(()=>verifyContributed(x.client,x.i,x.entry,x.options));
    assert.equal(x.receiptReads(),1);assert.equal(x.saved.length,1);assert.equal(x.saved[0].receipt.transactionHash,TX);
    assert.equal(x.saved[0].actualPrincipalWei,String(PRINCIPAL));assert.equal(x.saved[0].actualGasFeeWei,'50000000000000');
  }
});
test('failure saving canonical receipt stops business verification and preserves failure',async()=>{
  const x=verifiedContext();let checked=false;x.options.onReceipt=async()=>{throw new Error('RECEIPT_SAVE_FAILED');};x.options.postconditions=async()=>{checked=true;return {verified:true};};
  await assert.rejects(()=>verifyContributed(x.client,x.i,x.entry,x.options),/RECEIPT_SAVE_FAILED/);assert.equal(checked,false);assert.equal(x.receiptReads(),1);
});
