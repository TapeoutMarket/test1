import { createPublicClient, http, type Address } from 'viem';
import { localhostBase } from './order-source.js';

export type Mode = 'mock' | 'fork' | 'live';
export type ForkTopology = 'loopback' | 'lan-relay';
export type ExecutionConfig = { mode: Mode; executionRpcUrl: string; expectedChainId: number; forkBlockNumber?: bigint; forkBlockHash?: string; sourceChainId: 56; forkTopology: ForkTopology; forkSessionId?: string };
const HASH = /^0x[0-9a-fA-F]{64}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
export function executionConfig(env: NodeJS.ProcessEnv): ExecutionConfig {
  const mode = env.MODE ?? 'mock';
  if (!['mock', 'fork', 'live'].includes(mode)) throw new Error('Invalid MODE');
  const forkTopology = env.FORK_EXECUTION_TOPOLOGY ?? 'loopback';
  if (!['loopback', 'lan-relay'].includes(forkTopology)) throw new Error('Invalid FORK_EXECUTION_TOPOLOGY');
  if (forkTopology === 'lan-relay' && mode !== 'fork') throw new Error('Invalid LAN relay topology: MODE must be fork');
  const expectedChainId = Number(env.EXPECTED_EXECUTION_CHAIN_ID ?? 56);
  if (!Number.isSafeInteger(expectedChainId) || expectedChainId < 1 || env.SOURCE_CHAIN_ID && env.SOURCE_CHAIN_ID !== '56') throw new Error('Invalid chain configuration');
  const executionRpcUrl = env.EXECUTION_RPC_URL ?? 'http://127.0.0.1:8545';
  if (mode !== 'live') localhostBase(executionRpcUrl);
  else assertRemoteLiveUrl(executionRpcUrl);
  if (mode === 'live' && expectedChainId !== 56) throw new Error('Live only supports BSC 56');
  if (mode === 'fork' && expectedChainId !== 56) throw new Error('Fork must preserve Seaport source signature domain chainId 56');
  if (env.FORK_BLOCK_NUMBER && !/^[0-9]+$/.test(env.FORK_BLOCK_NUMBER)) throw new Error('Invalid fork block');
  if (forkTopology === 'lan-relay' && (!UUID.test(env.FORK_SESSION_ID ?? '') || !env.FORK_BLOCK_NUMBER || BigInt(env.FORK_BLOCK_NUMBER) <= 0n || !HASH.test(env.FORK_BLOCK_HASH ?? ''))) throw new Error('Fork LAN relay requires explicit session UUID, block number and block hash');
  if (forkTopology === 'loopback' && env.FORK_SESSION_ID) throw new Error('Invalid fork session: explicit lan-relay topology required');
  return { mode: mode as Mode, executionRpcUrl, expectedChainId, sourceChainId: 56, forkTopology: forkTopology as ForkTopology, ...(env.FORK_SESSION_ID ? { forkSessionId: env.FORK_SESSION_ID } : {}), ...(env.FORK_BLOCK_NUMBER ? { forkBlockNumber: BigInt(env.FORK_BLOCK_NUMBER) } : {}), ...(env.FORK_BLOCK_HASH ? { forkBlockHash: env.FORK_BLOCK_HASH } : {}) };
}
export function verifyLanForkSession(config: ExecutionConfig, value: unknown): void {
  if (config.mode !== 'fork' || config.forkTopology !== 'lan-relay' || !UUID.test(config.forkSessionId ?? '')) throw new Error('Fork LAN relay configuration invalid');
  const session = value as { kind?: unknown; instanceId?: unknown; chainId?: unknown; forkBlockNumber?: unknown; forkBlockHash?: unknown } | null;
  if (!session || session.kind !== 'LAN_ANVIL_FORK' || session.instanceId !== config.forkSessionId || session.chainId !== 56 || typeof session.forkBlockNumber !== 'string' || !/^[1-9][0-9]*$/.test(session.forkBlockNumber) || BigInt(session.forkBlockNumber) !== config.forkBlockNumber || typeof session.forkBlockHash !== 'string' || !HASH.test(session.forkBlockHash) || session.forkBlockHash.toLowerCase() !== config.forkBlockHash?.toLowerCase()) throw new Error('Fork LAN relay session identity mismatch');
}
export function assertRemoteLiveUrl(raw: string): void {
  const url = new URL(raw), host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.hash || host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host) || host === '0.0.0.0' || host === '[::]' || /^\[::ffff:(?:127\.|7f)/i.test(host)) throw new Error('Live execution refuses local URLs; local chain56 is not mainnet evidence');
}
export const publicClient = (config: ExecutionConfig) => createPublicClient({ transport: http(config.executionRpcUrl, { retryCount: 1, timeout: 15000 }) });
function methodNotFound(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    if ('code' in current && current.code === -32601) return true;
    current = 'cause' in current ? current.cause : undefined;
  }
  return false;
}
export async function verifyExecutionTarget(config: ExecutionConfig, client = publicClient(config)) {
  if (config.forkTopology === 'lan-relay' && config.mode !== 'fork') throw new Error('Invalid LAN relay topology: MODE must be fork');
  if (config.mode !== 'live') localhostBase(config.executionRpcUrl);
  else assertRemoteLiveUrl(config.executionRpcUrl);
  const chainId = await client.getChainId();
  if (chainId !== config.expectedChainId) throw new Error('Execution chain ID mismatch');
  if (config.forkTopology === 'lan-relay') verifyLanForkSession(config, await client.request({ method: 'tapeout_forkSession' as never }));
  if (config.mode === 'live') {
    assertRemoteLiveUrl(config.executionRpcUrl);
    const version = await client.request({ method: 'web3_clientVersion' });
    if (/anvil|hardhat|ganache|testrpc/i.test(version)) throw new Error('Live execution refuses known local development clients');
    return { mode: 'live', chainId, local: false, forkStatus: 'NO_LOCAL_CLIENT_DETECTED', networkEvidence: 'OPERATOR_CONFIGURED_REMOTE_RPC; chain ID/client checks alone are not independent mainnet proof. A reviewed live manifest checkpoint is additionally required for writes.' };
  }
  localhostBase(config.executionRpcUrl);
  const version = await client.request({ method: 'web3_clientVersion' });
  if (!/^anvil\//i.test(version)) throw new Error('Local execution requires a verified Anvil client');
  if (config.mode === 'fork' && config.forkTopology === 'loopback') {
    let exposesSession = false;
    try { await client.request({ method: 'tapeout_forkSession' as never }); exposesSession = true; }
    catch (error) { if (!methodNotFound(error)) throw error; }
    if (exposesSession) throw new Error('Fork relay session requires explicit lan-relay topology and session ID');
  }
  const info = await client.request({ method: 'anvil_nodeInfo' as never }) as unknown as { forkConfig?: { forkBlockNumber?: number | string; forkBlockHash?: string }; environment?: { chainId?: number } };
  if (info.environment?.chainId !== undefined && BigInt(info.environment.chainId) !== BigInt(config.expectedChainId)) throw new Error('Anvil environment chain ID mismatch');
  if (config.mode === 'fork') {
    if (!config.forkBlockNumber || !/^0x[0-9a-fA-F]{64}$/.test(config.forkBlockHash ?? '') || info.forkConfig?.forkBlockNumber === undefined || BigInt(info.forkConfig.forkBlockNumber) !== config.forkBlockNumber) throw new Error('Fork identity unknown: explicit block number/hash and Anvil fork metadata required');
    const block = await client.getBlock({ blockNumber: config.forkBlockNumber });
    if (block.hash?.toLowerCase() !== config.forkBlockHash?.toLowerCase()) throw new Error('Fork block hash mismatch');
    if (info.forkConfig.forkBlockHash && info.forkConfig.forkBlockHash.toLowerCase() !== config.forkBlockHash?.toLowerCase()) throw new Error('Anvil fork metadata hash mismatch');
    if (config.forkTopology === 'lan-relay') {
      if (!HASH.test(info.forkConfig.forkBlockHash ?? '') || info.environment?.chainId === undefined) throw new Error('Fork LAN relay requires complete sanitized Anvil identity metadata');
      // The relay authenticates the remote host. This process only sees a loopback transport;
      // it must not describe the remote host as local-chain execution or mainnet proof.
      verifyLanForkSession(config, await client.request({ method: 'tapeout_forkSession' as never }));
      return { mode: config.mode, chainId, local: false, localTransport: true, executionLocation: 'LAN_ANVIL_FORK', forkStatus: 'PINNED_LAN_FORK', forkSessionId: config.forkSessionId, forkBlockNumber: config.forkBlockNumber, forkBlockHash: block.hash, sourceEvidence: 'AUTHENTICATED_HOST_SESSION; client does not independently read upstream RPC' };
    }
    return { mode: config.mode, chainId, local: true, forkStatus: 'PINNED_LOCAL_FORK', forkBlockNumber: config.forkBlockNumber, forkBlockHash: block.hash };
  }
  if (info.forkConfig?.forkBlockNumber !== undefined && info.forkConfig.forkBlockNumber !== null) throw new Error('Mock mode refuses an unacknowledged fork');
  return { mode: config.mode, chainId, local: true, forkStatus: 'NO_FORK' };
}
export function sendPolicy(mode: Mode, flags: { broadcast?: boolean; sendLocal?: boolean }, env: NodeJS.ProcessEnv) {
  if (flags.broadcast && mode !== 'live') throw new Error('--broadcast is live-only; local execution requires --send-local');
  if (flags.sendLocal && mode === 'live') throw new Error('--send-local cannot authorize live writes');
  if (flags.broadcast && env.ALLOW_LIVE_SEND !== 'true') throw new Error('Live writes disabled: ALLOW_LIVE_SEND=true required');
  return mode === 'live' ? flags.broadcast === true : flags.sendLocal === true;
}
export function actorAddress(value: string | undefined): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value ?? '') || /^0x0{40}$/i.test(value ?? '')) throw new Error('Explicit --from public address required');
  return value as Address;
}
export function safeDiagnostic(error: unknown): { status: string; reason: string } {
  if (error instanceof Error && error.constructor === Error && /^(Invalid|Unsupported|Unverified|OfficialAdapter|OrderFile|HttpRead|HttpOrder|Missing|Execution chain|Local execution|Fork |Anvil |Mock mode|Live |--|Explicit|Transaction |Receipt |Budget|Confirmation|Artifact|Contract|Configuration)/.test(error.message)) return { status: 'FAILED', reason: error.message.split('\n')[0].replace(/https?:\/\/\S+/g, '[RPC REDACTED]').slice(0, 240) };
  return { status: 'FAILED', reason: 'Read/simulation/transaction failed; provider details redacted. No automatic retry of a write.' };
}
