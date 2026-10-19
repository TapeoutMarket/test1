import test from 'node:test';
import assert from 'node:assert/strict';
const helper = await import(new URL('../../scripts/configure-local.mjs', import.meta.url).href);
const address = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const env = { MODE: 'mock', EXPECTED_EXECUTION_CHAIN_ID: '56', SOURCE_CHAIN_ID: '56', EXECUTION_RPC_URL: 'http://127.0.0.1:8545' };
const config = () => ({ chainId: '56', templateVersion: 1, marketKind: 2, market: address(10), collection: address(11), mining: address(12), bem: address(13), marketCodeHash: `0x${'11'.repeat(32)}`, seaportDomainSeparator: `0x${'00'.repeat(32)}`, seaportVersionHash: `0x${'00'.repeat(32)}`, safetyMargin: '60', mockOnly: true });
const args = () => ['--factory', address(1), '--template', address(2), '--timelock', address(3), '--from', address(4), '--config', 'fixtures/config.json'];

test('local governance defaults to a plan with explicit public addresses and config', () => {
  assert.equal(helper.parseArguments(args()).sendLocal, false);
  assert.equal(helper.parseArguments([...args(), '--send-local']).sendLocal, true);
});
test('local governance rejects unknown/duplicate/private-key/broadcast flags', () => {
  for (const flags of [['--broadcast'], ['--private-key', 'not-a-key'], ['--factory', address(5)], ['--send-local', '--send-local']]) assert.throws(() => helper.parseArguments([...args(), ...flags]));
  assert.throws(() => helper.parseArguments(args().slice(0, -2)));
  assert.throws(() => helper.parseArguments(['--factory', address(1), '--template', address(1), '--timelock', address(3), '--from', address(4), '--config', 'fixtures/config.json']));
});
test('local governance rejects live and nonexplicit modes before execution', () => {
  for (const mode of ['live', '', undefined]) assert.throws(() => helper.localConfiguration({ ...env, MODE: mode }, config()));
  assert.throws(() => helper.localConfiguration({ ...env, EXECUTION_RPC_URL: 'https://remote.invalid/' }, config()));
  assert.throws(() => helper.localConfiguration({ ...env, EXPECTED_EXECUTION_CHAIN_ID: '31337' }, config()));
});
test('local governance rejects official reserved and mock/real configuration confusion', () => {
  assert.equal(helper.localConfiguration(env, config()).config.marketKind, 2);
  assert.throws(() => helper.localConfiguration(env, { ...config(), marketKind: 1 }));
  assert.throws(() => helper.localConfiguration(env, { ...config(), mockOnly: false }));
  assert.throws(() => helper.localConfiguration({ ...env, MODE: 'fork' }, config()));
  assert.equal(helper.localConfiguration({ ...env, MODE: 'fork' }, { ...config(), marketKind: 0, mockOnly: false }).config.marketKind, 0);
  assert.throws(() => helper.localConfiguration(env, { ...config(), safetyMargin: (2n ** 64n).toString() }));
});
test('local governance operation salt is stable and binds every selected identity', () => {
  const hash = `0x${'11'.repeat(32)}`, other = `0x${'22'.repeat(32)}`;
  const salt = helper.operationSalt(address(1), address(2), hash, address(4));
  assert.equal(salt, helper.operationSalt(address(1), address(2), hash, address(4)));
  assert.notEqual(salt, helper.operationSalt(address(9), address(2), hash, address(4)));
  assert.notEqual(salt, helper.operationSalt(address(1), address(9), hash, address(4)));
  assert.notEqual(salt, helper.operationSalt(address(1), address(2), other, address(4)));
  assert.notEqual(salt, helper.operationSalt(address(1), address(2), hash, address(9)));
});
test('local governance preserves explicit LAN fork session configuration', () => {
  const result = helper.localConfiguration({ ...env, MODE: 'fork', FORK_EXECUTION_TOPOLOGY: 'lan-relay',
    FORK_SESSION_ID: 'b333e6bf-a150-4260-a48b-ea2fd56aac54', FORK_BLOCK_NUMBER: '123456', FORK_BLOCK_HASH: `0x${'11'.repeat(32)}` },
    { ...config(), marketKind: 0, mockOnly: false });
  assert.equal(result.execution.forkTopology, 'lan-relay');
  assert.equal(result.execution.forkSessionId, 'b333e6bf-a150-4260-a48b-ea2fd56aac54');
});
