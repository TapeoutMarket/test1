import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {decodeAbiParameters, decodeFunctionData, encodeDeployData, getContractAddress, keccak256, zeroAddress} from 'viem';
import {ACCOUNTS} from './preflight.mjs';
import {buildUnsignedDeploymentPlan, currentVerificationHash, loadArtifacts, observeAndPrepare} from './prepare-deployments.mjs';

const coreHash='9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba';
const multisig='0x1f502a0b76EA9b42821B82e424C741AeF87C3D03';
const hash='0x'+'12'.repeat(32), historicalHash='0x'+'34'.repeat(32);
const owners=['0xf0972A5ee0FD4054159A8c7177e59126ef478dA9','0x15C059A5aCB36142Eea576BDbC0330Fd7E9d3099'];
const implementation='0x29fcB43b46531BcA003ddC8FCB67FFE91900C762',implementationCodeHash='0x'+'56'.repeat(32);
const artifacts=await loadArtifacts();
function governanceReview(){return {address:multisig,codeHash:keccak256('0x6001'),checkpoint:{blockNumber:10000n,blockHash:hash},currentConfigurationAcceptedForPreparation:true,getters:{VERSION:{value:'1.4.1'},getOwners:{value:owners},getThreshold:{value:2n}},configuration:{validThresholdAndUniqueNonzeroOwners:true,thresholdRequiresMultipleSignatures:true},implementation:{address:implementation,codeHash:implementationCodeHash,masterCopyGetterMatchesSlot0:true},modules:{complete:true,addresses:[]},provenance:{officialImplementationAddressAndCodeMatch:true,officialProxyFactoryCodeMatch:true,proxyRuntimeMatchesFactoryCreationReturnSection:true,officialFallbackAddressAndCodeMatch:true,guardAbsent:true}};}
const inspectFixture=async()=>governanceReview();
function fixture(){return {
  session:{chainId:56,coreVerificationInputHash:coreHash,contributions:[{role:'creator',address:ACCOUNTS.creator}],governance:{multisig,guardian:ACCOUNTS.buyerB,minimumDelaySeconds:600,owners,threshold:2,multisigCodeHash:keccak256('0x6001'),implementation,implementationCodeHash},maximumTransactionFeeWei:null,maximumTotalGasSpendWei:null},
  artifacts,verificationInputHash:coreHash,sessionHash:hash,
  observation:{chainId:56,checkpoint:{blockNumber:10000n,blockHash:hash,timestamp:1000000n},latestNonce:17,pendingNonce:17,checkpointNonce:17,creatorCode:'0x',governanceReview:governanceReview(),multisig:{address:multisig,code:'0x6001',owners,threshold:2n,nonce:4n}},
};}
function constructorArguments(tx){const item=artifacts[tx.name];return decodeAbiParameters(item.abi.find(x=>x.type==='constructor').inputs,'0x'+tx.unsignedTransaction.data.slice(item.bytecode.object.length));}
function fakeClient({changedEndNonce=false,wrongChain=false,changedProtocol=false,collision=false,failEstimate=false}={}){
  let latestReads=0,pendingReads=0;const estimates=[],requests=[];
  return {
    estimates,requests,getChainId:async()=>wrongChain?31337:56,request:async request=>{requests.push(request.method);assert.equal(request.method,'web3_clientVersion');return 'Geth/test-fixture';},
    getBlock:async args=>args.blockNumber===900n?{number:900n,hash:historicalHash}:{number:10000n,hash,timestamp:1000000n},
    getTransactionCount:async args=>{if(args.blockTag==='latest')latestReads++;if(args.blockTag==='pending')pendingReads++;return changedEndNonce&&((args.blockTag==='latest'&&latestReads>1)||(args.blockTag==='pending'&&pendingReads>1))?18:17;},
    getCode:async args=>args.address.toLowerCase()===ACCOUNTS.creator.toLowerCase()?'0x':args.address.toLowerCase()===multisig.toLowerCase()?'0x6001':args.address.toLowerCase()===ACCOUNTS.sellerA.toLowerCase()?(changedProtocol?'0x6002':'0x6000'):(collision?'0x6000':'0x'),
    readContract:async args=>{assert.equal(args.blockNumber,10000n);return {getOwners:owners,getThreshold:2n,nonce:4n}[args.functionName];},
    getGasPrice:async()=>50000000n,
    estimateGas:async args=>{estimates.push(args);if(failEstimate)throw new Error('secret-provider-details');return 101n;},
  };
}
function externalInputs(){const input=fixture();return {...input,baseline:{blockNumber:'900',blockHash:historicalHash,codeIdentities:[{field:'collection',address:ACCOUNTS.sellerA,codeHash:keccak256('0x6000')}]}};}

test('current core files still match the reviewed core hash and artifact metadata sources',async()=>{
  assert.equal(await currentVerificationHash(),coreHash);
  assert.deepEqual(Object.keys(artifacts),['GroupBuyVault','GovernanceTimelock','GroupBuyFactory','ERC1967Proxy']);
});
test('exactly four unsigned CREATE requests derive sequential nonces and addresses',()=>{
  const report=buildUnsignedDeploymentPlan(fixture());
  assert.equal(report.transactions.length,4);
  for(const [i,tx] of report.transactions.entries()){
    assert.deepEqual(Object.keys(tx.unsignedTransaction).sort(),['chainId','data','from','nonce','to','value']);
    assert.equal(tx.unsignedTransaction.chainId,56);assert.equal(tx.unsignedTransaction.from,ACCOUNTS.creator);assert.equal(tx.unsignedTransaction.to,null);assert.equal(tx.unsignedTransaction.value,'0');assert.equal(tx.unsignedTransaction.nonce,17+i);
    assert.equal(tx.expectedContractAddress,getContractAddress({from:ACCOUNTS.creator,nonce:17n+BigInt(i)}));
    assert.equal(tx.initCodeHash,keccak256(tx.unsignedTransaction.data));
    assert.equal(tx.unsignedTransaction.data,encodeDeployData({abi:artifacts[tx.name].abi,bytecode:artifacts[tx.name].bytecode.object,args:tx.constructorArguments}));
  }
});
test('Timelock constructor embeds only the confirmed Safe as proposer and executor with 600 second floor',()=>{
  const report=buildUnsignedDeploymentPlan(fixture());const args=constructorArguments(report.transactions[1]);
  assert.equal(args[0],600n);assert.deepEqual(args[1].map(a=>a.toLowerCase()),[multisig.toLowerCase()]);assert.deepEqual(args[2],args[1]);
  assert.equal(report.governance.externalBootstrapAdministrator,zeroAddress);
});
test('proxy initializes atomically with predicted implementation, Timelock and independent guardian',()=>{
  const report=buildUnsignedDeploymentPlan(fixture()),args=constructorArguments(report.transactions[3]);
  assert.equal(args[0],report.expectedAddresses.GroupBuyFactory);
  const call=decodeFunctionData({abi:artifacts.GroupBuyFactory.abi,data:args[1]});
  assert.equal(call.functionName,'initialize');assert.deepEqual(call.args,[report.expectedAddresses.GovernanceTimelock,ACCOUNTS.buyerB,600n]);
  assert.equal(report.proxyInitialization.atomic,true);
});
test('changing nonce changes every expected CREATE address and proxy bindings',()=>{
  const a=buildUnsignedDeploymentPlan(fixture()),input=fixture();Object.assign(input.observation,{latestNonce:18,pendingNonce:18,checkpointNonce:18});const b=buildUnsignedDeploymentPlan(input);
  for(const name of Object.keys(a.expectedAddresses))assert.notEqual(a.expectedAddresses[name],b.expectedAddresses[name]);
  const [implementation,call]=constructorArguments(b.transactions[3]);assert.equal(implementation,b.expectedAddresses.GroupBuyFactory);assert.equal(decodeFunctionData({abi:artifacts.GroupBuyFactory.abi,data:call}).args[0],b.expectedAddresses.GovernanceTimelock);
});
test('pending transactions or checkpoint nonce drift invalidate the complete bundle',()=>{
  for(const field of ['pendingNonce','checkpointNonce']){const input=fixture();input.observation[field]=18;assert.throws(()=>buildUnsignedDeploymentPlan(input),/CREATOR_NONCE_UNSTABLE_OR_PENDING/);}
});
test('changed core hash and non-BSC identities are rejected',()=>{
  const input=fixture();input.verificationInputHash='ab'.repeat(32);assert.throws(()=>buildUnsignedDeploymentPlan(input),/CORE_VERIFICATION_HASH_MISMATCH/);
  const other=fixture();other.observation.chainId=31337;assert.throws(()=>buildUnsignedDeploymentPlan(other),/CHAIN_ID_MISMATCH/);
});
test('zero delay and overlapping guardian governance addresses are rejected',()=>{
  const a=fixture();a.session.governance.minimumDelaySeconds=0;assert.throws(()=>buildUnsignedDeploymentPlan(a),/POSITIVE_TIMELOCK_DELAY_REQUIRED/);
  for(const shared of [multisig,ACCOUNTS.creator]){const b=fixture();b.session.governance.guardian=shared;assert.throws(()=>buildUnsignedDeploymentPlan(b),/GUARDIAN_MUST_BE_INDEPENDENT/);}
});
test('a label cannot substitute for multisig code or distinct threshold owners',()=>{
  const noCode=fixture();noCode.observation.multisig.code='0x';assert.throws(()=>buildUnsignedDeploymentPlan(noCode),/MULTISIG_IDENTITY_UNAVAILABLE/);
  for(const [threshold,addresses] of [[1n,owners],[3n,owners],[2n,[owners[0],owners[0]]]]){const x=fixture();Object.assign(x.observation.multisig,{threshold,owners:addresses});assert.throws(()=>buildUnsignedDeploymentPlan(x),/INVALID_MULTISIG_THRESHOLD_OR_OWNERS/);}
});
test('creator contracts and malformed or negative nonces are rejected',()=>{
  const a=fixture();a.observation.creatorCode='0x6001';assert.throws(()=>buildUnsignedDeploymentPlan(a),/CREATOR_MUST_BE_PLAIN_EOA/);
  const b=fixture();b.observation.latestNonce=-1;assert.throws(()=>buildUnsignedDeploymentPlan(b),/INVALID_UNSIGNED_INTEGER/);
});
test('prepared report keeps later governance, proxy gas, release gate and signatures explicitly incomplete',()=>{
  const report=buildUnsignedDeploymentPlan(fixture());assert.equal(report.transactions[3].gas.status,'NOT_ESTIMATED_DEPENDENCIES_NOT_DEPLOYED');assert.equal(report.laterGovernance.status,'NOT_PREPARED');assert.equal(report.reviewedLiveManifest,false);assert.equal(report.readyToSign,false);assert.equal(report.mainnetTransactionsSent,0);assert.equal(report.orderSignaturesCreated,0);assert.equal(report.privateKeysConsumed,false);assert.equal(report.gasBudget.approvalOrReleaseGateSet,false);
});
test('read-only preparation estimates only first three deployments, rounds gas buffer up, and leaves transactions unsigned',async()=>{
  const client=fakeClient(),report=await observeAndPrepare(client,externalInputs(),inspectFixture);assert.equal(client.estimates.length,3);
  for(const tx of report.transactions.slice(0,3)){assert.equal(tx.gas.with20PercentBuffer,122n);assert.equal(tx.gas.estimatedFeeAtObservedGasPriceWei,6100000000n);assert.equal(tx.unsignedTransaction.gas,undefined);}
  assert.equal(report.gasBudget.estimatedFirstThreeFeeWei,18300000000n);assert.equal(report.transactions[3].gas.status,'NOT_ESTIMATED_DEPENDENCIES_NOT_DEPLOYED');assert.deepEqual(client.requests,['web3_clientVersion']);
});
test('nonce change during read-only preparation prevents saving a stale sequence',async()=>{
  await assert.rejects(observeAndPrepare(fakeClient({changedEndNonce:true}),externalInputs(),inspectFixture),/CREATOR_NONCE_CHANGED_REGENERATE_BUNDLE/);
});
test('chain, protocol code drift and occupied CREATE address fail closed',async()=>{
  await assert.rejects(observeAndPrepare(fakeClient({wrongChain:true}),externalInputs(),inspectFixture),/MAINNET_IDENTITY_REJECTED/);
  await assert.rejects(observeAndPrepare(fakeClient({changedProtocol:true}),externalInputs(),inspectFixture),/PROTOCOL_RUNTIME_CHANGED/);
  await assert.rejects(observeAndPrepare(fakeClient({collision:true}),externalInputs(),inspectFixture),/PREDICTED_ADDRESS_ALREADY_HAS_CODE/);
});
test('unavailable gas estimates do not fabricate values or disclose provider error text',async()=>{
  const report=await observeAndPrepare(fakeClient({failEstimate:true}),externalInputs(),inspectFixture);assert.equal(report.gasBudget.estimatedFirstThreeFeeWei,null);assert.equal(report.transactions[0].gas.status,'NOT_ESTIMATED');assert.equal(JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v).includes('secret-provider-details'),false);
});
test('full Safe review must reject unreviewed modules, guard, implementation and owner drift',()=>{
  for(const mutate of [r=>{r.modules.addresses=[ACCOUNTS.creator];},r=>{r.modules.complete=false;},r=>{r.provenance.guardAbsent=false;},r=>{r.provenance.officialImplementationAddressAndCodeMatch=false;},r=>{r.currentConfigurationAcceptedForPreparation=false;}]){const input=fixture();mutate(input.observation.governanceReview);assert.throws(()=>buildUnsignedDeploymentPlan(input),/MULTISIG_FULL_CONFIGURATION_NOT_ACCEPTED/);}
  const input=fixture();input.session.governance.owners=[ACCOUNTS.creator,owners[1]];assert.throws(()=>buildUnsignedDeploymentPlan(input),/MULTISIG_OWNERS_OR_THRESHOLD_CHANGED/);
});
test('Safe review at a different checkpoint or with changed implementation is rejected',()=>{
  const input=fixture();input.observation.governanceReview.checkpoint.blockHash=historicalHash;assert.throws(()=>buildUnsignedDeploymentPlan(input),/MULTISIG_REVIEW_CHECKPOINT_OR_IDENTITY_MISMATCH/);
  const other=fixture();other.session.governance.implementationCodeHash=hash;assert.throws(()=>buildUnsignedDeploymentPlan(other),/MULTISIG_CODE_IDENTITY_CHANGED/);
});
test('governance inspector finalized request is pinned to the same preparation block',async()=>{
  await observeAndPrepare(fakeClient(),externalInputs(),async client=>{const block=await client.getBlock({blockTag:'finalized'});assert.equal(block.number,10000n);return governanceReview();});
});
test('CLI rejects broadcasting or missing env before environment access and network',()=>{
  for(const args of [[],['--env','../.env','--broadcast'],['--env','--broadcast']]){const result=spawnSync(process.execPath,['live-test/prepare-deployments.mjs',...args],{encoding:'utf8'});assert.equal(result.status,1);assert.equal(JSON.parse(result.stderr).reason,'EXPLICIT_ENV_ARGUMENT_ONLY');assert.equal(JSON.parse(result.stderr).mainnetTransactionsSent,0);assert.equal(result.stdout,'');}
});
