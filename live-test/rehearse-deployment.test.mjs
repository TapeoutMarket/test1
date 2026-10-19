import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {keccak256} from 'viem';
import {assertDeploymentBundle} from './rehearse-deployment.mjs';
import {loadArtifacts} from './prepare-deployments.mjs';
const artifacts=await loadArtifacts();
const raw=await fs.readFile(new URL('./SESSION_PLAN.json',import.meta.url));
const session=JSON.parse(raw);
const bundle=JSON.parse(await fs.readFile(new URL('./observations/unsigned-deployments-1792415847788.json',import.meta.url)));
const base={bundle,session,artifacts,sessionHash:keccak256(raw),verificationInputHash:session.coreVerificationInputHash};
const clone=()=>structuredClone(base);
test('binds four deploy initcodes and expected addresses to reviewed artifacts and current session',()=>assert.equal(Object.keys(assertDeploymentBundle(base)).length,4));
for(const [name,mutate,code] of [
  ['session hash',x=>x.bundle.sessionHash='0x'+'11'.repeat(32),'BUNDLE_SESSION_OR_SOURCE_CHANGED'],
  ['source hash',x=>x.bundle.verificationInputHash='11'.repeat(32),'BUNDLE_SESSION_OR_SOURCE_CHANGED'],
  ['chain ID',x=>x.bundle.chainId=31337,'UNSIGNED_BSC_BUNDLE_REQUIRED'],
  ['missing deployment',x=>x.bundle.transactions.pop(),'EXACTLY_FOUR_DEPLOYMENTS_REQUIRED'],
  ['changed nonce',x=>x.bundle.transactions[3].unsignedTransaction.nonce++,'BUNDLE_TRANSACTION_FIELDS_MISMATCH'],
  ['changed amount',x=>x.bundle.transactions[0].unsignedTransaction.value='1','BUNDLE_TRANSACTION_FIELDS_MISMATCH'],
  ['changed sender',x=>x.bundle.transactions[0].unsignedTransaction.from=x.session.seller,'BUNDLE_TRANSACTION_FIELDS_MISMATCH'],
  ['changed initcode',x=>x.bundle.transactions[3].unsignedTransaction.data+='00','BUNDLE_INITCODE_MISMATCH'],
  ['changed expected address',x=>x.bundle.transactions[3].expectedContractAddress=x.session.seller,'BUNDLE_DEPLOYMENT_ADDRESS_MISMATCH'],
  ['weakened delay',x=>x.session.governance.minimumDelaySeconds=1,'CREATOR_OR_DELAY_MISMATCH'],
]) test(`rejects ${name}`,()=>{const x=clone();mutate(x);assert.throws(()=>assertDeploymentBundle(x),new RegExp(code));});
test('source access has no private key consumption and forwards only read allowlist',async()=>{const text=await fs.readFile(new URL('./rehearse-deployment.mjs',import.meta.url),'utf8');assert.match(text,/validateMethod\(item,new Set\(\),true\)/);assert.doesNotMatch(text,/privateKeyToAccount|sendRawTransaction|createWalletClient/);assert.doesNotMatch(text,/anvil_setBalance|anvil_setNonce|anvil_setCode|anvil_setStorage/);});
test('network errors cannot count as expected contract rejection',async()=>{const {expectRevert}=await import('./rehearse-deployment.mjs');const result={checks:{assertions:[]}};await assert.rejects(()=>expectRevert(async()=>{throw new Error('network');},'EXPECTED',result),/EXPECTED_CONTRACT_REVERT_NOT_NETWORK_ERROR/);assert.equal(result.checks.assertions.length,0);});
test('concurrent signal and finally shutdown await the same completed cleanup',async()=>{const {onceAsyncShutdown}=await import('./rehearse-deployment.mjs');let release,calls=0,finished=false;const gate=new Promise(resolve=>{release=resolve;});const stop=onceAsyncShutdown(async()=>{calls++;await gate;finished=true;});const first=stop(),second=stop();assert.equal(first,second);assert.equal(calls,1);assert.equal(finished,false);release();await second;assert.equal(finished,true);});
test('unexpected contract error cannot count as the intended access-control rejection',async()=>{const {expectRevert}=await import('./rehearse-deployment.mjs');const result={checks:{assertions:[]}};const error={walk:()=>({name:'ContractFunctionRevertedError',data:{errorName:'DifferentError'}})};await assert.rejects(()=>expectRevert(async()=>{throw error;},'CREATOR_SCHEDULE_REJECTED',result),/UNEXPECTED_CONTRACT_REVERT_REASON/);assert.equal(result.checks.assertions.length,0);});
