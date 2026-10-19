import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {keccak256,zeroHash} from 'viem';
import {argumentsFor,positiveBNB,humanGates,validateRehearsal,assertUnchangedPreview,sendRecordedOnce,assertLedgerMatchesState,assertRpcUnchanged,assertFreshNonce,deploymentPostconditions} from './deploy-mainnet.mjs';

const bundle=JSON.parse(await fs.readFile(new URL('./observations/unsigned-deployments-1792415847788.json',import.meta.url)));
const hash='0x'+'ab'.repeat(32),otherHash='0x'+'cd'.repeat(32),toolHash='ef'.repeat(32);
const flags=['--env','../.env','--bundle','draft.json','--rehearsal','rehearsal.json','--step','1'];
const liveEnv={MODE:'live',ALLOW_LIVE_SEND:'true',LIVE_RELEASE_VERIFIED:'true'};
const options={broadcast:true,maxTx:'0.0006',maxTotal:'0.0015'};
const rehearsal=()=>({status:'PASS',scope:'LOCAL_FORK_DEPLOYMENT_REHEARSAL',cleanup:{status:'PASS'},bundleHash:hash,sessionHash:hash,verificationInputHash:bundle.verificationInputHash,bootstrapToolHash:toolHash,sourceCheckpoint:bundle.checkpoint,deployments:bundle.transactions.map(x=>({step:x.step,address:x.expectedContractAddress,initCodeHash:x.initCodeHash,runtimeCodeHash:hash}))});
const bindings={bundleHash:hash,sessionHash:hash,toolHash};

test('default is read-only and reconcile cannot combine with broadcast',()=>{
  assert.equal(argumentsFor(flags).broadcast,false);
  assert.equal(argumentsFor([...flags,'--reconcile']).reconcile,true);
  assert.throws(()=>argumentsFor([...flags,'--reconcile','--broadcast']),/EXCLUSIVE/);
});
test('duplicate, unknown, missing and invalid step arguments stop early',()=>{
  for(const extra of [['--step','2'],['--private-key','SECRET'],['--broadcast'],['--max-tx-fee-bnb']])assert.throws(()=>argumentsFor([...flags,...extra]));
  assert.throws(()=>argumentsFor(flags.slice(0,-1).concat('0')),/STEP/);
  assert.throws(()=>argumentsFor(flags.slice(0,-1).concat('5')),/STEP/);
});
test('broadcast requires a reviewed raw bundle hash',()=>{
  assert.throws(()=>argumentsFor([...flags,'--broadcast']),/REVIEWED/);
  const parsed=argumentsFor([...flags,'--broadcast','--reviewed-bundle-hash',hash]);
  assert.equal(parsed.reviewedBundleHash,hash);
});
test('fee limits require positive exact decimal BNB without exponent or truncation',()=>{
  assert.equal(positiveBNB('0.0006'),600000000000000n);
  for(const value of [undefined,'0','-1','1e-3','0.0000000000000000001','01','NaN','1.'])assert.throws(()=>positiveBNB(value));
});
test('all human gates and both actual TTY streams must be present',()=>{
  assert.deepEqual(humanGates(options,liveEnv,true),{maxTxWei:600000000000000n,maxTotalWei:1500000000000000n});
  assert.throws(()=>humanGates(options,liveEnv,false),/TERMINAL/);
  for(const key of Object.keys(liveEnv))assert.throws(()=>humanGates(options,{...liveEnv,[key]:'false'},true));
});
test('noninteractive CLI refuses broadcast before reading nonexistent env or network',()=>{
  const result=spawnSync(process.execPath,['live-test/deploy-mainnet.mjs',...flags,'--broadcast','--reviewed-bundle-hash',hash,'--max-tx-fee-bnb','0.0006','--max-total-spend-bnb','0.0015'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,...liveEnv},encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/HUMAN_INTERACTIVE_TERMINAL_REQUIRED/);
  assert.doesNotMatch(result.stderr,/ENOENT|SECRET|https?:\/\//);
});
test('rehearsal requires successful cleanup and all four exact deployment identities',()=>{
  validateRehearsal(bundle,rehearsal(),bindings);
  for(const mutate of [r=>r.status='FAIL',r=>r.cleanup.status='FAIL',r=>r.scope='MOCK',r=>r.deployments.pop(),r=>r.deployments[3].address=bundle.transactions[0].expectedContractAddress,r=>r.deployments[0].initCodeHash=otherHash,r=>r.deployments[1].runtimeCodeHash='0x']){
    const r=rehearsal();mutate(r);assert.throws(()=>validateRehearsal(bundle,r,bindings));
  }
});
test('changed session, source, tool, bundle or checkpoint invalidates rehearsal',()=>{
  for(const mutate of [r=>r.bundleHash=otherHash,r=>r.sessionHash=otherHash,r=>r.verificationInputHash='changed',r=>r.bootstrapToolHash='changed',r=>r.sourceCheckpoint={...r.sourceCheckpoint,blockHash:otherHash},r=>r.sourceCheckpoint={...r.sourceCheckpoint,blockNumber:'1'}]){
    const r=rehearsal();mutate(r);assert.throws(()=>validateRehearsal(bundle,r,bindings));
  }
});
test('confirmation cannot silently permit a changed nonce, payload, address or gas price',()=>{
  const p={step:1,nonce:5,initCodeHash:hash,expectedContractAddress:bundle.transactions[0].expectedContractAddress,gas:100n,gasPrice:50n,maxFeeWei:5000n};
  assertUnchangedPreview(p,{...p});
  for(const field of Object.keys(p))assert.throws(()=>assertUnchangedPreview(p,{...p,[field]:'changed'}),/CONFIRMED_TRANSACTION_CHANGED/);
});
test('budget reservation and both durable journals precede the only broadcast',async()=>{
  const calls=[],raw='0x123456',expected=keccak256(raw);
  const actual=await sendRecordedOnce({reservation:async()=>calls.push('reserve'),saveReserved:async()=>calls.push('journal-reserved'),sign:async()=>{calls.push('sign');return raw;},saveSigned:async h=>{assert.equal(h,expected);calls.push('journal-hash');},send:async r=>{assert.equal(r,raw);calls.push('send');return expected;}});
  assert.equal(actual,expected);assert.deepEqual(calls,['reserve','journal-reserved','sign','journal-hash','send']);
});
for(const stage of ['reservation','saveReserved','sign','saveSigned'])test(`failure at ${stage} never broadcasts or advances to another stage`,async()=>{
  const calls=[],stages=['reservation','saveReserved','sign','saveSigned','send'];
  const callbacks=Object.fromEntries(stages.map(name=>[name,async()=>{calls.push(name);if(name===stage)throw new Error('INJECTED_FAILURE');return name==='sign'?'0x123456':keccak256('0x123456');}]));
  await assert.rejects(sendRecordedOnce(callbacks),/INJECTED_FAILURE/);
  assert.deepEqual(calls,stages.slice(0,stages.indexOf(stage)+1));
});
test('ambiguous network failure preserves hash and never retries broadcast',async()=>{
  let sends=0,saved;
  await assert.rejects(sendRecordedOnce({reservation:async()=>{},saveReserved:async()=>{},sign:async()=>'0x123456',saveSigned:async h=>{saved=h;},send:async()=>{sends++;throw new Error('NETWORK_TIMEOUT');}}),/NETWORK_TIMEOUT/);
  assert.equal(sends,1);assert.equal(saved,keccak256('0x123456'));
});
test('RPC returning another hash is rejected after recording the signed hash',async()=>{
  let saved;
  await assert.rejects(sendRecordedOnce({reservation:async()=>{},saveReserved:async()=>{},sign:async()=>'0x123456',saveSigned:async h=>{saved=h;},send:async()=>otherHash}),/DIFFERENT_TRANSACTION_HASH/);
  assert.equal(saved,keccak256('0x123456'));
});

function ledgerFixture(count=1){
  const input={bundle,bundleHash:hash,sessionHash:hash,toolHash,rehearsalHash:otherHash};
  const a=bundle.expectedAddresses;
  const state={schemaVersion:1,chainId:56,status:'DEPLOYING',bundleHash:hash,sessionHash:hash,verificationInputHash:bundle.verificationInputHash,bootstrapToolHash:toolHash,rehearsalHash:otherHash,addresses:{template:a.GroupBuyVault,timelock:a.GovernanceTimelock,factoryImplementation:a.GroupBuyFactory,factory:a.ERC1967Proxy},steps:bundle.transactions.slice(0,count).map((tx,i)=>({step:tx.step,name:tx.name,nonce:tx.unsignedTransaction.nonce,initCodeHash:tx.initCodeHash,expectedContractAddress:tx.expectedContractAddress,reservationId:'bootstrap-'+hash.slice(2)+'-'+tx.step,maxFeeWei:'1000',status:'CONFIRMED',transactionHash:'0x'+String(i+1).padStart(64,'0')}))};
  const ledger={spentAndReservedWei:String(1000*count),reservations:state.steps.map(e=>({reservationId:e.reservationId,operation:'deploy-'+e.name,nonce:String(e.nonce),sender:bundle.creator,valueWei:'0',maxFeeWei:e.maxFeeWei,bundleHash:hash,initCodeHash:e.initCodeHash,status:'RESERVED_BEFORE_SEND'}))};
  return {input,state,ledger};
}
test('journal and budget are required together, including prior bundles with orphan reservations',()=>{
  const f=ledgerFixture();assertLedgerMatchesState(f.state,f.ledger,f.input);
  assert.throws(()=>assertLedgerMatchesState(f.state,{spentAndReservedWei:'0',reservations:[]},f.input),/BUDGET_RESERVATION_MISSING/);
  assert.throws(()=>assertLedgerMatchesState(null,f.ledger,f.input),/ORPHAN/);
  const other=ledgerFixture();other.ledger.reservations[0].reservationId='bootstrap-'+otherHash.slice(2)+'-1';assert.throws(()=>assertLedgerMatchesState(other.state,other.ledger,other.input),/ORPHAN/);
  assertLedgerMatchesState(null,{spentAndReservedWei:'0',reservations:[]},f.input);
});
test('budget amount, sender, nonce, operation and bytecode bindings cannot be replaced',()=>{
  for(const mutate of [r=>r.sender=bundle.expectedAddresses.GroupBuyVault,r=>r.nonce='99',r=>r.operation='another',r=>r.initCodeHash=otherHash,r=>r.bundleHash=otherHash]){const f=ledgerFixture();mutate(f.ledger.reservations[0]);assert.throws(()=>assertLedgerMatchesState(f.state,f.ledger,f.input),/BINDING/);}
  const f=ledgerFixture();f.state.steps[0].maxFeeWei='900';assert.throws(()=>assertLedgerMatchesState(f.state,f.ledger,f.input),/BINDING/);
});
test('journal steps must be continuous, source-bound, and prior steps confirmed',()=>{
  for(const mutate of [s=>s.steps[1].step=1,s=>s.steps[0].nonce=99,s=>s.steps[0].initCodeHash=otherHash,s=>s.steps[0].status='SUBMITTED',s=>s.steps[1].transactionHash=s.steps[0].transactionHash,s=>s.addresses.factory=s.addresses.template,s=>s.status='DEPLOYED_UNCONFIGURED']){
    const f=ledgerFixture(2);mutate(f.state);assert.throws(()=>assertLedgerMatchesState(f.state,f.ledger,f.input));
  }
});
test('reserved-without-hash can be recorded, while a signed state without hash is rejected',()=>{
  const f=ledgerFixture();f.state.steps[0].status='RESERVED_BEFORE_SIGNATURE';delete f.state.steps[0].transactionHash;
  assertLedgerMatchesState(f.state,f.ledger,f.input);
  f.state.steps[0].status='SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN';assert.throws(()=>assertLedgerMatchesState(f.state,f.ledger,f.input),/SIGNED_STEP_HASH_REQUIRED/);
});
test('RPC URL stays bound to preflight and cannot become a loopback or another endpoint',()=>{
  assertRpcUnchanged('https://example.invalid/rpc','https://example.invalid/rpc');
  assert.throws(()=>assertRpcUnchanged('https://example.invalid/a','https://example.invalid/b'),/RPC_CONFIGURATION_CHANGED/);
  for(const value of ['http://localhost','http://127.0.0.2','http://[::1]','http://host.localhost','http://localhost.','file:///rpc','https://example.invalid/#fragment'])assert.throws(()=>assertRpcUnchanged(value,value),/REMOTE_MAINNET_RPC_REQUIRED/);
});
test('just-before-send latest and pending nonces must both equal the reviewed nonce',async()=>{
  const client=(latest,pending)=>({getTransactionCount:async({blockTag})=>blockTag==='latest'?latest:pending});
  await assertFreshNonce(client(5,5),5);
  for(const pair of [[5,6],[6,6],[4,4]])await assert.rejects(assertFreshNonce(client(...pair),5),/NONCE_CHANGED/);
});
function postFixture(){
  const session=structuredClone(bundle.governanceIdentityReview),addresses=bundle.expectedAddresses,validator='0x5000000000000000000000000000000000000005';
  const safe=bundle.governanceIdentityReview.address,guardian='0x63979C9d5200A5080be93eb440D469d2F2ec6682';
  const input={bundle,artifacts:{GroupBuyVault:{abi:[]},GovernanceTimelock:{abi:[]},GroupBuyFactory:{abi:[]}},session:{governance:{multisig:safe,guardian}},rehearsal:{deploymentChecks:{validator:{address:validator,codeHash:keccak256('0x6000')}}}};
  const client={getCode:async()=>'0x6000',readContract:async({functionName,args})=>{
    if(functionName==='hasRole')return args[0]===zeroHash?args[1].toLowerCase()===addresses.GovernanceTimelock.toLowerCase():args[1].toLowerCase()===safe.toLowerCase();
    return ({templateInitializersDisabled:true,implementationSelf:addresses.GroupBuyVault,marketValidator:validator,minimumDelayFloor:600n,getMinDelay:600n,deploymentAddress:addresses.GovernanceTimelock})[functionName];
  }};
  return {client,input};
}
test('deployed validator must match both rehearsal address and runtime',async()=>{
  const f=postFixture();await deploymentPostconditions(f.client,f.input,1);
  f.client.getCode=async()=>'0x6001';await assert.rejects(deploymentPostconditions(f.client,f.input,1),/VALIDATOR/);
  const g=postFixture();g.input.rehearsal.deploymentChecks.validator.address=bundle.creator;await assert.rejects(deploymentPostconditions(g.client,g.input,1),/VALIDATOR/);
});
test('Timelock self-admin cannot also silently gain proposer or executor roles',async()=>{
  const f=postFixture();await deploymentPostconditions(f.client,f.input,2);
  const old=f.client.readContract;f.client.readContract=async args=>args.functionName==='hasRole'&&args.args[0]!==zeroHash&&args.args[1]===bundle.expectedAddresses.GovernanceTimelock?true:old(args);
  await assert.rejects(deploymentPostconditions(f.client,f.input,2),/UNEXPECTED_TIMELOCK_ROLE/);
});
