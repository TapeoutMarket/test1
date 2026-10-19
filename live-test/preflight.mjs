#!/usr/bin/env node
// Read-only mainnet observation. No signing or transaction transport is implemented.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {createPublicClient, custom, http, parseAbi, keccak256, formatEther, zeroAddress, encodeDeployData} from 'viem';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = path.dirname(ROOT);
export const json = value => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n';
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export const ACCOUNTS = {
  creator: '0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129',
  sellerA: '0x1b55E6A757987576E1a130A011f9E12498De7DB9',
  buyerB: '0x63979C9d5200A5080be93eb440D469d2F2ec6682',
};
export const PRICE = 300000000000000000n;
export const FEE = 3000000000000000n;
export const TOTAL = PRICE + FEE;
export const SHARE = TOTAL / 100n;
const READ_METHODS = new Set(['eth_chainId', 'web3_clientVersion', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getBalance', 'eth_getCode', 'eth_call', 'eth_getStorageAt', 'eth_gasPrice', 'eth_estimateGas', 'eth_getTransactionCount', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getLogs']);
export function guardedProvider(provider) {
  return {async request(request) {
    if (!READ_METHODS.has(request.method)) throw new Error('READ_ONLY_RPC_METHOD_REFUSED');
    return provider.request(request);
  }};
}
function readOnlyClient(url) {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol) || ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(parsed.hostname)) throw new Error('REMOTE_MAINNET_RPC_REQUIRED');
  const provider = http(url, {retryCount: 0, timeout: 20000})({});
  return createPublicClient({transport: custom(guardedProvider(provider), {retryCount: 0})});
}
export async function readOnlyClientFromEnv(file) {
  if (!file) throw new Error('EXPLICIT_ENV_FILE_REQUIRED');
  const resolved = await fs.realpath(path.resolve(file));
  if (!resolved.startsWith(WORKSPACE + path.sep)) throw new Error('ENV_OUTSIDE_CURRENT_WORKSPACE');
  // Read only the RPC assignment into the parser; never parse or consume key assignments.
  const text = await fs.readFile(resolved, 'utf8');
  const lines = text.split(/\r?\n/).filter(line => /^\s*(?:export\s+)?BSC_RPC_URL\s*=/.test(line));
  if (lines.length !== 1) throw new Error('ONE_BSC_RPC_URL_ASSIGNMENT_REQUIRED');
  const url = parseEnv(lines[0]).BSC_RPC_URL;
  if (!url) throw new Error('BSC_RPC_URL_MISSING');
  return readOnlyClient(url);
}
export async function saveObservation(prefix, value) {
  if (!/^[a-z0-9-]+$/.test(prefix)) throw new Error('INVALID_REPORT_PREFIX');
  const directory = path.join(ROOT, 'live-test', 'observations');
  await fs.mkdir(directory, {recursive: true});
  if (await fs.realpath(directory) !== directory) throw new Error('REPORT_SYMLINK_REFUSED');
  const file = path.join(directory, `${prefix}-${Date.now()}.json`);
  await fs.writeFile(file, json(value), {flag: 'wx', mode: 0o600});
  return file;
}
export function fundingPlan(creatorBalance, bBalance) {
  if (creatorBalance < 0n || bBalance < 0n) throw new Error('NEGATIVE_BALANCE');
  const max = balance => balance / SHARE > 100n ? 100n : balance / SHARE;
  const creatorMax = max(creatorBalance), buyerBMax = max(bBalance);
  const deficit = TOTAL - creatorBalance - bBalance;
  return {
    sellerPriceWei: PRICE, marketFeeWei: FEE, totalUpfrontWei: TOTAL, sharePriceWei: SHARE,
    sellerPriceBNB: formatEther(PRICE), marketFeeBNB: formatEther(FEE), totalUpfrontBNB: formatEther(TOTAL), sharePriceBNB: formatEther(SHARE),
    gasIncluded: false, creatorMaximumSharesBeforeGas: creatorMax, buyerBMaximumSharesBeforeGas: buyerBMax,
    totalMaximumSharesBeforeGas: creatorMax + buyerBMax,
    aggregatePrincipalShortfallWei: deficit > 0n ? deficit : 0n,
    aggregatePrincipalShortfallBNB: formatEther(deficit > 0n ? deficit : 0n),
    completeFundingPossibleBeforeGas: creatorMax + buyerBMax >= 100n,
    confirmedAllocation: {creator: {ids: '1..67', shares: 67, contributionWei: SHARE * 67n, contributionBNB: formatEther(SHARE * 67n), balanceAfterContributionBeforeGasWei: creatorBalance - SHARE * 67n}, buyerB: {ids: '68..100', shares: 33, contributionWei: SHARE * 33n, contributionBNB: formatEther(SHARE * 33n), balanceAfterContributionBeforeGasWei: bBalance - SHARE * 33n}},
    confirmedAllocationFundedBeforeGas: creatorBalance >= SHARE * 67n && bBalance >= SHARE * 33n,
    allocationConfirmed: true,
    note: 'User confirmed creator 67 / buyerB 33 shares in this session. Balances exclude deployment, governance and transaction gas. Later seller/fee proceeds cannot finance upfront contributions.',
  };
}
export async function preflight(envFile) {
  const client = await readOnlyClientFromEnv(envFile);
  const plan = JSON.parse(await fs.readFile(path.join(ROOT,'live-test/SESSION_PLAN.json'),'utf8'));
  const [chainId, version] = await Promise.all([client.getChainId(), client.request({method: 'web3_clientVersion'})]);
  if (chainId !== 56 || /anvil|hardhat|ganache|testrpc/i.test(version)) throw new Error('MAINNET_IDENTITY_REJECTED');
  const baseline = JSON.parse(await fs.readFile(path.join(ROOT, 'reports/authorized-source-observation.json'), 'utf8'));
  let block, selection;
  try { block = await client.getBlock({blockTag: 'finalized'}); selection = 'PROVIDER_FINALIZED_TAG'; }
  catch { block = await client.getBlock({blockNumber: await client.getBlockNumber() - 64n}); selection = 'LATEST_MINUS_64'; }
  if (block.number === null || !block.hash) throw new Error('CHECKPOINT_UNAVAILABLE');
  const at = {blockNumber: block.number};
  const nftAbi = parseAbi(['function ownerOf(uint256) view returns(address)', 'function getApproved(uint256) view returns(address)', 'function isApprovedForAll(address,address) view returns(bool)']);
  const miningAbi = parseAbi(['function minerKey(address,uint256) view returns(bytes32)', 'function pending(bytes32) view returns(uint256)']);
  const seaAbi = parseAbi(['function information() view returns(string,bytes32,address)', 'function getCounter(address) view returns(uint256)']);
  const [accounts, identities, owner, approved, operatorApproved, information, counter, minerKey, decimals, gasPrice, historicalBlock] = await Promise.all([
    Promise.all(Object.entries(ACCOUNTS).map(async ([role, address]) => {
      const [balance, code, nonce] = await Promise.all([client.getBalance({address, ...at}), client.getCode({address, ...at}), client.getTransactionCount({address, ...at})]);
      return {role, address, balanceWei: balance, balanceBNB: formatEther(balance), hasCode: Boolean(code && code !== '0x'), nonce};
    })),
    Promise.all(baseline.codeIdentities.map(async old => {
      const code = await client.getCode({address: old.address, ...at});
      const codeHash = code && code !== '0x' ? keccak256(code) : null;
      return {field: old.field, address: old.address, codeHash, matchesForkBaselineRuntime: codeHash === old.codeHash};
    })),
    client.readContract({address: baseline.collection, abi: nftAbi, functionName: 'ownerOf', args: [BigInt(baseline.tokenId)], ...at}),
    client.readContract({address: baseline.collection, abi: nftAbi, functionName: 'getApproved', args: [BigInt(baseline.tokenId)], ...at}),
    client.readContract({address: baseline.collection, abi: nftAbi, functionName: 'isApprovedForAll', args: [ACCOUNTS.sellerA, baseline.market], ...at}),
    client.readContract({address: baseline.market, abi: seaAbi, functionName: 'information', ...at}),
    client.readContract({address: baseline.market, abi: seaAbi, functionName: 'getCounter', args: [ACCOUNTS.sellerA], ...at}),
    client.readContract({address: baseline.mining, abi: miningAbi, functionName: 'minerKey', args: [baseline.collection, BigInt(baseline.tokenId)], ...at}),
    client.readContract({address: baseline.bem, abi: parseAbi(['function decimals() view returns(uint8)']), functionName: 'decimals', ...at}),
    client.getGasPrice(), client.getBlock({blockNumber: BigInt(baseline.blockNumber)}),
  ]);
  const pending = await client.readContract({address: baseline.mining, abi: miningAbi, functionName: 'pending', args: [minerKey], ...at});
  const deploymentGas = await Promise.all(['GroupBuyVault', 'GroupBuyFactory'].map(async name => {
    try {
      const artifact = JSON.parse(await fs.readFile(path.join(ROOT, 'out', name + '.sol', name + '.json'), 'utf8'));
      const data = encodeDeployData({abi: artifact.abi, bytecode: artifact.bytecode.object});
      const estimate = await client.estimateGas({account: ACCOUNTS.creator, data, value: 0n, blockNumber: block.number});
      const bufferedGas = (estimate * 120n + 99n) / 100n;
      return {name, status: 'ESTIMATED_READ_ONLY', initCodeHash: keccak256(data), gasEstimate: estimate, gasWith20PercentBuffer: bufferedGas, feeAtObservedGasPriceWei: bufferedGas * gasPrice, feeAtObservedGasPriceBNB: formatEther(bufferedGas * gasPrice)};
    } catch { return {name, status: 'NOT_ESTIMATED', reason: 'ARTIFACT_OR_ESTIMATE_FAILED_DETAILS_REDACTED'}; }
  }));
  let independent = {status: 'UNVERIFIED', endpoint: 'https://bsc-dataseed.bnbchain.org'};
  try {
    const publicClient = readOnlyClient(independent.endpoint);
    const [publicChain, publicBlock] = await Promise.all([publicClient.getChainId(), publicClient.getBlock({blockNumber: block.number})]);
    independent = {...independent, status: publicChain === 56 && same(publicBlock.hash, block.hash) ? 'MATCH' : 'MISMATCH', chainId: publicChain, blockNumber: publicBlock.number, blockHash: publicBlock.hash};
  } catch { independent.reason = 'PUBLIC_RPC_READ_FAILED_DETAILS_REDACTED'; }
  if (!same((await client.getBlock({blockNumber: block.number})).hash, block.hash)) throw new Error('CHECKPOINT_CHANGED');
  const balances = Object.fromEntries(accounts.map(a => [a.role, a.balanceWei]));
  const funding = fundingPlan(balances.creator, balances.buyerB);
  const blockers = ['LIVE_DEPLOYMENT_MANIFEST_NOT_PREPARED', 'GOVERNANCE_DEPLOYMENT_AND_ROLE_AUDIT_NOT_DONE', 'TOTAL_GAS_BUDGET_NOT_DEFINED'];
  if (!plan.governance.multisig || !(plan.governance.minimumDelaySeconds > 0)) blockers.push('GOVERNANCE_MULTISIG_OR_DELAY_UNSPECIFIED');
  if (!funding.completeFundingPossibleBeforeGas) blockers.push('INSUFFICIENT_COMPLETE_SHARE_FUNDING_BEFORE_GAS');
  if (!funding.confirmedAllocationFundedBeforeGas) blockers.push('CONFIRMED_67_33_ALLOCATION_UNDERFUNDED_BEFORE_GAS');
  if (!same(owner, ACCOUNTS.sellerA)) blockers.push('SELLER_NOT_CURRENT_MINER_OWNER');
  if (identities.some(i => !i.matchesForkBaselineRuntime)) blockers.push('PROTOCOL_RUNTIME_CHANGED');
  if (!same(historicalBlock.hash, baseline.blockHash)) blockers.push('HISTORICAL_FORK_CHECKPOINT_MISMATCH');
  if (independent.status !== 'MATCH') blockers.push('INDEPENDENT_CHAIN_CHECK_NOT_MATCHED');
  const report = {
    status: 'READ_ONLY_OBSERVED_MAINNET_EXECUTION_NOT_STARTED', observedAt: new Date().toISOString(), chainId,
    checkpoint: {selection, blockNumber: block.number, blockHash: block.hash, timestamp: block.timestamp},
    independentCrossCheck: independent, historicalForkCheckpointMatches: same(historicalBlock.hash, baseline.blockHash),
    accounts, funding, plannedGovernance:{multisig:plan.governance.multisig,minimumDelaySeconds:plan.governance.minimumDelaySeconds,guardian:plan.governance.guardian,status:'LOCAL_PLAN_ONLY_NOT_DEPLOYED'}, gasPriceWei: gasPrice, implementationDeploymentGasOnly: deploymentGas, gasEstimateForFullLifecycle: 'NOT_ESTIMATED_PENDING_DEPLOYMENT_AND_CONFIGURATION',
    miner: {collection: baseline.collection, tokenId: baseline.tokenId, owner, sellerOwnsMiner: same(owner, ACCOUNTS.sellerA), approved, noTokenApproval: same(approved, zeroAddress), seaportOperatorApproved: operatorApproved},
    protocolRuntimeIdentities: identities,
    seaport: {address: baseline.market, version: information[0], domainSeparator: information[1], conduitController: information[2], sellerCounter: counter},
    mining: {address: baseline.mining, minerKey, pendingRaw: pending, pendingIsNotGuaranteedClaimAmount: true},
    bem: {address: baseline.bem, decimals},
    blockers, mainnetTransactionsSent: 0, orderSignaturesCreated: 0, privateKeysConsumed: false,
    environmentFieldsConsumed: ['BSC_RPC_URL'], rpcCredentials: 'REDACTED', marketDatabaseWrites: 0,
    governanceDeployment: 'NOT_RUN', purchase: 'NOT_RUN', rewardsAndRedemption: 'NOT_RUN',
    limitation: 'Runtime hashes are compared against the observed fork baseline, not an independent full source audit. Proxy implementation semantics and complete governance history are not approved by this observation.',
  };
  const file = await saveObservation('preflight', report);
  return {...report, reportFile: file};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--env') throw new Error('USAGE_NODE_LIVE_TEST_PREFLIGHT_ENV_FILE');
    console.log(json(await preflight(process.argv[3])));
  } catch (error) {
    const reason = error.constructor === Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'READ_ONLY_PREFLIGHT_FAILED_DETAILS_REDACTED';
    console.error(json({status: 'FAILED', reason, mainnetTransactionsSent: 0})); process.exitCode = 1;
  }
}
