import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {decodeFunctionData,encodeAbiParameters,encodeEventTopics,keccak256,parseAbi,zeroAddress} from 'viem';
import {parseOrderEnvelope} from '../sdk/order-envelope.ts';
import {sendRecordedOnce} from '../live-test/deploy-mainnet.mjs';

// Entirely offline: public immutable inputs/ABI plus synthetic transactions.
// Never read .env, actual journals or budgets, and never create an RPC transport.
const readJson=async relative=>JSON.parse(await fs.readFile(new URL(relative,import.meta.url),'utf8'));
const [sessionFixture,manifestFixture,envelopeFixture,vaultArtifact,factoryArtifact,seaportArtifact]=await Promise.all([
  readJson('../mainnet-test/session.json'),readJson('../mainnet-test/live-manifest.json'),readJson('../mainnet-test/order-envelope.json'),
  readJson('../out/GroupBuyVault.sol/GroupBuyVault.json'),readJson('../out/GroupBuyFactory.sol/GroupBuyFactory.json'),readJson('../fixtures/seaport/Seaport.json'),
]);
const vaultAbi=vaultArtifact.abi,factoryAbi=factoryArtifact.abi;
const fulfilledAbi=(Array.isArray(seaportArtifact)?seaportArtifact:seaportArtifact.abi).filter(e=>e.type==='event'&&e.name==='OrderFulfilled');
assert.equal(fulfilledAbi.length,1);
const nftAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)']);
const clone=value=>structuredClone(value),same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const H='0x'+'ab'.repeat(32),OTHER_H='0x'+'cd'.repeat(32),TX='0x'+'ef'.repeat(32),OTHER='0x0000000000000000000000000000000000000099';
const SESSION_HASH='0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c';
const IDS=Array.from({length:33},(_,n)=>BigInt(n+68)),CREATOR_IDS=Array.from({length:67},(_,n)=>BigInt(n+1));
const ALL_IDS=Array.from({length:100},(_,n)=>BigInt(n+1));
const VALUE=99990000000000000n,CREATOR_VALUE=203010000000000000n,TOTAL=303000000000000000n,UNIT=3030000000000000n;
const BLOCK=128000000n,TIME=1792423200n;
function wireLog(abi,name,address,args,index){
  const event=abi.find(e=>e.type==='event'&&e.name===name);assert.ok(event);
  const plain=event.inputs.filter(x=>!x.indexed);
  return {address,topics:encodeEventTopics({abi:[event],eventName:name,args}),data:encodeAbiParameters(plain,plain.map(x=>args[x.name])),
    blockNumber:BLOCK,blockHash:H,transactionHash:TX,transactionIndex:7,logIndex:index,removed:false};
}
function fulfilledFields(i){return {orderHash:i.session.seaport.orderHash,offerer:i.session.seller,zone:zeroAddress,recipient:i.session.pool.address,
  offer:[{itemType:2,token:i.session.collection,identifier:3204n,amount:1n}],
  consideration:[{itemType:0,token:zeroAddress,identifier:0n,amount:300000000000000000n,recipient:i.session.seller},
    {itemType:0,token:zeroAddress,identifier:0n,amount:3000000000000000n,recipient:i.session.creator}]};}
function completionReceipt(i,patch={}){
  const a=i.action;
  return {transactionHash:TX,blockNumber:BLOCK,blockHash:H,transactionIndex:7,from:a.from,to:a.to,status:'success',
    gasUsed:1000000n,effectiveGasPrice:50000000n,cumulativeGasUsed:1500000n,logs:[
      wireLog(vaultAbi,'TransferBatch',a.to,{operator:a.from,from:zeroAddress,to:a.from,ids:IDS,values:IDS.map(()=>1n),...patch.mint},1),
      wireLog(vaultAbi,'Contributed',a.to,{participant:a.from,ids:IDS,principal:VALUE,soldCount:100n,...patch.contributed},2),
      wireLog(nftAbi,'Transfer',i.session.collection,{from:i.session.seller,to:a.to,tokenId:3204n,...patch.nft},3),
      wireLog(fulfilledAbi,'OrderFulfilled',i.session.market,{...fulfilledFields(i),...patch.fulfilled},4),
      wireLog(vaultAbi,'Purchased',a.to,{market:i.session.market,collection:i.session.collection,tokenId:3204n,paid:TOTAL,orderHash:i.session.seaport.orderHash,listingId:0n,...patch.purchased},5),
    ]};
}
import {
  argumentsFor,buildAction,checkCompletionEvents,verifyCompleted,verifyCreatorPrerequisite,
  assertCompletionLedger,preview,assertPlanUnchanged,
} from './buyer-b-complete.mjs';
import {buildAction as buildCreatorAction} from '../mainnet-funding/creator-contribute.mjs';
import {buildAction as buildPoolAction} from '../mainnet-pool/create-pool.mjs';
function input(){
  const session=clone(sessionFixture),manifest=clone(manifestFixture),envelope=parseOrderEnvelope(clone(envelopeFixture));
  const shared={session,manifest,envelope,vaultAbi,factoryAbi,sessionHash:SESSION_HASH,sessionFile:'mainnet-test/session.json',bindings:{manifestHash:H},poolToolHash:'c'.repeat(64),sellerToolHash:'d'.repeat(64),
    rpcMode:'EXPLICIT_PUBLIC_RPC_FALLBACK',primaryEndpoint:'https://bsc-dataseed.defibit.io',independentEndpoint:'https://bsc-dataseed.bnbchain.org'};
  const poolInput={...shared,toolHash:shared.poolToolHash,action:buildPoolAction(session,manifest,envelope,factoryAbi)};
  const fundingInput={...shared,poolInput,toolHash:'b'.repeat(64),action:buildCreatorAction(session,manifest,vaultAbi)};
  return {...shared,poolInput,fundingInput,fundingToolHash:fundingInput.toolHash,toolHash:'a'.repeat(64),action:buildAction(session,manifest,vaultAbi)};
}
const argv=['--env','../.env','--session','mainnet-test/session.json'];
test('B completion defaults to a read-only unsigned plan',()=>{const a=argumentsFor(argv);assert.equal(a.step,'buyer-b-complete');assert.equal(a.broadcast,false);assert.equal(a.reconcile,false);});
for(const [name,args]of [
  ['creator operation',[...argv,'--step','creator-contribute']],['unreviewed broadcast',[...argv,'--broadcast']],
  ['broadcast plus reconcile',[...argv,'--broadcast','--reconcile']],['caller IDs override',[...argv,'--ids','1,2']],
  ['caller value override',[...argv,'--value','1']],['caller nonce override',[...argv,'--nonce','5']],
  ['duplicate flags',[...argv,'--reconcile','--reconcile']],
])test(`CLI rejects ${name}`,()=>assert.throws(()=>argumentsFor(args)));
test('action encodes B nonce4, all IDs68 through100, exact .09999 BNB and requireCompletion=true',()=>{
  const i=input(),a=i.action,d=decodeFunctionData({abi:vaultAbi,data:a.data});
  assert.equal(a.step,'buyer-b-complete');assert.equal(a.from,i.session.buyerB);assert.equal(a.nonce,4);
  assert.equal(a.to,i.session.pool.address);assert.equal(a.valueWei,String(VALUE));assert.equal(a.requireCompletion,true);assert.deepEqual(a.ids,IDS);
  assert.equal(d.functionName,'contribute');assert.deepEqual(d.args,[IDS,true,i.session.pool.payload]);assert.equal(a.dataHash,keccak256(a.data));
  assert.equal(UNIT*33n,VALUE);assert.equal(VALUE+CREATOR_VALUE,TOTAL);
});
for(const [name,change]of [
  ['other buyer',i=>i.session.buyerB=OTHER],['other pool',i=>i.session.pool.address=OTHER],['other manifest clone',i=>i.manifest.vault.address=OTHER],
  ['different allocation address',i=>i.session.plannedContributions[1].address=OTHER],['wrong allocation role',i=>i.session.plannedContributions[1].role='creator'],
  ['incomplete IDs',i=>i.session.plannedContributions[1].ids='68..99'],['overlapping IDs',i=>i.session.plannedContributions[1].ids='67..99'],
  ['wrong share count',i=>i.session.plannedContributions[1].shares=32],['wrong principal',i=>i.session.plannedContributions[1].valueWei=String(VALUE-1n)],
  ['altered payload',i=>i.session.pool.payload='0x12'],['changed nonce',i=>i.session.steps['buyer-b-complete'].nonce='5'],
  ['missing creator prerequisite',i=>i.session.steps['buyer-b-complete'].requiresStep='create-pool'],
])test(`B action rejects ${name}`,()=>{const i=input();change(i);assert.throws(()=>buildAction(i.session,i.manifest,vaultAbi));});
test('exact 33-share contribution, NFT transfer, complete Seaport fill and Purchased events pass',()=>{
  const i=input(),r=completionReceipt(i);assert.equal(r.logs[3].topics.length,3);assert.equal(r.logs[2].topics.length,4);
  assert.ok(checkCompletionEvents(r,i));
});
for(const [name,patch]of [
  ['participant',{contributed:{participant:OTHER}}],['contribution IDs',{contributed:{ids:IDS.slice(1)}}],
  ['contribution principal',{contributed:{principal:VALUE-1n}}],['contribution soldCount',{contributed:{soldCount:99n}}],
  ['mint operator',{mint:{operator:OTHER}}],['mint source',{mint:{from:OTHER}}],['mint recipient',{mint:{to:OTHER}}],
  ['duplicate minted ID',{mint:{ids:[...IDS.slice(0,32),99n]}}],['wrong minted ID',{mint:{ids:[...IDS.slice(0,32),67n]}}],
  ['mint amount two',{mint:{values:IDS.map((_,n)=>n===0?2n:1n)}}],['mint amount zero',{mint:{values:IDS.map((_,n)=>n===32?0n:1n)}}],
  ['miner source',{nft:{from:OTHER}}],['miner recipient',{nft:{to:OTHER}}],['miner ID',{nft:{tokenId:3205n}}],
  ['purchase market',{purchased:{market:OTHER}}],['purchase collection',{purchased:{collection:OTHER}}],['purchase NFT ID',{purchased:{tokenId:3205n}}],
  ['purchase total',{purchased:{paid:TOTAL-1n}}],['purchase order hash',{purchased:{orderHash:OTHER_H}}],['unexpected listing ID',{purchased:{listingId:1n}}],
])test(`completion events reject changed ${name}`,()=>{const i=input();assert.throws(()=>checkCompletionEvents(completionReceipt(i,patch),i));});
for(const [name,change]of [
  ['order hash',v=>v.orderHash=OTHER_H],['offerer',v=>v.offerer=OTHER],['zone',v=>v.zone=OTHER],['NFT recipient',v=>v.recipient=OTHER],
  ['offer item type',v=>v.offer[0].itemType=3],['offer token',v=>v.offer[0].token=OTHER],['offer identifier',v=>v.offer[0].identifier=3205n],
  ['offer quantity',v=>v.offer[0].amount=2n],['extra offered item',v=>v.offer.push(clone(v.offer[0]))],
  ['seller item type',v=>v.consideration[0].itemType=1],['seller token',v=>v.consideration[0].token=OTHER],['seller identifier',v=>v.consideration[0].identifier=1n],
  ['seller amount',v=>v.consideration[0].amount--],['seller recipient',v=>v.consideration[0].recipient=OTHER],
  ['fee amount',v=>v.consideration[1].amount++],['fee recipient',v=>v.consideration[1].recipient=OTHER],
  ['fee item type',v=>v.consideration[1].itemType=1],['fee token',v=>v.consideration[1].token=OTHER],['fee identifier',v=>v.consideration[1].identifier=1n],
  ['missing consideration',v=>v.consideration.pop()],['extra consideration',v=>v.consideration.push(clone(v.consideration[1]))],
])test(`complete Seaport fulfillment rejects wrong ${name}`,()=>{const i=input(),fulfilled=fulfilledFields(i);change(fulfilled);assert.throws(()=>checkCompletionEvents(completionReceipt(i,{fulfilled}),i));});
for(const [index,name]of [[0,'mint'],[1,'contribution'],[2,'NFT Transfer'],[3,'OrderFulfilled'],[4,'Purchased']]){
  test(`completion rejects missing ${name}`,()=>{const i=input(),r=completionReceipt(i);r.logs.splice(index,1);assert.throws(()=>checkCompletionEvents(r,i));});
  test(`completion rejects duplicate ${name}`,()=>{const i=input(),r=completionReceipt(i);r.logs.push(clone(r.logs[index]));assert.throws(()=>checkCompletionEvents(r,i));});
  test(`completion rejects wrong ${name} emitter`,()=>{const i=input(),r=completionReceipt(i);r.logs[index].address=OTHER;assert.throws(()=>checkCompletionEvents(r,i));});
}
test('all completion logs belong to the same transaction and canonical block',()=>{
  for(const [field,value]of [['removed',true],['transactionHash',OTHER_H],['blockHash',OTHER_H]]){const i=input(),r=completionReceipt(i);r.logs[3][field]=value;assert.throws(()=>checkCompletionEvents(r,i));}
});

function fakeClient(i,{after=false,...overrides}={}){
  const runtime=`0x363d3d373d3d3d363d73${i.action.template.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
  const holder=id=>BigInt(id)<=67n?i.session.creator:after?i.session.buyerB:zeroAddress;
  const supplied=id=>after||BigInt(id)<=67n?1n:0n;
  const values={isPool:true,state:after?2:0,soldCount:after?100n:67n,fundedWei:after?0n:CREATOR_VALUE,
    totalPrincipalIn:after?TOTAL:CREATOR_VALUE,totalPrincipalRefunded:0n,purchaseSpent:after?TOTAL:0n,
    soldBitmap:after?(1n<<100n)-1n:(1n<<67n)-1n,marketStatus:after?4:0,
    ownerOf:after?i.action.pool:i.session.seller,getApproved:after?zeroAddress:i.session.market,isApprovedForAll:false,
    information:[i.session.seaport.version,i.session.seaport.domainSeparator,zeroAddress],getCounter:BigInt(i.session.seaport.counter),
    getOrderHash:i.action.orderHash,getOrderStatus:after?[true,false,1n,1n]:[true,false,0n,0n]};
  return {getBlock:async({blockNumber}={})=>({number:blockNumber??BLOCK,hash:H,timestamp:TIME}),getTransactionCount:async()=>4,
    getBalance:async({address})=>same(address,i.action.pool)?after?0n:CREATOR_VALUE:1000000000000000000n,
    getCode:async({address})=>same(address,i.action.from)?'0x':runtime,
    readContract:async({functionName,args=[]})=>{
      if(functionName==='holderOf')return holder(args[0]);if(functionName==='totalSupply')return supplied(args[0]);
      if(functionName==='balanceOfBatch')return args[1].map((id,n)=>same(args[0][n],holder(id))?supplied(id):0n);
      if(functionName==='costOf')return UNIT;
      assert.ok(Object.hasOwn(values,functionName),`Unexpected fake RPC function ${functionName}`);return clone(values[functionName]);
    },getGasPrice:async()=>50000000n,estimateGas:async()=>1000001n,call:async()=>({data:'0x'}),...overrides};
}
function guards(i,overrides={}){return {chainCheck:async()=>{},previousCheck:async()=>({creatorTransactionHash:H}),
  identityCheck:async()=>({verified:true}),protocolCheck:async()=>({executable:true,orderHash:i.action.orderHash}),...overrides};}
test('preview validates creator67 and unused B33 before exact completion=true simulation',async()=>{
  const i=input(),calls=[],costIds=[],base=fakeClient(i);
  const p=await preview(fakeClient(i,{readContract:async q=>{if(q.functionName==='costOf')costIds.push(q.args[0]);return base.readContract(q);},
    estimateGas:async q=>{calls.push('estimate');assert.equal(q.value,VALUE);assert.equal(q.gas,undefined);return 1000001n;},
    call:async q=>{calls.push('call');assert.equal(q.value,VALUE);assert.equal(q.gas,1200002n);assert.equal(q.gasPrice,50000000n);assert.deepEqual(decodeFunctionData({abi:vaultAbi,data:q.data}).args,[IDS,true,i.session.pool.payload]);},
  }),i,guards(i,{identityCheck:async(_client,_manifest,options)=>{assert.equal(options.command,'contribute');assert.equal(options.actor,i.session.buyerB);assert.deepEqual(options.args,[IDS,true,i.session.pool.payload]);return {verified:true};}}));
  assert.deepEqual(costIds,IDS);assert.deepEqual(calls,['estimate','call']);assert.equal(p.valueWei,String(VALUE));assert.equal(p.nonce,4);assert.equal(p.maxFeeWei,'60000100000000');
});
for(const [name,fn,value]of [
  ['not registered','isPool',false],['not FUNDING','state',2],['wrong sold count','soldCount',66n],['wrong prior principal','totalPrincipalIn',CREATOR_VALUE-1n],
  ['wrong funded value','fundedWei',CREATOR_VALUE-1n],['prior refund','totalPrincipalRefunded',1n],['prior purchase','purchaseSpent',1n],
  ['wrong bitmap','soldBitmap',1n],['market not executable','marketStatus',10],['miner owner changed','ownerOf',OTHER],
  ['approval missing','getApproved',zeroAddress],['collection approval','isApprovedForAll',true],['counter drift','getCounter',1n],
  ['order unvalidated','getOrderStatus',[false,false,0n,0n]],['order cancelled','getOrderStatus',[true,true,0n,0n]],['order filled','getOrderStatus',[true,false,1n,1n]],
])test(`B preview rejects ${name}`,async()=>{const i=input(),base=fakeClient(i);await assert.rejects(()=>preview(fakeClient(i,{readContract:async q=>q.functionName===fn?value:base.readContract(q)}),i,guards(i)));});
test('creator must hold exactly1..67 and all B slots must remain unminted',async()=>{
  for(const id of [1n,67n,68n,100n]){
    const i=input(),base=fakeClient(i);
    await assert.rejects(()=>preview(fakeClient(i,{readContract:async q=>q.functionName==='holderOf'&&q.args[0]===id?OTHER:base.readContract(q)}),i,guards(i)));
  }
});
test('creator and B balance arrays must independently agree with holders',async()=>{
  for(const account of [sessionFixture.creator,sessionFixture.buyerB]){
    const i=input(),base=fakeClient(i);await assert.rejects(()=>preview(fakeClient(i,{readContract:async q=>{
      const result=await base.readContract(q);if(q.functionName==='balanceOfBatch'&&same(q.args[0][0],account))result[0]=result[0]===1n?0n:1n;return result;
    }}),i,guards(i)));
  }
});
test('per-share prices must all match even if wrong costs cancel in total',async()=>{
  const i=input(),base=fakeClient(i);await assert.rejects(()=>preview(fakeClient(i,{readContract:async q=>q.functionName==='costOf'?(q.args[0]===68n?UNIT+1n:q.args[0]===69n?UNIT-1n:UNIT):base.readContract(q)}),i,guards(i)));
});
test('B needs principal plus maximum gas, and Vault must retain exact creator principal',async()=>{
  const i=input();let calls=0;
  await assert.rejects(()=>preview(fakeClient(i,{getBalance:async({address})=>same(address,i.action.pool)?CREATOR_VALUE:VALUE,call:async()=>{calls++;}}),i,guards(i)));
  await assert.rejects(()=>preview(fakeClient(i,{getBalance:async({address})=>same(address,i.action.pool)?CREATOR_VALUE-1n:1000000000000000000n,call:async()=>{calls++;}}),i,guards(i)));
  assert.equal(calls,0);
});
test('B pending nonce changes and missing creator evidence prevent simulation',async()=>{
  const i=input();let calls=0;
  await assert.rejects(()=>preview(fakeClient(i,{getTransactionCount:async({blockTag})=>blockTag==='pending'?5:4,call:async()=>{calls++;}}),i,guards(i)));
  await assert.rejects(()=>preview(fakeClient(i,{call:async()=>{calls++;}}),i,guards(i,{previousCheck:async()=>{throw new Error('CREATOR_PREREQUISITE_MISSING');}})),/CREATOR_PREREQUISITE_MISSING/);
  assert.equal(calls,0);
});
test('failed purchase simulation never retries',async()=>{
  const i=input();let calls=0;await assert.rejects(()=>preview(fakeClient(i,{call:async()=>{calls++;throw new Error('PURCHASE_REVERTED');}}),i,guards(i)),/PURCHASE_REVERTED/);assert.equal(calls,1);
});

function prerequisiteFixture(){
  const i=input(),a=i.fundingInput.action,gas=1200002n,gasPrice=50000000n;
  const plan={status:'FROZEN_UNSIGNED_CREATOR_CONTRIBUTION_PLAN',fundingToolHash:i.fundingToolHash,poolToolHash:i.poolToolHash,sellerRuntimeToolHash:i.sellerToolHash,
    bindings:clone(i.bindings),sessionHash:SESSION_HASH,...a,gas:String(gas),gasPrice:String(gasPrice),maxFeeWei:String(gas*gasPrice)};
  const entry={...plan,step:'creator-contribute',status:'CONFIRMED',transactionHash:TX,planHash:H};
  const receipt={transactionHash:TX,blockNumber:BLOCK,blockHash:H,transactionIndex:7,from:a.from,to:a.to,status:'success',gasUsed:1000000n,effectiveGasPrice:gasPrice,cumulativeGasUsed:1500000n,
    logs:[wireLog(vaultAbi,'TransferBatch',a.to,{operator:a.from,from:zeroAddress,to:a.from,ids:CREATOR_IDS,values:CREATOR_IDS.map(()=>1n)},1),
      wireLog(vaultAbi,'Contributed',a.to,{participant:a.from,ids:CREATOR_IDS,principal:CREATOR_VALUE,soldCount:67n},2)]};
  const tx={hash:TX,chainId:56,from:a.from,to:a.to,value:CREATOR_VALUE,input:a.data,nonce:10,gas,gasPrice,blockNumber:BLOCK,blockHash:H};
  const calls={storage:0,receipts:0};const pruned=async()=>{calls.storage++;throw new Error('missing trie node');};
  const client={getChainId:async()=>56,request:async()=> 'Geth/offline-pruned-fixture',getTransactionReceipt:async()=>{calls.receipts++;return receipt;},getTransaction:async()=>tx,
    getBlock:async()=>({number:BLOCK,hash:H}),getBlockNumber:async()=>BLOCK+14n,readContract:pruned,getCode:pruned,getBalance:pruned,getStorageAt:pruned,call:pruned};
  return {i,entry,plan,receipt,tx,client,calls};
}
test('creator prerequisite relies on exact canonical receipt events and never old storage',async()=>{
  const f=prerequisiteFixture(),result=await verifyCreatorPrerequisite(f.client,f.i,f.entry,f.plan);
  assert.equal(result.historicalStorageRechecked,false);assert.match(result.scope,/CANONICAL/);
  assert.equal(f.calls.storage,0);assert.equal(f.calls.receipts,1);
});
for(const [name,change]of [
  ['missing creator contribution',f=>f.receipt.logs.pop()],['incorrect creator mint',f=>f.receipt.logs[0].address=OTHER],
  ['wrong principal',f=>f.tx.value=CREATOR_VALUE-1n],['wrong nonce',f=>f.tx.nonce=11],['changed gas',f=>f.tx.gas++],
  ['14 confirmations',f=>f.client.getBlockNumber=async()=>BLOCK+13n],['noncanonical block',f=>f.client.getBlock=async()=>({number:BLOCK,hash:OTHER_H})],
])test(`creator prerequisite rejects ${name} without historic state fallback`,async()=>{
  const f=prerequisiteFixture();change(f);await assert.rejects(()=>verifyCreatorPrerequisite(f.client,f.i,f.entry,f.plan));assert.equal(f.calls.storage,0);
});

function completedFixture(){
  const i=input(),receipt=completionReceipt(i),a=i.action,gas=1200002n,gasPrice=50000000n;
  const entry={transactionHash:TX,gas:String(gas),gasPrice:String(gasPrice),maxFeeWei:String(gas*gasPrice),valueWei:String(VALUE)};
  const tx={hash:TX,chainId:56,from:a.from,to:a.to,value:VALUE,input:a.data,nonce:4,gas,gasPrice,blockNumber:BLOCK,blockHash:H};
  const calls={receipts:0},saved=[];
  const client={...fakeClient(i,{after:true}),getChainId:async()=>56,request:async()=> 'Geth/offline-completion-fixture',
    getTransactionReceipt:async()=>{calls.receipts++;return receipt;},getTransaction:async()=>tx,getBlockNumber:async()=>BLOCK+14n};
  const options={identityCheck:async(_client,_manifest,options)=>{assert.equal(options.command,'contribute');assert.equal(options.actor,i.session.buyerB);return {verified:true};},
    postconditions:async(_client,command,target,actor,args)=>{assert.equal(command,'contribute');assert.equal(target,a.to);assert.equal(actor,a.from);assert.deepEqual(args,[IDS,true,i.session.pool.payload]);return {verified:true};},
    onReceipt:async evidence=>saved.push(clone(evidence))};
  return {i,receipt,entry,tx,client,options,calls,saved};
}
test('completion receipt proves ACTIVE100, miner in Vault, correct purchase spent and zero funding',async()=>{
  const f=completedFixture(),result=await verifyCompleted(f.client,f.i,f.entry,f.options);
  assert.equal(result.status,'CONFIRMED');assert.equal(result.actualPrincipalWei,String(VALUE));
  assert.equal(result.after.state,2);assert.equal(result.after.soldCount,'100');assert.equal(result.after.fundedWei,'0');
  assert.equal(result.after.totalPrincipalIn,String(TOTAL));assert.equal(result.after.purchaseSpent,String(TOTAL));
  assert.equal(result.after.nftOwner,f.i.action.pool);assert.equal(f.calls.receipts,1);assert.equal(f.saved.length,1);
});
for(const [name,fn,value]of [
  ['not ACTIVE','state',0],['not all sold','soldCount',99n],['funding not spent','fundedWei',TOTAL],
  ['wrong total principal','totalPrincipalIn',TOTAL-1n],['wrong purchase spending','purchaseSpent',TOTAL-1n],['unexpected refund','totalPrincipalRefunded',1n],
  ['wrong sold bitmap','soldBitmap',(1n<<99n)-1n],['miner not in Vault','ownerOf',OTHER],['unregistered clone','isPool',false],
  ['unfilled Seaport order','getOrderStatus',[true,false,0n,0n]],['partially filled order','getOrderStatus',[true,false,1n,2n]],
])test(`completion post-state rejects ${name}`,async()=>{
  const f=completedFixture(),read=f.client.readContract;f.client.readContract=async q=>q.functionName===fn?value:read(q);
  await assert.rejects(()=>verifyCompleted(f.client,f.i,f.entry,f.options));
});
test('final 100 holders and both wallet balance arrays must exactly retain creator67/B33',async()=>{
  for(const [field,slot]of [['holderOf',1n],['holderOf',68n],['totalSupply',100n],['balanceOfBatch',0n]]){
    const f=completedFixture(),read=f.client.readContract;f.client.readContract=async q=>{
      if(q.functionName===field&&field!=='balanceOfBatch'&&q.args[0]===slot)return field==='holderOf'?OTHER:0n;
      const value=await read(q);if(q.functionName===field&&field==='balanceOfBatch')value[0]=value[0]===1n?0n:1n;return value;
    };await assert.rejects(()=>verifyCompleted(f.client,f.i,f.entry,f.options));
  }
});
test('final clone code and residual native principal are checked independently of success events',async()=>{
  for(const override of [{getCode:async()=> '0x6000'},{getBalance:async()=>1n}]){
    const f=completedFixture();Object.assign(f.client,override);await assert.rejects(()=>verifyCompleted(f.client,f.i,f.entry,f.options));
  }
});
for(const [name,change]of [
  ['reverted receipt',f=>f.receipt.status='reverted'],['14 confirmations',f=>f.client.getBlockNumber=async()=>BLOCK+13n],
  ['incorrect B principal',f=>f.tx.value=VALUE-1n],['incorrect nonce',f=>f.tx.nonce=5],['incorrect gas',f=>f.tx.gas++],
  ['incorrect gas price',f=>f.tx.gasPrice++],['fee above cap',f=>f.receipt.gasUsed=BigInt(f.entry.gas)+1n],
])test(`B receipt rejects ${name}`,async()=>{const f=completedFixture();change(f);await assert.rejects(()=>verifyCompleted(f.client,f.i,f.entry,f.options));});
test('business-check failure preserves canonical receipt before returning failure',async()=>{
  for(const change of [f=>f.receipt.logs.pop(),f=>f.options.postconditions=async()=>({verified:false})]){
    const f=completedFixture();change(f);await assert.rejects(()=>verifyCompleted(f.client,f.i,f.entry,f.options));
    assert.equal(f.saved.length,1);assert.equal(f.saved[0].receipt.transactionHash,TX);assert.equal(f.calls.receipts,1);
  }
});

test('Seaport native amounts are event-verified while independent receipt-side payments remain NOT_RUN',async()=>{
  const f=completedFixture();const balanceAddresses=[];const base=f.client.getBalance;
  f.client.getBalance=async q=>{balanceAddresses.push(q.address);return base(q);};
  const result=await verifyCompleted(f.client,f.i,f.entry,f.options),payments=result.after.nativePayments;
  assert.equal(payments.protocolEventMatch,'VERIFIED');assert.equal(payments.independentBalanceOrTraceVerification,'NOT_RUN');
  assert.deepEqual(payments.seller,{recipient:f.i.session.seller,valueWei:'300000000000000000'});
  assert.deepEqual(payments.fee,{recipient:f.i.session.creator,valueWei:'3000000000000000'});
  assert.ok(balanceAddresses.every(address=>same(address,f.i.action.pool)));
  assert.equal(result.after.bemHarvestOrClaimTest,'NOT_RUN');
});
for(const field of ['completionToolHash','fundingToolHash','rpcMode','nonce','to','valueWei','requireCompletion','dataHash','gas','gasPrice','maxFeeWei','maximumSpendWei'])test(`B confirmation freezes ${field}`,async()=>{
  const i=input(),a=await preview(fakeClient(i),i,guards(i)),b=clone(a);b[field]=String(b[field])+'1';
  assert.throws(()=>assertPlanUnchanged(a,b),/REVIEWED_CONTRIBUTION_CHANGED/);
});
test('B plan freezes full IDs, creator prerequisite, previous shares and order status',async()=>{
  const i=input(),a=await preview(fakeClient(i),i,guards(i));
  for(const change of [b=>b.ids.pop(),b=>b.ids.reverse(),b=>b.prerequisite.creatorTransactionHash=OTHER_H,
    b=>b.before.shares.holders[0]=OTHER,b=>b.before.shares.creatorBalances[0]='0',b=>b.before.shares.buyerBalances[99]='1',
    b=>b.before.orderStatus=[true,false,'1','1'],b=>b.before.costs[0]=String(UNIT+1n)]){
    const b=clone(a);change(b);assert.throws(()=>assertPlanUnchanged(a,b));
  }
});
function ledgerFixture(){
  const i=input(),id=`completion-${SESSION_HASH.slice(2)}-buyer-b-complete`;
  // Synthetic prior total intentionally includes creator principal and prior fees.
  const prior=203826665300000000n,fee=60000100000000n;
  const entry={step:'buyer-b-complete',status:'SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN',nonce:4,to:i.action.to,pool:i.action.pool,
    valueWei:String(VALUE),dataHash:i.action.dataHash,planHash:H,reservationId:id,maxFeeWei:String(fee),transactionHash:TX};
  const old={command:'synthetic-prior-deploy-and-creator',to:i.action.to,calldataHash:OTHER_H,valueWei:String(CREATOR_VALUE),maxFeeWei:String(prior-CREATOR_VALUE),status:'RECEIPT_VERIFIED'};
  const reservation={reservationId:id,operation:'buyer-b-complete',sender:i.action.from,nonce:'4',valueWei:String(VALUE),maxFeeWei:String(fee),bundleHash:SESSION_HASH,initCodeHash:i.action.dataHash,status:'RESERVED_BEFORE_SEND'};
  return {i,entry,reservation,prior,fee,journal:{schemaVersion:1,chainId:56,sessionHash:SESSION_HASH,steps:[entry]},ledger:{spentAndReservedWei:String(prior+VALUE+fee),reservations:[old,reservation]}};
}
test('B budget adds full .09999 principal and gas to all creator and deployment reservations',()=>{
  const f=ledgerFixture();assert.doesNotThrow(()=>assertCompletionLedger(f.journal,f.ledger,f.i));
  assert.equal(BigInt(f.ledger.spentAndReservedWei),f.prior+VALUE+f.fee);
});
for(const [name,change,error]of [
  ['omitted B principal',f=>f.ledger.spentAndReservedWei=String(f.prior+f.fee),/BUDGET_TOTAL_DOES_NOT_MATCH_RESERVATIONS/],
  ['reset prior total',f=>f.ledger.spentAndReservedWei=String(VALUE+f.fee),/BUDGET_TOTAL_DOES_NOT_MATCH_RESERVATIONS/],
  ['deducting expected fee recipient income',f=>f.ledger.spentAndReservedWei=String(f.prior+VALUE+f.fee-3000000000000000n),/BUDGET_TOTAL_DOES_NOT_MATCH_RESERVATIONS/],
  ['zero principal reservation',f=>{f.reservation.valueWei='0';f.ledger.spentAndReservedWei=String(f.prior+f.fee);},/COMPLETION_BUDGET_BINDING_MISMATCH/],
  ['wrong actor',f=>f.reservation.sender=f.i.session.creator,/COMPLETION_BUDGET_BINDING_MISMATCH/],
  ['wrong nonce',f=>f.entry.nonce=5,/COMPLETION_JOURNAL_BINDING_MISMATCH/],
  ['numeric principal',f=>f.entry.valueWei=Number(VALUE),/COMPLETION_JOURNAL_BINDING_MISMATCH/],
  ['different fee',f=>f.entry.maxFeeWei='1',/COMPLETION_BUDGET_BINDING_MISMATCH/],
  ['orphan reservation',f=>f.journal.steps=[],/ORPHAN_COMPLETION_RESERVATION/],
  ['signed transaction without hash',f=>delete f.entry.transactionHash,/COMPLETION_SIGNED_HASH_STATE_MISMATCH/],
])test(`B budget rejects ${name}`,()=>{const f=ledgerFixture();change(f);assert.throws(()=>assertCompletionLedger(f.journal,f.ledger,f.i),error);});
test('B unknown send outcome retains hash and reservation with no automatic retry',async()=>{
  const calls=[],reservation={valueWei:String(VALUE),maxFeeWei:'60000100000000'};let hash;
  await assert.rejects(()=>sendRecordedOnce({reservation:async()=>{calls.push('reserve');return reservation;},saveReserved:async()=>calls.push('journal'),
    sign:async()=>{calls.push('sign');return '0x1234';},saveSigned:async h=>{calls.push('hash');hash=h;},send:async()=>{calls.push('send');throw new Error('UNKNOWN_OUTCOME');}}),/UNKNOWN_OUTCOME/);
  assert.deepEqual(calls,['reserve','journal','sign','hash','send']);assert.equal(hash,keccak256('0x1234'));assert.equal(reservation.valueWei,String(VALUE));
});
test('B reservation or signed-hash write failure prevents broadcasting',async()=>{
  for(const fail of ['reserve','hash']){
    let sent=false;await assert.rejects(()=>sendRecordedOnce({reservation:async()=>{if(fail==='reserve')throw new Error('STOP');},saveReserved:async()=>{},sign:async()=> '0x1234',
      saveSigned:async()=>{if(fail==='hash')throw new Error('STOP');},send:async()=>{sent=true;}}),/STOP/);assert.equal(sent,false);
  }
});
