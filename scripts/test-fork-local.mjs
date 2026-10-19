#!/usr/bin/env node
/** Real Anvil local fork transport test backed by a LOCAL MOCK source, never by BSC. */
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { startLocalForSelfTest } from './fork-local.mjs';
import { demand, ForkError, readRPC, WRITE_METHODS } from './fork-lan-common.mjs';
import { verificationHash } from './release-files.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function freePort() { const server = net.createServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); const result = server.address().port; await new Promise(resolve => server.close(resolve)); return result; }
async function portClosed(port) { return new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolve(false); }); socket.once('error', () => resolve(true)); }); }
async function cliDeploy(sender, fork, env) {
  return new Promise(resolve => {
    const cli = spawn(process.execPath, ['--import', 'tsx', 'cli/index.ts', 'deploy-local', '--from', sender, '--send-local'], { cwd: ROOT,
      env: { ...env, MODE: 'fork', FORK_EXECUTION_TOPOLOGY: 'loopback', SOURCE_CHAIN_ID: '56', EXPECTED_EXECUTION_CHAIN_ID: '56', EXECUTION_RPC_URL: fork.executionURL.href, FORK_SOURCE_RPC_URL: fork.sourceProxyURL.href, FORK_BLOCK_NUMBER: fork.manifest.forkBlockNumber, FORK_BLOCK_HASH: fork.manifest.forkBlockHash }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; cli.stdout.on('data', chunk => { if (stdout.length < 500000) stdout += chunk; }); cli.stderr.on('data', () => { /* provider diagnostics remain private */ });
    const timeout = setTimeout(() => cli.kill('SIGTERM'), 120000);
    cli.once('error', () => { clearTimeout(timeout); resolve(false); }); cli.once('exit', code => { clearTimeout(timeout); resolve(code === 0 && /ONCHAIN EXECUTION COMPLETE|Script ran successfully/i.test(stdout)); });
  });
}
export async function main() {
  demand(process.argv.length === 2 && await fs.realpath(process.cwd()) === await fs.realpath(ROOT), 'RUN_FROM_REPOSITORY_ROOT_WITHOUT_ARGUMENTS');
  const inputHash = verificationHash(), checks = [], report = { schemaVersion: 1, scope: 'ONLY_LOCAL_TRANSPORT_MOCK_UPSTREAM', status: 'RUNNING', generatedAt: new Date().toISOString(), verificationInputHash: inputHash, actualBSCForkExecuted: false, mainnetTransactions: 0, openedLANListener: false, sourceRpcWritesAfterFixtureInitialization: 0, localMockSourceFixtureWrites: [{ method: 'evm_mine', count: 1 }], sourceBoundary: 'READ_ONLY_PROXY_ONLY_AFTER_LOCAL_FIXTURE_SETUP', checks };
  const ports = { source: await freePort(), fork: await freePort() }; demand(ports.source !== ports.fork, 'RETRY_PORT_COLLISION');
  const source = new URL(`http://127.0.0.1:${ports.source}/`), env = Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
  let sourceChild, sourceExited = false, fork;
  const check = (name, condition) => { demand(condition, `SELFTEST_${name.toUpperCase()}_FAILED`); checks.push({ name, status: 'PASS' }); };
  try {
    await fs.mkdir('.runtime/fork-local-selftest/source/home', { recursive: true, mode: 0o700 });
    sourceChild = spawn('anvil', ['--host', '127.0.0.1', '--port', String(ports.source), '--chain-id', '56', '--no-cors', '--silent'], { env: { ...env, HOME: path.join(ROOT, '.runtime/fork-local-selftest/source/home') }, stdio: 'ignore' });
    sourceChild.once('exit', () => { sourceExited = true; }); sourceChild.once('error', () => { sourceExited = true; });
    let ready = false;
    for (let i = 0; i < 80 && !sourceExited; i++) { try { ready = await readRPC(source, 'eth_chainId') === '0x38'; if (ready) break; } catch { await delay(100); } }
    check('mock_source_started', ready);
    await readRPC(source, 'evm_mine');
    const pinned = await readRPC(source, 'eth_getBlockByNumber', ['latest', false]), [sender] = await readRPC(source, 'eth_accounts'), recipient = '0x000000000000000000000000000000000000bEEF';
    const before = { block: await readRPC(source, 'eth_blockNumber'), balance: await readRPC(source, 'eth_getBalance', [recipient, 'latest']) };
    fork = await startLocalForSelfTest({ source, number: Number(BigInt(pinned.number)), blockHash: pinned.hash.toLowerCase(), localPort: ports.fork });
    const nativeInfo = await readRPC(fork.executionURL, 'anvil_nodeInfo');
    report.nativeAnvilMetadata = { version: await readRPC(fork.executionURL, 'web3_clientVersion'), forkConfigKeys: Object.keys(nativeInfo.forkConfig ?? {}), forkBlockHashPresent: nativeInfo.forkConfig?.forkBlockHash !== undefined, environmentChainId: nativeInfo.environment?.chainId };
    check('fork_chain_id_56', await readRPC(fork.executionURL, 'eth_chainId') === '0x38');
    check('fork_pinned_block_hash', (await readRPC(fork.executionURL, 'eth_getBlockByNumber', [pinned.number, false])).hash === pinned.hash);
    check('nodeinfo_source_is_loopback_proxy', nativeInfo.forkConfig.forkUrl === fork.sourceProxyURL.href && nativeInfo.forkConfig.forkUrl !== source.href);
    check('public_manifest_hides_provider', fork.manifest.sourceRPC === 'REDACTED_READ_ONLY' && !JSON.stringify(fork.manifest).includes(source.href));
    check('source_proxy_chain_id', await readRPC(fork.sourceProxyURL, 'eth_chainId') === '0x38');
    check('source_proxy_pinned_hash', (await readRPC(fork.sourceProxyURL, 'eth_getBlockByNumber', [pinned.number, false])).hash === pinned.hash);
    for (const method of [...WRITE_METHODS, 'eth_sendRawTransaction', 'anvil_setCode', 'anvil_setStorageAt', 'anvil_reset']) {
      let rejected = false; try { await readRPC(fork.sourceProxyURL, method, method === 'eth_sendTransaction' ? [{ from: sender, to: recipient, value: '0x1' }] : []); } catch { rejected = true; }
      check(`source_reject_${method}`, rejected);
    }
    const { tsImport } = await import('tsx/esm/api');
    const { executionConfig, verifyExecutionTarget } = await tsImport('../sdk/execution.ts', import.meta.url);
    const config = executionConfig({ MODE: 'fork', FORK_EXECUTION_TOPOLOGY: 'loopback', EXECUTION_RPC_URL: fork.executionURL.href, SOURCE_CHAIN_ID: '56', EXPECTED_EXECUTION_CHAIN_ID: '56', FORK_BLOCK_NUMBER: fork.manifest.forkBlockNumber, FORK_BLOCK_HASH: fork.manifest.forkBlockHash });
    check('sdk_local_fork_identity', (await verifyExecutionTarget(config)).forkStatus === 'PINNED_LOCAL_FORK');
    const { verifyForkMetadata } = await import('./fork-preflight.mjs');
    check('preflight_exact_source_proxy_identity', verifyForkMetadata(nativeInfo, fork.sourceProxyURL, BigInt(fork.manifest.forkBlockNumber), pinned.hash) === true);
    const tx = await readRPC(fork.executionURL, 'eth_sendTransaction', [{ from: sender, to: recipient, value: '0x1' }]); let receipt;
    for (let i = 0; i < 50; i++) { receipt = await readRPC(fork.executionURL, 'eth_getTransactionReceipt', [tx]); if (receipt) break; await delay(100); }
    check('fork_transaction_mined', receipt?.status === '0x1');
    check('fork_balance_changed', BigInt(await readRPC(fork.executionURL, 'eth_getBalance', [recipient, 'latest'])) === BigInt(before.balance) + 1n);
    check('source_block_unchanged', await readRPC(source, 'eth_blockNumber') === before.block);
    check('source_balance_unchanged', await readRPC(source, 'eth_getBalance', [recipient, 'latest']) === before.balance);
    check('cli_deploy_local', await cliDeploy(sender, fork, env));
    check('source_unchanged_after_cli_deploy', await readRPC(source, 'eth_blockNumber') === before.block && await readRPC(source, 'eth_getBalance', [recipient, 'latest']) === before.balance);
    const proxyPort = Number(fork.sourceProxyURL.port); await fork.stop(); fork = undefined;
    check('fork_port_closed', await portClosed(ports.fork)); check('source_proxy_port_closed', await portClosed(proxyPort));
    check('source_input_hash_unchanged', verificationHash() === inputHash); report.status = 'PASS';
  } catch (error) { report.status = 'FAIL'; report.reasonCode = error instanceof ForkError ? error.code : 'LOCAL_TRANSPORT_SELFTEST_FAILED_DETAILS_REDACTED'; }
  finally {
    await fork?.stop(); if (sourceChild && !sourceExited) { sourceChild.kill('SIGTERM'); await Promise.race([new Promise(resolve => sourceChild.once('exit', resolve)), delay(3000)]); if (!sourceExited) sourceChild.kill('SIGKILL'); }
    await fs.mkdir('reports', { recursive: true }); await fs.writeFile('reports/fork-local-selftest.json', JSON.stringify(report, null, 2) + '\n');
  }
  console.log(JSON.stringify(report, null, 2)); return report.status === 'PASS' ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { process.exitCode = await main(); } catch { console.error('LOCAL_TRANSPORT_SELFTEST_SETUP_FAILED'); process.exitCode = 1; } }
