import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, parseAbi, type AbiEvent, type Address, type Hex, type TransactionReceipt } from 'viem';
import { checkReceiptPostconditions, loadArtifact } from '../../sdk/index.js';
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as Address;
const vault = addr(1), actor = addr(2), recipient = addr(3), bem = addr(4), nft = addr(5);
const hash = `0x${'aa'.repeat(32)}` as Hex, tx = `0x${'bb'.repeat(32)}` as Hex;
const { abi } = await loadArtifact('GroupBuyVault');
function event(name: string, args: Record<string, unknown>, address = vault) {
  const definition = (name === 'Transfer' ? parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']) : abi).find(item => item.type === 'event' && item.name === name) as AbiEvent;
  return { address, topics: encodeEventTopics({ abi: [definition], eventName: name, args }), data: encodeAbiParameters(definition.inputs.filter(p => !p.indexed), definition.inputs.filter(p => !p.indexed).map(p => args[p.name!])), blockHash: hash, transactionHash: tx, blockNumber: 100n, transactionIndex: 0, logIndex: 0, removed: false };
}
function receipt(logs: ReturnType<typeof event>[]) { return { status: 'success', from: actor, to: vault, blockHash: hash, transactionHash: tx, blockNumber: 100n, logs: logs.map((log, i) => ({ ...log, logIndex: i })) } as unknown as TransactionReceipt; }
function client(withdraw = false) {
  return { getBalance: async () => 1n, getBlock: async () => ({ hash }), readContract: async ({ address, functionName }: { address: Address; functionName: string }) => {
    const values: Record<string, unknown> = { getConfig: { collection: nft, bem }, getTerms: { tokenId: 10n }, state: withdraw ? 0 : 2, soldCount: withdraw ? 0n : 100n, fundedWei: 0n, totalAccounted: 20n, totalPaid: 20n, accPerShare: 1n, remainder: 0n, redeemedBeneficiary: actor, ownerOf: vault, holderOf: recipient, costOf: 10n };
    return functionName === 'balanceOf' ? address === vault ? withdraw ? 0n : 1n : 0n : values[functionName];
  } } as never;
}
test('withdrawal postconditions bind exact recipient, principal and unique released IDs', async () => {
  const args = [[1n, 2n], recipient], logs = [event('Withdrawn', { participant: actor, recipient, ids: [1n, 2n], principal: 20n }), event('IdReleased', { id: 1n, participant: actor }), event('IdReleased', { id: 2n, participant: actor })];
  assert.equal((await checkReceiptPostconditions(client(true), 'withdraw', vault, actor, args, receipt(logs))).verified, true);
  for (const bad of [{ recipient: actor, principal: 20n }, { recipient, principal: 19n }]) {
    const r = await checkReceiptPostconditions(client(true), 'withdraw', vault, actor, args, receipt([event('Withdrawn', { participant: actor, ids: [1n, 2n], ...bad }), ...logs.slice(1)]));
    assert.equal(r.checks.withdrawalEvent, false);
  }
  assert.equal((await checkReceiptPostconditions(client(true), 'withdraw', vault, actor, args, receipt([logs[0], logs[1], logs[1]]))).checks.idsReleased, false);
});
test('claim postconditions reject repeated claim IDs, unexpected recipient and noncanonical receipts', async () => {
  const claims = [event('RewardClaimed', { holder: actor, id: 1n, amount: 10n }), event('RewardClaimed', { holder: actor, id: 2n, amount: 10n })], payment = event('Transfer', { from: vault, to: actor, value: 20n }, bem);
  assert.equal((await checkReceiptPostconditions(client(), 'claim-batch', vault, actor, [[1n, 2n]], receipt([...claims, payment]))).verified, true);
  assert.equal((await checkReceiptPostconditions(client(), 'claim-batch', vault, actor, [[1n, 2n]], receipt([claims[0], claims[0], payment]))).checks.exactClaims, false);
  assert.equal((await checkReceiptPostconditions(client(), 'claim-batch', vault, actor, [[1n, 2n]], receipt([...claims, event('Transfer', { from: vault, to: recipient, value: 20n }, bem)]))).checks.noUnexpectedPayment, false);
  const removed = receipt([...claims, payment]); removed.logs[0].removed = true;
  assert.equal((await checkReceiptPostconditions(client(), 'claim-batch', vault, actor, [[1n, 2n]], removed)).checks.receiptLogsCanonical, false);
});
test('single-ID batch transfer accepts real TransferSingle and rejects different operator', async () => {
  const transfer = (operator: Address) => receipt([event('TransferSingle', { operator, from: actor, to: recipient, id: 1n, value: 1n })]);
  const args = [actor, recipient, [1n], [1n], '0x'];
  assert.equal((await checkReceiptPostconditions(client(), 'transfer-shares', vault, actor, args, transfer(actor))).verified, true);
  assert.equal((await checkReceiptPostconditions(client(), 'transfer-shares', vault, actor, args, transfer(recipient))).checks.exactShareMovement, false);
});
