import { parseAbi, parseEventLogs, type Address, type Hex, type PublicClient, type TransactionReceipt } from 'viem';
import { loadArtifact } from './contracts.js';
const tokenAbi = parseAbi(['function balanceOf(address) view returns(uint256)', 'event Transfer(address indexed from,address indexed to,uint256 value)']);
const nftAbi = parseAbi(['function ownerOf(uint256) view returns(address)']);
const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const sum = (values: unknown[]) => values.reduce<bigint>((total, n) => total + BigInt(n as bigint), 0n);
const sameIds = (actual: unknown[], expected: unknown[]) => actual.length === expected.length && actual.every((id, i) => BigInt(id as bigint) === BigInt(expected[i] as bigint));
export async function vaultObservation(client: PublicClient, vault: Address, actor: Address, blockNumber: bigint) {
  const { abi } = await loadArtifact('GroupBuyVault');
  const read = (functionName: string, args: unknown[] = []) => client.readContract({ address: vault, abi, functionName, args, blockNumber });
  const [config, terms, state, soldCount, fundedWei, totalAccounted, totalPaid, accPerShare, remainder, redeemedBeneficiary] = await Promise.all(['getConfig', 'getTerms', 'state', 'soldCount', 'fundedWei', 'totalAccounted', 'totalPaid', 'accPerShare', 'remainder', 'redeemedBeneficiary'].map(name => read(name)));
  const c = config as { collection: Address; bem: Address }, t = terms as { tokenId: bigint };
  const [nftOwner, vaultBem, actorBem, actorNative, block] = await Promise.all([
    client.readContract({ address: c.collection, abi: nftAbi, functionName: 'ownerOf', args: [t.tokenId], blockNumber }).catch(() => null),
    client.readContract({ address: c.bem, abi: tokenAbi, functionName: 'balanceOf', args: [vault], blockNumber }).catch(() => null),
    client.readContract({ address: c.bem, abi: tokenAbi, functionName: 'balanceOf', args: [actor], blockNumber }).catch(() => null),
    client.getBalance({ address: actor, blockNumber }), client.getBlock({ blockNumber }),
  ]);
  return { blockNumber, blockHash: block.hash, vault, actor, config, terms, state, soldCount, fundedWei, totalAccounted, totalPaid, accPerShare, remainder, redeemedBeneficiary, nftOwner, vaultBem, actorBem, actorNative, nftObservationStatus: nftOwner === null ? 'UNKNOWN_READ_FAILED' : 'READ_AT_PINNED_BLOCK', bemObservationStatus: vaultBem === null || actorBem === null ? 'UNKNOWN_READ_FAILED' : 'READ_AT_PINNED_BLOCK' };
}
export async function checkReceiptPostconditions(client: PublicClient, command: string, target: Address, actor: Address, args: unknown[], receipt: TransactionReceipt) {
  const factoryCommand = command === 'create-pool' || command === 'guardian-cancel';
  const { abi: eventAbi } = await loadArtifact(factoryCommand ? 'GroupBuyFactory' : 'GroupBuyVault');
  const events = parseEventLogs({ abi: eventAbi, logs: receipt.logs.filter(log => same(log.address, target)), strict: true });
  let vault = target;
  if (command === 'create-pool') {
    const created = events.filter(e => e.eventName === 'PoolCreated');
    if (created.length !== 1) throw new Error('Receipt did not contain exactly one PoolCreated');
    const fields = created[0].args as unknown as { vault: Address; creator: Address; template: Address; configHash: Hex };
    if (!same(fields.creator, actor) || !same(fields.template, args[0]) || !same(fields.configHash, args[1])) throw new Error('Receipt PoolCreated identity mismatch');
    vault = fields.vault;
  } else if (command === 'guardian-cancel') vault = args[0] as Address;
  const { abi } = await loadArtifact('GroupBuyVault');
  const read = (functionName: string, values: unknown[] = []) => client.readContract({ address: vault, abi, functionName, args: values, blockNumber: receipt.blockNumber });
  const observation = await vaultObservation(client, vault, actor, receipt.blockNumber);
  const vEvents = parseEventLogs({ abi, logs: receipt.logs.filter(log => same(log.address, vault)), strict: true });
  const byName = (name: string) => vEvents.filter(e => e.eventName === name);
  const checks: Record<string, boolean> = { successfulExactReceipt: receipt.status === 'success' && same(receipt.from, actor) && same(receipt.to, target), canonicalReceiptBlock: same(observation.blockHash, receipt.blockHash), receiptLogsCanonical: receipt.logs.every(log => log.removed !== true && same(log.transactionHash, receipt.transactionHash) && same(log.blockHash, receipt.blockHash)) };
  if (command === 'create-pool') checks.poolInitializedFunding = Number(observation.state) === 0 && Number(observation.soldCount) === 0 && BigInt(observation.fundedWei as bigint) === 0n;
  if (command === 'contribute') {
    const ids = args[0] as bigint[];
    checks.requestedIdsHeld = (await Promise.all(ids.map(id => read('balanceOf', [actor, id])))).every(n => n === 1n);
    const contributed = byName('Contributed')[0]?.args as {participant: Address; ids: bigint[]; principal: bigint} | undefined;
    const exactCost = sum(await Promise.all(ids.map(id => read('costOf', [id]))));
    checks.contributionEvent = byName('Contributed').length === 1 && !!contributed && same(contributed.participant, actor) && sameIds(contributed.ids, ids) && contributed.principal === exactCost;
    checks.noFullFundingLeftUnpurchased = !(Number(observation.state) === 0 && Number(observation.soldCount) === 100);
    checks.completedPoolOwnsMiner = Number(observation.state) !== 2 || same(observation.nftOwner, vault);
    checks.requireCompletionHonored = args[1] !== true || Number(observation.state) === 2;
  }
  if (command === 'withdraw') {
    const ids = args[0] as bigint[], withdrawn = byName('Withdrawn')[0]?.args as {participant: Address;recipient:Address;ids:bigint[];principal:bigint} | undefined;
    checks.idsBurned = (await Promise.all(ids.map(id => read('balanceOf', [actor, id])))).every(n => n === 0n);
    checks.withdrawalEvent = byName('Withdrawn').length === 1 && !!withdrawn && same(withdrawn.participant, actor) && same(withdrawn.recipient, args[1]) && sameIds(withdrawn.ids, ids) && withdrawn.principal === sum(await Promise.all(ids.map(id => read('costOf', [id]))));
    checks.idsReleased = sameIds(byName('IdReleased').map(log => (log.args as {id:bigint}).id), ids) && byName('IdReleased').every(log => same((log.args as {participant:Address}).participant, actor));
  }
  if (command === 'mark-refundable' || command === 'guardian-cancel') checks.refundable = Number(observation.state) === 3;
  if (command === 'transfer-shares') {
    const ids = args[2] as bigint[], transfers = [...byName('TransferSingle'), ...byName('TransferBatch')];
    const raw = transfers[0]?.args as {operator:Address;from:Address;to:Address;ids?:bigint[];values?:bigint[];id?:bigint;value?:bigint} | undefined;
    const movement = raw ? { ...raw, ids: raw.ids ?? [raw.id!], values: raw.values ?? [raw.value!] } : undefined;
    checks.exactShareMovement = transfers.length === 1 && !!movement && same(movement.operator, actor) && same(movement.from, args[0]) && same(movement.to, args[1]) && sameIds(movement.ids, ids) && movement.values.length === ids.length && movement.values.every(n => n === 1n);
    checks.transferredBalances = (await Promise.all(ids.map(id => read('balanceOf', [args[1], id])))).every(n => n === 1n);
    checks.transferredHolderIndex = (await Promise.all(ids.map(id => read('holderOf', [id])))).every(holder => same(holder, args[1]));
  }
  if (command === 'claim-batch' || command === 'harvest-and-claim') {
    const claims = byName('RewardClaimed'); const ids = args[0] as bigint[];
    const payments = parseEventLogs({ abi: tokenAbi, logs: receipt.logs.filter(log => same(log.address, (observation.config as {bem:Address}).bem)), strict: true }).filter(log => same(log.args.from, vault));
    checks.exactClaims = claims.length === ids.length && sameIds(claims.map(log => (log.args as {id:bigint}).id), ids) && claims.every(log => same((log.args as {holder:Address}).holder, actor));
    checks.claimEventsMatchPayments = sum(claims.map(log => (log.args as {amount:bigint}).amount)) === sum(payments.filter(log => same(log.args.to, actor)).map(log => log.args.value));
    checks.noUnexpectedPayment = payments.every(log => same(log.args.to, actor));
    checks.expectedHarvestScope = byName('Harvested').length === (command === 'claim-batch' ? 0 : 1);
  }
  if (command === 'claim-residual') {
    const residual = byName('ResidualClaimed'); const payments = parseEventLogs({ abi: tokenAbi, logs: receipt.logs.filter(log => same(log.address, (observation.config as {bem:Address}).bem)), strict: true }).filter(log => same(log.args.from, vault));
    checks.onlyRedeemedBeneficiary = Number(observation.state) === 4 && same(observation.redeemedBeneficiary, actor);
    checks.expectedResidualRecipient = residual.length === 1 && same((residual[0].args as {beneficiary:Address}).beneficiary, actor) && same((residual[0].args as {recipient:Address}).recipient, args[0]);
    checks.residualMatchesPayments = sum(residual.map(log => (log.args as {amount:bigint}).amount)) === sum(payments.filter(log => same(log.args.to, args[0])).map(log => log.args.value));
    checks.noUnexpectedResidualPayment = payments.every(log => same(log.args.to, args[0]));
  }
  if (command === 'harvest') { checks.oneHarvest = byName('Harvested').length === 1; checks.harvestDoesNotClaim = byName('RewardClaimed').length === 0; }
  if (command === 'redeem' || command === 'redeem-without-harvest') {
    const redeemed = byName('Redeemed')[0]?.args as {beneficiary:Address;harvested:boolean;paid:bigint;dust:bigint} | undefined;
    const payments = parseEventLogs({ abi: tokenAbi, logs: receipt.logs.filter(log => same(log.address, (observation.config as {bem:Address}).bem)), strict: true }).filter(log => same(log.args.from, vault));
    checks.redeemed = Number(observation.state) === 4; checks.beneficiaryRecorded = same(observation.redeemedBeneficiary, actor); checks.minerDelivered = same(observation.nftOwner, actor); checks.noLiveShares = Number(observation.soldCount) === 0;
    checks.redemptionEvent = byName('Redeemed').length === 1 && !!redeemed && same(redeemed.beneficiary, actor) && redeemed.harvested === (command === 'redeem');
    checks.redemptionPayment = !!redeemed && redeemed.paid === sum(payments.map(log => log.args.value)) && payments.every(log => same(log.args.to, actor));
    checks.expectedHarvestScope = byName('Harvested').length === (command === 'redeem' ? 1 : 0);
    if (command === 'redeem-without-harvest') checks.noPretendSettlement = !!redeemed && redeemed.paid === 0n && redeemed.dust === 0n && byName('RewardClaimed').length === 0;
  }
  return { checks, verified: Object.values(checks).every(Boolean), observation, events: vEvents.map(log => ({ eventName: log.eventName, args: log.args, logIndex: log.logIndex })), blockEndObservationNote: 'State reads are block-end observations. Receipt events identify this transaction; unrelated same-block wallet deltas are not attributed as this operation payment.' };
}
