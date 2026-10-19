# Transfer of Positive Received-but-Unclaimed Entitlement with ERC-1155: Mainnet Test Report

Status: **VERIFIED_ACCRUED_RIGHTS_TRANSFER** . BSC chain 56; Vault `0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`; miner #3204; BEM decimals: 8.

This round transfers ID 1 back from creator (`0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`) to A (`0x1b55E6A757987576E1a130A011f9E12498De7DB9`); B (`0x63979C9d5200A5080be93eb440D469d2F2ec6682`) holds ID 2. Fixed baseline: block 125706961, hash `0xcc2dddfaf5ae279b435fdaed56863c7dea077164028187541f3c28ed351c725b`, 2026/10/5 00:18:22 (Asia/Shanghai).

The first creator harvest() only brings Mining rewards into the Vault. ID 1 is then transferred, followed by ordinary claimBatch calls by A and B; neither claim may harvest again. This round specifically verifies positive unclaimed entitlement already received by the Vault before transfer. All simulations are fixed-block eth_call; the report script neither signs nor broadcasts.

## Receipts, claimable amounts, and actual payments (BEM)

| Metric | Amount |
| --- | ---: |
| Actual BEM inflow into Vault in first harvest | 0.00112075 |
| New receipts accounted by Harvested | 0.00112075 |
| ID 1 received but unclaimed before transfer | 0.00056038 |
| A actual claim this round | 0.00056038 |
| B actual claim this round | 0.00056038 |
| creator actual claim this round | 0 |
| A Vault receipts since creation | 0.00333674 |
| creator Vault receipts since creation | 0.00103905 |
| ID 1: historical payments to A + creator | 0.00437579 |
| ID 2: historical payments to B | 0.00437579 |

Cumulative payment difference ID 1 − ID 2: **0 BEM**. Baseline claimed(1) + payment to A this round = final claimed(1): 0.00381541 + 0.00056038 = 0.00437579. Prior paid debt is preserved.

## Fixed-block observations

| Observation | Block | Mining pending | totalReceived | Cumulative entitlement per share | Vault balance | ID 1 claimed | ID 1 claimable | ID 2 claimed | ID 2 claimable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fixed baseline | 125706961 | 0.00098682 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00381541 | 0 | 0.00381541 | 0 |
| End of block before harvest | 125709695 | 0.00111528 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00381541 | 0 | 0.00381541 | 0 |
| End of harvest's block | 125709696 | 0 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |
| End of block before transfer | 125712341 | 0.00011741 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |
| End of transfer's block | 125712342 | 0.00011741 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |
| End of block before A | 125712542 | 0.00013093 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |
| End of A's block | 125712543 | 0.00013093 | 0.00875158 | 0.00437579 | 0.00056038 | 0.00437579 | 0 | 0.00381541 | 0.00056038 |
| End of block before B | 125712664 | 0.00014315 | 0.00875158 | 0.00437579 | 0.00056038 | 0.00437579 | 0 | 0.00381541 | 0.00056038 |
| End of B's block | 125712665 | 0.00014315 | 0.00875158 | 0.00437579 | 0 | 0.00437579 | 0 | 0.00437579 | 0 |

All observations are block-end states and may include later transactions in the same block. The afterTransfer block-end balance must not be described as the balance at the instant of transfer. The transfer boundary is independently determined by the baseline, round-wide event scope verification, fixed harvest snapshot, and transfer receipt: claimable(1) before/after is 0.00056038 / 0.00056038 BEM, based on isolated harvest block + unchanged previous-block ledger + whole-round event scope + exact accounting-free TransferSingle receipt.

Mining pending may continue growing, but enters the Vault only when actually harvested. This round uses BEM Transfer(to=Vault) as the receipt basis. The final RewardsSynced of both ordinary claims must have the same cutoff and received=0. Any actual receipt beyond the first harvest requires review.

## Claim authority and verification

- Baseline simulation by A of claimBatch([1]): Unauthorized.
- Post-transfer simulation by creator of claimBatch([1]): Unauthorized.
- Baseline ERC-1155 balances A ID 1 / creator ID 1 / B ID 2: 0 / 1 / 1. Final: 1 / 0 / 1.
- Objective coverage: `{"vaultAccruedUnclaimedFollowsShare":"VERIFIED_ON_LIVE","aCannotClaimBeforeTransfer":"VERIFIED_BY_PINNED_ETH_CALL","creatorCannotClaimAfterTransfer":"VERIFIED_BY_PINNED_ETH_CALL","alreadyClaimedDebtPreserved":"VERIFIED_ON_LIVE","pendingAtBaseline":"98682","pendingAtFinal":"14315","actualHarvestInflow":"112075","claimable1BeforeTransfer":"56038"}`.
- Verification: `{"harvestExactCallAndReceipt":true,"transferExactCallAndReceipt":true,"aOrdinaryClaimExactCallAndReceipt":true,"bOrdinaryClaimExactCallAndReceipt":true,"fourDistinctTransactions":true,"harvestBeforeTransferInDifferentBlocks":true,"transferBeforeA":true,"aBeforeB":true,"harvestReceiptVerified":true,"baselineUnchangedBeforeHarvest":true,"positiveAccruedBeforeTransfer":true,"harvestedWithoutClaiming":true,"inflowMatchesReceivedDelta":true,"inflowMatchesBalanceDelta":true,"harvestCutoffMatchesSnapshot":true,"creatorHoldsFundedShare":true,"fundedMinerStillActive":true,"noOtherVaultTransactionsInRound":true,"allVaultRoundLogsDecode":true,"onlyExpectedVaultEventsInRound":true,"allRoundInflowOnlyFirstHarvest":true,"allRoundPaymentsOnlyOrdinaryClaims":true,"canonicalRoundLogs":true,"aUnauthorizedAtBaseline":true,"oneExactShareTransfer":true,"noBatchTransfer":true,"noAccountingEvents":true,"noVaultBEMMovementDuringTransfer":true,"aOrdinaryReceiptVerified":true,"bOrdinaryReceiptVerified":true,"sameReceiptCutoff":true,"creatorUnauthorizedAfterTransfer":true,"fundedLedgerUnchangedBeforeTransfer":true,"beforeTransferERC1155BalancesMatch":true,"afterTransferERC1155BalancesMatch":true,"finalERC1155BalancesMatch":true,"harvestAndClaimCutoffsMatch":true,"noExtraReceivedAfterFirstHarvest":true,"fullRoundReceivedMatchesActualInflow":true,"finalLedgerPreservesAccrual":true,"allHistoricalLogsCanonical":true,"transferBoundaryAvailable":true,"sameSnapshotCutoff":true,"cumulativeShareClaimsEqual":true,"bothSharesSettled":true,"holdersMatch":true,"minerStillActive":true,"paidMatchesClaims":true,"receivedConserved":true,"onlyDustRemains":true,"historyValid":true,"id1HistoryMatchesLedger":true,"id2HistoryMatchesLedger":true,"aPlusOwnerPaymentsMatchId1":true,"bPaymentsMatchId2":true,"allClaimsMatchTotalPaid":true,"allTransfersMatchTotalPaid":true,"cumulativeSharePaymentsEqual":true,"positiveAccruedTransferred":true,"transferPreservesEntireLedger":true,"aPaidExactTransferredAccrual":true,"id1ClaimedNotReset":true,"id2ClaimedContinuous":true,"noCreatorPaymentThisRound":true,"onlyExpectedAPaymentThisRound":true,"onlyExpectedBPaymentThisRound":true,"transferredHolderMatches":true,"boundaryERC1155BalancesMatch":true,"isolatedTransferSnapshotLedgerUnchanged":true}`.

Independent post-harvest check: **POSITIVE_ACCRUED_BALANCE_CONFIRMED**, limited to the harvest phase, block 125709696, ID 1 claimable 0.00056038 BEM. The full flow result is determined by this report's final status and all verification checks.

creator harvest rehearsal: `reports/live-accrued-transfer-simulation.json`, status DRY_RUN_SUCCEEDED_NO_TRANSACTION_SENT. Rehearsal observed pending 0.00096731 BEM and maximum estimated gas fee 0.00000865535 BNB. The rehearsal used latest reads rather than an atomic fixed-block snapshot and cannot replace the actual harvest receipt and positive-entitlement check.

- [harvest transaction](https://bscscan.com/tx/0x670075f6c17e3adf9ad924aee89adfd9a838fad31df83291b024446d0a731cb4): block 125709696, transaction index 73, gas 0.0000066801 BNB.
- [transfer transaction](https://bscscan.com/tx/0xa0b5c00cd0a26e41c867204cd3a1a5a4fe013b7674fea9cf507513b9db5c6703): block 125712342, transaction index 77, gas 0.0000032526 BNB.
- [a transaction](https://bscscan.com/tx/0x0285a253d79c6e321283b4e5b701b39e0c2470a1243ae72453e4217e2a853b2f): block 125712543, transaction index 35, gas 0.0000034319 BNB.
- [b transaction](https://bscscan.com/tx/0xa67e3c33f46e1e93cf16b2c538b460664b1d08baefe8315fa082071d467394a9): block 125712665, transaction index 84, gas 0.0000031926 BNB.

## Payments since deployment

Scanned deployment transaction `0xba7d0aa006f85fbf09fc47ba5f1971ebcad0a857c828c4f367e0b75965b99e93` block 125537081 through 125712665, at most 1000 blocks per batch. Reconciled RewardClaimed and BEM Transfer(from=Vault) by transaction and recipient.

| Block | Recipient | BEM paid | Transaction |
| --- | --- | ---: | --- |
| 125545984 | A | 0.00042458 | [0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a](https://bscscan.com/tx/0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a) |
| 125643420 | A | 0.00235178 | [0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690](https://bscscan.com/tx/0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690) |
| 125643527 | B | 0.00277636 | [0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18](https://bscscan.com/tx/0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18) |
| 125686477 | creator | 0.00103905 | [0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f](https://bscscan.com/tx/0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f) |
| 125686606 | B | 0.00103905 | [0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441](https://bscscan.com/tx/0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441) |
| 125712543 | A | 0.00056038 | [0x0285a253d79c6e321283b4e5b701b39e0c2470a1243ae72453e4217e2a853b2f](https://bscscan.com/tx/0x0285a253d79c6e321283b4e5b701b39e0c2470a1243ae72453e4217e2a853b2f) |
| 125712665 | B | 0.00056038 | [0xa67e3c33f46e1e93cf16b2c538b460664b1d08baefe8315fa082071d467394a9](https://bscscan.com/tx/0xa67e3c33f46e1e93cf16b2c538b460664b1d08baefe8315fa082071d467394a9) |

The final balance may contain only allocation dust of 0 or 1 minimum units; the miner must remain owned by the Vault and Active.

Original reports and this round's independent baseline are retained. Per-transaction BEM event reconciliation applies to the current ordinary untaxed ERC-20 transfer semantics. Total wallet balance changes and BNB gas are not evidence of Vault reward payments.
