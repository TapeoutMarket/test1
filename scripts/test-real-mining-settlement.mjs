#!/usr/bin/env node
/** Diagnostic against real protocol state on a fresh local fork. No .env, keys, signatures or source writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, parseEventLogs, keccak256, toHex } from 'viem';
import { demand, ForkError, expectedSession, verifyAnvil, readRPC } from './fork-lan-common.mjs';
import { verificationHash } from './release-files.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MINING_ABI = parseAbi(['function minerKey(address,uint256) view returns(bytes32)','function pending(bytes32) view returns(uint256)','function claim(bytes32)']);
const BEM_ABI = parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)','event Transfer(address indexed from,address indexed to,uint256 value)']);
const NFT_ABI = parseAbi(['function ownerOf(uint256) view returns(address)']);
const serialize = v => JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2)+'\n';
const same = (a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const sha = bytes=>createHash('sha256').update(bytes).digest('hex');
function loopback(raw) { const u=new URL(raw);demand(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/', 'EXPLICIT_LOOPBACK_ORIGIN_REQUIRED');return u; }
async function confined(relative) {const p=path.join(ROOT,relative);demand(await fs.realpath(p)===p,'PUBLIC_FILE_BOUNDARY');return p;}
async function readPublic(relative) {const file=await confined(relative),bytes=await fs.readFile(file);return {value:JSON.parse(bytes),path:relative,sha256:sha(bytes)};}
function revertEvidence(error) {
  for(let i=0;i<10&&error&&typeof error==='object';i++,error=error.cause){
    const data=typeof error.data==='string'?error.data:error.data?.raw;
    if(typeof data==='string'&&/^0x[\da-f]*$/i.test(data)&&data.length<=65538)return {revertData:data,...(typeof error.data?.errorName==='string'&&/^[A-Za-z0-9_]+$/.test(error.data.errorName)?{errorName:error.data.errorName}:{})};
  }
  return {revertData:null,details:'REVERT_OR_RPC_FAILURE_DETAILS_REDACTED'};
}
export async function main(argv=process.argv.slice(2)) {
  if(!argv.length||argv.length===1&&argv[0]==='--help'){
    console.log('PREPARED_NOT_EXECUTED. Explicit diagnostic: node scripts/test-real-mining-settlement.mjs --run\nRequires a fresh local Anvil fork at exactly reports/authorized-source-observation.json block/hash and RUNNING deployments/fork/56/local-session.json.\nClaims real Mining rewards twice only on the fork, with a 3600-second local time advance, and performs an immediate same-block zero-pending eth_call.\nNo .env/private keys/source writes; snapshots are restored on exit. Original diagnostic is preserved; a new immutable report path is printed.');return 0;
  }
  demand(argv.length===1&&argv[0]==='--run','EXPLICIT_RUN_REQUIRED');demand(await fs.realpath(process.cwd())===await fs.realpath(ROOT),'RUN_FROM_REPOSITORY_ROOT');
  const originalInputHash=verificationHash(),report={schemaVersion:1,scope:'REAL_BSC_STATE_LOCAL_MINING_SETTLEMENT_DIAGNOSTIC',status:'IN_PROGRESS',startedAt:new Date().toISOString(),verificationInputHash:originalInputHash,privateKeysRead:false,loadedEnvFile:false,realSignaturesProduced:false,mainnetTransactions:0,sourceRPCWrites:0,nativeBalanceFunding:'LOCAL_ANVIL_ONLY',steps:[],receiptsAreForkOnly:true,cleanup:{status:'NOT_STARTED'},limitations:['Fresh local fork of real source state; no mainnet transaction is sent.','pending() is an observation, not assumed to equal the amount materialized by claim().','The immediate zero-pending call is eth_call at the exact first receipt block, not a mined transaction.','Snapshot restoration removes diagnostic transactions from the final local fork state.','This receipt experiment does not replace source-code or independent security audit.']};
  let reportPath,lock,client,wallet,sourceClient,actor,manifest,observation,snapshot,impersonated=false,identity,execution,source,ownsReport=false;
  const save=async()=>{if(ownsReport)await fs.writeFile(reportPath,serialize(report),{mode:0o600});};
  const verify=async()=>verifyAnvil(execution,identity,{},false,source.href);
  try {
    await fs.mkdir('.runtime',{recursive:true});demand(await fs.realpath('.runtime')===path.join(ROOT,'.runtime'),'RUNTIME_DIRECTORY_BOUNDARY');
    lock=await fs.open('.runtime/real-mining-settlement.lock','wx',0o600);
    const observationFile=await readPublic('reports/authorized-source-observation.json'),manifestFile=await readPublic('deployments/fork/56/local-session.json');
    observation=observationFile.value;manifest=manifestFile.value;
    demand(observation.status==='READ_ONLY_SOURCE_OBSERVED'&&observation.chainId===56&&manifest.status==='RUNNING'&&manifest.chainId===56,'PUBLIC_FORK_IDENTITY_INVALID');
    demand(String(manifest.forkBlockNumber)===String(observation.blockNumber)&&same(manifest.forkBlockHash,observation.blockHash),'SOURCE_PIN_IDENTITY_MISMATCH');
    execution=loopback(manifest.executionRPCURL);source=loopback(manifest.sourceProxyURL);demand(execution.href!==source.href,'SOURCE_EXECUTION_MUST_DIFFER');
    identity=expectedSession(manifest.instanceId,manifest.forkBlockNumber,manifest.forkBlockHash);await verify();
    actor=observation.accounts?.HOLDER_A;demand(/^0x[\da-f]{40}$/i.test(actor??''),'PUBLIC_ACTOR_INVALID');
    report.sourcePin={chainId:56,number:observation.blockNumber,hash:observation.blockHash};report.hostInstanceId=manifest.instanceId;report.actor=actor;report.contracts={collection:observation.collection,tokenId:observation.tokenId,mining:observation.mining,bem:observation.bem};report.inputs=[{path:observationFile.path,sha256:observationFile.sha256},{path:manifestFile.path,sha256:manifestFile.sha256}];
    const directory=path.join(ROOT,'reports');demand(await fs.realpath(directory)===directory,'REPORT_DIRECTORY_BOUNDARY');
    reportPath=path.join(directory,`real-mining-settlement-${manifest.instanceId}-${Date.now()}.json`);const output=await fs.open(reportPath,'wx',0o600);await output.close();ownsReport=true;await save();
    // Preserve the historical discovery report byte-for-byte; never overwrite it or an existing different backup.
    try {
      const original=await confined('reports/mining-settlement-diagnostic.json'),bytes=await fs.readFile(original),digest=sha(bytes),backup=path.join(directory,`mining-settlement-diagnostic-original-${digest.slice(0,16)}.json`);
      try {await fs.writeFile(backup,bytes,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;demand(!(await fs.lstat(backup)).isSymbolicLink()&&sha(await fs.readFile(backup))===digest,'ORIGINAL_DIAGNOSTIC_BACKUP_MISMATCH');}
      report.originalDiagnostic={path:'reports/mining-settlement-diagnostic.json',sha256:digest,preserved:true,backup:path.relative(ROOT,backup)};await save();
    }catch(error){if(error.code!=='ENOENT')throw error;report.originalDiagnostic={status:'NOT_PRESENT_NO_OVERWRITE'};}
    client=createPublicClient({transport:http(execution.href,{retryCount:0,timeout:20000}),cacheTime:0,pollingInterval:100});wallet=createWalletClient({transport:http(execution.href,{retryCount:0,timeout:20000})});sourceClient=createPublicClient({transport:http(source.href,{retryCount:0,timeout:20000}),cacheTime:0});
    const pin=BigInt(observation.blockNumber),sourceBlock=await readRPC(source,'eth_getBlockByNumber',[toHex(pin),false]);
    demand(sourceBlock&&BigInt(sourceBlock.number)===pin&&same(sourceBlock.hash,observation.blockHash),'SOURCE_BLOCK_HASH_MISMATCH');demand(await readRPC(source,'eth_chainId')==='0x38','SOURCE_CHAIN_ID_MISMATCH');
    const latest=await client.getBlock({blockTag:'latest'});demand(latest.number===pin&&same(latest.hash,observation.blockHash),'FRESH_FORK_REQUIRED_NO_PRIOR_TRANSACTIONS_OR_TIME_ADVANCE');
    const mining={address:observation.mining,abi:MINING_ABI},bem={address:observation.bem,abi:BEM_ABI},nft={address:observation.collection,abi:NFT_ABI};
    const key=await client.readContract({...mining,functionName:'minerKey',args:[observation.collection,BigInt(observation.tokenId)],blockNumber:pin});demand(same(key,observation.minerKey),'MINER_KEY_MISMATCH');report.minerKey=key;
    const [forkOwner,sourceOwner]=await Promise.all([client.readContract({...nft,functionName:'ownerOf',args:[BigInt(observation.tokenId)],blockNumber:pin}),sourceClient.readContract({...nft,functionName:'ownerOf',args:[BigInt(observation.tokenId)],blockNumber:pin})]);demand(same(forkOwner,actor)&&same(sourceOwner,actor),'ACTOR_MUST_OWN_MINER_AT_PIN');
    report.runtimeChecks=[];
    for(const field of['collection','mining','bem']){
      const expected=observation.codeIdentities.find(x=>x.field===field);demand(expected?.codeHash,'OBSERVED_CODE_HASH_MISSING');
      const [forkCode,sourceCode]=await Promise.all([client.getCode({address:observation[field],blockNumber:pin}),sourceClient.getCode({address:observation[field],blockNumber:pin})]);
      demand(forkCode&&sourceCode&&same(keccak256(forkCode),expected.codeHash)&&same(keccak256(sourceCode),expected.codeHash),'REAL_PROTOCOL_RUNTIME_HASH_MISMATCH');report.runtimeChecks.push({field,address:observation[field],codeHash:expected.codeHash,sourceAndForkMatch:true});
    }
    const freshReads=async(c)=>({pending:await c.readContract({...mining,functionName:'pending',args:[key],blockNumber:pin}),bem:await c.readContract({...bem,functionName:'balanceOf',args:[actor],blockNumber:pin}),native:await c.getBalance({address:actor,blockNumber:pin}),nonce:await c.getTransactionCount({address:actor,blockNumber:pin})});
    const [forkInitial,sourceInitial]=await Promise.all([freshReads(client),freshReads(sourceClient)]);demand(serialize(forkInitial)===serialize(sourceInitial),'FRESH_FORK_RELEVANT_ACCOUNT_OR_MINING_STATE_MISMATCH');
    report.freshForkVerified=true;report.initialStateMatchesSource={fork:forkInitial,source:sourceInitial};report.sourceBlockHashVerified=true;report.bemDecimals=await client.readContract({...bem,functionName:'decimals',blockNumber:pin});await save();
    snapshot=await client.request({method:'evm_snapshot'});report.cleanup.snapshotId=snapshot;await save();
    await verify();await client.request({method:'anvil_impersonateAccount',params:[actor]});impersonated=true;await client.request({method:'anvil_setBalance',params:[actor,toHex(100n*10n**18n)]});
    const observe=async(blockNumber)=>{
      const block=blockNumber===undefined?await client.getBlock({blockTag:'latest'}):await client.getBlock({blockNumber});
      const [pending,balance]=await Promise.all([client.readContract({...mining,functionName:'pending',args:[key],blockNumber:block.number}),client.readContract({...bem,functionName:'balanceOf',args:[actor],blockNumber:block.number})]);
      demand(same((await client.getBlock({blockNumber:block.number})).hash,block.hash),'OBSERVATION_BLOCK_CHANGED');return {blockNumber:block.number,blockHash:block.hash,timestamp:block.timestamp,pendingRaw:pending,bemRaw:balance};
    };
    const claim=async label=>{
      await verify();const before=await observe(),step={label,status:'PREPARED',before};report.steps.push(step);await save();
      const hash=await wallet.writeContract({...mining,functionName:'claim',args:[key],account:actor,chain:null,gas:2000000n,gasPrice:await client.getGasPrice()});step.status='SUBMITTED_LOCAL_FORK';step.transactionHash=hash;await save();
      const receipt=await client.waitForTransactionReceipt({hash,timeout:60000});step.receipt=receipt;await save();
      demand(receipt.status==='success'&&same(receipt.from,actor)&&same(receipt.to,observation.mining),'CLAIM_RECEIPT_FAILED_OR_IDENTITY_MISMATCH');demand(same((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash),'CLAIM_RECEIPT_BLOCK_CHANGED');
      const after=await observe(receipt.blockNumber),inflow=after.bemRaw-before.bemRaw;
      const transfers=parseEventLogs({abi:BEM_ABI,eventName:'Transfer',logs:receipt.logs.filter(log=>same(log.address,observation.bem))});
      const incoming=transfers.filter(log=>same(log.args.to,actor)).reduce((sum,log)=>sum+log.args.value,0n),outgoing=transfers.filter(log=>same(log.args.from,actor)).reduce((sum,log)=>sum+log.args.value,0n);
      demand(inflow>=0n&&incoming-outgoing===inflow,'BEM_BALANCE_EVENT_DELTA_MISMATCH');Object.assign(step,{status:'PASS',after,actualInflowRaw:inflow,bemTransferEvents:transfers,transferNetRaw:incoming-outgoing});await save();return step;
    };
    console.log('MINING_DIAGNOSTIC_PHASE first-claim');const first=await claim('first-claim');demand(first.actualInflowRaw>0n,'FIRST_CLAIM_NOT_POSITIVE');
    // Use the exact already-mined receipt block, so wall-clock delay cannot create a different test timestamp.
    console.log('MINING_DIAGNOSTIC_PHASE immediate-same-block-zero-claim');await verify();
    const zeroBefore=await observe(first.receipt.blockNumber);demand(zeroBefore.pendingRaw===0n,'SAME_BLOCK_PENDING_NOT_ZERO');
    const immediate={label:'immediate-same-block-zero-pending-eth-call',method:'eth_call',blockNumber:first.receipt.blockNumber,blockHash:first.receipt.blockHash,pendingRaw:zeroBefore.pendingRaw,from:actor,to:observation.mining,transactionsSent:0};
    try {
      const result=await client.request({method:'eth_call',params:[{from:actor,to:observation.mining,data:encodeFunctionData({abi:MINING_ABI,functionName:'claim',args:[key]})},toHex(first.receipt.blockNumber)]});immediate.status='SUCCESS';immediate.returnData=result;
    }catch(error){const evidence=revertEvidence(error);immediate.status=evidence.revertData!==null?'REVERTED':'RPC_ERROR_UNVERIFIED';Object.assign(immediate,evidence);}
    const zeroAfter=await observe(first.receipt.blockNumber);demand(zeroAfter.bemRaw===zeroBefore.bemRaw&&zeroAfter.pendingRaw===zeroBefore.pendingRaw&&same(zeroAfter.blockHash,zeroBefore.blockHash),'ETH_CALL_MUTATED_STATE');immediate.persistentStateUnchanged=true;report.immediateZeroClaim=immediate;await save();demand(immediate.status!=='RPC_ERROR_UNVERIFIED','IMMEDIATE_ZERO_CLAIM_RESULT_UNVERIFIED');
    console.log('MINING_DIAGNOSTIC_PHASE advance-local-time-and-second-claim');await verify();await client.request({method:'evm_increaseTime',params:[3600]});await client.request({method:'evm_mine'});report.localTimeAdvanceSeconds=3600;
    const second=await claim('second-claim-after-3600-seconds');demand(second.before.pendingRaw===0n,'SECOND_PENDING_NOT_ZERO_DIAGNOSTIC_VARIANT_CHANGED');demand(second.actualInflowRaw>0n,'ZERO_PENDING_DID_NOT_MATERIALIZE_POSITIVE_REWARD');
    report.observation={pendingZeroCanStillProducePositiveClaim:true,secondPendingBeforeRaw:second.before.pendingRaw,secondActualInflowRaw:second.actualInflowRaw,conclusion:'This real Mining implementation can settle positive BEM during claim() despite a prior pending()==0. Do not skip claim solely because pending() reads zero.',immediateSameBlockClaimStatus:immediate.status};
    const sourceAgain=await readRPC(source,'eth_getBlockByNumber',[toHex(pin),false]);demand(same(sourceAgain.hash,observation.blockHash),'SOURCE_PIN_CHANGED_DURING_DIAGNOSTIC');
    report.status='PASS';report.completedAt=new Date().toISOString();
  }catch(error){report.status='FAIL';report.reasonCode=error instanceof ForkError?error.code:'MINING_DIAGNOSTIC_FAILED_DETAILS_REDACTED';report.failedAt=new Date().toISOString();}
  finally {
    if(client){
      let stopped=!impersonated,restored=snapshot===undefined;
      if(impersonated)try{await verify();await client.request({method:'anvil_stopImpersonatingAccount',params:[actor]});stopped=true;}catch{}
      if(snapshot!==undefined)try{await verify();restored=await client.request({method:'evm_revert',params:[snapshot]})===true;}catch{}
      let freshAfter=false;if(restored&&snapshot!==undefined)try{const block=await client.getBlock({blockTag:'latest'});freshAfter=block.number===BigInt(observation.blockNumber)&&same(block.hash,observation.blockHash);}catch{}
      report.cleanup={...report.cleanup,impersonationStopped:stopped,snapshotRestored:restored,freshForkStateRestored:freshAfter,status:stopped&&restored&&(snapshot===undefined||freshAfter)?'PASS':'FAIL'};
      if(report.cleanup.status==='FAIL')report.status='FAIL';report.receiptCanonicalityAfterCleanup=snapshot!==undefined&&restored?'TRANSACTIONS_REVERTED_BY_LOCAL_SNAPSHOT_AFTER_EVIDENCE_CAPTURE':'CHECK_CLEANUP_REPORT';
    }
    report.verificationInputHashAfter=verificationHash();if(report.status==='PASS'&&report.verificationInputHashAfter!==originalInputHash){report.status='FAIL';report.reasonCode='VERIFICATION_INPUTS_CHANGED_DURING_DIAGNOSTIC';}
    try{await save();}finally{if(lock){await lock.close();await fs.unlink('.runtime/real-mining-settlement.lock').catch(()=>{});}}
  }
  console.log(serialize({status:report.status,report:reportPath?path.relative(ROOT,reportPath):null,reasonCode:report.reasonCode,observation:report.observation,immediateZeroClaim:report.immediateZeroClaim,cleanup:report.cleanup,mainnetTransactions:0,sourceRPCWrites:0}));return report.status==='PASS'?0:1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{process.exitCode=await main();}catch(error){console.error(error instanceof ForkError?error.code:'MINING_DIAGNOSTIC_SETUP_FAILED');process.exitCode=1;}}
