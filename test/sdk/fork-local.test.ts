import test from 'node:test';
import assert from 'node:assert/strict';
const modulePath = new URL('../../scripts/fork-local.mjs', import.meta.url).href;
const { localConfig, startLocalForSelfTest } = await import(modulePath);
const good = () => ({ FORK_SOURCE_RPC_URL: 'https://provider.invalid/private-key-in-url', FORK_BLOCK_NUMBER: '123456', FORK_BLOCK_HASH: `0x${'11'.repeat(32)}` });
test('local fork requires explicit source and exact positive block/hash', () => {
  const parsed = localConfig(good()); assert.equal(parsed.localPort, 18545); assert.equal(parsed.number, 123456);
  for (const key of Object.keys(good())) assert.throws(() => localConfig({ ...good(), [key]: undefined }));
  for (const block of ['0', '-1', 'latest', '123.5', '01']) assert.throws(() => localConfig({ ...good(), FORK_BLOCK_NUMBER: block }));
  assert.throws(() => localConfig({ ...good(), FORK_BLOCK_HASH: 'latest' }));
});
test('local port validation cannot select public interfaces or unsafe ports', () => {
  assert.equal(localConfig({ ...good(), FORK_LOCAL_PORT: '18549' }).localPort, 18549);
  for (const value of ['0', '80', '65536', '0.0.0.0:18545', '18545;echo']) assert.throws(() => localConfig({ ...good(), FORK_LOCAL_PORT: value }));
  assert.equal(localConfig({ ...good(), FORK_BIND_HOST: '0.0.0.0' }).host, undefined);
});
test('local source URL accepts explicit HTTP(S) but cannot point to same local fork port', () => {
  for (const url of ['file:///tmp/secret', 'ws://127.0.0.1:8545', 'https://provider.invalid#secret', 'http://127.0.0.1:18545']) assert.throws(() => localConfig({ ...good(), FORK_SOURCE_RPC_URL: url }));
  assert.equal(localConfig({ ...good(), FORK_SOURCE_RPC_URL: 'http://127.0.0.1:18550' }).source.hostname, '127.0.0.1');
});
test('selftest factory cannot accidentally use public or private LAN source providers', async () => {
  for (const url of ['https://provider.invalid', 'http://192.168.1.2:8545', 'http://localhost:8545', 'http://user:secret@127.0.0.1:8545']) await assert.rejects(() => startLocalForSelfTest({ ...localConfig(good()), source: new URL(url) }), /SELFTEST_SOURCE_MUST_BE_LOOPBACK/);
});
