import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ContractFunctionExecutionError,ContractFunctionRevertedError,encodeErrorResult,zeroAddress} from 'viem';
import {negativeCases,expectedContractError,observeSnapshot,runNegativeChecks,argumentsFor,verifyCompletionPrerequisite,COMPLETION_TX} from './active-pool.mjs';

// Only public static session/manifest/ABI inputs. Every client below is a mock;
// no .env/RPC/real journal or budget is read, and no state is written.
const json=async relative=>JSON.parse(await fs.readFile(new URL(relative,import.meta.url),'utf8'));
const [sessionFixture,manifestFixture,vaultArtifact]=await Promise.all([
  json('../mainnet-test/session.json'),json('../mainnet-test/live-manifest.json'),json('../out/GroupBuyVault.sol/GroupBuyVault.json'),
]);
const vaultAbi=vaultArtifact.abi,H='0x'+'ab'.repeat(32),OTHER_H='0x'+'cd'.repeat(32),BLOCK=128000000n,TIME=1792423200n;
const OTHER='0x0000000000000000000000000000000000000099';
const IDS=Array.from({length:100},(_,n)=>BigInt(n+1));
const clone=value=>structuredClone(value),same=(a,b)=>a.toLowerCase()===b.toLowerCase();
function input(){const session=clone(sessionFixture),manifest=clone(manifestFixture);return {session,manifest,vaultAbi,action:{pool:session.pool.address,from:session.buyerB,to:session.pool.address},sessionHash:H};}
function revert(name='NotHolder',functionName='claim'){
  return new ContractFunctionRevertedError({abi:vaultAbi,data:encodeErrorResult({abi:vaultAbi,errorName:name}),functionName});
}
function wrapped(name='NotHolder'){
  return new ContractFunctionExecutionError(revert(name),{abi:vaultAbi,functionName:'claim',args:[1n],contractAddress:sessionFixture.pool.address,sender:sessionFixture.buyerB});
}
function cases(){const i=input();return negativeCases({creator:i.session.creator,buyerB:i.session.buyerB,pool:i.action.pool});}
test('ten fixed negative cases retain exact actors, IDs, actions and custom errors',()=>{
  const i=input(),list=cases();assert.equal(list.length,10);assert.equal(new Set(list.map(x=>x.name)).size,10);
  const expected=[
    ['buyer-b-claim-creator-id',i.session.buyerB,'claim',[1n],'NotHolder'],
    ['creator-claim-buyer-id',i.session.creator,'claim',[68n],'NotHolder'],
    ['creator-empty-ids',i.session.creator,'claimBatch',[[]],'InvalidIds'],
    ['creator-duplicate-ids',i.session.creator,'claimBatch',[[1n,1n]],'InvalidIds'],
    ['creator-zero-id',i.session.creator,'claimBatch',[[0n]],'InvalidIds'],
    ['creator-out-of-range-id',i.session.creator,'claimBatch',[[101n]],'InvalidIds'],
    ['creator-redeem',i.session.creator,'redeemMiner',[],'NotHolder'],
    ['buyer-b-redeem',i.session.buyerB,'redeemMiner',[],'NotHolder'],
    ['creator-withdraw-active',i.session.creator,'withdraw',[[1n],i.session.creator],'InvalidState'],
    ['creator-mark-refundable-active',i.session.creator,'markRefundable',[],'InvalidState'],
  ];
  assert.deepEqual(list.map(c=>[c.name,c.account,c.functionName,c.args,c.expectedError]),expected);
});
test('genuine viem decoded custom errors match directly and through execution wrapper',()=>{
  assert.equal(expectedContractError(revert(),'NotHolder'),true);
  assert.equal(expectedContractError(wrapped(),'NotHolder'),true);
  assert.equal(expectedContractError(revert('InvalidIds','claimBatch'),'NotHolder'),false);
});
for(const [name,error]of [
  ['ordinary Error mentioning NotHolder',new Error('execution reverted NotHolder')],
  ['network timeout',Object.assign(new Error('timeout after 20 seconds'),{name:'TimeoutError'})],
  ['RPC body with apparent errorName',{name:'RpcRequestError',data:{errorName:'NotHolder'}}],
  ['unrecognized selector',new ContractFunctionRevertedError({abi:vaultAbi,data:'0x12345678',functionName:'claim'})],
  ['plain revert reason text',new ContractFunctionRevertedError({abi:vaultAbi,message:'NotHolder',functionName:'claim'})],
  ['no error',undefined],
])test(`expected revert does not accept ${name}`,()=>assert.equal(expectedContractError(error,'NotHolder'),false));
test('all negative simulations use the pinned block, fixed gas and exact call without sending',async()=>{
  const i=input(),list=cases(),seen=[];
  const client={simulateContract:async request=>{const c=list[seen.length];seen.push(request);assert.equal(request.address,i.action.pool);assert.equal(request.abi,vaultAbi);assert.equal(request.blockNumber,BLOCK);assert.equal(request.gas,3000000n);assert.equal(request.value,0n);assert.equal(request.account,c.account);assert.equal(request.functionName,c.functionName);assert.deepEqual(request.args,c.args);throw revert(c.expectedError,c.functionName);}};
  const result=await runNegativeChecks(client,i,BLOCK);assert.equal(result.status,'PASS');assert.equal(seen.length,10);
  assert.ok(result.cases.every(c=>c.status==='PASS'));assert.equal(result.transactionsSent,0);assert.equal(result.privateKeysUsed,false);
});
for(const [name,simulate]of [
  ['a successful call',async()=>({result:undefined})],
  ['a network timeout',async()=>{throw Object.assign(new Error('provider NotHolder timeout'),{name:'TimeoutError'});}],
  ['a different decoded custom error',async()=>{throw revert('WrongValue');}],
])test(`negative checks fail on ${name}`,async()=>{
  const result=await runNegativeChecks({simulateContract:simulate},input(),BLOCK);
  assert.equal(result.status,'FAIL');assert.ok(result.cases.every(c=>c.status==='FAIL'));assert.equal(result.transactionsSent,0);
});
test('one noncontract error cannot disappear among nine correct reverts',async()=>{
  const list=cases();let index=0;
  const result=await runNegativeChecks({simulateContract:async()=>{const c=list[index++];if(index===5)throw new Error('RPC_UNAVAILABLE');throw revert(c.expectedError,c.functionName);}},input(),BLOCK);
  assert.equal(result.status,'FAIL');assert.equal(result.cases.filter(c=>c.status==='FAIL').length,1);
});

function fakeClient(i,overrides={}){
  const config=i.manifest.config,pool=i.action.pool;
  const values={state:2,soldCount:100n,fundedWei:0n,totalPrincipalIn:303000000000000000n,totalPrincipalRefunded:0n,purchaseSpent:303000000000000000n,
    soldBitmap:(1n<<100n)-1n,totalAccounted:1000n,totalPaid:100n,accPerShare:10n,remainder:0n,ownerOf:pool,decimals:8,
    minerKey:H,pending:500n,isPool:true,getConfig:config,getTerms:i.session.pool.terms};
  const holder=id=>BigInt(id)<=67n?i.session.creator:i.session.buyerB;
  return {getBlock:async({blockNumber}={})=>({number:blockNumber??BLOCK,hash:H,timestamp:TIME}),
    getBalance:async({blockNumber,address})=>{assert.equal(blockNumber,BLOCK);return same(address,pool)?0n:1000000000000000000n;},
    readContract:async({address,functionName,args=[],blockNumber})=>{
      assert.equal(blockNumber,BLOCK,`${functionName} must use the pinned snapshot block`);
      if(functionName==='holderOf')return holder(args[0]);if(functionName==='totalSupply')return 1n;
      if(functionName==='claimed')return BigInt(args[0])<=10n?10n:0n;
      if(functionName==='claimable')return BigInt(args[0])<=10n?0n:10n;
      if(functionName==='balanceOfBatch')return args[1].map((id,n)=>same(args[0][n],holder(id))?1n:0n);
      if(functionName==='balanceOf'){
        if(same(address,pool))return same(args[0],holder(args[1]))?1n:0n;
        assert.ok(same(address,config.bem));
        return same(args[0],pool)?900n:same(args[0],i.session.creator)?200n:same(args[0],i.session.buyerB)?300n:400n;
      }
      assert.ok(Object.hasOwn(values,functionName),`Unexpected snapshot function ${functionName}`);return clone(values[functionName]);
    },...overrides};
}
const block={number:BLOCK,hash:H,timestamp:TIME};
test('snapshot pins all100 share and reward reads, wallet BEM and Mining pending to one block',async()=>{
  const i=input(),base=fakeClient(i),reads={holderOf:[],totalSupply:[],claimed:[],claimable:[]};let identities=0;
  const result=await observeSnapshot(fakeClient(i,{readContract:async q=>{if(Object.hasOwn(reads,q.functionName))reads[q.functionName].push(q.args[0]);return base.readContract(q);}}),i,
    {block,identityCheck:async()=>{identities++;return {verified:true};}});
  assert.equal(identities,1);assert.equal(result.status,'PASS');assert.equal(result.blockNumber,String(BLOCK));assert.equal(result.blockHash,H);
  assert.equal(String(result.state),'2');assert.equal(String(result.soldCount),'100');assert.equal(result.nftOwner,i.action.pool);
  assert.equal(result.fundedWei,'0');assert.equal(result.totalPrincipalIn,'303000000000000000');assert.equal(result.purchaseSpent,'303000000000000000');
  for(const ids of Object.values(reads))assert.deepEqual([...ids].sort((a,b)=>Number(a-b)),IDS);
  assert.equal(result.shares.length,100);assert.equal(result.shares.filter(s=>same(s.holder,i.session.creator)).length,67);
  assert.equal(result.shares.filter(s=>same(s.holder,i.session.buyerB)).length,33);
  assert.ok(result.shares.every(s=>s.supply==='1'));assert.equal(result.rewards.totalAccounted,'1000');assert.equal(result.rewards.totalPaid,'100');
  assert.equal(result.rewards.accPerShare,'10');assert.equal(result.rewards.remainder,'0');assert.equal(result.rewards.unaccountedBem,'0');
  assert.equal(result.bem.decimals,8);assert.equal(result.bem.balances.vault,'900');assert.equal(result.bem.balances.creator,'200');
  assert.equal(result.bem.balances.buyerB,'300');assert.equal(result.bem.balances.sellerA,'400');
  assert.equal(result.mining.minerKey,H);assert.equal(result.mining.pendingRaw,'500');
  assert.equal(result.shares.reduce((total,s)=>total+BigInt(s.claimable),0n),900n,'Mining pending is not already claimable inside the Vault');
});
test('snapshot never substitutes RPC failure with zero pending or zero claimable',async()=>{
  for(const fn of ['pending','claimable','balanceOf']){
    const i=input(),base=fakeClient(i);await assert.rejects(()=>observeSnapshot(fakeClient(i,{readContract:async q=>{if(q.functionName===fn)throw new Error('READ_UNAVAILABLE');return base.readContract(q);}}),i,{block,identityCheck:async()=>({verified:true})}),/READ_UNAVAILABLE/);
  }
});
test('snapshot requires verified clone identity before declaring a valid observation',async()=>{
  const i=input();await assert.rejects(()=>observeSnapshot(fakeClient(i),i,{block,identityCheck:async()=>{throw new Error('IDENTITY_MISMATCH');}}),/IDENTITY_MISMATCH/);
});

test('forged error names and cyclic noncontract causes never match a custom revert',()=>{
  const forged=Object.assign(new Error('NotHolder'),{name:'ContractFunctionRevertedError',data:{errorName:'NotHolder'}});
  assert.equal(expectedContractError(forged,'NotHolder'),false);
  const cyclic=new Error('network error');cyclic.cause=cyclic;assert.equal(expectedContractError(cyclic,'NotHolder'),false);
  assert.equal(expectedContractError(revert('WrongValue'),'WrongValue'),false);
});
test('SDK latest identity reads are pinned while explicit checkpoint requests retain their block',async()=>{
  const i=input(),base=fakeClient(i),checkpoint=BLOCK-1000n,blocks=[];
  const client=fakeClient(i,{getBlock:async options=>{blocks.push(options);assert.equal(options.blockTag,undefined);return {number:options.blockNumber,hash:H,timestamp:TIME};}});
  const result=await observeSnapshot(client,i,{block,identityCheck:async pinned=>{
    assert.deepEqual(await pinned.getBlock({blockTag:'latest'}),block);
    assert.equal((await pinned.getBlock({blockNumber:checkpoint})).number,checkpoint);
    return {verified:true};
  }});
  assert.equal(result.status,'PASS');assert.deepEqual(blocks.map(b=>b.blockNumber),[checkpoint,BLOCK]);
});
for(const [name,field,value]of [
  ['not ACTIVE','state',0],['missing share supply','totalSupply',0n],['wrong NFT owner','ownerOf',OTHER],
  ['unexpected BEM decimals','decimals',6],['reward accounting exceeds balance','totalAccounted',1001n],
])test(`snapshot marks ${name} as FAIL rather than passing an observation`,async()=>{
  const i=input(),base=fakeClient(i),result=await observeSnapshot(fakeClient(i,{readContract:async q=>q.functionName===field?value:base.readContract(q)}),i,{block,identityCheck:async()=>({verified:true})});
  assert.equal(result.status,'FAIL');
});
test('snapshot detects changed canonical block hash',async()=>{
  const i=input(),result=await observeSnapshot(fakeClient(i,{getBlock:async()=>({...block,hash:OTHER_H})}),i,{block,identityCheck:async()=>({verified:true})});
  assert.equal(result.status,'FAIL');assert.equal(result.checks.snapshotCanonical,false);
});
test('read-only CLI rejects environment, endpoint, key and broadcast arguments',()=>{
  assert.deepEqual(argumentsFor([]),{help:false});assert.deepEqual(argumentsFor(['--help']),{help:true});
  for(const args of [['--env','../.env'],['--rpc','https://example.invalid'],['--broadcast'],['--private-key','0x1234']])assert.throws(()=>argumentsFor(args),/NO_ENV_RPC_OR_TRANSACTION_ARGUMENTS_ACCEPTED/);
});
function gateFixture(){
  const i=input();Object.assign(i,{toolHash:'a'.repeat(64),fundingToolHash:'b'.repeat(64),poolToolHash:'c'.repeat(64),sellerToolHash:'d'.repeat(64),bindings:{manifestHash:H}});
  Object.assign(i.action,{nonce:4,valueWei:'99990000000000000',dataHash:H});
  const entry={step:'buyer-b-complete',status:'CONFIRMED',transactionHash:COMPLETION_TX,nonce:4,to:i.action.to,valueWei:i.action.valueWei,dataHash:H,planHash:H,gas:'1200000',gasPrice:'50000000',maxFeeWei:'60000000000000'};
  const journal={schemaVersion:1,chainId:56,sessionHash:i.sessionHash,steps:[entry]};
  const plan={status:'FROZEN_UNSIGNED_BUYER_B_COMPLETION_PLAN',sessionHash:i.sessionHash,completionToolHash:i.toolHash,fundingToolHash:i.fundingToolHash,poolToolHash:i.poolToolHash,sellerRuntimeToolHash:i.sellerToolHash,
    bindings:clone(i.bindings),from:i.action.from,to:i.action.to,nonce:4,valueWei:i.action.valueWei,dataHash:H,gas:entry.gas,gasPrice:entry.gasPrice,maxFeeWei:entry.maxFeeWei};
  let calls=0;const client=new Proxy({},{get:()=>async()=>{calls++;throw new Error('NO_NETWORK_IN_TEST');}});
  return {i,entry,journal,plan,client,calls:()=>calls};
}
test('synthetic completion prerequisite baseline reaches receipt verification only',async()=>{
  const f=gateFixture();await assert.rejects(()=>verifyCompletionPrerequisite(f.client,f.i,f.journal,f.plan),/RPC_READ_UNAVAILABLE_OR_INVALID_RESPONSE/);assert.equal(f.calls(),1);
});
for(const [name,change]of [
  ['unconfirmed completion',f=>f.entry.status='SUBMITTED'],['different completion transaction',f=>f.entry.transactionHash=OTHER_H],
  ['different session',f=>f.journal.sessionHash=OTHER_H],['changed frozen binding',f=>f.plan.bindings.manifestHash=OTHER_H],
  ['changed runtime hash',f=>f.plan.completionToolHash='other'],['changed native principal',f=>f.plan.valueWei='1'],
])test(`completion prerequisite rejects ${name} with zero RPC calls`,async()=>{
  const f=gateFixture();change(f);await assert.rejects(()=>verifyCompletionPrerequisite(f.client,f.i,f.journal,f.plan));assert.equal(f.calls(),0);
});
