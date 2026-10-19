# Local Fork of Real BSC State: Post-Fix Evidence Review

The final post-fix run had **all 23 scenario checks PASS and all 25 transactions execute successfully on the local fork**. This independent review decoded saved raw receipts again and reconciled two positive BEM harvests, batch claims, transfer of positive unclaimed rights and both exit branches; amounts and events match. This document uses the final report for this run and supersedes the older round that covered only remainder redemption.

The review cross-checks execution evidence within the same engineering project; it is not an independent third-party security audit. There was no mainnet deployment or mainnet transaction. Reading reports and executing assertions during the review sent no transactions.

## Final evidence identity

| Item | Bound value |
| --- | --- |
| Final completion time (UTC) | 2026-10-19T12:47:20.106Z |
| Fixed source chain | BSC, chainId 56, block 128554249 |
| Fixed block hash | `0xe44fafd52f2b1da68b810514554c21061d327cccb046b6c8afdfb315a1ef991d` |
| Local hostInstanceId | `f2b486c2-14e2-4034-a43a-e80c61b40974` |
| Fork Vault | `0x3059065Fc566A17d80AdDFcc2BD5f677AF300Acb` |
| Order hash | `0x157965afaffa5c5949ab133f9da4054d7607201aad675c29b81fc0f6370c3f2a` |
| Identical code fingerprint before/after execution | `7a48ebd4fbddff6974cb83b2609ed2693ff022611c64da814a0f61bc5661b7fa` |
| Final execution report SHA-256 | `8762427a6054472f7d064e708eeda3997aaf625f45d21cc41c56b945d594131e` |
| Post-run source-chain read-only report SHA-256 | `9c84820da42fe0c78fcf538ce43d3378bcea7d6dfd39f89d3f279a5f64c09678` |
| Mining diagnostic archive SHA-256 | `da262b505e7c19424cbab897f5af215d66455cb0daec81c67f88853e36402345` |

Raw evidence: [final execution report](../../../reports/real-bsc-fork-tests.json), [post-run source-chain read-only report](../../../reports/real-source-postcheck.json), [real Mining diagnostic archive](../../../reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json). Executor: [run-authorized-fork-tests.mjs](../../../scripts/run-authorized-fork-tests.mjs). Every fork receipt was checked against the actual block hash of its branch when collected; fork transaction hashes in the report must not be used as mainnet receipts.

The miner is #3204 in collection `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C`. Real dependencies: Seaport `0x0000000000000068F116a894984e2DB1123eB395`, Mining `0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46`, BEM `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a`. The order was created only inside the fork using A impersonation, single-NFT approval and real Seaport.validate; signature=`0x`, with no public listing signature generated. Seller price 0.3 BNB, test fee 0.003 BNB, total 0.303 BNB; creator is the designated test fee recipient, not evidence of a verified formal market fee configuration.

Local account BNB was configured through Anvil; NFT, Mining and BEM code/storage were not modified. Initial tip must equal the fixed source block. Test governance uses an EOA and a 1-second Timelock, not production governance.

## Actual finding and fix verification

Vault originally decided whether to call claim based on pending()!=0. An independent diagnostic on real Mining observed that pending=0 after the first claim and remained 0 after advancing 3,600 seconds, but both the second claim's BEM Transfer and account balance increment were **37,601 raw (0.00037601 BEM)**. A repeated eth_call in the first claim's same block also returned successfully; this is a zero-transaction simulation, not another mined transaction.

The diagnostic source fingerprint was unchanged before/after, and real dependency source/fork codehashes matched. Impersonation was stopped and the snapshot restored after diagnosis, restoring the fresh fork's initial state. The two diagnostic transactions were subsequently reverted and are excluded from the 25 main-flow transactions and BEM flows below.

Corrected _harvest always calls Mining.claim and accounts from Vault's actual BEM balance increment, without swallowing external errors. Targeted FundingRewards tests were **24/24 PASS**, including new regressions for harvest, harvestAndClaim and normal redemption when cached pending is zero; zero rewards/Mining error propagation; and claimBatch's independence from Mining. fmt --check passed for the three modified files. The main flow was then rerun from fresh source-block state. The second harvest actually received the same 37,601 raw at pending=0, demonstrating that the fix works on the fork with real dependencies.

## Amounts for both harvests and claims

BEM decimals are 8; reconciliation uses raw integers.

| Item | Raw smallest units | BEM |
| --- | ---: | ---: |
| Mining pending observed before first harvest | 13,532,613 | 0.13532613 |
| Actual first harvest receipt into Vault | 13,533,093 | 0.13533093 |
| Initial cumulative rewards per share | 135,330 | 0.00135330 |
| Remainder after first division by 100 | 93 | 0.00000093 |
| A claims #2–#45, 44 shares in one transaction | 5,954,520 | 0.05954520 |
| B claims #46–#100, 55 shares in one transaction | 7,443,150 | 0.07443150 |
| B claims #1 after its transfer from A | 135,330 | 0.00135330 |
| Pending before second harvest | 0 | 0 |
| Actual second harvest receipt into Vault | 37,601 | 0.00037601 |
| Vault balance after second harvest, including old remainder 93 | 37,694 | 0.00037694 |
| New claimable amount per share after second harvest | 376 | 0.00000376 |
| Remainder after second harvest | 94 | 0.00000094 |
| Total accounted across both harvests | 13,570,694 | 0.13570694 |

Both harvests' BEM Transfer events are zero-address transfers to Vault, for 13,533,093 and 37,601 respectively, matching RewardsSynced, Harvested and Vault balance deltas. The first actual receipt exceeded the earlier pending observation by 480 raw; these are recorded as two observation points. Pending is neither treated as the exact execution receipt nor used to infer unverified external calculation formulas.

A initially held 45 shares and deliberately claimed only 44 to test rights transfer. Its receipt contains RewardClaimed for 44 unique IDs; B's first receipt has 55. Each share pays 135,330 raw, with BEM Transfer equal to the sum. #1 has claimed=0 and claimable=135,330 both before and after transfer; the transfer transaction has no BEM Transfer. The old A claim simulation returns NotHolder, and the new B's actual fork transaction subsequently receives 135,330 raw. This directly proves that positive unclaimed rights already in Vault follow the NFT.

B then transfers #1 and #46–#100, 56 IDs in total, to A; afterward A holds 1 of every #1–#100. Subsequent rewards belong to all shares then held by A, so the initial A45/B55 ratio cannot explain final income across the full lifecycle.

## Normal redemption and direct miner withdrawal

Both exit branches share the same snapshot: block 128554271, hash `0x26da406cd5b56ff6dbaa352a1b3257ec77354ed8154a9b189c77599c57f79506`. Baseline pending=0, Vault BEM=37,694; each ID still has 376 raw claimable and remainder is 94. This round covers positive unclaimed share rewards rather than remainder-only redemption.

| Branch | Receipt and balance evidence | Result |
| --- | --- | --- |
| Normal redeem | Internal Harvested.received=0; 100 RewardClaimed events of 376 each; 1 of each of 100 IDs burned; BEM payment 37,694; #3204 transferred from Vault to A | A obtains the miner and all existing BEM in one transaction; then reverted to test the other branch |
| redeemWithoutHarvest | Restored from the same snapshot; 1 of each of 100 IDs burned; #3204 transferred to A; no Harvested, RewardClaimed or BEM Transfer; A BEM unchanged, Vault remains 37,694 | Direct miner withdrawal succeeds; this transaction does not claim BEM |
| claimResidual | A receives 37,694 raw in the next transaction; Vault balance becomes zero | The final retained branch completes residual payment |

Normal redemption payment is **100 × 376 + 94 = 37,694 raw**. Mining claim during normal redemption adds 0. This round did not prove the specific timing case of positive new Mining rewards inside redeem itself, but the preceding second real harvest already proved positive settlement at cached pending=0, and unit regression covers the same _harvest logic in redeem.

On the final retained branch, A's total income is **5,954,520 + 37,694 = 5,992,214 raw (0.05992214 BEM)**; B's is **7,443,150 + 135,330 = 7,578,480 raw (0.07578480 BEM)**. Their sum is **13,570,694 raw**, equal to both actual harvest receipts combined, with final totalPaid = totalAccounted = 13,570,694 and Vault BEM=0. Initial-to-final wallet balance deltas also match these two totals.

Of 25 successful transactions, 2 in the guardian refund branch and 1 in the normal redemption branch were later reverted; 22 belong to the final retained path. Income from the normal and direct exit branches must not be double-counted. Different branch block hashes at the same height are expected after snapshot rollback.

## Key fork receipt index

| Operation | Transaction hash |
| --- | --- |
| First harvest | `0x85f2e4a2c0aa5c921f1bfd85180b4b49a3e6d4470c5385bc1fca392537594c6c` |
| A claims 44 shares | `0xb6c58ebbca2b03782a59ea2dd885384b72fd7bf490522984debe25d7c0ec2f42` |
| B claims 55 shares | `0x592d7ce0831adf8d987f920233dbe343d2b9369ffd4061bc3681a9c4ef56eb2b` |
| A→B transfer of #1 | `0x7976d4c98aa3b22d13a0a6efc21a0c07df7ddbe8ce617396c41b7a53b23c3bc7` |
| B claims #1 | `0x1e8a1b56675240f0895d4f90af6b86309665f029c2b2d9737ef5a288ec66039b` |
| B→A consolidation of 56 shares | `0x59863ebe0f87a33dba1b09607c5c6bfbfca28370c44b923e4156b84fd215659b` |
| Second harvest, pending=0 but positive receipt | `0xbb4c0e08ec3731f159bdaaa59d89723df909e16290cb8ac35aedfe04aaef3d79` |
| Normal redemption, later reverted | `0xa96014430ee6fc2409608c33cad436942eba3b0b60865ea077e2311afd58229d` |
| Direct miner withdrawal, final branch | `0xf81843fb715873347e6af2662d72e3386f84341e69ea5c59d78a489640abcd3b` |
| Final residual claim | `0x2d64f08bb92b27907d42187bc073c33afa112ccae34331f225d474e1426f2a02` |

## Post-run main-chain read-only verification

The main runner's source-read-only-check checks the fixed source block. The post-run [check-authorized-source.mjs](../../../scripts/check-authorized-source.mjs) adds a latest main-chain observation after the final run. It reads only public inputs and the source read-only proxy, with no .env, private keys or transaction sending; the report binds this final execution report's SHA-256.

The post-run report was generated at 2026-10-19T12:47:38.007Z. It first selected latest observation block **128556806**, pinned all owner, approval and orderStatus reads to that block, then rechecked the fixed source block and latest observation block hashes. The latest observation block hash is `0x45507aece822a5e9cc1e788f72e4a02f0b67939c4c021fc07bb5fe07784b86a8`. Both the fixed source block and this latest observation block show #3204 owner=A, single-NFT approved=zero address, A's approvedForAll to Seaport=false, and the exact orderHash for this round isValidated=false, isCancelled=false, totalFilled=0, totalSize=0. All six checks are true, PASS.

This proves state at two specified checkpoints, not exhaustive main-chain history; identical owner/approval cannot prove that no other transactions occurred in between, and this order's unvalidated/unfilled state cannot be generalized to other orders. The no-mainnet-broadcast boundary also depends on the source proxy's read-only method allowlist, write requests fixed to local Anvil, and an execution flow that loads no private keys and generates no public signatures.

## Coverage distinctions still required

- Covered purchase, two positive harvests, batch claims, transfer of positive rights, consolidation of 100 shares, normal redemption with positive unclaimed share rewards and residual BEM recovery after direct exit at this real fixed BSC state. This does not imply compatibility with every chain state or protocol version.
- The order was created and prevalidated on the local fork; importing existing public signed listings, formal market API/frontend/database, order publication, signature collection and production fee configuration were not covered.
- Cached pending cannot predict “the maximum currently claimable amount.” The second positive reward was established on the real fork; other long-term production stages, economic rules and full external-contract behavior were not exhausted.
- No faults were injected into real Mining/BEM this round. No BEM transfer in the direct-exit receipt was verified, but no full call trace was collected as runtime proof of calling no reward dependency; source control flow and Mock fault tests should be stated separately as evidence.
- ACTIVE guardian rejection, old-holder claim rejection and non-holder refund rejection are simulated-revert evidence, not broadcast failed transactions.
- The 23 checks include identity, configuration, deployment and read-only checks; they must not be described as 23 independent financial boundary cases. Mainnet deployment/broadcasts, production governance and an independent third-party security audit were not executed.
