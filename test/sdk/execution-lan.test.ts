import test from 'node:test';
import assert from 'node:assert/strict';
import { executionConfig, verifyExecutionTarget, verifyLanForkSession } from '../../sdk/execution.js';

// These are synthetic unit fixtures, never evidence of a running LAN host or real BSC fork.
const hash = `0x${'11'.repeat(32)}`;
const otherHash = `0x${'22'.repeat(32)}`;
const instanceId = 'b333e6bf-a150-4260-a48b-ea2fd56aac54';
const env = { MODE: 'fork', FORK_EXECUTION_TOPOLOGY: 'lan-relay', FORK_SESSION_ID: instanceId,
  EXECUTION_RPC_URL: 'http://127.0.0.1:18547', EXPECTED_EXECUTION_CHAIN_ID: '56', SOURCE_CHAIN_ID: '56',
  FORK_BLOCK_NUMBER: '123456', FORK_BLOCK_HASH: hash };
const session = () => ({ kind: 'LAN_ANVIL_FORK', instanceId, chainId: 56, forkBlockNumber: '123456', forkBlockHash: hash });
const info = () => ({ forkConfig: { forkBlockNumber: 123456, forkBlockHash: hash }, environment: { chainId: 56 } });
type StubOptions = { chainId?: number; version?: string; session?: unknown; metadata?: unknown; hash?: string; restart?: boolean };
function stub(options: StubOptions = {}) {
  let sessionReads = 0;
  return {
    getChainId: async () => options.chainId ?? 56,
    getBlock: async () => ({ hash: options.hash ?? hash }),
    request: async ({ method }: { method: string }) => {
      if (method === 'web3_clientVersion') return options.version ?? 'anvil/v1.4.3';
      if (method === 'anvil_nodeInfo') return options.metadata ?? info();
      if (method === 'tapeout_forkSession') {
        sessionReads++;
        if (options.restart && sessionReads > 1) return { ...session(), instanceId: 'b333e6bf-a150-4260-a48b-ea2fd56aac55' };
        return options.session ?? session();
      }
      throw new Error('Unexpected RPC method');
    },
  };
}
test('LAN fork is explicit and never accepts direct LAN execution URLs or mock/live modes', () => {
  assert.equal(executionConfig({ MODE: 'fork' }).forkTopology, 'loopback');
  assert.equal(executionConfig(env).forkTopology, 'lan-relay');
  for (const MODE of ['mock', 'live']) assert.throws(() => executionConfig({ ...env, MODE }), /MODE must be fork/);
  for (const EXECUTION_RPC_URL of ['http://192.168.1.5:18546', 'http://10.0.0.2:18546', 'https://rpc.example.invalid', 'http://token@127.0.0.1:18547']) assert.throws(() => executionConfig({ ...env, EXECUTION_RPC_URL }));
  assert.throws(() => executionConfig({ ...env, FORK_EXECUTION_TOPOLOGY: 'direct-lan' }));
  assert.throws(() => executionConfig({ ...env, FORK_EXECUTION_TOPOLOGY: 'loopback' }), /explicit lan-relay/);
});
test('LAN fork configuration requires UUID and a concrete block/hash', () => {
  for (const key of ['FORK_SESSION_ID', 'FORK_BLOCK_NUMBER', 'FORK_BLOCK_HASH']) assert.throws(() => executionConfig({ ...env, [key]: undefined }));
  for (const value of ['', 'latest', '0', '-1']) assert.throws(() => executionConfig({ ...env, FORK_BLOCK_NUMBER: value }));
  for (const value of ['not-a-session', '00000000-0000-0000-0000-000000000000']) assert.throws(() => executionConfig({ ...env, FORK_SESSION_ID: value }));
  assert.throws(() => executionConfig({ ...env, FORK_BLOCK_HASH: '0x1234' }));
});
test('LAN session binding rejects stale sessions, wrong pins and non-fork assertions', () => {
  const config = executionConfig(env);
  verifyLanForkSession(config, session());
  for (const changed of [null, {}, { ...session(), kind: 'MAINNET' }, { ...session(), chainId: 31337 },
    { ...session(), instanceId: 'b333e6bf-a150-4260-a48b-ea2fd56aac55' },
    { ...session(), forkBlockNumber: '123457' }, { ...session(), forkBlockNumber: 123456 },
    { ...session(), forkBlockHash: otherHash }]) assert.throws(() => verifyLanForkSession(config, changed));
});
test('LAN identity reports remote fork location separately from loopback transport', async () => {
  const evidence = await verifyExecutionTarget(executionConfig(env), stub() as never);
  assert.equal(evidence.local, false);
  assert.equal(evidence.localTransport, true);
  assert.equal(evidence.executionLocation, 'LAN_ANVIL_FORK');
  assert.equal(evidence.forkStatus, 'PINNED_LAN_FORK');
  assert.equal(evidence.forkSessionId, instanceId);
});
test('LAN identity rejects chain/client/metadata/canonical block mismatches and host restarts', async () => {
  for (const options of [{ chainId: 1 }, { version: 'Geth/BSC' }, { session: {} }, { metadata: {} },
    { metadata: { forkConfig: { forkBlockNumber: 123456 }, environment: { chainId: 56 } } },
    { metadata: { forkConfig: info().forkConfig } },
    { metadata: { ...info(), environment: { chainId: 31337 } } },
    { metadata: { ...info(), forkConfig: { forkBlockNumber: 123455, forkBlockHash: hash } } },
    { metadata: { ...info(), forkConfig: { forkBlockNumber: 123456, forkBlockHash: otherHash } } },
    { hash: otherHash }, { restart: true }]) {
    await assert.rejects(verifyExecutionTarget(executionConfig(env), stub(options) as never));
  }
});
test('manual mutation cannot enable LAN relay under live mode', async () => {
  const config = executionConfig(env);
  await assert.rejects(verifyExecutionTarget({ ...config, mode: 'live' }, stub() as never), /MODE must be fork/);
});
test('default loopback fork refuses a LAN session and only ignores method-not-found responses', async () => {
  const config = executionConfig({ ...env, FORK_EXECUTION_TOPOLOGY: 'loopback', FORK_SESSION_ID: undefined });
  await assert.rejects(verifyExecutionTarget(config, stub() as never), /explicit lan-relay/);
  const ordinary = (failure: unknown) => {
    const client = stub(); const original = client.request;
    client.request = async request => { if (request.method === 'tapeout_forkSession') throw failure; return original(request); };
    return client;
  };
  const missing = Object.assign(new Error('Method not found'), { code: -32601 });
  assert.equal((await verifyExecutionTarget(config, ordinary(missing) as never)).forkStatus, 'PINNED_LOCAL_FORK');
  assert.equal((await verifyExecutionTarget(config, ordinary(new Error('wrapped', { cause: missing })) as never)).forkStatus, 'PINNED_LOCAL_FORK');
  for (const failure of [new Error('Disconnected'), Object.assign(new Error('Denied'), { code: -32000 }), new Error('method not found text without code')]) {
    await assert.rejects(verifyExecutionTarget(config, ordinary(failure) as never));
  }
});
