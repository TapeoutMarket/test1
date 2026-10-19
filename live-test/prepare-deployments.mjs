#!/usr/bin/env node
// Produces unsigned CREATE requests only. The imported RPC transport rejects writes and signatures.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodeDeployData, encodeFunctionData, getAddress, getContractAddress, keccak256, parseAbi, zeroAddress} from 'viem';
import {readOnlyClientFromEnv, saveObservation, json, ROOT, ACCOUNTS} from './preflight.mjs';
import {verificationRoots, sha} from '../scripts/release-files.mjs';
import {inspectGovernance, assessGovernance} from './inspect-governance.mjs';

const NAMES = ['GroupBuyVault', 'GovernanceTimelock', 'GroupBuyFactory', 'ERC1967Proxy'];
const HASH = /^0x[0-9a-fA-F]{64}$/;
const same = (a,b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const need = (ok,reason) => {if (!ok) throw new Error(reason);};
const uint = value => {need(/^(0|[1-9][0-9]*)$/.test(String(value)), 'INVALID_UNSIGNED_INTEGER'); return BigInt(value);};
const address = value => {need(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && !same(value,zeroAddress), 'INVALID_ADDRESS');return getAddress(value.toLowerCase());};
const hasCode = value => typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})+$/.test(value);

/** Pure builder: all external observations and artifacts are supplied by the caller. */
export function buildUnsignedDeploymentPlan({session, artifacts, observation, verificationInputHash, sessionHash}) {
  need(session.chainId === 56 && observation.chainId === 56, 'CHAIN_ID_MISMATCH');
  need(/^[0-9a-f]{64}$/.test(verificationInputHash) && verificationInputHash === session.coreVerificationInputHash, 'CORE_VERIFICATION_HASH_MISMATCH');
  need(HASH.test(sessionHash) && HASH.test(observation.checkpoint.blockHash), 'INVALID_PINNED_HASH');
  const creator = address(session.contributions.find(item => item.role === 'creator')?.address);
  need(same(creator,ACCOUNTS.creator), 'UNEXPECTED_CREATOR');
  const multisig = address(session.governance.multisig), guardian = address(session.governance.guardian);
  const delay = uint(session.governance.minimumDelaySeconds);
  need(delay > 0n && delay < 2n ** 256n, 'POSITIVE_TIMELOCK_DELAY_REQUIRED');
  need(!same(multisig,guardian) && !same(creator,guardian), 'GUARDIAN_MUST_BE_INDEPENDENT');
  const startNonce = uint(observation.latestNonce);
  need(startNonce === uint(observation.pendingNonce) && startNonce === uint(observation.checkpointNonce), 'CREATOR_NONCE_UNSTABLE_OR_PENDING');
  need(startNonce + 3n <= BigInt(Number.MAX_SAFE_INTEGER), 'NONCE_OUT_OF_RANGE');
  need(observation.creatorCode === undefined || observation.creatorCode === '0x', 'CREATOR_MUST_BE_PLAIN_EOA');
  const safe = observation.multisig;
  need(same(safe.address,multisig) && hasCode(safe.code) && Array.isArray(safe.owners), 'MULTISIG_IDENTITY_UNAVAILABLE');
  const owners = safe.owners.map(address), threshold = uint(safe.threshold);
  need(new Set(owners.map(a=>a.toLowerCase())).size === owners.length && threshold >= 2n && threshold <= BigInt(owners.length), 'INVALID_MULTISIG_THRESHOLD_OR_OWNERS');
  const review=observation.governanceReview;
  need(review?.currentConfigurationAcceptedForPreparation===true && assessGovernance(review), 'MULTISIG_FULL_CONFIGURATION_NOT_ACCEPTED');
  need(same(review.address,multisig) && same(review.codeHash,keccak256(safe.code)) && same(review.checkpoint.blockHash,observation.checkpoint.blockHash), 'MULTISIG_REVIEW_CHECKPOINT_OR_IDENTITY_MISMATCH');
  const sameOwners=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&JSON.stringify(a.map(x=>address(x).toLowerCase()).sort())===JSON.stringify(b.map(x=>address(x).toLowerCase()).sort());
  need(sameOwners(owners,session.governance.owners) && threshold===uint(session.governance.threshold) && sameOwners(owners,review.getters.getOwners.value) && threshold===uint(review.getters.getThreshold.value), 'MULTISIG_OWNERS_OR_THRESHOLD_CHANGED');
  need(same(keccak256(safe.code),session.governance.multisigCodeHash) && same(review.implementation.address,session.governance.implementation) && same(review.implementation.codeHash,session.governance.implementationCodeHash), 'MULTISIG_CODE_IDENTITY_CHANGED');
  const predicted = Object.fromEntries(NAMES.map((name,i) => [name,getContractAddress({from:creator,nonce:startNonce+BigInt(i)})]));
  need(!same(predicted.GovernanceTimelock,multisig) && !same(predicted.GovernanceTimelock,guardian), 'GOVERNANCE_ADDRESS_OVERLAP');
  const initializeData = encodeFunctionData({abi:artifacts.GroupBuyFactory.abi,functionName:'initialize',args:[predicted.GovernanceTimelock,guardian,delay]});
  const constructors = [[],[delay,[multisig],[multisig]],[],[predicted.GroupBuyFactory,initializeData]];
  const transactions = NAMES.map((name,i) => {
    const artifact = artifacts[name];
    need(artifact && Array.isArray(artifact.abi) && hasCode(artifact.bytecode?.object), 'INVALID_DEPLOYMENT_ARTIFACT');
    const data = encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode.object,args:constructors[i]});
    return {step:i+1,name,expectedContractAddress:predicted[name],constructorArguments:constructors[i],artifactCreationBytecodeHash:keccak256(artifact.bytecode.object),initCodeHash:keccak256(data),unsignedTransaction:{chainId:56,from:creator,to:null,nonce:Number(startNonce)+i,value:'0',data},gas:{status:i===3?'NOT_ESTIMATED_DEPENDENCIES_NOT_DEPLOYED':'NOT_ESTIMATED'}};
  });
  return {
    schemaVersion:1,status:'UNSIGNED_DEPLOYMENT_PLAN_NOT_EXECUTED',chainId:56,sessionHash,verificationInputHash,
    checkpoint:observation.checkpoint,creator,nonceObservation:{checkpoint:observation.checkpointNonce,latest:observation.latestNonce,pending:observation.pendingNonce},
    governance:{multisig:{address:multisig,codeHash:keccak256(safe.code),owners,threshold,safeNonce:safe.nonce},timelock:predicted.GovernanceTimelock,minimumDelaySeconds:delay,proposers:[multisig],executors:[multisig],guardian,externalBootstrapAdministrator:zeroAddress},
    expectedAddresses:predicted,transactions,proxyInitialization:{atomic:true,implementation:predicted.GroupBuyFactory,data:initializeData,upgradeAdmin:predicted.GovernanceTimelock,guardian,requiredMinimumDelay:delay},
    laterGovernance:{status:'NOT_PREPARED',operations:['scheduleBatch','wait at least configured minimum delay','executeBatch'],configurationActions:['approveTemplate','approveConfig','selectConfiguration','resumeCreation']},
    gasBudget:{status:'INCOMPLETE_PROXY_AND_LIFECYCLE_NOT_ESTIMATED',maximumTransactionFeeWei:session.maximumTransactionFeeWei??null,maximumTotalGasSpendWei:session.maximumTotalGasSpendWei??null,approvalOrReleaseGateSet:false},
    reviewedLiveManifest:false,readyToSign:false,mainnetTransactionsSent:0,orderSignaturesCreated:0,privateKeysConsumed:false,
    invalidationRules:[
      'Before the first signature, compare latest and pending creator nonce with the recorded starting nonce. Any difference invalidates this entire unsigned bundle: regenerate and review it.',
      'Submit sequentially only after the user independently reviews and signs; each prior deployment must have a successful canonical receipt at its predicted address. An intervening transaction, failed deployment, or changed session/source/artifact/governance invalidates the remaining package.',
      'Proxy gas and initialization must be simulated against the actually deployed dependencies before signing step 4; this preparation deliberately does not override chain state.',
      'Recheck chain checkpoint, current Safe code/owners/threshold, protocol identities and gas before signing. This package is not the reviewed live manifest and does not enable any live release gate.',
    ],
  };
}

async function readConfined(relative) {
  const target = path.resolve(ROOT,relative);
  need(target.startsWith(ROOT+path.sep) && await fs.realpath(target) === target, 'INPUT_PATH_OR_SYMLINK_REFUSED');
  return fs.readFile(target);
}
export async function currentVerificationHash() {
  const names=[];
  async function walk(relative) {
    const stat=await fs.lstat(path.join(ROOT,relative));need(!stat.isSymbolicLink(),'SOURCE_SYMLINK_REFUSED');
    if(stat.isDirectory())for(const name of (await fs.readdir(path.join(ROOT,relative))).sort())await walk(path.posix.join(relative,name));else names.push(relative);
  }
  for(const root of verificationRoots)await walk(root);
  const records=[];for(const relative of names.sort()){const contents=await readConfined(relative);records.push({path:relative,sha256:sha(contents),bytes:contents.length});}
  return sha(JSON.stringify(records));
}
export async function loadArtifacts() {
  const result={};
  for(const name of NAMES){
    const artifact=JSON.parse(await readConfined(`out/${name}.sol/${name}.json`));
    need(artifact.metadata?.compiler?.version?.startsWith('0.8.24+') && artifact.metadata?.settings?.evmVersion==='paris', 'UNREVIEWED_ARTIFACT_COMPILER');
    const sources=Object.entries(artifact.metadata?.sources??{});need(sources.length>0,'ARTIFACT_SOURCES_UNAVAILABLE');
    for(const [source,identity] of sources)need(same(keccak256(await readConfined(source)),identity.keccak256),'STALE_ARTIFACT_SOURCE');
    result[name]=artifact;
  }
  return result;
}
const safeAbi=parseAbi(['function getOwners() view returns(address[])','function getThreshold() view returns(uint256)','function nonce() view returns(uint256)']);
export async function observeAndPrepare(client,{session,sessionHash,artifacts,verificationInputHash,baseline},governanceInspector=inspectGovernance) {
  const [chainId,version]=await Promise.all([client.getChainId(),client.request({method:'web3_clientVersion'})]);
  need(chainId===56 && typeof version==='string' && version.length>0 && !/anvil|hardhat|ganache|testrpc/i.test(version),'MAINNET_IDENTITY_REJECTED');
  const block=await client.getBlock({blockTag:'latest'});need(block.number!==null&&HASH.test(block.hash),'CHECKPOINT_UNAVAILABLE');
  // The governance inspector normally chooses finalized; pin all of its reads to this
  // preparation checkpoint instead so modules/guards and owner reads share one state.
  const governanceReview=await governanceInspector({...client,getBlock:args=>client.getBlock(args.blockTag==='finalized'?{blockNumber:block.number}:args)});
  need(governanceReview.currentConfigurationAcceptedForPreparation===true,'MULTISIG_FULL_CONFIGURATION_NOT_ACCEPTED');
  const at={blockNumber:block.number}, creator=ACCOUNTS.creator, multisig=address(session.governance.multisig);
  const readSafe=functionName=>client.readContract({address:multisig,abi:safeAbi,functionName,...at});
  const [checkpointNonce,latestNonce,pendingNonce,creatorCode,safeCode,owners,threshold,safeNonce,historical,gasPrice,identities]=await Promise.all([
    client.getTransactionCount({address:creator,...at}),client.getTransactionCount({address:creator,blockTag:'latest'}),client.getTransactionCount({address:creator,blockTag:'pending'}),client.getCode({address:creator,...at}),client.getCode({address:multisig,...at}),readSafe('getOwners'),readSafe('getThreshold'),readSafe('nonce'),client.getBlock({blockNumber:BigInt(baseline.blockNumber)}),client.getGasPrice(),
    Promise.all(baseline.codeIdentities.map(async item=>{const code=await client.getCode({address:item.address,...at});need(hasCode(code)&&same(keccak256(code),item.codeHash),'PROTOCOL_RUNTIME_CHANGED');return {field:item.field,address:item.address,codeHash:keccak256(code)};})),
  ]);
  need(same(historical.hash,baseline.blockHash),'HISTORICAL_CHECKPOINT_MISMATCH');
  const observation={chainId,checkpoint:{blockNumber:block.number,blockHash:block.hash,timestamp:block.timestamp},checkpointNonce,latestNonce,pendingNonce,creatorCode,governanceReview,multisig:{address:multisig,code:safeCode,owners,threshold,nonce:safeNonce}};
  const report=buildUnsignedDeploymentPlan({session,sessionHash,artifacts,observation,verificationInputHash});
  report.observedAt=new Date().toISOString();report.governanceIdentityReview=governanceReview;report.protocolRuntimeIdentities=identities;report.historicalCheckpoint={blockNumber:baseline.blockNumber,blockHash:baseline.blockHash,matched:true};report.gasPriceWei=gasPrice;
  for(const tx of report.transactions){
    const code=await client.getCode({address:tx.expectedContractAddress,...at});need(!code||code==='0x','PREDICTED_ADDRESS_ALREADY_HAS_CODE');
    if(tx.step===4)continue;
    try{const estimated=await client.estimateGas({account:creator,data:tx.unsignedTransaction.data,value:0n,...at});const buffered=(estimated*120n+99n)/100n;tx.gas={status:'ESTIMATED_READ_ONLY',estimate:estimated,with20PercentBuffer:buffered,estimatedFeeAtObservedGasPriceWei:buffered*gasPrice};}
    catch{tx.gas={status:'NOT_ESTIMATED',reason:'READ_ONLY_ESTIMATE_FAILED_DETAILS_REDACTED'};}
  }
  const [recheckBlock,recheckLatest,recheckPending]=await Promise.all([client.getBlock({blockNumber:block.number}),client.getTransactionCount({address:creator,blockTag:'latest'}),client.getTransactionCount({address:creator,blockTag:'pending'})]);
  need(same(recheckBlock.hash,block.hash),'CHECKPOINT_CHANGED');need(recheckLatest===latestNonce&&recheckPending===pendingNonce,'CREATOR_NONCE_CHANGED_REGENERATE_BUNDLE');
  report.gasBudget.estimatedFirstThreeFeeWei=report.transactions.slice(0,3).every(tx=>tx.gas.status==='ESTIMATED_READ_ONLY')?report.transactions.slice(0,3).reduce((sum,tx)=>sum+tx.gas.estimatedFeeAtObservedGasPriceWei,0n):null;
  return report;
}
export async function main(argv=process.argv.slice(2)) {
  try{
    need(argv.length===2&&argv[0]==='--env'&&typeof argv[1]==='string'&&!argv[1].startsWith('--'),'EXPLICIT_ENV_ARGUMENT_ONLY');
    const raw=await readConfined('live-test/SESSION_PLAN.json'),session=JSON.parse(raw),sessionHash=keccak256(raw);
    const verificationInputHash=await currentVerificationHash();need(verificationInputHash===session.coreVerificationInputHash,'CORE_VERIFICATION_HASH_MISMATCH');
    const artifacts=await loadArtifacts(),baseline=JSON.parse(await readConfined('reports/authorized-source-observation.json'));
    const report=await observeAndPrepare(await readOnlyClientFromEnv(argv[1]),{session,sessionHash,artifacts,verificationInputHash,baseline});
    need(same(keccak256(await readConfined('live-test/SESSION_PLAN.json')),sessionHash)&&await currentVerificationHash()===verificationInputHash,'LOCAL_INPUT_CHANGED_REGENERATE_BUNDLE');
    const file=await saveObservation('unsigned-deployments',report);
    console.log(json({status:report.status,reportFile:file,checkpoint:report.checkpoint,verificationInputHash,governance:report.governance,transactions:report.transactions.map(({step,name,expectedContractAddress,initCodeHash,unsignedTransaction,gas})=>({step,name,expectedContractAddress,initCodeHash,nonce:unsignedTransaction.nonce,gas})),laterGovernance:report.laterGovernance,gasBudget:report.gasBudget,reviewedLiveManifest:false,readyToSign:false,mainnetTransactionsSent:0}));return 0;
  }catch(error){console.error(json({status:'NOT_PREPARED',reason:error.constructor===Error&&/^[A-Z_]+$/.test(error.message)?error.message:'PREPARATION_FAILED_DETAILS_REDACTED',mainnetTransactionsSent:0}));return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;});
