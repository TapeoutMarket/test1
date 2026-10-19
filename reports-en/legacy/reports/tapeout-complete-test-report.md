# TapeOut Miner Custody and Reward Distribution: Complete Test Report

Report date: October 5, 2026. Network: BSC mainnet, chainId 56.

**All four rounds of mainnet reward and entitlement-transfer tests passed.** The tests verified independent claims, preservation of historical unclaimed rewards, equal cumulative allocation from the same received batch, and continued claiming after NFT transfer for two kinds of unclaimed rewards. Vault deployment and miner deposit succeeded. The complete mainnet flow recorded 12 successful transactions, including 7 BEM payments.

This report consolidates deployment/deposit, four mainnet rounds, fixed-block authority simulations, and earlier local contract, CLI, and UI verification. Mainnet amounts use evidence through block **125712665**, corresponding to **2026-10-05 01:01:09 Beijing time**. This historical cutoff does not represent current on-chain balances.

At that block, the Vault had cumulatively received and paid **0.00875158 BEM**. Successive holders A and owner of share #1 had jointly claimed **0.00437579 BEM**; B of share #2 had cumulatively claimed **0.00437579 BEM**, with zero difference. The miner remained in the Vault, state Active.

## 1 Test subjects and measurement basis

### Contracts and accounts

| Subject | Address or identifier |
| --- | --- |
| Vault | 0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B |
| Miner collection | 0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C |
| Custodied miner | ERC-721 #3204 |
| Mining | 0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46 |
| BEM | 0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a |
| owner / creator | 0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129 |
| Wallet A | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 |
| Wallet B | 0x63979C9d5200A5080be93eb440D469d2F2ec6682 |

The Vault issues ERC-1155 shares #1 and #2, one unit each, each with 50% reward entitlement. Initially A held #1 and B held #2. During testing #1 followed A → owner → A, while B continuously held #2. These share NFTs differ from the custodied ERC-721 miner #3204.

Mainnet BEM has 8 decimals: one minimum unit equals 0.00000001 BEM. All amounts are reconciled as raw integers and converted only for display. Cumulative receipts count only this Vault's payments, exclude other wallet income, and do not subtract gas paid in BNB.

### Reward accounting

Mining pending is reward income not yet harvested into the Vault. After harvest, new receipts are confirmed against actual BEM inflow events and the Vault ledger. harvestAndClaim first harvests, then pays claimable amounts for the caller's shares. An ordinary claim takes entitlement already in the Vault without harvesting Mining pending, but synchronizes actual receipts not yet accounted.

Under this Active state and ordinary ERC-20 semantics, new receipts plus previous dust are divided equally by 2. An indivisible minimum unit carries forward. Each ID's claimable amount equals its cumulative entitlement minus its cumulative claimed amount. Transfer changes the holder while preserving claimed history and unclaimed rights; “half the current Vault balance” cannot replace the per-share ledger.

## 2 Deployment, deposit, and mainnet overview

The deployment transaction created the Vault successfully at block **125537081**, with owner and initial A/B bindings matching configuration. Deposit succeeded at block **125539018**. The saved post-observation at block 125539021 showed miner #3204 ownerOf=Vault, state changed from AwaitingDeposit to Active, and A/B holding the shares. See transaction index T01/T02 in section 8.

### Four mainnet rounds

| Round | Objective | Verification result | Final block |
| --- | --- | --- | ---: |
| Round 1 | A claims alone; B's entitlement remains | Passed | 125545984 |
| Round 2 | A/B settle one received batch with equal cumulative claims | Passed | 125643527 |
| Round 3 | owner continues to claim Mining rewards after A transfers | Passed | 125686606 |
| Round 4 | owner transfers received-but-unclaimed entitlement back to A with #1 | Passed | 125712665 |

### Actual new receipts and payments

All amounts below are BEM. Pending is the reading at the end of the block before the harvest transaction; these readings cannot be summed as actual income.

| Round | Pending before harvest | Actual new receipts | Paid to A | Paid to owner | Paid to B |
| --- | ---: | ---: | ---: | ---: | ---: |
| Round 1 | 0.00083930 | 0.00084916 | 0.00042458 | 0 | 0 |
| Round 2 | 0.00469993 | 0.00470357 | 0.00235178 | 0 | 0.00277636 |
| Round 3 | 0.00206523 | 0.00207810 | 0 | 0.00103905 | 0.00103905 |
| Round 4 | 0.00111528 | 0.00112075 | 0.00056038 | 0 | 0.00056038 |
| Total | Not applicable | **0.00875158** | **0.00333674** | **0.00103905** | **0.00437579** |

Round 1 paid only A's portion; B recovered the retained history in round 2. Round 4 payments totaled 0.00112076 BEM, exceeding new receipts by 0.00000001 BEM because the previous remainder also participated in allocation. Total receipts and payments across all four rounds are equal.

### Ledger at each round's end

| Round | #1 cumulative claimed | #2 cumulative claimed | #1 still claimable | #2 still claimable | Vault balance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Round 1 | 0.00042458 | 0 | 0 | 0.00042458 | 0.00042458 |
| Round 2 | 0.00277636 | 0.00277636 | 0 | 0 | 0.00000001 |
| Round 3 | 0.00381541 | 0.00381541 | 0 | 0 | 0.00000001 |
| Round 4 | 0.00437579 | 0.00437579 | 0 | 0 | 0 |

## 3 Four-round procedures and conclusions

### Round 1: A claims alone

Objective: verify that A's claim does not consume B's share, and record a baseline for subsequent comparisons.

Mining pending at fixed baseline block 125545165 was 0.00080680 BEM. A called harvestAndClaim([1]) at block 125545984. Pending in the previous block was 0.00083930 BEM; actual transaction inflow into the Vault was 0.00084916 BEM.

A received **0.00042458 BEM**; B received **0**. The Vault retained 0.00042458 BEM, entirely corresponding to #2's unclaimed entitlement; claimed(2) remained 0. A's payment event matched the BEM transfer, and the miner remained in the Vault. Conclusion: A-only claiming passed; B's unclaimed rewards were retained. Transaction T03.

### Round 2: A and B settle the same income batch

Objective: verify that B can later recover the entitlement left in round 1 and that both shares have equal cumulative claims since contract creation.

A harvested Mining and claimed #1 at block 125643420. B then ordinarily claimed #2 at block 125643527. A's transaction added 0.00470357 BEM; B's transaction did not harvest again or introduce new BEM inflow. Both settlements used the same cumulative-receipt cutoff.

A received **0.00235178 BEM** this round; B received **0.00277636 BEM**. B's additional 0.00042458 BEM was exactly the unclaimed portion retained from round 1. Both shares' cumulative claimed amounts became **0.00277636 BEM**, with both claimable amounts 0 and 0.00000001 BEM dust remaining in the Vault.

Conclusion: fair settlement of the same received reward batch does not require simultaneous transactions. The criterion is equal cumulative entitlement, not equal amounts in every transaction or round. Transactions T04/T05.

### Round 3: owner claims after A transfers out

Objective: verify that a new address can claim after receiving #1, the former holder loses claim authority, and claimed history is not reset.

A transferred #1 to owner at block 125686386. Mining pending in the preceding block was 0.00206523 BEM. At that time ID 1's Vault claimable amount was 0 and its historical claimed amount 0.00277636 BEM. Transfer made no BEM payment and changed no claimed ledger.

owner harvested and claimed #1 at block 125686477, with actual new receipts of 0.00207810 BEM. B then ordinarily claimed #2 at block 125686606. owner and B each received **0.00103905 BEM** this round; A received 0.

ID 1 cumulative payment = A's historical 0.00277636 + owner's 0.00103905 = **0.00381541 BEM**. ID 2 cumulative payment to B was also **0.00381541 BEM**. After transfer, A's fixed-block simulation of claiming #1 returned Unauthorized.

Conclusion: the new holder can continue claiming, with a continuous historical ledger. This round covered rewards not yet harvested from Mining. Because #1's pre-transfer Vault claimable amount was 0, transfer of positive received entitlement was separately verified in round 4. Transactions T06–T08.

### Round 4: received-but-unclaimed entitlement returns to A with the share

Objective: directly verify transfer of positive unclaimed rewards already received by the Vault with #1, followed by actual payment to the new holder.

owner only harvested at block 125709696, without claiming. Actual new receipts were 0.00112075 BEM. Including 0.00000001 BEM of prior dust, the Vault balance became 0.00112076 BEM; #1 and #2 were each claimable for **0.00056038 BEM**.

owner transferred #1 back to A at block 125712342. At the preceding block end and transfer block end, #1 remained claimable for **0.00056038 BEM**, and claimed(1) remained 0.00381541 BEM. The transfer receipt contained no accounting update or BEM payment.

A ordinarily claimed #1 at block 125712543 and received **0.00056038 BEM**. B ordinarily claimed #2 at block 125712665 and received the same amount. Both claims synchronized 0 new receipts and shared one cumulative-receipt cutoff. After transfer, owner's fixed-block simulation of claiming #1 returned Unauthorized.

Conclusion: positive received-but-unclaimed entitlement follows the NFT in full, the new holder successfully claims it, the former holder loses that share's claim authority, and historically claimed amounts are not paid again. Transactions T09–T12.

## 4 Authority changes and final reconciliation

### Fixed-block authority simulations

These are read-only eth_call results. No failed transactions were broadcast to test rejection.

| Check | Block | #1 holder | Simulated caller | Result |
| --- | ---: | --- | --- | --- |
| Before round 3 transfer | 125646568 | A | owner | Unauthorized |
| After round 3 transfer | 125686386 | owner | A | Unauthorized |
| Before round 4 transfer | 125706961 | owner | A | Unauthorized |
| After round 4 transfer | 125712342 | A | owner | Unauthorized |

Being owner alone does not confer BEM claim authority for shares not held. Normal and emergency miner recovery are separate authority paths and must not be confused with share reward claims.

### Asset state at cutoff

| Metric | Result |
| --- | --- |
| Cutoff block and Beijing time | 125712665; 2026-10-05 01:01:09 |
| Miner #3204 ownership and Vault state | Held by Vault; Active |
| Share #1 / #2 holders | A / B |
| totalReceived / totalPaid | 0.00875158 / 0.00875158 BEM |
| #1 / #2 cumulative claimed | 0.00437579 / 0.00437579 BEM |
| #1 / #2 received and claimable | 0 / 0 BEM |
| Vault balance / allocation remainder | 0 / 0 BEM |
| Mining pending not yet harvested | **0.00014315 BEM** |

Conservation: 0.00333674 (A) + 0.00103905 (owner) + 0.00437579 (B) = **0.00875158 BEM**. Cumulative receipts = cumulative payments + Vault balance, difference 0.

Per-share reconciliation: #1 payments to A + owner = **0.00437579 BEM**; #2 payments to B = **0.00437579 BEM**; difference 0. Reconciliation covers 7 RewardClaimed events and 7 matching BEM payments from deployment block 125537081 through 125712665.

This received batch has settled within the Vault, but the 0.00014315 BEM still in Mining is not yet harvested and is excluded from cumulative receipts/payments. It is incorrect to say that all rewards have been claimed.

## 5 Local engineering and simulation test summary

This section is counted separately from the four mainnet rounds. Historical engineering acceptance was recorded on 2026-10-03; supplementary entitlement Mocks on 2026-10-04. Statements in historical reports that mainnet execution had not yet occurred are supplemented by later mainnet results without changing their local acceptance scope.

| Verification category | Recorded result | Scope |
| --- | --- | --- |
| Full local contract suite | Historical report: 49 passed | 44 unit, exception, deterministic regression; 2 fuzz; 3 invariant |
| Scripts and frontend configuration | Historical report: 15 passed | Sending gates, RPC/fee bounds, error redaction, receipt replacement, UI configuration |
| Anvil workflow | 2 scenarios passed | Local chain 31337; transfer, settlement, consolidated redemption, emergency recovery under failures |
| Stepwise CLI | 12 passed | Local sending, read-only rehearsals, 2 expected rejection cases |
| Supplementary transfer-entitlement Mocks | 2 passed | Received entitlement follows ID; claimed remains intact; new holder inherits historical entitlement |
| TypeScript and UI build | Historical report passed | Local production build; not deployment acceptance |
| UI browser chain reads | Historical report passed | Read local Mock state and disabled reasons |
| Mainnet claim/transfer rehearsals | Successful dry-run records saved | No broadcast; not counted as successful transactions |

Rehearsals used the latest state at each invocation. Round 2 A/B simulations were independent; B's simulation does not represent A's post-execution state. Rehearsals are not fixed-block snapshots or sequential transaction verification.

Contract coverage includes: creator and fixed supply; valid/invalid deposits; equal allocation of historical/new income; independent claims and duplicate-payment prevention; transfer/authority checks; direct receipt synchronization; full-share redemption; owner's normal/emergency recovery; post-closure state; odd remainders; callback reentrancy; and atomic rollback on BEM payment/NFT transfer failure. Full test names are in the engineering-stage report.

Anvil scenario 1 checked allocation of historical 100 plus new 20, entitlement transfer, consolidation of both shares, the final 1 minimum unit, and atomic redemption. Scenario 2 checked emergency miner recovery under Mining/BEM failures, then claiming received entitlement after BEM recovery. Mock tokens use their own decimals, not mainnet BEM's 8 decimals.

The CLI's two exit-code-1 cases were expected rejections: --broadcast in Mock mode, and redemption without TTY confirmation. They were not failing tests. Normal redemption and owner's normal/emergency recovery in that record include dry-runs; all 12 cannot be called actual sends. Local workflows restored their snapshot and involved no live-chain transactions.

Later targeted regression session records also show 4 contract regressions, 17 entitlement-report tests, and 2 summary-report tests passed. These targeted runs may overlap existing cases and are not added to the historical 49 / 15 to invent a new “total case count.” Their complete per-test logs are not included in this report's on-disk evidence index.

## 6 Verification method and coverage boundaries

Mainnet verification checks transaction hash, success receipt, sender, target, function/arguments, block, and transaction index. Amounts reconcile Vault RewardClaimed / Harvested / RewardsSynced against BEM Transfer. Harvested and RewardsSynced may describe the same income and cannot be added twice. Cumulative payments are further reconciled against claimed(1/2), totalPaid, totalReceived, and Vault balance.

Reports save fixed-block snapshots and block hashes. Block-end snapshots differ from the exact instant of one transaction. Transfer-boundary checks also inspect transaction events, ledger continuity, and other intervening receipts. Round 4 additionally excluded new inflows after the initial harvest, ensuring both ordinary claims settled one batch.

Across the four rounds, “actual inflow minus pending at the end of the previous block” was 986, 364, 1287, and 547 minimum units. These are differences between observation boundaries. The specific protocol causes remain unverified and cannot uniformly be attributed to elapsed time; some adjacent blocks even have identical second-resolution timestamps. Allocation and conclusions use actual receipts, not pending estimates.

### Mainnet or interactive checks not yet completed

| Scenario | Evidence boundary |
| --- | --- |
| Owner normal miner recovery | Locally covered; not executed on mainnet in these rounds |
| Owner emergency miner recovery | Local failure scenario covered; not executed on mainnet in these rounds |
| Redeem miner after collecting both shares | Locally covered; not executed on mainnet in these rounds |
| Claims after closure and failure rollback | Locally covered; not executed on mainnet in these rounds |
| Real-protocol fixed-block fork | Historical record: not executed; entry-point rejection for missing parameters is not a pass |
| Complete UI wallet signing flow | Not executed; successful mainnet CLI does not replace browser-wallet acceptance |

“4/4 passed” refers only to the four executed mainnet reward scenarios. The subject remains TestMinerVault. Owner miner-recovery privileges, external protocol changes, and ordinary token balance/transfer semantics remain applicability conditions. These results are not a comprehensive security audit and do not classify unexecuted paths as mainnet passes.

## 7 Reusable baseline for further testing

Subsequent testing should start from the ledger at cutoff block 125712665: claimed(1) = claimed(2) = **437579**, accPerShare = **437579**, totalReceived = totalPaid = **875158**, remainder = **0**; all are raw BEM integers. A holds #1, B holds #2, and the miner remains in the Vault.

Before each continuation, read current chain state anew, record Mining pending, Vault balance, each share's claimed/claimable amounts, and save new receipts. To compare one income batch, fix the harvest cutoff first, then claim ordinarily for each address. If new actual receipts arrive in between, recheck the cutoff. Historical claimed amounts always persist; NFT transfer must not trigger recalculation and repayment of all historical income.

## 8 Complete mainnet transaction index

These are the 12 successful transactions for deployment, deposit, and the four rounds. Links point to BscScan, with full hashes retained for independent verification. Rehearsals and authority simulations are excluded.

| Number | Operation | Block | Actual BEM paid |
| --- | --- | ---: | ---: |
| T01 | Deploy Vault | 125537081 | Not applicable |
| T02 | Deposit miner #3204 | 125539018 | Not applicable |
| T03 | Round 1 A harvests and claims | 125545984 | A 0.00042458 |
| T04 | Round 2 A harvests and claims | 125643420 | A 0.00235178 |
| T05 | Round 2 B ordinary claim | 125643527 | B 0.00277636 |
| T06 | Round 3 A transfers #1 to owner | 125686386 | 0 |
| T07 | Round 3 owner harvests and claims | 125686477 | owner 0.00103905 |
| T08 | Round 3 B ordinary claim | 125686606 | B 0.00103905 |
| T09 | Round 4 owner harvests only | 125709696 | 0 |
| T10 | Round 4 owner transfers #1 to A | 125712342 | 0 |
| T11 | Round 4 A ordinary claim | 125712543 | A 0.00056038 |
| T12 | Round 4 B ordinary claim | 125712665 | B 0.00056038 |

T01 [0xba7d0aa006f85fbf09fc47ba5f1971ebcad0a857c828c4f367e0b75965b99e93](https://bscscan.com/tx/0xba7d0aa006f85fbf09fc47ba5f1971ebcad0a857c828c4f367e0b75965b99e93)

T02 [0x0d7e687bd86349c905e0ea311b83dd87b109f748b4905ec6bab576b21790998f](https://bscscan.com/tx/0x0d7e687bd86349c905e0ea311b83dd87b109f748b4905ec6bab576b21790998f)

T03 [0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a](https://bscscan.com/tx/0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a)

T04 [0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690](https://bscscan.com/tx/0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690)

T05 [0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18](https://bscscan.com/tx/0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18)

T06 [0xa4c188fc662453dd42b59117e0a8f2511861919cee1ac0faaa2b2ad63cc4ed40](https://bscscan.com/tx/0xa4c188fc662453dd42b59117e0a8f2511861919cee1ac0faaa2b2ad63cc4ed40)

T07 [0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f](https://bscscan.com/tx/0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f)

T08 [0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441](https://bscscan.com/tx/0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441)

T09 [0x670075f6c17e3adf9ad924aee89adfd9a838fad31df83291b024446d0a731cb4](https://bscscan.com/tx/0x670075f6c17e3adf9ad924aee89adfd9a838fad31df83291b024446d0a731cb4)

T10 [0xa0b5c00cd0a26e41c867204cd3a1a5a4fe013b7674fea9cf507513b9db5c6703](https://bscscan.com/tx/0xa0b5c00cd0a26e41c867204cd3a1a5a4fe013b7674fea9cf507513b9db5c6703)

T11 [0x0285a253d79c6e321283b4e5b701b39e0c2470a1243ae72453e4217e2a853b2f](https://bscscan.com/tx/0x0285a253d79c6e321283b4e5b701b39e0c2470a1243ae72453e4217e2a853b2f)

T12 [0xa67e3c33f46e1e93cf16b2c538b460664b1d08baefe8315fa082071d467394a9](https://bscscan.com/tx/0xa67e3c33f46e1e93cf16b2c538b460664b1d08baefe8315fa082071d467394a9)


## 9 Evidence files and traceability

This report's amounts and conclusions correspond to the following saved materials. Per-round JSON retains raw integers, blocks, hashes, and checks; Markdown provides readable round-by-round explanations. The four rounds passed 10, 27, 41, and 69 checks respectively. These overlap and are not summed as independent test cases.

| Material | File within project |
| --- | --- |
| Deployment/deposit records | reports/live-deploy-1791054236385.json; reports/live-deposit-1791055111304.json |
| Round 1 detailed report | reports/live-claim-a-report.md and matching .json |
| Round 2 detailed report | reports/live-claim-ab-report.md and matching .json |
| Round 3 detailed report | reports/live-transfer-claim-report.md and matching .json |
| Round 4 detailed report | reports/live-accrued-transfer-report.md and matching .json |
| Pre/post-transfer authority simulations | reports/live-transfer-claim-authority.json; reports/live-accrued-transfer-authority.json |
| Concise automatic summary | reports/live-reward-tests-summary.md and matching .json |
| Initial engineering acceptance | docs/TEST_REPORT.md |
| Local workflow and CLI | reports/local-smoke.json; reports/cli-smoke.json |
| Supplementary entitlement Mocks | reports/live-transfer-claim-local-validation.json |

Final cutoff block hash: 0x6dd23ea483fa2dad0c10ad56f378f3db1291fbf45da779ac8ba1f9d123d9aabb.

The four fixed baseline blocks are 125545165, 125607064, 125646568, and 125706961. Original baselines, reports archived by transaction, and successful rehearsals for each round are retained and are not overwritten by this consolidated report.
