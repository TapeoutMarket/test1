#!/usr/bin/env node
// Builds unsigned Safe imports and observes governance. No signing or write RPC exists here.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {decodeEventLog,encodeAbiParameters,encodeFunctionData,getAddress,keccak256,parseAbi,stringToHex,zeroAddress,zeroHash} from 'viem';
import {ROOT,ACCOUNTS,readOnlyClientFromEnv,saveObservation,json} from './preflight.mjs';
import {currentVerificationHash,loadArtifacts} from './prepare-deployments.mjs';
import {inspectGovernance,assessGovernance} from './inspect-governance.mjs';
import {verifyReceipt} from './verify-receipt.mjs';
import {validateRehearsal} from './deploy-mainnet.mjs';
import {bootstrapToolHash} from './deployment-io.mjs';

const HASH=/^0x[0-9a-fA-F]{64}$/;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const need=(ok,reason)=>{if(!ok)throw new Error(reason);};
const address=value=>{need(typeof value==='string'&&/^0x[0-9a-fA-F]{40}$/.test(value)&&!same(value,zeroAddress),'INVALID_GOVERNANCE_ADDRESS');return getAddress(value.toLowerCase());};
const safeUint=value=>{need(/^(0|[1-9][0-9]*)$/.test(String(value)),'INVALID_UNSIGNED_INTEGER');return BigInt(value);};
const hasCode=code=>typeof code==='string'&&/^0x(?:[0-9a-fA-F]{2})+$/.test(code);
const IMPLEMENTATION_SLOT='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const addressFromSlot=slot=>typeof slot==='string'&&/^0x0{24}[0-9a-fA-F]{40}$/.test(slot)?getAddress('0x'+slot.slice(-40)):null;

export const factoryGovernanceAbi=parseAbi([
  'function approveTemplate(address template,uint32 version,bytes32 expectedCodeHash)',
  'function approveConfig((uint256 chainId,uint32 templateVersion,uint8 marketKind,address market,address collection,address mining,address bem,bytes32 marketCodeHash,bytes32 seaportDomainSeparator,bytes32 seaportVersionHash,uint64 safetyMargin,bool mockOnly) config) returns (bytes32)',
  'function selectConfiguration(address template,bytes32 configHash)',
  'function resumeCreation()',
]);
export const timelockBatchAbi=parseAbi([
  'function scheduleBatch(address[] targets,uint256[] values,bytes[] payloads,bytes32 predecessor,bytes32 salt,uint256 delay)',
  'function executeBatch(address[] targets,uint256[] values,bytes[] payloads,bytes32 predecessor,bytes32 salt) payable',
]);
export const configComponents=factoryGovernanceAbi.find(item=>item.name==='approveConfig').inputs[0].components;
export function configurationHash(config){return keccak256(encodeAbiParameters([{type:'tuple',components:configComponents}],[config]));}

/** Reuses the real-protocol fork config. feeRecipient is order consideration, not a Config field. */
export function loadConfig(session,baseline){
  need(session.chainId===56&&baseline.chainId===56,'CHAIN_ID_MISMATCH');
  need(same(session.collection,baseline.collection)&&String(session.tokenId)===String(baseline.tokenId),'SESSION_MINER_IDENTITY_CHANGED');
  need(same(session.feeRecipient,ACCOUNTS.creator),'UNEXPECTED_ORDER_FEE_RECIPIENT');
  need(baseline.seaport?.version==='1.6','UNEXPECTED_SEAPORT_VERSION');
  const market=baseline.codeIdentities?.find(item=>item.field==='market');
  need(market&&same(market.address,baseline.market)&&HASH.test(market.codeHash)&&HASH.test(baseline.seaport.domainSeparator),'SEAPORT_BASELINE_UNAVAILABLE');
  const config={chainId:'56',templateVersion:1,marketKind:0,market:address(baseline.market),collection:address(baseline.collection),mining:address(baseline.mining),bem:address(baseline.bem),marketCodeHash:market.codeHash,seaportDomainSeparator:baseline.seaport.domainSeparator,seaportVersionHash:keccak256(stringToHex('1.6')),safetyMargin:'300',mockOnly:false};
  validateConfig(config);return config;
}
function validateConfig(config){
  need(config&&Object.keys(config).sort().join(',')===configComponents.map(x=>x.name).sort().join(','),'INVALID_CONFIG_FIELDS');
  need(config.chainId==='56'&&config.templateVersion===1&&config.marketKind===0&&config.mockOnly===false,'ONLY_REAL_SEAPORT_V1_ALLOWED');
  for(const field of ['market','collection','mining','bem'])address(config[field]);
  for(const field of ['marketCodeHash','seaportDomainSeparator','seaportVersionHash'])need(HASH.test(config[field]),'INVALID_CONFIG_HASH');
  need(safeUint(config.safetyMargin)===300n,'UNREVIEWED_SAFETY_MARGIN');
}
function safeImport({safe,to,data,name,description}){
  // Official BatchFile supports raw data and optional metadata. No invented Safe nonce or signature.
  return {version:'1.0',chainId:'56',createdAt:0,meta:{name,description,createdFromSafeAddress:safe},transactions:[{to,value:'0',data}]};
}

/** Pure builder shared by local rehearsal and read-only mainnet preparation. */
export function buildGovernanceBundle({addresses,session,config,templateCodeHash,sessionHash}){
  validateConfig(config);need(session.chainId===56&&HASH.test(sessionHash)&&HASH.test(templateCodeHash),'INVALID_BUNDLE_IDENTITY');
  need(safeUint(session.governance?.minimumDelaySeconds)===600n,'CONFIRMED_600_SECOND_DELAY_REQUIRED');
  need(session.governance?.threshold===2&&session.governance?.owners?.length===2,'CONFIRMED_TWO_OF_TWO_SAFE_REQUIRED');
  const factory=address(addresses.factory),template=address(addresses.template),timelock=address(addresses.timelock),safe=address(session.governance.multisig),guardian=address(session.governance.guardian);
  need(new Set([factory,template,timelock,safe,guardian].map(x=>x.toLowerCase())).size===5,'GOVERNANCE_ADDRESS_OVERLAP');
  const configHash=configurationHash(config);
  const actions=[['approveTemplate',[template,1,templateCodeHash]],['approveConfig',[config]],['selectConfiguration',[template,configHash]],['resumeCreation',[]]];
  const payloads=actions.map(([functionName,args])=>encodeFunctionData({abi:factoryGovernanceAbi,functionName,args}));
  const targets=payloads.map(()=>factory),values=payloads.map(()=>0n);
  const salt=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'},{type:'address'},{type:'address'},{type:'address'},{type:'address'},{type:'bytes32'},{type:'bytes32'},{type:'bytes32'}],[keccak256(stringToHex('TapeOut.mainnet-initial-governance.v1')),56n,timelock,factory,template,safe,configHash,templateCodeHash,sessionHash]));
  const executeArgs=[targets,values,payloads,zeroHash,salt],scheduleArgs=[...executeArgs,600n];
  const operationId=keccak256(encodeAbiParameters([{type:'address[]'},{type:'uint256[]'},{type:'bytes[]'},{type:'bytes32'},{type:'bytes32'}],executeArgs));
  const scheduleData=encodeFunctionData({abi:timelockBatchAbi,functionName:'scheduleBatch',args:scheduleArgs}),executeData=encodeFunctionData({abi:timelockBatchAbi,functionName:'executeBatch',args:executeArgs});
  return {schemaVersion:1,status:'UNSIGNED_GOVERNANCE_BUNDLE',chainId:56,sessionHash,addresses:{factory,template,timelock},safe,guardian,minimumDelaySeconds:600,config,configHash,templateCodeHash,salt,operationId,actions:actions.map(([name])=>name),batch:{targets,values,payloads,predecessor:zeroHash,salt},scheduleArgs,executeArgs,scheduleData,executeData,
    scheduleSafe:safeImport({safe,to:timelock,data:scheduleData,name:'TapeOut: schedule initial Factory configuration',description:`Requires both Safe owners. Schedule operation ${operationId}; wait at least 600 seconds AFTER this Safe transaction is executed on chain.`}),
    executeSafe:safeImport({safe,to:timelock,data:executeData,name:'TapeOut: execute initial Factory configuration',description:`Requires both Safe owners and a fresh ready inspection. Execute scheduled operation ${operationId}; no BNB value is sent.`}),
    orderContext:{seller:session.seller,collection:session.collection,tokenId:session.tokenId,feeRecipient:session.feeRecipient,note:'Fee recipient is an order consideration recipient; Factory Config does not contain it.'},mainnetTransactionsSent:0,privateKeysConsumed:false,safeServiceRequests:0};
}

export async function readConfined(relative){
  const file=path.resolve(ROOT,relative);need(file.startsWith(ROOT+path.sep)&&await fs.realpath(file)===file,'INPUT_PATH_OR_SYMLINK_REFUSED');return fs.readFile(file);
}
function deploymentAddresses(state,draft){
  const mapping={template:'GroupBuyVault',timelock:'GovernanceTimelock',factoryImplementation:'GroupBuyFactory',factory:'ERC1967Proxy'};
  for(const [key,name] of Object.entries(mapping))need(same(address(state.addresses?.[key]),draft.expectedAddresses?.[name]),'DEPLOYMENT_ADDRESS_MISMATCH');
  return state.addresses;
}
export function validateGovernanceRehearsal({state,draft,rehearsal,bundleHash,sessionHash,toolHash}){
  validateRehearsal(draft,rehearsal,{bundleHash,sessionHash,toolHash});
  need(state.bootstrapToolHash===toolHash&&state.verificationInputHash===rehearsal.verificationInputHash,'DEPLOYMENT_REHEARSAL_TOOL_OR_CORE_CHANGED');
  need(state.steps?.length===4,'FOUR_DEPLOYMENT_RECEIPTS_REQUIRED');
  for(const step of state.steps){const actual=rehearsal.deployments.find(item=>item.step===step.step);need(actual&&actual.name===step.name&&same(actual.address,step.expectedContractAddress)&&same(actual.runtimeCodeHash,step.runtimeCodeHash),'DEPLOYMENT_RUNTIME_DIFFERS_FROM_REHEARSAL');}
  const validator=rehearsal.deploymentChecks?.validator;
  need(validator&&HASH.test(validator.codeHash)&&validator.matchesCompiledRuntime===true,'REHEARSED_VALIDATOR_IDENTITY_REQUIRED');address(validator.address);
  return validator;
}
export async function verifyDeploymentEvidence(client,{state,draft,session,sessionHash,verificationInputHash}){
  need(state.schemaVersion===1&&state.chainId===56&&state.status==='DEPLOYED_UNCONFIGURED','VERIFIED_MAINNET_DEPLOYMENT_STATE_REQUIRED');
  need(same(state.sessionHash,sessionHash)&&same(draft.sessionHash,sessionHash)&&state.verificationInputHash===verificationInputHash&&draft.verificationInputHash===verificationInputHash,'DEPLOYMENT_SOURCE_OR_SESSION_CHANGED');
  need(state.steps?.length===4&&draft.transactions?.length===4,'FOUR_DEPLOYMENT_RECEIPTS_REQUIRED');
  const addresses=deploymentAddresses(state,draft);
  const checkpoint=await client.getBlock({blockNumber:BigInt(draft.checkpoint.blockNumber)});need(same(checkpoint.hash,draft.checkpoint.blockHash),'DEPLOYMENT_PREPARATION_CHECKPOINT_MISMATCH');
  const verified=[];
  for(let i=0;i<4;i++){
    const step=state.steps[i],expected=draft.transactions[i];
    need(step.step===i+1&&step.name===expected.name&&step.status==='CONFIRMED'&&step.receipt?.status==='success'&&HASH.test(step.runtimeCodeHash)&&HASH.test(step.transactionHash)&&same(step.expectedContractAddress,expected.expectedContractAddress),'DEPLOYMENT_STEP_UNVERIFIED');
    const report=await verifyReceipt(client,{transactionHash:step.transactionHash,from:ACCOUNTS.creator,to:'CREATE',valueWei:'0',dataHash:expected.initCodeHash,minimumConfirmations:15});
    need(report.status==='RECEIPT_MATCHED_BUSINESS_UNVERIFIED'&&same(report.receipt.contractAddress,step.expectedContractAddress)&&same(report.receipt.blockHash,step.receipt.blockHash)&&String(report.receipt.blockNumber)===String(step.receipt.blockNumber),'DEPLOYMENT_RECEIPT_CANONICAL_IDENTITY_MISMATCH');
    const tx=await client.getTransaction({hash:step.transactionHash});need(tx.nonce===expected.unsignedTransaction.nonce,'DEPLOYMENT_TRANSACTION_NONCE_MISMATCH');
    const code=await client.getCode({address:step.expectedContractAddress,blockNumber:report.receipt.blockNumber});need(hasCode(code)&&same(keccak256(code),step.runtimeCodeHash),'DEPLOYMENT_RECEIPT_RUNTIME_MISMATCH');
    verified.push({name:step.name,transactionHash:step.transactionHash,blockNumber:report.receipt.blockNumber,blockHash:report.receipt.blockHash,address:step.expectedContractAddress,runtimeCodeHash:step.runtimeCodeHash,confirmations:report.confirmations.observed});
  }
  return {addresses,receipts:verified};
}
export function operationReadiness({state,timestamp,now,ready,done}){
  const operationState=Number(state),readyAt=safeUint(timestamp),chainTimestamp=safeUint(now);
  need([0,1,2,3].includes(operationState)&&typeof ready==='boolean'&&typeof done==='boolean','INVALID_OPERATION_STATE');
  need(ready===(operationState===2)&&done===(operationState===3),'INCONSISTENT_OPERATION_STATE');
  if(operationState===0)need(readyAt===0n,'INCONSISTENT_OPERATION_TIMESTAMP');
  if(operationState===1)need(readyAt>chainTimestamp,'INCONSISTENT_OPERATION_TIMESTAMP');
  if(operationState===2)need(readyAt>1n&&readyAt<=chainTimestamp,'INCONSISTENT_OPERATION_TIMESTAMP');
  if(operationState===3)need(readyAt===1n,'INCONSISTENT_OPERATION_TIMESTAMP');
  return {state:operationState,stateName:['UNSCHEDULED','WAITING','READY','DONE'][operationState],timestamp:readyAt,readyAt:operationState===1||operationState===2?readyAt:null,chainTimestamp,remainingSeconds:operationState===1?readyAt-chainTimestamp:0n,canExecute:ready,status:operationState===0?'SCHEDULE_REQUIRED':operationState===1?'WAITING_TIMELOCK_DO_NOT_EXECUTE':operationState===2?'READY_FOR_USER_SAFE_EXECUTION':'ALREADY_EXECUTED'};
}

const roleEventAbi=parseAbi(['event RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)','event RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)']);
const roleTopics=new Set(roleEventAbi.map(item=>keccak256(stringToHex(`${item.name}(bytes32,address,address)`))));
export function replayRoleEvents(logs,{timelock,safe,proposer,executor,canceller}){
  const ordered=[...logs].sort((a,b)=>a.blockNumber===b.blockNumber?Number(a.logIndex)-Number(b.logIndex):a.blockNumber<b.blockNumber?-1:1),active=new Set(),seen=new Set();let count=0;
  for(const log of ordered){
    if(!roleTopics.has(log.topics?.[0]))continue;
    need(!log.removed&&same(log.address,timelock)&&typeof log.blockNumber==='bigint'&&Number.isInteger(log.logIndex)&&HASH.test(log.transactionHash)&&HASH.test(log.blockHash),'ROLE_EVENT_INVALID');
    const key=`${log.blockNumber}:${log.logIndex}`;need(!seen.has(key),'DUPLICATE_ROLE_EVENT');seen.add(key);
    const event=decodeEventLog({abi:roleEventAbi,data:log.data,topics:log.topics,strict:true});
    const identity=`${event.args.role.toLowerCase()}:${event.args.account.toLowerCase()}`;
    if(event.eventName==='RoleGranted')active.add(identity);else active.delete(identity);count++;
  }
  const expected=new Set([[zeroHash,timelock],[proposer,safe],[executor,safe],[canceller,safe]].map(([role,account])=>`${role.toLowerCase()}:${account.toLowerCase()}`));
  need(count>=4&&active.size===expected.size&&[...active].every(x=>expected.has(x)),'UNEXPECTED_TIMELOCK_ROLE_HISTORY');
  return {status:'EXACT_ROLE_MEMBERSHIP_RECONSTRUCTED',eventsProcessed:count,activeMembers:[...active].sort(),source:'RoleGranted and RoleRevoked from Timelock constructor receipt through observation checkpoint'};
}
async function auditRoleHistory(client,{state,block,addresses,bundle,proposer,executor,canceller}){
  const start=BigInt(state.steps.find(step=>step.name==='GovernanceTimelock').receipt.blockNumber),end=block.number;
  need(end>=start&&end-start<=1_000_000n,'ROLE_AUDIT_RANGE_OUT_OF_BOUNDS');
  const logs=[];
  for(let from=start;from<=end;from+=2000n){const to=from+1999n>end?end:from+1999n;logs.push(...await client.getLogs({address:addresses.timelock,fromBlock:from,toBlock:to}));}
  const audit=replayRoleEvents(logs,{timelock:addresses.timelock,safe:bundle.safe,proposer,executor,canceller});
  const report={...audit,fromBlock:start,toBlock:end,checkpointBlockHash:block.hash};
  return {...report,reportHash:keccak256(stringToHex(json(report)))};
}

export async function inspectConfiguration(client,{session,baseline,addresses,artifacts,bundle,state,rehearsal},governanceInspector=inspectGovernance){
  const chainId=await client.getChainId(),version=await client.request({method:'web3_clientVersion'});need(chainId===56&&typeof version==='string'&&!/anvil|hardhat|ganache|testrpc/i.test(version),'MAINNET_IDENTITY_REJECTED');
  const block=await client.getBlock({blockTag:'finalized'});need(block.number!==null&&HASH.test(block.hash),'CHECKPOINT_UNAVAILABLE');
  const at={blockNumber:block.number};
  const governance=await governanceInspector({...client,getBlock:args=>client.getBlock(args.blockTag==='finalized'?{blockNumber:block.number}:args)});
  need(governance.currentConfigurationAcceptedForPreparation===true&&assessGovernance(governance)&&same(governance.address,session.governance.multisig)&&same(governance.codeHash,session.governance.multisigCodeHash)&&same(governance.implementation.address,session.governance.implementation)&&same(governance.implementation.codeHash,session.governance.implementationCodeHash),'SAFE_CONFIGURATION_OR_IDENTITY_CHANGED');
  const sorted=values=>values.map(x=>address(x).toLowerCase()).sort().join(',');
  need(sorted(governance.getters.getOwners.value)===sorted(session.governance.owners)&&BigInt(governance.getters.getThreshold.value)===2n,'SAFE_OWNERS_OR_THRESHOLD_CHANGED');
  const runtime={};
  for(const [key,address]of Object.entries(addresses)){
    const code=await client.getCode({address,...at});need(hasCode(code),'DEPLOYED_CODE_MISSING');runtime[key]=keccak256(code);
    const entry=state.steps.find(step=>same(step.expectedContractAddress,address));need(entry&&same(entry.runtimeCodeHash,runtime[key]),'DEPLOYED_RUNTIME_CHANGED');
  }
  for(const entry of baseline.codeIdentities){const code=await client.getCode({address:entry.address,...at});need(hasCode(code)&&same(keccak256(code),entry.codeHash),'PROTOCOL_RUNTIME_CHANGED');}
  need(same(runtime.template,bundle.templateCodeHash),'TEMPLATE_CODE_HASH_MISMATCH');
  const implementation=addressFromSlot(await client.getStorageAt({address:addresses.factory,slot:IMPLEMENTATION_SLOT,...at}));need(same(implementation,addresses.factoryImplementation),'FACTORY_IMPLEMENTATION_CHANGED');
  const read=(name,functionName,args=[])=>client.readContract({address:name==='factory'?addresses.factory:name==='template'?addresses.template:addresses.timelock,abi:name==='factory'?artifacts.GroupBuyFactory.abi:name==='template'?artifacts.GroupBuyVault.abi:artifacts.GovernanceTimelock.abi,functionName,args,...at});
  const [admin,guardian,required,delay,floor,deploymentAddress,proposer,executor,canceller]=await Promise.all([read('factory','upgradeAdmin'),read('factory','guardian'),read('factory','requiredMinDelay'),read('timelock','getMinDelay'),read('timelock','minimumDelayFloor'),read('timelock','deploymentAddress'),read('timelock','PROPOSER_ROLE'),read('timelock','EXECUTOR_ROLE'),read('timelock','CANCELLER_ROLE')]);
  need(same(admin,addresses.timelock)&&same(guardian,session.governance.guardian)&&required===600n&&delay===600n&&floor===600n&&same(deploymentAddress,addresses.timelock),'TIMELOCK_OR_FACTORY_GOVERNANCE_CHANGED');
  const roleChecks=[];
  for(const [role,who,expected]of [[zeroHash,addresses.timelock,true],[proposer,bundle.safe,true],[executor,bundle.safe,true],[canceller,bundle.safe,true],[executor,zeroAddress,false],[proposer,zeroAddress,false],[zeroHash,bundle.safe,false],[zeroHash,ACCOUNTS.creator,false],[proposer,ACCOUNTS.creator,false],[executor,ACCOUNTS.creator,false],[zeroHash,guardian,false],[proposer,guardian,false],[executor,guardian,false],[canceller,guardian,false]]){
    const actual=await read('timelock','hasRole',[role,who]);need(actual===expected,'TIMELOCK_ROLE_MISMATCH');roleChecks.push({role,address:who,expected,actual});
  }
  const roleHistory=await auditRoleHistory(client,{state,block,addresses,bundle,proposer,executor,canceller});
  const [self,locked,templateId,validator]=await Promise.all([read('template','implementationSelf'),read('template','templateInitializersDisabled'),read('template','vaultTemplateId'),read('template','marketValidator')]);
  need(same(self,addresses.template)&&locked&&same(templateId,keccak256(stringToHex('TapeOut.GroupBuyVault.v1'))),'TEMPLATE_NOT_FIXED_LOCKED_V1');
  const validatorCode=await client.getCode({address:validator,...at}),validatorReference=rehearsal?.deploymentChecks?.validator;
  need(hasCode(validatorCode)&&validatorReference?.matchesCompiledRuntime===true&&same(validator,validatorReference.address)&&same(keccak256(validatorCode),validatorReference.codeHash),'TEMPLATE_VALIDATOR_DIFFERS_FROM_REHEARSAL');
  const seaport=await client.readContract({address:bundle.config.market,abi:parseAbi(['function information() view returns(string,bytes32,address)']),functionName:'information',...at});
  need(seaport[0]==='1.6'&&same(seaport[1],bundle.config.seaportDomainSeparator),'SEAPORT_DOMAIN_OR_VERSION_CHANGED');
  need(same(await read('factory','hashConfig',[bundle.config]),bundle.configHash)&&same(await read('timelock','hashOperationBatch',bundle.executeArgs),bundle.operationId),'ONCHAIN_HASH_MISMATCH');
  const [operationState,timestamp,ready,done,selectedTemplate,selectedConfigHash,creationPaused,approval,stored]=await Promise.all([read('timelock','getOperationState',[bundle.operationId]),read('timelock','getTimestamp',[bundle.operationId]),read('timelock','isOperationReady',[bundle.operationId]),read('timelock','isOperationDone',[bundle.operationId]),read('factory','selectedTemplate'),read('factory','selectedConfigHash'),read('factory','creationPaused'),read('factory','templateApproval',[addresses.template]),read('factory','configuration',[bundle.configHash])]);
  const operation=operationReadiness({state:operationState,timestamp,now:block.timestamp,ready,done});
  let simulation={status:'NOT_RUN',reason:'OPERATION_WAITING_OR_ALREADY_DONE'};
  if(operation.state===0||operation.state===2){await client.simulateContract({address:addresses.timelock,abi:timelockBatchAbi,functionName:operation.state===0?'scheduleBatch':'executeBatch',args:operation.state===0?bundle.scheduleArgs:bundle.executeArgs,account:bundle.safe,...at});simulation={status:'PASS',method:operation.state===0?'scheduleBatch':'executeBatch',from:bundle.safe,scope:'INNER_TIMELOCK_CALL_NOT_SAFE_SIGNATURE_EXECUTION'};}
  if(operation.state!==3)need(creationPaused&&same(selectedTemplate,zeroAddress)&&same(selectedConfigHash,zeroHash),'FACTORY_ALREADY_CONFIGURED_OR_UNPAUSED');
  else need(!creationPaused&&same(selectedTemplate,addresses.template)&&same(selectedConfigHash,bundle.configHash)&&approval.approved&&same(approval.codeHash,bundle.templateCodeHash)&&Number(approval.version)===1&&stored[1]&&same(configurationHash(stored[0]),bundle.configHash),'GOVERNANCE_EXECUTION_POSTCONDITIONS_FAILED');
  need(same((await client.getBlock({blockNumber:block.number})).hash,block.hash),'CHECKPOINT_CHANGED');
  return {status:operation.status,chainId:56,checkpoint:{blockNumber:block.number,blockHash:block.hash,timestamp:block.timestamp},checkpointPolicy:'Finalized block timestamp; readiness can lag the latest block by a few seconds. Rerun inspection after finalization, without reducing the delay.',operation,governance,runtime,implementation,roles:roleChecks,roleHistory,minimumDelaySeconds:delay,minimumDelayFloor:floor,requiredMinDelay:required,validator:{address:validator,codeHash:keccak256(validatorCode),matchesRehearsal:true},configHash:bundle.configHash,operationId:bundle.operationId,selectedTemplate,selectedConfigHash,creationPaused,simulation,mainnetTransactionsSent:0,privateKeysConsumed:false,safeServiceRequests:0};
}

export function parseArguments(argv){
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const args={inspect:false};
  for(let i=0;i<argv.length;i++){const flag=argv[i];if(flag==='--inspect'){need(!args.inspect,'DUPLICATE_ARGUMENT');args.inspect=true;continue;}need(['--env','--deployment'].includes(flag),'UNSUPPORTED_ARGUMENT');const key=flag.slice(2);need(args[key]===undefined&&argv[i+1]&&!argv[i+1].startsWith('--'),'INVALID_ARGUMENT');args[key]=argv[++i];}
  need(args.env&&args.deployment,'EXPLICIT_ENV_AND_DEPLOYMENT_REQUIRED');return args;
}
export async function main(argv=process.argv.slice(2)){
  try{
    const args=parseArguments(argv);if(args.help){console.log('Read-only: node live-test/governance.mjs --env ../.env --deployment live-test/deployment-state.json [--inspect]\nDefault: verify four mainnet deployments and write two unsigned Safe Transaction Builder JSON files. --inspect: report current operation readiness; exits 2 while unscheduled/waiting. No signing, Safe service calls, broadcasting or timer waiting.');return 0;}
    const sessionRaw=await readConfined('live-test/SESSION_PLAN.json'),session=JSON.parse(sessionRaw),sessionHash=keccak256(sessionRaw),verificationInputHash=await currentVerificationHash();
    need(verificationInputHash===session.coreVerificationInputHash,'CORE_VERIFICATION_HASH_MISMATCH');
    const state=JSON.parse(await readConfined(args.deployment)),draftRaw=await readConfined(state.bundlePath);need(same(keccak256(draftRaw),state.bundleHash),'DEPLOYMENT_BUNDLE_FILE_CHANGED');
    const rehearsalRaw=await readConfined(state.rehearsalPath);need(same(keccak256(rehearsalRaw),state.rehearsalHash),'DEPLOYMENT_REHEARSAL_FILE_CHANGED');
    const draft=JSON.parse(draftRaw),rehearsal=JSON.parse(rehearsalRaw),toolHash=await bootstrapToolHash();
    validateGovernanceRehearsal({state,draft,rehearsal,bundleHash:keccak256(draftRaw),sessionHash,toolHash});
    const baseline=JSON.parse(await readConfined('reports/authorized-source-observation.json')),artifacts=await loadArtifacts(),client=await readOnlyClientFromEnv(args.env);
    const evidence=await verifyDeploymentEvidence(client,{state,draft,session,sessionHash,verificationInputHash});
    const config=loadConfig(session,baseline),templateCodeHash=state.steps.find(step=>step.name==='GroupBuyVault').runtimeCodeHash;
    const bundle=buildGovernanceBundle({addresses:evidence.addresses,session,config,templateCodeHash,sessionHash});
    const inspection=await inspectConfiguration(client,{session,baseline,addresses:evidence.addresses,artifacts,bundle,state,rehearsal});
    need(same(keccak256(await readConfined('live-test/SESSION_PLAN.json')),sessionHash)&&await currentVerificationHash()===verificationInputHash&&await bootstrapToolHash()===toolHash,'LOCAL_INPUT_CHANGED');
    const report={...inspection,sessionHash,verificationInputHash,bootstrapToolHash:toolHash,rehearsalEvidence:{path:state.rehearsalPath,hash:state.rehearsalHash,status:rehearsal.status,cleanup:rehearsal.cleanup},deploymentEvidence:evidence,configuration:config,orderContext:bundle.orderContext};
    if(!args.inspect){
      const createdAt=Number(inspection.checkpoint.timestamp)*1000;bundle.scheduleSafe.createdAt=createdAt;bundle.executeSafe.createdAt=createdAt;
      report.files={schedule:await saveObservation('safe-schedule',bundle.scheduleSafe),execute:await saveObservation('safe-execute',bundle.executeSafe),bundle:await saveObservation('governance-bundle',bundle),config:await saveObservation('mainnet-config',config)};
      report.safeImportSchemaSource='https://github.com/safe-global/safe-wallet-web/blob/dev/apps/tx-builder/src/typings/models.ts';
    }
    const file=await saveObservation('governance-inspection',report);
    console.log(json({status:report.status,reportFile:file,operation:report.operation,operationId:report.operationId,configHash:report.configHash,files:report.files??null,requiredSafeConfirmations:'2 of 2 for schedule and another 2 of 2 for execute',simulation:report.simulation,mainnetTransactionsSent:0}));
    return args.inspect&&!['READY_FOR_USER_SAFE_EXECUTION','ALREADY_EXECUTED'].includes(report.status)?2:0;
  }catch(error){console.error(json({status:'NOT_PREPARED',reason:error.constructor===Error&&/^[A-Z_]+$/.test(error.message)?error.message:'GOVERNANCE_READ_OR_INPUT_FAILED_DETAILS_REDACTED',mainnetTransactionsSent:0}));return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;});
