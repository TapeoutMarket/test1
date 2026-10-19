# Round 5: NFT Consolidation and Full Miner / BEM Redemption Report

Status: **VERIFIED_FULL_REDEMPTION**. Read-only verification of already submitted transactions; no signing or broadcasting. Amounts are in BEM with 8 decimals; complete raw integers are retained in JSON.

## Subjects and result

- Network: BSC mainnet, chainId 56; Vault: `0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`.
- A: `0x1b55E6A757987576E1a130A011f9E12498De7DB9`; B: `0x63979C9d5200A5080be93eb440D469d2F2ec6682`; owner: `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`.
- Miner collection: `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C`; miner ID: 3204.
- Flow: B transfers reward NFT #2 to A. Holding both #1 and #2, A calls redeemMiner(), which harvests Mining, settles both unclaimed share entitlements and dust, burns both NFTs, and transfers the miner to A in the same transaction.
- End time: 2026/10/5 01:34:08 (Asia/Shanghai), block 125717060.

| Metric this round | BEM | Raw units |
| --- | ---: | ---: |
| Mining pending before redemption (previous block-end observation) | 0.00034903 | 34903 |
| Existing Vault balance before redemption | 0 | 0 |
| Actual inflow into Vault this time | 0.00035546 | 35546 |
| ID 1 settled to A | 0.00017773 | 17773 |
| ID 2 settled to A | 0.00017773 | 17773 |
| Dust separately paid to A | 0 | 0 |
| A actual Vault receipts this round | **0.00035546** | 35546 |
| B / owner Vault receipts this round | 0 / 0 | 0 / 0 |
| Final Vault balance | 0 | 0 |

Receipts use BEM Transfer(from=Vault,to=A); the two share entitlements use RewardClaimed. redeemMiner emitted no RemainderClaimed. Dust is cross-checked against the last RewardsSynced.remainder, separate BEM transfers, and the difference between inflow and share amounts. Historical Mining pending observations do not replace actual receipts in the transaction.

Coverage boundary: the Vault's existing balance before redemption was 0, so this round verifies full settlement in one transaction after actual new Mining inflow. It does not cover the mainnet scenario “nonzero pre-existing Vault balance + new Mining rewards cleared together.” Dust was 0 this round; no nonzero dust payment occurred on-chain. Reconciliation of nonzero dust events is covered only by offline synthetic tests.

## Miner, shares, and ledger

| Observation | Block | NFT #1 holder | NFT #2 holder | totalReceived | totalPaid | claimed(1) | claimed(2) | Vault balance |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Previous round settlement baseline | 125712665 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0x63979C9d5200A5080be93eb440D469d2F2ec6682 | 0.00875158 | 0.00875158 | 0.00437579 | 0.00437579 | 0 |
| End of block before transfer | 125716941 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0x63979C9d5200A5080be93eb440D469d2F2ec6682 | 0.00875158 | 0.00875158 | 0.00437579 | 0.00437579 | 0 |
| End of transfer's block | 125716942 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0.00875158 | 0.00875158 | 0.00437579 | 0.00437579 | 0 |
| End of block before redemption | 125717059 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0.00875158 | 0.00875158 | 0.00437579 | 0.00437579 | 0 |
| End of redemption's block | 125717060 | 0x0000000000000000000000000000000000000000 | 0x0000000000000000000000000000000000000000 | 0.00910704 | 0.00910704 | 0.00455352 | 0.00455352 | 0 |

Final miner ownerOf(3204): `0x1b55E6A757987576E1a130A011f9E12498De7DB9`; Vault state=2 (Closed), closeReason=1 (Redeemed), redeemedBeneficiary=`0x1b55E6A757987576E1a130A011f9E12498De7DB9`. The two supplies are 0 / 0; A's and B's balances of both shares are 0. Burning the reward NFTs does not clear claimed history.

## Cumulative reconciliation from deployment through redemption

| Measurement | Cumulative BEM |
| --- | ---: |
| NFT #1 claims by successive holders | 0.00455352 |
| NFT #2 claims by successive holders | 0.00455352 |
| Vault payments received by wallet A | 0.0036922 |
| Vault payments received by wallet B | 0.00437579 |
| Vault payments received by wallet owner | 0.00103905 |
| Dust not attributed to a single ID | 0 |
| All share claims + dust | 0.00910704 |

A claimed ID 2 this round, so “ID 2 cumulative” now differs from “wallet B cumulative.” A+owner wallet receipts can no longer stand in for ID 1 cumulative claims. Cumulative figures use the verified complete history from the previous round (deployment block 125537081 through 125712665) plus this round's complete event scan (125712666 through 125717060). This execution did not rescan every log before the previous cutoff. The prior report status, checks, ledger, and historical amounts were revalidated, along with the baseline block hash.

External Mining pending at the redemption-end block was 0 BEM. The miner then belonged to A; this observation concerns the miner after exit and no longer constitutes Vault share entitlement.

## Transactions and check evidence

- [transfer](https://bscscan.com/tx/0x189b173121d493d303f21f0487d0655fc87098788a0646924c6ed7dc796fd383): block 125716942; status success; actual gas fee 0.0000032527 BNB; block hash `0xa3a4f60286ce86c172cce4e6ecaf7501e74e253bbc2eddfcb293ea2107660219`.
- [redeem](https://bscscan.com/tx/0xf9f3825bcdc4ae1c4397479a4c77a16492ce38f230b930655a8c1cffc1657e17): block 125717060; status success; actual gas fee 0.0000110884 BNB; block hash `0x80ae5a7f8984572c218a79e2ebedd8a136ec7d7c2daac8fc759214ea34ebc5e4`.

The two transactions are in different blocks. All snapshots are fixed block-end states. Every Vault event and BEM inflow/outflow from the block after baseline through redemption was scanned to exclude unspecified accounting activity this round. Every snapshot block hash was rechecked. Claim events, the miner ERC-721 Transfer, two ERC-1155 burns, state, and supply corroborate one another.

Passed 59/59 checks. Every verification check passed.

```json
{
  "transferExactCallAndOriginalReceipt": true,
  "redemptionExactCallAndOriginalReceipt": true,
  "distinctTransactions": true,
  "transferAfterBaseline": true,
  "transferBeforeRedemptionDifferentBlocks": true,
  "onlyOneExactBToAShare2": true,
  "transferHasNoOtherVaultEvent": true,
  "transferHasNoVaultBEMMovement": true,
  "transferDoesNotMoveMiner": true,
  "oneAHarvest": true,
  "positiveInflowMatchesHarvest": true,
  "twoSyncsSameCutoff": true,
  "bothShareClaimEventsToA": true,
  "onlyAReceivesVaultPayment": true,
  "dustMatchesSyncRemainder": true,
  "aggregateAndDustTransfersMatch": true,
  "twoExactShareBurns": true,
  "exactMinerTransferToA": true,
  "oneRedeemedClosureToA": true,
  "onlyRedemptionVaultEvents": true,
  "allReceiptLogsCanonical": true,
  "ledgerUnchangedSinceBaseline": true,
  "transferPreservesEntireLedger": true,
  "noInterveningAccountingBeforeRedemption": true,
  "beforeTransferSharesMatch": true,
  "consolidatedBothSharesAtA": true,
  "activeCustodyUntilRedemption": true,
  "receivedIncreasesByActualInflow": true,
  "paidIncreasesByActualAPayment": true,
  "claim1HistoryPreserved": true,
  "claim2HistoryPreserved": true,
  "finalClaimsAndAccumulatorMatch": true,
  "syncMatchesFinalAccounting": true,
  "accumulatorIncludesCarry": true,
  "dustMatchesCarry": true,
  "fullBalanceAndInflowPaidToA": true,
  "finalVaultClosedRedeemedToA": true,
  "noSharesOrSupplyRemain": true,
  "finalNoClaimableOrRemainder": true,
  "finalReceivedFullyPaid": true,
  "noOtherVaultTransactionsInRound": true,
  "allVaultLogsDecode": true,
  "onlyExpectedRoundVaultEvents": true,
  "allInflowOnlyRedemption": true,
  "allPaymentsOnlyRedemptionToA": true,
  "scopedLogsMatchReceiptCounts": true,
  "allRoundLogsCanonical": true,
  "priorReportAndChecksVerified": true,
  "priorHistoryCutoffMatchesBaseline": true,
  "priorClaimEventsMatchBaseline": true,
  "priorTransfersMatchBaselinePaid": true,
  "priorHistoryHasNoDust": true,
  "historyClaimsMatchFinalLedger": true,
  "historyTransfersMatchFinalPaid": true,
  "knownWalletsReconcileAllPayments": true,
  "shareClaimsPlusSeparateDustMatchPaid": true,
  "transferReceiptBlockMatches": true,
  "redemptionReceiptBlockMatches": true,
  "allSnapshotsStillCanonical": true
}
```

## Boundaries of the 100-share scenario

This deployed contract has only fixed IDs 1 and 2, and claimBatch accepts at most 2 entries. This mainnet round did not verify 100 shares. In a contract expanded to IDs 1–100, with one unit per ID and batch claiming, A can submit its 45 IDs in one claimBatch and B its 55 IDs in another, combining the unclaimed amounts of each address's IDs into one transaction each. To also harvest Mining, use the corresponding batch harvestAndClaim. The 100-share ledger and gas bounds must be implemented and verified, and the frontend should list actual held IDs; wallet balance counts do not automatically enumerate them. Each ID's historical claims must still be deducted separately. Payment cannot simply be the current pool balance multiplied by 45% or 55%.
