#!/usr/bin/env node
import { readFile, writeFile, realpath, open, unlink } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { spawn } from 'node:child_process';
import { createWalletClient, encodeFunctionData, formatEther, http, keccak256, parseEther, type Address, type Abi, type Hex } from 'viem';
import { ROOT, actorAddress, buildLocalMockTerms, buildTerms, checkProtocol, checkReceiptPostconditions, confinedFile, executionConfig, HttpOrderSource, JsonFileOrderSource, loadArtifact, loadLiveManifest, protocolConfigSchema, publicClient, safeDiagnostic, sendPolicy, STATE_NAMES, validateIds, vaultObservation, verifyExecutionTarget, verifyLiveIdentity } from '../sdk/index.js';

const commands = ['protocol-check', 'import-order', 'deploy-local', 'create-pool', 'contribute', 'withdraw', 'mark-refundable', 'guardian-cancel', 'harvest', 'claim-batch', 'harvest-and-claim', 'claim-residual', 'transfer-shares', 'redeem', 'redeem-without-harvest', 'inspect', 'report'] as const;
const json = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
type Flags = Record<string, string | boolean>;
function parse(argv: string[]) {
  const command = argv[0]; const flags: Flags = Object.create(null);
  for (let i = 1; i < argv.length; i++) {
    if (!/^--[a-z-]+$/.test(argv[i])) throw new Error('Invalid CLI argument');
    const key = argv[i].slice(2);
    if (key in flags) throw new Error('Invalid duplicate CLI flag');
    flags[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  const allowed = ['help', 'mode', 'order', 'mock-terms', 'out', 'from', 'factory', 'vault', 'config', 'deadline', 'round', 'name', 'uri', 'expected-template', 'ids', 'to', 'require-completion', 'reason', 'broadcast', 'send-local', 'key-role', 'http-path', 'http-method', 'http-operation', 'http-request'];
  if (Object.keys(flags).some(k => !allowed.includes(k))) throw new Error('Invalid unknown CLI flag');
  if (['help', 'broadcast', 'send-local', 'require-completion'].some(k => k in flags && flags[k] !== true)) throw new Error('Invalid value for a boolean CLI flag');
  return { command, flags };
}
const string = (flags: Flags, key: string, fallback?: string): string | undefined => typeof flags[key] === 'string' ? flags[key] as string : fallback;
const required = (flags: Flags, key: string, fallback?: string) => { const value = string(flags, key, fallback); if (!value) throw new Error(`Missing --${key}`); return value; };
const uint = (raw: string): bigint => { if (!/^(0|[1-9][0-9]*)$/.test(raw)) throw new Error('Invalid unsigned integer'); return BigInt(raw); };
const idsOf = (flags: Flags) => validateIds(required(flags, 'ids').split(',').map(Number));
async function writeLocalJson(name: string, data: unknown, exclusive = false) {
  const file = resolve(ROOT, name), parent = await realpath(dirname(file)), rel = relative(await realpath(ROOT), parent);
  if (isAbsolute(rel) || rel.startsWith('..') || !file.endsWith('.json')) throw new Error('Invalid report path outside repository');
  try { const existing = await realpath(file); if (existing !== file) throw new Error('Invalid symlink output'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  await writeFile(file, json(data) + '\n', { flag: exclusive ? 'wx' : 'w' });
}
async function orderSource(flags: Flags) {
  const path = string(flags, 'http-path');
  if (path) {
    if (!process.env.MARKET_API_BASE_URL || !process.env.MARKET_API_READ_ALLOWLIST) throw new Error('Missing explicit localhost API origin and read allowlist');
    const method = string(flags, 'http-method', 'GET') as 'GET' | 'POST', operation = string(flags, 'http-operation', 'read-order') as 'read-order' | 'read-quote';
    const body = string(flags, 'http-request');
    return new HttpOrderSource(process.env.MARKET_API_BASE_URL, { path, method, operation }, JSON.parse(process.env.MARKET_API_READ_ALLOWLIST), body ? JSON.parse(body) : undefined).load();
  }
  return new JsonFileOrderSource(required(flags, 'order', process.env.ORDER_FILE), ROOT).load();
}
async function confirm(text: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Confirmation requires an interactive terminal');
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try { if (await reader.question(`Type exactly to authorize this one transaction:\n${text}\n> `) !== text) throw new Error('Confirmation mismatch; nothing sent'); }
  finally { reader.close(); }
}
async function runForge(args: string[]) {
  await new Promise<void>((ok, fail) => {
    const child = spawn(process.execPath, ['scripts/forge.mjs', ...args], { cwd: ROOT, stdio: 'inherit', env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/PRIVATE_KEY|FORK_SOURCE_RPC_URL|FORK_GATEWAY_TOKEN/.test(key))) });
    child.on('error', fail); child.on('exit', code => code === 0 ? ok() : fail(new Error('Contract local deployment script failed')));
  });
}

export async function main(argv = process.argv.slice(2)) {
  const { command, flags } = parse(argv);
  if (!command || command === 'help' || command === '--help' || flags.help) {
    console.log(`TapeOut GroupBuy V1 CLI — default dry-run, no .env loading\nCommands: ${commands.join(', ')}\n\nRead: npm run cli -- import-order --order fixtures/seaport-order.example.json\nPlan: npm run cli -- deploy-local\nWrite simulation: npm run cli -- contribute --vault 0x... --from 0x... --ids 1,2 --require-completion\nSandbox send requires --send-local and verified loopback Anvil, or explicit lan-relay topology plus pinned session for a remote fork.\nLive send requires MODE=live, ALLOW_LIVE_SEND=true, --broadcast, reviewed identities, budgets, and exact interactive confirmation.\nOrder signatures are public input; private keys must never appear in flags or fixtures.`); return;
  }
  if (!(commands as readonly string[]).includes(command)) throw new Error('Invalid CLI command');
  const env: NodeJS.ProcessEnv = { ...process.env, ...(string(flags, 'mode') ? { MODE: string(flags, 'mode') } : {}) };
  const config = executionConfig(env), send = sendPolicy(config.mode, { broadcast: flags.broadcast === true, sendLocal: flags['send-local'] === true }, env);
  if (command === 'import-order') {
    if (send) throw new Error('Invalid send flag for a read-only command');
    const order = await orderSource(flags); const out = string(flags, 'out');
    if (out) await writeLocalJson(out, order, true);
    console.log(json({ status: 'IMPORTED_STRUCTURE_ONLY', protocol: order.protocol, sourceChainId: order.sourceChainId, market: order.market, tokenId: order.tokenId, buyerPaysWei: order.buyerPaysWei, identityStatus: order.identity.status, executionVerified: false, ...(out ? { file: out } : {}) })); return;
  }
  if (command === 'deploy-local') {
    if (config.mode === 'live') throw new Error('Live deployment is not part of deploy-local');
    const from = string(flags, 'from');
    if (!send) { console.log(json({ status: 'DRY_RUN_DEPLOYMENT_PLAN_NOT_EXECUTED', mode: config.mode, script: 'script/DeployLocal.s.sol:DeployLocal', sender: from ?? 'EXPLICIT_FROM_REQUIRED_FOR_SEND', privateKeysUsed: false, next: 'Start verified loopback Anvil or pinned LAN fork relay; pass --from and --send-local after reviewing deployment script' })); return; }
    await verifyExecutionTarget(config);
    const sender = actorAddress(from);
    await runForge(['script', 'script/DeployLocal.s.sol:DeployLocal', '--rpc-url', config.executionRpcUrl, '--sender', sender, '--unlocked', '--broadcast']); return;
  }
  const client = publicClient(config);
  if (command === 'protocol-check') {
    if (send) throw new Error('Invalid send flag for protocol-check');
    const order = await orderSource(flags);
    if (order.protocol === 'official-circuit') { console.log(json({ ...await checkProtocol(client, order), execution: 'NOT_PROBED_DISABLED_PROTOCOL' })); return; }
    const targetEvidence = await verifyExecutionTarget(config, client);
    const result = await checkProtocol(client, order); console.log(json({ ...result, execution: targetEvidence })); return;
  }
  const targetEvidence = await verifyExecutionTarget(config, client);
  const vault = string(flags, 'vault', env.VAULT_ADDRESS), factory = string(flags, 'factory', env.FACTORY_ADDRESS);
  if (command === 'inspect' || command === 'report') {
    if (send) throw new Error('Invalid send flag for inspect/report');
    const address = actorAddress(vault), { abi } = await loadArtifact('GroupBuyVault'), block = await client.getBlock({ blockTag: 'latest' });
    const fields = ['factory', 'creator', 'state', 'getConfig', 'getTerms', 'configHash', 'termsHash', 'soldCount', 'fundedWei', 'totalPrincipalIn', 'totalPrincipalRefunded', 'purchaseSpent', 'totalAccounted', 'totalPaid', 'accPerShare', 'remainder', 'redeemedBeneficiary', 'availableIds', 'marketStatus'];
    const values = await Promise.all(fields.map(functionName => client.readContract({ address, abi, functionName, blockNumber: block.number })));
    const state = Object.fromEntries(fields.map((key, i) => [key, values[i]]));
    const idList = string(flags, 'ids') ? idsOf(flags) : [];
    const shares = await Promise.all(idList.map(async id => ({ id, holder: await client.readContract({ address, abi, functionName: 'holderOf', args: [BigInt(id)], blockNumber: block.number }), claimed: await client.readContract({ address, abi, functionName: 'claimed', args: [BigInt(id)], blockNumber: block.number }), claimable: await client.readContract({ address, abi, functionName: 'claimable', args: [BigInt(id)], blockNumber: block.number }) })));
    if ((await client.getBlock({ blockNumber: block.number })).hash !== block.hash) throw new Error('UnverifiedProtocol: snapshot block changed');
    const report = { status: 'READ_ONLY_PINNED_SNAPSHOT', mode: config.mode, execution: targetEvidence, vault: address, blockNumber: block.number, blockHash: block.hash, stateName: STATE_NAMES[Number(state.state)], state, shares, forkLiveTestResult: 'NOT_RUN_BY_THIS_READ' };
    if (command === 'report') await writeLocalJson(string(flags, 'out', `reports/inspect-${config.mode}-${block.number}.json`)!, report);
    console.log(json(report)); return;
  }
  const from = actorAddress(string(flags, 'from'));
  let address: Address, abi: Abi, functionName: string, args: unknown[] = [], value = 0n;
  if (command === 'create-pool') {
    address = actorAddress(factory); ({ abi } = await loadArtifact('GroupBuyFactory'));
    const protocol = protocolConfigSchema.parse(JSON.parse(await readFile(await confinedFile(ROOT, required(flags, 'config')), 'utf8')));
    if (config.mode !== 'mock' && protocol.mockOnly) throw new Error('Configuration mockOnly cannot execute in fork/live');
    let request;
    if (string(flags, 'mock-terms')) {
      if (string(flags, 'order') || string(flags, 'http-path')) throw new Error('Invalid mix of real order and local Mock terms');
      request = buildLocalMockTerms(JSON.parse(await readFile(await confinedFile(ROOT, required(flags, 'mock-terms')), 'utf8')), protocol, config.mode, config.expectedChainId);
    } else {
      const envelope = await orderSource(flags), orderCheck = await checkProtocol(client, envelope);
      if (!orderCheck.executable) throw new Error('UnverifiedProtocol: imported order does not pass fresh chain checks');
      request = buildTerms(envelope, protocol, uint(required(flags, 'deadline')), required(flags, 'name'), string(flags, 'uri', '')!);
    }
    functionName = 'createPool'; args = [actorAddress(string(flags, 'expected-template', env.EXPECTED_TEMPLATE)), request.configHash, request.terms, request.payload, uint(required(flags, 'round'))];
  } else if (command === 'guardian-cancel') {
    address = actorAddress(factory); ({ abi } = await loadArtifact('GroupBuyFactory'));
    functionName = 'guardianCancel'; args = [actorAddress(vault), Number(uint(required(flags, 'reason')))];
  } else {
    address = actorAddress(vault); ({ abi } = await loadArtifact('GroupBuyVault'));
    switch (command) {
      case 'contribute': {
        const ids = idsOf(flags).map(BigInt);
        value = (await Promise.all(ids.map(id => client.readContract({ address, abi, functionName: 'costOf', args: [id] })))).reduce<bigint>((total, cost) => total + BigInt(cost as bigint), 0n);
        const payload = await client.readContract({ address, abi, functionName: 'purchasePayload' }) as Hex;
        const terms = await client.readContract({ address, abi, functionName: 'getTerms' }) as { executionHash: Hex };
        if (keccak256(payload) !== terms.executionHash) throw new Error('Contract payload commitment mismatch');
        functionName = 'contribute'; args = [ids, flags['require-completion'] === true, payload]; break;
      }
      case 'withdraw': functionName = 'withdraw'; args = [idsOf(flags).map(BigInt), actorAddress(string(flags, 'to', from))]; break;
      case 'mark-refundable': functionName = 'markRefundable'; break;
      case 'harvest': functionName = 'harvest'; break;
      case 'claim-batch': functionName = 'claimBatch'; args = [idsOf(flags).map(BigInt)]; break;
      case 'harvest-and-claim': functionName = 'harvestAndClaim'; args = [idsOf(flags).map(BigInt)]; break;
      case 'claim-residual': functionName = 'claimResidual'; args = [actorAddress(string(flags, 'to', from))]; break;
      case 'transfer-shares': { const ids = idsOf(flags).map(BigInt); functionName = 'safeBatchTransferFrom'; args = [from, actorAddress(string(flags, 'to')), ids, ids.map(() => 1n), '0x']; break; }
      case 'redeem': functionName = 'redeemMiner'; break;
      case 'redeem-without-harvest': functionName = 'redeemWithoutHarvest'; break;
      default: throw new Error('Invalid write operation');
    }
  }
  if (!abi.some(item => item.type === 'function' && item.name === functionName)) throw new Error('Artifact function unavailable; contract interface must be reviewed');
  const reviewed = config.mode === 'live' ? await loadLiveManifest(env.LIVE_MANIFEST_FILE, env.EXPECTED_MANIFEST_HASH) : null;
  const identityRequest = { command, target: address, actor: from, args, expectedTemplate: string(flags, 'expected-template', env.EXPECTED_TEMPLATE), expectedCodeHash: env.EXPECTED_CODE_HASH };
  const liveIdentity = reviewed ? await verifyLiveIdentity(client, reviewed.manifest, identityRequest) : null;
  const call = { address, abi, functionName, args, account: from, value };
  const data = encodeFunctionData({ abi, functionName, args }), dataHash = keccak256(data);
  await client.simulateContract(call);
  const estimate = await client.estimateContractGas(call), gas = (estimate * 120n + 99n) / 100n, gasPrice = await client.getGasPrice();
  const plan = { status: send ? 'SIMULATED_AWAITING_SEND_GATE' : 'DRY_RUN_SIMULATION_SUCCEEDED', mode: config.mode, chainId: config.expectedChainId, command, sender: from, to: address, functionName, valueWei: value, gas, gasPrice, maximumFeeBNB: formatEther(gas * gasPrice), calldataHash: dataHash, execution: targetEvidence, liveIdentity, reviewedManifestHash: reviewed?.manifestHash ?? null };
  console.log(json(plan));
  if (!send) return;
  await verifyExecutionTarget(config, client);
  let lock: Awaited<ReturnType<typeof open>> | undefined; let budgetFile: string | undefined;
  try {
    let account: Address | Awaited<ReturnType<typeof import('viem/accounts')['privateKeyToAccount']>> = from;
    let reserved: { spentAndReservedWei: string; reservations: unknown[] } | undefined;
    if (config.mode === 'live') {
      if (env.LIVE_RELEASE_VERIFIED !== 'true') throw new Error('Live release remains blocked until independent protocol/governance review is recorded');
      const maxFee = parseEther(env.MAX_TX_FEE_BNB ?? '0'), maxSpend = parseEther(env.MAX_TOTAL_TEST_SPEND_BNB ?? '0');
      if (maxFee <= 0n || maxSpend <= 0n || gas * gasPrice > maxFee) throw new Error('Budget maximum gas fee exceeded or missing');
      budgetFile = resolve(ROOT, 'deployments/live-budget.json');
      lock = await open(resolve(ROOT, 'deployments/live-budget.lock'), 'wx');
      try { reserved = JSON.parse(await readFile(await confinedFile(ROOT, 'deployments/live-budget.json'), 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; reserved = { spentAndReservedWei: '0', reservations: [] }; }
      const reserve = value + gas * gasPrice, total = BigInt(reserved!.spentAndReservedWei) + reserve;
      if (total > maxSpend) throw new Error('Budget total test spend exceeded');
      await confirm(`SEND ${command} CHAIN ${config.expectedChainId} FROM ${from} TO ${address} VALUE ${value} GAS ${gas} PRICE ${gasPrice} DATA ${dataHash} MANIFEST ${reviewed!.manifestHash}`);
      const freshManifest = await loadLiveManifest(env.LIVE_MANIFEST_FILE, env.EXPECTED_MANIFEST_HASH);
      await verifyLiveIdentity(client, freshManifest.manifest, identityRequest);
      await verifyExecutionTarget(config, client);
      await client.simulateContract(call);
      const role = string(flags, 'key-role', 'a'); const keyName = { deployer: 'DEPLOYER_PRIVATE_KEY', a: 'PARTICIPANT_A_PRIVATE_KEY', b: 'PARTICIPANT_B_PRIVATE_KEY' }[role!];
      if (!keyName || !/^0x[0-9a-fA-F]{64}$/.test(env[keyName] ?? '')) throw new Error('Missing valid live signing key for selected role');
      const { privateKeyToAccount } = await import('viem/accounts'); account = privateKeyToAccount(env[keyName] as Hex);
      if (account.address.toLowerCase() !== from.toLowerCase()) throw new Error('Live signer does not match reviewed public actor');
      reserved = { spentAndReservedWei: total.toString(), reservations: [...reserved!.reservations, { command, to: address, valueWei: value.toString(), maxFeeWei: (gas * gasPrice).toString(), calldataHash: dataHash, status: 'RESERVED_BEFORE_SEND' }] };
      await writeLocalJson('deployments/live-budget.json', reserved);
    }
    const beforeBlock = await client.getBlock({ blockTag: 'latest' });
    const before = command === 'create-pool' ? { blockNumber: beforeBlock.number, blockHash: beforeBlock.hash, actorNative: await client.getBalance({ address: from, blockNumber: beforeBlock.number }) } : await vaultObservation(client, command === 'guardian-cancel' ? args[0] as Address : address, from, beforeBlock.number);
    const wallet = createWalletClient({ account, transport: http(config.executionRpcUrl, { retryCount: 0, timeout: 15000 }) });
    await verifyExecutionTarget(config, client);
    const hash = await wallet.sendTransaction({ to: address, data, value, gas, gasPrice, chain: null });
    console.log(json({ status: 'SUBMITTED_CHECK_RECEIPT_BEFORE_RETRY', transactionHash: hash }));
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || receipt.status !== 'success') throw new Error('Receipt replacement or revert; inspect transaction before any retry');
    const postconditions = await checkReceiptPostconditions(client, command, address, from, args, receipt);
    await writeLocalJson(`reports/${config.mode}-${command}-${hash}.json`, { ...plan, status: postconditions.verified ? 'RECEIPT_AND_POSTCONDITIONS_VERIFIED' : 'RECEIPT_SUCCESS_REQUIRES_REVIEW', before, transactionHash: hash, receipt, postconditions });
    console.log(json({ status: postconditions.verified ? 'RECEIPT_AND_POSTCONDITIONS_VERIFIED' : 'RECEIPT_SUCCESS_REQUIRES_REVIEW', transactionHash: hash, blockNumber: receipt.blockNumber }));
    if (!postconditions.verified) throw new Error('Receipt succeeded but postconditions require review; do not resend');
  } finally {
    if (lock) { await lock.close(); await unlink(resolve(ROOT, 'deployments/live-budget.lock')); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(json(safeDiagnostic(error))); process.exitCode = 1; });
