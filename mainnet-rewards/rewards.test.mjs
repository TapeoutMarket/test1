import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {decodeFunctionData,encodeAbiParameters,encodeEventTopics,keccak256,zeroAddress} from 'viem';
import {sendRecordedOnce} from '../live-test/deploy-mainnet.mjs';
import {json} from '../live-test/preflight.mjs';
import {parseOrderEnvelope} from '../sdk/order-envelope.ts';
import {buildAction as buildCompletionAction} from '../mainnet-completion/buyer-b-complete.mjs';
import {buildAction as buildCreatorAction} from '../mainnet-funding/creator-contribute.mjs';
import {buildAction as buildPoolAction} from '../mainnet-pool/create-pool.mjs';
import * as rewards from './rewards.mjs';

// Offline mocks only. Read public session/manifest/order and independently
// compiled ABIs; never open environment files, actual journals or budgets.
const readJson=async relative=>JSON.parse(await fs.readFile(new URL(relative,import.meta.url),'utf8'));
const [sessionFixture,manifestFixture,envelopeFixture,vaultArtifact,factoryArtifact,bemArtifact,seaportArtifact,nftArtifact]=await Promise.all([
  readJson('../mainnet-test/session.json'),readJson('../mainnet-test/live-manifest.json'),readJson('../mainnet-test/order-envelope.json'),
  readJson('../out/GroupBuyVault.sol/GroupBuyVault.json'),readJson('../out/GroupBuyFactory.sol/GroupBuyFactory.json'),
  readJson('../out/IERC20.sol/IERC20.json'),readJson('../fixtures/seaport/Seaport.json'),readJson('../out/IERC721.sol/IERC721.json'),
]);
const vaultAbi=vaultArtifact.abi,factoryAbi=factoryArtifact.abi,bemAbi=bemArtifact.abi;
const fulfilledAbi=(Array.isArray(seaportArtifact)?seaportArtifact:seaportArtifact.abi).filter(e=>e.type==='event'&&e.name==='OrderFulfilled');
const clone=value=>structuredClone(value),same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const H='0x'+'ab'.repeat(32),OTHER_H='0x'+'cd'.repeat(32),TX='0x'+'ef'.repeat(32),OTHER='0x0000000000000000000000000000000000000099';
const SESSION_HASH='0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c';
const BLOCK=128000000n,TIME=1792423200n,PRICE=50000000n,GAS=1200000n;
const ALL_IDS=Array.from({length:100},(_,n)=>BigInt(n+1)),CREATOR_IDS=ALL_IDS.slice(0,67),BUYER_IDS=ALL_IDS.slice(67);
const RECEIVED=12345n,Q=123n,R=45n,CREATOR_AMOUNT=8241n,BUYER_AMOUNT=4059n;
const BASE_BALANCES={creator:200n,buyerB:300n,sellerA:400n};
function wireLog(abi,name,address,args,index){
  const event=abi.find(e=>e.type==='event'&&e.name===name);assert.ok(event,`missing independent ABI ${name}`);
  const plain=event.inputs.filter(x=>!x.indexed);
  return {address,topics:encodeEventTopics({abi:[event],eventName:name,args}),data:encodeAbiParameters(plain,plain.map(x=>args[x.name])),
    blockNumber:BLOCK,blockHash:H,transactionHash:TX,transactionIndex:7,logIndex:index,removed:false};
}
function publicInput(){
  const session=clone(sessionFixture),manifest=clone(manifestFixture),envelope=parseOrderEnvelope(clone(envelopeFixture));
  const shared={session,manifest,envelope,vaultAbi,factoryAbi,sessionHash:SESSION_HASH,sessionFile:'mainnet-test/session.json',bindings:{manifestHash:H},poolToolHash:'c'.repeat(64),sellerToolHash:'d'.repeat(64),
    rpcMode:'EXPLICIT_PUBLIC_RPC_FALLBACK',primaryEndpoint:'https://bsc-dataseed.defibit.io',independentEndpoint:'https://bsc-dataseed.bnbchain.org'};
  const poolInput={...shared,toolHash:shared.poolToolHash,action:buildPoolAction(session,manifest,envelope,factoryAbi)};
  const fundingInput={...shared,poolInput,toolHash:'b'.repeat(64),action:buildCreatorAction(session,manifest,vaultAbi)};
  const completionInput={...shared,poolInput,fundingInput,fundingToolHash:fundingInput.toolHash,toolHash:'a'.repeat(64),action:buildCompletionAction(session,manifest,vaultAbi)};
  return {...completionInput,completionInput,completionToolHash:completionInput.toolHash,toolHash:'e'.repeat(64)};
}
function input(step='harvest'){const i=publicInput();i.action=rewards.buildAction(i.session,i.manifest,vaultAbi,step);return i;}
const baseline=()=>({receivedRaw:String(RECEIVED),perShareRaw:String(Q),remainderRaw:String(R),decimals:8});
function receiptFor(i,logs){return {transactionHash:TX,blockNumber:BLOCK,blockHash:H,transactionIndex:7,from:i.action.from,to:i.action.to,
  status:'success',gasUsed:1000000n,effectiveGasPrice:PRICE,cumulativeGasUsed:1500000n,logs};}
function harvestReceipt(i,patch={}){
  const pool=i.action.pool;
  return receiptFor(i,[
    wireLog(vaultAbi,'RewardsSynced',pool,{received:0n,totalAccounted:0n,accPerShare:0n,remainder:0n,...patch.beforeSync},1),
    wireLog(bemAbi,'Transfer',i.manifest.config.bem,{from:zeroAddress,to:pool,value:RECEIVED,...patch.transfer},2),
    wireLog(vaultAbi,'RewardsSynced',pool,{received:RECEIVED,totalAccounted:RECEIVED,accPerShare:Q,remainder:R,...patch.afterSync},3),
    wireLog(vaultAbi,'Harvested',pool,{caller:i.action.from,received:RECEIVED,...patch.harvested},4),
  ]);
}
function claimReceipt(i,patch={}){
  const ids=i.action.step==='creator-claim'?CREATOR_IDS:BUYER_IDS,amount=BigInt(ids.length)*Q,pool=i.action.pool;
  return receiptFor(i,[
    wireLog(vaultAbi,'RewardsSynced',pool,{received:0n,totalAccounted:RECEIVED,accPerShare:Q,remainder:R,...patch.sync},1),
    ...ids.map((id,n)=>wireLog(vaultAbi,'RewardClaimed',pool,{holder:i.action.from,id,amount:Q,...(patch.claimIndex===n?patch.claim:{})},n+2)),
    wireLog(bemAbi,'Transfer',i.manifest.config.bem,{from:pool,to:i.action.from,value:amount,...patch.transfer},ids.length+2),
  ]);
}

test('three actions freeze actor, nonce, zero native value and complete claim ID set',()=>{
  for(const [step,nonce,actor,fn,args]of [
    ['harvest',11,'creator','harvest',[]],['creator-claim',12,'creator','claimBatch',[CREATOR_IDS]],['buyer-b-claim',5,'buyerB','claimBatch',[BUYER_IDS]],
  ]){
    const i=input(step),a=i.action,decoded=decodeFunctionData({abi:vaultAbi,data:a.data});
    assert.equal(a.step,step);assert.equal(a.from,i.session[actor]);assert.equal(a.nonce,nonce);assert.equal(a.valueWei,'0');
    assert.ok(same(a.to,i.session.pool.address));assert.equal(decoded.functionName,fn);assert.deepEqual(decoded.args??[],args);
    assert.equal(a.dataHash,keccak256(a.data));
  }
});
test('action rejects unknown step, changed participants, pool and original contribution nonce',()=>{
  const changes=[i=>i.session.creator=OTHER,i=>i.session.buyerB=OTHER,i=>i.manifest.vault.address=OTHER,
    i=>i.session.pool.address=OTHER,i=>i.session.steps['creator-contribute'].nonce='11',i=>i.session.steps['buyer-b-complete'].nonce='5'];
  for(const change of changes){const i=input();change(i);assert.throws(()=>rewards.buildAction(i.session,i.manifest,vaultAbi,'harvest'));}
  const i=input();assert.throws(()=>rewards.buildAction(i.session,i.manifest,vaultAbi,'harvest-and-claim'));
});
test('independent artifact log encoding proves exact minted inflow and integer distribution',()=>{
  const i=input(),r=harvestReceipt(i),result=rewards.checkRewardEvents(r,i);
  assert.equal(r.logs[1].topics.length,3,'ERC20 value is data, not an indexed ERC721 token ID');
  assert.equal(r.logs[1].data.length,66);assert.equal(r.logs[3].topics.length,2);
  assert.equal(result.positiveTest.status,'PASS');assert.deepEqual(result.baseline,baseline());
  assert.equal(Q*100n+R,RECEIVED);assert.equal(CREATOR_AMOUNT+BUYER_AMOUNT+R,RECEIVED);
});
test('harvest rejects donation pre-sync, wrong mint and inconsistent post-sync accounting',()=>{
  const patches=[{beforeSync:{received:1n,totalAccounted:1n,remainder:1n}},
    {transfer:{from:manifestFixture.config.mining}},{transfer:{to:OTHER}},{transfer:{value:RECEIVED+1n}},
    {afterSync:{received:RECEIVED-1n}},{afterSync:{totalAccounted:RECEIVED+1n}},
    {afterSync:{accPerShare:Q+1n}},{afterSync:{remainder:R+1n}},
    {harvested:{caller:OTHER}},{harvested:{received:RECEIVED-1n}}];
  for(const patch of patches){const i=input();assert.throws(()=>rewards.checkRewardEvents(harvestReceipt(i,patch),i));}
});
test('zero inflow and positive inflow below one hundred never pass positive distribution test',()=>{
  for(const amount of [0n,99n]){
    const i=input(),r=harvestReceipt(i,{transfer:{value:amount},afterSync:{received:amount,totalAccounted:amount,accPerShare:0n,remainder:amount},harvested:{received:amount}});
    const result=rewards.checkRewardEvents(r,i);assert.equal(result.positiveTest.status,'FAIL');
  }
});
test('harvest requires two ordered syncs, one Harvested and one exact BEM mint',()=>{
  for(const index of [0,1,2,3]){
    const i=input(),missing=harvestReceipt(i),duplicate=harvestReceipt(i),emitter=harvestReceipt(i);
    missing.logs.splice(index,1);duplicate.logs.push(clone(duplicate.logs[index]));emitter.logs[index].address=OTHER;
    for(const r of [missing,duplicate,emitter])assert.throws(()=>rewards.checkRewardEvents(r,i));
  }
  const i=input(),r=harvestReceipt(i);[r.logs[0],r.logs[2]]=[r.logs[2],r.logs[0]];assert.throws(()=>rewards.checkRewardEvents(r,i));
});
test('both claims account only the frozen harvest point and pay exact 67q or33q',()=>{
  for(const [step,amount,count]of [['creator-claim',CREATOR_AMOUNT,67],['buyer-b-claim',BUYER_AMOUNT,33]]){
    const i=input(step),r=claimReceipt(i),result=rewards.checkRewardEvents(r,i,baseline());
    assert.equal(result.positiveTest.status,'PASS');assert.equal(String(result.paymentRaw),String(amount));
    assert.equal(r.logs.length,count+2);assert.equal(r.logs[1].topics.length,3);
  }
});
test('claim rejects any new inflow, changed accumulator, misdirected payment or wrong per-ID amount',()=>{
  for(const step of ['creator-claim','buyer-b-claim']){
    const i=input(step),patches=[{sync:{received:1n}},{sync:{totalAccounted:RECEIVED+1n}},{sync:{accPerShare:Q+1n}},{sync:{remainder:R+1n}},
      {transfer:{from:OTHER}},{transfer:{to:OTHER}},{transfer:{value:1n}},
      {claimIndex:0,claim:{holder:OTHER}},{claimIndex:0,claim:{id:step==='creator-claim'?68n:1n}},{claimIndex:0,claim:{amount:Q+1n}}];
    for(const patch of patches)assert.throws(()=>rewards.checkRewardEvents(claimReceipt(i,patch),i,baseline()));
    for(const change of [r=>r.logs.splice(1,1),r=>r.logs.push(clone(r.logs[1])),r=>r.logs.push(harvestReceipt(input()).logs[3]),
      r=>r.logs.push(wireLog(vaultAbi,'TransferSingle',i.action.pool,{operator:i.action.from,from:i.action.from,to:OTHER,id:1n,value:1n},200))]){
      const r=claimReceipt(i);change(r);assert.throws(()=>rewards.checkRewardEvents(r,i,baseline()));
    }
  }
});
test('reward receipt logs must have canonical block and transaction identity',()=>{
  for(const step of ['harvest','creator-claim','buyer-b-claim']){
    const i=input(step);
    for(const [field,value]of [['removed',true],['transactionHash',OTHER_H],['blockHash',OTHER_H]]){
      const r=step==='harvest'?harvestReceipt(i):claimReceipt(i);r.logs[1][field]=value;
      assert.throws(()=>rewards.checkRewardEvents(r,i,step==='harvest'?null:baseline()));
    }
  }
});

function fakeClient(i,{after=false,...overrides}={}){
  const step=i.action.step,harvested=step!=='harvest'||after,creatorPaid=step==='buyer-b-claim'||(step==='creator-claim'&&after),buyerPaid=step==='buyer-b-claim'&&after;
  const paid=(creatorPaid?CREATOR_AMOUNT:0n)+(buyerPaid?BUYER_AMOUNT:0n),vaultBem=harvested?RECEIVED-paid:0n;
  const holder=id=>BigInt(id)<=67n?i.session.creator:i.session.buyerB;
  const claimed=id=>(BigInt(id)<=67n?creatorPaid:buyerPaid)?Q:0n;
  const runtime=`0x363d3d373d3d3d363d73${i.action.template.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
  const fields={state:2,soldCount:100n,fundedWei:0n,totalPrincipalIn:303000000000000000n,totalPrincipalRefunded:0n,purchaseSpent:303000000000000000n,
    soldBitmap:(1n<<100n)-1n,totalAccounted:harvested?RECEIVED:0n,totalPaid:paid,accPerShare:harvested?Q:0n,remainder:harvested?R:0n,
    decimals:8,ownerOf:i.action.pool,isPool:true,minerKey:H,pending:500n};
  return {getBlock:async({blockNumber}={})=>({number:blockNumber??BLOCK,hash:H,timestamp:TIME}),getBlockNumber:async()=>BLOCK+14n,
    getTransactionCount:async()=>i.action.nonce,getBalance:async({address})=>same(address,i.action.pool)?0n:1000000000000000000n,
    getCode:async({address})=>same(address,i.action.from)?'0x':runtime,
    readContract:async({address,functionName,args=[],blockNumber})=>{
      assert.equal(blockNumber,BLOCK,`${functionName} must be pinned`);
      if(functionName==='holderOf')return holder(args[0]);if(functionName==='totalSupply')return 1n;
      if(functionName==='claimed')return claimed(args[0]);if(functionName==='claimable')return harvested?Q-claimed(args[0]):0n;
      if(functionName==='balanceOfBatch')return args[1].map((id,n)=>same(args[0][n],holder(id))?1n:0n);
      if(functionName==='balanceOf'){
        if(same(address,i.action.pool))return same(args[0],holder(args[1]))?1n:0n;
        assert.ok(same(address,i.manifest.config.bem));
        return same(args[0],i.action.pool)?vaultBem:same(args[0],i.session.creator)?BASE_BALANCES.creator+(creatorPaid?CREATOR_AMOUNT:0n):same(args[0],i.session.buyerB)?BASE_BALANCES.buyerB+(buyerPaid?BUYER_AMOUNT:0n):BASE_BALANCES.sellerA;
      }
      assert.ok(Object.hasOwn(fields,functionName),`Unexpected fake reward RPC ${functionName}`);return clone(fields[functionName]);
    },getGasPrice:async()=>PRICE,estimateGas:async()=>1000000n,call:async()=>({data:'0x'}),...overrides};
}
function guards(i,overrides={}){return {chainCheck:async()=>({verified:true}),identityCheck:async()=>({verified:true}),
  previousCheck:async()=>({completion:{status:'PASS',transactionHash:H},baseline:i.action.step==='harvest'?null:baseline(),rewardPrerequisites:[]}),...overrides};}

test('preview simulates three exact zero-value calls against ACTIVE100 and frozen 67/33 holders',async()=>{
  for(const step of ['harvest','creator-claim','buyer-b-claim']){
    const i=input(step),called=[];
    const p=await rewards.preview(fakeClient(i,{call:async q=>{called.push(q);assert.equal(q.value,0n);assert.equal(q.data,i.action.data);assert.equal(q.gasPrice,PRICE);}}),i,guards(i));
    assert.equal(called.length,1);assert.equal(p.valueWei,'0');assert.equal(p.nonce,i.action.nonce);assert.equal(p.dataHash,i.action.dataHash);
  }
});
test('harvest pending may be zero because Mining claim can settle new rewards',async()=>{
  const i=input(),base=fakeClient(i);let simulated=0;
  await rewards.preview(fakeClient(i,{readContract:async q=>q.functionName==='pending'?0n:base.readContract(q),call:async()=>{simulated++;}}),i,guards(i));
  assert.equal(simulated,1);
});
test('ACTIVE identity, all100 supplies, exact67/33 holders and zero initial reward ledger are required',async()=>{
  const scenarios=[['state',0],['soldCount',99n],['ownerOf',OTHER],['totalSupply',0n],['holderOf',OTHER],['decimals',18],
    ['totalAccounted',1n],['totalPaid',1n],['accPerShare',1n],['remainder',1n],['claimed',1n]];
  for(const [fn,value]of scenarios){
    const i=input(),base=fakeClient(i);let simulated=0;
    await assert.rejects(()=>rewards.preview(fakeClient(i,{readContract:async q=>q.functionName===fn?value:base.readContract(q),call:async()=>{simulated++;}}),i,guards(i)),undefined,fn);
    assert.equal(simulated,0,fn);
  }
});
test('claims refuse new unaccounted inflow, prior wrong claims, changed holders and accumulator drift',async()=>{
  for(const step of ['creator-claim','buyer-b-claim']){
    for(const [fn,value]of [['totalAccounted',RECEIVED+1n],['totalPaid',1n],['accPerShare',Q+1n],['remainder',R+1n],['claimed',Q+1n],['holderOf',OTHER]]){
      const i=input(step),base=fakeClient(i);let simulated=0;
      await assert.rejects(()=>rewards.preview(fakeClient(i,{readContract:async q=>q.functionName===fn?value:base.readContract(q),call:async()=>{simulated++;}}),i,guards(i)),undefined,`${step}/${fn}`);
      assert.equal(simulated,0);
    }
    const i=input(step),base=fakeClient(i);let simulated=0;
    await assert.rejects(()=>rewards.preview(fakeClient(i,{readContract:async q=>q.functionName==='balanceOf'&&same(q.address,i.manifest.config.bem)&&same(q.args[0],i.action.pool)?(await base.readContract(q))+1n:base.readContract(q),call:async()=>{simulated++;}}),i,guards(i)));
    assert.equal(simulated,0);
  }
});
test('zero-share distribution baseline cannot start either claim',async()=>{
  for(const step of ['creator-claim','buyer-b-claim'])for(const received of ['0','99']){
    const i=input(step);let simulated=0;
    await assert.rejects(()=>rewards.preview(fakeClient(i,{call:async()=>{simulated++;}}),i,guards(i,{previousCheck:async()=>({completion:{status:'PASS'},baseline:{receivedRaw:received,perShareRaw:'0',remainderRaw:received,decimals:8},rewardPrerequisites:[]})})));
    assert.equal(simulated,0);
  }
});
test('missing prerequisite, nonce drift, missing gas balance and gas cap fail before eth_call',async()=>{
  const i=input();
  for(const options of [
    {getTransactionCount:async()=>12},{getBalance:async()=>0n},{estimateGas:async()=>100000000n},
  ]){let called=0;await assert.rejects(()=>rewards.preview(fakeClient(i,{...options,call:async()=>{called++;}}),i,guards(i)));assert.equal(called,0);}
  let called=0;await assert.rejects(()=>rewards.preview(fakeClient(i,{call:async()=>{called++;}}),i,guards(i,{previousCheck:async()=>{throw new Error('COMPLETION_NOT_VERIFIED');}})),/COMPLETION_NOT_VERIFIED/);assert.equal(called,0);
});
test('failed simulation has one call and no implicit retry',async()=>{
  const i=input();let calls=0;await assert.rejects(()=>rewards.preview(fakeClient(i,{call:async()=>{calls++;throw new Error('REWARD_SIMULATION_FAILED');}}),i,guards(i)),/REWARD_SIMULATION_FAILED/);assert.equal(calls,1);
});
test('unknown broadcast outcome preserves signed hash and reservation without retry or release',async()=>{
  const sequence=[],reservation={valueWei:'0',maxFeeWei:String(GAS*PRICE),status:'RESERVED_BEFORE_SEND'};let hash;
  await assert.rejects(()=>sendRecordedOnce({reservation:async()=>{sequence.push('reserve');return reservation;},saveReserved:async()=>sequence.push('journal'),
    sign:async()=>{sequence.push('sign');return '0x1234';},saveSigned:async h=>{sequence.push('hash');hash=h;},send:async()=>{sequence.push('send');throw new Error('UNKNOWN_OUTCOME');}}),/UNKNOWN_OUTCOME/);
  assert.deepEqual(sequence,['reserve','journal','sign','hash','send']);assert.equal(hash,keccak256('0x1234'));assert.equal(reservation.status,'RESERVED_BEFORE_SEND');
});
test('reservation and durable signed-hash failures cannot reach send',async()=>{
  for(const fail of ['reserve','journal','hash']){
    const sequence=[];
    await assert.rejects(()=>sendRecordedOnce({reservation:async()=>{sequence.push('reserve');if(fail==='reserve')throw new Error('STOP');},
      saveReserved:async()=>{sequence.push('journal');if(fail==='journal')throw new Error('STOP');},sign:async()=>{sequence.push('sign');return '0x1234';},
      saveSigned:async()=>{sequence.push('hash');if(fail==='hash')throw new Error('STOP');},send:async()=>sequence.push('send')}),/STOP/);
    assert.equal(sequence.includes('send'),false);if(fail!=='hash')assert.equal(sequence.includes('sign'),false);
  }
});

function receiptFixture(step='harvest'){
  const i=input(step),a=i.action,entry={...a,status:'SUBMITTED',transactionHash:TX,planHash:H,gas:String(GAS),gasPrice:String(PRICE),maxFeeWei:String(GAS*PRICE)};
  const receipt=step==='harvest'?harvestReceipt(i):claimReceipt(i),tx={hash:TX,chainId:56,from:a.from,to:a.to,value:0n,input:a.data,nonce:a.nonce,gas:GAS,gasPrice:PRICE,blockNumber:BLOCK,blockHash:H};
  const calls={receipts:0,storage:0};
  const client=fakeClient(i,{after:true,getChainId:async()=>56,request:async()=> 'Geth/offline-rewards-fixture',
    getTransactionReceipt:async()=>{calls.receipts++;return receipt;},getTransaction:async()=>tx});
  return {i,entry,receipt,tx,client,calls};
}
test('verified receipts reconcile all100 claimed rows, paid total and Vault remainder',async()=>{
  for(const [step,paid,vault,claimedCount,payment]of [
    ['harvest',0n,RECEIVED,0,0n],['creator-claim',CREATOR_AMOUNT,RECEIVED-CREATOR_AMOUNT,67,CREATOR_AMOUNT],['buyer-b-claim',Q*100n,R,100,BUYER_AMOUNT],
  ]){
    const f=receiptFixture(step),saved=[];
    const result=await rewards.verifyRewardReceipt(f.client,f.i,f.entry,{baseline:step==='harvest'?null:baseline(),identityCheck:async()=>({verified:true}),onReceipt:async e=>saved.push(e)});
    assert.equal(result.status,'CONFIRMED');assert.equal(result.positiveTest.status,'PASS');assert.equal(result.paymentRaw,String(payment));
    assert.equal(result.after.totalAccounted,String(RECEIVED));assert.equal(result.after.totalPaid,String(paid));assert.equal(result.after.vaultBemRaw,String(vault));
    assert.equal(result.after.accPerShare,String(Q));assert.equal(result.after.remainder,String(R));
    assert.equal(result.after.shares.filter(s=>s.claimed===String(Q)).length,claimedCount);
    assert.equal(saved.length,1);assert.equal(f.calls.receipts,1);assert.deepEqual(saved[0].receipt,{...f.receipt,contractAddress:null});assert.equal(saved[0].actualGasFeeWei,String(1000000n*PRICE));
  }
});
test('canonical receipt is persisted before event, storage or identity postcondition failure',async()=>{
  for(const mode of ['event','storage','identity']){
    const f=receiptFixture('creator-claim'),baseRead=f.client.readContract;let saved;
    if(mode==='event')f.receipt.logs.pop();
    if(mode==='storage')f.client.readContract=async q=>q.functionName==='totalPaid'?CREATOR_AMOUNT+1n:baseRead(q);
    await assert.rejects(()=>rewards.verifyRewardReceipt(f.client,f.i,f.entry,{baseline:baseline(),onReceipt:async e=>saved=e,
      identityCheck:async()=>{if(mode==='identity')throw new Error('IDENTITY_CHANGED');return {verified:true};}}));
    assert.deepEqual(saved.receipt,{...f.receipt,contractAddress:null},mode);assert.equal(f.calls.receipts,1);
  }
});
test('successful zero or sub100 harvest is retained as CONFIRMED but positive test FAIL',async()=>{
  for(const amount of [0n,99n]){
    const f=receiptFixture(),baseRead=f.client.readContract;let saved=0;
    const altered=harvestReceipt(f.i,{transfer:{value:amount},afterSync:{received:amount,totalAccounted:amount,accPerShare:0n,remainder:amount},harvested:{received:amount}});
    f.receipt.logs=altered.logs;
    f.client.readContract=async q=>{
      if(q.functionName==='totalAccounted'||q.functionName==='remainder')return amount;
      if(q.functionName==='accPerShare'||q.functionName==='claimable')return 0n;
      if(q.functionName==='balanceOf'&&same(q.address,f.i.manifest.config.bem)&&same(q.args[0],f.i.action.pool))return amount;
      return baseRead(q);
    };
    const result=await rewards.verifyRewardReceipt(f.client,f.i,f.entry,{onReceipt:async()=>saved++,identityCheck:async()=>({verified:true})});
    assert.equal(saved,1);assert.equal(result.status,'CONFIRMED');assert.equal(result.positiveTest.status,'FAIL');assert.equal(result.baseline.receivedRaw,String(amount));
  }
});
test('poststate rejects extra inflow, incorrect paid or claimed, ownership and supply changes',async()=>{
  for(const [fn,value]of [['totalPaid',CREATOR_AMOUNT+1n],['totalAccounted',RECEIVED+1n],['remainder',R+1n],['claimed',Q+1n],['ownerOf',OTHER],['holderOf',OTHER],['totalSupply',0n]]){
    const f=receiptFixture('creator-claim'),baseRead=f.client.readContract;
    f.client.readContract=async q=>q.functionName===fn?value:baseRead(q);
    await assert.rejects(()=>rewards.verifyRewardReceipt(f.client,f.i,f.entry,{baseline:baseline(),identityCheck:async()=>({verified:true})}),undefined,fn);
  }
});
test('unrelated recipient BEM balance drift is recorded but never used as payment attribution',async()=>{
  const f=receiptFixture('creator-claim'),baseRead=f.client.readContract;
  f.client.readContract=async q=>q.functionName==='balanceOf'&&same(q.address,f.i.manifest.config.bem)&&!same(q.args[0],f.i.action.pool)?99999999n:baseRead(q);
  const result=await rewards.verifyRewardReceipt(f.client,f.i,f.entry,{baseline:baseline(),identityCheck:async()=>({verified:true})});
  assert.equal(result.paymentRaw,String(CREATOR_AMOUNT));assert.equal(result.after.bemBalances.creator,'99999999');assert.match(result.paymentEvidence,/not attributed/);
});
test('receipt must preserve nonce, value, calldata, fees and15 canonical confirmations',async()=>{
  for(const change of [f=>f.tx.nonce++,f=>f.tx.value=1n,f=>f.tx.input='0x1234',f=>f.tx.gas++,f=>f.tx.gasPrice++,
    f=>f.receipt.gasUsed=GAS+1n,f=>f.client.getBlockNumber=async()=>BLOCK+13n,f=>f.client.getBlock=async()=>({number:BLOCK,hash:OTHER_H,timestamp:TIME})]){
    const f=receiptFixture();change(f);let saved=0;
    await assert.rejects(()=>rewards.verifyRewardReceipt(f.client,f.i,f.entry,{identityCheck:async()=>({verified:true}),onReceipt:async()=>saved++}));assert.equal(saved,0);
  }
});
test('reviewed plan permits head, pending and wallet balance drift but freezes state and raw operation',async()=>{
  const i=input('creator-claim'),a=await rewards.preview(fakeClient(i),i,guards(i)),observed=clone(a);
  observed.before.blockNumber=String(BLOCK+100n);observed.before.blockHash=OTHER_H;observed.before.timestamp=String(TIME+100n);
  observed.before.pendingRaw='999999';observed.before.bemBalances.creator='999999';observed.before.bemBalances.buyerB='888888';observed.before.actorNativeWei='99999999999999999';
  assert.doesNotThrow(()=>rewards.assertPlanUnchanged(a,observed));
  for(const change of [p=>p.data='0x12',p=>p.ids.pop(),p=>p.nonce++,p=>p.valueWei='1',p=>p.gasPrice='1',p=>p.maxFeeWei='1',
    p=>p.rewardsToolHash='x',p=>p.completionToolHash='x',p=>p.bindings.manifestHash=OTHER_H,p=>p.primaryEndpoint='https://example.invalid',
    p=>p.baseline.receivedRaw='12346',p=>p.prerequisite.completion.transactionHash=OTHER_H,
    p=>p.before.vaultBemRaw='12346',p=>p.before.totalPaid='1',p=>p.before.accPerShare='124',p=>p.before.remainder='46',
    p=>p.before.shares[0].claimed='1',p=>p.before.shares[99].holder=OTHER,p=>p.before.creatorBalances[0]='0']){
    const changed=clone(a);change(changed);assert.throws(()=>rewards.assertPlanUnchanged(a,changed));
  }
});

async function priorFixture(){
  const f=receiptFixture();f.plan=clone(await rewards.preview(fakeClient(f.i),f.i,guards(f.i)));
  Object.assign(f.entry,{status:'CONFIRMED',baseline:baseline(),positiveTest:{status:'PASS'}});
  for(const name of ['readContract','getCode','getBalance','getStorageAt','call'])f.client[name]=async()=>{f.calls.storage++;throw new Error('missing trie node');};
  return f;
}
test('prior harvest rebuilds checkpoint from canonical receipt without historical storage',async()=>{
  const f=await priorFixture(),result=await rewards.verifyPriorRewardReceipt(f.client,f.i,f.entry,f.plan);
  assert.deepEqual(result.baseline,baseline());assert.equal(result.entryHash,keccak256(Buffer.from(json(f.entry))));
  assert.match(result.scope,/NO_HISTORICAL_STORAGE/);assert.equal(f.calls.storage,0);assert.equal(f.calls.receipts,1);
});
test('prior receipt refuses fabricated journal baseline, failed positive test or changed frozen source',async()=>{
  for(const change of [f=>f.entry.baseline.receivedRaw='99999',f=>f.entry.positiveTest.status='FAIL',f=>f.entry.status='SUBMITTED',
    f=>f.plan.rewardsToolHash='changed',f=>f.plan.bindings.manifestHash=OTHER_H,f=>f.plan.baseline=baseline(),
    f=>f.receipt.logs.pop(),f=>f.tx.nonce++,f=>f.client.getBlockNumber=async()=>BLOCK+13n]){
    const f=await priorFixture();change(f);await assert.rejects(()=>rewards.verifyPriorRewardReceipt(f.client,f.i,f.entry,f.plan));assert.equal(f.calls.storage,0);
  }
});
function ledgerFixture(count=3){
  const i=input(['harvest','creator-claim','buyer-b-claim'][count-1]),prior=303900000000000000n,fee=GAS*PRICE;
  const steps=['harvest','creator-claim','buyer-b-claim'].slice(0,count).map((step,n)=>{
    const a=rewards.buildAction(i.session,i.manifest,vaultAbi,step);
    return {step,status:n<count-1?'CONFIRMED':'SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN',nonce:a.nonce,to:a.to,pool:a.pool,valueWei:'0',dataHash:a.dataHash,
      planHash:H,reservationId:`rewards-${SESSION_HASH.slice(2)}-${step}`,gas:String(GAS),gasPrice:String(PRICE),maxFeeWei:String(fee),transactionHash:TX,
      positiveTest:{status:'PASS'},rewardsToolHash:i.toolHash,completionToolHash:i.completionToolHash,fundingToolHash:i.fundingToolHash,poolToolHash:i.poolToolHash,sellerRuntimeToolHash:i.sellerToolHash};
  });
  const old={command:'synthetic-prior-principal-and-fees',to:i.action.to,calldataHash:OTHER_H,valueWei:'303000000000000000',maxFeeWei:String(prior-303000000000000000n),status:'RECEIPT_VERIFIED'};
  const reservations=steps.map(e=>({reservationId:e.reservationId,operation:e.step,sender:rewards.buildAction(i.session,i.manifest,vaultAbi,e.step).from,
    nonce:String(e.nonce),valueWei:'0',maxFeeWei:e.maxFeeWei,bundleHash:SESSION_HASH,initCodeHash:e.dataHash,status:'RESERVED_BEFORE_SEND'}));
  return {i,prior,fee,journal:{schemaVersion:1,chainId:56,sessionHash:SESSION_HASH,steps},ledger:{spentAndReservedWei:String(prior+BigInt(count)*fee),reservations:[old,...reservations]}};
}
test('three rewards reserve gas only on top of all prior principal and fee reservations',()=>{
  for(const count of [1,2,3]){const f=ledgerFixture(count);assert.doesNotThrow(()=>rewards.assertRewardLedger(f.journal,f.ledger,f.i));assert.equal(BigInt(f.ledger.spentAndReservedWei),f.prior+BigInt(count)*f.fee);}
});
test('ledger refuses skipped steps, missing hashes, source drift, fee changes or budget reset',()=>{
  const changes=[f=>f.journal.steps[0].positiveTest.status='FAIL',f=>f.journal.steps[0].status='SUBMITTED',f=>f.journal.steps.reverse(),
    f=>delete f.journal.steps[2].transactionHash,f=>f.journal.steps[2].rewardsToolHash='different',f=>f.journal.steps[2].valueWei=0,
    f=>f.journal.steps[2].gas='1',f=>f.ledger.reservations[3].sender=OTHER,f=>f.ledger.reservations[3].valueWei='1',
    f=>f.journal.steps.pop(),f=>f.ledger.spentAndReservedWei=String(3n*f.fee),f=>f.ledger.spentAndReservedWei=String(f.prior+2n*f.fee)];
  for(const change of changes){const f=ledgerFixture();change(f);assert.throws(()=>rewards.assertRewardLedger(f.journal,f.ledger,f.i));}
});
test('CLI requires one explicit supported step and reviewed hash before broadcast',()=>{
  const argv=['--env','../.env','--session','mainnet-test/session.json','--step','harvest'];
  const plan=rewards.argumentsFor(argv);assert.equal(plan.broadcast,false);assert.equal(plan.reconcile,false);
  for(const args of [argv.slice(0,4),[...argv,'--broadcast'],[...argv,'--broadcast','--reconcile'],[...argv,'--nonce','99'],[...argv,'--ids','1'],[...argv,'--step','creator-claim']])assert.throws(()=>rewards.argumentsFor(args));
});
