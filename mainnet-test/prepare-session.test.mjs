import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {keccak256,zeroAddress} from 'viem';
import {validateEvidence,buildPublicOrder,buildManifest} from './prepare-session.mjs';
import {buildTerms} from '../sdk/contracts.ts';
import {cloneRuntime} from '../sdk/live-identity.ts';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const governance=read('live-test/observations/governance-inspection-1792420701946.json');
const preflight=read('live-test/observations/preflight-1792420710423.json');
const plan=read('live-test/SESSION_PLAN.json');
const copy=value=>structuredClone(value);
const block={number:128571566n,hash:preflight.checkpoint.blockHash,timestamp:1792420704n};
const input={plan,config:governance.configuration,preflight,block,information:[preflight.seaport.version,preflight.seaport.domainSeparator,preflight.seaport.conduitController],counter:0n,salt:123456n};

test('accepted evidence requires executed governance, exact roles and source-chain match',()=>{
  assert.equal(validateEvidence(governance,preflight,plan),true);
  for(const mutate of [g=>{g.status='READY_FOR_USER_SAFE_EXECUTION';},g=>{g.creationPaused=true;},g=>{g.operation.stateName='WAITING';}]){
    const g=copy(governance);mutate(g);assert.throws(()=>validateEvidence(g,preflight,plan),/GOVERNANCE_NOT_EXECUTED/);
  }
  const g=copy(governance);g.selectedTemplate=zeroAddress;
  assert.throws(()=>validateEvidence(g,preflight,plan),/SELECTED_CONFIGURATION_MISMATCH/);
  const p=copy(preflight);p.independentCrossCheck.status='UNVERIFIED';
  assert.throws(()=>validateEvidence(governance,p,plan),/INDEPENDENT_CHAIN_EVIDENCE_REQUIRED/);
});
test('altered roles, config or 67/33 sale terms fail closed',()=>{
  const g=copy(governance);g.roleHistory.activeMembers.push('extra-role');
  assert.throws(()=>validateEvidence(g,preflight,plan),/ROLE_HISTORY_HASH_MISMATCH/);
  const g2=copy(governance);g2.configuration.safetyMargin='0';
  assert.throws(()=>validateEvidence(g2,preflight,plan),/CONFIGURATION_HASH_MISMATCH/);
  const s=copy(plan);s.sellerPriceWei='1';
  assert.throws(()=>validateEvidence(governance,preflight,s),/SESSION_SCOPE_MISMATCH/);
  const s2=copy(plan);s2.contributions[0].shares=66;
  assert.throws(()=>validateEvidence(governance,preflight,s2),/ALLOCATION_NOT_CONFIRMED/);
});
test('draft contains native 0.3+0.003, only #3204, no signature or executable claim',()=>{
  const e=buildPublicOrder(input);
  assert.equal(e.source.name,'MAINNET_TEST_SELLER_VALIDATION_PENDING');
  assert.equal(e.validation.status,'unknown');assert.equal(e.seaport.signature,'0x');
  assert.equal(e.seaport.parameters.offer.length,1);assert.equal(e.seaport.parameters.offer[0].identifierOrCriteria,'3204');
  assert.equal(e.buyerPaysWei,'303000000000000000');
  assert.deepEqual(e.fees.map(x=>x.amountWei),['300000000000000000','3000000000000000']);
  assert.equal(BigInt(e.nativeEndTime)-BigInt(e.nativeStartTime),86400n);
  assert.throws(()=>buildPublicOrder({...input,information:['1.5',input.information[1],input.information[2]]}),/SEAPORT_DOMAIN_MISMATCH/);
});
test('predicted manifest binds clone implementation, terms and payload before creation',()=>{
  const e=buildPublicOrder(input),request=buildTerms(e,input.config,BigInt(e.nativeEndTime)-300n,'TapeOut3204-mainnet-67-33','');
  const manifest=buildManifest({governance,preflight,plan,block,request,predicted:'0x1111111111111111111111111111111111111111',round:1n});
  assert.equal(manifest.vault.codeHash,keccak256(cloneRuntime(governance.selectedTemplate)));
  assert.equal(manifest.vault.termsHash,request.termsHash);assert.equal(manifest.vault.payloadHash,keccak256(request.payload));
  assert.equal(manifest.governance.minimumDelay,'600');
  const p=copy(preflight);p.protocolRuntimeIdentities.find(x=>x.field==='mining').address=zeroAddress;
  assert.throws(()=>buildManifest({governance,preflight:p,plan,block,request,predicted:manifest.vault.address,round:1n}),/DEPENDENCY_IDENTITY_MISSING/);
});
