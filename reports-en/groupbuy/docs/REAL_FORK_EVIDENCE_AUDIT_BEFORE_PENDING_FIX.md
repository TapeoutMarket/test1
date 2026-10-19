> Historical evidence: this file corresponds to the run before the zero-pending skip defect was fixed; it is not the current version's acceptance conclusion. See REAL_FORK_EVIDENCE_AUDIT.md for current results.

# Local Fork of Real BSC State: Independent Evidence Review

Review conclusion for this run: **all 23 scenario checks in the final run were PASS and all 25 transactions executed successfully on the local fork**. Saved raw receipt logs were independently decoded, BEM receipts and payments recomputed, and rights transfer and snapshot branches checked; no contradiction was found between final amounts and receipts. Source fingerprints remained unchanged during execution. This file reviews engineering evidence, does not constitute an independent third-party security audit and does not signify approval for mainnet deployment.

## Evidence identity and scope

| Item | Final run evidence |
| --- | --- |
| Completion time (UTC) | 2026-10-19T12:41:17.263Z |
| Fixed source chain | BSC, chainId 56, block 128554249 |
| Fixed source block hash | `0xe44fafd52f2b1da68b810514554c21061d327cccb046b6c8afdfb315a1ef991d` |
| Local hostInstanceId | `8e8c713a-afb7-4a05-9ff8-941bec16e6af` |
| Fork Vault | `0x7CF2a181eeB9D12E7a9779Fd27248Ce918B492B4` |
| Test order hash | `0x4b806c1325967dc170bf08c74644b20dd00af8b79c58e874bbc6e54f836a0edc` |
| Identical source fingerprint before/after execution | `f2e42da586f26801c33fce1f0d446f8b7f613afe5eaa0d7715d4fa89af3cc24f` |
| Final report SHA-256 | `0b1628ab6f965df007d67eaafaffaa89532343434a0c06ae16a8060b6faca66b` |
| Post-run main-chain read-only report SHA-256 | `4ffd6aae20fd76abfca17efd8631f4222df89df20bf01dcd02f90048a7ce7d15` |

Raw evidence: [real-bsc-fork-tests.json](../../../reports/real-bsc-fork-tests-before-pending-fix.json), [real-source-postcheck.json](../../../reports/real-source-postcheck-before-pending-fix.json); execution flow: [run-authorized-fork-tests.mjs](../../../scripts/run-authorized-fork-tests.mjs). This review used saved receipts and state snapshots without sending more transactions. When collected, receipts were checked against their branch's actual block hash and must not be treated as mainnet receipts.

The test started from a fresh fork of the fixed source block above, with the runner requiring the initial tip to equal that block. The miner is #3204 in collection `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C`. Seaport is `0x0000000000000068F116a894984e2DB1123eB395`, Mining is `0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46`, and BEM is `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a`.

The order was created only inside the fork by impersonating seller A, approving one NFT and calling real Seaport.validate. Public signature is `0x`; no publicly submittable listing signature was generated and no market order was published. Seller price 0.3 BNB, test fee 0.003 BNB, total 0.303 BNB; fee recipient creator is an explicit test address and cannot establish the formal market fee configuration. Account BNB balances were set using local Anvil testing functionality; miner, Mining and BEM code/storage were not modified. Governance addresses were local test EOAs with a 1-second Timelock delay, not production governance configuration.

## BEM amounts and rights transfer

BEM decimals are 8. Raw integers are the accounting basis below; the early pending observation and actual execution receipt are recorded separately.

| Observation or operation | Raw smallest units | BEM |
| --- | ---: | ---: |
| Mining pending before first harvest | 13,532,613 | 0.13532613 |
| Actual first harvest receipt into Vault | 13,533,322 | 0.13533322 |
| Cumulative accrued rewards per share | 135,333 | 0.00135333 |
| Remainder retained after division by 100 | 22 | 0.00000022 |
| A batch claims #2–#45, 44 shares | 5,954,652 | 0.05954652 |
| B batch claims #46–#100, 55 shares | 7,443,315 | 0.07443315 |
| B claims historical unclaimed rights after #1 transfers from A | 135,333 | 0.00135333 |
| A claims the remaining remainder on the final branch | 22 | 0.00000022 |
| A's total income on the final branch | 5,954,674 | 0.05954674 |
| B's total income on the final branch | 7,578,648 | 0.07578648 |

The first harvest's BEM Transfer is a zero-address transfer of 13,533,322 to Vault; RewardsSynced and Harvested amounts match. Actual receipts exceeded earlier pending by 709 raw. These are recorded as two different observation points; pending does not replace actual receipts and is not used to infer unverified external mining calculation rules.

A initially held 45 shares but deliberately claimed only 44, reserving #1's positive rewards for the transfer test. Therefore, this round's final A/B income should not use the initial 45:55 holding ratio. A's single transaction contains 44 RewardClaimed events and B's contains 55; IDs are all unique, each pays 135,333 raw, and BEM Transfer equals the respective sum.

The #1 transfer transaction contains only the ERC-1155 transfer; that ID has claimed=0 and claimable=135,333 both before and after transfer. The former holder A's subsequent claim simulation returns NotHolder, and the new holder B receives 135,333 raw in an actual fork transaction. This directly supports that unclaimed rewards already in Vault and attributable to that NFT follow the NFT. Old-holder rejection is a read-only simulated revert, not a broadcast failed transaction.

Conservation on the final branch is **5,954,674 + 7,578,648 = 13,533,322 raw**. Final totalPaid = totalAccounted = 13,533,322 and Vault BEM balance=0. Payment from the reverted normal redemption branch must not be added to total income again.

## Actual coverage of both redemption paths

B batch transfers #1 and #46–#100, 56 IDs total, to A. After consolidation, A's balance is 1 for each #1–#100. The fork then advances 3,600 seconds and harvests again; Harvested.received is **0**, there is no BEM Transfer, and cumulative accounting does not increase. The scenario named prepare-positive-redemption-balance required only a positive Vault balance. This round's entire balance came from the 22 raw remainder and cannot be interpreted as another cycle's positive yield.

Both redemption branches share one snapshot baseline: block 128554271, hash `0x8f860b0ab8f1df30ae5a53e0aeee60342b330ca6e0280682f08c12b6e72bb4be`, Mining pending=0, unclaimed rewards per share=0, Vault balance and remainder=22 raw.

| Branch | Observed result | Evidence boundary |
| --- | --- | --- |
| Normal redeem | 1 of each of 100 IDs burned; #3204 transfers from Vault to A; all 100 RewardClaimed amounts are 0; A receives 22 raw remainder, Vault clears | Reverted after success; did not cover normal redemption with positive pending or positive unclaimed share balances |
| redeemWithoutHarvest | After restoring the same snapshot, 1 of each of 100 IDs burned; #3204 transfers to A; A BEM unchanged and Vault retains 22 raw; no BEM Transfer in this transaction | This is the final retained branch; absence of BEM Transfer is a receipt fact, not equivalent to full call-trace proof |
| claimResidual | A sends another transaction and receives 22 raw, Vault clears | Proves actual residual claiming; the amount is only this round's remainder |

Of 25 successful transactions, 2 in the guardian refund branch were later reverted and 1 normal redemption transaction was later reverted; the other 22 belong to the final retained execution path. Distinct snapshot branches having different block hashes at the same height is expected; their payments must not be combined as a single chain's continuous payments.

## Key fork receipt index

| Operation | Transaction hash |
| --- | --- |
| First harvest | `0x6ab035546d848b347a997fd7532f35ccd851c86bcb5c9dfa744cca5f72c12c22` |
| A claims 44 shares | `0xc3a8550b77d07db35b11055bc54d94bb8fc1701a4d648a5673d1c540133cba5f` |
| B claims 55 shares | `0xf8498a546a2a3d66e0cb35eea77edad61d011a57fc1f853c1dc3f39865df6750` |
| A→B transfer of #1 | `0x188032364f6438d08d6581bcf0df119aecbafc9fedd55cb919ea2e748ba4e3b3` |
| B claims #1's historical rights | `0x7a83061040ffb45aac948fd5400520e979c4c03f238808ed5face8db893b8f53` |
| B→A consolidation of 56 shares | `0x8bd428478c0cb153ec672067910b708cdf7cae1cb96cd0f734118835e09a3572` |
| Second harvest, receipt 0 | `0x9cff38d3ffd153e594f448dc349bc0b480d85f9a1e999232ab912995ab1f1322` |
| Normal redemption, later reverted | `0xc9f4a61e9ec2726e135665f0fa48064d84921d119724f1d3c4300f5d57983cd1` |
| Redemption without harvest, final branch | `0xaaa0fe9c4d502712d22e75ed7e314c1fa5706e904bc2d4f704497661304d3311` |
| Final residual claim | `0xc9d14a8bcebfd6c76c65ed4d068b56eaa01337bf2d3ae771d2a74ae1a0f66f71` |

## Post-run source main-chain read-only review

The runner's built-in source-read-only-check checks the fixed source block; alone, it cannot establish the latest main-chain state after execution. The post-run [check-authorized-source.mjs](../../../scripts/check-authorized-source.mjs) adds a latest-block observation, reading public inputs and the read-only source proxy without private keys, .env or transaction-sending methods.

This report was generated at 2026-10-19T12:41:23.320Z and binds the final execution report SHA-256 above. It first selected source-chain latest observation block **128555974**, then pinned all owner/approval/orderStatus reads to that block and rechecked the fixed source block and latest observation block hashes. The latest observation block hash is `0x068d65a89108ddc41506274d1fdabcc738f712b90d428eaa1674d48bd6302e14`.

Both fixed source block and latest observation block show #3204 owner=A, single-NFT approved=zero address, A's approvedForAll to Seaport=false, and this exact generated orderHash on mainnet isValidated=false, isCancelled=false, totalFilled=0, totalSize=0. All six checks are true; report PASS.

These are two explicit main-chain checkpoints, not a full-chain historical audit; matching owner/approval cannot prove there were no other transactions between them. This order being unvalidated and unfilled at the observation block cannot be generalized to other orders. The no-mainnet-broadcast execution boundary also depends on the read-only source proxy's method allowlist, writes fixed to local Anvil, and the code path loading no private keys/public signatures.

## Coverage limitations that must remain

- Proven real external contracts at this fixed BSC state for purchase, first positive BEM harvest, batch claims, transfer of positive unclaimed rights, consolidation of 100 shares and both exit paths. This does not establish compatibility with all subsequent chain states, tokens or market versions.
- No existing signed market order was imported this round. Real market API, frontend, database, order publication, external signature collection and production fee configuration were not covered and cannot be marked passed.
- The second harvest added 0 this round; continuing multiple positive reward cycles with real dependencies was not proved here. The normal redemption baseline had pending=0, unclaimed share rewards=0 and dust only. Normal redemption with positive pending or positive unclaimed rewards still needs a separate test.
- No failure or malicious behavior was injected into real Mining/BEM. No BEM transfer in redeemWithoutHarvest was verified, but no call trace was collected as runtime proof of calling no external reward dependency; source control flow and Mock fault tests should be described separately.
- Guardian rejection in ACTIVE, old-holder claim rejection and non-holder refund rejection use simulated-revert evidence, not failed transaction receipts.
- The 23 scenarios include identity, configuration, deployment and read-only checks; they must not be described as 23 independent financial boundary cases. Mainnet deployment, real mainnet transactions, production governance and an independent security audit were not executed in this round.
