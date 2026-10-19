# TapeOut GroupBuy Contracts: Real BSC State Local Fork Test Report

This round's result: **all 23 scenarios PASS, with 25 local fork transaction receipts obtained**. Real Seaport, miner NFT, Mining and BEM at the fixed BSC state completed purchase, custody, reward distribution, unclaimed-rights transfer, complete consolidation and exit. Mainnet transactions, market API writes and database writes were all 0.

These 25 include the guardian refund branch and normal redemption branch later removed by snapshot restoration. They must not be treated as continuous transactions on one final retained chain or queried as mainnet transaction hashes. Amounts in this report were read from the machine report and cross-checked using integers. There are also 2 fork receipts from an independent Mining settlement diagnostic; its snapshot was restored afterward, and these are excluded from the main flow's 25.

**This round found and fixed an actual compatibility issue: Mining.pending() may return 0 while claim() still settles positive rewards.** The old Vault called claim only when pending was nonzero and would miss this immediate settlement. Conclusions below apply only to the version rerun after removing that gate. The [first-pass historical report](../../../reports/real-bsc-fork-tests-first-pass.json) and [before-pending-fix historical report](../../../reports/real-bsc-fork-tests-before-pending-fix.json) are retained to trace the issue and must no longer serve as the current release conclusion.

## 1. Execution scope, roles and real state

- Execution time (Asia/Shanghai): 2026-10-19T20:46:52+08:00 to 2026-10-19T20:47:20+08:00.
- BSC chain ID: 56.
- Fixed source block: 128554249.
- Fixed source block hash: 0xe44fafd52f2b1da68b810514554c21061d327cccb046b6c8afdfb315a1ef991d.
- Execution network: Anvil fork only on local 127.0.0.1; the upstream real RPC supplies state through a read-only proxy.
- Miner: ERC-721 #3204; Vault reward certificates: ERC-1155 #1–100, quantity 1 per ID.
- BEM decimals: 8. All BEM values retain both raw smallest units and 8-decimal representations.
- Machine report: [real-bsc-fork-tests.json](../../../reports/real-bsc-fork-tests.json); separately saved order preflight: [real-fork-preflight.json](../../../reports/real-fork-preflight.json).

| Role | Address | Purpose in this round |
| --- | --- | --- |
| creator | 0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129 | Initiator; Timelock proposer/executor; test fee recipient |
| A | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | Initial miner owner/seller; subscribes #1–45; ultimately consolidates 100 shares and recovers the miner |
| B | 0x63979C9d5200A5080be93eb440D469d2F2ec6682 | Subscribes #46–100; Factory guardian; receives #1 and claims its unclaimed rewards |

The preparation helper read the user-authorized .env to obtain the RPC and derive/check public addresses; no keys or provider credentials were saved in reports. The test runner itself reads only public observation reports and the local manifest, **not .env or private keys**. This round used local Anvil impersonation without real private-key signatures. Each of the three addresses received a simulated 100 BNB, existing only on the fork.

| Real contract | Address |
| --- | --- |
| collection | 0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C |
| mining | 0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46 |
| bem | 0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a |
| market | 0x0000000000000068F116a894984e2DB1123eB395 |

Contract code and asset state above come from the fixed source block; Seaport information() returns version 1.6. This round did not substitute phase one's “local Seaport 1.5 + Mock assets” result for this verification and did not modify real NFT, Mining, BEM or Seaport code/storage.

## 2. Order, fees and local governance deployment

Miner seller price **0.3 BNB**, test fee **0.003 BNB**, total buyer payment **0.303 BNB**.

| Item | Raw wei | BNB |
| --- | ---: | ---: |
| Seller A receives | 300000000000000000 | 0.300000000000000000 |
| Test fee recipient creator | 3000000000000000 | 0.003000000000000000 |
| Total buyer payment | 303000000000000000 | 0.303000000000000000 |
| Subscription price per ID | 3030000000000000 | 0.003030000000000000 |

creator is the test fee recipient set in this order, not evidence of the real market fee configuration. A acts as both seller and partial subscriber to reuse the three specified test addresses; subscription principal and seller receipts are reconciled separately.

Order hash for this run: 0x157965afaffa5c5949ab133f9da4054d7607201aad675c29b81fc0f6370c3f2a.

Signature in the [fork order file for this run](../../../fixtures/fork-created-3204-157965afaffa5c59.json) is 0x. A called real Seaport.validate on the local fork, making the order valid on that fork. **This is not a signed order published on mainnet and was not published to a market API.**

| Component | Deployment address existing only on the local fork |
| --- | --- |
| template | 0x91dda15869d9a9261799ebfa1126cf9dfac0d43a |
| timelock | 0x02f453192530e07541e61b43da079273f410979b |
| factoryImplementation | 0xe45d94579425a6a2006d3e067c8d51de6b15c4fc |
| factory | 0x4c680b72d3561d7649e3df85e78fb588fcff9db1 |
| vault | 0x3059065Fc566A17d80AdDFcc2BD5f677AF300Acb |

Timelock proposer/executor is creator, and the separate guardian is B. Test delay is 1 second; scheduleBatch, local time advancement and executeBatch were actually executed. This is not production governance. Vault is a fixed-implementation ERC-1167 clone, with no asset-management owner and no upgradeability; Factory authority is separately checked through refund and rejection tests in ACTIVE.

## 3. Funding, withdrawal, guardian refund and actual purchase

A subscribes #1–45, totaling 0.136350000000000000 BNB. When A withdraws #1, returned principal is verified as 0.003030000000000000 BNB after accounting for gas. A subscribes the released ID again and returns to holding 45 shares.

A snapshot at this funding state separately tests guardian:

1. B calls Factory.guardianCancel(reason=3), moving Vault from FUNDING to REFUNDABLE.
2. B and creator attempt refunds for A in simulation only; both reject with NotHolder, with no unauthorized transactions sent.
3. A withdraws all 45 shares, with principal refund verified at 0.136350000000000000 BNB. Vault funding balance and effective share count become 0, and A still owns the miner.
4. The snapshot is restored to the 45-share funding state. The cancellation/refund branch is not a preceding fact of the subsequent purchase flow.

B then subscribes #46–100 for 0.166650000000000000 BNB. Crediting the 100th share triggers an actual Seaport fill in the same transaction:

- Miner #3204 ownership changes to local Vault, and state becomes ACTIVE.
- A actually receives 300000000000000000 wei, or 0.300000000000000000 BNB.
- creator actually receives 3000000000000000 wei, or 0.003000000000000000 BNB.
- After ACTIVE, B attempts guardianCancel again in simulation only and is rejected with InvalidState.

These checks support this round's permission conclusion: guardian can terminate uncompleted funding and enable holder refunds, but cannot collect participants' principal or control a purchased miner through this entry point.

## 4. Pending gate issue, minimal fix and first real receipt

### 4.1 Discovery, reproduction and fix

The initial full flow could pass because its second-harvest check required only a positive Vault balance, which old remainder could satisfy. Separate diagnostics against real Mining then found that pending was 0 after time advancement while a direct claim still produced positive BEM; the assumption that “pending=0 means no claimable rewards” is therefore false.

The archived diagnostic [test-real-mining-settlement.mjs](../../../scripts/test-real-mining-settlement.mjs) reproduced this in a fresh local snapshot of the same fixed source state. Report: [real-mining-settlement](../../../reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json), executed from 2026-10-19T20:46:36+08:00 to 2026-10-19T20:46:46+08:00:

| Diagnostic operation | Pending before, raw | Actual BEM increment, raw | Local transaction hash |
| --- | --- | --- | --- |
| first-claim | 13532613 | 13533051 | 0x72fecb1f622b9e5f8fbcb3cb9d365e5d178110346196b3fe5aafa1c2856f6135 |
| second-claim-after-3600-seconds | 0 | 37601 | 0x0c08fd994c6ad53949f04bacf5f5d8c24321b9dce39590f17f919faf99c9066f |

Immediately after the first claim, a repeated eth_call at its exact block 128554250 had pending=0 and returned SUCCESS, 0x; this is read-only simulation, not a transaction. Local time then advanced 3,600 seconds, and pending before the second transaction remained 0, yet actual receipt was 37,601 raw (0.00037601 BEM), with balance increment matching net Transfer events. Impersonation was stopped and the original snapshot restored after diagnosis, and the original state was verified again.

The minimal change to [GroupBuyVault.sol](../../../src/GroupBuyVault.sol) is that _harvest no longer uses pending() != 0 to decide whether to call Mining.claim. It calls claim with the miner key and continues accounting only for BEM actually received by Vault. Mining call failures still propagate; errors are not swallowed and rewards not received are not credited. claimBatch still claims only accounted Vault rights without calling Mining; redeemWithoutHarvest retains the exit path that bypasses Mining/BEM dependencies.

The following 5 local unit tests were added as Mock behavior regressions, separate from this section's real fork evidence:

| Test | Verification |
| --- | --- |
| testHarvestSettlesNewRewardsWhenCachedPendingIsZero | After the first claim pending=0, a second harvest still receives and allocates new unsettled rewards |
| testHarvestAndClaimPaysRewardsNotReportedByPending | Rewards at pending=0 can be accounted and claimed through harvestAndClaim while preserving other IDs' rights |
| testNormalRedeemSettlesRewardsNotReportedByPending | Normal redemption settles rewards absent from pending, pays the full balance and burns shares |
| testHarvestPropagatesZeroRewardAndMiningFailures | Zero-reward rejection or Mining failure reverts without fictitious ledger receipts |
| testClaimBatchDoesNotDependOnMiningOrSettleItsRewards | Claiming accounted rights does not depend on Mining or touch unsettled rewards |

Test source: [FundingRewards.t.sol](../../../test/unit/FundingRewards.t.sol). The complete post-fix regression passed: all 79 Solidity tests Success, including 24 FundingRewards cases with the 5 new regressions above individually checked as Success. All 78 SDK tests, typecheck, gas, format and export also passed. Full unit-test results are in [solidity-tests.json](../../../reports/solidity-tests.json), and SDK results in [sdk-tests.txt](../../../reports/sdk-tests.txt). The main runner also strengthened its assertion: after advancing 3,600 seconds, pendingBeforeRaw=0 and actualNewVaultInflowRaw>0 must both hold; old remainder can no longer make that scenario pass.

### 4.2 First actual BEM receipt and batch claims

Mining.pending before harvest is 13,532,613 raw (0.13532613 BEM). Actual Vault receipt is 13,533,093 raw (0.13533093 BEM), determined by balance increment and receipt. Pending reads and actual receipts are distinct observations. Direct transaction evidence this round confirms that claim can settle positive rewards not reflected in pending; the full production formula and source-level semantics remain outside this verification's scope.

| Record | Raw smallest units | BEM | Basis |
| --- | --- | --- | --- |
| Mining.pending before harvest | 13,532,613 | 0.13532613 | Earlier pending read |
| Actual Vault receipt | 13,533,093 | 0.13533093 | Vault balance increment |
| Accounted rights per ID | 135,330 | 0.00135330 | Actual receipt divided by 100, rounded down as an integer |
| A claims #2–45, 44 shares | 5,954,520 | 0.05954520 | One claim-batch |
| B claims #46–100, 55 shares | 7,443,150 | 0.07443150 | One claim-batch |
| B claims #1 after transfer | 135,330 | 0.00135330 | One claim-batch |
| Remainder after distribution | 93 | 0.00000093 | Retained in Vault and settled on exit |

Integer relationships were checked programmatically:

    13533093 = 100 × 135330 + 93
    5954520 + 7443150 + 135330 + 93 = 13533093

A deliberately claims only #2–45, 44 IDs, first, preserving #1's positive unclaimed rights. One claim-batch pays A 0.05954520 BEM; B receives 0 in that transaction, and each of B's unclaimed IDs retains 0.00135330 BEM. B then claims #46–100, 55 shares, in one transaction and receives 0.07443150 BEM.

This verifies that **multiple owned IDs can be supplied to claim their unclaimed rights in one transaction**. The caller must list the IDs to claim; each call does not redistribute Vault's entire balance according to the current number of NFTs held.

All ledger amounts are raw smallest units:

| Checkpoint | Local block | Cumulative accounted, raw | Cumulative paid, raw | Vault balance, raw | Remainder, raw |
| --- | --- | --- | --- | --- | --- |
| After first harvest | 128554264 | 13,533,093 | 0 | 13,533,093 | 93 |
| After A claims 44 shares | 128554265 | 13,533,093 | 5,954,520 | 7,578,573 | 93 |
| After B claims 55 shares | 128554266 | 13,533,093 | 13,397,670 | 135,423 | 93 |
| After #1 transfer | 128554267 | 13,533,093 | 13,397,670 | 135,423 | 93 |
| After B claims #1 | 128554268 | 13,533,093 | 13,533,000 | 93 | 93 |

## 5. Unclaimed rights follow #1 on transfer

Before transfer, A's #1 has 135,330 raw (0.00135330 BEM) unclaimed.

- After A transfers #1 to B, holderOf(1) becomes B; claimed(1) is unchanged and claimable(1) remains 135,330 raw.
- A, the former holder, attempts another #1 claim in simulation only and is rejected with NotHolder.
- B, the new holder, actually claims: B's balance rises by 135,330 raw (0.00135330 BEM), then claimable(1)=0.
- Already claimed rewards are not paid twice; it is that ID's unclaimed ledger rights that move with the NFT.

holder, claimed, claimable, actual BEM balance increments and payment receipts jointly verify that the new address can operate and that positive unclaimed BEM rights follow the ID.

## 6. Consolidating 100 shares and both exit branches

B transfers #1 and #46–100, 56 shares total, to A. balanceOfBatch verifies that A's balance is 1 for each #1–100.

Local time then advances 3,600 seconds. Before the second harvest, pending reads **0**, and Vault holds only the old 93 raw remainder. After the fix, actual new receipt is **37,601 raw (0.00037601 BEM)**. The transaction's balance increment equals its cumulative accounting increment, proving actual settlement must still be attempted at pending=0.

| Check | Before second harvest, raw | After second harvest, raw |
| --- | ---: | ---: |
| Cumulative accounted totalAccounted | 13,533,093 | 13,570,694 |
| Cumulative paid totalPaid | 13,533,000 | 13,533,000 |
| Vault BEM balance | 93 | 37,694 |
| Cumulative per-ID accPerShare | 135,330 | 135,706 |
| Remainder remainder | 93 | 94 |

The exit baseline holds **37,694 raw (0.00037694 BEM)**, composed of old remainder and the second positive reward; it must not be described as dust alone:

    37694 = 93 + 37601
    37694 = 100 × 376 + 94
    13570694 = 13533000 + 37694

Two mutually exclusive exit branches are verified from this same snapshot baseline:

| Branch | Miner and shares | BEM on exit | Subsequently |
| --- | --- | --- | --- |
| redeemMiner | Miner delivered to A, all 100 shares burned | A receives 37694 raw (0.00037694 BEM), Vault clears | Snapshot restored after verification |
| redeemWithoutHarvest | Miner delivered to A, all 100 shares burned | Vault retains 37694 raw; A BEM unchanged | A then calls claimResidual and receives 37694 raw (0.00037694 BEM) |

**Independent reconciliation of normal redemption:** baseline Vault balance 37,694 raw plus cumulative accounting increment of 0 raw in the redemption transaction equals the 37,694 raw A receives on this branch. This redemption has the same local block timestamp as the preceding harvest, and measured extra receipt is 0. redeemMiner attempts Mining.claim again; another execution time may yield additional rewards, so payment must not be assumed to equal the pre-snapshot balance. This round does not claim to have measured extra positive rewards inside the redemption transaction.

**Independent reconciliation of the skip-harvest branch:** the miner exit transaction has 0 BEM Transfer events, A's BEM increment is 0, and Vault balance remains 37,694 raw. Only the subsequent claimResidual pays this existing BEM to redemption beneficiary A and clears the balance. This branch did not attempt to claim new rewards still in Mining; the miner afterward belongs to A. No real Mining or BEM failure was injected here.

The latter branch is finally retained: miner owned by A, Vault REDEEMED, effective shares 0, Vault BEM balance 0; cumulative accounted and cumulative paid both 13,570,694 raw (0.13570694 BEM).

The exit branches are mutually exclusive, so **their payments must not be added together as A's actual cumulative claim**. On the final retained branch, A actually receives 5,992,214 raw this round from the first 44-share claim plus residual; B receives 7,578,480 raw from its original 55 shares plus acquired #1. Their sum is 13,570,694 raw, matching total accounted. These are this round's balance deltas and exclude BEM already in wallets. Consolidating 100 shares does not let A reclaim rewards previously received by A/B.

## 7. Source-chain isolation and uncovered scope

All transactions were sent only to the local fork. The upstream proxy permits read methods only; real RPC credentials did not enter the Anvil command line or this report. Mainnet deployments, mainnet broadcasts, market publication and database writes were all 0.

Independent [real-source-postcheck.json](../../../reports/real-source-postcheck.json) rechecked the source chain's fixed block and latest observation block at 2026-10-19T20:47:38+08:00, result PASS. The latest observation is block 128556806, hash 0x45507aece822a5e9cc1e788f72e4a02f0b67939c4c021fc07bb5fe07784b86a8:

- Miner #3204 owner remains A: 0x1b55E6A757987576E1a130A011f9E12498De7DB9.
- Token-specific getApproved returns zero address; A's isApprovedForAll to this Seaport is false.
- This fork-created order on the source chain has isValidated=false, isCancelled=false, totalFilled=0, totalSize=0.
- Hashes at both observation points were checked again; the supplementary report's test-report SHA-256 matches the final machine report on which this report is based.

This provides concrete evidence that this order was not validated or filled at the observed source-chain blocks and that the original miner/approval state was unchanged at those observations. It is not an audit of all mainnet transaction history and cannot exclude unrelated transactions between observations. Zero source RPC writes is also ensured by the read-only proxy method allowlist and execution endpoint fixed to local Anvil.

| Scope | Result | Evidence boundary |
| --- | --- | --- |
| Seaport 1.6 / NFT / Mining / BEM in real BSC state | PASS | Actual fork receipts, balances and states from this round |
| Mainnet deployment and transactions | NOT_RUN | 0 transactions sent to mainnet |
| Real market published orders, market API, database | NOT_RUN | Created and validated inside the fork; not published externally |
| Production Timelock / multisig governance | NOT_RUN | Local test delay 1 second, using impersonation |
| Another actual claim and accounting after pending=0 | PASS | Second real Mining receipt 37,601 raw; missing gate corrected in this round |
| New Mining rewards inside normal redemption transaction | NOT_RUN | Positive BEM existed before redemption; actual extra receipt in redemption was 0; pending=0 separately covered by second harvest and diagnostic |
| Real Mining / BEM fault injection | NOT_RUN | Real contract code/storage unchanged, no dependency faults manufactured |
| Real CircuitMarket adapter | NOT_RUN | Only Seaport path executed this round |
| Complete abnormal-order matrix, cross-pool stress, production confirmations/reorgs | NOT_RUN | Outside this round's 23 scenarios |
| Independent source/security audit and production launch approval | NOT_RUN | Getters, runtime hashes and fork success do not replace an audit |

The first actual harvest and second positive receipt after pending=0 verify that Vault can call Mining and receive BEM for this fixed state, this miner and this set of real contracts. This does not automatically prove compatibility with all miners, all future blocks, real dependency failures or future protocol upgrades.

## 8. Receipt index and evidence validation

All entries below are local fork receipts. Branches marked later-reverted were snapshot-restored after verification and may share local block numbers with the final branch while having different transaction/block hashes. Full logs, block hashes, gas prices and before/after balances/states are in the machine report.

| Operation | Branch | Local block | gasUsed | Local transaction hash |
| --- | --- | --- | --- | --- |
| approve-selected-nft | main | 128554250 | 56,268 | 0xe09cdb76567056548033c5e4d977bb4cfa3cb110a5d53830afa8954de49a8f07 |
| validate-unsigned-seaport-order | main | 128554251 | 68,668 | 0xbe93c542a76cf70112dde074a0b8d3b7d89ec1676c6a02fc8c7e2f5c7e74fd07 |
| deploy:GroupBuyVault | main | 128554252 | 6,997,237 | 0xa5d69f87e9e9cbd85a86178a11ca766590e874b4a8ee59fda18139b23ae579b7 |
| deploy:GovernanceTimelock | main | 128554253 | 1,421,615 | 0x557d136ec0ce31b0b31785a002625ca244eae19ba06f0ef4cc12df214f6af8a1 |
| deploy:GroupBuyFactory | main | 128554254 | 2,312,360 | 0xb82b17ed621304d24e7308bc2fd19b4963b25d4a7cd2a5ed11fe27385215c135 |
| deploy:ERC1967Proxy | main | 128554255 | 251,737 | 0x0d20dd984e0685dc658bc005ba4a0bd0210c85bb9570869fe5dc0b38402bfb44 |
| scheduleBatch | main | 128554256 | 85,602 | 0x22e77f9996202fa09edf7dd1cc376823b709e4f4463c739946ace0a36b575a20 |
| executeBatch | main | 128554258 | 413,011 | 0x7e962a7f026c884c8cfa681340d29687f75fda7a032a53ae80feaa67813dbcb2 |
| create-pool | main | 128554259 | 1,385,186 | 0xe67e416eed52098d4b0846c1e16918542ac4d6fd1925bcd32ca58b5a7845d1a7 |
| contribute | main | 128554260 | 2,485,881 | 0x95fc076e5a51af27107fafe9512e66a5ac4e29d6123a2ff9485491fb559f316e |
| withdraw | main | 128554261 | 89,136 | 0x810397c7640876922842be1247d9e53d54f404516b9fbab09a7e18ed6203a4b9 |
| contribute | main | 128554262 | 289,154 | 0x3deab180250a71e3c73fccd777287933c0e60c974d4b6b0c7e6505ee72b57e81 |
| guardian-cancel | guardian-refund-later-reverted | 128554263 | 72,710 | 0x28f8b2e22661c49b0b74ab45e8a9aa4b1cb2a5aa8033ea83d250fb6c28a40153 |
| withdraw | guardian-refund-later-reverted | 128554264 | 639,596 | 0xefafd30ce3d334bd4c79f7fd5900427550ca97227197aba1d0fd41177de0121f |
| contribute | main | 128554263 | 3,086,308 | 0x52813460e841ea30036e059aff19d75ff3aeb86b74fa130cba1af1ac7dd58ab1 |
| harvest | main | 128554264 | 220,463 | 0x85f2e4a2c0aa5c921f1bfd85180b4b49a3e6d4470c5385bc1fca392537594c6c |
| claim-batch | main | 128554265 | 1,401,175 | 0xb6c58ebbca2b03782a59ea2dd885384b72fd7bf490522984debe25d7c0ec2f42 |
| claim-batch | main | 128554266 | 1,712,947 | 0x592d7ce0831adf8d987f920233dbe343d2b9369ffd4061bc3681a9c4ef56eb2b |
| transfer-shares | main | 128554267 | 70,014 | 0x7976d4c98aa3b22d13a0a6efc21a0c07df7ddbe8ce617396c41b7a53b23c3bc7 |
| claim-batch | main | 128554268 | 98,494 | 0x1e8a1b56675240f0895d4f90af6b86309665f029c2b2d9737ef5a288ec66039b |
| transfer-shares | main | 128554269 | 1,767,662 | 0x59863ebe0f87a33dba1b09607c5c6bfbfca28370c44b923e4156b84fd215659b |
| harvest | main | 128554271 | 152,063 | 0xbb4c0e08ec3731f159bdaaa59d89723df909e16290cb8ac35aedfe04aaef3d79 |
| redeem | normal-redeem-later-reverted | 128554272 | 1,810,603 | 0xa96014430ee6fc2409608c33cad436942eba3b0b60865ea077e2311afd58229d |
| redeem-without-harvest | without-harvest-final-branch | 128554272 | 1,164,397 | 0xf81843fb715873347e6af2662d72e3386f84341e69ea5c59d78a489640abcd3b |
| claim-residual | without-harvest-final-branch | 128554273 | 64,347 | 0x2d64f08bb92b27907d42187bc073c33afa112ccae34331f225d474e1426f2a02 |

- Machine report SHA-256: 8762427a6054472f7d064e708eeda3997aaf625f45d21cc41c56b945d594131e.
- Verification input hash: 9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba.
- Existing code changed at runtime: false.
- Independent diagnostic report SHA-256: da262b505e7c19424cbab897f5af215d66455cb0daec81c67f88853e36402345; diagnostic input hash 565320da2c84f6540cf546556291e491e764e64867c859fbf47bae41c1f1c142, identical to the hash at diagnostic completion.
- The main flow input hash changed during execution because this run generated its order/configuration; immutableCodeChangedDuringRun=false, existing execution logic was not modified while running.
- Both diagnostic transactions were removed by snapshot restoration and cannot be treated as receipts on the main flow's final chain.

Input files generated in this run:

| File generated in this run | SHA-256 |
| --- | --- |
| [fixtures/fork-created-3204-157965afaffa5c59.json](../../../fixtures/fork-created-3204-157965afaffa5c59.json) | 0e8722d1f23b7c00e4f37477e3777af99aabcfc600438281ed0950a3a6a1c7d3 |
| [fixtures/fork-authorized-3204-1792414018906.config.json](../../../fixtures/fork-authorized-3204-1792414018906.config.json) | 5ab54ec5411059a2e016ac787fef59d83bb0d6cdc622d1e1fd8c1a982d18ae8c |
- This report applies only to the run above. Numbers and hashes after a fresh fork / new order / rerun must be regenerated from the machine report rather than reused.

## Final delivery regression

All results below bind the current verification input hash `9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba`.

| Category | Result | Raw record |
| --- | --- | --- |
| Solidity unit, integration, fuzz, invariant and scale cases | 79/79 PASS | reports/solidity-tests.json |
| SDK | 78/78 PASS | reports/sdk-tests.txt |
| Local Mock CLI pipeline | 57 checks PASS | reports/local-smoke.json |
| Local fork transport isolation | 32 checks PASS | reports/fork-local-selftest.json |
| Local transport self-test for optional LAN code | 30 checks PASS; LAN not opened | reports/fork-lan-selftest.json |
| Real BSC state fork | 23 scenarios PASS, 25 local receipts | reports/real-bsc-fork-tests.json |

Formatting, clean build, gas, TypeScript and ABI/storage-layout export all PASS. The independent Mining diagnostic has 2 additional local transactions removed by snapshot restoration; they must not be mixed with main-flow receipts as mainnet records. Archive entry points are `npm run report`, `npm run archive`; source packages and checksum files are in `artifacts/`, and the market-window handoff is `MARKET_HANDOFF.md`.
