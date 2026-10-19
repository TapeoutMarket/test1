# TapeOut Reward Claims and Entitlement Transfer Test Summary

Status: **ALL_FOUR_TESTS_VERIFIED**. On-chain verification completed for **4/4** tests. Network: BSC 56; Vault: `0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`; BEM decimals: 8.

This report combines the saved evidence pinned to fixed blocks from each round. Each round's “verified” status applies only to its cutoff block, not the current chain state. Preparation, simulation, local Mocks, and pending receipts do not count as mainnet passes.

## Results by round

| Test | Status | Baseline block | Final block | Individual report |
| --- | --- | ---: | ---: | --- |
| A claims alone; B retains unclaimed entitlement | On-chain verification passed | 125545165 | 125545984 | [Details](../../sources/legacy/reports/live-claim-a-report.md) |
| A and B settle against the same received reward batch | On-chain verification passed | 125607064 | 125643527 | [Details](../../sources/legacy/reports/live-claim-ab-report.md) |
| A → owner; unharvested Mining entitlement follows the share | On-chain verification passed | 125646568 | 125686606 | [Details](../../sources/legacy/reports/live-transfer-claim-report.md) |
| owner → A; received but unclaimed Vault entitlement follows the share | On-chain verification passed | 125706961 | 125712665 | [Details](../../sources/legacy/reports/live-accrued-transfer-report.md) |

## Actual payments (BEM)

| Test | A this round | owner this round | B this round | ID 1 cumulative | ID 2 cumulative |
| --- | ---: | ---: | ---: | ---: | ---: |
| A claims alone; B retains unclaimed entitlement | 0.00042458 | Claim not requested this round | 0 | 0.00042458 | 0 |
| A and B settle against the same received reward batch | 0.00235178 | Claim not requested this round | 0.00277636 | 0.00277636 | 0.00277636 |
| A → owner; unharvested Mining entitlement follows the share | 0 | 0.00103905 | 0.00103905 | 0.00381541 | 0.00381541 |
| owner → A; received but unclaimed Vault entitlement follows the share | 0.00056038 | Claim not requested this round | 0.00056038 | 0.00437579 | 0.00437579 |

Cumulative payments for ID 1 must include actual receipts by both successive holders, A and owner. Comparing only the current holder's wallet balance with B is invalid. Previously paid amounts remain in the ID 1 ledger and are not paid again upon transfer. B is the cumulative recipient for ID 2. All amounts are reconciled against Vault payment events and accounting; BNB gas is not BEM income.

## Coverage of the two kinds of unclaimed entitlement

- Rewards not yet harvested from Mining: round 3 verified that the new holder, owner, could harvest and claim them. Before that transfer, ID 1's Vault claimable amount was 0 BEM. Mainnet coverage of a positive unclaimed Vault balance requires separate evidence.
- Rewards already received by the Vault but not yet claimed: independently verified in round 4. Round 4 status is **VERIFIED_ACCRUED_RIGHTS_TRANSFER**; ID 1 was claimable for 0.00056038 BEM after harvest and for 0.00056038 BEM before transfer.
- Round 4 passed: the positive unclaimed Vault entitlement was preserved through owner → A, A received it with an ordinary claim, owner lost the right to claim ID 1, and the historical ledger was not reset.

## Round 4 execution and review

After fixing the baseline, four transactions were executed: creator harvests only → confirm claimable amount > 0 → creator transfers ID 1 back to A → A ordinarily claims ID 1 → B ordinarily claims ID 2. The post-harvest entitlement check is read-only and adds no transaction. Both holders used ordinary claims this round to avoid changing the settlement cutoff by harvesting Mining again.

Round 4 is complete. No further test transactions are needed. The saved four hashes can be supplied to the read-only report script for review.

The full procedure and checks are in the individual round 4 report. Once all four hashes are available, the report script checks every receipt, the positive entitlement before and after transfer, authority changes, and payment history since deployment, and automatically updates this summary.

The original individual reports and their fixed baselines are retained. This summary neither rewrites earlier evidence nor claims coverage of unexecuted scenarios.
