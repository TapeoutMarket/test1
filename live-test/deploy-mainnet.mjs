#!/usr/bin/env node
// This entrypoint is for the human operator. Default mode is read-only.
// Signing/broadcast requires a real terminal, explicit gates and exact per-step confirmation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {createPublicClient,createWalletClient,custom,http,keccak256,parseEther,formatEther,parseAbi,stringToHex,zeroAddress,zeroHash} from 'viem';
import {guardedProvider,saveObservation,json,ROOT,ACCOUNTS} from './preflight.mjs';
import {currentVerificationHash,loadArtifacts,buildUnsignedDeploymentPlan} from './prepare-deployments.mjs';
import {inspectGovernance,assessGovernance} from './inspect-governance.mjs';
import {verifyReceipt} from './verify-receipt.mjs';
import {readConfinedJson,writeAtomic,acquireDeploymentLock,readBudget,reserveBudget,bootstrapToolHash,validateBudget} from './deployment-io.mjs';

export const STATE_FILE='live-test/deployment-state.json';
const need=(ok,code)=>{if(!ok)throw new Error(code);};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const role=name=>keccak256(stringToHex(name));
const HEX=/^0x[0-9a-fA-F]{64}$/;
const UINT=/^(0|[1-9][0-9]*)$/;
const CONFIRMATIONS=15;
const STEP_STATUSES=new Set(['RESERVED_BEFORE_SIGNATURE','SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN','SUBMITTED','CONFIRMED']);
export function argumentsFor(argv) {
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const options={}, switches=new Set(['--broadcast','--reconcile']);
  const fields=new Set(['--env','--bundle','--rehearsal','--step','--reviewed-bundle-hash','--max-tx-fee-bnb','--max-total-spend-bnb']);
  for(let i=0;i<argv.length;i++){
    const key=argv[i];need(!Object.hasOwn(options,key),'DUPLICATE_ARGUMENT');
    if(switches.has(key))options[key]=true;
    else {need(fields.has(key)&&argv[i+1]&&!argv[i+1].startsWith('--'),'INVALID_ARGUMENT');options[key]=argv[++i];}
  }
  for(const key of ['--env','--bundle','--rehearsal','--step'])need(options[key],'MISSING_REQUIRED_ARGUMENT');
  need(/^[1-4]$/.test(options['--step']),'STEP_MUST_BE_1_TO_4');
  need(!(options['--broadcast']&&options['--reconcile']),'BROADCAST_AND_RECONCILE_ARE_EXCLUSIVE');
  if(options['--broadcast'])need(HEX.test(options['--reviewed-bundle-hash']??''),'REVIEWED_BUNDLE_HASH_REQUIRED');
  return {envFile:options['--env'],bundleFile:options['--bundle'],rehearsalFile:options['--rehearsal'],step:Number(options['--step']),broadcast:!!options['--broadcast'],reconcile:!!options['--reconcile'],reviewedBundleHash:options['--reviewed-bundle-hash'],maxTx:options['--max-tx-fee-bnb'],maxTotal:options['--max-total-spend-bnb']};
}
export function positiveBNB(value) {
  need(typeof value==='string'&&/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?$/.test(value),'EXPLICIT_POSITIVE_BNB_BUDGET_REQUIRED');
  const wei=parseEther(value);need(wei>0n,'EXPLICIT_POSITIVE_BNB_BUDGET_REQUIRED');return wei;
}
export function humanGates(options,env,tty) {
  need(options.broadcast&&tty===true,'HUMAN_INTERACTIVE_TERMINAL_REQUIRED');
  need(env.MODE==='live'&&env.ALLOW_LIVE_SEND==='true','MODE_LIVE_AND_ALLOW_LIVE_SEND_REQUIRED');
  need(env.LIVE_RELEASE_VERIFIED==='true','USER_RELEASE_REVIEW_FLAG_REQUIRED');
  return {maxTxWei:positiveBNB(options.maxTx),maxTotalWei:positiveBNB(options.maxTotal)};
}
async function onlyEnvFields(file,names) {
  const actual=await fs.realpath(path.resolve(file));need(actual.startsWith(path.dirname(ROOT)+path.sep),'ENV_OUTSIDE_WORKSPACE');
  const text=await fs.readFile(actual,'utf8');const result={};
  for(const name of names){const rows=text.split(/\r?\n/).filter(row=>new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=').test(row));need(rows.length===1,'ONE_REQUIRED_ENV_ASSIGNMENT_EXPECTED');result[name]=parseEnv(rows[0])[name];}
  return result;
}
export function assertRpcUnchanged(frozen,current){
  need(typeof frozen==='string'&&frozen===current,'RPC_CONFIGURATION_CHANGED');
  let url;try{url=new URL(frozen);}catch{throw new Error('REMOTE_MAINNET_RPC_REQUIRED');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  need(['http:','https:'].includes(url.protocol)&&!url.hash&&host!=='localhost'&&!host.endsWith('.localhost')&&!/^127\./.test(host)&&!['0.0.0.0','[::]','[::1]'].includes(host)&&!/^\[::ffff:(?:127\.|7f)/i.test(host),'REMOTE_MAINNET_RPC_REQUIRED');
}
export async function assertFreshNonce(client,expectedNonce){
  need(Number.isSafeInteger(expectedNonce)&&expectedNonce>=0,'INVALID_EXPECTED_NONCE');
  const [latest,pending]=await Promise.all([client.getTransactionCount({address:ACCOUNTS.creator,blockTag:'latest'}),client.getTransactionCount({address:ACCOUNTS.creator,blockTag:'pending'})]);
  need(latest===expectedNonce&&pending===expectedNonce,'NONCE_CHANGED_OR_PENDING_STOP');
}
function frozenReadOnlyClient(url){
  assertRpcUnchanged(url,url);
  return createPublicClient({transport:custom(guardedProvider(http(url,{retryCount:0,timeout:20000})({})),{retryCount:0})});
}
async function loadState(){try{return (await readConfinedJson(STATE_FILE)).value;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export function validateRehearsal(bundle,rehearsal,{bundleHash,sessionHash,toolHash}) {
  need(rehearsal.status==='PASS'&&rehearsal.scope==='LOCAL_FORK_DEPLOYMENT_REHEARSAL'&&rehearsal.cleanup?.status==='PASS','PASS_REHEARSAL_WITH_CLEANUP_REQUIRED');
  need(same(rehearsal.bundleHash,bundleHash)&&same(rehearsal.sessionHash,sessionHash)&&rehearsal.verificationInputHash===bundle.verificationInputHash&&rehearsal.bootstrapToolHash===toolHash,'REHEARSAL_INPUT_HASH_MISMATCH');
  need(String(rehearsal.sourceCheckpoint.blockNumber)===String(bundle.checkpoint.blockNumber)&&same(rehearsal.sourceCheckpoint.blockHash,bundle.checkpoint.blockHash),'REHEARSAL_CHECKPOINT_MISMATCH');
  need(Array.isArray(rehearsal.deployments)&&rehearsal.deployments.length===4,'FOUR_REHEARSED_DEPLOYMENTS_REQUIRED');
  for(const tx of bundle.transactions){const r=rehearsal.deployments.find(x=>x.step===tx.step);need(r&&same(r.address,tx.expectedContractAddress)&&same(r.initCodeHash,tx.initCodeHash)&&HEX.test(r.runtimeCodeHash),'REHEARSED_TRANSACTION_MISMATCH');}
}
async function inputs(options){
  const [{value:bundle,raw:bundleRaw},{value:rehearsal,raw:rehearsalRaw},{value:session,raw:sessionRaw}]=await Promise.all([readConfinedJson(options.bundleFile),readConfinedJson(options.rehearsalFile),readConfinedJson('live-test/SESSION_PLAN.json')]);
  const bundleHash=keccak256(bundleRaw),sessionHash=keccak256(sessionRaw),toolHash=await bootstrapToolHash();
  need(bundle.status==='UNSIGNED_DEPLOYMENT_PLAN_NOT_EXECUTED'&&bundle.chainId===56&&bundle.transactions.length===4,'INVALID_DEPLOYMENT_BUNDLE');
  need(same(bundle.sessionHash,sessionHash)&&bundle.verificationInputHash===session.coreVerificationInputHash&&await currentVerificationHash()===bundle.verificationInputHash,'SESSION_OR_CORE_CHANGED');
  if(options.broadcast)need(same(options.reviewedBundleHash,bundleHash),'REVIEWED_BUNDLE_HASH_MISMATCH');
  validateRehearsal(bundle,rehearsal,{bundleHash,sessionHash,toolHash});
  const artifacts=await loadArtifacts(),review=bundle.governanceIdentityReview;
  // Rebuild all deployment bytes from source artifacts and the fixed public observation;
  // a hand-edited transaction cannot become trusted merely by rehashing its JSON.
  const reconstructed=buildUnsignedDeploymentPlan({session,artifacts,verificationInputHash:bundle.verificationInputHash,sessionHash,observation:{chainId:56,checkpoint:bundle.checkpoint,latestNonce:bundle.nonceObservation.latest,pendingNonce:bundle.nonceObservation.pending,checkpointNonce:bundle.nonceObservation.checkpoint,creatorCode:'0x',governanceReview:review,multisig:{address:session.governance.multisig,code:review.provenance.observedProxyRuntime,owners:review.getters.getOwners.value,threshold:review.getters.getThreshold.value,nonce:review.getters.nonce.value}}});
  for(let i=0;i<4;i++){const a=bundle.transactions[i],b=reconstructed.transactions[i];need(a.step===i+1&&a.name===b.name&&same(a.expectedContractAddress,b.expectedContractAddress)&&same(a.initCodeHash,b.initCodeHash)&&same(keccak256(a.unsignedTransaction.data),b.initCodeHash)&&a.unsignedTransaction.nonce===b.unsignedTransaction.nonce&&a.unsignedTransaction.chainId===56&&same(a.unsignedTransaction.from,ACCOUNTS.creator)&&a.unsignedTransaction.to===null&&BigInt(a.unsignedTransaction.value)===0n,'UNSIGNED_TRANSACTION_TAMPERED');}
  return {bundle,rehearsal,session,artifacts,bundleHash,sessionHash,toolHash,rehearsalHash:keccak256(rehearsalRaw)};
}
export async function chainIdentity(client,input){
  need(await client.getChainId()===56,'CHAIN_ID_MISMATCH');const version=await client.request({method:'web3_clientVersion'});need(typeof version==='string'&&version.length>0&&!/anvil|hardhat|ganache|testrpc/i.test(version),'DEVELOPMENT_CLIENT_REFUSED');
  need(same((await client.getBlock({blockNumber:BigInt(input.bundle.checkpoint.blockNumber)})).hash,input.bundle.checkpoint.blockHash),'MAINNET_CHECKPOINT_MISMATCH');
  const block=await client.getBlock({blockTag:'latest'});need(typeof block.number==='bigint'&&HEX.test(block.hash),'LATEST_CHECKPOINT_UNAVAILABLE');
  // inspectGovernance normally reads finalized; signing must also notice recent
  // Safe configuration changes, so pin its complete review to this latest block.
  const current=await inspectGovernance({...client,getBlock:args=>client.getBlock(args.blockTag==='finalized'?{blockNumber:block.number}:args)}),old=input.bundle.governanceIdentityReview;
  need(current.currentConfigurationAcceptedForPreparation&&assessGovernance(current)&&same(current.codeHash,old.codeHash)&&same(current.implementation.codeHash,old.implementation.codeHash),'SAFE_RUNTIME_OR_CONFIGURATION_CHANGED');
  need(json(current.getters.getOwners.value.map(x=>x.toLowerCase()).sort())===json(old.getters.getOwners.value.map(x=>x.toLowerCase()).sort())&&String(current.getters.getThreshold.value)===String(old.getters.getThreshold.value),'SAFE_OWNERS_OR_THRESHOLD_CHANGED');
  for(const identity of input.bundle.protocolRuntimeIdentities){const code=await client.getCode({address:identity.address,blockNumber:block.number});need(code&&same(keccak256(code),identity.codeHash),'PROTOCOL_CODE_CHANGED');}
  need(same((await client.getBlock({blockNumber:block.number})).hash,block.hash),'LATEST_CHECKPOINT_CHANGED');
  return current;
}
export async function deploymentPostconditions(client,input,throughStep){
  const a=input.bundle.expectedAddresses,art=input.artifacts;
  const read=(address,artifact,fn,args=[])=>client.readContract({address,abi:art[artifact].abi,functionName:fn,args});
  if(throughStep>=1){need(await read(a.GroupBuyVault,'GroupBuyVault','templateInitializersDisabled')===true&&same(await read(a.GroupBuyVault,'GroupBuyVault','implementationSelf'),a.GroupBuyVault),'VAULT_TEMPLATE_POSTCONDITION_FAILED');const validator=await read(a.GroupBuyVault,'GroupBuyVault','marketValidator'),expected=input.rehearsal.deploymentChecks?.validator,code=await client.getCode({address:validator});need(expected&&HEX.test(expected.codeHash)&&same(validator,expected.address)&&code&&code!=='0x'&&same(keccak256(code),expected.codeHash),'VALIDATOR_DIFFERS_FROM_REHEARSAL');}
  if(throughStep>=2){
    const timelock=a.GovernanceTimelock,safe=input.session.governance.multisig,guardian=input.session.governance.guardian;
    need(await read(timelock,'GovernanceTimelock','minimumDelayFloor')===600n&&await read(timelock,'GovernanceTimelock','getMinDelay')===600n&&same(await read(timelock,'GovernanceTimelock','deploymentAddress'),timelock),'TIMELOCK_DELAY_OR_SELF_MISMATCH');
    const has=(r,who)=>read(timelock,'GovernanceTimelock','hasRole',[r,who]);
    need(await has(zeroHash,timelock)&&!await has(zeroHash,safe),'TIMELOCK_ADMIN_MISMATCH');
    for(const name of ['PROPOSER_ROLE','CANCELLER_ROLE','EXECUTOR_ROLE']){need(await has(role(name),safe),'SAFE_ROLE_MISSING');for(const who of [timelock,ACCOUNTS.creator,guardian,zeroAddress])need(!await has(role(name),who),'UNEXPECTED_TIMELOCK_ROLE');}
    for(const who of [ACCOUNTS.creator,guardian,zeroAddress])need(!await has(zeroHash,who),'EXTERNAL_TIMELOCK_ADMIN');
  }
  if(throughStep>=4){
    const factory=a.ERC1967Proxy;
    const slot=await client.getStorageAt({address:factory,slot:'0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'});
    need(slot&&same('0x'+slot.slice(-40),a.GroupBuyFactory),'FACTORY_IMPLEMENTATION_MISMATCH');
    need(same(await read(factory,'GroupBuyFactory','upgradeAdmin'),a.GovernanceTimelock)&&same(await read(factory,'GroupBuyFactory','guardian'),input.session.governance.guardian)&&await read(factory,'GroupBuyFactory','requiredMinDelay')===600n,'FACTORY_GOVERNANCE_MISMATCH');
    // Initial creation pause is checked before governance configuration; after user
    // configuration the separate governance inspector verifies the selected config.
    need(await read(factory,'GroupBuyFactory','creationPaused')===true,'FACTORY_NOT_INITIAL_PAUSED_STATE');
  }
}
function expectedReceipt(tx,hash){return {transactionHash:hash,from:ACCOUNTS.creator,to:'CREATE',valueWei:'0',dataHash:tx.initCodeHash,minimumConfirmations:CONFIRMATIONS};}
export async function verifyDeploymentReceipt(client,input,entry){
  const tx=input.bundle.transactions[entry.step-1],r=await verifyReceipt(client,expectedReceipt(tx,entry.transactionHash));
  need(r.status==='RECEIPT_MATCHED_BUSINESS_UNVERIFIED',r.reasonCode??'RECEIPT_NOT_VERIFIED');
  need(same(r.receipt.contractAddress,tx.expectedContractAddress),'UNEXPECTED_CREATED_ADDRESS');
  const receiptTx=await client.getTransaction({hash:entry.transactionHash});need(receiptTx.nonce===tx.unsignedTransaction.nonce,'DEPLOYMENT_NONCE_MISMATCH');
  const code=await client.getCode({address:tx.expectedContractAddress});const expected=input.rehearsal.deployments.find(x=>x.step===entry.step);
  need(code&&same(keccak256(code),expected.runtimeCodeHash),'DEPLOYED_RUNTIME_DIFFERS_FROM_REHEARSAL');
  return {...entry,status:'CONFIRMED',name:tx.name,expectedContractAddress:tx.expectedContractAddress,runtimeCodeHash:keccak256(code),receipt:r.receipt,actualGasFeeWei:r.actualGas.feeWei};
}
function stateFor(input,options){const a=input.bundle.expectedAddresses;return {schemaVersion:1,chainId:56,status:'DEPLOYING',sessionHash:input.sessionHash,verificationInputHash:input.bundle.verificationInputHash,bootstrapToolHash:input.toolHash,bundlePath:options.bundleFile,bundleHash:input.bundleHash,rehearsalPath:options.rehearsalFile,rehearsalHash:input.rehearsalHash,addresses:{template:a.GroupBuyVault,timelock:a.GovernanceTimelock,factoryImplementation:a.GroupBuyFactory,factory:a.ERC1967Proxy},steps:[]};}
function reservationIdFor(input,step){return 'bootstrap-'+input.bundleHash.slice(2)+'-'+step;}
function matchState(state,input){
  need(state&&state.schemaVersion===1&&state.chainId===56&&['DEPLOYING','DEPLOYED_UNCONFIGURED'].includes(state.status)&&same(state.bundleHash,input.bundleHash)&&same(state.sessionHash,input.sessionHash)&&state.verificationInputHash===input.bundle.verificationInputHash&&state.bootstrapToolHash===input.toolHash&&same(state.rehearsalHash,input.rehearsalHash),'DEPLOYMENT_STATE_INPUT_MISMATCH');
  const a=input.bundle.expectedAddresses;
  for(const [key,name] of Object.entries({template:'GroupBuyVault',timelock:'GovernanceTimelock',factoryImplementation:'GroupBuyFactory',factory:'ERC1967Proxy'}))need(same(state.addresses?.[key],a[name]),'DEPLOYMENT_STATE_ADDRESS_MISMATCH');
  need(Array.isArray(state.steps)&&state.steps.length<=4,'INVALID_DEPLOYMENT_STEPS');
  const transactionHashes=new Set();
  for(let index=0;index<state.steps.length;index++){
    const entry=state.steps[index],expected=input.bundle.transactions[index];
    need(entry?.step===index+1&&STEP_STATUSES.has(entry.status),'DEPLOYMENT_STEPS_NOT_UNIQUE_AND_CONTIGUOUS');
    need(entry.name===expected.name&&Number.isSafeInteger(entry.nonce)&&entry.nonce===expected.unsignedTransaction.nonce&&same(entry.initCodeHash,expected.initCodeHash)&&same(entry.expectedContractAddress,expected.expectedContractAddress)&&entry.reservationId===reservationIdFor(input,entry.step),'DEPLOYMENT_STEP_DIFFERS_FROM_BUNDLE');
    need(typeof entry.maxFeeWei==='string'&&UINT.test(entry.maxFeeWei)&&BigInt(entry.maxFeeWei)>0n,'DEPLOYMENT_STEP_BUDGET_MISSING');
    if(entry.status==='RESERVED_BEFORE_SIGNATURE')need(entry.transactionHash===undefined,'RESERVED_STEP_HAS_UNEXPECTED_HASH');
    else {need(HEX.test(entry.transactionHash??''),'SIGNED_STEP_HASH_REQUIRED');need(!transactionHashes.has(entry.transactionHash.toLowerCase()),'DUPLICATE_DEPLOYMENT_TRANSACTION_HASH');transactionHashes.add(entry.transactionHash.toLowerCase());}
    if(index<state.steps.length-1)need(entry.status==='CONFIRMED','PRIOR_STEP_NOT_RECONCILED');
  }
  if(state.status==='DEPLOYED_UNCONFIGURED')need(state.steps.length===4&&state.steps.every(entry=>entry.status==='CONFIRMED'),'DEPLOYMENT_COMPLETION_STATE_INVALID');
}
export function assertLedgerMatchesState(state,ledger,input){
  validateBudget(ledger);
  if(state)matchState(state,input);
  const entries=state?.steps??[];
  const reservations=ledger.reservations.filter(entry=>typeof entry.reservationId==='string'&&entry.reservationId.startsWith('bootstrap-'));
  for(const reservation of reservations)need(entries.some(entry=>entry.reservationId===reservation.reservationId),'ORPHAN_BOOTSTRAP_BUDGET_RESERVATION');
  for(const entry of entries){
    const reserved=ledger.reservations.find(item=>item.reservationId===entry.reservationId);
    need(reserved,'DEPLOYMENT_BUDGET_RESERVATION_MISSING');
    need(same(reserved.bundleHash,input.bundleHash)&&same(reserved.initCodeHash,entry.initCodeHash)&&reserved.operation==='deploy-'+entry.name&&same(reserved.sender,ACCOUNTS.creator)&&reserved.nonce===String(entry.nonce)&&reserved.valueWei==='0'&&reserved.maxFeeWei===entry.maxFeeWei,'DEPLOYMENT_BUDGET_BINDING_MISMATCH');
  }
}
async function previousSteps(client,input,state,step){
  for(let i=1;i<step;i++){const entry=state?.steps.find(x=>x.step===i);need(entry?.transactionHash&&entry.status==='CONFIRMED','PREVIOUS_STEP_RECEIPT_REQUIRED');await verifyDeploymentReceipt(client,input,entry);}
  if(step>1)await deploymentPostconditions(client,input,step-1);
}
async function previewStep(client,input,options,state){
  await chainIdentity(client,input);if(state)matchState(state,input);await previousSteps(client,input,state,options.step);
  const tx=input.bundle.transactions[options.step-1];const [latest,pending,balance,code,gasPrice]=await Promise.all([client.getTransactionCount({address:ACCOUNTS.creator,blockTag:'latest'}),client.getTransactionCount({address:ACCOUNTS.creator,blockTag:'pending'}),client.getBalance({address:ACCOUNTS.creator}),client.getCode({address:tx.expectedContractAddress}),client.getGasPrice()]);
  need(latest===tx.unsignedTransaction.nonce&&pending===latest,'NONCE_CHANGED_OR_PENDING_STOP');need(!code||code==='0x','TARGET_ALREADY_DEPLOYED');
  await client.call({account:ACCOUNTS.creator,data:tx.unsignedTransaction.data,value:0n});
  const estimate=await client.estimateGas({account:ACCOUNTS.creator,data:tx.unsignedTransaction.data,value:0n});const gas=(estimate*120n+99n)/100n,maxFee=gas*gasPrice;
  // Preserve the already-confirmed 67-share principal for the upcoming pool.
  need(balance>=maxFee+203010000000000000n,'INSUFFICIENT_BALANCE_AFTER_67_SHARE_RESERVE');
  return {step:tx.step,name:tx.name,chainId:56,from:ACCOUNTS.creator,to:'CREATE',nonce:latest,expectedContractAddress:tx.expectedContractAddress,initCodeHash:tx.initCodeHash,valueWei:'0',estimate,gas,gasPrice,maxFeeWei:maxFee,maxFeeBNB:formatEther(maxFee),bundleHash:input.bundleHash};
}
export function assertUnchangedPreview(before,after){for(const field of ['step','nonce','initCodeHash','expectedContractAddress','gas','gasPrice','maxFeeWei'])need(String(before[field])===String(after[field]),'CONFIRMED_TRANSACTION_CHANGED_RERUN');}
export async function sendRecordedOnce({reservation,saveReserved,sign,saveSigned,send}){
  await reservation();await saveReserved();const raw=await sign();const hash=keccak256(raw);await saveSigned(hash);
  const returned=await send(raw);need(same(returned,hash),'RPC_RETURNED_DIFFERENT_TRANSACTION_HASH');return hash;
}
export async function main(argv=process.argv.slice(2)){
  let unlock;
  try{
    const options=argumentsFor(argv);if(options.help){console.log('Default read-only: --env ../.env --bundle FILE --rehearsal FILE --step 1..4. Human send additionally: --broadcast --reviewed-bundle-hash 0xHASH --max-tx-fee-bnb N --max-total-spend-bnb N, MODE=live ALLOW_LIVE_SEND=true LIVE_RELEASE_VERIFIED=true, real terminal and exact confirmation. --reconcile reads an already recorded hash; never rebroadcasts.');return 0;}
    let limits;if(options.broadcast)limits=humanGates(options,process.env,Boolean(process.stdin.isTTY&&process.stdout.isTTY));
    const input=await inputs(options),{BSC_RPC_URL:frozenRpc}=await onlyEnvFields(options.envFile,['BSC_RPC_URL']),client=frozenReadOnlyClient(frozenRpc);
    unlock=await acquireDeploymentLock();let state=await loadState();const ledger=await readBudget();assertLedgerMatchesState(state,ledger,input);
    const existing=state?.steps.find(x=>x.step===options.step);
    if(options.reconcile||existing){
      need(existing?.transactionHash,'NO_RECORDED_HASH_MANUAL_INVESTIGATION_REQUIRED');
      await chainIdentity(client,input);await previousSteps(client,input,state,options.step);
      const updated=await verifyDeploymentReceipt(client,input,existing);await deploymentPostconditions(client,input,options.step);
      state.steps[state.steps.findIndex(x=>x.step===options.step)]=updated;
      if(state.steps.length===4&&state.steps.every(x=>x.status==='CONFIRMED'))state.status='DEPLOYED_UNCONFIGURED';
      assertLedgerMatchesState(state,await readBudget(),input);await writeAtomic(STATE_FILE,state);console.log(json({status:'RECEIPT_RECONCILED_NO_SEND',stateFile:STATE_FILE,step:options.step,transactionHash:existing.transactionHash,deploymentStatus:state.status}));return 0;
    }
    const preview=await previewStep(client,input,options,state);
    console.log(json({mode:options.broadcast?'LIVE_HUMAN_CONFIRMATION_REQUIRED':'READ_ONLY_PLAN',...preview,spentAndReservedWei:ledger.spentAndReservedWei}));
    if(!options.broadcast){const file=await saveObservation('mainnet-step-plan',preview);console.log(json({reportFile:file,transactionsSent:0}));return 0;}
    need(preview.maxFeeWei<=limits.maxTxWei&&BigInt(ledger.spentAndReservedWei)+preview.maxFeeWei<=limits.maxTotalWei,'DEPLOYMENT_BUDGET_EXCEEDED');
    const confirmation=`SEND DEPLOY ${options.step} 56 ${ACCOUNTS.creator} ${preview.expectedContractAddress} ${preview.initCodeHash} ${input.bundleHash} ${preview.maxFeeWei}`;
    console.log('Review the exact addresses, initialization, gas and budget above. Paste this full line to sign and send one transaction:\n'+confirmation);
    const rl=createInterface({input:process.stdin,output:process.stdout});let answer;try{answer=await rl.question('> ');}finally{rl.close();}need(answer===confirmation,'CONFIRMATION_NOT_ACCEPTED_NO_SEND');
    // Re-load all local inputs and chain state after user confirmation.
    const freshInput=await inputs(options);need(freshInput.toolHash===input.toolHash,'TOOLS_CHANGED');assertRpcUnchanged(frozenRpc,(await onlyEnvFields(options.envFile,['BSC_RPC_URL'])).BSC_RPC_URL);const fresh=await previewStep(client,freshInput,options,state);assertUnchangedPreview(preview,fresh);
    state=await loadState();assertLedgerMatchesState(state,await readBudget(),input);
    state??=stateFor(input,options);const reservationId=reservationIdFor(input,options.step);
    const entry={step:options.step,name:preview.name,status:'RESERVED_BEFORE_SIGNATURE',nonce:preview.nonce,initCodeHash:preview.initCodeHash,reservationId,expectedContractAddress:preview.expectedContractAddress,maxFeeWei:preview.maxFeeWei.toString()};
    try{
      const hash=await sendRecordedOnce({
        reservation:()=>reserveBudget({id:reservationId,operation:'deploy-'+preview.name,nonce:preview.nonce,sender:ACCOUNTS.creator,valueWei:0n,maxFeeWei:preview.maxFeeWei,maxTotalWei:limits.maxTotalWei,bundleHash:input.bundleHash,initCodeHash:preview.initCodeHash}),
        saveReserved:async()=>{state.steps.push(entry);assertLedgerMatchesState(state,await readBudget(),input);await writeAtomic(STATE_FILE,state);},
        sign:async()=>{const fields=await onlyEnvFields(options.envFile,['CREATOR_PRIVATE_KEY']);const {privateKeyToAccount}=await import('viem/accounts');const key=fields.CREATOR_PRIVATE_KEY.startsWith('0x')?fields.CREATOR_PRIVATE_KEY:'0x'+fields.CREATOR_PRIVATE_KEY;const signer=privateKeyToAccount(key);need(same(signer.address,ACCOUNTS.creator),'CREATOR_PRIVATE_KEY_ADDRESS_MISMATCH');return signer.signTransaction({chainId:56,type:'legacy',nonce:preview.nonce,gas:preview.gas,gasPrice:preview.gasPrice,to:undefined,value:0n,data:input.bundle.transactions[options.step-1].unsignedTransaction.data});},
        saveSigned:async hash=>{Object.assign(entry,{status:'SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN',transactionHash:hash});assertLedgerMatchesState(state,await readBudget(),input);await writeAtomic(STATE_FILE,state);},
        send:async raw=>{
          assertRpcUnchanged(frozenRpc,(await onlyEnvFields(options.envFile,['BSC_RPC_URL'])).BSC_RPC_URL);
          await chainIdentity(client,input);await previousSteps(client,input,state,options.step);
          const [balance,code]=await Promise.all([client.getBalance({address:ACCOUNTS.creator}),client.getCode({address:preview.expectedContractAddress})]);
          need(balance>=preview.maxFeeWei+203010000000000000n,'INSUFFICIENT_BALANCE_AFTER_67_SHARE_RESERVE');need(!code||code==='0x','TARGET_ALREADY_DEPLOYED');
          const recorded=await loadState();assertLedgerMatchesState(recorded,await readBudget(),input);need(same(recorded?.steps[options.step-1]?.transactionHash,entry.transactionHash),'RECORDED_SIGNED_HASH_CHANGED');
          await assertFreshNonce(client,preview.nonce);
          assertRpcUnchanged(frozenRpc,(await onlyEnvFields(options.envFile,['BSC_RPC_URL'])).BSC_RPC_URL);
          const sender=createWalletClient({transport:http(frozenRpc,{retryCount:0,timeout:20000})});return sender.sendRawTransaction({serializedTransaction:raw});
        },
      });
      entry.status='SUBMITTED';await writeAtomic(STATE_FILE,state);console.log(json({status:'SUBMITTED',transactionHash:hash,step:options.step}));
      await client.waitForTransactionReceipt({hash,confirmations:CONFIRMATIONS,timeout:60000,pollingInterval:1500});
      const verified=await verifyDeploymentReceipt(client,input,entry);await deploymentPostconditions(client,input,options.step);
      state.steps[state.steps.findIndex(x=>x.step===options.step)]=verified;if(options.step===4)state.status='DEPLOYED_UNCONFIGURED';assertLedgerMatchesState(state,await readBudget(),input);await writeAtomic(STATE_FILE,state);
      console.log(json({status:'CONFIRMED',step:options.step,transactionHash:hash,expectedContractAddress:preview.expectedContractAddress,stateFile:STATE_FILE,deploymentStatus:state.status}));return 0;
    }catch{console.error(json({status:'STOPPED_RECONCILE_ONLY',step:options.step,transactionHash:entry.transactionHash??null,stateFile:STATE_FILE,reason:'Signing, broadcasting or receipt verification did not complete. Budget stays reserved. Do not delete state/budget or resend. Use --reconcile if a hash is recorded.'}));return 1;}
  }catch(error){console.error(json({status:'STOPPED',reason:error.constructor===Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'DETAILS_REDACTED',automaticBroadcastRetry:false}));return 1;}
  finally{if(unlock)await unlock();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;});
