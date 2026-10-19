// Deterministic public examples only. No environment, key, or RPC reads.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { zeroAddress, zeroHash } from 'viem';
import { ROOT } from './contracts.js';
import { domainSeparator, orderEnvelopeSchema, orderHash, parseOrderEnvelope, type OrderEnvelope } from './order-envelope.js';

function schema(node: z.ZodTypeAny): Record<string, unknown> {
  const d = node._def;
  if (node instanceof z.ZodEffects) return schema(d.schema);
  if (node instanceof z.ZodOptional) return schema(d.innerType);
  if (node instanceof z.ZodNullable) return { anyOf: [schema(d.innerType), { type: 'null' }] };
  if (node instanceof z.ZodLiteral) return { const: d.value };
  if (node instanceof z.ZodEnum) return { type: 'string', enum: d.values };
  if (node instanceof z.ZodDiscriminatedUnion || node instanceof z.ZodUnion) return { oneOf: d.options.map(schema) };
  if (node instanceof z.ZodObject) {
    const shape = node.shape as Record<string, z.ZodTypeAny>;
    return { type: 'object', properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, schema(value)])), required: Object.entries(shape).filter(([, value]) => !value.isOptional()).map(([key]) => key), additionalProperties: false };
  }
  if (node instanceof z.ZodArray) return { type: 'array', items: schema(d.type), ...(d.exactLength ? { minItems: d.exactLength.value, maxItems: d.exactLength.value } : {}) };
  if (node instanceof z.ZodBoolean) return { type: 'boolean' };
  if (node instanceof z.ZodString) {
    const checks = d.checks as { kind: string; value?: number; regex?: RegExp }[];
    return { type: 'string', ...Object.assign({}, ...checks.map(c => c.kind === 'regex' ? { pattern: c.regex!.source } : c.kind === 'max' ? { maxLength: c.value } : c.kind === 'min' ? { minLength: c.value } : c.kind === 'datetime' ? { format: 'date-time' } : {})) };
  }
  if (node instanceof z.ZodNumber) return { type: d.checks.some((c: {kind:string}) => c.kind === 'int') ? 'integer' : 'number', ...Object.assign({}, ...d.checks.map((c: {kind:string;value:number}) => c.kind === 'min' ? { minimum: c.value } : c.kind === 'max' ? { maximum: c.value } : {})) };
  throw new Error(`Unsupported schema node ${d.typeName}`);
}
const market = '0x1111111111111111111111111111111111111111', collection = '0x2222222222222222222222222222222222222222', seller = '0x3333333333333333333333333333333333333333', feeRecipient = '0x4444444444444444444444444444444444444444';
const parameters = { offerer: seller, zone: zeroAddress, offer: [{ itemType: 2, token: collection, identifierOrCriteria: '3204', startAmount: '1', endAmount: '1' }], consideration: [{ itemType: 0, token: zeroAddress, identifierOrCriteria: '0', startAmount: '10000', endAmount: '10000', recipient: seller }, { itemType: 0, token: zeroAddress, identifierOrCriteria: '0', startAmount: '100', endAmount: '100', recipient: feeRecipient }], orderType: 0, startTime: '1700000000', endTime: '2000000000', zoneHash: zeroHash, salt: '1', conduitKey: zeroHash, totalOriginalConsiderationItems: '2' };
const { totalOriginalConsiderationItems: _count, ...common } = parameters;
const base = { schemaVersion: '1', source: { kind: 'json', name: 'synthetic-schema-example' }, sourceChainId: 56, market, collection, tokenId: '3204', seller, buyerPaysWei: '10100', currency: { kind: 'native', symbol: 'BNB', token: zeroAddress }, fees: [{ kind: 'seller', recipient: seller, amountWei: '10000' }, { kind: 'market', recipient: feeRecipient, amountWei: '100' }], nativeStartTime: '1700000000', nativeEndTime: '2000000000', quoteExpiresAt: null, validation: { status: 'unknown', blockNumber: '0', blockHash: zeroHash }, exportedAt: '2026-10-04T00:00:00.000Z', identity: { status: 'unknown', marketCodeHash: null, collectionCodeHash: null, proxy: null, evidenceVersion: 'schema-fixture-not-chain-evidence' } };
const seaport = { ...base, protocol: 'seaport', orderHash: zeroHash, seaport: { parameters, components: { ...common, counter: '0' }, signature: '0x', domain: { name: 'Seaport', version: '1.6', chainId: 56, verifyingContract: market, domainSeparator: zeroHash } } } as Extract<OrderEnvelope, {protocol:'seaport'}>;
seaport.seaport.domain.domainSeparator = domainSeparator(seaport); seaport.orderHash = orderHash(seaport);
const official = { ...base, protocol: 'official-circuit', nativeStartTime: null, nativeEndTime: null, listingId: '1', identity: { ...base.identity, proxy: { address: market, implementation: null, implementationCodeHash: null, mechanism: 'unknown', onchainEnforced: false } }, official: { adapterStatus: 'unknown', listingView: { listingId: '1', seller, collection, tokenId: '3204', price: '10100', feeBps: 100, valid: true }, listingFor: { listingId: '1', seller, price: '10100', valid: true } } };
for (const [name, value] of [['seaport-order.example', seaport], ['official-order.example', official]] as const) await writeFile(resolve(ROOT, `fixtures/${name}.json`), JSON.stringify(parseOrderEnvelope(value), null, 2) + '\n');
await writeFile(resolve(ROOT, 'schemas/order-envelope-v1.schema.json'), JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'urn:tapeout:groupbuy:order-envelope:1', title: 'OrderEnvelope v1', description: 'Strict structural contract. SDK additionally verifies integer bounds, cross-field identity, domain/hash/payment commitments and supported protocol subset. Examples are synthetic; unknown identity never enables execution.', ...schema(orderEnvelopeSchema) }, null, 2) + '\n');
