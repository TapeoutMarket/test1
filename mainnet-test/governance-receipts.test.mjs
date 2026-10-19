import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {encodeAbiParameters,encodeEventTopics,encodeFunctionData,keccak256,stringToHex,toHex,zeroAddress} from 'viem';
import {BOUND_BUNDLE_FILE,safeAbi,verifyInputs,matchTimelockEvents,decodeSafeCall,matchSafeReceipt,parseArguments} from './governance-receipts.mjs';
const bundle=JSON.parse(await fs.readFile(BOUND_BUNDLE_FILE));
const timelockAbi=JSON.parse(await fs.readFile('out/GovernanceTimelock.sol/GovernanceTimelock.json')).abi;
const txHash='0x'+'12'.repeat(32),blockHash='0x'+'34'.repeat(32),safeTxHash='0x'+'56'.repeat(32),relayer='0x7000000000000000000000000000000000000007';
function eventLog(abi,eventName,args,index,address){
  const spec=abi.find(x=>x.type==='event'&&x.name===eventName);return {address,topics:encodeEventTopics({abi,eventName,args}),data:encodeAbiParameters(spec.inputs.filter(x=>!x.indexed),spec.inputs.filter(x=>!x.indexed).map(x=>args[x.name])),transactionHash:txHash,blockHash,blockNumber:100n,transactionIndex:0,logIndex:index,removed:false};
}
function timelockLogs(kind='CallScheduled'){
  return bundle.batch.targets.map((target,index)=>eventLog(timelockAbi,kind,{id:bundle.operationId,index:BigInt(index),target,value:0n,data:bundle.batch.payloads[index],predecessor:bundle.batch.predecessor,delay:600n},index,bundle.addresses.timelock));
}
function outerData(method='scheduleBatch',overrides={}){
  const base={to:bundle.addresses.timelock,value:0n,data:method==='scheduleBatch'?bundle.scheduleData:bundle.executeData,operation:0,safeTxGas:0n,baseGas:0n,gasPrice:0n,gasToken:zeroAddress,refundReceiver:zeroAddress,signatures:'0x'+'11'.repeat(130),...overrides};
  return encodeFunctionData({abi:safeAbi,functionName:'execTransaction',args:safeAbi.find(x=>x.name==='execTransaction').inputs.map(x=>base[x.name])});
}
function receiptFixture(method='scheduleBatch'){
  const tx={hash:txHash,to:bundle.safe,from:relayer,value:0n,input:outerData(method)};
  const receipt={status:'success',transactionHash:txHash,to:bundle.safe,from:relayer,blockHash,blockNumber:100n,logs:[...timelockLogs(method==='scheduleBatch'?'CallScheduled':'CallExecuted'),eventLog(safeAbi,'ExecutionSuccess',{txHash:safeTxHash,payment:0n},4,bundle.safe)]};
  return {tx,receipt,bundle,method,timelockAbi};
}
test('matching all four Timelock events proves each target, zero value, ordered payload and schedule delay',()=>{
  for(const kind of ['CallScheduled','CallExecuted']){const matches=matchTimelockEvents(timelockLogs(kind).reverse(),{bundle,timelockAbi,kind});assert.deepEqual(matches.map(x=>x.index),[0,1,2,3]);assert.ok(matches.every(x=>x.operationId===bundle.operationId&&x.valueWei===0n));}
});
test('altered targets, payloads, delay, duplicate indexes and split transactions fail receipt matching',()=>{
  const spec=timelockAbi.find(x=>x.name==='CallScheduled');
  for(const args of [{target:relayer},{value:1n},{data:'0x1234'},{delay:1n}]){const logs=timelockLogs();logs[0]=eventLog(timelockAbi,'CallScheduled',{id:bundle.operationId,index:0n,target:bundle.batch.targets[0],value:0n,data:bundle.batch.payloads[0],predecessor:bundle.batch.predecessor,delay:600n,...args},0,bundle.addresses.timelock);assert.throws(()=>matchTimelockEvents(logs,{bundle,timelockAbi,kind:'CallScheduled'}));}
  const duplicate=timelockLogs();duplicate[3]=duplicate[2];assert.throws(()=>matchTimelockEvents(duplicate,{bundle,timelockAbi,kind:'CallScheduled'}),/DUPLICATE_BATCH_EVENT_INDEX/);
  const split=timelockLogs();split[3].transactionHash=safeTxHash;assert.throws(()=>matchTimelockEvents(split,{bundle,timelockAbi,kind:'CallScheduled'}),/BATCH_EVENTS_SPLIT_ACROSS_TRANSACTIONS/);
  assert.throws(()=>matchTimelockEvents(timelockLogs().slice(1),{bundle,timelockAbi,kind:'CallScheduled'}),/EXACTLY_FOUR_MATCHING_TIMELOCK_EVENTS_REQUIRED/);
});
test('direct Safe execTransaction calldata must bind exactly the scheduled or executed Timelock request',()=>{
  for(const method of ['scheduleBatch','executeBatch']){const result=decodeSafeCall(outerData(method),{bundle,method});assert.equal(result.innerCall.method,method);assert.equal(result.innerCall.to,bundle.addresses.timelock);assert.equal(result.innerCall.valueWei,0n);assert.equal(result.wrapper,null);assert.equal(result.signatureBytes,130);}
  assert.throws(()=>decodeSafeCall(outerData('executeBatch'),{bundle,method:'scheduleBatch'}),/SAFE_TIMELOCK_CALLDATA_MISMATCH/);
  for(const overrides of [{to:relayer},{value:1n},{operation:2}])assert.throws(()=>decodeSafeCall(outerData('scheduleBatch',overrides),{bundle,method:'scheduleBatch'}));
});
test('one-call MultiSend Safe wrapper is decoded, while trailing extra calls and nested delegatecall are refused',()=>{
  const packed=(operation=0)=>toHex(operation,{size:1})+bundle.addresses.timelock.slice(2).toLowerCase()+toHex(0n,{size:32}).slice(2)+toHex(BigInt((bundle.scheduleData.length-2)/2),{size:32}).slice(2)+bundle.scheduleData.slice(2);
  const abi=[{type:'function',name:'multiSend',stateMutability:'payable',inputs:[{name:'transactions',type:'bytes'}],outputs:[]}];
  const data=encodeFunctionData({abi,functionName:'multiSend',args:[packed()]});
  const input=outerData('scheduleBatch',{to:relayer,data,operation:1}),result=decodeSafeCall(input,{bundle,method:'scheduleBatch'});assert.equal(result.wrapper.numberOfCalls,1);assert.equal(result.wrapper.address,relayer);assert.equal(result.innerCall.to.toLowerCase(),bundle.addresses.timelock.toLowerCase());
  const bad=encodeFunctionData({abi,functionName:'multiSend',args:[packed()+packed().slice(2)]});assert.throws(()=>decodeSafeCall(outerData('scheduleBatch',{to:relayer,data:bad,operation:1}),{bundle,method:'scheduleBatch'}),/SINGLE_EXACT_MULTISEND_CALL_REQUIRED/);
  const nested=encodeFunctionData({abi,functionName:'multiSend',args:[packed(1)]});assert.throws(()=>decodeSafeCall(outerData('scheduleBatch',{to:relayer,data:nested,operation:1}),{bundle,method:'scheduleBatch'}),/SAFE_CALL_MUST_TARGET_TIMELOCK_WITH_ZERO_VALUE/);
});
test('receipt proof includes outer relayer-to-Safe, inner Timelock data and Safe ExecutionSuccess hash',()=>{
  for(const method of ['scheduleBatch','executeBatch']){const proof=matchSafeReceipt(receiptFixture(method));assert.equal(proof.outer.from,relayer);assert.equal(proof.outer.to,bundle.safe);assert.equal(proof.safeExecution.safeTransactionHash,safeTxHash);assert.equal(proof.events.length,4);assert.equal(proof.decoded.innerCall.method,method);}
});
test('Safe 1.4.1 ExecutionSuccess RPC layout has txHash in topic1 and only payment in its 32-byte data',()=>{
  // Construct the observed RPC layout independently of safeAbi/eventLog, so an
  // accidental removal of indexed cannot silently change this regression fixture.
  const f=receiptFixture();f.receipt.logs[4]={address:bundle.safe,topics:[keccak256(stringToHex('ExecutionSuccess(bytes32,uint256)')),safeTxHash],data:toHex(42n,{size:32}),transactionHash:txHash,blockHash,blockNumber:100n,transactionIndex:0,logIndex:4,removed:false};
  const proof=matchSafeReceipt(f);assert.equal(proof.safeExecution.safeTransactionHash,safeTxHash);assert.equal(proof.safeExecution.payment,42n);
  const wrong=receiptFixture();wrong.receipt.logs[4].topics.pop();wrong.receipt.logs[4].data=encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[safeTxHash,42n]);assert.throws(()=>matchSafeReceipt(wrong));
});
test('missing/wrong-address Safe success, failed outer receipt and mismatched scanned log blocks fail closed',()=>{
  for(const mutate of [f=>f.receipt.logs.pop(),f=>f.receipt.logs.at(-1).address=relayer,f=>f.receipt.status='reverted',f=>f.tx.to=relayer,f=>f.receipt.logs[0].blockHash=txHash]){const f=receiptFixture();mutate(f);assert.throws(()=>matchSafeReceipt(f));}
});
test('actual local completed inspection binds operation, config and the immutable deployment session',async()=>{
  const inspection=JSON.parse(await fs.readFile('live-test/observations/governance-inspection-1792420701946.json')),state=JSON.parse(await fs.readFile('live-test/deployment-state.json')),sessionHash=keccak256(await fs.readFile('live-test/SESSION_PLAN.json'));
  const evidence={inspection,bundle,state,sessionHash,timelockAbi};assert.equal(verifyInputs(evidence).operationId,bundle.operationId);
  for(const mutate of [e=>e.inspection.operationId=txHash,e=>e.inspection.status='SCHEDULE_REQUIRED',e=>e.bundle.batch.values[0]='1',e=>e.bundle.sessionHash=txHash]){const altered=structuredClone(evidence);mutate(altered);assert.throws(()=>verifyInputs(altered));}
});
test('CLI only accepts explicit env and inspection paths; write flags fail before any network access',()=>{
  assert.deepEqual(parseArguments(['--env','../.env','--inspection','a.json']),{env:'../.env',inspection:'a.json'});
  for(const args of [[],['--env','../.env'],['--env','../.env','--inspection','a.json','--broadcast']]){const r=spawnSync(process.execPath,['mainnet-test/governance-receipts.mjs',...args],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stderr).mainnetTransactionsSent,0);assert.equal(r.stdout,'');}
});
