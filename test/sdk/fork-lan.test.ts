import test from 'node:test';
import assert from 'node:assert/strict';
const commonPath = new URL('../../scripts/fork-lan-common.mjs', import.meta.url).href;
const hostPath = new URL('../../scripts/fork-host.mjs', import.meta.url).href;
const relayPath = new URL('../../scripts/fork-connect.mjs', import.meta.url).href;
const gate = await import(commonPath);
const { hostConfig } = await import(hostPath);
const { relayConfig } = await import(relayPath);
const blockHash = `0x${'11'.repeat(32)}`, sessionID = '01234567-89ab-4cde-8fab-0123456789ab', secret = 'a'.repeat(64);
const address = `0x${'12'.repeat(20)}`;
const item = (method: string, params: unknown[] = []) => ({ jsonrpc: '2.0', id: 1, method, params });

test('LAN gateway requires explicit RFC1918 IPv4 without credentials or path', () => {
  for (const ip of ['10.0.0.2', '172.16.0.2', '172.31.255.254', '192.168.1.2']) assert.equal(gate.gatewayURL(`http://${ip}:18545/`).hostname, ip);
  for (const url of ['http://0.0.0.0:8545', 'http://127.0.0.1:8545', 'http://8.8.8.8:8545', 'http://172.32.0.1', 'http://host.local', 'http://[::1]', 'https://192.168.1.2', 'http://user:secret@192.168.1.2', 'http://192.168.1.2/api', 'http://192.168.1.2?token=secret', 'http://192.168.1.2#x', 'http://0xc0a80102']) assert.throws(() => gate.gatewayURL(url));
});
test('LAN authentication requires client socket IP, token and exact session independently', () => {
  const headers = { authorization: `Bearer ${secret}`, 'x-tapeout-fork-session': sessionID };
  const ips = new Set(['192.168.1.3']);
  assert.doesNotThrow(() => gate.authorize(headers, '::ffff:192.168.1.3', secret, sessionID, ips));
  assert.throws(() => gate.authorize(headers, '192.168.1.4', secret, sessionID, ips), /CLIENT_IP_FORBIDDEN/);
  assert.throws(() => gate.authorize({ ...headers, authorization: 'Bearer wrong' }, '192.168.1.3', secret, sessionID, ips), /AUTHENTICATION_REQUIRED/);
  assert.throws(() => gate.authorize({ ...headers, 'x-tapeout-fork-session': 'wrong' }, '192.168.1.3', secret, sessionID, ips), /FORK_SESSION_HEADER_MISMATCH/);
  assert.throws(() => gate.authorize({ ...headers, origin: 'https://evil.invalid' }, '192.168.1.3', secret, sessionID, ips), /BROWSER_ORIGIN_FORBIDDEN/);
});
test('gateway accepts local unlocked transactions only from explicit sandbox addresses', () => {
  const allowed = new Set([address]);
  assert.equal(gate.validateMethod(item('eth_sendTransaction', [{ from: address, to: address, value: '0x1' }]), allowed), true);
  assert.throws(() => gate.validateMethod(item('eth_sendTransaction', [{ from: address }]), new Set()), /SANDBOX_SENDER_NOT_ALLOWED/);
  for (const method of ['anvil_impersonateAccount', 'anvil_stopImpersonatingAccount', 'anvil_setBalance']) {
    assert.doesNotThrow(() => gate.validateMethod(item(method, [address, '0x1']), allowed));
    assert.throws(() => gate.validateMethod(item(method, [address, '0x1']), new Set()), /SANDBOX_ACCOUNT_NOT_ALLOWED/);
  }
});
test('signed transactions signing wallet APIs resets and storage/code mutation are denied', () => {
  for (const method of ['eth_sendRawTransaction', 'eth_sign', 'eth_signTypedData_v4', 'personal_sendTransaction', 'wallet_sendCalls', 'anvil_setCode', 'anvil_setStorageAt', 'anvil_reset', 'anvil_loadState', 'anvil_autoImpersonateAccount', 'anvil_setRpcUrl', 'evm_setAccountBalance', 'debug_traceCall']) assert.throws(() => gate.validateMethod(item(method), new Set([address])), /RPC_METHOD_FORBIDDEN/);
});
test('source proxy rejects every supported local write method and account enumeration', () => {
  for (const method of gate.WRITE_METHODS) assert.throws(() => gate.validateMethod(item(method), new Set([address]), true), /RPC_METHOD_FORBIDDEN/);
  assert.throws(() => gate.validateMethod(item('anvil_nodeInfo'), new Set(), true));
  assert.throws(() => gate.validateMethod(item('eth_accounts'), new Set(), true));
  for (const method of ['eth_chainId', 'eth_getBlockByNumber', 'eth_getStorageAt', 'eth_call', 'eth_getCode']) assert.equal(gate.validateMethod(item(method), new Set(), true), false);
});
test('nodeInfo output retains only chain and block proof and removes credentials', () => {
  const sanitized = gate.sanitizeNodeInfo({ forkConfig: { forkBlockNumber: 123, forkBlockHash: blockHash, forkUrl: 'https://provider.invalid/secret' }, environment: { chainId: 56, secret }, accounts: [secret], other: secret });
  assert.deepEqual(sanitized, { forkConfig: { forkBlockNumber: 123, forkBlockHash: blockHash }, environment: { chainId: 56 } });
  assert.ok(!JSON.stringify(sanitized).includes('secret'));
});
test('session proof binds UUID chain block number and hash', () => {
  const expected = gate.expectedSession(sessionID, '123', blockHash); assert.doesNotThrow(() => gate.checkSession(expected, expected));
  for (const changed of [{ instanceId: '01234567-89ab-4cde-8fab-0123456789ac' }, { chainId: 31337 }, { forkBlockNumber: '124' }, { forkBlockHash: `0x${'22'.repeat(32)}` }, { kind: 'REMOTE_RPC' }]) assert.throws(() => gate.checkSession({ ...expected, ...changed }, expected), /FORK_SESSION_IDENTITY_MISMATCH/);
});
test('request validation bounds batches and rejects JSON RPC notifications', () => {
  assert.equal(gate.requestItems(Array.from({ length: 20 }, () => item('eth_chainId'))).length, 20);
  for (const value of [[], Array.from({ length: 21 }, () => item('eth_chainId')), null, { method: 'eth_chainId', jsonrpc: '2.0' }, { ...item('eth_chainId'), params: {} }, { ...item('eth_chainId'), id: {} }]) assert.throws(() => gate.requestItems(value));
});
test('error redaction preserves only bounded revert hex and excludes provider text', () => {
  assert.deepEqual(gate.safeRPCError({ code: -32000, message: 'secret source URL', data: { url: 'secret' } }), { code: -32000, message: 'Fork RPC request failed; provider details redacted.' });
  assert.equal(gate.safeRPCError({ data: '0xdeadbeef' }).data, '0xdeadbeef');
  assert.equal(gate.safeRPCError({ data: `0x${'a'.repeat(70000)}` }).data, undefined);
});
test('host config defaults to separate local and gateway ports and no permitted senders', () => {
  const config = hostConfig({ FORK_SOURCE_RPC_URL: 'https://provider.invalid/secret', FORK_BLOCK_NUMBER: '123', FORK_BLOCK_HASH: blockHash, FORK_BIND_HOST: '192.168.1.2', FORK_ALLOWED_CLIENT_IPS: '192.168.1.3' });
  assert.equal(config.gatewayPort, 18545); assert.equal(config.internalPort, 18546); assert.equal(config.sandboxAccounts.size, 0);
  assert.throws(() => hostConfig({ FORK_SOURCE_RPC_URL: 'https://provider.invalid', FORK_BLOCK_NUMBER: '123', FORK_BLOCK_HASH: blockHash, FORK_BIND_HOST: '0.0.0.0', FORK_ALLOWED_CLIENT_IPS: '*' }));
});
test('relay config requires explicit session pin and private origin', () => {
  const env = { FORK_GATEWAY_URL: 'http://192.168.1.2:18545', FORK_GATEWAY_TOKEN: secret, FORK_SESSION_ID: sessionID, FORK_BLOCK_NUMBER: '123', FORK_BLOCK_HASH: blockHash };
  assert.equal(relayConfig(env).port, 18547);
  for (const key of Object.keys(env)) assert.throws(() => relayConfig({ ...env, [key]: undefined }));
  assert.throws(() => relayConfig({ ...env, FORK_GATEWAY_URL: 'https://bsc-provider.invalid' }));
});
test('mine batches remain bounded and account/IP syntax cannot widen policy', () => {
  assert.doesNotThrow(() => gate.validateMethod(item('anvil_mine', ['0x3e8'])));
  for (const count of ['0x3e9', '-1', 'garbage']) assert.throws(() => gate.validateMethod(item('anvil_mine', [count])));
  for (const value of ['*', '192.168.1.0/24', 'localhost']) assert.throws(() => gate.clientIPs(value));
  for (const value of ['*', address + ',*', '0x1234']) assert.throws(() => gate.addresses(value));
});
