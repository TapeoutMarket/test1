/** LAN Anvil transport. No environment file is loaded and no signed transaction is accepted. */
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export const MAX_BODY = 1024 * 1024;
export const MAX_RESPONSE = 4 * 1024 * 1024;
export const MAX_BATCH = 20;
export const READ_METHODS = new Set(['web3_clientVersion', 'eth_chainId', 'net_version', 'eth_blockNumber', 'eth_accounts', 'eth_getBalance', 'eth_getCode', 'eth_getStorageAt', 'eth_getTransactionCount', 'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBlockTransactionCountByNumber', 'eth_getBlockTransactionCountByHash', 'eth_getTransactionByBlockNumberAndIndex', 'eth_getTransactionByBlockHashAndIndex', 'eth_call', 'eth_estimateGas', 'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getLogs', 'eth_getProof']);
export const WRITE_METHODS = new Set(['eth_sendTransaction', 'evm_snapshot', 'evm_revert', 'evm_mine', 'evm_increaseTime', 'evm_setNextBlockTimestamp', 'anvil_mine', 'anvil_setBalance', 'anvil_impersonateAccount', 'anvil_stopImpersonatingAccount']);
export class ForkError extends Error { constructor(code) { super(code); this.code = code; } }
export function demand(condition, code) { if (!condition) throw new ForkError(code); }
export function privateIPv4(value) {
  demand(typeof value === 'string' && isIP(value) === 4, 'RFC1918_IPV4_REQUIRED');
  const [a, b] = value.split('.').map(Number);
  demand(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168), 'RFC1918_IPV4_REQUIRED');
  return value;
}
export function gatewayURL(raw) {
  let url; try { url = new URL(raw); } catch { throw new ForkError('INVALID_GATEWAY_URL'); }
  demand(url.protocol === 'http:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'GATEWAY_MUST_BE_HTTP_ORIGIN');
  privateIPv4(url.hostname); demand(raw.includes(url.hostname), 'CANONICAL_IP_REQUIRED');
  return url;
}
export function sourceURL(raw) {
  let url; try { url = new URL(raw); } catch { throw new ForkError('INVALID_SOURCE_URL'); }
  demand(['http:', 'https:'].includes(url.protocol) && !url.hash, 'INVALID_SOURCE_URL');
  return url;
}
export function positiveNumber(raw, code = 'INVALID_NUMBER') {
  demand(typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw), code);
  const value = Number(raw); demand(Number.isSafeInteger(value) && value > 0, code); return value;
}
export function port(raw) { const value = positiveNumber(raw, 'INVALID_PORT'); demand(value >= 1024 && value <= 65535, 'INVALID_PORT'); return value; }
export function hash(raw) { demand(typeof raw === 'string' && /^0x[\da-f]{64}$/i.test(raw), 'INVALID_BLOCK_HASH'); return raw.toLowerCase(); }
export function sessionID(raw) { demand(typeof raw === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(raw), 'INVALID_SESSION_ID'); return raw.toLowerCase(); }
export function token(raw) { demand(typeof raw === 'string' && /^[\da-f]{64}$/i.test(raw), 'INVALID_GATEWAY_TOKEN'); return raw; }
export function addresses(raw = '') {
  if (!raw) return new Set();
  const list = raw.split(',').map(x => x.trim().toLowerCase());
  demand(list.length <= 100 && list.every(x => /^0x[\da-f]{40}$/.test(x)), 'INVALID_SANDBOX_ACCOUNT_LIST');
  return new Set(list);
}
export function clientIPs(raw) { demand(typeof raw === 'string' && raw.length > 0, 'ALLOWED_CLIENT_IPS_REQUIRED'); const result = new Set(raw.split(',').map(x => privateIPv4(x.trim()))); demand(result.size <= 10, 'TOO_MANY_CLIENT_IPS'); return result; }
export function sameSecret(actual, expected) { if (typeof actual !== 'string' || typeof expected !== 'string') return false; const a = Buffer.from(actual), b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); }
export function authorize(headers, remote, expectedToken, expectedSession, allowedIPs) {
  const ip = remote?.startsWith('::ffff:') ? remote.slice(7) : remote;
  demand(allowedIPs.has(ip), 'CLIENT_IP_FORBIDDEN');
  demand(sameSecret(headers.authorization, `Bearer ${expectedToken}`), 'AUTHENTICATION_REQUIRED');
  demand(sameSecret(headers['x-tapeout-fork-session'], expectedSession), 'FORK_SESSION_HEADER_MISMATCH');
  demand(!headers.origin, 'BROWSER_ORIGIN_FORBIDDEN');
}
export function requestItems(body) {
  const items = Array.isArray(body) ? body : [body];
  demand(items.length > 0 && items.length <= MAX_BATCH, 'INVALID_BATCH_SIZE');
  for (const item of items) demand(item && typeof item === 'object' && !Array.isArray(item) && item.jsonrpc === '2.0' && typeof item.method === 'string' && Array.isArray(item.params ?? []) && (typeof item.id === 'string' || typeof item.id === 'number' && Number.isFinite(item.id)), 'INVALID_RPC_REQUEST');
  return items;
}
export function validateMethod(item, allowedAccounts = new Set(), upstream = false) {
  demand(READ_METHODS.has(item.method) || !upstream && (WRITE_METHODS.has(item.method) || ['anvil_nodeInfo', 'tapeout_forkSession'].includes(item.method)), 'RPC_METHOD_FORBIDDEN');
  if (upstream) demand(!['eth_accounts'].includes(item.method), 'UPSTREAM_METHOD_FORBIDDEN');
  const p = item.params ?? [];
  if (item.method === 'eth_sendTransaction') {
    demand(p.length === 1 && p[0] && typeof p[0] === 'object' && !Array.isArray(p[0]) && allowedAccounts.has(String(p[0].from).toLowerCase()), 'SANDBOX_SENDER_NOT_ALLOWED');
  }
  if (['anvil_setBalance', 'anvil_impersonateAccount', 'anvil_stopImpersonatingAccount'].includes(item.method)) demand(allowedAccounts.has(String(p[0]).toLowerCase()), 'SANDBOX_ACCOUNT_NOT_ALLOWED');
  if (item.method === 'anvil_mine') {
    let count; try { count = BigInt(p[0] ?? 1); } catch { throw new ForkError('INVALID_MINE_COUNT'); }
    demand(count > 0n && count <= 1000n, 'INVALID_MINE_COUNT');
  }
  return WRITE_METHODS.has(item.method);
}
export function sanitizeNodeInfo(info, observedBlock) {
  demand(info?.forkConfig && info?.environment, 'FORK_METADATA_MISSING');
  return { forkConfig: { forkBlockNumber: info.forkConfig.forkBlockNumber, forkBlockHash: observedBlock?.hash ?? info.forkConfig.forkBlockHash, ...(observedBlock ? { forkBlockHashSource: 'VERIFIED_ETH_GET_BLOCK_BY_NUMBER' } : {}) }, environment: { chainId: info.environment.chainId } };
}
export function expectedSession(instanceId, number, blockHash) { return { kind: 'LAN_ANVIL_FORK', instanceId: sessionID(instanceId), chainId: 56, forkBlockNumber: String(positiveNumber(String(number))), forkBlockHash: hash(blockHash) }; }
export function checkSession(actual, expected) { demand(actual?.kind === expected.kind && actual?.instanceId === expected.instanceId && actual?.chainId === 56 && actual?.forkBlockNumber === expected.forkBlockNumber && actual?.forkBlockHash?.toLowerCase() === expected.forkBlockHash, 'FORK_SESSION_IDENTITY_MISMATCH'); }
export async function boundedJSON(response, max = MAX_RESPONSE) {
  demand(Number(response.headers.get('content-length') ?? 0) <= max, 'RESPONSE_TOO_LARGE');
  const reader = response.body?.getReader(); demand(reader, 'EMPTY_RESPONSE'); let size = 0; const chunks = [];
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; demand(size <= max, 'RESPONSE_TOO_LARGE'); chunks.push(Buffer.from(chunk.value)); } }
  finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ForkError('INVALID_RPC_RESPONSE'); }
}
export function safeRPCError(error) { return { code: Number.isInteger(error?.code) ? error.code : -32000, message: 'Fork RPC request failed; provider details redacted.', ...(typeof error?.data === 'string' && /^0x[\da-f]*$/i.test(error.data) && error.data.length <= 65538 ? { data: error.data } : {}) }; }
export async function postRPC(url, payload, headers = {}) {
  try {
    const requestURL = new URL(url), requestHeaders = { 'content-type': 'application/json', ...headers };
    if (requestURL.username || requestURL.password) {
      requestHeaders.authorization = 'Basic ' + Buffer.from(decodeURIComponent(requestURL.username) + ':' + decodeURIComponent(requestURL.password)).toString('base64'); requestURL.username = ''; requestURL.password = '';
    }
    const response = await fetch(requestURL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: requestHeaders, body: JSON.stringify(payload) });
    demand(response.ok, 'RPC_HTTP_FAILED'); const data = await boundedJSON(response);
    const sent = Array.isArray(payload) ? payload : [payload];
    demand(Array.isArray(data) === Array.isArray(payload), 'RPC_RESPONSE_SHAPE_MISMATCH');
    const items = Array.isArray(data) ? data : [data];
    demand(items.length === sent.length && items.map(item => JSON.stringify(item?.id)).sort().join('|') === sent.map(item => JSON.stringify(item?.id)).sort().join('|'), 'RPC_RESPONSE_ID_MISMATCH');
    for (const item of items) { demand(item && typeof item === 'object' && item.jsonrpc === '2.0' && ('result' in item || item.error), 'INVALID_RPC_RESPONSE'); if (item.error) item.error = safeRPCError(item.error); }
    return data;
  } catch (error) { if (error instanceof ForkError) throw error; throw new ForkError('RPC_CONNECTION_FAILED'); }
}
export async function readRPC(url, method, params = [], headers = {}) {
  const response = await postRPC(url, { jsonrpc: '2.0', id: 1, method, params }, headers);
  demand(!response.error && Object.hasOwn(response, 'result'), 'RPC_READ_FAILED'); return response.result;
}
export async function verifyAnvil(url, expected, headers = {}, requireSession = false, expectedSourceURL) {
  const [chain, version, info, block, session] = await Promise.all([
    readRPC(url, 'eth_chainId', [], headers), readRPC(url, 'web3_clientVersion', [], headers), readRPC(url, 'anvil_nodeInfo', [], headers),
    readRPC(url, 'eth_getBlockByNumber', [`0x${BigInt(expected.forkBlockNumber).toString(16)}`, false], headers),
    requireSession ? readRPC(url, 'tapeout_forkSession', [], headers) : null,
  ]);
  demand(chain === '0x38' && typeof version === 'string' && /^anvil\/v?1\.4\.3(?:[\s.-]|$)/i.test(version), 'PINNED_ANVIL_VERSION_OR_CHAIN_MISMATCH');
  demand(String(info?.forkConfig?.forkBlockNumber) === expected.forkBlockNumber && (info?.forkConfig?.forkBlockHash === undefined || info?.forkConfig?.forkBlockHash === null || info.forkConfig.forkBlockHash.toLowerCase() === expected.forkBlockHash) && Number(info?.environment?.chainId) === 56, 'ANVIL_FORK_IDENTITY_MISMATCH');
  demand(block && BigInt(block.number) === BigInt(expected.forkBlockNumber) && block.hash?.toLowerCase() === expected.forkBlockHash, 'PINNED_BLOCK_MISMATCH');
  if (expectedSourceURL) demand(info.forkConfig.forkUrl === expectedSourceURL, 'ANVIL_SOURCE_IDENTITY_MISMATCH');
  if (requireSession) checkSession(session, expected);
  return sanitizeNodeInfo(info, block);
}
async function readBody(req) { let size = 0; const parts = []; for await (const chunk of req) { size += chunk.length; demand(size <= MAX_BODY, 'REQUEST_TOO_LARGE'); parts.push(chunk); } try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new ForkError('INVALID_JSON'); } }
export function rpcServer({ host, port: serverPort, authorizeRequest, handle }) {
  const server = http.createServer(async (req, res) => {
    try {
      demand(req.method === 'POST' && req.url === '/', 'POST_ROOT_REQUIRED'); demand(!req.headers.origin, 'BROWSER_ORIGIN_FORBIDDEN');
      demand(req.headers.host === `${host}:${server.address()?.port}`, 'HOST_HEADER_MISMATCH');
      demand(/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? ''), 'JSON_CONTENT_TYPE_REQUIRED');
      demand(Number(req.headers['content-length'] ?? 0) <= MAX_BODY, 'REQUEST_TOO_LARGE');
      if (authorizeRequest) await authorizeRequest(req);
      const body = await readBody(req); requestItems(body); const result = await handle(body);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(result));
    } catch (error) { res.writeHead(403, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ error: error instanceof ForkError ? error.code : 'FORK_REQUEST_REJECTED' })); }
  });
  server.requestTimeout = 25000; server.headersTimeout = 10000; server.maxHeadersCount = 30;
  server.on('clientError', (_error, socket) => { socket.destroy(); });
  return { server, ready: new Promise((resolve, reject) => { server.once('error', () => reject(new ForkError('LISTENER_FAILED'))); server.listen(serverPort, host, () => resolve(server)); }) };
}
export async function closeServer(server) { if (!server) return; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
