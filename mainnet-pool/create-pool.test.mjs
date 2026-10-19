import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData,
  getContractAddress, keccak256, zeroAddress, zeroHash,
} from 'viem';
import {parseOrderEnvelope} from '../sdk/order-envelope.ts';
import {
  argumentsFor, buildAction, assertPlanUnchanged, checkCreationEvents,
  assertPoolLedger, preview, verifyCreated,
} from './create-pool.mjs';

// Offline only: frozen public JSON/artifacts are read, all RPC methods are fake.
// Never load .env, instantiate a transport, or mutate the real budget/journal.
const readJson = async relative => JSON.parse(await fs.readFile(new URL(relative, import.meta.url), 'utf8'));
const [sessionFixture, manifestFixture, envelopeFixture, factoryArtifact, vaultArtifact] = await Promise.all([
  readJson('../mainnet-test/session.json'), readJson('../mainnet-test/live-manifest.json'),
  readJson('../mainnet-test/order-envelope.json'), readJson('../out/GroupBuyFactory.sol/GroupBuyFactory.json'),
  readJson('../out/GroupBuyVault.sol/GroupBuyVault.json'),
]);
const {abi: factoryAbi} = factoryArtifact, {abi: vaultAbi} = vaultArtifact;
const clone = value => structuredClone(value);
const H = '0x' + 'ab'.repeat(32), OTHER_H = '0x' + 'cd'.repeat(32);
const TX = '0x' + 'ef'.repeat(32), OTHER = '0x0000000000000000000000000000000000000099';
const SESSION_HASH = '0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c';
const BLOCK = 128575600n, TIME = 1792422500n;
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
function input() {
  const session = clone(sessionFixture), manifest = clone(manifestFixture), envelope = parseOrderEnvelope(clone(envelopeFixture));
  return {
    session, manifest, envelope, factoryAbi, vaultAbi,
    action: buildAction(session, manifest, envelope, factoryAbi),
    sessionHash: SESSION_HASH, sessionFile: 'mainnet-test/session.json',
    toolHash: 'a'.repeat(64), sellerToolHash: 'b'.repeat(64),
    bindings: {manifestHash: H, orderEnvelopeHash: OTHER_H},
    rpcMode: 'EXPLICIT_PUBLIC_RPC_FALLBACK', primaryEndpoint: 'https://bsc-dataseed.defibit.io',
    independentEndpoint: 'https://bsc-dataseed.bnbchain.org',
  };
}
const baseInput = input();
function fakeClient(i = baseInput, overrides = {}) {
  const values = {
    isPool: false, poolSalt: i.action.salt, predictPool: i.action.pool,
    ownerOf: i.session.seller, getApproved: i.session.market, isApprovedForAll: false,
    information: [i.session.seaport.version, i.session.seaport.domainSeparator, zeroAddress],
    getCounter: BigInt(i.session.seaport.counter), getOrderHash: i.action.orderHash,
    getOrderStatus: [true, false, 0n, 0n],
  };
  return {
    getBlock: async ({blockNumber} = {}) => ({number: blockNumber ?? BLOCK, hash: H, timestamp: TIME}),
    getTransactionCount: async () => i.action.nonce,
    getBalance: async () => 1000000000000000000n,
    getCode: async () => '0x',
    readContract: async ({functionName}) => {
      assert.ok(Object.hasOwn(values, functionName), `Unexpected fake RPC function ${functionName}`);
      return clone(values[functionName]);
    },
    getGasPrice: async () => 50000000n,
    estimateGas: async () => 500001n,
    call: async () => ({data: '0x'}),
    ...overrides,
  };
}
function guards(i = baseInput, overrides = {}) {
  return {
    chainCheck: async () => {},
    previousCheck: async () => [{step: 'seller-approve', transactionHash: H}, {step: 'seller-validate', transactionHash: OTHER_H}],
    identityCheck: async () => ({verified: true}),
    protocolCheck: async () => ({executable: true, orderHash: i.action.orderHash}),
    ...overrides,
  };
}
const argv = ['--env', '../.env', '--session', 'mainnet-test/session.json'];

test('CLI defaults to one read-only createPool plan', () => {
  const options = argumentsFor(argv);
  assert.equal(options.step, 'create-pool'); assert.equal(options.broadcast, false);
  assert.equal(options.reconcile, false); assert.equal(options.publicRpcFallback, false);
});
test('CLI explicit reconcile cannot broadcast', () => {
  const options = argumentsFor([...argv, '--reconcile', '--public-rpc-fallback']);
  assert.equal(options.reconcile, true); assert.equal(options.broadcast, false); assert.equal(options.publicRpcFallback, true);
});
for (const [name, args, error] of [
  ['missing explicit env', ['--session', 'mainnet-test/session.json'], /EXPLICIT_ENV_AND_SESSION_REQUIRED/],
  ['different action', [...argv, '--step', 'creator-contribute'], /ONLY_CREATE_POOL_SUPPORTED/],
  ['unreviewed broadcast', [...argv, '--broadcast'], /REVIEWED_PLAN_HASH_REQUIRED/],
  ['broadcast plus reconcile', [...argv, '--broadcast', '--reconcile'], /BROADCAST_AND_RECONCILE_ARE_EXCLUSIVE/],
  ['duplicate mode flag', [...argv, '--reconcile', '--reconcile'], /DUPLICATE_ARGUMENT/],
  ['private key override', [...argv, '--private-key', H], /INVALID_ARGUMENT/],
  ['raw transaction override', [...argv, '--raw-transaction', '0x12'], /INVALID_ARGUMENT/],
  ['nonce override', [...argv, '--nonce', '10'], /INVALID_ARGUMENT/],
]) test(`CLI refuses ${name}`, () => assert.throws(() => argumentsFor(args), error));

test('action uses the frozen existing Factory and creates no payment or additional contracts', () => {
  const {action, session, manifest} = input(), decoded = decodeFunctionData({abi: factoryAbi, data: action.data});
  assert.equal(action.step, 'create-pool'); assert.equal(action.nonce, 9); assert.equal(action.valueWei, '0');
  assert.equal(action.from, session.creator); assert.equal(action.to, manifest.factory.address);
  assert.equal(decoded.functionName, 'createPool'); assert.equal(decoded.args.length, 5);
  assert.ok(same(decoded.args[0], manifest.template.address)); assert.equal(decoded.args[1], manifest.configHash);
  assert.equal(decoded.args[3], session.pool.payload); assert.equal(decoded.args[4], 1n);
  assert.equal(action.dataHash, keccak256(action.data));
  assert.equal(action.data, encodeFunctionData({abi: factoryAbi, functionName: 'createPool', args: session.pool.createArgs}));
});
test('salt and CREATE2 address independently bind all seven frozen inputs', () => {
  const {action, session} = input();
  const salt = keccak256(encodeAbiParameters(
    [{type:'uint256'}, {type:'address'}, {type:'address'}, {type:'bytes32'}, {type:'bytes32'}, {type:'bytes32'}, {type:'uint256'}],
    [56n, session.creator, action.template, action.configHash, session.pool.termsHash, keccak256(session.pool.payload), 1n],
  ));
  const creation = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${action.template.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
  assert.equal(action.salt, salt);
  assert.ok(same(getContractAddress({opcode:'CREATE2', from:action.to, salt, bytecode:creation}), action.pool));
});
for (const [name, mutate, error] of [
  ['wrong chain', i => i.session.chainId = 31337, /FROZEN_BSC_SESSION/],
  ['wrong creator', i => i.session.creator = OTHER, /FIXED_EXISTING_FACTORY_POOL_REQUIRED/],
  ['new Factory', i => i.manifest.factory.address = OTHER, /FIXED_EXISTING_FACTORY_POOL_REQUIRED/],
  ['new template', i => i.manifest.template.address = OTHER, /FIXED_EXISTING_FACTORY_POOL_REQUIRED/],
  ['other clone', i => i.manifest.vault.address = OTHER, /FIXED_EXISTING_FACTORY_POOL_REQUIRED/],
  ['other session clone', i => i.session.pool.address = OTHER, /FIXED_EXISTING_FACTORY_POOL_REQUIRED/],
  ['other manifest creator', i => i.manifest.vault.creator = OTHER, /CREATOR_OR_ROUND_CHANGED/],
  ['next round', i => { i.session.pool.round = '2'; i.manifest.vault.round = '2'; }, /CREATOR_OR_ROUND_CHANGED/],
  ['checkpoint', i => i.manifest.network.checkpointHash = OTHER_H, /MANIFEST_CHECKPOINT_CHANGED/],
  ['different order hash', i => i.envelope.orderHash = OTHER_H, /ORDER_SCOPE_CHANGED/],
  ['different total', i => i.envelope.buyerPaysWei = '300000000000000000', /ORDER_SCOPE_CHANGED/],
  ['other fee recipient', i => i.session.order.parameters.consideration[1].recipient = OTHER, /FIXED_NATIVE_PRICE/],
  ['signed payload', i => i.envelope.seaport.signature = '0x12', /FROZEN_ORDER_PARAMETERS_CHANGED/],
  ['changed order parameters', i => i.envelope.seaport.parameters.salt = '1', /FROZEN_ORDER_PARAMETERS_CHANGED/],
  ['changed terms hash', i => i.session.pool.termsHash = OTHER_H, /FROZEN_POOL_TERMS_OR_PAYLOAD_CHANGED/],
  ['changed payload', i => i.session.pool.payload = '0x12', /FROZEN_POOL_TERMS_OR_PAYLOAD_CHANGED/],
  ['changed supplied round', i => i.session.pool.createArgs[4] = '2', /FROZEN_CREATE_ARGUMENTS_CHANGED/],
  ['missing validate prerequisite', i => i.session.steps['create-pool'].requiresStep = 'seller-approve', /FIXED_CREATOR_NONCE_REQUIRED/],
  ['unsafe creator nonce', i => i.session.steps['create-pool'].nonce = '9007199254740992', /FIXED_CREATOR_NONCE_REQUIRED/],
  ['negative creator nonce', i => i.session.steps['create-pool'].nonce = '-1', /FIXED_CREATOR_NONCE_REQUIRED/],
]) test(`action rejects ${name}`, () => {
  const i = input(); mutate(i);
  assert.throws(() => buildAction(i.session, i.manifest, i.envelope, factoryAbi), error);
});

test('preview checks prerequisites, identity and executable order before bounded gas call', async () => {
  const i = input(), calls = [], stages = [];
  const p = await preview(fakeClient(i, {
    estimateGas: async request => { calls.push('estimate'); assert.equal(request.gas, undefined); assert.equal(request.gasPrice, 50000000n); assert.equal(request.value, 0n); return 500001n; },
    call: async request => { calls.push('call'); assert.equal(request.gas, 600002n); assert.equal(request.gasPrice, 50000000n); assert.equal(request.to, i.action.to); assert.equal(request.data, i.action.data); assert.equal(request.value, 0n); },
  }), i, guards(i, {
    chainCheck: async () => { calls.push('chain'); },
    previousCheck: async () => { calls.push('prerequisites'); return []; },
    identityCheck: async (_client, manifest, options) => { calls.push('identity'); assert.equal(manifest, i.manifest); assert.equal(options.command, 'create-pool'); assert.equal(options.target, i.action.to); assert.equal(options.actor, i.action.from); assert.deepEqual(options.args, i.action.args); return {verified:true}; },
    protocolCheck: async () => { calls.push('protocol'); return {executable:true, orderHash:i.action.orderHash}; },
    onStage: stage => stages.push(stage),
  }));
  assert.deepEqual(calls, ['chain', 'prerequisites', 'identity', 'protocol', 'estimate', 'call']);
  assert.equal(stages.at(-1), 'PREVIEW_BOUNDED_CALL'); assert.equal(p.status, 'FROZEN_UNSIGNED_CREATE_POOL_PLAN');
  assert.equal(p.gas, '600002'); assert.equal(p.maxFeeWei, '30000100000000'); assert.equal(p.nonce, 9);
  assert.equal(p.valueWei, '0'); assert.equal(p.pool, i.session.pool.address); assert.equal(p.args, undefined);
});
for (const [name, options, error] of [
  ['missing seller receipt', {previousCheck:async()=>{throw new Error('SELLER_RECEIPT_MISSING');}}, /SELLER_RECEIPT_MISSING/],
  ['wrong factory identity', {identityCheck:async()=>{throw new Error('FACTORY_IDENTITY_FAILED');}}, /FACTORY_IDENTITY_FAILED/],
  ['nonexecutable order', {protocolCheck:async()=>({executable:false,orderHash:baseInput.action.orderHash})}, /ORDER_NOT_EXECUTABLE/],
  ['different protocol order', {protocolCheck:async()=>({executable:true,orderHash:OTHER_H})}, /ORDER_NOT_EXECUTABLE/],
]) test(`preview refuses ${name} before gas estimation`, async () => {
  let estimates = 0;
  await assert.rejects(() => preview(fakeClient(baseInput, {estimateGas:async()=>{estimates++;return 1n;}}), baseInput, guards(baseInput, options)), error);
  assert.equal(estimates, 0);
});
for (const [name, fn, value, error] of [
  ['existing registered clone','isPool',true,/POOL_ALREADY_EXISTS/],
  ['wrong deterministic salt','poolSalt',OTHER_H,/CHAIN_PREDICTION_OR_SALT_CHANGED/],
  ['wrong predicted clone','predictPool',OTHER,/CHAIN_PREDICTION_OR_SALT_CHANGED/],
  ['changed NFT owner','ownerOf',OTHER,/MINER_OWNER_OR_APPROVAL_CHANGED/],
  ['missing token approval','getApproved',zeroAddress,/MINER_OWNER_OR_APPROVAL_CHANGED/],
  ['collection-wide approval','isApprovedForAll',true,/MINER_OWNER_OR_APPROVAL_CHANGED/],
  ['counter changed','getCounter',1n,/SEAPORT_IDENTITY_COUNTER_OR_ORDER_CHANGED/],
  ['order hash changed','getOrderHash',OTHER_H,/SEAPORT_IDENTITY_COUNTER_OR_ORDER_CHANGED/],
  ['Seaport version changed','information',['1.5',baseInput.session.seaport.domainSeparator,zeroAddress],/SEAPORT_IDENTITY_COUNTER_OR_ORDER_CHANGED/],
  ['Seaport domain changed','information',['1.6',OTHER_H,zeroAddress],/SEAPORT_IDENTITY_COUNTER_OR_ORDER_CHANGED/],
  ['unvalidated order','getOrderStatus',[false,false,0n,0n],/VALIDATED_UNFILLED_ORDER_REQUIRED/],
  ['cancelled order','getOrderStatus',[true,true,0n,0n],/VALIDATED_UNFILLED_ORDER_REQUIRED/],
  ['filled order','getOrderStatus',[true,false,1n,1n],/VALIDATED_UNFILLED_ORDER_REQUIRED/],
]) test(`preview refuses ${name}`, async () => {
  const original = fakeClient(), bad = fakeClient(baseInput, {readContract:async args=>args.functionName===fn?value:original.readContract(args)});
  await assert.rejects(() => preview(bad, baseInput, guards()), error);
});
test('creator latest or pending nonce drift prevents a new plan', async () => {
  for (const tag of ['latest','pending']) await assert.rejects(() => preview(fakeClient(baseInput, {getTransactionCount:async({blockTag})=>blockTag===tag?10:9}), baseInput, guards()), /CREATOR_NONCE_CHANGED_OR_PENDING/);
});
test('deployed pool bytecode and creator smart-account code are rejected', async () => {
  await assert.rejects(() => preview(fakeClient(baseInput, {getCode:async({address})=>same(address,baseInput.action.pool)?'0x6000':'0x'}), baseInput, guards()), /POOL_ALREADY_EXISTS/);
  await assert.rejects(() => preview(fakeClient(baseInput, {getCode:async({address})=>same(address,baseInput.action.from)?'0x6000':'0x'}), baseInput, guards()), /CREATOR_MUST_REMAIN_PLAIN_EOA/);
});
test('deadline safety margin and changed observed block both fail closed', async () => {
  await assert.rejects(() => preview(fakeClient(baseInput, {getBlock:async()=>({number:BLOCK,hash:H,timestamp:BigInt(baseInput.session.fundingDeadline)-300n})}), baseInput, guards()), /POOL_DEADLINE_TOO_CLOSE/);
  await assert.rejects(() => preview(fakeClient(baseInput, {getBlock:async({blockNumber}={})=>({number:BLOCK,hash:blockNumber?OTHER_H:H,timestamp:TIME})}), baseInput, guards()), /OBSERVATION_BLOCK_CHANGED/);
});
test('invalid gas price, excessive gas, or insufficient balance stop before simulation', async () => {
  let calls = 0;
  for (const [overrides,error] of [
    [{getGasPrice:async()=>0n}, /INVALID_GAS_PRICE/],
    [{estimateGas:async()=>2000000n}, /CREATE_POOL_GAS_LIMIT_EXCEEDED/],
    [{getBalance:async()=>1n}, /CREATOR_GAS_BALANCE_INSUFFICIENT/],
  ]) await assert.rejects(() => preview(fakeClient(baseInput, {...overrides,call:async()=>{calls++;}}), baseInput, guards()), error);
  assert.equal(calls,0);
});
test('simulation failure returns no plan and never retries', async () => {
  let calls=0,stage;
  await assert.rejects(() => preview(fakeClient(baseInput,{call:async()=>{calls++;throw new Error('REVERTED_SIMULATION');}}),baseInput,guards(baseInput,{onStage:s=>{stage=s;}})),/REVERTED_SIMULATION/);
  assert.equal(calls,1);assert.equal(stage,'PREVIEW_BOUNDED_CALL');
});
for (const field of ['rpcMode','primaryEndpoint','independentEndpoint','sessionHash','poolToolHash','sellerRuntimeToolHash','nonce','to','valueWei','data','dataHash','pool','salt','round','orderHash','gasEstimate','gas','gasPrice','maxFeeWei']) {
  test(`reviewed plan freezes ${field}`, async () => {
    const a=await preview(fakeClient(),baseInput,guards()),b=clone(a);b[field]=String(b[field])+'1';
    assert.throws(()=>assertPlanUnchanged(a,b),/REVIEWED_CREATE_TRANSACTION_CHANGED/);
  });
}
test('evidence and business state cannot drift during user confirmation', async () => {
  const a=await preview(fakeClient(),baseInput,guards());
  for(const [change,error] of [
    [b=>b.bindings.manifestHash=OTHER_H,/FROZEN_CREATE_EVIDENCE_CHANGED/],
    [b=>b.prerequisites.pop(),/FROZEN_CREATE_EVIDENCE_CHANGED/],
    [b=>b.before.approved=zeroAddress,/FROZEN_CREATE_STATE_CHANGED/],
    [b=>b.before.orderStatus[1]=true,/FROZEN_ORDER_STATUS_CHANGED/],
  ]){const b=clone(a);change(b);assert.throws(()=>assertPlanUnchanged(a,b),error);}
  const b=clone(a);b.before.blockNumber=String(BLOCK+1n);b.before.timestamp=String(TIME+1n);b.before.balanceWei='999999999999999999';
  assert.doesNotThrow(()=>assertPlanUnchanged(a,b));
});

// Encode real wire event layouts using the compiled ABI, independent of runtime parser.
function wireLog(abi,name,address,args,index=1){
  const event=abi.find(item=>item.type==='event'&&item.name===name);assert.ok(event);
  return {address,topics:encodeEventTopics({abi:[event],eventName:name,args}),
    data:encodeAbiParameters(event.inputs.filter(x=>!x.indexed),event.inputs.filter(x=>!x.indexed).map(x=>args[x.name])),
    blockNumber:BLOCK,blockHash:H,transactionHash:TX,transactionIndex:7,logIndex:index,removed:false};
}
function receipt(i=baseInput,createdOverride={},initializedOverride={}){
  const a=i.action;
  return {transactionHash:TX,blockNumber:BLOCK,blockHash:H,transactionIndex:7,from:a.from,to:a.to,status:'success',gasUsed:400000n,effectiveGasPrice:50000000n,cumulativeGasUsed:900000n,
    logs:[
      wireLog(vaultAbi,'VaultInitialized',a.pool,{factory:a.to,creator:a.from,configHash:a.configHash,termsHash:a.termsHash,payload:i.session.pool.payload,...initializedOverride},1),
      wireLog(factoryAbi,'PoolCreated',a.to,{vault:a.pool,creator:a.from,template:a.template,configHash:a.configHash,termsHash:a.termsHash,round:1n,salt:a.salt,orderPayload:i.session.pool.payload,...createdOverride},2),
    ]};
}
test('real compiled event layouts require exact PoolCreated plus VaultInitialized',()=>{
  const r=receipt();assert.equal(r.logs[0].topics.length,3);assert.equal(r.logs[1].topics.length,4);
  const result=checkCreationEvents(r,baseInput);
  assert.deepEqual(result.checks,{exactPoolCreated:true,exactVaultInitialized:true,receiptLogsCanonical:true});
  assert.deepEqual(result.events.map(x=>x.eventName),['PoolCreated','VaultInitialized']);
});
for(const [field,value] of [['vault',OTHER],['creator',OTHER],['template',OTHER],['configHash',OTHER_H],['termsHash',OTHER_H],['round',2n],['salt',OTHER_H],['orderPayload','0x12']]) {
  test(`PoolCreated rejects changed ${field}`,()=>assert.throws(()=>checkCreationEvents(receipt(baseInput,{[field]:value}),baseInput),/CREATE_POOL_EVENT_MISMATCH/));
}
for(const [field,value] of [['factory',OTHER],['creator',OTHER],['configHash',OTHER_H],['termsHash',OTHER_H],['payload','0x12']]) {
  test(`VaultInitialized rejects changed ${field}`,()=>assert.throws(()=>checkCreationEvents(receipt(baseInput,{}, {[field]:value}),baseInput),/VAULT_INITIALIZED_EVENT_MISMATCH/));
}
for(const [name,change,error] of [
  ['missing PoolCreated',r=>r.logs.pop(),/CREATE_POOL_EVENT_MISMATCH/],
  ['duplicate PoolCreated',r=>r.logs.push(clone(r.logs[1])),/CREATE_POOL_EVENT_MISMATCH/],
  ['wrong Factory emitter',r=>r.logs[1].address=OTHER,/CREATE_POOL_EVENT_MISMATCH/],
  ['missing initialization',r=>r.logs.shift(),/VAULT_INITIALIZED_EVENT_MISMATCH/],
  ['duplicate initialization',r=>r.logs.push(clone(r.logs[0])),/VAULT_INITIALIZED_EVENT_MISMATCH/],
  ['wrong clone emitter',r=>r.logs[0].address=OTHER,/VAULT_INITIALIZED_EVENT_MISMATCH/],
  ['removed event',r=>r.logs[0].removed=true,/RECEIPT_LOG_IDENTITY_MISMATCH/],
  ['other transaction log',r=>r.logs[0].transactionHash=OTHER_H,/RECEIPT_LOG_IDENTITY_MISMATCH/],
  ['other block log',r=>r.logs[0].blockHash=OTHER_H,/RECEIPT_LOG_IDENTITY_MISMATCH/],
])test(`creation receipt rejects ${name}`,()=>{const r=receipt();change(r);assert.throws(()=>checkCreationEvents(r,baseInput),error);});

function ledgerFixture(){
  const i=input(),id=`pool-${i.sessionHash.slice(2)}-create-pool`;
  const entry={step:'create-pool',status:'SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN',nonce:9,to:i.action.to,pool:i.action.pool,dataHash:i.action.dataHash,planHash:H,reservationId:id,maxFeeWei:'30000000000000',transactionHash:TX};
  const old={command:'prior-deployments-and-seller',to:i.action.to,calldataHash:OTHER_H,valueWei:'0',maxFeeWei:'672084400000000',status:'RECEIPT_VERIFIED'};
  const reservation={reservationId:id,operation:'create-pool',sender:i.action.from,nonce:'9',valueWei:'0',maxFeeWei:entry.maxFeeWei,bundleHash:i.sessionHash,initCodeHash:i.action.dataHash,status:'RESERVED_BEFORE_SEND'};
  return {i,journal:{schemaVersion:1,chainId:56,sessionHash:i.sessionHash,steps:[entry]},ledger:{spentAndReservedWei:'702084400000000',reservations:[old,reservation]},entry,reservation};
}
test('pool reservation retains earlier deployment and seller budget',()=>{
  const {i,journal,ledger}=ledgerFixture();assert.doesNotThrow(()=>assertPoolLedger(journal,ledger,i));
  assert.equal(ledger.spentAndReservedWei,'702084400000000');assert.equal(ledger.reservations[0].maxFeeWei,'672084400000000');
});
test('empty pool journal with only historical budget is allowed',()=>{
  const {i,journal,ledger}=ledgerFixture();journal.steps=[];ledger.reservations.pop();ledger.spentAndReservedWei='672084400000000';
  assert.doesNotThrow(()=>assertPoolLedger(journal,ledger,i));
});
for(const [name,change,error] of [
  ['orphan pool reservation',x=>x.journal.steps=[],/ORPHAN_POOL_RESERVATION/],
  ['duplicate pool step',x=>x.journal.steps.push(clone(x.entry)),/POOL_JOURNAL_SESSION_MISMATCH/],
  ['wrong session',x=>x.journal.sessionHash=OTHER_H,/POOL_JOURNAL_SESSION_MISMATCH/],
  ['wrong chain',x=>x.journal.chainId=31337,/POOL_JOURNAL_SESSION_MISMATCH/],
  ['unapproved nonce',x=>x.entry.nonce=10,/POOL_JOURNAL_BINDING_MISMATCH/],
  ['other target',x=>x.entry.to=OTHER,/POOL_JOURNAL_BINDING_MISMATCH/],
  ['other pool',x=>x.entry.pool=OTHER,/POOL_JOURNAL_BINDING_MISMATCH/],
  ['changed data',x=>x.entry.dataHash=OTHER_H,/POOL_JOURNAL_BINDING_MISMATCH/],
  ['signed state missing hash',x=>delete x.entry.transactionHash,/POOL_SIGNED_HASH_STATE_MISMATCH/],
  ['reserved state already has hash',x=>x.entry.status='RESERVED_BEFORE_SIGNATURE',/POOL_SIGNED_HASH_STATE_MISMATCH/],
  ['missing budget reservation',x=>{x.ledger.reservations.pop();x.ledger.spentAndReservedWei='672084400000000';},/POOL_RESERVATION_MISSING_OR_DUPLICATE/],
  ['other reservation sender',x=>x.reservation.sender=OTHER,/POOL_BUDGET_BINDING_MISMATCH/],
  ['other reservation nonce',x=>x.reservation.nonce='10',/POOL_BUDGET_BINDING_MISMATCH/],
  ['unexpected principal',x=>{x.reservation.valueWei='1';x.ledger.spentAndReservedWei='702084400000001';},/POOL_BUDGET_BINDING_MISMATCH/],
  ['mismatched fee',x=>x.entry.maxFeeWei='1',/POOL_BUDGET_BINDING_MISMATCH/],
  ['reset cumulative budget',x=>x.ledger.spentAndReservedWei='30000000000000',/BUDGET_TOTAL_DOES_NOT_MATCH_RESERVATIONS/],
])test(`journal guard rejects ${name}`,()=>{const x=ledgerFixture();change(x);assert.throws(()=>assertPoolLedger(x.journal,x.ledger,x.i),error);});

autoReceiptTests();
function autoReceiptTests(){
  function context(overrides={}){
    const i=input(),r=receipt(i),a=i.action,gas=600002n,gasPrice=50000000n;
    const entry={transactionHash:TX,gas:String(gas),gasPrice:String(gasPrice),maxFeeWei:String(gas*gasPrice)};
    const tx={hash:TX,from:a.from,to:a.to,value:0n,input:a.data,chainId:56,blockNumber:BLOCK,blockHash:H,nonce:9,gas,gasPrice};
    const values={isPool:true,state:0,soldCount:0n,fundedWei:0n,totalPrincipalIn:0n,ownerOf:i.session.seller,factory:a.to,creator:a.from,configHash:a.configHash,termsHash:a.termsHash,purchasePayload:i.session.pool.payload,marketValidator:i.manifest.template.validator.address};
    const runtime=`0x363d3d373d3d3d363d73${a.template.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`;
    const client={getChainId:async()=>56,request:async()=> 'Geth/offline-fixture',getTransactionReceipt:async()=>r,getTransaction:async()=>tx,getBlock:async()=>({number:BLOCK,hash:H}),getBlockNumber:async()=>BLOCK+14n,getCode:async()=>runtime,readContract:async({functionName})=>{assert.ok(Object.hasOwn(values,functionName));return values[functionName];},...overrides};
    const options={identityCheck:async(_client,_manifest,call)=>{assert.equal(call.command,'contribute');assert.equal(call.target,a.pool);return {verified:true};},postconditions:async()=>({verified:true})};
    return {i,r,tx,entry,values,runtime,client,options};
  }
  test('confirmed creation proves canonical 15-confirmation receipt, empty FUNDING pool and miner still with seller',async()=>{
    const x=context(),result=await verifyCreated(x.client,x.i,x.entry,x.options);
    assert.equal(result.status,'CONFIRMED');assert.equal(result.actualGasFeeWei,'20000000000000');
    assert.equal(result.after.runtimeCodeHash,x.i.manifest.vault.codeHash);assert.equal(result.after.state,0);
    assert.equal(result.after.fundedWei,'0');assert.equal(result.after.soldCount,'0');assert.equal(result.after.nftOwner,x.i.session.seller);
  });
  for(const [name,change,error] of [
    ['reverted receipt',x=>x.r.status='reverted',/MISMATCH_RECEIPTSUCCESS/],
    ['not enough confirmations',x=>x.client.getBlockNumber=async()=>BLOCK+13n,/WAITING_CONFIRMATIONS/],
    ['other creator nonce',x=>x.tx.nonce=10,/CREATE_RECEIPT_FROZEN_FIELDS_CHANGED/],
    ['other gas limit',x=>x.tx.gas=600003n,/CREATE_RECEIPT_FROZEN_FIELDS_CHANGED/],
    ['other gas price',x=>x.tx.gasPrice=50000001n,/CREATE_RECEIPT_FROZEN_FIELDS_CHANGED/],
    ['other clone runtime',x=>x.client.getCode=async()=> '0x6000',/CREATE_CLONE_RUNTIME_MISMATCH/],
    ['unregistered clone',x=>x.values.isPool=false,/CREATE_INITIAL_FUNDING_STATE_MISMATCH/],
    ['unexpected purchased state',x=>x.values.state=2,/CREATE_INITIAL_FUNDING_STATE_MISMATCH/],
    ['unexpected sold shares',x=>x.values.soldCount=1n,/CREATE_INITIAL_FUNDING_STATE_MISMATCH/],
    ['unexpected funds',x=>x.values.fundedWei=1n,/CREATE_INITIAL_FUNDING_STATE_MISMATCH/],
    ['unexpected principal',x=>x.values.totalPrincipalIn=1n,/CREATE_INITIAL_FUNDING_STATE_MISMATCH/],
    ['miner left seller',x=>x.values.ownerOf=x.i.action.pool,/CREATE_INITIAL_FUNDING_STATE_MISMATCH/],
    ['wrong vault factory',x=>x.values.factory=OTHER,/CREATE_VAULT_IDENTITY_MISMATCH/],
    ['wrong vault creator',x=>x.values.creator=OTHER,/CREATE_VAULT_IDENTITY_MISMATCH/],
    ['wrong validator',x=>x.values.marketValidator=OTHER,/CREATE_VAULT_IDENTITY_MISMATCH/],
    ['wrong purchase payload',x=>x.values.purchasePayload='0x12',/CREATE_VAULT_IDENTITY_MISMATCH/],
    ['basic postconditions fail',x=>x.options.postconditions=async()=>({verified:false}),/CREATE_BASIC_POSTCONDITIONS_FAILED/],
    ['live clone identity fails',x=>x.options.identityCheck=async()=>{throw new Error('LIVE_CLONE_IDENTITY_FAILED');},/LIVE_CLONE_IDENTITY_FAILED/],
  ])test(`receipt verification refuses ${name}`,async()=>{const x=context();change(x);await assert.rejects(()=>verifyCreated(x.client,x.i,x.entry,x.options),error);});
}
