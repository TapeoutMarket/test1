# TapeOut English Report Collection

This collection contains complete English editions of 33 canonical Markdown reports and associated handoff/runbook documents, plus English Word editions of the two legacy consolidated reports. Chinese originals remain unchanged. The editions retain addresses, transaction hashes, raw and decimal amounts, accounting equations, test results, qualifications, and historical evidence cutoffs.

Read the [mainnet group-buy report](groupbuy/mainnet-test/MAINNET_TEST_REPORT.md) for the completed group-buy purchase and reward tests, the [67/33 reward report](groupbuy/mainnet-rewards/BEM_REWARDS_TEST_REPORT.md) for the fixed harvest batch, and the [entitlement transfer report](groupbuy/mainnet-entitlement-transfer/BEM_ENTITLEMENT_TRANSFER_REPORT.md) for the completed transfer and former-holder rejection test. Earlier readiness reports deliberately retain their historical NOT_RUN or UNVERIFIED states; translation does not turn those snapshots into later results.

The earlier two-share TestMinerVault and the later 100-share GroupBuyVault are separate contract generations. The former has owner recovery powers. The latter uses fixed ERC-1167 Vault clones without an asset-management owner or upgrade entry point. Findings from one generation must not be applied to the other.

All commands shown inside translated historical reports retain their original project working directory and evidence context. They are documentation, not instructions executed while producing this collection. In particular, old mainnet deployment commands and nonces are not new deployment authorization or current plans.

## Group-buy Reports and Operational Handoff

| English edition | Chinese source |
| --- | --- |
| [TapeOut GroupBuy V1 Phase One Contract Report](groupbuy/CONTRACT_REPORT.md) | [Original](../CONTRACT_REPORT.md) |
| [Protocol Compatibility and Evidence Boundaries](groupbuy/PROTOCOL_COMPATIBILITY.md) | [Original](../PROTOCOL_COMPATIBILITY.md) |
| [TapeOut GroupBuy V1 Security and Permission Model](groupbuy/SECURITY_MODEL.md) | [Original](../SECURITY_MODEL.md) |
| [GroupBuy V1 Handoff to the Market Window](groupbuy/MARKET_HANDOFF.md) | [Original](../MARKET_HANDOFF.md) |
| [TapeOut GroupBuy Contracts: Real BSC State Local Fork Test Report](groupbuy/docs/REAL_BSC_FORK_TEST_REPORT.md) | [Original](../docs/REAL_BSC_FORK_TEST_REPORT.md) |
| [Local Fork of Real BSC State: Post-Fix Evidence Review](groupbuy/docs/REAL_FORK_EVIDENCE_AUDIT.md) | [Original](../docs/REAL_FORK_EVIDENCE_AUDIT.md) |
| [> Historical evidence: this file corresponds to the run before the zero-pending skip defect was fixed; it is not the current version's acceptance conclusion. See REAL_FORK_EVIDENCE_AUDIT.md for current results.](groupbuy/docs/REAL_FORK_EVIDENCE_AUDIT_BEFORE_PENDING_FIX.md) | [Original](../docs/REAL_FORK_EVIDENCE_AUDIT_BEFORE_PENDING_FIX.md) |
| [Read-Only Identity Verification of Real BSC Protocols](groupbuy/docs/REAL_PROTOCOL_IDENTITY_REVIEW.md) | [Original](../docs/REAL_PROTOCOL_IDENTITY_REVIEW.md) |
| [Acceptance Report: Multisig, 600-Second Timelock, and Proxy Deployment Preparation](groupbuy/live-test/DEPLOYMENT_PREPARATION_REPORT.md) | [Original](../live-test/DEPLOYMENT_PREPARATION_REPORT.md) |
| [Governance Configuration and Multisig Verification for This Mainnet Test](groupbuy/live-test/GOVERNANCE_REVIEW.md) | [Original](../live-test/GOVERNANCE_REVIEW.md) |
| [BSC Mainnet Deployment Record by Transaction](groupbuy/live-test/LIVE_DEPLOYMENT_REPORT.md) | [Original](../live-test/LIVE_DEPLOYMENT_REPORT.md) |
| [BSC Mainnet Test Preparation and Preflight Report](groupbuy/live-test/MAINNET_TEST_READINESS.md) | [Original](../live-test/MAINNET_TEST_READINESS.md) |
| [BSC Mainnet Deployment and Multisig Configuration Runbook](groupbuy/live-test/MAINNET_DEPLOY_RUNBOOK.md) | [Original](../live-test/MAINNET_DEPLOY_RUNBOOK.md) |
| [BSC Mainnet Purchase and Rewards Test Progress](groupbuy/mainnet-test/MAINNET_TEST_REPORT.md) | [Original](../mainnet-test/MAINNET_TEST_REPORT.md) |
| [Handoff for Pool Creation, 67/33 Contributions, and Rewards Testing](groupbuy/mainnet-test/POOL_TEST_NEXT_STEPS.md) | [Original](../mainnet-test/POOL_TEST_NEXT_STEPS.md) |
| [Mainnet Test Report: Same-Batch BEM Rewards Distributed 67/33](groupbuy/mainnet-rewards/BEM_REWARDS_TEST_REPORT.md) | [Original](../mainnet-rewards/BEM_REWARDS_TEST_REPORT.md) |
| [Unclaimed BEM Entitlement Follows the Share NFT: Final Mainnet Test Report](groupbuy/mainnet-entitlement-transfer/BEM_ENTITLEMENT_TRANSFER_REPORT.md) | [Original](../mainnet-entitlement-transfer/BEM_ENTITLEMENT_TRANSFER_REPORT.md) |

## Legacy Miner Vault Reports

The 14 legacy reports and two engineering/protocol documents below include five pairs of identical named/hash aliases and one distinct incomplete transfer snapshot. The complete report covers the first four rounds; the redemption report covers the fifth. Their dates and cutoffs differ from the later group-buy tests.

| English edition | Preserved Chinese source |
| --- | --- |
| [TapeOut Protocol Verification (`PROTOCOL_CHECK.md`)](legacy/docs/PROTOCOL_CHECK.md) | [Original](sources/legacy/docs/PROTOCOL_CHECK.md) |
| [Test Report (`TEST_REPORT.md`)](legacy/docs/TEST_REPORT.md) | [Original](sources/legacy/docs/TEST_REPORT.md) |
| [Transfer of Positive Received-but-Unclaimed Entitlement with ERC-1155: Mainnet Test Report (`live-accrued-transfer-2231b89de3b5d147bba984778b5c3bd0a3ea4c0517c3464fb5b1a4cfca09002a.md`)](legacy/reports/live-accrued-transfer-2231b89de3b5d147bba984778b5c3bd0a3ea4c0517c3464fb5b1a4cfca09002a.md) | [Original](sources/legacy/reports/live-accrued-transfer-2231b89de3b5d147bba984778b5c3bd0a3ea4c0517c3464fb5b1a4cfca09002a.md) |
| [Transfer of Positive Received-but-Unclaimed Entitlement with ERC-1155: Mainnet Test Report (`live-accrued-transfer-f9a57e647e31ab0ca1746dd80c82b55b270b49121c531608ab5710a38687ce15.md`)](legacy/reports/live-accrued-transfer-f9a57e647e31ab0ca1746dd80c82b55b270b49121c531608ab5710a38687ce15.md) | [Original](sources/legacy/reports/live-accrued-transfer-f9a57e647e31ab0ca1746dd80c82b55b270b49121c531608ab5710a38687ce15.md) |
| [Transfer of Positive Received-but-Unclaimed Entitlement with ERC-1155: Mainnet Test Report (`live-accrued-transfer-report.md`)](legacy/reports/live-accrued-transfer-report.md) | [Original](sources/legacy/reports/live-accrued-transfer-report.md) |
| [Wallet A Only: BEM Claim Test Report (`live-claim-a-receipt-0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a.md`)](legacy/reports/live-claim-a-receipt-0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a.md) | [Original](sources/legacy/reports/live-claim-a-receipt-0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a.md) |
| [Wallet A Only: BEM Claim Test Report (`live-claim-a-report.md`)](legacy/reports/live-claim-a-report.md) | [Original](sources/legacy/reports/live-claim-a-report.md) |
| [A / B Cumulative Claims Comparison Report (`live-claim-ab-0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690-0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18.md`)](legacy/reports/live-claim-ab-0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690-0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18.md) | [Original](sources/legacy/reports/live-claim-ab-0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690-0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18.md) |
| [A / B Cumulative Claims Comparison Report (`live-claim-ab-report.md`)](legacy/reports/live-claim-ab-report.md) | [Original](sources/legacy/reports/live-claim-ab-report.md) |
| [Round 5: NFT Consolidation and Full Miner / BEM Redemption Report (`live-redeem-43d192bcb1f7cd030c7443e35cff03f381872af6c5a0077d84667199025caa81.md`)](legacy/reports/live-redeem-43d192bcb1f7cd030c7443e35cff03f381872af6c5a0077d84667199025caa81.md) | [Original](sources/legacy/reports/live-redeem-43d192bcb1f7cd030c7443e35cff03f381872af6c5a0077d84667199025caa81.md) |
| [Round 5: NFT Consolidation and Full Miner / BEM Redemption Report (`live-redeem-report.md`)](legacy/reports/live-redeem-report.md) | [Original](sources/legacy/reports/live-redeem-report.md) |
| [TapeOut Reward Claims and Entitlement Transfer Test Summary (`live-reward-tests-summary.md`)](legacy/reports/live-reward-tests-summary.md) | [Original](sources/legacy/reports/live-reward-tests-summary.md) |
| [ERC-1155 ID 1 Transfer and Reward Claim Test Report (`live-transfer-claim-a4c188fc662453dd42b59117e0a8f2511861919cee1ac0faaa2b2ad63cc4ed40-3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f-9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441.md`)](legacy/reports/live-transfer-claim-a4c188fc662453dd42b59117e0a8f2511861919cee1ac0faaa2b2ad63cc4ed40-3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f-9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441.md) | [Original](sources/legacy/reports/live-transfer-claim-a4c188fc662453dd42b59117e0a8f2511861919cee1ac0faaa2b2ad63cc4ed40-3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f-9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441.md) |
| [ERC-1155 ID 1 Transfer and Reward Claim Test Report (`live-transfer-claim-report.md`)](legacy/reports/live-transfer-claim-report.md) | [Original](sources/legacy/reports/live-transfer-claim-report.md) |
| [TapeOut Miner Custody and Reward Distribution: Complete Test Report (`tapeout-complete-test-report.md`)](legacy/reports/tapeout-complete-test-report.md) | [Original](sources/legacy/reports/tapeout-complete-test-report.md) |
| [TapeOut Round 5 Consolidation and Redemption Test Report (`tapeout-redemption-test-report.md`)](legacy/reports/tapeout-redemption-test-report.md) | [Original](sources/legacy/reports/tapeout-redemption-test-report.md) |

## Word Editions

- [Complete legacy test report](legacy/reports/tapeout-complete-test-report.docx)
- [Fifth-round consolidation and redemption report](legacy/reports/tapeout-redemption-test-report.docx)

The Markdown editions are the translation sources for these Word documents. Word build and visual QA details are recorded in [docx-validation.json](docx-validation.json).

## Provenance and Validation

[manifest.json](manifest.json) maps every English Markdown edition to its source and records SHA-256 hashes. [sources/legacy/INDEX.json](sources/legacy/INDEX.json) inventories immutable copies of the older Chinese reports, their original Word editions, and saved public JSON evidence. These copies bring the reports from the outer workspace into this Git repository without modifying or relocating the originals. Existing group-buy evidence is linked in its original repository location; machine evidence is not translated or rewritten.

[validation.json](validation.json) records document checks. Reproduce them from the repository root:

```bash
python3 reports-en/tools/validate_reports.py
```

The checks compare occurrences of `0x` hexadecimal values, 64-character hashes and standalone decimal values, plus table row counts and fenced block counts; verify report and catalogue link targets and source hashes; and check all legacy snapshot hashes. Reviewers also compared complete narratives, historical states, accounting boundaries and authority differences. The checks establish translation consistency, not fresh chain state, general protocol compatibility or an external security audit.

The [verification record](verification/offline-checks.json) for this delivery records 840 passing offline mainnet-tool tests and successful TypeScript typechecking. The frozen core verification input hash remains `9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba`. No RPC call, signature, broadcast, market update or database write is required for translation or its validator.

Archived report copies inside old ignored source bundles are not separately translated because the canonical editions are listed above. Unrelated README files, specifications and the original user prompt are outside the report-translation scope. No private environment files, signing keys or dependency directories are included.
