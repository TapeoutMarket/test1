import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { encodeAbiParameters, keccak256, stringToHex, zeroHash, type Abi, type Hex } from 'viem';
import { executionPayload, type OrderEnvelope, validateIds, idCost } from './order-envelope.js';
export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const configComponents = [
  { name: 'chainId', type: 'uint256' }, { name: 'templateVersion', type: 'uint32' }, { name: 'marketKind', type: 'uint8' },
  { name: 'market', type: 'address' }, { name: 'collection', type: 'address' }, { name: 'mining', type: 'address' }, { name: 'bem', type: 'address' },
  { name: 'marketCodeHash', type: 'bytes32' }, { name: 'seaportDomainSeparator', type: 'bytes32' }, { name: 'seaportVersionHash', type: 'bytes32' },
  { name: 'safetyMargin', type: 'uint64' }, { name: 'mockOnly', type: 'bool' },
] as const;
export const termsComponents = [
  { name: 'seller', type: 'address' }, { name: 'tokenId', type: 'uint256' }, { name: 'totalPrice', type: 'uint256' }, { name: 'deadline', type: 'uint64' },
  { name: 'orderHash', type: 'bytes32' }, { name: 'counter', type: 'uint256' }, { name: 'listingId', type: 'uint256' }, { name: 'listingPrice', type: 'uint96' }, { name: 'feeBps', type: 'uint16' },
  { name: 'executionHash', type: 'bytes32' }, { name: 'orderStart', type: 'uint64' }, { name: 'orderEnd', type: 'uint64' }, { name: 'name', type: 'string' }, { name: 'metadataURI', type: 'string' },
] as const;
const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/), hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/), integer = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const protocolConfigSchema = z.object({ chainId: integer, templateVersion: z.number().int().positive(), marketKind: z.union([z.literal(0), z.literal(1), z.literal(2)]), market: addr, collection: addr, mining: addr, bem: addr, marketCodeHash: hash, seaportDomainSeparator: hash, seaportVersionHash: hash, safetyMargin: integer, mockOnly: z.boolean() }).strict();
export type ProtocolConfig = z.infer<typeof protocolConfigSchema>;
export function configurationHash(config: ProtocolConfig): Hex { return keccak256(encodeAbiParameters([{ type: 'tuple', components: configComponents }], [config as never])); }
export function buildTerms(e: OrderEnvelope, config: ProtocolConfig, deadline: bigint, name: string, metadataURI: string) {
  const payload = executionPayload(e);
  if (e.protocol !== 'seaport' || config.marketKind !== 0) throw new Error('OfficialAdapterDisabled: no real official market configuration enabled');
  if (config.chainId !== String(e.sourceChainId) || config.market.toLowerCase() !== e.market.toLowerCase() || config.collection.toLowerCase() !== e.collection.toLowerCase() || config.seaportDomainSeparator.toLowerCase() !== e.seaport.domain.domainSeparator.toLowerCase() || config.seaportVersionHash.toLowerCase() !== keccak256(stringToHex(e.seaport.domain.version)).toLowerCase()) throw new Error('Configuration does not bind imported order');
  if (deadline >= 2n ** 64n || deadline <= BigInt(e.seaport.parameters.startTime) || BigInt(e.seaport.parameters.endTime) < BigInt(config.safetyMargin) || deadline > BigInt(e.seaport.parameters.endTime) - BigInt(config.safetyMargin)) throw new Error('Invalid immutable pool deadline');
  if (Buffer.byteLength(name) === 0 || Buffer.byteLength(name) > 64 || Buffer.byteLength(metadataURI) > 512) throw new Error('Invalid bounded metadata');
  const terms = { seller: e.seller, tokenId: BigInt(e.tokenId), totalPrice: BigInt(e.buyerPaysWei), deadline, orderHash: e.orderHash,
    counter: BigInt(e.seaport.components.counter), listingId: 0n, listingPrice: 0n, feeBps: 100, executionHash: keccak256(payload),
    orderStart: BigInt(e.seaport.parameters.startTime), orderEnd: BigInt(e.seaport.parameters.endTime), name, metadataURI };
  return { terms, payload, configHash: configurationHash(config), termsHash: keccak256(encodeAbiParameters([{ type: 'tuple', components: termsComponents }], [terms as never])) };
}
export async function loadArtifact(name: 'GroupBuyVault' | 'GroupBuyFactory'): Promise<{ abi: Abi; bytecode: Hex }> {
  try { const a = JSON.parse(await readFile(resolve(ROOT, 'out', `${name}.sol`, `${name}.json`), 'utf8')); return { abi: a.abi, bytecode: a.bytecode.object }; }
  catch { throw new Error(`Artifact unavailable: build ${name} before chain commands`); }
}
export function contributionValue(totalPrice: bigint, ids: number[]): bigint { return validateIds(ids).reduce((value, id) => value + idCost(totalPrice, id), 0n); }
export const localMockTermsSchema = z.object({ scope: z.literal('LOCAL_MOCK_ONLY'), seller: addr, tokenId: integer, totalPrice: integer, deadline: integer, listingId: integer, feeBps: z.number().int().min(0).max(10000), name: z.string().min(1).max(64), metadataURI: z.string().max(512) }).strict();
export function buildLocalMockTerms(input: unknown, config: ProtocolConfig, mode: string, executionChainId: number) {
  if (mode !== 'mock' || !config.mockOnly || config.marketKind !== 2 || BigInt(config.chainId) !== BigInt(executionChainId)) throw new Error('Configuration local Mock terms cannot enable real official/fork/live markets');
  const t = localMockTermsSchema.parse(input);
  if (BigInt(t.totalPrice) < 100n || BigInt(t.totalPrice) >= 2n ** 96n || BigInt(t.deadline) >= 2n ** 64n) throw new Error('Invalid local Mock price or deadline');
  const payload = '0x' as Hex;
  const terms = { seller: t.seller, tokenId: BigInt(t.tokenId), totalPrice: BigInt(t.totalPrice), deadline: BigInt(t.deadline), orderHash: zeroHash, counter: 0n, listingId: BigInt(t.listingId), listingPrice: BigInt(t.totalPrice), feeBps: t.feeBps, executionHash: keccak256(payload), orderStart: 0n, orderEnd: 0n, name: t.name, metadataURI: t.metadataURI };
  return { terms, payload, configHash: configurationHash(config), termsHash: keccak256(encodeAbiParameters([{ type: 'tuple', components: termsComponents }], [terms as never])) };
}
export const STATE_NAMES = ['FUNDING', 'PURCHASING', 'ACTIVE', 'REFUNDABLE', 'REDEEMED'] as const;
export const MARKET_STATUS_NAMES = ['EXECUTABLE', 'NOT_STARTED', 'EXPIRED', 'CANCELLED', 'FILLED', 'COUNTER_CHANGED', 'OWNER_CHANGED', 'APPROVAL_MISSING', 'PRICE_CHANGED', 'LISTING_ENDED', 'UNKNOWN'] as const;
