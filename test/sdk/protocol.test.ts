import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { keccak256, zeroAddress, zeroHash } from 'viem';
import { ROOT, buildLocalMockTerms, checkProtocol, HttpOrderSource, parseOrderEnvelope, vaultObservation, type OrderEnvelope } from '../../sdk/index.js';
async function fixture() {
  const e = JSON.parse(await readFile(resolve(ROOT, 'fixtures/seaport-order.example.json'), 'utf8'));
  e.validation.status = 'verified'; e.identity.status = 'verified'; e.identity.marketCodeHash = keccak256('0x6000'); e.identity.collectionCodeHash = keccak256('0x6000');
  return parseOrderEnvelope(e) as Extract<OrderEnvelope,{protocol:'seaport'}>;
}
function client(e: Extract<OrderEnvelope,{protocol:'seaport'}>, overrides: Record<string, unknown> = {}) {
  return { getChainId: async () => 56, getBlock: async () => ({ number: 100n, hash: `0x${'ab'.repeat(32)}`, timestamp: 1800000000n }), getCode: async () => '0x6000',
    readContract: async ({ functionName }: {functionName:string}) => functionName in overrides ? overrides[functionName] : ({ information: ['1.6', e.seaport.domain.domainSeparator, zeroAddress], getOrderStatus: [true, false, 0n, 0n], getCounter: 0n, ownerOf: e.seller, getApproved: e.market, isApprovedForAll: false } as Record<string, unknown>)[functionName] };
}
test('Seaport initial 0/0 is not filled and single-token approval suffices', async () => {
  const e = await fixture(), result = await checkProtocol(client(e) as never, e);
  assert.equal(result.executable, true); assert.equal(result.permanentInvalid, false);
});
test('cancel, counter increment and fully filled are permanent; approval loss remains temporary', async () => {
  const e = await fixture();
  for (const override of [{ getOrderStatus: [true, true, 0n, 0n] }, { getCounter: 1n }, { getOrderStatus: [true, false, 1n, 1n] }]) {
    const r = await checkProtocol(client(e, override) as never, e); assert.equal(r.executable, false); assert.equal(r.permanentInvalid, true);
  }
  const r = await checkProtocol(client(e, { getApproved: zeroAddress, isApprovedForAll: false }) as never, e);
  assert.equal(r.executable, false); assert.equal(r.permanentInvalid, false);
});
test('unsigned unvalidated order and domain mismatch cannot pass protocol check', async () => {
  const e = await fixture();
  assert.equal((await checkProtocol(client(e, { getOrderStatus: [false, false, 0n, 0n] }) as never, e)).executable, false);
  assert.equal((await checkProtocol(client(e, { information: ['1.5', zeroHash, zeroAddress] }) as never, e)).executable, false);
});
test('official unknown remains disabled without even probing a guessed ABI', async () => {
  const e = parseOrderEnvelope(JSON.parse(await readFile(resolve(ROOT, 'fixtures/official-order.example.json'), 'utf8')));
  const r = await checkProtocol(new Proxy({}, { get() { throw new Error('No RPC should occur'); } }) as never, e);
  assert.equal(r.status, 'UNKNOWN_DISABLED'); assert.equal(r.executable, false); assert.equal(r.permanentInvalid, false);
});
test('local Mock terms are explicitly isolated from fork/live and reserved official', () => {
  const a = '0x1111111111111111111111111111111111111111';
  const c = { chainId: '56', templateVersion: 1, marketKind: 2 as const, market: a, collection: a, mining: a, bem: a, marketCodeHash: zeroHash, seaportDomainSeparator: zeroHash, seaportVersionHash: zeroHash, safetyMargin: '0', mockOnly: true };
  const terms = { scope: 'LOCAL_MOCK_ONLY', seller: a, tokenId: '1', totalPrice: '101', deadline: '2000000000', listingId: '1', feeBps: 100, name: 'test', metadataURI: '' };
  const request = buildLocalMockTerms(terms, c, 'mock', 56); assert.equal(request.payload, '0x'); assert.equal(request.terms.listingPrice, 101n);
  for (const mode of ['fork', 'live']) assert.throws(() => buildLocalMockTerms(terms, c, mode, 56));
  assert.throws(() => buildLocalMockTerms(terms, { ...c, marketKind: 1 }, 'mock', 56));
  assert.throws(() => buildLocalMockTerms(terms, { ...c, mockOnly: false }, 'mock', 56));
});
test('HTTP source sends only explicit read and disables redirects', async () => {
  const e = await fixture(), saved = globalThis.fetch; let observed: RequestInit | undefined;
  try {
    globalThis.fetch = async (_input, init) => { observed = init; return new Response(JSON.stringify(e), { status: 200, headers: { 'content-type': 'application/json' } }); };
    const endpoint = { path: '/read-quote', method: 'POST' as const, operation: 'read-quote' as const };
    const result = await new HttpOrderSource('http://localhost:3100', endpoint, [endpoint], { orderHash: e.orderHash }).load();
    assert.equal(result.protocol, 'seaport'); assert.equal(observed?.redirect, 'error'); assert.equal(observed?.method, 'POST');
  } finally { globalThis.fetch = saved; }
});
test('optional external balance/NFT observations cannot block direct emergency/refund paths', async () => {
  const a = '0x1111111111111111111111111111111111111111';
  const stub = { getBlock: async () => ({ hash: zeroHash }), getBalance: async () => 5n,
    readContract: async ({ functionName }: { functionName:string }) => {
      if (['balanceOf', 'ownerOf'].includes(functionName)) throw new Error('Broken external token');
      return ({ getConfig: { collection: a, bem: a }, getTerms: { tokenId: 1n }, state: 2, redeemedBeneficiary: zeroAddress } as Record<string,unknown>)[functionName] ?? 0n;
    } };
  const result = await vaultObservation(stub as never, a, a, 10n);
  assert.equal(result.bemObservationStatus, 'UNKNOWN_READ_FAILED'); assert.equal(result.nftObservationStatus, 'UNKNOWN_READ_FAILED');
  assert.equal(result.vaultBem, null); assert.equal(result.nftOwner, null);
});
