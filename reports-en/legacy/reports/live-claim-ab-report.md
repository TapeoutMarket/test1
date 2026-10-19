# A / B Cumulative Claims Comparison Report

Status: **VERIFIED_EQUAL_CUMULATIVE**. Network: BSC chain 56; BEM decimals: 8. Cumulative amounts here mean only BEM paid by this Vault to A / B since its creation, not total wallet balances, and do not subtract BNB gas.

Vault: `0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`; miner ID 3204.
A (ID 1): `0x1b55E6A757987576E1a130A011f9E12498De7DB9`; B (ID 2): `0x63979C9d5200A5080be93eb440D469d2F2ec6682`.
Pre-round baseline: block 125607064, hash `0x8f877f02b69a0538758daa238f90d60a07a499ed2bcd073e8eee3a7dd6be6f6a`, 2026/10/4 11:48:55 (Asia/Shanghai).

## Claimed amounts (BEM)

| Address / share | Claimed ledger before round | Actual claim this round | Cumulative actual payments since creation | Still claimable at round end |
| --- | ---: | ---: | ---: | ---: |
| A / ID 1 | 0.00042458 | 0.00235178 | 0.00277636 | 0 |
| B / ID 2 | 0 | 0.00277636 | 0.00277636 | 0 |

| Observation | Block | Mining pending BEM | Cumulative accounted receipts BEM | Cumulative entitlement per share BEM | Vault BEM balance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pre-round baseline | 125607064 | 0.00294041 | 0.00084916 | 0.00042458 | 0.00042458 |
| End of block before A transaction | 125643419 | 0.00469993 | 0.00084916 | 0.00042458 | 0.00042458 |
| End of A transaction's block | 125643420 | 0 | 0.00555273 | 0.00277636 | 0.00277637 |
| End of block before B transaction | 125643526 | 0 | 0.00555273 | 0.00277636 | 0.00277637 |
| End of B transaction's block | 125643527 | 0 | 0.00555273 | 0.00277636 | 0.00000001 |

BEM transferred into the Vault within A's transaction this round: **0.00470357 BEM**; amount accounted by Harvested: 0.00470357 BEM. Inflow within B's transaction: 0 BEM.

The previous block is a fixed-block observation, not pending at the instant of transaction execution. Actual inflow comes from BEM Transfer events; Harvested may also include earlier unsynchronized receipts. Neither pending nor Harvested can automatically be treated as this transaction's Mining payment.

## Transactions and conclusions

- [A claim transaction](https://bscscan.com/tx/0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690), block 125643420, index 95, gas 0.0000091622 BNB.
- [B claim transaction](https://bscscan.com/tx/0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18), block 125643527, index 72, gas 0.0000051426 BNB.
- Historical scan: deployment block 125537081 through 125643527, Vault RewardClaimed and BEM Transfer(from=Vault); checked per transaction and recipient, and reconciled with claimed(1/2) and totalPaid.
- Cumulative A − B: 0 BEM.
- Verification passed: against the same received reward batch, A's and B's cumulative actual claims since creation are equal.
- Allocation remainder: 0.00000001 BEM.
- Checks: `{"aExactCall":true,"bExactCall":true,"receiptsMatch":true,"receiptActorsMatch":true,"afterBaseline":true,"aBeforeB":true,"aReceiptVerified":true,"bReceiptVerified":true,"sameReceiptCutoff":true,"sameSnapshotCutoff":true,"cumulativeShareClaimsEqual":true,"bothSharesSettled":true,"holdersMatch":true,"minerStillActive":true,"paidMatchesClaims":true,"receivedConserved":true,"onlyDustRemains":true,"historyValid":true,"id1HistoryMatchesLedger":true,"id2HistoryMatchesLedger":true,"aWalletPaymentsMatchId1":true,"bWalletPaymentsMatchId2":true,"allClaimsMatchTotalPaid":true,"allTransfersMatchTotalPaid":true,"cumulativeWalletPaymentsEqual":true,"aRoundReconcilesBaseline":true,"bRoundReconcilesBaseline":true}`.

## Actual payments since deployment

| Block | Recipient | BEM paid | Transaction |
| --- | --- | ---: | --- |
| 125545984 | A | 0.00042458 | [0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a](https://bscscan.com/tx/0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a) |
| 125643420 | A | 0.00235178 | [0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690](https://bscscan.com/tx/0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690) |
| 125643527 | B | 0.00277636 | [0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18](https://bscscan.com/tx/0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18) |

## Comparison basis

These two transactions are not atomic and need not be in the same block. Before this round, A had claimed 0.00042458 BEM more than B, so B should recover that historical difference at the same receipt cutoff. “Equal amounts this round” cannot replace “equal cumulative amounts.”

Growth in Mining pending does not enter the Vault automatically. If actual BEM arrives between the two transactions (another harvest, third-party claim, or transfer), B's ordinary claim also synchronizes that inflow. The comparison may then have a different cutoff and must be reviewed rather than forced to pass. A pending pre-read is not actual receipt.

If both transactions share a block, both snapshots show block-end state; their respective RewardsSynced and RewardClaimed / BEM Transfer events must distinguish execution. Claim order is checked by block and transactionIndex. Dust is retained in minimum units; the final Vault balance may contain one minimum unit.

Simulation evidence is separately saved in live-claim-ab-simulations.json. The two simulations execute independently; B's simulation did not use A's actual post-execution state and cannot represent the full mainnet flow. Final success depends solely on actual successful receipts, historical payments, and fixed-block ledgers. BEM event verification assumes ordinary, untaxed ERC-20 transfer semantics.
