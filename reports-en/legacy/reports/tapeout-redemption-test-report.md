# TapeOut Round 5 Consolidation and Redemption Test Report

**Conclusion: mainnet verification passed.** B transferred reward NFT #2 to A. Holding both #1 and #2, A then called redeemMiner(), settling rewards, burning both reward NFTs, and recovering the miner in one transaction. A actually received **0.00035546 BEM** this round, and miner #3204 was transferred to A.

This report supplements the complete report for the first four rounds. Evidence cutoff: BSC block **125717060**, **2026-10-05 01:34:08 (Beijing time)**. The user sent both transactions. Report generation performed only read-only verification, with no new signature or broadcast. BEM has 8 decimals; amounts below retain raw integers as well to prevent decimal misreading.

## 1. Test subjects and execution results

| Subject | Address or identifier |
| --- | --- |
| Network | BNB Smart Chain mainnet, chainId 56 |
| Vault | 0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B |
| A | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 |
| B | 0x63979C9d5200A5080be93eb440D469d2F2ec6682 |
| owner | 0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129 |
| Miner | ERC-721 #3204, collection 0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C |
| Reward shares | Vault-issued ERC-1155 #1 and #2, one unit each, equal weight |
| BEM | 0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a |

T01: B called safeTransferFrom(B, A, 2, 1, 0x), block 125716942, receipt success. Fixed-block states before/after and the TransferSingle event agree: #2 moved from B to A; A already held #1. Transfer paid no BEM, changed no reward accounting, and did not move the miner.

T01 [0x189b173121d493d303f21f0487d0655fc87098788a0646924c6ed7dc796fd383](https://bscscan.com/tx/0x189b173121d493d303f21f0487d0655fc87098788a0646924c6ed7dc796fd383)

T02: A called redeemMiner(), block 125717060, receipt success. The receipt contains actual BEM inflow, two RewardClaimed events, one combined BEM payment, two reward NFT burns, the miner Transfer, and MinerClosed(reason=Redeemed).

T02 [0xf9f3825bcdc4ae1c4397479a4c77a16492ce38f230b930655a8c1cffc1657e17](https://bscscan.com/tx/0xf9f3825bcdc4ae1c4397479a4c77a16492ce38f230b930655a8c1cffc1657e17)

Consolidation used gasUsed 65054, fee 0.0000032527 BNB, paid by B. Redemption used gasUsed 221768, fee 0.0000110884 BNB, paid by A. Combined fees: 0.0000143411 BNB. Fees use receipt gasUsed × effectiveGasPrice, not CLI maximum-fee estimates.

## 2. BEM inflow and payments this round

| Item | Raw integer | BEM amount |
| --- | --- | --- |
| Mining pending before redemption | 34903 | 0.00034903 |
| Existing Vault balance before redemption | 0 | 0 |
| Actual income in redemption transaction | 35546 | 0.00035546 |
| #1 settled to A this round | 17773 | 0.00017773 |
| #2 settled to A this round | 17773 | 0.00017773 |
| Additional dust payment | 0 | 0 |
| A actual receipts this round | 35546 | 0.00035546 |
| B actual receipts this round | 0 | 0 |
| Vault balance after redemption | 0 | 0 |

Pre-redemption data comes from block 125717059; post-redemption data from 125717060. Pending is an external Mining query before the call. Actual settlement uses the 35546 received by the Vault in the transaction; the earlier 34903 cannot be treated as final inflow. The difference is 643 minimum units, or 0.00000643 BEM.

Within the transaction, Harvested.received, the first RewardsSynced.received, and the BEM inflow event all equal 35546. The second RewardsSynced.received during batch settlement is 0, with no duplicate accounting. The two RewardClaimed events sum to 35546, matching the Vault → A BEM Transfer and A's balance increase. A's BEM balance rose from 333674 to 369220; B's remained 437579.

## 3. Assets and ledger after redemption

| Verification item | Result at block 125717060 |
| --- | --- |
| Miner #3204 ownerOf | A; no longer in Vault |
| Vault state | Closed (state=2), Redeemed (closeReason=1) |
| Final redemption beneficiary | redeemedBeneficiary = A |
| Reward NFTs #1 and #2 | Burn event for each; each totalSupply=0, holder=zero address |
| A's #1 and #2 balances | Both 0; burned during redemption |
| claimable(1), claimable(2) | Both 0 |
| Vault BEM and remainder | Both 0 |
| totalReceived / totalPaid | Both 910704, or 0.00910704 BEM |
| claimed[1] / claimed[2] | Both 455352, or 0.00455352 BEM; history not reset |

Consolidation only required B's #2 to move to A. Once A held both shares, redeemMiner() internally settled the fixed list [1, 2], recovering the miner and all settleable BEM in one redemption transaction. Shares were burned after settlement; the Vault is no longer in normal custody/claim mode.

External Mining pending at the fixed post-redemption block was 0. After the miner leaves the Vault, subsequent rewards concern the external miner state and cannot continue to be treated as claimable entitlement in this closed Vault.

## 4. Cumulative reconciliation since contract creation

| Reward ID | Cumulative claimed integer | Amount and recipient allocation |
| --- | --- | --- |
| #1 | 455352 | 0.00455352 BEM; A received 0.00351447, owner received 0.00103905 |
| #2 | 455352 | 0.00455352 BEM; B received 0.00437579, A received 0.00017773 this round |
| Total | 910704 | 0.00910704 BEM, equal to cumulative Vault receipts and payments |

| Recipient wallet | Cumulative receipt integer | Cumulative BEM from Vault |
| --- | --- | --- |
| A | 369220 | 0.00369220 |
| owner | 103905 | 0.00103905 |
| B | 437579 | 0.00437579 |
| Total | 910704 | 0.00910704 |

**Cumulative claims for the two IDs remain equal; cumulative wallet receipts need not be equal.** After NFT transfer, the new holder claims the corresponding ID's unclaimed entitlement. Amounts historically paid to former holders remain recorded. Because A also claimed #2 this round, the earlier report's “A + owner versus B” comparison can no longer test share equality. Aggregate by ID from RewardClaimed, then separately aggregate by recipient address.

## 5. Can 45 / 55 of 100 IDs each be claimed in one transaction?

**This can be implemented in a 100-share version: A submits its 45 IDs and B submits its 55 IDs, each in one batch claim transaction.** A frontend “claim all” button can first retrieve currently held IDs, then submit them together. The contract checks ownership per ID, deducts that ID's historical claims, and combines payment.

Claim amount = sum, over submitted IDs, of “cumulative entitlement − that ID's historical claimed amount.”

If 100 IDs each have one unit and equal weight, A receives 45% of newly allocated rewards and B 55%. Historical unclaimed amounts and transferred entitlements still require per-ID accounting. The current contract balance cannot simply be multiplied by 45% or 55%.

Use claimBatch(ids) for entitlement already in the Vault. To include new miner rewards, use harvestAndClaim(ids), which harvests before batch settlement. “One transaction” means one for each address and still requires its complete intended ID list. Owning multiple NFTs does not make a single-ID call automatically claim the remaining IDs.

**The currently deployed version supports only #1 and #2, at most 2 batch entries, and a fixed allocation denominator of 2.** A 100-share version requires changing these limits, implementing complete duplicate rejection and per-ID authority checks, and testing gas, simulations, and target-chain execution limits with actual 45 / 55 entry sizes. This two-share mainnet redemption does not prove that a 100-share version exists or fits one transaction's gas limit.

Code basis: src/TestMinerVault.sol lines 155–156 (allocation), 174–199 (batch claiming), 210–229 (redemption), and 304–305 (ID restrictions). ERC-1155 defines transfers, balances, and events; reward claiming logic comes from this project's contract. Held IDs can be obtained by querying known IDs or indexing events. See the [ERC-1155 standard](https://eips.ethereum.org/EIPS/eip-1155#enumerating-from-events).

## 6. Evidence scope and unexercised cases

This round's result is VERIFIED_FULL_REDEMPTION, with every verification check passed. Evidence includes both original on-chain transactions and receipts, four fixed-block snapshots around consolidation and redemption, Vault/BEM event scans, and rechecks that block hashes had not changed. Fixed-block snapshots are end-of-block states. This round's scan found no Vault operations beyond consolidation/redemption and no additional BEM inflows or payments.

Cumulative history uses the verified first-four-round baseline (block 125712665) plus this round's complete interval scan (125712666–125717060). This execution did not rescan all history from deployment. The original baseline's content hash and cutoff block hash were recorded. Earlier four-round reports retain their original cutoffs; this report extends the cumulative ledger through completed redemption.

The Vault's pre-redemption balance was 0. This verifies “new Mining rewards enter the Vault and are paid in full to A,” but does not cover the mainnet combination of a pre-existing positive Vault balance plus new Mining rewards. Remainder was 0, so nonzero dust payment was not tested on mainnet. The report collector passed 10 offline tests, including checks for missing payment/burn, wrong recipient, reset history, abnormal inflow, and nonzero dust. Offline tests do not imply those scenarios executed on mainnet.

| Material | Path within project |
| --- | --- |
| Full public evidence this round | reports/live-redeem-report.json |
| Itemized verification record | reports/live-redeem-report.md |
| Independent receipt parsing | reports/live-redeem-receipt-inspection.json |
| Previous verified baseline | reports/live-accrued-transfer-report.json |
| Complete first-four-round report | reports/tapeout-complete-test-report.docx |
| Report sources and validation record | reports/tapeout-redemption-test-report-evidence-index.json |

These conclusions apply only to the listed contracts, transactions, and cutoff blocks. They do not claim verification of every edge case or a new 100-share version.
