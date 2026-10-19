import test from 'node:test';
import assert from 'node:assert/strict';
const modulePath = new URL('../../scripts/fork-preflight.mjs', import.meta.url).href;
const gate = await import(modulePath);
const hash = `0x${'11'.repeat(32)}`;
const otherHash = `0x${'22'.repeat(32)}`;
const source = new URL('https://rpc.example.invalid/bsc');
const good = () => ({ forkConfig: { forkBlockNumber: 123456, forkBlockHash: hash, forkUrl: source.href }, environment: { chainId: 56 } });

test('fork gate permits only explicit loopback HTTP origins', () => {
  for (const url of ['http://127.0.0.1:8545', 'http://localhost:8545', 'http://[::1]:8545']) assert.ok(gate.localOrigin(url));
  for (const url of ['https://127.0.0.1', 'http://rpc.example.invalid', 'http://127.0.0.1/path', 'http://127.0.0.1?key=value', 'http://127.0.0.1#fragment', 'http://user@127.0.0.1']) assert.throws(() => gate.localOrigin(url));
});
test('fork gate requires concrete positive safe block numbers', () => {
  assert.equal(gate.uint('123456', 'INVALID'), 123456n);
  for (const value of ['0', '-1', '1.5', '0x38', '01', '9007199254740992', 'latest']) assert.throws(() => gate.uint(value, 'INVALID'));
});
test('fork gate matches endpoint number hash and explicit chain metadata', () => {
  assert.equal(gate.verifyForkMetadata(good(), source, 123456n, hash), true);
});
test('fork gate refuses missing nodeInfo fields instead of treating chain56 as evidence', () => {
  assert.throws(() => gate.verifyForkMetadata({}, source, 123456n, hash), /ANVIL_FORK_METADATA_MISSING/);
  for (const key of ['forkBlockNumber', 'forkUrl']) {
    const info = good(); delete (info.forkConfig as Record<string, unknown>)[key];
    assert.throws(() => gate.verifyForkMetadata(info, source, 123456n, hash));
  }
});
test('native Anvil 1.4.3 metadata may omit hash but the independently read execution block must match the source pin', () => {
  // Real native field shape observed during the transport smoke test; synthetic values only.
  const native = { forkConfig: { forkUrl: source.href, forkBlockNumber: 123456, forkRetryBackoff: 100 }, environment: { chainId: 56 } };
  assert.equal(gate.verifyForkMetadata(native, source, 123456n, hash), true);
  assert.equal(gate.verifyPinnedExecutionBlock({ number: '0x1e240', hash }, 123456n, hash), true);
  assert.throws(() => gate.verifyForkMetadata(native, new URL('https://other.example.invalid/bsc'), 123456n, hash), /ANVIL_FORK_ENDPOINT_MISMATCH/);
  for (const block of [null, {}, { number: '0x1e240', hash: otherHash }, { number: '0x1e241', hash }, { number: '0x1e240', hash: null }]) {
    assert.throws(() => gate.verifyPinnedExecutionBlock(block, 123456n, hash));
  }
  // A claimed native hash is still evidence that must be well formed and equal.
  for (const forkBlockHash of [null, '0x1234', otherHash]) assert.throws(() => gate.verifyForkMetadata({ ...native, forkConfig: { ...native.forkConfig, forkBlockHash } }, source, 123456n, hash));
  // LAN metadata remains strict because its authenticated session exposes a concrete pin.
  assert.throws(() => gate.verifyForkMetadata(native, undefined, 123456n, hash, { lanRelay: true }), /ANVIL_FORK_HASH_UNKNOWN/);
});
test('fork gate rejects endpoint number hash and environment chain mismatches', () => {
  assert.throws(() => gate.verifyForkMetadata(good(), source, 123457n, hash), /ANVIL_FORK_NUMBER_MISMATCH/);
  assert.throws(() => gate.verifyForkMetadata(good(), source, 123456n, otherHash), /ANVIL_FORK_HASH_MISMATCH/);
  assert.throws(() => gate.verifyForkMetadata(good(), new URL('https://other.example.invalid/bsc'), 123456n, hash), /ANVIL_FORK_ENDPOINT_MISMATCH/);
  const info = good(); info.environment.chainId = 31337;
  assert.throws(() => gate.verifyForkMetadata(info, source, 123456n, hash), /ANVIL_ENV_CHAIN_MISMATCH/);
});
test('fork gate source URL validation rejects non HTTP schemes and fragments', () => {
  assert.equal(gate.sourceUrl(source.href).href, source.href);
  for (const value of ['file:///tmp/rpc', 'ws://127.0.0.1:8545', 'https://rpc.example.invalid#secret', 'not-a-url']) assert.throws(() => gate.sourceUrl(value));
});

const instanceId = 'b333e6bf-a150-4260-a48b-ea2fd56aac54';
const lanEnv = { MODE: 'fork', FORK_EXECUTION_TOPOLOGY: 'lan-relay', FORK_SESSION_ID: instanceId,
  FORK_BLOCK_NUMBER: '123456', FORK_BLOCK_HASH: hash, ORDER_FILE: 'fixtures/real-order.json',
  EXECUTION_RPC_URL: 'http://127.0.0.1:18547', EXPECTED_EXECUTION_CHAIN_ID: '56', SOURCE_CHAIN_ID: '56' };
test('LAN preflight allows host-only upstream credentials but still requires the pin and session', () => {
  const config = gate.preflightConfiguration(lanEnv);
  assert.deepEqual(config.missing, []); assert.equal(config.source, undefined); assert.equal(config.lanRelay, true);
  assert.equal(gate.preflightConfiguration({ ...lanEnv, FORK_SOURCE_RPC_URL: source.href }).source.href, source.href);
  for (const key of ['ORDER_FILE', 'FORK_BLOCK_NUMBER', 'FORK_BLOCK_HASH', 'FORK_SESSION_ID']) {
    assert.ok(gate.preflightConfiguration({ ...lanEnv, [key]: undefined }).missing.includes(key));
  }
});
test('preflight retains default source requirement and rejects topology/mode ambiguity', () => {
  assert.ok(gate.preflightConfiguration({}).missing.includes('FORK_SOURCE_RPC_URL'));
  for (const MODE of ['mock', 'live', undefined]) assert.throws(() => gate.preflightConfiguration({ ...lanEnv, MODE }));
  assert.throws(() => gate.preflightConfiguration({ ...lanEnv, FORK_EXECUTION_TOPOLOGY: 'loopback' }));
  assert.throws(() => gate.preflightConfiguration({ ...lanEnv, FORK_EXECUTION_TOPOLOGY: 'direct-lan' }));
  assert.throws(() => gate.preflightConfiguration({ ...lanEnv, EXECUTION_RPC_URL: 'http://192.168.1.3:8545' }));
  assert.throws(() => gate.preflightConfiguration({ ...lanEnv, FORK_SESSION_ID: 'stale' }));
});
test('LAN metadata validates sanitized number/hash/chain without exposing or comparing forkUrl', () => {
  const sanitized = { forkConfig: { forkBlockNumber: 123456, forkBlockHash: hash }, environment: { chainId: 56 } };
  assert.equal(gate.verifyForkMetadata(sanitized, undefined, 123456n, hash, { lanRelay: true }), true);
  assert.throws(() => gate.verifyForkMetadata(sanitized, source, 123456n, hash), /ANVIL_FORK_ENDPOINT_UNKNOWN/);
  assert.throws(() => gate.verifyForkMetadata({ forkConfig: sanitized.forkConfig }, undefined, 123456n, hash, { lanRelay: true }), /ANVIL_ENV_CHAIN_UNKNOWN/);
});
test('LAN preflight checks exact host instance and pinned identity', () => {
  const session = { kind: 'LAN_ANVIL_FORK', instanceId, chainId: 56, forkBlockNumber: '123456', forkBlockHash: hash };
  assert.equal(gate.verifyLanSession(session, instanceId, 123456n, hash), true);
  for (const changed of [null, {}, { ...session, kind: 'MAINNET' }, { ...session, chainId: 31337 },
    { ...session, instanceId: 'b333e6bf-a150-4260-a48b-ea2fd56aac55' }, { ...session, forkBlockNumber: '123457' },
    { ...session, forkBlockHash: otherHash }]) assert.throws(() => gate.verifyLanSession(changed, instanceId, 123456n, hash));
});
