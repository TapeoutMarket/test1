#!/usr/bin/env node
/** macOS/Linux local fork host; source RPC is read-only and hidden behind a loopback read proxy. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { addresses, authorize, clientIPs, closeServer, demand, expectedSession, ForkError, hash, port, positiveNumber, postRPC, privateIPv4, readRPC, requestItems, rpcServer, sanitizeNodeInfo, sourceURL, validateMethod, verifyAnvil } from './fork-lan-common.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function hostConfig(env) {
  const source = sourceURL(env.FORK_SOURCE_RPC_URL), number = positiveNumber(env.FORK_BLOCK_NUMBER, 'FORK_BLOCK_NUMBER_REQUIRED'), blockHash = hash(env.FORK_BLOCK_HASH);
  const host = privateIPv4(env.FORK_BIND_HOST), gatewayPort = port(env.FORK_GATEWAY_PORT ?? '18545'), internalPort = port(env.FORK_INTERNAL_PORT ?? '18546');
  demand(gatewayPort !== internalPort, 'PORTS_MUST_DIFFER');
  return { source, number, blockHash, host, gatewayPort, internalPort, allowedIPs: clientIPs(env.FORK_ALLOWED_CLIENT_IPS), sandboxAccounts: addresses(env.FORK_SANDBOX_ACCOUNTS) };
}
async function safeDirectory(relative) {
  let current = ROOT;
  for (const part of relative.split('/')) { current = path.join(current, part); try { await fs.mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } demand((await fs.lstat(current)).isDirectory() && !(await fs.lstat(current)).isSymbolicLink(), 'DIRECTORY_BOUNDARY'); }
  return current;
}
async function safeWrite(relative, contents, mode = 0o600) {
  const parent = await safeDirectory(path.dirname(relative)), target = path.join(parent, path.basename(relative));
  try { demand(!(await fs.lstat(target)).isSymbolicLink(), 'FILE_BOUNDARY'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temp = `${target}.${randomUUID()}.tmp`; await fs.writeFile(temp, contents, { flag: 'wx', mode }); await fs.rename(temp, target); await fs.chmod(target, mode); return target;
}
function childEnv() { return Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT'].filter(name => process.env[name]).map(name => [name, process.env[name]])); }
export async function startHost(config) {
  privateIPv4(config.host);
  demand([...config.allowedIPs].every(ip => privateIPv4(ip)), 'RFC1918_CLIENTS_REQUIRED');
  return runHost(config, false);
}
/** Explicit test factory: accepts only a loopback mock source and never exposes a LAN listener. Not reachable from the production CLI. */
export async function startLoopbackHostForSelfTest(config) {
  demand(config.host === '127.0.0.1' && config.source.protocol === 'http:' && config.source.hostname === '127.0.0.1' && !config.source.username && !config.source.password, 'SELFTEST_LOOPBACK_ONLY');
  demand(config.allowedIPs.size === 1 && config.allowedIPs.has('127.0.0.1'), 'SELFTEST_LOOPBACK_ONLY');
  return runHost(config, true);
}
async function runHost(config, selfTest) {
  demand(await fs.realpath(process.cwd()) === await fs.realpath(ROOT), 'RUN_FROM_REPOSITORY_ROOT');
  if (!selfTest) demand(Object.values(networkInterfaces()).flat().some(n => n?.family === 'IPv4' && n.address === config.host && !n.internal), 'BIND_ADDRESS_NOT_ASSIGNED_LOCALLY');
  const version = spawnSync('anvil', ['--version'], { env: childEnv(), encoding: 'utf8', timeout: 5000 });
  demand(version.status === 0 && /^anvil Version: 1\.4\.3(?:[\s-]|$)/m.test(version.stdout ?? ''), 'ANVIL_1_4_3_REQUIRED');
  const session = expectedSession(randomUUID(), config.number, config.blockHash), gatewayToken = randomBytes(32).toString('hex');
  const internalURL = new URL(`http://127.0.0.1:${config.internalPort}/`);
  let upstreamServer, gatewayServer, child, childExited = false, stopped = false, waitStop;
  const stoppedPromise = new Promise(resolve => { waitStop = resolve; });
  const stop = async () => {
    if (stopped) return stoppedPromise; stopped = true; process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    await closeServer(gatewayServer); gatewayServer = undefined;
    if (child && !childExited) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
      if (!childExited) { child.kill('SIGKILL'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(1000)]); }
    }
    await closeServer(upstreamServer); upstreamServer = undefined; waitStop(); return stoppedPromise;
  };
  const onSignal = () => { void stop(); }; process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  try {
    demand(await readRPC(config.source, 'eth_chainId') === '0x38', 'SOURCE_CHAIN_MUST_BE_56');
    const pinned = await readRPC(config.source, 'eth_getBlockByNumber', [`0x${BigInt(config.number).toString(16)}`, false]);
    demand(pinned && BigInt(pinned.number) === BigInt(config.number) && pinned.hash?.toLowerCase() === config.blockHash, 'SOURCE_PINNED_BLOCK_MISMATCH');
    demand(!stopped, 'FORK_HOST_STOPPED');
    const upstream = rpcServer({ host: '127.0.0.1', port: 0, handle: async body => {
      for (const item of requestItems(body)) validateMethod(item, new Set(), true);
      return postRPC(config.source, body);
    } }); upstreamServer = upstream.server; await upstream.ready;
    const sourceProxyURL = `http://127.0.0.1:${upstreamServer.address().port}/`;
    const isolatedHome = await safeDirectory(selfTest ? '.runtime/fork-transport-selftest/host/home' : '.runtime/fork-host/home');
    demand(!stopped, 'FORK_HOST_STOPPED');
    child = spawn('anvil', ['--host', '127.0.0.1', '--port', String(config.internalPort), '--chain-id', '56', '--fork-url', sourceProxyURL, '--fork-block-number', String(config.number), '--no-cors', '--silent', '--no-storage-caching', '--timeout', '20000', '--retries', '0', '--accounts', '10'], { cwd: ROOT, env: { ...childEnv(), HOME: isolatedHome }, stdio: 'ignore' });
    child.once('error', () => { childExited = true; if (!stopped) void stop(); });
    child.once('exit', () => { childExited = true; if (!stopped) void stop(); });
    let ready = false, lastStartupCode = 'PINNED_ANVIL_START_FAILED';
    const startupDeadline = Date.now() + 60000;
    while (Date.now() < startupDeadline && !childExited && !stopped) {
      try { await verifyAnvil(internalURL, session, {}, false, sourceProxyURL); ready = true; break; } catch (error) { lastStartupCode = error instanceof ForkError ? error.code : 'PINNED_ANVIL_START_FAILED'; if (!['RPC_CONNECTION_FAILED', 'RPC_HTTP_FAILED', 'RPC_READ_FAILED'].includes(lastStartupCode)) throw error; await delay(250); }
    }
    demand(ready && !childExited && !stopped, childExited ? 'ANVIL_CHILD_EXITED' : lastStartupCode);
    const gateway = rpcServer({ host: config.host, port: config.gatewayPort,
      authorizeRequest: req => authorize(req.headers, req.socket.remoteAddress, gatewayToken, session.instanceId, config.allowedIPs),
      handle: async body => {
        demand(!stopped && !childExited, 'ANVIL_PROCESS_UNAVAILABLE'); const items = requestItems(body);
        const writes = items.map(item => validateMethod(item, config.sandboxAccounts));
        if (writes.some(Boolean) || items.some(item => item.method === 'tapeout_forkSession')) await verifyAnvil(internalURL, session, {}, false, sourceProxyURL);
        const result = [];
        for (const item of items) {
          if (item.method === 'tapeout_forkSession') result.push({ jsonrpc: '2.0', id: item.id, result: session });
          else if (item.method === 'anvil_nodeInfo') result.push({ jsonrpc: '2.0', id: item.id, result: await verifyAnvil(internalURL, session, {}, false, sourceProxyURL) });
          else result.push(await postRPC(internalURL, item));
        }
        return Array.isArray(body) ? result : result[0];
      },
    }); gatewayServer = gateway.server; await gateway.ready;
    const tokenPath = await safeWrite(selfTest ? '.runtime/fork-transport-selftest/host/token.txt' : '.runtime/fork-host/token.txt', gatewayToken + '\n');
    const manifest = { schemaVersion: 1, scope: selfTest ? 'ONLY_TRANSPORT_MOCK_UPSTREAM' : 'BSC_FORK_TRANSPORT', ...session, gatewayURL: `http://${config.host}:${config.gatewayPort}/`, createdAt: new Date().toISOString(), allowedClientIPs: [...config.allowedIPs], sandboxAccounts: [...config.sandboxAccounts], sourceRPC: 'REDACTED_READ_ONLY', signedTransactionsAccepted: false };
    const manifestPath = await safeWrite(selfTest ? 'reports/fork-lan-selftest-session.json' : 'deployments/fork/56/lan-session.json', JSON.stringify(manifest, null, 2) + '\n', 0o644);
    return { session, manifest, manifestPath, tokenPath, stop, stopped: stoppedPromise };
  } catch (error) { await stop(); throw error; }
}
export async function main() {
  if (process.argv.length === 2 || process.argv.includes('--help')) {
    console.log('PREPARED_NOT_STARTED. Start explicitly: node scripts/fork-host.mjs --start\nRequired env: FORK_SOURCE_RPC_URL, FORK_BLOCK_NUMBER, FORK_BLOCK_HASH, FORK_BIND_HOST (assigned RFC1918 IPv4), FORK_ALLOWED_CLIENT_IPS (comma-separated RFC1918 IPv4).\nOptional: FORK_GATEWAY_PORT=18545, FORK_INTERNAL_PORT=18546, FORK_SANDBOX_ACCOUNTS (comma-separated permitted local senders; empty means no sendTransaction/funding/impersonation).\nRequires Anvil 1.4.3. Source credentials remain in this process only; .env is never loaded. Token file: .runtime/fork-host/token.txt. Public manifest: deployments/fork/56/lan-session.json.'); return 0;
  }
  demand(process.argv.length === 3 && process.argv[2] === '--start', 'EXPLICIT_START_REQUIRED');
  const running = await startHost(hostConfig(process.env));
  console.log(JSON.stringify({ status: 'LAN_FORK_RUNNING', ...running.manifest, manifestFile: path.relative(ROOT, running.manifestPath), tokenFile: path.relative(ROOT, running.tokenPath), token: 'NOT_PRINTED', stop: 'Ctrl+C' }, null, 2));
  await running.stopped; return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); } catch (error) { console.error(error instanceof ForkError ? error.code : 'FORK_HOST_FAILED_DETAILS_REDACTED'); process.exitCode = 1; }
}
