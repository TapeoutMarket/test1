#!/usr/bin/env node
/** Single-machine fork. Source credentials never reach Anvil argv/env; source forwarding is read-only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { closeServer, demand, expectedSession, ForkError, hash, port, positiveNumber, postRPC, readRPC, requestItems, rpcServer, sourceURL, validateMethod, verifyAnvil } from './fork-lan-common.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function localConfig(env) {
  const source = sourceURL(env.FORK_SOURCE_RPC_URL), number = positiveNumber(env.FORK_BLOCK_NUMBER, 'FORK_BLOCK_NUMBER_REQUIRED'), blockHash = hash(env.FORK_BLOCK_HASH), localPort = port(env.FORK_LOCAL_PORT ?? '18545');
  demand(!(source.hostname === '127.0.0.1' && Number(source.port || 80) === localPort), 'SOURCE_AND_FORK_ENDPOINT_MUST_DIFFER');
  return { source, number, blockHash, localPort };
}
function childEnv() { return Object.fromEntries(['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT'].filter(name => process.env[name]).map(name => [name, process.env[name]])); }
async function safeDirectory(relative) {
  let current = ROOT;
  for (const part of relative.split('/')) { current = path.join(current, part); try { await fs.mkdir(current, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } const stat = await fs.lstat(current); demand(stat.isDirectory() && !stat.isSymbolicLink(), 'DIRECTORY_BOUNDARY'); }
  return current;
}
async function safeWrite(relative, value) {
  const parent = await safeDirectory(path.dirname(relative)), target = path.join(parent, path.basename(relative));
  try { demand(!(await fs.lstat(target)).isSymbolicLink(), 'FILE_BOUNDARY'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${target}.${randomUUID()}.tmp`; await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o644 }); await fs.rename(temporary, target); return target;
}
export async function startLocal(config) { return runLocal(config, false); }
/** Test-only factory restricts the source to a local mock Anvil and isolates all generated paths. */
export async function startLocalForSelfTest(config) {
  demand(config.source.protocol === 'http:' && config.source.hostname === '127.0.0.1' && !config.source.username && !config.source.password, 'SELFTEST_SOURCE_MUST_BE_LOOPBACK');
  return runLocal(config, true);
}
async function runLocal(config, selfTest) {
  demand(await fs.realpath(process.cwd()) === await fs.realpath(ROOT), 'RUN_FROM_REPOSITORY_ROOT');
  const version = spawnSync('anvil', ['--version'], { env: childEnv(), encoding: 'utf8', timeout: 5000 });
  demand(version.status === 0 && /^anvil Version: 1\.4\.3(?:[\s-]|$)/m.test(version.stdout ?? ''), 'ANVIL_1_4_3_REQUIRED');
  const identity = expectedSession(randomUUID(), config.number, config.blockHash), executionURL = new URL(`http://127.0.0.1:${config.localPort}/`);
  let sourceServer, child, childExited = false, stopped = false, resolveStopped, manifest, manifestPath;
  const stoppedPromise = new Promise(resolve => { resolveStopped = resolve; });
  const reportFile = selfTest ? 'reports/fork-local-selftest-session.json' : 'deployments/fork/56/local-session.json';
  const stop = async () => {
    if (stopped) return stoppedPromise; stopped = true; process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    if (child && !childExited) { child.kill('SIGTERM'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]); if (!childExited) { child.kill('SIGKILL'); await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(1000)]); } }
    await closeServer(sourceServer); sourceServer = undefined;
    if (manifest) { manifest.status = 'STOPPED'; try { await safeWrite(reportFile, manifest); } catch { /* never write outside the repository on shutdown */ } }
    resolveStopped(); return stoppedPromise;
  };
  const onSignal = () => { void stop(); }; process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  try {
    demand(await readRPC(config.source, 'eth_chainId') === '0x38', 'SOURCE_CHAIN_MUST_BE_56');
    const pinned = await readRPC(config.source, 'eth_getBlockByNumber', [`0x${BigInt(config.number).toString(16)}`, false]);
    demand(pinned && BigInt(pinned.number) === BigInt(config.number) && pinned.hash?.toLowerCase() === config.blockHash, 'SOURCE_PINNED_BLOCK_MISMATCH');
    demand(!stopped, 'FORK_LOCAL_STOPPED');
    const sourceProxy = rpcServer({ host: '127.0.0.1', port: 0, handle: async body => { for (const item of requestItems(body)) validateMethod(item, new Set(), true); return postRPC(config.source, body); } }); sourceServer = sourceProxy.server; await sourceProxy.ready;
    const sourceProxyURL = `http://127.0.0.1:${sourceServer.address().port}/`;
    const isolatedHome = await safeDirectory(selfTest ? '.runtime/fork-local-selftest/fork/home' : '.runtime/fork-local/home');
    demand(!stopped, 'FORK_LOCAL_STOPPED');
    child = spawn('anvil', ['--host', '127.0.0.1', '--port', String(config.localPort), '--chain-id', '56', '--fork-url', sourceProxyURL, '--fork-block-number', String(config.number), '--no-cors', '--silent', '--no-storage-caching', '--timeout', '20000', '--retries', '0', '--accounts', '10'], { cwd: ROOT, env: { ...childEnv(), HOME: isolatedHome }, stdio: 'ignore' });
    child.once('error', () => { childExited = true; if (!stopped) void stop(); }); child.once('exit', () => { childExited = true; if (!stopped) void stop(); });
    let ready = false, startupCode = 'PINNED_ANVIL_START_FAILED'; const deadline = Date.now() + 60000;
    while (Date.now() < deadline && !childExited && !stopped) {
      try { await verifyAnvil(executionURL, identity, {}, false, sourceProxyURL); ready = true; break; }
      catch (error) { startupCode = error instanceof ForkError ? error.code : 'PINNED_ANVIL_START_FAILED'; if (!['RPC_CONNECTION_FAILED', 'RPC_HTTP_FAILED', 'RPC_READ_FAILED'].includes(startupCode)) throw error; await delay(250); }
    }
    demand(ready && !childExited && !stopped, childExited ? 'ANVIL_CHILD_EXITED' : startupCode);
    manifest = { schemaVersion: 1, status: 'RUNNING', scope: selfTest ? 'ONLY_LOCAL_TRANSPORT_MOCK_UPSTREAM' : 'LOCAL_BSC_FORK_TRANSPORT', instanceId: identity.instanceId, chainId: 56, forkBlockNumber: String(config.number), forkBlockHash: config.blockHash, sourceProxyURL, executionRPCURL: executionURL.href, sourceRPC: 'REDACTED_READ_ONLY', createdAt: new Date().toISOString(), childPid: child.pid, boundHost: '127.0.0.1', upstreamWriteMethodsAllowed: false };
    manifestPath = await safeWrite(reportFile, manifest);
    return { manifest, manifestPath, executionURL, sourceProxyURL: new URL(sourceProxyURL), stop, stopped: stoppedPromise };
  } catch (error) { await stop(); throw error; }
}
export async function main() {
  if (process.argv.length === 2 || process.argv.includes('--help')) {
    console.log('PREPARED_NOT_STARTED. Start explicitly: node scripts/fork-local.mjs --start\nRequired env: FORK_SOURCE_RPC_URL (source provider URL; never logged), FORK_BLOCK_NUMBER, FORK_BLOCK_HASH. Optional FORK_LOCAL_PORT=18545.\nRequires Anvil 1.4.3. Anvil and the source read proxy both bind only 127.0.0.1. No .env is loaded; no source signing/writes.\nPublic manifest: deployments/fork/56/local-session.json. In the TEST TERMINAL use manifest.sourceProxyURL for FORK_SOURCE_RPC_URL, manifest.executionRPCURL for EXECUTION_RPC_URL, MODE=fork, FORK_EXECUTION_TOPOLOGY=loopback.'); return 0;
  }
  demand(process.argv.length === 3 && process.argv[2] === '--start', 'EXPLICIT_START_REQUIRED');
  const running = await startLocal(localConfig(process.env)); console.log(JSON.stringify({ ...running.manifest, manifestFile: path.relative(ROOT, running.manifestPath), note: 'Keep this terminal running. In the test terminal, use sourceProxyURL for read-only source checks. Ctrl+C stops Anvil and the source proxy.' }, null, 2));
  await running.stopped; return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { try { process.exitCode = await main(); } catch (error) { console.error(error instanceof ForkError ? error.code : 'FORK_LOCAL_FAILED_DETAILS_REDACTED'); process.exitCode = 1; } }
