import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assessGovernance, inspectGovernance, matchesSafe141ProxyRuntime} from './inspect-governance.mjs';
const matching = () => ({getters:{VERSION:{value:'1.4.1'}}, configuration:{validThresholdAndUniqueNonzeroOwners:true, thresholdRequiresMultipleSignatures:true}, implementation:{masterCopyGetterMatchesSlot0:true}, modules:{complete:true,addresses:[]}, provenance:{officialImplementationAddressAndCodeMatch:true,officialProxyFactoryCodeMatch:true,proxyRuntimeMatchesFactoryCreationReturnSection:true,officialFallbackAddressAndCodeMatch:true,guardAbsent:true}});
test('candidate acceptance requires code provenance and configuration together', () => assert.equal(assessGovernance(matching()),true));
test('getters cannot substitute for any of the runtime provenance checks', () => {
  for(const field of Object.keys(matching().provenance)) { const r=matching(); r.provenance[field]=false; assert.equal(assessGovernance(r),false); }
});
test('single signature, duplicate owners, changed singleton and unknown version fail review', () => {
  const a=matching(); a.configuration.thresholdRequiresMultipleSignatures=false; assert.equal(assessGovernance(a),false);
  const b=matching(); b.configuration.validThresholdAndUniqueNonzeroOwners=false; assert.equal(assessGovernance(b),false);
  const c=matching(); c.implementation.masterCopyGetterMatchesSlot0=false; assert.equal(assessGovernance(c),false);
  const d=matching(); d.getters.VERSION.value='other'; assert.equal(assessGovernance(d),false);
});
test('enabled modules or incomplete pagination do not pass preparation review', () => {
  const a=matching(); a.modules.addresses=['0x0000000000000000000000000000000000001234']; assert.equal(assessGovernance(a),false);
  const b=matching(); b.modules.complete=false; assert.equal(assessGovernance(b),false);
});
test('wrong chain or dev clients are rejected before reading target code', async () => {
  for(const [chain,version] of [[1,'Geth'],[56,'anvil']]) {
    await assert.rejects(inspectGovernance({getChainId:async()=>chain,request:async()=>version}), /MAINNET_IDENTITY_REJECTED/);
  }
});
test('official proxy initcode returns embedded runtime before constructor error-string data', () => {
  const r=JSON.parse(fs.readFileSync(new URL('./observations/governance-1792415713748.json',import.meta.url)));
  const {factoryProxyCreationCode:creation,observedProxyRuntime:runtime}=r.provenance;
  assert.equal(creation.endsWith(runtime.slice(2)),false);
  assert.equal(matchesSafe141ProxyRuntime(creation,runtime),true);
  assert.equal(matchesSafe141ProxyRuntime(creation,runtime.replace('6080','6081')),false);
  assert.equal(matchesSafe141ProxyRuntime(creation.replace('60ab80610119','60ab80610118'),runtime),false);
  assert.equal(matchesSafe141ProxyRuntime('0x'+runtime.slice(2),runtime),false);
});
