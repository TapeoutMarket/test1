# 已到账未领正数权益随 ERC-1155 转移：主网测试报告

状态：**VERIFIED_ACCRUED_RIGHTS_TRANSFER**。BSC chain 56；Vault `0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`；矿机 #3204；BEM 精度 8。

本轮 ID 1 由 creator（`0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`）转回 A（`0x1b55E6A757987576E1a130A011f9E12498De7DB9`）；B（`0x63979C9d5200A5080be93eb440D469d2F2ec6682`）持有 ID 2。固定基线区块 125706961，hash `0xcc2dddfaf5ae279b435fdaed56863c7dea077164028187541f3c28ed351c725b`，2026/10/5 00:18:22（Asia/Shanghai）。

首笔 creator harvest() 只把 Mining 收益收进 Vault，随后转移 ID 1，A 与 B 分别普通 claimBatch；两个领取均不得再次 harvest。本轮专门验证转移前 Vault 已经到账的正数未领权益。所有模拟均为固定区块 eth_call，报告脚本不签名、不广播。

## 到账、待领取与实际支付（BEM）

| 指标 | 金额 |
| --- | ---: |
| 首笔 harvest 实际 BEM 转入 Vault | 0.00112075 |
| Harvested 确认新增到账 | 0.00112075 |
| 转移前 ID 1 已到账未领 | 0.00056038 |
| A 本轮实际领取 | 0.00056038 |
| B 本轮实际领取 | 0.00056038 |
| creator 本轮实际领取 | 0 |
| A 自创建起收到 Vault 支付 | 0.00333674 |
| creator 自创建起收到 Vault 支付 | 0.00103905 |
| ID 1：A + creator 历史支付 | 0.00437579 |
| ID 2：B 历史支付 | 0.00437579 |

ID 1 − ID 2 累计支付差：**0 BEM**。基线 claimed(1) + 本轮 A 支付 = 最终 claimed(1)：0.00381541 + 0.00056038 = 0.00437579。既往支付债务保留。

## 固定区块观察

| 时点 | 区块 | Mining pending | totalReceived | 每份累计应得 | Vault 余额 | ID 1 已领 | ID 1 可领 | ID 2 已领 | ID 2 可领 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 固定基线 | 125706961 | 0.00098682 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00381541 | 0 | 0.00381541 | 0 |
| harvest 前一区块末 | 125709695 | 0.00111528 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00381541 | 0 | 0.00381541 | 0 |
| harvest 所在区块末 | 125709696 | 0 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |
| 转移前一区块末 | 125712341 | 0.00011741 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |
| 转移所在区块末 | 125712342 | 0.00011741 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |
| A 前一区块末 | 125712542 | 0.00013093 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |
| A 所在区块末 | 125712543 | 0.00013093 | 0.00875158 | 0.00437579 | 0.00056038 | 0.00437579 | 0 | 0.00381541 | 0.00056038 |
| B 前一区块末 | 125712664 | 0.00014315 | 0.00875158 | 0.00437579 | 0.00056038 | 0.00437579 | 0 | 0.00381541 | 0.00056038 |
| B 所在区块末 | 125712665 | 0.00014315 | 0.00875158 | 0.00437579 | 0 | 0.00437579 | 0 | 0.00437579 | 0 |

以上均为区块末状态，同区块后续交易可能已包含其中；不得把 afterTransfer 区块末余额称作转移执行瞬间余额。转移交易边界由基线、全轮事件范围核验、harvest 固定快照和转移回执独立确定：前后 claimable(1) 为 0.00056038 / 0.00056038 BEM，依据 isolated harvest block + unchanged previous-block ledger + whole-round event scope + exact accounting-free TransferSingle receipt。

Mining pending 可以继续增长，但未实际收取不进入 Vault。本轮到账以 BEM Transfer(to=Vault) 为准，两个普通 claim 的最后 RewardsSynced 必须为同一截止且 received=0；除首笔 harvest 外的任何真实入账都会使核验要求复核。

## 领取权与核验

- 基线 A 模拟 claimBatch([1])：Unauthorized。
- 转移后 creator 模拟 claimBatch([1])：Unauthorized。
- 基线 ERC-1155 数量 A ID 1 / creator ID 1 / B ID 2：0 / 1 / 1。最终：1 / 0 / 1。
- 目标覆盖：`{"vaultAccruedUnclaimedFollowsShare":"VERIFIED_ON_LIVE","aCannotClaimBeforeTransfer":"VERIFIED_BY_PINNED_ETH_CALL","creatorCannotClaimAfterTransfer":"VERIFIED_BY_PINNED_ETH_CALL","alreadyClaimedDebtPreserved":"VERIFIED_ON_LIVE","pendingAtBaseline":"98682","pendingAtFinal":"14315","actualHarvestInflow":"112075","claimable1BeforeTransfer":"56038"}`。
- 核验：`{"harvestExactCallAndReceipt":true,"transferExactCallAndReceipt":true,"aOrdinaryClaimExactCallAndReceipt":true,"bOrdinaryClaimExactCallAndReceipt":true,"fourDistinctTransactions":true,"harvestBeforeTransferInDifferentBlocks":true,"transferBeforeA":true,"aBeforeB":true,"harvestReceiptVerified":true,"baselineUnchangedBeforeHarvest":true,"positiveAccruedBeforeTransfer":true,"harvestedWithoutClaiming":true,"inflowMatchesReceivedDelta":true,"inflowMatchesBalanceDelta":true,"harvestCutoffMatchesSnapshot":true,"creatorHoldsFundedShare":true,"fundedMinerStillActive":true,"noOtherVaultTransactionsInRound":true,"allVaultRoundLogsDecode":true,"onlyExpectedVaultEventsInRound":true,"allRoundInflowOnlyFirstHarvest":true,"allRoundPaymentsOnlyOrdinaryClaims":true,"canonicalRoundLogs":true,"aUnauthorizedAtBaseline":true,"oneExactShareTransfer":true,"noBatchTransfer":true,"noAccountingEvents":true,"noVaultBEMMovementDuringTransfer":true,"aOrdinaryReceiptVerified":true,"bOrdinaryReceiptVerified":true,"sameReceiptCutoff":true,"creatorUnauthorizedAfterTransfer":true,"fundedLedgerUnchangedBeforeTransfer":true,"beforeTransferERC1155BalancesMatch":true,"afterTransferERC1155BalancesMatch":true,"finalERC1155BalancesMatch":true,"harvestAndClaimCutoffsMatch":true,"noExtraReceivedAfterFirstHarvest":true,"fullRoundReceivedMatchesActualInflow":true,"finalLedgerPreservesAccrual":true,"allHistoricalLogsCanonical":true,"transferBoundaryAvailable":true,"sameSnapshotCutoff":true,"cumulativeShareClaimsEqual":true,"bothSharesSettled":true,"holdersMatch":true,"minerStillActive":true,"paidMatchesClaims":true,"receivedConserved":true,"onlyDustRemains":true,"historyValid":true,"id1HistoryMatchesLedger":true,"id2HistoryMatchesLedger":true,"aPlusOwnerPaymentsMatchId1":true,"bPaymentsMatchId2":true,"allClaimsMatchTotalPaid":true,"allTransfersMatchTotalPaid":true,"cumulativeSharePaymentsEqual":true,"positiveAccruedTransferred":true,"transferPreservesEntireLedger":true,"aPaidExactTransferredAccrual":true,"id1ClaimedNotReset":true,"id2ClaimedContinuous":true,"noCreatorPaymentThisRound":true,"onlyExpectedAPaymentThisRound":true,"onlyExpectedBPaymentThisRound":true,"transferredHolderMatches":true,"boundaryERC1155BalancesMatch":true,"isolatedTransferSnapshotLedgerUnchanged":true}`。

收取后的独立检查：**POSITIVE_ACCRUED_BALANCE_CONFIRMED**，范围仅为 harvest 阶段，区块 125709696，ID 1 claimable 0.00056038 BEM。完整流程结果以本报告最终状态和全部核验项为准。

creator harvest 预演：`reports/live-accrued-transfer-simulation.json`，状态 DRY_RUN_SUCCEEDED_NO_TRANSACTION_SENT。预演观察 pending 0.00096731 BEM，最大估算 Gas 0.00000865535 BNB。预演采用 latest 读取，其观察不是原子固定区块快照；不能代替真实收取回执与正数权益检查。

- [harvest 交易](https://bscscan.com/tx/0x670075f6c17e3adf9ad924aee89adfd9a838fad31df83291b024446d0a731cb4)：区块 125709696，交易序号 73，Gas 0.0000066801 BNB。
- [transfer 交易](https://bscscan.com/tx/0xa0b5c00cd0a26e41c867204cd3a1a5a4fe013b7674fea9cf507513b9db5c6703)：区块 125712342，交易序号 77，Gas 0.0000032526 BNB。
- [a 交易](https://bscscan.com/tx/0x0285a253d79c6e321283b4e5b701b39e0c2470a1243ae72453e4217e2a853b2f)：区块 125712543，交易序号 35，Gas 0.0000034319 BNB。
- [b 交易](https://bscscan.com/tx/0xa67e3c33f46e1e93cf16b2c538b460664b1d08baefe8315fa082071d467394a9)：区块 125712665，交易序号 84，Gas 0.0000031926 BNB。

## 自部署起逐笔支付

扫描部署交易 `0xba7d0aa006f85fbf09fc47ba5f1971ebcad0a857c828c4f367e0b75965b99e93` 所在区块 125537081 至 125712665，每批最多 1000 区块。按交易及收款人逐一对账 RewardClaimed 与 BEM Transfer(from=Vault)。

| 区块 | 收款人 | 支付 BEM | 交易 |
| --- | --- | ---: | --- |
| 125545984 | A | 0.00042458 | [0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a](https://bscscan.com/tx/0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a) |
| 125643420 | A | 0.00235178 | [0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690](https://bscscan.com/tx/0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690) |
| 125643527 | B | 0.00277636 | [0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18](https://bscscan.com/tx/0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18) |
| 125686477 | creator | 0.00103905 | [0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f](https://bscscan.com/tx/0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f) |
| 125686606 | B | 0.00103905 | [0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441](https://bscscan.com/tx/0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441) |
| 125712543 | A | 0.00056038 | [0x0285a253d79c6e321283b4e5b701b39e0c2470a1243ae72453e4217e2a853b2f](https://bscscan.com/tx/0x0285a253d79c6e321283b4e5b701b39e0c2470a1243ae72453e4217e2a853b2f) |
| 125712665 | B | 0.00056038 | [0xa67e3c33f46e1e93cf16b2c538b460664b1d08baefe8315fa082071d467394a9](https://bscscan.com/tx/0xa67e3c33f46e1e93cf16b2c538b460664b1d08baefe8315fa082071d467394a9) |

最终余额仅允许分配尾数 0 或 1 个最小单位；矿机必须仍归 Vault 且 Active。

原报告与本轮独立基线均保留。BEM 逐笔事件对账适用于当前普通无扣税 ERC-20 转账语义。钱包总余额变化与 BNB Gas 不充当 Vault 收益支付证据。
