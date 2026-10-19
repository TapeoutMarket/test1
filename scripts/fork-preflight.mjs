#!/usr/bin/env node
/** Read-only fork gate. Never loads .env, signs, starts Anvil or calls write RPC methods. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READ_METHODS = new Set(['eth_chainId', 'eth_getBlockByNumber', 'web3_clientVersion', 'anvil_nodeInfo', 'tapeout_forkSession']);
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const METHOD_NOT_FOUND = Symbol('JSON_RPC_METHOD_NOT_FOUND');
export class GateError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function demand(condition, code) { if (!condition) throw new GateError(code); }
export function localOrigin(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new GateError('INVALID_EXECUTION_URL'); }
  demand(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'EXECUTION_MUST_BE_LOOPBACK_HTTP_ORIGIN');
  return url;
}
export function sourceUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new GateError('INVALID_SOURCE_URL'); }
  demand(['https:', 'http:'].includes(url.protocol) && !url.hash, 'INVALID_SOURCE_URL');
  return url;
}
export function uint(value, code) {
  demand(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), code);
  const result = BigInt(value); demand(result > 0n && result <= BigInt(Number.MAX_SAFE_INTEGER), code);
  return result;
}
export function verifyForkMetadata(info, source, number, hash, { lanRelay = false } = {}) {
  const fork = info?.forkConfig;
  demand(fork && fork.forkBlockNumber !== undefined && fork.forkBlockNumber !== null, 'ANVIL_FORK_METADATA_MISSING');
  let actualNumber;
  try { actualNumber = BigInt(fork.forkBlockNumber); } catch { throw new GateError('ANVIL_FORK_NUMBER_INVALID'); }
  demand(actualNumber === number, 'ANVIL_FORK_NUMBER_MISMATCH');
  // Native Anvil 1.4.3 exposes forkBlockNumber/forkUrl but may omit forkBlockHash.
  // Direct preflight independently compares the source and execution block hashes below;
  // an omitted native field must never be synthesized or reported as nodeInfo evidence.
  if (fork.forkBlockHash !== undefined || lanRelay) {
    demand(typeof fork.forkBlockHash === 'string' && HASH.test(fork.forkBlockHash), 'ANVIL_FORK_HASH_UNKNOWN');
    demand(fork.forkBlockHash.toLowerCase() === hash.toLowerCase(), 'ANVIL_FORK_HASH_MISMATCH');
  }
  // Endpoint contents can contain provider credentials. Compare internally; never serialize nodeInfo.
  if (!lanRelay) {
    demand(typeof fork.forkUrl === 'string', 'ANVIL_FORK_ENDPOINT_UNKNOWN');
    demand(sourceUrl(fork.forkUrl).href === source.href, 'ANVIL_FORK_ENDPOINT_MISMATCH');
  } else demand(info.environment?.chainId !== undefined, 'ANVIL_ENV_CHAIN_UNKNOWN');
  if (info.environment?.chainId !== undefined) {
    let chain;
    try { chain = BigInt(info.environment.chainId); } catch { throw new GateError('ANVIL_ENV_CHAIN_INVALID'); }
    demand(chain === 56n, 'ANVIL_ENV_CHAIN_MISMATCH');
  }
  return true;
}
export function verifyPinnedExecutionBlock(block, number, expectedHash) {
  demand(HASH.test(expectedHash ?? ''), 'PINNED_HASH_UNKNOWN');
  let actualNumber;
  try { actualNumber = BigInt(block?.number); } catch { throw new GateError('LOCAL_PINNED_NUMBER_INVALID'); }
  demand(actualNumber === number && typeof block?.hash === 'string' && HASH.test(block.hash)
    && block.hash.toLowerCase() === expectedHash.toLowerCase(), 'LOCAL_PINNED_HASH_MISMATCH');
  return true;
}
export function verifyLanSession(session, instanceId, number, hash) {
  demand(UUID.test(instanceId ?? ''), 'INVALID_FORK_SESSION_ID');
  demand(session?.kind === 'LAN_ANVIL_FORK' && session.instanceId === instanceId && session.chainId === 56,
    'LAN_FORK_SESSION_MISMATCH');
  demand(typeof session.forkBlockNumber === 'string' && /^(0|[1-9][0-9]*)$/.test(session.forkBlockNumber)
    && BigInt(session.forkBlockNumber) === number && typeof session.forkBlockHash === 'string'
    && HASH.test(session.forkBlockHash) && session.forkBlockHash.toLowerCase() === hash.toLowerCase(), 'LAN_FORK_SESSION_PIN_MISMATCH');
  return true;
}
export function preflightConfiguration(env) {
  const topology = env.FORK_EXECUTION_TOPOLOGY ?? 'loopback';
  demand(['loopback', 'lan-relay'].includes(topology), 'INVALID_FORK_EXECUTION_TOPOLOGY');
  const lanRelay = topology === 'lan-relay';
  // Explicit LAN topology must not silently turn a mock/live invocation into a fork check.
  if (lanRelay) demand(env.MODE === 'fork', 'MODE_MUST_BE_EXPLICIT_FORK');
  if (!lanRelay) demand(!env.FORK_SESSION_ID, 'FORK_SESSION_REQUIRES_LAN_RELAY_TOPOLOGY');
  const required = lanRelay ? ['ORDER_FILE', 'FORK_BLOCK_NUMBER', 'FORK_BLOCK_HASH', 'FORK_SESSION_ID'] : ['FORK_SOURCE_RPC_URL', 'ORDER_FILE', 'FORK_BLOCK_NUMBER'];
  const missing = required.filter(name => !env[name]);
  if (missing.length) return { missing, topology, lanRelay };
  demand(env.MODE === 'fork', 'MODE_MUST_BE_EXPLICIT_FORK');
  demand(env.SOURCE_CHAIN_ID === '56' && env.EXPECTED_EXECUTION_CHAIN_ID === '56', 'EXPLICIT_CHAIN_ID_56_REQUIRED');
  demand(!!env.EXECUTION_RPC_URL, 'EXECUTION_RPC_URL_REQUIRED');
  const local = localOrigin(env.EXECUTION_RPC_URL);
  const source = env.FORK_SOURCE_RPC_URL ? sourceUrl(env.FORK_SOURCE_RPC_URL) : undefined;
  if (source) demand(local.href !== source.href, 'SOURCE_AND_EXECUTION_ENDPOINT_MUST_DIFFER');
  const number = uint(env.FORK_BLOCK_NUMBER, 'INVALID_FORK_BLOCK_NUMBER');
  if (env.FORK_BLOCK_HASH) demand(HASH.test(env.FORK_BLOCK_HASH), 'INVALID_EXPECTED_FORK_BLOCK_HASH');
  if (lanRelay) demand(UUID.test(env.FORK_SESSION_ID), 'INVALID_FORK_SESSION_ID');
  return { missing, topology, lanRelay, local, source, number };
}
async function rpc(url, method, params = [], { allowMethodNotFound = false } = {}) {
  demand(READ_METHODS.has(method), 'WRITE_RPC_FORBIDDEN');
  let response;
  try {
    const requestUrl = new URL(url);
    const headers = { 'content-type': 'application/json' };
    if (requestUrl.username || requestUrl.password) {
      headers.authorization = 'Basic ' + Buffer.from(decodeURIComponent(requestUrl.username) + ':' + decodeURIComponent(requestUrl.password)).toString('base64');
      requestUrl.username = ''; requestUrl.password = '';
    }
    response = await fetch(requestUrl, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    demand(response.ok, 'RPC_HTTP_FAILED');
    const data = await response.json();
    if (allowMethodNotFound && method === 'tapeout_forkSession' && data.error?.code === -32601) return METHOD_NOT_FOUND;
    demand(!data.error && Object.hasOwn(data, 'result'), 'RPC_READ_FAILED');
    return data.result;
  } catch (error) {
    if (error instanceof GateError) throw error;
    throw new GateError('RPC_READ_FAILED');
  }
}
async function writeReport(report) {
  demand(await fs.realpath(process.cwd()) === await fs.realpath(PROJECT_ROOT), 'RUN_FROM_REPOSITORY_ROOT');
  const reportDir = path.join(PROJECT_ROOT, 'reports'); await fs.mkdir(reportDir, { recursive: true });
  demand(await fs.realpath(reportDir) === reportDir, 'REPORT_DIRECTORY_BOUNDARY');
  const output = path.join(reportDir, 'fork-status.json');
  try { demand(!(await fs.lstat(output)).isSymbolicLink(), 'REPORT_FILE_BOUNDARY'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.writeFile(output, JSON.stringify(report, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n', { mode: 0o600 });
}
export async function main() {
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), status: 'NOT_RUN',
    scope: 'BSC_REAL_STATE_FORK_INTEGRATION', preflight: { status: 'NOT_RUN', reasonCode: 'MISSING_REQUIRED_INPUTS' },
    transactionsSent: 0, sourceRpcWrites: 0, loadedEnvFile: false, completeForkTestExecuted: false,
    note: 'This gate only checks identity and reads an order. A complete fork lifecycle is NOT executed.',
    startupPlan: { execution: 'MANUAL_ONLY_NOT_STARTED', command: 'anvil --host 127.0.0.1 --chain-id 56 --fork-url "$FORK_SOURCE_RPC_URL" --fork-block-number "$FORK_BLOCK_NUMBER"', sourceEndpoint: '[REDACTED]' },
  };
  let stage = 'configuration';
  try {
    demand(await fs.realpath(process.cwd()) === await fs.realpath(PROJECT_ROOT), 'RUN_FROM_REPOSITORY_ROOT');
    demand(process.argv.length === 2, 'NO_COMMAND_LINE_ARGUMENTS_SUPPORTED');
    const env = { MODE: process.env.MODE, FORK_SOURCE_RPC_URL: process.env.FORK_SOURCE_RPC_URL,
      ORDER_FILE: process.env.ORDER_FILE, FORK_BLOCK_NUMBER: process.env.FORK_BLOCK_NUMBER,
      FORK_BLOCK_HASH: process.env.FORK_BLOCK_HASH, EXECUTION_RPC_URL: process.env.EXECUTION_RPC_URL,
      EXPECTED_EXECUTION_CHAIN_ID: process.env.EXPECTED_EXECUTION_CHAIN_ID, SOURCE_CHAIN_ID: process.env.SOURCE_CHAIN_ID,
      FORK_EXECUTION_TOPOLOGY: process.env.FORK_EXECUTION_TOPOLOGY, FORK_SESSION_ID: process.env.FORK_SESSION_ID,
      FORK_ORDER_ORIGIN: process.env.FORK_ORDER_ORIGIN };
    const { missing, topology, lanRelay, local, source, number } = preflightConfiguration(env);
    report.executionTopology = topology;
    if (lanRelay) report.startupPlan = { execution: 'REMOTE_AUTHENTICATED_HOST_SESSION_NOT_STARTED_BY_PREFLIGHT', command: 'npm run fork:connect', sourceEndpoint: '[HOST_ONLY_REDACTED]' };
    if (missing.length) {
      report.preflight.missing = missing; await writeReport(report); console.log(JSON.stringify(report, null, 2)); return 0;
    }

    stage = 'fixture';
    const { tsImport } = await import('tsx/esm/api');
    const { JsonFileOrderSource, confinedFile } = await tsImport('../sdk/order-source.ts', import.meta.url);
    const { assertExecutableEnvelope } = await tsImport('../sdk/order-envelope.ts', import.meta.url);
    const file = await confinedFile(PROJECT_ROOT, env.ORDER_FILE);
    const envelope = await new JsonFileOrderSource(file, PROJECT_ROOT).load();
    demand(envelope.validation.status === 'verified' && envelope.identity.status === 'verified', 'ORDER_FIXTURE_NOT_VERIFIED');
    demand(envelope.protocol === 'seaport', 'OFFICIAL_ADAPTER_RESERVED_DISABLED');
    assertExecutableEnvelope(envelope);
    const orderOrigin = env.FORK_ORDER_ORIGIN ?? 'external';
    demand(['external', 'fork-created'].includes(orderOrigin), 'INVALID_FORK_ORDER_ORIGIN');
    if (orderOrigin === 'external') {
      demand(envelope.source.name !== 'LOCAL_FORK_CREATED_NO_PUBLIC_SIGNATURE', 'FORK_CREATED_ORDER_REQUIRES_EXPLICIT_ORIGIN');
      demand(BigInt(envelope.validation.blockNumber) === number, 'FIXTURE_VALIDATION_BLOCK_MISMATCH');
    } else {
      demand(envelope.source.kind === 'json' && envelope.source.name === 'LOCAL_FORK_CREATED_NO_PUBLIC_SIGNATURE' && envelope.seaport.signature === '0x', 'FORK_CREATED_ORDER_MARKER_MISMATCH');
      demand(BigInt(envelope.validation.blockNumber) >= number, 'FORK_CREATED_CHECKPOINT_PRECEDES_SOURCE_PIN');
    }
    report.fixture = { path: path.relative(PROJECT_ROOT, file), sha256: createHash('sha256').update(await fs.readFile(file)).digest('hex'),
      protocol: envelope.protocol, orderHash: envelope.orderHash, market: envelope.market, collection: envelope.collection, tokenId: envelope.tokenId };

    stage = lanRelay ? 'authenticated-host-session' : 'local-anvil';
    if (lanRelay) verifyLanSession(await rpc(local, 'tapeout_forkSession'), env.FORK_SESSION_ID, number, env.FORK_BLOCK_HASH);
    demand(await rpc(local, 'eth_chainId') === '0x38', 'LOCAL_CHAIN_ID_MISMATCH');
    const version = await rpc(local, 'web3_clientVersion');
    demand(typeof version === 'string' && /^anvil\//i.test(version), 'EXECUTION_IS_NOT_ANVIL');
    if (!lanRelay) demand(await rpc(local, 'tapeout_forkSession', [], { allowMethodNotFound: true }) === METHOD_NOT_FOUND, 'FORK_RELAY_REQUIRES_EXPLICIT_TOPOLOGY_AND_SESSION');
    const info = await rpc(local, 'anvil_nodeInfo');

    stage = 'pinned-block';
    const tag = `0x${number.toString(16)}`;
    let pinnedHash = env.FORK_BLOCK_HASH;
    if (source) {
      demand(await rpc(source, 'eth_chainId') === '0x38', 'SOURCE_CHAIN_ID_MISMATCH');
      const sourceBlock = await rpc(source, 'eth_getBlockByNumber', [tag, false]);
      demand(sourceBlock && BigInt(sourceBlock.number) === number && HASH.test(sourceBlock.hash), 'SOURCE_PINNED_BLOCK_UNAVAILABLE');
      if (pinnedHash) demand(sourceBlock.hash.toLowerCase() === pinnedHash.toLowerCase(), 'SOURCE_PINNED_HASH_MISMATCH');
      pinnedHash = sourceBlock.hash;
    }
    demand(HASH.test(pinnedHash ?? ''), 'PINNED_HASH_UNKNOWN');
    if (orderOrigin === 'external') demand(envelope.validation.blockHash.toLowerCase() === pinnedHash.toLowerCase(), 'FIXTURE_VALIDATION_HASH_MISMATCH');
    verifyForkMetadata(info, source, number, pinnedHash, { lanRelay });
    const localBlock = await rpc(local, 'eth_getBlockByNumber', [tag, false]);
    verifyPinnedExecutionBlock(localBlock, number, pinnedHash);
    report.pinnedFork = { chainId: 56, blockNumber: number.toString(), blockHash: pinnedHash,
      localAnvil: !lanRelay, localTransport: true, executionLocation: lanRelay ? 'LAN_ANVIL_FORK' : 'LOOPBACK_ANVIL_FORK',
      ...(lanRelay ? { forkSessionId: env.FORK_SESSION_ID, authenticatedHostSessionMatched: true } : {}),
      sourceEndpointMatchedPrivately: !lanRelay, directSourceReadByClient: !!source,
      sourceEvidence: source ? 'CLIENT_READ_UPSTREAM_PINNED_BLOCK' : 'HOST_SESSION_ATTESTATION_ONLY_NOT_INDEPENDENT_CLIENT_UPSTREAM_VERIFICATION',
      nodeInfoNumberMatched: true,
      nodeInfoHashPresent: info.forkConfig.forkBlockHash !== undefined,
      nodeInfoHashMatched: info.forkConfig.forkBlockHash !== undefined ? true : null,
      executionBlockHashMatched: true };

    stage = 'local-protocol-read';
    const { createPublicClient, http } = await import('viem');
    const { checkProtocol } = await tsImport('../sdk/protocol.ts', import.meta.url);
    const { verifyOrderCheckpoint } = await tsImport('./fork-prepare.mjs', import.meta.url);
    const executionClient = createPublicClient({ transport: http(local.href, { retryCount: 0, timeout: 15000 }) });
    report.orderCheckpoint = await verifyOrderCheckpoint(envelope, { ...env, FORK_BLOCK_HASH: pinnedHash }, executionClient);
    const protocol = await checkProtocol(executionClient, envelope);
    // Protocol reads use the selected Anvil execution target, never source latest state.
    report.protocol = protocol;
    demand(protocol.executable === true, 'LOCAL_ORDER_NOT_EXECUTABLE');
    if (source) {
      const finalSourceBlock = await rpc(source, 'eth_getBlockByNumber', [tag, false]);
      demand(finalSourceBlock?.hash?.toLowerCase() === pinnedHash.toLowerCase(), 'SOURCE_PIN_CHANGED_DURING_PREFLIGHT');
    }
    if (lanRelay) verifyLanSession(await rpc(local, 'tapeout_forkSession'), env.FORK_SESSION_ID, number, pinnedHash);
    report.preflight = { status: 'PASS', reasonCode: 'READ_ONLY_IDENTITY_AND_ORDER_CHECKS_PASSED' };
    await writeReport(report); console.log(JSON.stringify(report, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)); return 0;
  } catch (error) {
    // Never serialize provider/nodeInfo/URL/error details, including credentials inside nested errors.
    report.preflight = { status: 'FAIL', reasonCode: error instanceof GateError ? error.code : 'READ_OR_FIXTURE_VALIDATION_FAILED', stage };
    try { await writeReport(report); } catch { /* no writing outside the repository */ }
    console.error(JSON.stringify(report, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)); return 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
