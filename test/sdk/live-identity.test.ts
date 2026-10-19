import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, zeroHash, type Address, type Hex } from 'viem';
import { cloneImplementation, cloneRuntime, configurationHash, parseLiveManifest, verifyLiveIdentity, type LiveManifest } from '../../sdk/index.js';
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
const code = '0x6000' as Hex, codeHash = keccak256(code), blockHash = `0x${'aa'.repeat(32)}` as Hex;
function manifest(): LiveManifest {
  const config = { chainId: '56', templateVersion: 1, marketKind: 0 as const, market: addr(10), collection: addr(11), mining: addr(12), bem: addr(13), marketCodeHash: codeHash, seaportDomainSeparator: zeroHash, seaportVersionHash: zeroHash, safetyMargin: '60', mockOnly: false };
  return parseLiveManifest({ schemaVersion: '1', mode: 'live', chainId: 56, network: { checkpointBlock: '10', checkpointHash: blockHash },
    factory: { address: addr(1), codeHash, implementation: { address: addr(2), codeHash } }, template: { address: addr(3), codeHash, validator: { address: addr(4), codeHash } },
    governance: { timelock: { address: addr(5), codeHash }, multisig: { address: addr(6), codeHash }, guardian: addr(7), minimumDelay: '3600', roleAuditBlock: '10', roleAuditBlockHash: blockHash, roleAuditReportHash: blockHash },
    config, configHash: configurationHash(config), dependencies: { collection: { address: addr(11), codeHash }, mining: { address: addr(12), codeHash }, bem: { address: addr(13), codeHash } },
    vault: { address: addr(8), codeHash: keccak256(cloneRuntime(addr(3))), termsHash: blockHash, payloadHash: keccak256('0x'), creator: addr(9), round: '1' } });
}
function stub(m: LiveManifest, mutate: { configHash?: string; clone?: Hex; failFactory?: boolean; failDependencies?: boolean; implementationSlot?: Hex; floor?: bigint; wrongGuardianRole?: boolean } = {}) {
  return { getChainId: async () => 56, getBlock: async () => ({ number: 100n, hash: blockHash }), getStorageAt: async () => mutate.implementationSlot ?? `0x${'0'.repeat(24)}${m.factory.implementation.address.slice(2)}`,
    getCode: async ({ address }: {address:Address}) => {
      if (mutate.failFactory && [m.factory.address, m.factory.implementation.address, m.governance.timelock.address].includes(address)) throw new Error('Factory unavailable');
      if (mutate.failDependencies && [m.config.market, m.config.mining, m.config.bem, m.config.collection, m.template.validator.address].includes(address)) throw new Error('External dependency unavailable');
      return address.toLowerCase() === m.vault.address.toLowerCase() ? mutate.clone ?? cloneRuntime(m.template.address as Address) : code;
    },
    readContract: async ({ address, functionName, args = [] }: {address:Address;functionName:string;args?:unknown[]}) => {
      if (mutate.failFactory && address.toLowerCase() === m.factory.address.toLowerCase()) throw new Error('Factory unavailable');
      const values: Record<string, unknown> = { implementationSelf: m.template.address, templateInitializersDisabled: true, marketValidator: m.template.validator.address, factory: m.factory.address, creator: m.vault.creator, getConfig: m.config, configHash: mutate.configHash ?? m.configHash, termsHash: m.vault.termsHash, purchasePayload: '0x', upgradeAdmin: m.governance.timelock.address, guardian: m.governance.guardian, requiredMinDelay: 3600n, getMinDelay: 3600n, minimumDelayFloor: mutate.floor ?? 3600n, deploymentAddress: m.governance.timelock.address, selectedTemplate: m.template.address, selectedConfigHash: m.configHash, creationPaused: false, hashTerms: m.vault.termsHash, predictPool: m.vault.address };
      if (functionName === 'hasRole') return (args[0] === zeroHash && args[1] === m.governance.timelock.address) || (args[0] !== zeroHash && args[1] === m.governance.multisig.address) || !!mutate.wrongGuardianRole;
      return values[functionName];
    } };
}
function request(m: LiveManifest, command = 'withdraw') { return { command, target: m.vault.address as Address, actor: m.vault.creator as Address, args: [[1n], m.vault.creator], expectedTemplate: m.template.address, expectedCodeHash: m.vault.codeHash }; }

test('standard clone decoder binds exact implementation and rejects proxy/extended runtime', () => {
  assert.equal(cloneImplementation(cloneRuntime(addr(3))).toLowerCase(), addr(3));
  for (const invalid of ['0x6000', `${cloneRuntime(addr(3))}00`, cloneRuntime(addr(3)).replace('363d3d37', '363d3d38')]) assert.throws(() => cloneImplementation(invalid as Hex));
});
test('mock/public production labels and inconsistent Config cannot stand in for reviewed live manifest', () => {
  const m = manifest(); assert.throws(() => parseLiveManifest({ ...m, mode: 'mock', productionReady: true }));
  assert.throws(() => parseLiveManifest({ ...m, config: { ...m.config, mockOnly: true } }));
  assert.throws(() => parseLiveManifest({ ...m, configHash: zeroHash }));
  assert.throws(() => parseLiveManifest({ ...m, template: { ...m.template, address: addr(99) } }));
});
test('live Vault write checks expected template and actual runtime/config commitments', async () => {
  const m = manifest(); assert.equal((await verifyLiveIdentity(stub(m) as never, m, request(m))).status, 'REVIEWED_MANIFEST_AND_CHAIN_IDENTITY_MATCH');
  await assert.rejects(verifyLiveIdentity(stub(m) as never, m, { ...request(m), expectedTemplate: addr(99) }));
  await assert.rejects(verifyLiveIdentity(stub(m, { clone: cloneRuntime(addr(99)) }) as never, m, request(m)));
  await assert.rejects(verifyLiveIdentity(stub(m, { configHash: zeroHash }) as never, m, request(m)));
});
test('direct withdrawals and no-harvest redemption preserve independence from Factory/protocol liveness', async () => {
  const m = manifest();
  for (const command of ['withdraw', 'claim-batch', 'redeem-without-harvest', 'claim-residual']) {
    const result = await verifyLiveIdentity(stub(m, { failFactory: true, failDependencies: true }) as never, m, request(m, command));
    assert.equal(result.factoryCurrentStateChecked, false); assert.equal(result.externalDependencyCodeChecked, false);
  }
  await assert.rejects(verifyLiveIdentity(stub(m, { failDependencies: true }) as never, m, request(m, 'contribute')));
});
test('Factory actions additionally reject changed EIP1967 implementation and unsafe governance', async () => {
  const m = manifest(), r = { ...request(m, 'guardian-cancel'), target: m.factory.address as Address, actor: m.governance.guardian as Address, args: [m.vault.address, 1], expectedCodeHash: m.factory.codeHash };
  assert.equal((await verifyLiveIdentity(stub(m) as never, m, r)).factoryCurrentStateChecked, true);
  await assert.rejects(verifyLiveIdentity(stub(m, { implementationSlot: zeroHash }) as never, m, r));
  await assert.rejects(verifyLiveIdentity(stub(m, { floor: 0n }) as never, m, r));
  await assert.rejects(verifyLiveIdentity(stub(m, { wrongGuardianRole: true }) as never, m, r));
});
test('create manifest binds creator, immutable terms, full payload, round and predicted address', async () => {
  const m = manifest(); const r = { ...request(m, 'create-pool'), target: m.factory.address as Address, args: [m.template.address, m.configHash, {}, '0x', 1n], expectedCodeHash: m.factory.codeHash };
  assert.equal((await verifyLiveIdentity(stub(m) as never, m, r)).factoryCurrentStateChecked, true);
  await assert.rejects(verifyLiveIdentity(stub(m) as never, m, { ...r, args: [...r.args.slice(0, 4), 2n] }));
  await assert.rejects(verifyLiveIdentity(stub(m) as never, m, { ...r, actor: addr(99) }));
});
