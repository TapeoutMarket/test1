#!/usr/bin/env node
/** Real Anvil transport self-test with a LOCAL MOCK upstream. This is not BSC protocol/fork evidence. */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startLoopbackHostForSelfTest } from './fork-host.mjs';
import { startLoopbackRelayForSelfTest } from './fork-connect.mjs';
import { verificationHash } from './release-files.mjs';
import { authorize, closeServer, demand, ForkError, postRPC, readRPC, rpcServer } from './fork-lan-common.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function freePort() { const server = net.createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); const result = server.address().port; await new Promise(resolve => server.close(resolve)); return result; }
async function portClosed(port) { return new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolve(false); }); socket.once('error', () => resolve(true)); }); }
function plainRequest(url, body, headers, localAddress = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const encoded = JSON.stringify(body), req = http.request(url, { method: 'POST', localAddress, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded), ...headers } }, res => { const parts = []; res.on('data', chunk => parts.push(chunk)); res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(parts).toString()) }); } catch { reject(new ForkError('INVALID_TEST_RESPONSE')); } }); });
    req.setTimeout(20000, () => req.destroy(new ForkError('TEST_TIMEOUT'))); req.on('error', reject); req.end(encoded);
  });
}
export async function main() {
  demand(process.argv.length === 2, 'NO_ARGUMENTS_SUPPORTED');
  demand(await fs.realpath(process.cwd()) === await fs.realpath(ROOT), 'RUN_FROM_REPOSITORY_ROOT');
  const sourceInputHash = verificationHash();
  const checks = [], report = { schemaVersion: 1, scope: 'ONLY_TRANSPORT_MOCK_UPSTREAM', status: 'RUNNING', generatedAt: new Date().toISOString(), actualBSCForkExecuted: false, sourceRpcWritesAfterFixtureInitialization: 0, sourceBoundary: 'READ_ONLY_PROXY_ONLY_AFTER_LOCAL_FIXTURE_SETUP', localMockSourceFixtureWrites: [{ method: 'evm_mine', count: 1 }], verificationInputHash: sourceInputHash, mainnetTransactions: 0, openedLANListener: false, checks };
  let sourceProcess, host, relay, sourceExited = false;
  const ports = { source: await freePort(), internal: await freePort(), gateway: await freePort(), relay: await freePort() };
  demand(new Set(Object.values(ports)).size === 4, 'RETRY_PORT_COLLISION');
  const source = new URL(`http://127.0.0.1:${ports.source}/`);
  const env = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
  const check = (name, condition) => { demand(condition, `SELFTEST_${name.toUpperCase()}_FAILED`); checks.push({ name, status: 'PASS' }); };
  try {
    await fs.mkdir('.runtime/fork-transport-selftest/home', { recursive: true, mode: 0o700 });
    sourceProcess = spawn('anvil', ['--host', '127.0.0.1', '--port', String(ports.source), '--chain-id', '56', '--no-cors', '--silent'], { env: { ...env, HOME: path.join(ROOT, '.runtime/fork-transport-selftest/home') }, stdio: 'ignore' });
    sourceProcess.once('exit', () => { sourceExited = true; }); sourceProcess.once('error', () => { sourceExited = true; });
    let ready = false;
    for (let i = 0; i < 80 && !sourceExited; i++) { try { ready = await readRPC(source, 'eth_chainId') === '0x38'; if (ready) break; } catch { await delay(100); } }
    check('mock_source_started', ready);
    // Fixture initialization is on the local mock source only, before the read-only source boundary is established.
    await readRPC(source, 'evm_mine');
    const pinned = await readRPC(source, 'eth_getBlockByNumber', ['latest', false]);
    const [sender] = await readRPC(source, 'eth_accounts'); const recipient = '0x000000000000000000000000000000000000bEEF';
    const sourceBefore = { block: await readRPC(source, 'eth_blockNumber'), balance: await readRPC(source, 'eth_getBalance', [recipient, 'latest']) };
    host = await startLoopbackHostForSelfTest({ source, number: Number(BigInt(pinned.number)), blockHash: pinned.hash.toLowerCase(), host: '127.0.0.1', gatewayPort: ports.gateway, internalPort: ports.internal, allowedIPs: new Set(['127.0.0.1']), sandboxAccounts: new Set([sender.toLowerCase()]) });
    const nativeInfo = await readRPC(`http://127.0.0.1:${ports.internal}/`, 'anvil_nodeInfo');
    report.nativeAnvilMetadata = { version: await readRPC(`http://127.0.0.1:${ports.internal}/`, 'web3_clientVersion'), forkConfigKeys: Object.keys(nativeInfo.forkConfig ?? {}), forkBlockNumber: nativeInfo.forkConfig?.forkBlockNumber, forkBlockHashPresent: nativeInfo.forkConfig?.forkBlockHash !== undefined, environmentChainId: nativeInfo.environment?.chainId, forkHashEvidence: 'GATEWAY_VERIFIES_ACTUAL_ETH_GET_BLOCK_BY_NUMBER_HASH' };
    const gatewayToken = (await fs.readFile(host.tokenPath, 'utf8')).trim(), headers = { authorization: `Bearer ${gatewayToken}`, 'x-tapeout-fork-session': host.session.instanceId }, gateway = new URL(host.manifest.gatewayURL);
    check('token_permissions', ((await fs.stat(host.tokenPath)).mode & 0o777) === 0o600);
    check('gateway_session', (await readRPC(gateway, 'tapeout_forkSession', [], headers)).instanceId === host.session.instanceId);
    const nodeInfo = await readRPC(gateway, 'anvil_nodeInfo', [], headers);
    check('nodeinfo_redaction', !JSON.stringify(nodeInfo).includes('forkUrl') && !JSON.stringify(nodeInfo).includes(source.href) && !JSON.stringify(nodeInfo).includes(gatewayToken));
    const request = { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] };
    check('auth_rejection', (await plainRequest(gateway, request, { ...headers, authorization: 'Bearer wrong' })).status === 403);
    check('session_rejection', (await plainRequest(gateway, request, { ...headers, 'x-tapeout-fork-session': 'wrong' })).status === 403);
    const ipProbe = rpcServer({ host: '127.0.0.1', port: 0, authorizeRequest: req => authorize(req.headers, req.socket.remoteAddress, gatewayToken, host.session.instanceId, new Set(['192.168.1.254'])), handle: async () => ({ jsonrpc: '2.0', id: 1, result: 'UNREACHABLE' }) });
    await ipProbe.ready;
    try { check('socket_ip_rejection', (await plainRequest(new URL(`http://127.0.0.1:${ipProbe.server.address().port}/`), request, headers)).status === 403); } finally { await closeServer(ipProbe.server); }
    check('origin_rejection', (await plainRequest(gateway, request, { ...headers, origin: 'https://browser.invalid' })).status === 403);
    for (const method of ['eth_sendRawTransaction', 'eth_sign', 'anvil_setCode', 'anvil_setStorageAt', 'anvil_reset', 'anvil_loadState']) check(`reject_${method}`, (await plainRequest(gateway, { ...request, method }, headers)).status === 403);
    check('sender_rejection', (await plainRequest(gateway, { ...request, method: 'eth_sendTransaction', params: [{ from: recipient, to: sender, value: '0x1' }] }, headers)).status === 403);
    relay = await startLoopbackRelayForSelfTest({ gateway, token: gatewayToken, session: host.session, port: ports.relay });
    check('relay_identity', (await readRPC(relay.localURL, 'tapeout_forkSession')).instanceId === host.session.instanceId);
    const tx = await readRPC(relay.localURL, 'eth_sendTransaction', [{ from: sender, to: recipient, value: '0x1' }]);
    let receipt; for (let attempt = 0; attempt < 50; attempt++) { receipt = await readRPC(relay.localURL, 'eth_getTransactionReceipt', [tx]); if (receipt) break; await delay(100); }
    check('fork_transaction_mined', receipt?.status === '0x1');
    check('fork_balance_changed', BigInt(await readRPC(relay.localURL, 'eth_getBalance', [recipient, 'latest'])) === BigInt(sourceBefore.balance) + 1n);
    check('source_block_unchanged', await readRPC(source, 'eth_blockNumber') === sourceBefore.block);
    check('source_balance_unchanged', await readRPC(source, 'eth_getBalance', [recipient, 'latest']) === sourceBefore.balance);
    check('fork_block_advanced', BigInt(await readRPC(relay.localURL, 'eth_blockNumber')) > BigInt(sourceBefore.block));
    const snapshot = await readRPC(relay.localURL, 'evm_snapshot'); await readRPC(relay.localURL, 'evm_increaseTime', [60]); await readRPC(relay.localURL, 'evm_mine'); check('snapshot_revert', await readRPC(relay.localURL, 'evm_revert', [snapshot]) === true);
    check('relay_raw_send_rejection', (await plainRequest(new URL(relay.localURL), { ...request, method: 'eth_sendRawTransaction', params: ['0xdead'] }, {})).status === 403);
    const rejectedBatch = await plainRequest(gateway, [{ ...request, method: 'eth_sendTransaction', params: [{ from: sender, to: recipient, value: '0x1' }] }, { ...request, id: 2, method: 'anvil_reset' }], headers);
    check('batch_prevalidation', rejectedBatch.status === 403 && BigInt(await readRPC(relay.localURL, 'eth_getBalance', [recipient, 'latest'])) === BigInt(sourceBefore.balance) + 1n);
    const cliResult = await new Promise(resolve => {
      const cli = spawn(process.execPath, ['--import', 'tsx', 'cli/index.ts', 'deploy-local', '--from', sender, '--send-local'], {
        cwd: ROOT, env: { ...env, MODE: 'fork', FORK_EXECUTION_TOPOLOGY: 'lan-relay', SOURCE_CHAIN_ID: '56', EXPECTED_EXECUTION_CHAIN_ID: '56', EXECUTION_RPC_URL: relay.localURL, FORK_SESSION_ID: host.session.instanceId, FORK_BLOCK_NUMBER: host.session.forkBlockNumber, FORK_BLOCK_HASH: host.session.forkBlockHash }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '', stderr = ''; cli.stdout.on('data', chunk => { if (stdout.length < 500000) stdout += chunk; }); cli.stderr.on('data', chunk => { if (stderr.length < 500000) stderr += chunk; });
      const timeout = setTimeout(() => cli.kill('SIGTERM'), 120000);
      cli.once('error', () => { clearTimeout(timeout); resolve({ code: -1, success: false }); });
      cli.once('exit', code => { clearTimeout(timeout); resolve({ code, success: /ONCHAIN EXECUTION COMPLETE|Script ran successfully/i.test(stdout), diagnostic: stderr.includes('FORK') ? 'FORK_GATE_REJECTED' : 'REDACTED' }); });
    });
    check('cli_deploy_local_via_relay', cliResult.code === 0 && cliResult.success);
    check('source_unchanged_after_cli_deploy', await readRPC(source, 'eth_blockNumber') === sourceBefore.block && await readRPC(source, 'eth_getBalance', [recipient, 'latest']) === sourceBefore.balance);
    await relay.stop(); relay = undefined; await host.stop(); host = undefined;
    check('gateway_port_closed', await portClosed(ports.gateway)); check('relay_port_closed', await portClosed(ports.relay)); check('anvil_internal_port_closed', await portClosed(ports.internal));
    check('source_input_hash_unchanged', verificationHash() === sourceInputHash);
    report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.reasonCode = error instanceof ForkError ? error.code : 'TRANSPORT_SELFTEST_FAILED_DETAILS_REDACTED'; }
  finally {
    await relay?.stop(); await host?.stop();
    if (sourceProcess && !sourceExited) { sourceProcess.kill('SIGTERM'); await Promise.race([new Promise(resolve => sourceProcess.once('exit', resolve)), delay(3000)]); if (!sourceExited) sourceProcess.kill('SIGKILL'); }
    try { const session = JSON.parse(await fs.readFile('reports/fork-lan-selftest-session.json', 'utf8')); session.status = 'STOPPED'; await fs.writeFile('reports/fork-lan-selftest-session.json', JSON.stringify(session, null, 2) + '\n'); } catch { /* startup may fail before creating the public test session */ }
    await fs.mkdir('reports', { recursive: true }); await fs.writeFile('reports/fork-lan-selftest.json', JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2)); return report.status === 'PASS' ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { process.exitCode = await main(); } catch { console.error('TRANSPORT_SELFTEST_SETUP_FAILED'); process.exitCode = 1; } }
