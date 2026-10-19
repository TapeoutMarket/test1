import { z } from 'zod';
import { encodeAbiParameters, hashStruct, hashTypedData, isAddress, keccak256, zeroAddress, zeroHash, type Hex } from 'viem';

const uint = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(v => BigInt(v) < 2n ** 256n, 'uint256 overflow');
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).refine(isAddress, 'invalid address');
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const bytes = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/).max(16386);
const offer = z.object({ itemType: z.literal(2), token: address, identifierOrCriteria: uint, startAmount: z.literal('1'), endAmount: z.literal('1') }).strict();
const consideration = z.object({ itemType: z.literal(0), token: z.literal(zeroAddress), identifierOrCriteria: z.literal('0'), startAmount: uint, endAmount: uint, recipient: address }).strict();
const commonOrder = { offerer: address, zone: z.literal(zeroAddress), offer: z.array(offer).length(1), consideration: z.array(consideration).length(2), orderType: z.literal(0), startTime: uint, endTime: uint, zoneHash: z.literal(zeroHash), salt: uint, conduitKey: z.literal(zeroHash) };
const orderParameters = z.object({ ...commonOrder, totalOriginalConsiderationItems: z.literal('2') }).strict();
const orderComponents = z.object({ ...commonOrder, counter: uint }).strict();
const listing = z.object({ listingId: uint, seller: address, collection: address, tokenId: uint, price: uint.refine(v => BigInt(v) < 2n ** 96n, 'uint96 overflow'), feeBps: z.number().int().min(0).max(10000), valid: z.boolean() }).strict();
const base = {
  schemaVersion: z.literal('1'), source: z.object({ kind: z.enum(['json', 'http']), name: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/), commit: z.string().regex(/^[0-9a-f]{7,64}$/).optional(), configVersion: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/).optional() }).strict(),
  sourceChainId: z.literal(56), market: address, collection: address, tokenId: uint, seller: address, buyerPaysWei: uint.refine(v => BigInt(v) >= 100n, 'total payment must be >=100 wei'),
  currency: z.object({ kind: z.literal('native'), symbol: z.literal('BNB'), token: z.literal(zeroAddress) }).strict(),
  fees: z.array(z.object({ kind: z.enum(['seller', 'market']), recipient: address, amountWei: uint }).strict()).length(2),
  nativeStartTime: uint.nullable(), nativeEndTime: uint.nullable(), quoteExpiresAt: uint.nullable(),
  validation: z.object({ status: z.enum(['verified', 'unknown']), blockNumber: uint, blockHash: bytes32 }).strict(),
  exportedAt: z.string().datetime(),
  identity: z.object({ status: z.enum(['verified', 'unknown']), marketCodeHash: bytes32.nullable(), collectionCodeHash: bytes32.nullable(),
    proxy: z.object({ address, implementation: address.nullable(), implementationCodeHash: bytes32.nullable(), mechanism: z.enum(['eip1967-rpc', 'getter', 'unknown']), onchainEnforced: z.boolean() }).strict().nullable(),
    evidenceVersion: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/) }).strict(),
};
export const orderEnvelopeSchema = z.discriminatedUnion('protocol', [
  z.object({ ...base, protocol: z.literal('seaport'), orderHash: bytes32,
    seaport: z.object({ parameters: orderParameters, components: orderComponents, signature: bytes,
      domain: z.object({ name: z.literal('Seaport'), version: z.string().regex(/^[0-9]+\.[0-9]+$/), chainId: z.literal(56), verifyingContract: address, domainSeparator: bytes32 }).strict() }).strict() }).strict(),
  z.object({ ...base, protocol: z.literal('official-circuit'), listingId: uint,
    official: z.object({ adapterStatus: z.enum(['unknown', 'reserved-disabled']), listingView: listing,
      listingFor: z.object({ listingId: uint, seller: address, price: uint, valid: z.boolean() }).strict() }).strict() }).strict(),
]);
export type OrderEnvelope = z.infer<typeof orderEnvelopeSchema>;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function requireCheck(value: boolean, message: string): asserts value { if (!value) throw new Error(`UnsupportedOrder: ${message}`); }

export const seaportTypes = {
  OrderComponents: [{ name: 'offerer', type: 'address' }, { name: 'zone', type: 'address' }, { name: 'offer', type: 'OfferItem[]' }, { name: 'consideration', type: 'ConsiderationItem[]' }, { name: 'orderType', type: 'uint8' }, { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' }, { name: 'zoneHash', type: 'bytes32' }, { name: 'salt', type: 'uint256' }, { name: 'conduitKey', type: 'bytes32' }, { name: 'counter', type: 'uint256' }],
  OfferItem: [{ name: 'itemType', type: 'uint8' }, { name: 'token', type: 'address' }, { name: 'identifierOrCriteria', type: 'uint256' }, { name: 'startAmount', type: 'uint256' }, { name: 'endAmount', type: 'uint256' }],
  ConsiderationItem: [{ name: 'itemType', type: 'uint8' }, { name: 'token', type: 'address' }, { name: 'identifierOrCriteria', type: 'uint256' }, { name: 'startAmount', type: 'uint256' }, { name: 'endAmount', type: 'uint256' }, { name: 'recipient', type: 'address' }],
} as const;
export const orderAbi = [{ type: 'tuple', components: [{ name: 'parameters', type: 'tuple', components: [
  { name: 'offerer', type: 'address' }, { name: 'zone', type: 'address' },
  { name: 'offer', type: 'tuple[]', components: seaportTypes.OfferItem }, { name: 'consideration', type: 'tuple[]', components: seaportTypes.ConsiderationItem },
  { name: 'orderType', type: 'uint8' }, { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' }, { name: 'zoneHash', type: 'bytes32' }, { name: 'salt', type: 'uint256' }, { name: 'conduitKey', type: 'bytes32' }, { name: 'totalOriginalConsiderationItems', type: 'uint256' },
] }, { name: 'signature', type: 'bytes' }] }] as const;

export function parseOrderEnvelope(input: unknown): OrderEnvelope {
  const r = orderEnvelopeSchema.safeParse(input);
  if (!r.success) throw new Error(`InvalidOrderEnvelope: missing or unsupported fields: ${r.error.issues.map(i => i.path.join('.') || 'root').join(', ')}`);
  const e = r.data;
  requireCheck(e.fees[0].kind === 'seller' && e.fees[1].kind === 'market', 'fee order must be seller then market');
  requireCheck(same(e.fees[0].recipient, e.seller), 'seller fee recipient mismatch');
  requireCheck(e.fees.reduce((n, x) => n + BigInt(x.amountWei), 0n) === BigInt(e.buyerPaysWei), 'payment sum mismatch');
  if (e.identity.proxy) requireCheck(same(e.identity.proxy.address, e.market), 'proxy address mismatch');
  if (e.protocol === 'seaport') {
    const { parameters: p, components: c, domain: d } = e.seaport;
    const { totalOriginalConsiderationItems: _count, ...pCommon } = p;
    const { counter: _counter, ...cCommon } = c;
    requireCheck(JSON.stringify(pCommon) === JSON.stringify(cCommon), 'OrderParameters/OrderComponents differ');
    requireCheck(same(p.offerer, e.seller) && same(p.offer[0].token, e.collection) && p.offer[0].identifierOrCriteria === e.tokenId, 'asset/seller mismatch');
    requireCheck(same(d.verifyingContract, e.market), 'domain market mismatch');
    requireCheck(same(domainSeparator(e), d.domainSeparator), 'domain separator mismatch');
    requireCheck(p.startTime === e.nativeStartTime && p.endTime === e.nativeEndTime && BigInt(p.startTime) < BigInt(p.endTime), 'native time mismatch');
    requireCheck(p.consideration.every((x, i) => x.startAmount === x.endAmount && x.startAmount === e.fees[i].amountWei && same(x.recipient, e.fees[i].recipient)), 'fixed consideration mismatch');
    requireCheck(BigInt(e.fees[1].amountWei) === BigInt(e.fees[0].amountWei) / 100n, 'V1 buyer market fee must be 1 percent of seller amount');
    requireCheck(same(orderHash(e), e.orderHash), 'orderHash differs from complete OrderComponents');
  } else {
    const v = e.official.listingView, f = e.official.listingFor;
    requireCheck(e.nativeStartTime === null && e.nativeEndTime === null, 'official market has no verified native expiry');
    requireCheck(e.listingId === v.listingId && e.listingId === f.listingId && same(v.collection, e.collection) && v.tokenId === e.tokenId && same(v.seller, e.seller) && same(f.seller, e.seller) && v.price === f.price, 'listing cross-check mismatch');
  }
  return e;
}
export function orderHash(e: Extract<OrderEnvelope, { protocol: 'seaport' }>): Hex {
  return hashStruct({ data: e.seaport.components as never, primaryType: 'OrderComponents', types: seaportTypes });
}
export function signingDigest(e: Extract<OrderEnvelope, { protocol: 'seaport' }>): Hex {
  const { domainSeparator: _separator, ...domain } = e.seaport.domain;
  return hashTypedData({ domain: domain as never, types: seaportTypes, primaryType: 'OrderComponents', message: e.seaport.components as never });
}
export function domainSeparator(e: Extract<OrderEnvelope, { protocol: 'seaport' }>): Hex {
  return hashStruct({ data: e.seaport.domain as never, primaryType: 'EIP712Domain', types: { EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' }] } });
}
export function executionPayload(e: OrderEnvelope): Hex {
  if (e.protocol !== 'seaport') throw new Error('OfficialAdapterDisabled: real implementation and ABI not independently verified');
  // Mirrors Types.Order exactly, including the signature and original consideration count.
  return encodeAbiParameters(orderAbi, [{ parameters: e.seaport.parameters, signature: e.seaport.signature } as never]);
}
export function executionCommitment(e: OrderEnvelope): Hex { return keccak256(executionPayload(e)); }
export function assertExecutableEnvelope(e: OrderEnvelope): void {
  if (e.protocol === 'official-circuit') throw new Error('OfficialAdapterDisabled: CIRCUIT_RESERVED stays fail closed; mock compatibility is not real protocol verification');
  if (e.validation.status !== 'verified' || e.identity.status !== 'verified' || !e.identity.marketCodeHash || !e.identity.collectionCodeHash) throw new Error('UnverifiedProtocol: chain identity and order validation must be independently refreshed');
}
export function idCost(totalPrice: bigint, id: number): bigint {
  if (totalPrice < 100n || !Number.isInteger(id) || id < 1 || id > 100) throw new Error('Invalid ID or total price');
  return totalPrice / 100n + (BigInt(id) <= totalPrice % 100n ? 1n : 0n);
}
export function validateIds(ids: number[]): number[] {
  if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => !Number.isInteger(id) || id < 1 || id > 100)) throw new Error('Invalid IDs: use 1..100 without duplicates');
  return ids;
}
