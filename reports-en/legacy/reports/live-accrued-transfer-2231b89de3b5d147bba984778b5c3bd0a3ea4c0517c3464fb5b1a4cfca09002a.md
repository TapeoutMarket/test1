# Transfer of Positive Received-but-Unclaimed Entitlement with ERC-1155: Mainnet Test Report

Status: **FUNDED_AWAITING_TRANSFER** . BSC chain 56; Vault `0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`; miner #3204; BEM decimals: 8.

This round transfers ID 1 back from creator (`0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`) to A (`0x1b55E6A757987576E1a130A011f9E12498De7DB9`); B (`0x63979C9d5200A5080be93eb440D469d2F2ec6682`) holds ID 2. Fixed baseline: block 125706961, hash `0xcc2dddfaf5ae279b435fdaed56863c7dea077164028187541f3c28ed351c725b`, 2026/10/5 00:18:22 (Asia/Shanghai).

The first creator harvest() only brings Mining rewards into the Vault. ID 1 is then transferred, followed by ordinary claimBatch calls by A and B; neither claim may harvest again. This round specifically verifies positive unclaimed entitlement already received by the Vault before transfer. All simulations are fixed-block eth_call; the report script neither signs nor broadcasts.

## Receipts, claimable amounts, and actual payments (BEM)

| Metric | Amount |
| --- | ---: |
| Actual BEM inflow into Vault in first harvest | 0.00112075 |
| New receipts accounted by Harvested | 0.00112075 |
| ID 1 received but unclaimed before transfer | 0.00056038 |
| A actual claim this round | Not executed / UNVERIFIED |
| B actual claim this round | Not executed / UNVERIFIED |
| creator actual claim this round | Not executed / UNVERIFIED |
| A Vault receipts since creation | Not executed / UNVERIFIED |
| creator Vault receipts since creation | Not executed / UNVERIFIED |
| ID 1: historical payments to A + creator | Not executed / UNVERIFIED |
| ID 2: historical payments to B | Not executed / UNVERIFIED |

The full four actual successful receipts are not yet available. Estimated amounts cannot be entered as actual claims, and the mainnet objective cannot be declared verified.

## Fixed-block observations

| Observation | Block | Mining pending | totalReceived | Cumulative entitlement per share | Vault balance | ID 1 claimed | ID 1 claimable | ID 2 claimed | ID 2 claimable |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Fixed baseline | 125706961 | 0.00098682 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00381541 | 0 | 0.00381541 | 0 |
| End of block before harvest | 125709695 | 0.00111528 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00381541 | 0 | 0.00381541 | 0 |
| End of harvest's block | 125709696 | 0 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |

All observations are block-end states and may include later transactions in the same block. The afterTransfer block-end balance must not be described as the balance at the instant of transfer. Independent transfer-boundary determination from baseline, round-wide event scope, fixed harvest snapshot, and transfer receipt: UNVERIFIED.

Mining pending may continue growing, but enters the Vault only when actually harvested. This round uses BEM Transfer(to=Vault) as the receipt basis. The final RewardsSynced of both ordinary claims must have the same cutoff and received=0. Any actual receipt beyond the first harvest requires review.

## Claim authority and verification

- Baseline simulation by A of claimBatch([1]): Unauthorized.
- Post-transfer simulation by creator of claimBatch([1]): UNVERIFIED.
- Baseline ERC-1155 balances A ID 1 / creator ID 1 / B ID 2: 0 / 1 / 1.
- Objective coverage: `{"vaultAccruedUnclaimedFollowsShare":"UNVERIFIED","aCannotClaimBeforeTransfer":"VERIFIED_BY_PINNED_ETH_CALL","creatorCannotClaimAfterTransfer":"UNVERIFIED","alreadyClaimedDebtPreserved":"UNVERIFIED","pendingAtBaseline":"98682","pendingAtFinal":null,"actualHarvestInflow":"112075","claimable1BeforeTransfer":"56038"}`.
- Verification: `{"harvestExactCallAndReceipt":true,"harvestReceiptVerified":true,"baselineUnchangedBeforeHarvest":true,"positiveAccruedBeforeTransfer":true,"harvestedWithoutClaiming":true,"inflowMatchesReceivedDelta":true,"inflowMatchesBalanceDelta":true,"harvestCutoffMatchesSnapshot":true,"creatorHoldsFundedShare":true,"fundedMinerStillActive":true,"noOtherVaultTransactionsInRound":true,"allVaultRoundLogsDecode":true,"onlyExpectedVaultEventsInRound":true,"allRoundInflowOnlyFirstHarvest":true,"allRoundPaymentsOnlyOrdinaryClaims":true,"canonicalRoundLogs":true,"aUnauthorizedAtBaseline":true}`.

Independent post-harvest check: **POSITIVE_ACCRUED_BALANCE_CONFIRMED**, limited to the harvest phase, block 125709696, ID 1 claimable 0.00056038 BEM. Harvest checks passed and share transfer may proceed as planned; the four-transaction flow is not yet complete.

creator harvest rehearsal: `reports/live-accrued-transfer-simulation.json`, status DRY_RUN_SUCCEEDED_NO_TRANSACTION_SENT. Rehearsal observed pending 0.00096731 BEM and maximum estimated gas fee 0.00000865535 BNB. The rehearsal used latest reads rather than an atomic fixed-block snapshot and cannot replace the actual harvest receipt and positive-entitlement check.

- [harvest transaction](https://bscscan.com/tx/0x670075f6c17e3adf9ad924aee89adfd9a838fad31df83291b024446d0a731cb4): block 125709696, transaction index 73, gas 0.0000066801 BNB.

## Read-only verification by phase

Save baseline: `node scripts/claim-accrued-transfer-report.mjs --mode live`.

After the first harvest-only transaction succeeds: `node scripts/claim-accrued-transfer-report.mjs --mode live --harvest-tx <H>`. Require FUNDED_AWAITING_TRANSFER, ID 1 claimable > 0, unchanged claimed, and no payment before proceeding to transfer.

After all four transactions succeed: `node scripts/claim-accrued-transfer-report.mjs --mode live --harvest-tx <H> --transfer-tx <T> --a-tx <A> --b-tx <B>`.

Original reports and this round's independent baseline are retained. Per-transaction BEM event reconciliation applies to the current ordinary untaxed ERC-20 transfer semantics. Total wallet balance changes and BNB gas are not evidence of Vault reward payments.
