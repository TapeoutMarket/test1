import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { getAddress, keccak256, parseAbi, stringToHex, toHex, zeroAddress, zeroHash, type Abi, type Address, type Hex, type PublicClient } from 'viem';
import { ROOT, configurationHash, loadArtifact, protocolConfigSchema } from './contracts.js';
import { confinedFile } from './order-source.js';
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(v => v.toLowerCase() !== zeroAddress);
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/);
const identity = z.object({ address, codeHash: hash }).strict();
export const liveManifestSchema = z.object({
  schemaVersion: z.literal('1'), mode: z.literal('live'), chainId: z.literal(56),
  network: z.object({ checkpointBlock: uint, checkpointHash: hash }).strict(),
  factory: z.object({ address, codeHash: hash, implementation: identity }).strict(),
  template: z.object({ address, codeHash: hash, validator: identity }).strict(),
  governance: z.object({ timelock: identity, multisig: identity, guardian: address, minimumDelay: uint,
    roleAuditBlock: uint, roleAuditBlockHash: hash, roleAuditReportHash: hash }).strict(),
  config: protocolConfigSchema, configHash: hash,
  dependencies: z.object({ collection: identity, mining: identity, bem: identity }).strict(),
  vault: z.object({ address, codeHash: hash, termsHash: hash, payloadHash: hash, creator: address, round: uint }).strict(),
}).strict();
export type LiveManifest = z.infer<typeof liveManifestSchema>;
const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
function must(value: unknown, reason: string): asserts value { if (!value) throw new Error(`Live identity rejected: ${reason}`); }
export function parseLiveManifest(input: unknown): LiveManifest {
  const parsed = liveManifestSchema.safeParse(input);
  if (!parsed.success) throw new Error('Live identity rejected: strict reviewed manifest required; deployment labels are not evidence');
  const m = parsed.data;
  must(m.config.chainId === '56' && m.config.marketKind === 0 && m.config.mockOnly === false, 'only reviewed real Seaport configuration is enabled');
  must(same(configurationHash(m.config), m.configHash), 'manifest Config hash mismatch');
  for (const name of ['collection', 'mining', 'bem'] as const) must(same(m.config[name], m.dependencies[name].address), 'dependency address mismatch');
  must(BigInt(m.governance.minimumDelay) > 0n, 'positive governance delay required');
  must(!same(m.governance.guardian, m.governance.timelock.address) && !same(m.governance.guardian, m.governance.multisig.address), 'guardian must be independent');
  must(same(keccak256(cloneRuntime(m.template.address as Address)), m.vault.codeHash), 'expected clone runtime hash does not bind template');
  return m;
}
export async function loadLiveManifest(file: string | undefined, expectedHash: string | undefined) {
  must(file && /^0x[0-9a-fA-F]{64}$/.test(expectedHash ?? ''), 'LIVE_MANIFEST_FILE and EXPECTED_MANIFEST_HASH required');
  const raw = await readFile(await confinedFile(ROOT, file), 'utf8');
  must(same(keccak256(toHex(raw)), expectedHash), 'reviewed manifest file changed');
  return { manifest: parseLiveManifest(JSON.parse(raw)), manifestHash: expectedHash as Hex };
}
export function cloneRuntime(template: Address): Hex { return `0x363d3d373d3d3d363d73${template.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`; }
export function cloneImplementation(code: Hex): Address {
  const match = /^0x363d3d373d3d3d363d73([0-9a-fA-F]{40})5af43d82803e903d91602b57fd5bf3$/.exec(code);
  must(match, 'target is not the reviewed standard ERC1167 runtime'); return getAddress(`0x${match[1]}`);
}
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc' as Hex;
const governanceAbi = parseAbi(['function getMinDelay() view returns(uint256)', 'function minimumDelayFloor() view returns(uint256)', 'function deploymentAddress() view returns(address)', 'function hasRole(bytes32,address) view returns(bool)']);
const codeBearingActions = new Set(['create-pool', 'contribute', 'harvest', 'harvest-and-claim', 'redeem']);

export async function verifyLiveIdentity(client: PublicClient, m: LiveManifest, request: { command: string; target: Address; actor: Address; args: unknown[]; expectedTemplate?: string; expectedCodeHash?: string }) {
  must(await client.getChainId() === 56, 'execution chain mismatch');
  must(same((await client.getBlock({ blockNumber: BigInt(m.network.checkpointBlock) })).hash, m.network.checkpointHash), 'reviewed BSC network checkpoint mismatch');
  must(same(request.expectedTemplate, m.template.address), 'EXPECTED_TEMPLATE must match reviewed manifest');
  const factoryAction = ['create-pool', 'guardian-cancel'].includes(request.command);
  must(same(request.target, factoryAction ? m.factory.address : m.vault.address), 'transaction target mismatch');
  must(same(request.expectedCodeHash, factoryAction ? m.factory.codeHash : m.vault.codeHash), 'EXPECTED_CODE_HASH must match reviewed target');
  const block = await client.getBlock({ blockTag: 'latest' }), blockNumber = block.number;
  const { abi } = await loadArtifact('GroupBuyVault');
  const checkedCode = async (item: {address:string;codeHash:string}) => { const code = await client.getCode({ address: item.address as Address, blockNumber }); must(code && code !== '0x' && same(keccak256(code), item.codeHash), 'actual deployed runtime hash mismatch'); return code; };
  const readVault = (where: string, functionName: string, args: unknown[] = []) => client.readContract({ address: where as Address, abi, functionName, args, blockNumber });
  const templateCode = await checkedCode(m.template); must(!/^0x363d3d373d3d3d363d73/i.test(templateCode), 'template may not itself be a clone');
  must(same(await readVault(m.template.address, 'implementationSelf'), m.template.address), 'template self-identity mismatch');
  must(await readVault(m.template.address, 'templateInitializersDisabled') === true, 'template initializer is not locked');
  must(same(await readVault(m.template.address, 'marketValidator'), m.template.validator.address), 'immutable validator mismatch');
  if (codeBearingActions.has(request.command)) await checkedCode(m.template.validator);
  if (request.command !== 'create-pool') {
    const code = await checkedCode(m.vault);
    must(same(cloneImplementation(code), m.template.address), 'clone delegates to unexpected implementation');
    const [factory, config, configHash, termsHash, payload, creator] = await Promise.all(['factory', 'getConfig', 'configHash', 'termsHash', 'purchasePayload', 'creator'].map(name => readVault(m.vault.address, name)));
    must(same(factory, m.factory.address) && same(creator, m.vault.creator), 'immutable pool origin mismatch');
    must(same(configHash, m.configHash) && same(configurationHash(config as never), m.configHash), 'immutable Vault Config differs');
    must(same(termsHash, m.vault.termsHash) && same(keccak256(payload as Hex), m.vault.payloadHash), 'immutable terms/payload differs');
    if (request.command === 'guardian-cancel') must(same(request.args[0], m.vault.address), 'guardian destination differs');
  }
  if (codeBearingActions.has(request.command)) {
    await checkedCode({ address: m.config.market, codeHash: m.config.marketCodeHash });
    for (const identity of Object.values(m.dependencies)) await checkedCode(identity);
  }
  if (factoryAction) {
    await checkedCode(m.factory); await checkedCode(m.factory.implementation);
    const slot = await client.getStorageAt({ address: m.factory.address as Address, slot: IMPLEMENTATION_SLOT, blockNumber });
    must(slot && /^0x0{24}[0-9a-fA-F]{40}$/.test(slot) && same(`0x${slot.slice(-40)}`, m.factory.implementation.address), 'Factory proxy implementation differs');
    const { abi: factoryAbi } = await loadArtifact('GroupBuyFactory');
    const readFactory = (functionName: string, args: unknown[] = []) => client.readContract({ address: m.factory.address as Address, abi: factoryAbi, functionName, args, blockNumber });
    const [admin, guardian, delay] = await Promise.all(['upgradeAdmin', 'guardian', 'requiredMinDelay'].map(name => readFactory(name)));
    must(same(admin, m.governance.timelock.address) && same(guardian, m.governance.guardian) && BigInt(delay as bigint) >= BigInt(m.governance.minimumDelay), 'Factory governance bindings differ');
    await checkedCode(m.governance.timelock); await checkedCode(m.governance.multisig);
    const readTimelock = (functionName: string, args: unknown[] = []) => client.readContract({ address: m.governance.timelock.address as Address, abi: governanceAbi as Abi, functionName, args, blockNumber });
    const role = (name: string) => keccak256(stringToHex(name));
    const [actualDelay, floor, self, selfAdmin, multisigProposer, guardianAdmin, guardianProposer, externalAdmin] = await Promise.all([
      readTimelock('getMinDelay'), readTimelock('minimumDelayFloor'), readTimelock('deploymentAddress'),
      readTimelock('hasRole', [zeroHash, m.governance.timelock.address]), readTimelock('hasRole', [role('PROPOSER_ROLE'), m.governance.multisig.address]),
      readTimelock('hasRole', [zeroHash, m.governance.guardian]), readTimelock('hasRole', [role('PROPOSER_ROLE'), m.governance.guardian]), readTimelock('hasRole', [zeroHash, m.governance.multisig.address]),
    ]);
    must(BigInt(actualDelay as bigint) >= BigInt(m.governance.minimumDelay) && BigInt(floor as bigint) >= BigInt(m.governance.minimumDelay) && same(self, m.governance.timelock.address), 'actual Timelock delay/floor/self differs');
    must(selfAdmin === true && multisigProposer === true && guardianAdmin === false && guardianProposer === false && externalAdmin === false, 'unsafe known governance roles');
    must(same((await client.getBlock({ blockNumber: BigInt(m.governance.roleAuditBlock) })).hash, m.governance.roleAuditBlockHash), 'governance audit block changed');
    if (request.command === 'create-pool') {
      const [selectedTemplate, selectedConfig, paused] = await Promise.all(['selectedTemplate', 'selectedConfigHash', 'creationPaused'].map(name => readFactory(name)));
      must(same(selectedTemplate, m.template.address) && same(selectedConfig, m.configHash) && paused === false, 'Factory creation selection changed');
      must(same(request.actor, m.vault.creator) && same(request.args[0], m.template.address) && same(request.args[1], m.configHash) && same(keccak256(request.args[3] as Hex), m.vault.payloadHash) && BigInt(request.args[4] as bigint) === BigInt(m.vault.round), 'creation request differs from reviewed manifest');
      must(same(await readFactory('hashTerms', [request.args[2]]), m.vault.termsHash), 'creation terms differ');
      must(same(await readFactory('predictPool', [request.actor, ...request.args]), m.vault.address), 'predicted clone differs');
    } else must(same(request.actor, m.governance.guardian), 'only reviewed guardian may cancel');
  }
  must(same((await client.getBlock({ blockNumber })).hash, block.hash), 'identity observation block changed');
  return { status: 'REVIEWED_MANIFEST_AND_CHAIN_IDENTITY_MATCH', blockNumber, blockHash: block.hash,
    template: m.template.address, configHash: m.configHash, termsHash: m.vault.termsHash,
    factoryCurrentStateChecked: factoryAction, externalDependencyCodeChecked: codeBearingActions.has(request.command),
    roleAuditBoundary: 'Known roles and code verified here; complete historic grants/revocations and multisig ownership require the separately hash-pinned reviewed audit. No production-readiness label is trusted.' };
}
