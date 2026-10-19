import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {decodeFunctionData,encodeAbiParameters,encodeFunctionData,keccak256,stringToHex,zeroAddress,zeroHash} from 'viem';
import {ACCOUNTS} from './preflight.mjs';
import {loadArtifacts} from './prepare-deployments.mjs';
import {buildGovernanceBundle,configurationHash,loadConfig,operationReadiness,parseArguments,inspectConfiguration,verifyDeploymentEvidence,replayRoleEvents,validateGovernanceRehearsal} from './governance.mjs';

const session=JSON.parse(await fs.readFile(new URL('./SESSION_PLAN.json',import.meta.url)));
const baseline=JSON.parse(await fs.readFile(new URL('../reports/authorized-source-observation.json',import.meta.url)));
const artifacts=await loadArtifacts();
const hash='0x'+'12'.repeat(32),secondHash='0x'+'34'.repeat(32);
const addresses={template:'0x1000000000000000000000000000000000000001',timelock:'0x2000000000000000000000000000000000000002',factoryImplementation:'0x3000000000000000000000000000000000000003',factory:'0x4000000000000000000000000000000000000004'};
const names=['GroupBuyVault','GovernanceTimelock','GroupBuyFactory','ERC1967Proxy'];
const keys=['template','timelock','factoryImplementation','factory'];
const runtime='0x60006000',runtimeHash=keccak256(runtime);
const validatorReference={address:'0x5000000000000000000000000000000000000005',codeHash:runtimeHash,matchesCompiledRuntime:true};
function input(){return {addresses:structuredClone(addresses),session:structuredClone(session),config:loadConfig(session,baseline),templateCodeHash:runtimeHash,sessionHash:hash};}
const build=()=>buildGovernanceBundle(input());
function safeReview(){return {currentConfigurationAcceptedForPreparation:true,address:session.governance.multisig,codeHash:session.governance.multisigCodeHash,getters:{VERSION:{value:'1.4.1'},getOwners:{value:session.governance.owners},getThreshold:{value:2n}},configuration:{validThresholdAndUniqueNonzeroOwners:true,thresholdRequiresMultipleSignatures:true},implementation:{address:session.governance.implementation,codeHash:session.governance.implementationCodeHash,masterCopyGetterMatchesSlot0:true},modules:{complete:true,addresses:[]},provenance:{officialImplementationAddressAndCodeMatch:true,officialProxyFactoryCodeMatch:true,proxyRuntimeMatchesFactoryCreationReturnSection:true,officialFallbackAddressAndCodeMatch:true,guardAbsent:true}};}
function state(){return {schemaVersion:1,chainId:56,status:'DEPLOYED_UNCONFIGURED',sessionHash:hash,verificationInputHash:session.coreVerificationInputHash,addresses,steps:names.map((name,i)=>({step:i+1,name,transactionHash:'0x'+String(i+1).padStart(64,'0'),status:'CONFIRMED',expectedContractAddress:addresses[keys[i]],runtimeCodeHash:runtimeHash,receipt:{blockNumber:String(100+i),blockHash:secondHash,status:'success'}}))};}
const roleIds={proposer:keccak256(stringToHex('PROPOSER_ROLE')),executor:keccak256(stringToHex('EXECUTOR_ROLE')),canceller:keccak256(stringToHex('CANCELLER_ROLE'))};
const roleInputs={timelock:addresses.timelock,safe:session.governance.multisig,...roleIds};
function roleLog(role,account,index=0,kind='RoleGranted'){return {address:addresses.timelock,blockNumber:101n,blockHash:secondHash,transactionHash:hash,logIndex:index,removed:false,data:'0x',topics:[keccak256(stringToHex(`${kind}(bytes32,address,address)`)),role,'0x'+'0'.repeat(24)+account.slice(2).toLowerCase(),'0x'+'0'.repeat(24)+addresses.timelock.slice(2)]};}
function constructorRoleLogs(){return [[zeroHash,addresses.timelock],[roleIds.proposer,session.governance.multisig],[roleIds.executor,session.governance.multisig],[roleIds.canceller,session.governance.multisig]].map(([role,account],i)=>roleLog(role,account,i));}
function inspectionFixture(options={}){
  const bundle=build(),deployment=state(),calls=[];
  const roles={PROPOSER_ROLE:keccak256(stringToHex('PROPOSER_ROLE')),EXECUTOR_ROLE:keccak256(stringToHex('EXECUTOR_ROLE')),CANCELLER_ROLE:keccak256(stringToHex('CANCELLER_ROLE'))};
  const fakeBaseline={...baseline,codeIdentities:baseline.codeIdentities.map(e=>({...e,codeHash:runtimeHash}))};
  const client={
    calls,getChainId:async()=>options.chain??56,request:async arg=>{calls.push(arg.method);assert.equal(arg.method,'web3_clientVersion');return options.version??'Geth/test-fixture';},
    getBlock:async()=>({number:10000n,hash,timestamp:1000n}),
    getCode:async()=>runtime,
    getLogs:async args=>args.fromBlock<=101n&&args.toBlock>=101n?constructorRoleLogs():[],
    getStorageAt:async()=> '0x'+'0'.repeat(24)+(options.implementation??addresses.factoryImplementation).slice(2),
    readContract:async arg=>{
      assert.equal(arg.blockNumber,10000n);calls.push(arg.functionName);
      if(arg.functionName==='hasRole'){
        const [role,who]=arg.args;
        if(options.guardianRole&&who.toLowerCase()===session.governance.guardian.toLowerCase())return true;
        return role===zeroHash?who.toLowerCase()===addresses.timelock.toLowerCase():who.toLowerCase()===session.governance.multisig.toLowerCase();
      }
      const status=options.state??0;
      return ({...roles,upgradeAdmin:addresses.timelock,guardian:session.governance.guardian,requiredMinDelay:600n,getMinDelay:options.delay??600n,minimumDelayFloor:600n,deploymentAddress:addresses.timelock,implementationSelf:addresses.template,templateInitializersDisabled:true,vaultTemplateId:keccak256(stringToHex('TapeOut.GroupBuyVault.v1')),marketValidator:'0x5000000000000000000000000000000000000005',information:['1.6',bundle.config.seaportDomainSeparator,zeroAddress],hashConfig:bundle.configHash,hashOperationBatch:options.wrongHash?secondHash:bundle.operationId,getOperationState:status,getTimestamp:[0n,1600n,900n,1n][status],isOperationReady:status===2,isOperationDone:status===3,selectedTemplate:status===3?addresses.template:zeroAddress,selectedConfigHash:status===3?bundle.configHash:zeroHash,creationPaused:options.unpaused?false:status!==3,templateApproval:{approved:status===3,codeHash:runtimeHash,version:1},configuration:[bundle.config,status===3]})[arg.functionName];
    },
    simulateContract:async arg=>{calls.push('simulate:'+arg.functionName);assert.equal(arg.account,bundle.safe);if(options.simulationFailure)throw new Error('sensitive provider URL');return {};},
  };
  return {client,inputs:{session,baseline:fakeBaseline,addresses,artifacts,bundle,state:deployment,rehearsal:{deploymentChecks:{validator:structuredClone(validatorReference)}}},inspector:async()=>safeReview()};
}

test('real protocol config matches original fork version and fee recipient stays outside Config',()=>{
  const config=loadConfig(session,baseline);assert.equal(config.marketKind,0);assert.equal(config.mockOnly,false);assert.equal(config.templateVersion,1);assert.equal(config.safetyMargin,'300');assert.equal(config.market,baseline.market);assert.equal(config.feeRecipient,undefined);assert.equal(config.seaportVersionHash,keccak256(stringToHex('1.6')));
});
test('baseline/session NFT mismatch and unknown Seaport versions are rejected',()=>{
  assert.throws(()=>loadConfig({...session,tokenId:'99'},baseline),/SESSION_MINER_IDENTITY_CHANGED/);
  assert.throws(()=>loadConfig(session,{...baseline,seaport:{...baseline.seaport,version:'1.5'}}),/UNEXPECTED_SEAPORT_VERSION/);
});
test('four atomic actions encode using the actual compiled Factory ABI',()=>{
  const b=build();assert.deepEqual(b.actions,['approveTemplate','approveConfig','selectConfiguration','resumeCreation']);
  for(let i=0;i<4;i++){const call=decodeFunctionData({abi:artifacts.GroupBuyFactory.abi,data:b.batch.payloads[i]});assert.equal(call.functionName,b.actions[i]);}
  assert.deepEqual(decodeFunctionData({abi:artifacts.GroupBuyFactory.abi,data:b.batch.payloads[0]}).args,[addresses.template,1,runtimeHash]);
  assert.deepEqual(decodeFunctionData({abi:artifacts.GroupBuyFactory.abi,data:b.batch.payloads[2]}).args,[addresses.template,b.configHash]);
  const config=decodeFunctionData({abi:artifacts.GroupBuyFactory.abi,data:b.batch.payloads[1]}).args[0];assert.equal(configurationHash(config),b.configHash);
});
test('scheduleBatch and executeBatch agree exactly on operation identity and carry zero value',()=>{
  const b=build(),s=decodeFunctionData({abi:artifacts.GovernanceTimelock.abi,data:b.scheduleData}),e=decodeFunctionData({abi:artifacts.GovernanceTimelock.abi,data:b.executeData});
  assert.equal(s.functionName,'scheduleBatch');assert.equal(e.functionName,'executeBatch');assert.equal(s.args[5],600n);assert.deepEqual(s.args.slice(0,5),e.args);assert.ok(b.batch.values.every(v=>v===0n));assert.ok(b.batch.targets.every(v=>v===addresses.factory));assert.equal(b.batch.predecessor,zeroHash);
  assert.equal(b.operationId,keccak256(encodeAbiParameters(artifacts.GovernanceTimelock.abi.find(f=>f.name==='hashOperationBatch').inputs,e.args)));
});
test('Safe imports use official raw-data BatchFile shape without signatures, invented nonce or Safe service calls',()=>{
  const b=build();for(const [safe,data]of [[b.scheduleSafe,b.scheduleData],[b.executeSafe,b.executeData]]){assert.equal(safe.version,'1.0');assert.equal(safe.chainId,'56');assert.equal(safe.meta.createdFromSafeAddress,b.safe);assert.deepEqual(safe.transactions,[{to:addresses.timelock,value:'0',data}]);assert.equal(safe.nonce,undefined);assert.equal(safe.signatures,undefined);}assert.equal(b.mainnetTransactionsSent,0);assert.equal(b.privateKeysConsumed,false);assert.equal(b.safeServiceRequests,0);
});
test('salt binds session, template hash, addresses, and config so an old schedule cannot replay on changed deployment',()=>{
  const original=build();for(const mutate of [a=>a.sessionHash=secondHash,a=>a.templateCodeHash=secondHash,a=>a.addresses.factory='0x6000000000000000000000000000000000000006',a=>a.config.marketCodeHash=secondHash]){const a=input();mutate(a);const b=buildGovernanceBundle(a);assert.notEqual(b.salt,original.salt);assert.notEqual(b.operationId,original.operationId);}assert.equal(build().operationId,original.operationId);
});
test('builder rejects mocked/reserved protocol, alternate delay, and collapsed authority',()=>{
  for(const mutate of [a=>a.config.marketKind=1,a=>a.config.mockOnly=true,a=>a.config.chainId='31337',a=>a.config.feeRecipient=ACCOUNTS.creator,a=>a.session.governance.minimumDelaySeconds=1,a=>a.session.governance.threshold=1,a=>a.addresses.timelock=a.addresses.factory]){const a=input();mutate(a);assert.throws(()=>buildGovernanceBundle(a));}
});
test('readiness distinguishes unscheduled/waiting/ready/done and refuses contradictory states',()=>{
  const expectations=['SCHEDULE_REQUIRED','WAITING_TIMELOCK_DO_NOT_EXECUTE','READY_FOR_USER_SAFE_EXECUTION','ALREADY_EXECUTED'];
  for(let state=0;state<4;state++){const r=operationReadiness({state,timestamp:[0n,1600n,900n,1n][state],now:1000n,ready:state===2,done:state===3});assert.equal(r.status,expectations[state]);assert.equal(r.canExecute,state===2);assert.equal(r.remainingSeconds,state===1?600n:0n);}
  assert.throws(()=>operationReadiness({state:1,timestamp:1600n,now:1000n,ready:true,done:false}),/INCONSISTENT_OPERATION_STATE/);
  assert.throws(()=>operationReadiness({state:2,timestamp:1600n,now:1000n,ready:true,done:false}),/INCONSISTENT_OPERATION_TIMESTAMP/);
});
test('complete role event replay rejects any hidden extra admin/executor and accepts a revoked temporary grant',()=>{
  assert.equal(replayRoleEvents(constructorRoleLogs(),roleInputs).eventsProcessed,4);
  const grant=roleLog(roleIds.executor,ACCOUNTS.creator,4);
  assert.throws(()=>replayRoleEvents([...constructorRoleLogs(),grant],roleInputs),/UNEXPECTED_TIMELOCK_ROLE_HISTORY/);
  const revoke=roleLog(roleIds.executor,ACCOUNTS.creator,5,'RoleRevoked');assert.equal(replayRoleEvents([...constructorRoleLogs(),grant,revoke],roleInputs).eventsProcessed,6);
  assert.throws(()=>replayRoleEvents(constructorRoleLogs().slice(1),roleInputs),/UNEXPECTED_TIMELOCK_ROLE_HISTORY/);
  assert.throws(()=>replayRoleEvents([...constructorRoleLogs(),constructorRoleLogs()[0]],roleInputs),/DUPLICATE_ROLE_EVENT/);
});
test('live inspection verifies configured Safe, receipt runtimes, immutable Timelock floor and schedule simulation',async()=>{
  const f=inspectionFixture(),r=await inspectConfiguration(f.client,f.inputs,f.inspector);assert.equal(r.status,'SCHEDULE_REQUIRED');assert.equal(r.minimumDelayFloor,600n);assert.equal(r.simulation.method,'scheduleBatch');assert.equal(r.roles.length,14);assert.equal(r.mainnetTransactionsSent,0);assert.equal(r.privateKeysConsumed,false);assert.ok(f.client.calls.includes('hashOperationBatch'));
});
test('waiting does not simulate or send execute; ready simulates only the inner Timelock call',async()=>{
  const waiting=inspectionFixture({state:1}),a=await inspectConfiguration(waiting.client,waiting.inputs,waiting.inspector);assert.equal(a.operation.remainingSeconds,600n);assert.equal(a.simulation.status,'NOT_RUN');assert.ok(!waiting.client.calls.some(c=>c.startsWith('simulate:')));
  const ready=inspectionFixture({state:2}),b=await inspectConfiguration(ready.client,ready.inputs,ready.inspector);assert.equal(b.status,'READY_FOR_USER_SAFE_EXECUTION');assert.equal(b.simulation.method,'executeBatch');assert.equal(b.simulation.scope,'INNER_TIMELOCK_CALL_NOT_SAFE_SIGNATURE_EXECUTION');
});
test('done requires selected approved fixed template/config and creation resumed',async()=>{
  const f=inspectionFixture({state:3}),r=await inspectConfiguration(f.client,f.inputs,f.inspector);assert.equal(r.status,'ALREADY_EXECUTED');assert.equal(r.creationPaused,false);assert.equal(r.selectedConfigHash,f.inputs.bundle.configHash);
});
test('mainnet inspection rejects local fork, changed implementation, guardian role and early unpause',async()=>{
  for(const option of [{chain:31337},{version:'anvil/v1.4'},{implementation:ACCOUNTS.creator},{guardianRole:true},{delay:1n},{wrongHash:true},{unpaused:true}]){const f=inspectionFixture(option);await assert.rejects(inspectConfiguration(f.client,f.inputs,f.inspector));}
});
test('inspection rechecks Safe owners/modules and rejects altered template runtime',async()=>{
  const f=inspectionFixture();await assert.rejects(inspectConfiguration(f.client,f.inputs,async()=>{const r=safeReview();r.modules.addresses=[ACCOUNTS.creator];return r;}),/SAFE_CONFIGURATION_OR_IDENTITY_CHANGED/);
  await assert.rejects(inspectConfiguration(f.client,f.inputs,async()=>{const r=safeReview();r.getters.getOwners.value=[ACCOUNTS.creator,session.governance.owners[0]];return r;}),/SAFE_OWNERS_OR_THRESHOLD_CHANGED/);
  f.inputs.state.steps[0].runtimeCodeHash=secondHash;await assert.rejects(inspectConfiguration(f.client,f.inputs,f.inspector),/DEPLOYED_RUNTIME_CHANGED/);
});
test('validator address and code must match the source-matched rehearsal, not merely have code',async()=>{
  for(const mutate of [v=>v.address=ACCOUNTS.creator,v=>v.codeHash=secondHash,v=>v.matchesCompiledRuntime=false]){const f=inspectionFixture();mutate(f.inputs.rehearsal.deploymentChecks.validator);await assert.rejects(inspectConfiguration(f.client,f.inputs,f.inspector),/TEMPLATE_VALIDATOR_DIFFERS_FROM_REHEARSAL/);}
});
function receiptFixture(options={}){
  const deployment=state(),draft={chainId:56,sessionHash:hash,verificationInputHash:session.coreVerificationInputHash,expectedAddresses:Object.fromEntries(names.map((n,i)=>[n,addresses[keys[i]]])),checkpoint:{blockNumber:'90',blockHash:hash},transactions:names.map((name,i)=>({name,expectedContractAddress:addresses[keys[i]],initCodeHash:keccak256('0x6000'),unsignedTransaction:{nonce:17+i}}))};
  const number=txHash=>Number(BigInt(txHash))-1;
  const client={getChainId:async()=>56,request:async()=>options.fork?'anvil/v1.4':'Geth',getBlockNumber:async()=>1000n,getBlock:async({blockNumber})=>({number:blockNumber,hash:blockNumber===90n?hash:secondHash}),getCode:async()=>runtime,
    getTransactionReceipt:async({hash:txHash})=>{const i=number(txHash);return {transactionHash:txHash,blockNumber:BigInt(100+i),blockHash:secondHash,from:ACCOUNTS.creator,to:null,contractAddress:addresses[keys[i]],status:options.failed?'reverted':'success',gasUsed:100n,effectiveGasPrice:50n,logs:[]};},
    getTransaction:async({hash:txHash})=>{const i=number(txHash);return {hash:txHash,blockNumber:BigInt(100+i),blockHash:secondHash,from:ACCOUNTS.creator,to:null,value:0n,input:options.changedData?'0x6001':'0x6000',chainId:56,nonce:17+i+(options.changedNonce?1:0)};},
  };
  return {client,inputs:{state:deployment,draft,session,sessionHash:hash,verificationInputHash:session.coreVerificationInputHash}};
}
function rehearsalFixture(){
  const {inputs:{state,draft}}=receiptFixture(),toolHash='ab'.repeat(32);state.bootstrapToolHash=toolHash;
  for(let i=0;i<4;i++)draft.transactions[i].step=i+1;
  const rehearsal={status:'PASS',scope:'LOCAL_FORK_DEPLOYMENT_REHEARSAL',cleanup:{status:'PASS'},bundleHash:secondHash,sessionHash:hash,verificationInputHash:session.coreVerificationInputHash,bootstrapToolHash:toolHash,sourceCheckpoint:draft.checkpoint,deployments:draft.transactions.map((tx,i)=>({step:i+1,name:tx.name,address:tx.expectedContractAddress,initCodeHash:tx.initCodeHash,runtimeCodeHash:runtimeHash})),deploymentChecks:{validator:structuredClone(validatorReference)}};
  return {state,draft,rehearsal,bundleHash:secondHash,sessionHash:hash,toolHash};
}
test('governance preparation binds passing cleaned-up rehearsal, input hashes and all four runtime identities',()=>{
  const f=rehearsalFixture();assert.deepEqual(validateGovernanceRehearsal(f),validatorReference);
  for(const mutate of [f=>f.rehearsal.status='FAIL',f=>f.rehearsal.cleanup.status='FAIL',f=>f.rehearsal.bundleHash=hash,f=>f.rehearsal.sessionHash=secondHash,f=>f.rehearsal.verificationInputHash='aa'.repeat(32),f=>f.rehearsal.bootstrapToolHash='bb'.repeat(32),f=>f.state.bootstrapToolHash='bb'.repeat(32),f=>f.state.steps[3].runtimeCodeHash=secondHash,f=>f.rehearsal.deploymentChecks.validator.matchesCompiledRuntime=false]){const x=rehearsalFixture();mutate(x);assert.throws(()=>validateGovernanceRehearsal(x));}
});
test('deployment state is only an index: four canonical CREATE transactions independently bind initcode nonce runtime',async()=>{
  const f=receiptFixture(),e=await verifyDeploymentEvidence(f.client,f.inputs);assert.equal(e.receipts.length,4);assert.equal(e.receipts[3].address,addresses.factory);assert.equal(e.addresses.template,addresses.template);
});
test('fork receipts, failed CREATE, altered initcode and nonce drift cannot qualify as deployment evidence',async()=>{
  for(const options of [{fork:true},{failed:true},{changedData:true},{changedNonce:true}]){const f=receiptFixture(options);await assert.rejects(verifyDeploymentEvidence(f.client,f.inputs));}
  const f=receiptFixture();f.inputs.state.status='LOCAL_DEPLOYED';await assert.rejects(verifyDeploymentEvidence(f.client,f.inputs),/VERIFIED_MAINNET_DEPLOYMENT_STATE_REQUIRED/);
});
test('CLI accepts only explicit local inputs and never accepts broadcast/sign/private-key arguments',()=>{
  assert.deepEqual(parseArguments(['--env','../.env','--deployment','live-test/deployment-state.json','--inspect']),{env:'../.env',deployment:'live-test/deployment-state.json',inspect:true});
  for(const argv of [[],['--env','../.env','--deployment','x','--broadcast'],['--env','../.env','--deployment','x','--private-key','x'],['--env','../.env','--deployment','x','--inspect','--inspect']]){const r=spawnSync(process.execPath,['live-test/governance.mjs',...argv],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(JSON.parse(r.stderr).mainnetTransactionsSent,0);assert.equal(r.stdout,'');}
});
