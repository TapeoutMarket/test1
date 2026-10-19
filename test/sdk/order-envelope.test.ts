import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodeAbiParameters, encodeAbiParameters, keccak256, zeroHash, type AbiParameter } from 'viem';
import { ROOT, configurationHash, loadArtifact, parseOrderEnvelope, executionPayload, executionCommitment, orderAbi, orderHash, domainSeparator, idCost, validateIds, assertExecutableEnvelope, JsonFileOrderSource, HttpOrderSource, executionConfig, sendPolicy, verifyExecutionTarget, safeDiagnostic } from '../../sdk/index.js';
const sample = () => readFile(resolve(ROOT, 'fixtures/seaport-order.example.json'), 'utf8').then(JSON.parse);
const copy = <T>(v: T): T => structuredClone(v);

test('both market examples are strict public structure, neither grants execution', async () => {
  for (const name of ['seaport', 'official']) {
    const e = await new JsonFileOrderSource(`fixtures/${name}-order.example.json`, ROOT).load();
    assert.equal(e.sourceChainId, 56); assert.throws(() => assertExecutableEnvelope(e));
  }
});
test('full Seaport payload roundtrips exact Order struct and hashes all consideration', async () => {
  const e = parseOrderEnvelope(await sample()); assert.equal(e.protocol, 'seaport'); if (e.protocol !== 'seaport') return;
  const payload = executionPayload(e), [order] = decodeAbiParameters(orderAbi, payload);
  assert.equal(order.parameters.totalOriginalConsiderationItems, 2n); assert.equal(order.parameters.consideration.length, 2);
  assert.equal(executionCommitment(e), keccak256(payload)); assert.equal(e.orderHash, orderHash(e)); assert.equal(e.seaport.domain.domainSeparator, domainSeparator(e));
  assert.equal(order.signature, e.seaport.signature);
});
test('missing signature, counter, original count or complete offer is explicit invalid input', async () => {
  for (const mutate of [(e: any) => delete e.seaport.signature, (e: any) => delete e.seaport.components.counter, (e: any) => delete e.seaport.parameters.totalOriginalConsiderationItems, (e: any) => delete e.seaport.components.offer]) {
    const e = await sample(); mutate(e); assert.throws(() => parseOrderEnvelope(e), /InvalidOrderEnvelope/);
  }
});
test('unknown fields and credential-shaped payloads are rejected instead of copied', async () => {
  for (const key of ['privateKey', 'rpcUrl', 'databasePassword', 'to', 'data']) { const e = await sample(); e[key] = 'not-a-secret-test-value'; assert.throws(() => parseOrderEnvelope(e)); }
  const e = await sample(); e.source.password = 'synthetic'; assert.throws(() => parseOrderEnvelope(e));
});
test('tips, wrong domain, fee, amount, counter, partial orders and criteria fail closed', async () => {
  const mutations = [
    (e: any) => e.seaport.parameters.consideration.push(copy(e.seaport.parameters.consideration[1])),
    (e: any) => e.seaport.domain.chainId = 31337,
    (e: any) => e.seaport.domain.domainSeparator = zeroHash,
    (e: any) => e.fees[1].amountWei = '101',
    (e: any) => e.seaport.components.counter = '1',
    (e: any) => e.seaport.parameters.orderType = 1,
    (e: any) => e.seaport.parameters.offer[0].itemType = 4,
    (e: any) => e.seaport.parameters.consideration[0].endAmount = '9999',
  ];
  for (const mutate of mutations) { const e = await sample(); mutate(e); assert.throws(() => parseOrderEnvelope(e)); }
});
test('official quote TTL is separate and cannot fabricate native expiry or compatible adapter', async () => {
  const e = JSON.parse(await readFile(resolve(ROOT, 'fixtures/official-order.example.json'), 'utf8'));
  e.quoteExpiresAt = '2000000000'; assert.equal(parseOrderEnvelope(e).quoteExpiresAt, '2000000000');
  e.nativeEndTime = '2000000000'; assert.throws(() => parseOrderEnvelope(e));
  e.nativeEndTime = null; e.official.adapterStatus = 'verified'; assert.throws(() => parseOrderEnvelope(e));
});
test('ID costs conserve exact total for nondivisible prices and all costs are positive', () => {
  for (const total of [100n, 101n, 199n, 10001n, 10n ** 25n + 45n]) {
    const costs = Array.from({ length: 100 }, (_, i) => idCost(total, i + 1));
    assert.equal(costs.reduce((a, b) => a + b), total); assert.ok(costs.every(v => v > 0n));
    assert.ok(costs[0] - costs[99] <= 1n);
  }
  for (const ids of [[], [1, 1], [0], [101], [1.5]]) assert.throws(() => validateIds(ids));
});
test('Config hash matches independently compiled Vault initialization ABI tuple layout', async () => {
  const address = '0x1111111111111111111111111111111111111111';
  const c = { chainId: '56', templateVersion: 1, marketKind: 0 as const, market: address, collection: address, mining: address, bem: address, marketCodeHash: zeroHash, seaportDomainSeparator: zeroHash, seaportVersionHash: zeroHash, safetyMargin: '60', mockOnly: false };
  const { abi } = await loadArtifact('GroupBuyVault');
  const init = abi.find(item => item.type === 'function' && item.name === 'initialize') as unknown as { inputs: (AbiParameter & {internalType?:string})[] };
  const configInput = init.inputs.find(input => input.internalType === 'struct Types.Config'); assert.ok(configInput);
  assert.equal(configurationHash(c), keccak256(encodeAbiParameters([configInput] as readonly AbiParameter[], [c])));
  assert.notEqual(configurationHash(c), configurationHash({ ...c, safetyMargin: '61' }));
});
test('JSON file source rejects traversal and symlink escapes before content reading', async () => {
  const path = resolve(ROOT, 'test/sdk/.source-boundary'); await mkdir(resolve(path, 'inside'), { recursive: true });
  try {
    await writeFile(resolve(path, 'outside.json'), JSON.stringify(await sample()));
    await symlink('../outside.json', resolve(path, 'inside/link.json'));
    await assert.rejects(new JsonFileOrderSource('../outside.json', resolve(path, 'inside')).load(), /Boundary/);
    await assert.rejects(new JsonFileOrderSource('link.json', resolve(path, 'inside')).load(), /Boundary/);
  } finally { await rm(path, { recursive: true, force: true }); }
});
test('HTTP reads require explicit localhost origin and exact method/operation/path allowlist', () => {
  const rule = { path: '/groupbuy/order', method: 'GET' as const, operation: 'read-order' as const };
  for (const base of ['https://example.com', 'http://localhost:1234/path', 'http://u:p@localhost:1234', 'http://localhost:1234/?token=x']) assert.throws(() => new HttpOrderSource(base, rule, [rule]));
  assert.throws(() => new HttpOrderSource('http://127.0.0.1:1234', rule, []));
  assert.throws(() => new HttpOrderSource('http://localhost:1234', { ...rule, method: 'POST' }, [rule]));
  assert.throws(() => new HttpOrderSource('http://localhost:1234', { ...rule, path: '/cancel' }, [rule]));
  assert.doesNotThrow(() => new HttpOrderSource('http://localhost:1234', rule, [rule]));
});
test('mock/fork never use a remote execution endpoint and cannot authorize live broadcast', () => {
  assert.throws(() => executionConfig({ MODE: 'fork', EXECUTION_RPC_URL: 'https://rpc.example.com' }));
  assert.throws(() => executionConfig({ MODE: 'fork', EXPECTED_EXECUTION_CHAIN_ID: '31337' }));
  assert.equal(sendPolicy('mock', {}, {}), false); assert.equal(sendPolicy('fork', { sendLocal: true }, {}), true);
  assert.throws(() => sendPolicy('live', { sendLocal: true }, {}));
  assert.throws(() => sendPolicy('live', { broadcast: true }, {}));
  assert.throws(() => sendPolicy('mock', { broadcast: true }, { ALLOW_LIVE_SEND: 'true' }));
});
test('fork identity requires Anvil plus number/hash metadata, not chain ID alone', async () => {
  const config = executionConfig({ MODE: 'fork', FORK_BLOCK_NUMBER: '100', FORK_BLOCK_HASH: `0x${'aa'.repeat(32)}` });
  const stub = (version: string, forkConfig: unknown, hash = config.forkBlockHash) => ({ getChainId: async () => 56, request: async ({ method }: {method: string}) => {
    if (method === 'tapeout_forkSession') throw Object.assign(new Error('Method not found'), { code: -32601 });
    return method === 'web3_clientVersion' ? version : { forkConfig };
  }, getBlock: async () => ({ hash }) });
  await assert.rejects(verifyExecutionTarget(config, stub('Geth/v1', {}) as never));
  await assert.rejects(verifyExecutionTarget(config, stub('anvil/v1', {}) as never));
  await assert.rejects(verifyExecutionTarget(config, stub('anvil/v1', { forkBlockNumber: 99 }) as never));
  await assert.rejects(verifyExecutionTarget(config, stub('anvil/v1', { forkBlockNumber: 100 }, zeroHash) as never));
  assert.equal((await verifyExecutionTarget(config, stub('anvil/v1', { forkBlockNumber: 100 }) as never)).forkStatus, 'PINNED_LOCAL_FORK');
});
test('provider failures never expose URLs, private keys or arbitrary provider detail', () => {
  const e = new Error('request failed https://user:password@rpc.example/x secret'); assert.ok(!JSON.stringify(safeDiagnostic(e)).includes('password'));
  assert.ok(!JSON.stringify(safeDiagnostic(new Error('Invalid https://user:password@rpc.example/x'))).includes('password'));
});
test('live mode rejects loopback chain56 and development clients instead of relabeling local receipts', async () => {
  for (const endpoint of ['http://127.0.0.1:8545', 'http://localhost:8545', 'http://localhost.:8545', 'http://[::1]:8545', 'http://127.1:8545', 'http://[::ffff:127.0.0.1]:8545']) assert.throws(() => executionConfig({ MODE: 'live', EXECUTION_RPC_URL: endpoint }));
  const c = executionConfig({ MODE: 'live', EXECUTION_RPC_URL: 'https://reviewed-rpc.example.invalid' });
  for (const version of ['anvil/v1', 'HardhatNetwork/3', 'Ganache/v7']) await assert.rejects(verifyExecutionTarget(c, { getChainId: async () => 56, request: async () => version } as never));
  const evidence = await verifyExecutionTarget(c, { getChainId: async () => 56, request: async () => 'Geth/BSC' } as never);
  assert.match(evidence.networkEvidence!, /not independent mainnet proof/);
});
