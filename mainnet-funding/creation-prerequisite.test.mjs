import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {decodeEventLog,encodeAbiParameters,encodeEventTopics} from 'viem';
import {parseOrderEnvelope} from '../sdk/order-envelope.ts';
import {buildAction as buildPoolAction} from '../mainnet-pool/create-pool.mjs';
import {buildAction,verifyCreationPrerequisite} from './creator-contribute.mjs';

// Read only frozen public inputs and the explicit original creation plan.
// Journal entries, transaction hashes and receipts below are entirely synthetic.
// No .env/RPC or real journal/budget access; no runtime or evidence is modified.
const json=async file=>JSON.parse(await fs.readFile(new URL(file,import.meta.url),'utf8'));
const PLAN_HASH='0x160202869ab4bf0f4468613d2d5328bd9bc5bbf82a04783e24c6ed33f1f3528d';
const [session,manifest,rawEnvelope,factoryArtifact,vaultArtifact,planFixture]=await Promise.all([
  json('../mainnet-test/session.json'),json('../mainnet-test/live-manifest.json'),json('../mainnet-test/order-envelope.json'),
  json('../out/GroupBuyFactory.sol/GroupBuyFactory.json'),json('../out/GroupBuyVault.sol/GroupBuyVault.json'),
  json('../mainnet-pool/plans/create-pool-160202869ab4bf0f4468613d2d5328bd9bc5bbf82a04783e24c6ed33f1f3528d.json'),
]);
const factoryAbi=factoryArtifact.abi,vaultAbi=vaultArtifact.abi,envelope=parseOrderEnvelope(rawEnvelope);
const clone=value=>structuredClone(value),OTHER='0x0000000000000000000000000000000000000099',OTHER_H='0x'+'cd'.repeat(32);
const MOCK_TX='0x'+'ef'.repeat(32),MOCK_BLOCK_HASH='0x'+'ab'.repeat(32),MOCK_BLOCK=128000000n;
const originalEntry={step:'create-pool',status:'CONFIRMED',transactionHash:MOCK_TX,planHash:PLAN_HASH,
  nonce:planFixture.nonce,to:planFixture.to,pool:planFixture.pool,dataHash:planFixture.dataHash,
  gas:planFixture.gas,gasPrice:planFixture.gasPrice,maxFeeWei:planFixture.maxFeeWei};
function eventLog(name,address,args,index){
  const event=(name==='PoolCreated'?factoryAbi:vaultAbi).find(x=>x.type==='event'&&x.name===name);
  const plain=event.inputs.filter(x=>!x.indexed);
  return {address,topics:encodeEventTopics({abi:[event],eventName:name,args}),
    data:encodeAbiParameters(plain,plain.map(x=>args[x.name])),blockNumber:MOCK_BLOCK,blockHash:MOCK_BLOCK_HASH,
    transactionHash:MOCK_TX,transactionIndex:0,logIndex:index,removed:false};
}
function fixture(){
  const s=clone(session),m=clone(manifest),p=clone(planFixture),entry=clone(originalEntry);
  const poolInput={session:s,manifest:m,envelope:clone(envelope),factoryAbi,vaultAbi,action:buildPoolAction(s,m,envelope,factoryAbi)};
  const input={...poolInput,action:buildAction(s,m,vaultAbi),poolInput,sessionHash:p.sessionHash,sessionFile:p.sessionFile,
    poolToolHash:p.poolToolHash,sellerToolHash:p.sellerRuntimeToolHash,bindings:clone(p.bindings)};
  const a=poolInput.action;
  const receipt={transactionHash:MOCK_TX,from:a.from,to:a.to,status:'success',contractAddress:null,
    blockNumber:MOCK_BLOCK,blockHash:MOCK_BLOCK_HASH,transactionIndex:0,
    gasUsed:BigInt(p.gas)-100n,effectiveGasPrice:BigInt(p.gasPrice),cumulativeGasUsed:BigInt(p.gas),logs:[
      eventLog('VaultInitialized',a.pool,{factory:a.to,creator:a.from,configHash:a.configHash,termsHash:a.termsHash,payload:s.pool.payload},0),
      eventLog('PoolCreated',a.to,{vault:a.pool,creator:a.from,template:a.template,configHash:a.configHash,termsHash:a.termsHash,round:BigInt(a.round),salt:a.salt,orderPayload:s.pool.payload},1),
    ]};
  const tx={hash:entry.transactionHash,chainId:56,from:p.from,to:p.to,value:0n,input:p.data,nonce:p.nonce,
    gas:BigInt(p.gas),gasPrice:BigInt(p.gasPrice),blockNumber:receipt.blockNumber,blockHash:receipt.blockHash};
  const calls={receipt:0,storage:0,block:0};
  const unavailable=async()=>{calls.storage++;throw new Error('missing trie node: historical storage pruned');};
  const client={getChainId:async()=>56,request:async({method})=>{assert.equal(method,'web3_clientVersion');return 'Geth/offline-pruned-fixture';},
    getTransactionReceipt:async()=>{calls.receipt++;return receipt;},getTransaction:async()=>tx,
    getBlock:async({blockNumber})=>{calls.block++;assert.equal(blockNumber,receipt.blockNumber);return {number:receipt.blockNumber,hash:receipt.blockHash};},
    getBlockNumber:async()=>receipt.blockNumber+14n,
    readContract:unavailable,getCode:unavailable,getBalance:unavailable,getStorageAt:unavailable,getProof:unavailable,call:unavailable};
  return {input,entry,plan:p,receipt,tx,client,calls};
}
function mutateEvent(f,name,patch){
  const abi=name==='PoolCreated'?factoryAbi:vaultAbi,event=abi.find(x=>x.type==='event'&&x.name===name);
  const topic=encodeEventTopics({abi:[event],eventName:name})[0];
  const log=f.receipt.logs.find(x=>x.topics[0]===topic);assert.ok(log,`Synthetic creation receipt needs ${name}`);
  const args={...decodeEventLog({abi:[event],eventName:name,data:log.data,topics:log.topics}).args,...patch};
  log.topics=encodeEventTopics({abi:[event],eventName:name,args});
  const plain=event.inputs.filter(x=>!x.indexed);log.data=encodeAbiParameters(plain,plain.map(x=>args[x.name]));
}

test('canonical creation receipt and exact events pass while all historical storage APIs throw missing trie',async()=>{
  const f=fixture(),result=await verifyCreationPrerequisite(f.client,f.input,f.entry,f.plan);
  assert.equal(result.scope,'CANONICAL_CREATION_RECEIPT_AND_EVENTS');assert.equal(result.historicalStorageRechecked,false);
  assert.equal(result.currentCloneStateCheckedSeparately,true);assert.equal(result.transactionHash,f.entry.transactionHash);
  assert.equal(result.pool,f.input.action.pool);assert.equal(result.blockNumber,String(f.receipt.blockNumber));
  assert.deepEqual(result.checks,{exactPoolCreated:true,exactVaultInitialized:true,receiptLogsCanonical:true});
  assert.equal(f.calls.storage,0);assert.equal(f.calls.receipt,1);assert.equal(f.calls.block,3);
});
for(const [name,change,error] of [
  ['unconfirmed journal',f=>f.entry.status='SUBMITTED',/CONFIRMED_CREATE_POOL_REQUIRED/],
  ['missing transaction hash',f=>delete f.entry.transactionHash,/CONFIRMED_CREATE_POOL_REQUIRED/],
  ['wrong plan status',f=>f.plan.status='LOCAL_FORK_ONLY',/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['wrong pool tool hash',f=>f.plan.poolToolHash='other',/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['wrong seller tool hash',f=>f.plan.sellerRuntimeToolHash='other',/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['wrong session',f=>f.plan.sessionHash=OTHER_H,/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['changed frozen binding',f=>f.plan.bindings.manifestHash=OTHER_H,/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['changed plan sender',f=>f.plan.from=OTHER,/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['changed plan target',f=>f.plan.to=OTHER,/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['changed plan value',f=>f.plan.valueWei='1',/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['changed plan nonce',f=>f.plan.nonce=10,/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['changed plan calldata hash',f=>f.plan.dataHash=OTHER_H,/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['changed plan gas',f=>f.plan.gas=String(BigInt(f.plan.gas)+1n),/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['changed plan gas price',f=>f.plan.gasPrice=String(BigInt(f.plan.gasPrice)+1n),/CREATE_PREREQUISITE_PLAN_CHANGED/],
  ['changed plan fee cap',f=>f.plan.maxFeeWei='1',/CREATE_PREREQUISITE_PLAN_CHANGED/],
])test(`prerequisite rejects ${name} before any RPC receipt read`,async()=>{
  const f=fixture();change(f);await assert.rejects(()=>verifyCreationPrerequisite(f.client,f.input,f.entry,f.plan),error);
  assert.equal(f.calls.receipt,0);assert.equal(f.calls.storage,0);
});
for(const [name,change,error] of [
  ['14 confirmations',f=>f.client.getBlockNumber=async()=>f.receipt.blockNumber+13n,/WAITING_CONFIRMATIONS/],
  ['reverted transaction',f=>f.receipt.status='reverted',/MISMATCH_RECEIPTSUCCESS/],
  ['different live sender',f=>f.tx.from=OTHER,/MISMATCH_FROM/],
  ['different live target',f=>f.tx.to=OTHER,/MISMATCH_TO/],
  ['nonzero native value',f=>f.tx.value=1n,/MISMATCH_VALUE/],
  ['different calldata',f=>f.tx.input='0x1234',/MISMATCH_DATAHASH/],
  ['different live nonce',f=>f.tx.nonce=10,/CREATE_PREREQUISITE_TRANSACTION_CHANGED/],
  ['different live gas',f=>f.tx.gas++,/CREATE_PREREQUISITE_TRANSACTION_CHANGED/],
  ['different live gas price',f=>f.tx.gasPrice++,/CREATE_PREREQUISITE_TRANSACTION_CHANGED/],
  ['actual fee above frozen maximum',f=>f.receipt.gasUsed=BigInt(f.plan.gas)+1n,/CREATE_PREREQUISITE_TRANSACTION_CHANGED/],
  ['noncanonical receipt block',f=>f.client.getBlock=async()=>({number:f.receipt.blockNumber,hash:OTHER_H}),/NON_CANONICAL_RECEIPT/],
])test(`pruned-safe receipt check rejects ${name}`,async()=>{
  const f=fixture();change(f);await assert.rejects(()=>verifyCreationPrerequisite(f.client,f.input,f.entry,f.plan),error);assert.equal(f.calls.storage,0);
});
test('canonical block is rechecked after exact event matching',async()=>{
  const f=fixture();f.client.getBlock=async()=>({number:f.receipt.blockNumber,hash:++f.calls.block===3?OTHER_H:f.receipt.blockHash});
  await assert.rejects(()=>verifyCreationPrerequisite(f.client,f.input,f.entry,f.plan),/CREATE_PREREQUISITE_BLOCK_CHANGED/);assert.equal(f.calls.storage,0);
});
for(const [field,value] of [['vault',OTHER],['creator',OTHER],['template',OTHER],['configHash',OTHER_H],['termsHash',OTHER_H],['round',2n],['salt',OTHER_H],['orderPayload','0x12']])test(`PoolCreated ${field} still must match despite unavailable old storage`,async()=>{
  const f=fixture();mutateEvent(f,'PoolCreated',{[field]:value});await assert.rejects(()=>verifyCreationPrerequisite(f.client,f.input,f.entry,f.plan),/CREATE_POOL_EVENT_MISMATCH/);assert.equal(f.calls.storage,0);
});
for(const [field,value] of [['factory',OTHER],['creator',OTHER],['configHash',OTHER_H],['termsHash',OTHER_H],['payload','0x12']])test(`VaultInitialized ${field} still must match despite unavailable old storage`,async()=>{
  const f=fixture();mutateEvent(f,'VaultInitialized',{[field]:value});await assert.rejects(()=>verifyCreationPrerequisite(f.client,f.input,f.entry,f.plan),/VAULT_INITIALIZED_EVENT_MISMATCH/);assert.equal(f.calls.storage,0);
});
test('missing creation event cannot be replaced by a previously CONFIRMED journal flag',async()=>{
  const f=fixture();f.receipt.logs=[];await assert.rejects(()=>verifyCreationPrerequisite(f.client,f.input,f.entry,f.plan),/CREATE_POOL_EVENT_MISMATCH/);
});
test('receipt log from a different canonical block is rejected',async()=>{
  const f=fixture();f.receipt.logs[0].blockHash=OTHER_H;await assert.rejects(()=>verifyCreationPrerequisite(f.client,f.input,f.entry,f.plan),/RECEIPT_LOG_IDENTITY_MISMATCH/);
});
