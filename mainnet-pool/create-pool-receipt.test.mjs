import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics} from 'viem';
import {loadInput,verifyCreated} from './create-pool.mjs';
import {cloneRuntime} from '../sdk/live-identity.ts';

// Public frozen files only. All chain observations below are in-memory mocks.
const input=await loadInput({sessionFile:'mainnet-test/session.json',publicRpcFallback:true});
const blockHash='0x'+'ab'.repeat(32),transactionHash='0x'+'cd'.repeat(32),otherHash='0x'+'ef'.repeat(32);
function event(abi,eventName,address,args,index){const definition=abi.find(e=>e.type==='event'&&e.name===eventName);return {address,topics:encodeEventTopics({abi,eventName,args}),data:encodeAbiParameters(definition.inputs.filter(i=>!i.indexed),definition.inputs.filter(i=>!i.indexed).map(i=>args[i.name])),blockNumber:1000n,blockHash,transactionHash,transactionIndex:0,logIndex:index,removed:false};}
function fixture(overrides={}){
  const a=input.action,entry={transactionHash,gas:'1691616',gasPrice:'50000000',maxFeeWei:'84580800000000',nonce:9,status:'SUBMITTED'};
  const receipt={transactionHash,blockHash,blockNumber:1000n,transactionIndex:0,from:a.from,to:a.to,status:'success',contractAddress:null,gasUsed:1400000n,effectiveGasPrice:50000000n,cumulativeGasUsed:1400000n,logs:[
    event(input.factoryAbi,'PoolCreated',a.to,{vault:a.pool,creator:a.from,template:a.template,configHash:a.configHash,termsHash:a.termsHash,round:1n,salt:a.salt,orderPayload:input.session.pool.payload},0),
    event(input.vaultAbi,'VaultInitialized',a.pool,{factory:a.to,creator:a.from,configHash:a.configHash,termsHash:a.termsHash,payload:input.session.pool.payload},1),
  ]};
  const tx={hash:transactionHash,chainId:56,blockHash,blockNumber:1000n,from:a.from,to:a.to,value:0n,input:a.data,nonce:9,gas:1691616n,gasPrice:50000000n};
  const state={isPool:true,state:0,soldCount:0n,fundedWei:0n,totalPrincipalIn:0n,ownerOf:input.session.seller,factory:a.to,creator:a.from,configHash:a.configHash,termsHash:a.termsHash,purchasePayload:input.session.pool.payload,marketValidator:input.manifest.template.validator.address};
  let receiptReads=0;
  const client={getChainId:async()=>56,request:async()=> 'Geth/v1',getTransactionReceipt:async()=>{receiptReads++;return receipt;},getTransaction:async()=>tx,getBlock:async()=>({number:1000n,hash:blockHash}),getBlockNumber:async()=>1014n,getCode:async()=>cloneRuntime(a.template),readContract:async({functionName})=>state[functionName],...overrides};
  const options={identityCheck:async()=>({status:'MOCK_IDENTITY_MATCH'}),postconditions:async()=>({verified:true})};
  return {entry,receipt,tx,state,client,options,receiptReads:()=>receiptReads};
}
test('canonical receipt is fetched once, saved before business checks, and used for all events',async()=>{
  const f=fixture(),sequence=[];
  const result=await verifyCreated(f.client,input,f.entry,{...f.options,onReceipt:async evidence=>{sequence.push('save');assert.equal(evidence.receipt.blockHash,blockHash);assert.equal(evidence.actualGasFeeWei,'70000000000000');},postconditions:async(_client,_command,_target,_actor,_args,receipt)=>{sequence.push('business');assert.equal(receipt.blockHash,blockHash);return {verified:true};}});
  assert.equal(result.status,'CONFIRMED');assert.equal(result.after.registered,true);assert.equal(result.after.state,0);assert.equal(f.receiptReads(),1);assert.deepEqual(sequence,['save','business']);
});
test('14 confirmations cannot produce business success or saved canonical evidence',async()=>{
  const f=fixture({getBlockNumber:async()=>1013n});let saves=0;
  await assert.rejects(()=>verifyCreated(f.client,input,f.entry,{...f.options,onReceipt:async()=>{saves++;}}),/WAITING_CONFIRMATIONS/);assert.equal(saves,0);
});
test('business failure retains the already validated receipt callback',async()=>{
  const f=fixture();let saves=0;f.state.totalPrincipalIn=1n;
  await assert.rejects(()=>verifyCreated(f.client,input,f.entry,{...f.options,onReceipt:async()=>{saves++;}}),/CREATE_INITIAL_FUNDING_STATE_MISMATCH/);assert.equal(saves,1);
});
for(const [field,value] of [['nonce',10],['gas',1691617n],['gasPrice',50000001n]])test(`receipt rejects changed transaction ${field}`,async()=>{
  const f=fixture();f.tx[field]=value;await assert.rejects(()=>verifyCreated(f.client,input,f.entry,f.options),/CREATE_RECEIPT_FROZEN_FIELDS_CHANGED/);
});
test('receipt gas cost cannot exceed the reviewed cap',async()=>{
  const f=fixture();f.receipt.gasUsed=1691617n;await assert.rejects(()=>verifyCreated(f.client,input,f.entry,f.options),/CREATE_RECEIPT_FROZEN_FIELDS_CHANGED/);
});
test('a later canonical hash change prevents success',async()=>{
  let calls=0;const f=fixture({getBlock:async()=>({number:1000n,hash:++calls<=2?blockHash:otherHash})});await assert.rejects(()=>verifyCreated(f.client,input,f.entry,f.options),/CREATE_RECEIPT_BLOCK_CHANGED/);
});
test('wrong clone runtime never passes after PoolCreated',async()=>{
  const f=fixture({getCode:async()=> '0x6000'});await assert.rejects(()=>verifyCreated(f.client,input,f.entry,f.options),/CREATE_CLONE_RUNTIME_MISMATCH/);
});
for(const [field,value] of [['isPool',false],['state',2],['soldCount',1n],['fundedWei',1n],['ownerOf',input.action.pool]])test(`created pool rejects unexpected ${field}`,async()=>{
  const f=fixture();f.state[field]=value;await assert.rejects(()=>verifyCreated(f.client,input,f.entry,f.options),/CREATE_INITIAL_FUNDING_STATE_MISMATCH/);
});
test('wrong immutable validator is rejected',async()=>{
  const f=fixture();f.state.marketValidator=input.action.pool;await assert.rejects(()=>verifyCreated(f.client,input,f.entry,f.options),/CREATE_VAULT_IDENTITY_MISMATCH/);
});
