#!/usr/bin/env node
/** Explicit authenticated RFC1918 gateway -> loopback relay. Never contacts the source provider. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demand, expectedSession, ForkError, gatewayURL, port, postRPC, requestItems, rpcServer, token, validateMethod, verifyAnvil, WRITE_METHODS, closeServer } from './fork-lan-common.mjs';

export function relayConfig(env) {
  return { gateway: gatewayURL(env.FORK_GATEWAY_URL), token: token(env.FORK_GATEWAY_TOKEN), session: expectedSession(env.FORK_SESSION_ID, env.FORK_BLOCK_NUMBER, env.FORK_BLOCK_HASH), port: port(env.FORK_RELAY_PORT ?? '18547') };
}
export async function startRelay(config) {
  gatewayURL(config.gateway.href);
  return runRelay(config);
}
/** Explicit loopback integration-test factory; production CLI cannot select it. */
export async function startLoopbackRelayForSelfTest(config) {
  demand(config.gateway.protocol === 'http:' && config.gateway.hostname === '127.0.0.1' && !config.gateway.username && !config.gateway.password && config.gateway.pathname === '/' && !config.gateway.search && !config.gateway.hash, 'SELFTEST_LOOPBACK_ONLY');
  return runRelay(config);
}
async function runRelay(config) {
  const headers = { authorization: `Bearer ${config.token}`, 'x-tapeout-fork-session': config.session.instanceId };
  await verifyAnvil(config.gateway, config.session, headers, true);
  const relay = rpcServer({ host: '127.0.0.1', port: config.port, handle: async body => {
    const items = requestItems(body);
    // The host enforces the configured account allowlist. This relay rejects all other mutating methods before forwarding.
    for (const item of items) {
      const permittedSender = item.method === 'eth_sendTransaction' ? item.params?.[0]?.from : item.params?.[0];
      validateMethod(item, new Set(typeof permittedSender === 'string' ? [permittedSender.toLowerCase()] : []));
    }
    if (items.some(item => WRITE_METHODS.has(item.method))) await verifyAnvil(config.gateway, config.session, headers, true);
    return postRPC(config.gateway, body, headers);
  } }); await relay.ready;
  let resolveStop, stopped = false; const stoppedPromise = new Promise(resolve => { resolveStop = resolve; });
  return { localURL: `http://127.0.0.1:${config.port}/`, session: config.session, stopped: stoppedPromise, stop: async () => { if (stopped) return stoppedPromise; stopped = true; await closeServer(relay.server); resolveStop(); return stoppedPromise; } };
}
export async function main() {
  if (process.argv.length === 2 || process.argv.includes('--help')) {
    console.log('PREPARED_NOT_STARTED. Start explicitly: node scripts/fork-connect.mjs --start\nRequired env: FORK_GATEWAY_URL (RFC1918 HTTP origin), FORK_GATEWAY_TOKEN (64 hex characters; do not paste in chat), FORK_SESSION_ID, FORK_BLOCK_NUMBER, FORK_BLOCK_HASH. Optional FORK_RELAY_PORT=18547.\nLocal execution endpoint: http://127.0.0.1:18547. Set MODE=fork and FORK_EXECUTION_TOPOLOGY=lan-relay for the project SDK.\nNo .env is loaded. No mainnet signed transactions or source provider forwarding is supported.'); return 0;
  }
  demand(process.argv.length === 3 && process.argv[2] === '--start', 'EXPLICIT_START_REQUIRED');
  const running = await startRelay(relayConfig(process.env));
  console.log(JSON.stringify({ status: 'LOOPBACK_FORK_RELAY_RUNNING', executionRPCURL: running.localURL, ...running.session, token: 'NOT_PRINTED', stop: 'Ctrl+C' }, null, 2));
  const stop = () => { void running.stop(); }; process.once('SIGINT', stop); process.once('SIGTERM', stop);
  await running.stopped; process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop); return 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(); } catch (error) { console.error(error instanceof ForkError ? error.code : 'FORK_RELAY_FAILED_DETAILS_REDACTED'); process.exitCode = 1; }
}
