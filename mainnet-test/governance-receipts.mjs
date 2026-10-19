#!/usr/bin/env node
// Read-only receipt evidence for the already deployed, session-bound governance batch.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeEventLog,decodeFunctionData,encodeAbiParameters,encodeFunctionData,keccak256,parseAbi,stringToHex,formatEther,zeroHash} from 'viem';
import {ROOT,readOnlyClientFromEnv,json} from '../live-test/preflight.mjs';
import {verifyReceipt} from '../live-test/verify-receipt.mjs';
import {readConfined,configurationHash} from '../live-test/governance.mjs';

export const BOUND_BUNDLE_FILE='live-test/observations/governance-bundle-1792417534419.json';
const HASH=/^0x[0-9a-fA-F]{64}$/;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const need=(ok,reason)=>{if(!ok)throw new Error(reason);};
const successTopic=keccak256(stringToHex('ExecutionSuccess(bytes32,uint256)'));
const scheduledTopic=keccak256(stringToHex('CallScheduled(bytes32,uint256,address,uint256,bytes,bytes32,uint256)'));
const executedTopic=keccak256(stringToHex('CallExecuted(bytes32,uint256,address,uint256,bytes)'));
export const safeAbi=parseAbi([
  'function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns(bool success)',
  // Safe v1.4.1 source: https://raw.githubusercontent.com/safe-global/safe-smart-account/v1.4.1/contracts/Safe.sol
  // txHash is indexed (topic1); only payment occupies the log data word.
  'event ExecutionSuccess(bytes32 indexed txHash,uint256 payment)',
]);
const multiSendAbi=parseAbi(['function multiSend(bytes transactions) payable']);

export function verifyInputs({inspection,bundle,state,sessionHash,timelockAbi}){
  need(inspection.chainId===56&&inspection.status==='ALREADY_EXECUTED'&&inspection.operation?.stateName==='DONE'&&inspection.creationPaused===false,'COMPLETED_MAINNET_INSPECTION_REQUIRED');
  need(bundle.chainId===56&&state.chainId===56&&state.status==='DEPLOYED_UNCONFIGURED'&&state.steps?.length===4&&state.steps.every(x=>x.status==='CONFIRMED'),'FOUR_CONFIRMED_DEPLOYMENTS_REQUIRED');
  need(HASH.test(sessionHash)&&same(bundle.sessionHash,sessionHash)&&same(inspection.sessionHash,sessionHash)&&same(state.sessionHash,sessionHash),'SESSION_BINDING_MISMATCH');
  need(inspection.verificationInputHash===state.verificationInputHash&&inspection.bootstrapToolHash===state.bootstrapToolHash,'DEPLOYMENT_INSPECTION_SOURCE_MISMATCH');
  for(const name of ['factory','template','timelock'])need(same(bundle.addresses[name],state.addresses[name])&&same(bundle.addresses[name],inspection.deploymentEvidence?.addresses?.[name]),'DEPLOYMENT_ADDRESS_BINDING_MISMATCH');
  need(same(bundle.safe,inspection.governance?.address)&&same(bundle.operationId,inspection.operationId)&&same(bundle.configHash,inspection.configHash)&&same(inspection.selectedTemplate,bundle.addresses.template)&&same(inspection.selectedConfigHash,bundle.configHash),'GOVERNANCE_INSPECTION_BINDING_MISMATCH');
  need(configurationHash(bundle.config)===bundle.configHash&&configurationHash(inspection.configuration)===bundle.configHash,'CONFIG_HASH_MISMATCH');
  const schedule=decodeFunctionData({abi:timelockAbi,data:bundle.scheduleData}),execute=decodeFunctionData({abi:timelockAbi,data:bundle.executeData});
  need(schedule.functionName==='scheduleBatch'&&execute.functionName==='executeBatch','UNEXPECTED_TIMELOCK_METHOD');
  const canonical=value=>json(value);
  need(canonical(schedule.args.slice(0,5))===canonical(execute.args)&&schedule.args[5]===600n,'BATCH_INPUTS_OR_DELAY_MISMATCH');
  const [targets,values,payloads,predecessor,salt]=execute.args;
  need(targets.length===4&&values.length===4&&payloads.length===4&&targets.every(x=>same(x,bundle.addresses.factory))&&values.every(x=>x===0n)&&predecessor===zeroHash,'EXPECTED_ZERO_VALUE_FOUR_CALL_BATCH_REQUIRED');
  need(canonical({targets,values,payloads,predecessor,salt})===canonical(bundle.batch),'BUNDLE_BATCH_AND_CALLDATA_MISMATCH');
  const operationId=keccak256(encodeAbiParameters(timelockAbi.find(x=>x.name==='hashOperationBatch').inputs,execute.args));need(operationId===bundle.operationId,'OPERATION_HASH_MISMATCH');
  for(const call of [schedule,execute])need(encodeFunctionData({abi:timelockAbi,functionName:call.functionName,args:call.args})===(call.functionName==='scheduleBatch'?bundle.scheduleData:bundle.executeData),'CALLDATA_REENCODING_MISMATCH');
  return {operationId,targets,values,payloads,predecessor,salt,delay:600n};
}

export function matchTimelockEvents(logs,{bundle,timelockAbi,kind}){
  need(['CallScheduled','CallExecuted'].includes(kind),'UNSUPPORTED_EVENT_KIND');
  const topic=kind==='CallScheduled'?scheduledTopic:executedTopic;
  const relevant=logs.filter(log=>same(log.address,bundle.addresses.timelock)&&same(log.topics?.[0],topic)&&same(log.topics?.[1],bundle.operationId));
  need(relevant.length===4,'EXACTLY_FOUR_MATCHING_TIMELOCK_EVENTS_REQUIRED');
  const output=relevant.map(log=>{
    need(!log.removed&&HASH.test(log.transactionHash)&&HASH.test(log.blockHash)&&typeof log.blockNumber==='bigint'&&Number.isInteger(log.logIndex),'INVALID_CANONICAL_LOG_FIELDS');
    const decoded=decodeEventLog({abi:timelockAbi,data:log.data,topics:log.topics,strict:true}),a=decoded.args,index=Number(a.index);
    need(decoded.eventName===kind&&Number.isSafeInteger(index)&&index>=0&&index<4,'INVALID_BATCH_EVENT_INDEX');
    need(same(a.id,bundle.operationId)&&same(a.target,bundle.batch.targets[index])&&a.value===BigInt(bundle.batch.values[index])&&same(a.data,bundle.batch.payloads[index]),'BATCH_EVENT_TARGET_VALUE_OR_PAYLOAD_MISMATCH');
    if(kind==='CallScheduled')need(same(a.predecessor,bundle.batch.predecessor)&&a.delay===600n,'SCHEDULE_EVENT_PREDECESSOR_OR_DELAY_MISMATCH');
    return {kind,index,operationId:a.id,target:a.target,valueWei:a.value,payload:a.data,payloadHash:keccak256(a.data),predecessor:kind==='CallScheduled'?a.predecessor:undefined,delaySeconds:kind==='CallScheduled'?a.delay:undefined,transactionHash:log.transactionHash,blockNumber:log.blockNumber,blockHash:log.blockHash,logIndex:log.logIndex};
  }).sort((a,b)=>a.index-b.index);
  need(new Set(output.map(x=>x.index)).size===4,'DUPLICATE_BATCH_EVENT_INDEX');
  need(output.every(x=>same(x.transactionHash,output[0].transactionHash)&&same(x.blockHash,output[0].blockHash)&&x.blockNumber===output[0].blockNumber),'BATCH_EVENTS_SPLIT_ACROSS_TRANSACTIONS');
  return output;
}

function unpackSingleMultiSend(data){
  const call=decodeFunctionData({abi:multiSendAbi,data});need(call.functionName==='multiSend','UNKNOWN_SAFE_WRAPPER');
  const packed=call.args[0].slice(2);need(packed.length>=170,'INVALID_MULTISEND_PAYLOAD');
  const operation=Number.parseInt(packed.slice(0,2),16),to='0x'+packed.slice(2,42),value=BigInt('0x'+packed.slice(42,106)),length=BigInt('0x'+packed.slice(106,170));
  need(length<=BigInt(Number.MAX_SAFE_INTEGER)&&170n+length*2n===BigInt(packed.length),'SINGLE_EXACT_MULTISEND_CALL_REQUIRED');
  return {operation,to,value,data:'0x'+packed.slice(170)};
}
export function decodeSafeCall(input,{bundle,method}){
  need(['scheduleBatch','executeBatch'].includes(method),'UNEXPECTED_TIMELOCK_METHOD');
  const outer=decodeFunctionData({abi:safeAbi,data:input});need(outer.functionName==='execTransaction','SAFE_EXEC_TRANSACTION_REQUIRED');
  const [to,value,data,operation,safeTxGas,baseGas,gasPrice,gasToken,refundReceiver,signatures]=outer.args;
  let call={to,value,data,operation},wrapper=null;
  if(operation===1){call=unpackSingleMultiSend(data);wrapper={address:to,operation:'DELEGATECALL',method:'multiSend',numberOfCalls:1,runtimeProvenance:'NOT_SOURCE_VERIFIED_BY_THIS_RECEIPT_COLLECTOR'};}
  need(call.operation===0&&same(call.to,bundle.addresses.timelock)&&call.value===0n,'SAFE_CALL_MUST_TARGET_TIMELOCK_WITH_ZERO_VALUE');
  const expected=method==='scheduleBatch'?bundle.scheduleData:bundle.executeData;need(same(call.data,expected),'SAFE_TIMELOCK_CALLDATA_MISMATCH');
  need(value===0n,'SAFE_WRAPPER_VALUE_MUST_BE_ZERO');
  return {method:'execTransaction',to,valueWei:value,operation,innerCall:{to:call.to,valueWei:call.value,operation:call.operation,method,data:call.data,dataHash:keccak256(call.data)},wrapper,safeGas:{safeTxGas,baseGas,gasPriceWei:gasPrice,gasToken,refundReceiver},signatureBytes:(signatures.length-2)/2,signatureVerification:'ExecutionSuccess is on-chain Safe acceptance; this collector does not independently recover/verify individual signatures'};
}
export function matchSafeReceipt({tx,receipt,bundle,method,timelockAbi}){
  need(receipt.status==='success'&&same(tx.hash,receipt.transactionHash)&&same(tx.to,bundle.safe)&&same(receipt.to,bundle.safe)&&same(tx.from,receipt.from)&&tx.value===0n,'OUTER_SAFE_TRANSACTION_IDENTITY_MISMATCH');
  const decoded=decodeSafeCall(tx.input,{bundle,method});
  const successes=receipt.logs.filter(log=>same(log.address,bundle.safe)&&same(log.topics?.[0],successTopic));
  need(successes.length===1,'ONE_SAFE_EXECUTION_SUCCESS_REQUIRED');
  need(!successes[0].removed&&same(successes[0].transactionHash,tx.hash)&&successes[0].blockNumber===receipt.blockNumber&&same(successes[0].blockHash,receipt.blockHash),'SAFE_SUCCESS_LOG_IDENTITY_MISMATCH');
  const success=decodeEventLog({abi:safeAbi,data:successes[0].data,topics:successes[0].topics,strict:true});
  need(success.eventName==='ExecutionSuccess'&&HASH.test(success.args.txHash),'INVALID_SAFE_EXECUTION_SUCCESS');
  const events=matchTimelockEvents(receipt.logs,{bundle,timelockAbi,kind:method==='scheduleBatch'?'CallScheduled':'CallExecuted'});
  need(events.every(e=>same(e.transactionHash,tx.hash)&&e.blockNumber===receipt.blockNumber&&same(e.blockHash,receipt.blockHash)),'RECEIPT_TIMELOCK_LOG_IDENTITY_MISMATCH');
  return {outer:{transactionHash:tx.hash,from:tx.from,to:tx.to,valueWei:tx.value,calldataHash:keccak256(tx.input)},safeExecution:{address:bundle.safe,safeTransactionHash:success.args.txHash,payment:success.args.payment,paymentToken:decoded.safeGas.gasToken,logIndex:successes[0].logIndex},decoded,events};
}

function groupByTransaction(logs){const groups=new Map();for(const log of logs){need(HASH.test(log.transactionHash),'LOG_TRANSACTION_HASH_MISSING');const key=log.transactionHash.toLowerCase();groups.set(key,[...(groups.get(key)??[]),log]);}return [...groups.values()];}
export async function collectGovernanceReceipts(client,{inspection,bundle,state,timelockAbi}){
  const [chainId,version]=await Promise.all([client.getChainId(),client.request({method:'web3_clientVersion'})]);need(chainId===56&&typeof version==='string'&&!/anvil|hardhat|ganache|testrpc/i.test(version),'MAINNET_IDENTITY_REJECTED');
  const checkpointNumber=BigInt(inspection.checkpoint.blockNumber),checkpoint=await client.getBlock({blockNumber:checkpointNumber});need(same(checkpoint.hash,inspection.checkpoint.blockHash),'INSPECTION_CHECKPOINT_NOT_CANONICAL');
  const start=BigInt(state.steps.find(x=>x.name==='GovernanceTimelock').receipt.blockNumber);need(checkpointNumber>=start&&checkpointNumber-start<=1_000_000n,'GOVERNANCE_SCAN_RANGE_OUT_OF_BOUNDS');
  const at={blockNumber:checkpointNumber};
  for(const [address,codeHash]of [[bundle.addresses.timelock,inspection.runtime.timelock],[bundle.safe,inspection.governance.codeHash]]){const code=await client.getCode({address,...at});need(code&&code!=='0x'&&same(keccak256(code),codeHash),'OBSERVED_GOVERNANCE_RUNTIME_MISMATCH');}
  const logs={CallScheduled:[],CallExecuted:[]};
  for(const kind of Object.keys(logs))for(let from=start;from<=checkpointNumber;from+=2000n){const to=from+1999n>checkpointNumber?checkpointNumber:from+1999n;logs[kind].push(...await client.getLogs({address:bundle.addresses.timelock,event:timelockAbi.find(x=>x.type==='event'&&x.name===kind),args:{id:bundle.operationId},fromBlock:from,toBlock:to,strict:true}));}
  const scheduled=groupByTransaction(logs.CallScheduled).map(group=>matchTimelockEvents(group,{bundle,timelockAbi,kind:'CallScheduled'}));
  const executed=groupByTransaction(logs.CallExecuted).map(group=>matchTimelockEvents(group,{bundle,timelockAbi,kind:'CallExecuted'}));
  need(executed.length===1,'ONE_COMPLETED_OPERATION_REQUIRED');const execution=executed[0];
  const candidates=scheduled.filter(events=>events[0].blockNumber<execution[0].blockNumber).sort((a,b)=>a[0].blockNumber===b[0].blockNumber?a[0].logIndex-b[0].logIndex:a[0].blockNumber<b[0].blockNumber?-1:1);need(candidates.length>0,'PRIOR_MATCHING_SCHEDULE_REQUIRED');const schedule=candidates.at(-1);
  const receipts=[];
  for(const [method,events]of [['scheduleBatch',schedule],['executeBatch',execution]]){
    const transactionHash=events[0].transactionHash,tx=await client.getTransaction({hash:transactionHash});
    const report=await verifyReceipt(client,{transactionHash,from:tx.from,to:bundle.safe,valueWei:'0',dataHash:keccak256(tx.input),minimumConfirmations:15});need(report.status==='RECEIPT_MATCHED_BUSINESS_UNVERIFIED','SAFE_RECEIPT_IDENTITY_OR_CONFIRMATIONS_FAILED');
    const receipt=await client.getTransactionReceipt({hash:transactionHash}),proof=matchSafeReceipt({tx,receipt,bundle,method,timelockAbi}),block=await client.getBlock({blockNumber:receipt.blockNumber});
    need(same(block.hash,receipt.blockHash)&&same(receipt.blockHash,events[0].blockHash),'SAFE_RECEIPT_BLOCK_CHANGED');
    need(json(proof.events)===json(events),'LOG_SCAN_AND_RECEIPT_EVENTS_DISAGREE');
    receipts.push({method,...proof,receipt:{status:receipt.status,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,timestamp:block.timestamp,gasUsed:receipt.gasUsed,effectiveGasPriceWei:receipt.effectiveGasPrice,feeWei:report.actualGas.feeWei,feeBNB:formatEther(report.actualGas.feeWei),confirmations:report.confirmations.observed}});
  }
  const delay=receipts[1].receipt.timestamp-receipts[0].receipt.timestamp;need(delay>=600n,'EXECUTION_BEFORE_CONFIRMED_DELAY');
  const done=await client.readContract({address:bundle.addresses.timelock,abi:timelockAbi,functionName:'isOperationDone',args:[bundle.operationId],...at});need(done===true,'OPERATION_NOT_DONE_AT_INSPECTION');
  need(same((await client.getBlock({blockNumber:checkpointNumber})).hash,checkpoint.hash),'INSPECTION_CHECKPOINT_CHANGED');
  return {schemaVersion:1,status:'MAINNET_GOVERNANCE_RECEIPTS_VERIFIED',scope:'READ_ONLY_SAFE_AND_TIMELOCK_RECEIPT_EVIDENCE',chainId:56,checkpoint:inspection.checkpoint,operationId:bundle.operationId,configHash:bundle.configHash,safe:bundle.safe,timelock:bundle.addresses.timelock,factory:bundle.addresses.factory,operationDone:true,scheduleToExecutionSeconds:delay,scheduleTransactionHash:receipts[0].outer.transactionHash,executeTransactionHash:receipts[1].outer.transactionHash,priorMatchingScheduleTransactionHashes:candidates.slice(0,-1).map(x=>x[0].transactionHash),transactions:receipts,mainnetTransactionsSent:0,privateKeysConsumed:false,safeServiceRequests:0,limitations:['This collector proves exact Timelock payloads and Safe acceptance from canonical receipts. It does not independently recover every Safe owner signature.','A successful Safe receipt is not evidence of later NFT purchase, reward distribution or redemption.','Evidence is pinned to the supplied inspection checkpoint; later governance changes require a new inspection.']};
}

export function parseArguments(argv){
  const values={};for(let i=0;i<argv.length;i++){need(['--env','--inspection'].includes(argv[i])&&!values[argv[i]]&&argv[i+1]&&!argv[i+1].startsWith('--'),'EXPLICIT_ENV_AND_INSPECTION_ONLY');values[argv[i]]=argv[++i];}
  need(values['--env']&&values['--inspection'],'EXPLICIT_ENV_AND_INSPECTION_ONLY');return {env:values['--env'],inspection:values['--inspection']};
}
async function saveReport(report){
  const directory=path.join(ROOT,'mainnet-test','observations');await fs.mkdir(directory,{recursive:true});need(await fs.realpath(directory)===directory,'REPORT_SYMLINK_REFUSED');const file=path.join(directory,`governance-receipts-${Date.now()}.json`);await fs.writeFile(file,json(report),{flag:'wx',mode:0o600});return file;
}
export async function main(argv=process.argv.slice(2)){
  try{
    const args=parseArguments(argv),inspectionRaw=await readConfined(args.inspection),bundleRaw=await readConfined(BOUND_BUNDLE_FILE),stateRaw=await readConfined('live-test/deployment-state.json'),sessionRaw=await readConfined('live-test/SESSION_PLAN.json');
    const inspection=JSON.parse(inspectionRaw),bundle=JSON.parse(bundleRaw),state=JSON.parse(stateRaw),timelockAbi=JSON.parse(await readConfined('out/GovernanceTimelock.sol/GovernanceTimelock.json')).abi;
    verifyInputs({inspection,bundle,state,sessionHash:keccak256(sessionRaw),timelockAbi});
    const report=await collectGovernanceReceipts(await readOnlyClientFromEnv(args.env),{inspection,bundle,state,timelockAbi});
    report.inputEvidence={inspection:{path:args.inspection,keccak256:keccak256(inspectionRaw)},governanceBundle:{path:BOUND_BUNDLE_FILE,keccak256:keccak256(bundleRaw)},deploymentState:{path:'live-test/deployment-state.json',keccak256:keccak256(stateRaw)},sessionHash:keccak256(sessionRaw)};
    const file=await saveReport(report);console.log(json({status:report.status,reportFile:file,operationId:report.operationId,scheduleTransactionHash:report.scheduleTransactionHash,executeTransactionHash:report.executeTransactionHash,scheduleToExecutionSeconds:report.scheduleToExecutionSeconds,transactions:report.transactions.map(t=>({method:t.method,hash:t.outer.transactionHash,from:t.outer.from,to:t.outer.to,feeBNB:t.receipt.feeBNB})),mainnetTransactionsSent:0}));return 0;
  }catch(error){console.error(json({status:'NOT_VERIFIED',reason:error.constructor===Error&&/^[A-Z_]+$/.test(error.message)?error.message:'GOVERNANCE_RECEIPT_READ_OR_DECODE_FAILED_DETAILS_REDACTED',mainnetTransactionsSent:0}));return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;});
