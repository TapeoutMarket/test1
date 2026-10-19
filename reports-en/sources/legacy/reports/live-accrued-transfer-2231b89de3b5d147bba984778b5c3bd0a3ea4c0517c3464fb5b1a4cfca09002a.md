# 已到账未领正数权益随 ERC-1155 转移：主网测试报告

状态：**FUNDED_AWAITING_TRANSFER**。BSC chain 56；Vault `0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`；矿机 #3204；BEM 精度 8。

本轮 ID 1 由 creator（`0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`）转回 A（`0x1b55E6A757987576E1a130A011f9E12498De7DB9`）；B（`0x63979C9d5200A5080be93eb440D469d2F2ec6682`）持有 ID 2。固定基线区块 125706961，hash `0xcc2dddfaf5ae279b435fdaed56863c7dea077164028187541f3c28ed351c725b`，2026/10/5 00:18:22（Asia/Shanghai）。

首笔 creator harvest() 只把 Mining 收益收进 Vault，随后转移 ID 1，A 与 B 分别普通 claimBatch；两个领取均不得再次 harvest。本轮专门验证转移前 Vault 已经到账的正数未领权益。所有模拟均为固定区块 eth_call，报告脚本不签名、不广播。

## 到账、待领取与实际支付（BEM）

| 指标 | 金额 |
| --- | ---: |
| 首笔 harvest 实际 BEM 转入 Vault | 0.00112075 |
| Harvested 确认新增到账 | 0.00112075 |
| 转移前 ID 1 已到账未领 | 0.00056038 |
| A 本轮实际领取 | 未执行 / UNVERIFIED |
| B 本轮实际领取 | 未执行 / UNVERIFIED |
| creator 本轮实际领取 | 未执行 / UNVERIFIED |
| A 自创建起收到 Vault 支付 | 未执行 / UNVERIFIED |
| creator 自创建起收到 Vault 支付 | 未执行 / UNVERIFIED |
| ID 1：A + creator 历史支付 | 未执行 / UNVERIFIED |
| ID 2：B 历史支付 | 未执行 / UNVERIFIED |

尚无完整四笔真实成功回执，不能将预估金额填入实际领取或宣称主网目标已经验证。

## 固定区块观察

| 时点 | 区块 | Mining pending | totalReceived | 每份累计应得 | Vault 余额 | ID 1 已领 | ID 1 可领 | ID 2 已领 | ID 2 可领 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 固定基线 | 125706961 | 0.00098682 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00381541 | 0 | 0.00381541 | 0 |
| harvest 前一区块末 | 125709695 | 0.00111528 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00381541 | 0 | 0.00381541 | 0 |
| harvest 所在区块末 | 125709696 | 0 | 0.00875158 | 0.00437579 | 0.00112076 | 0.00381541 | 0.00056038 | 0.00381541 | 0.00056038 |

以上均为区块末状态，同区块后续交易可能已包含其中；不得把 afterTransfer 区块末余额称作转移执行瞬间余额。转移交易边界由基线、全轮事件范围核验、harvest 固定快照和转移回执独立确定：UNVERIFIED。

Mining pending 可以继续增长，但未实际收取不进入 Vault。本轮到账以 BEM Transfer(to=Vault) 为准，两个普通 claim 的最后 RewardsSynced 必须为同一截止且 received=0；除首笔 harvest 外的任何真实入账都会使核验要求复核。

## 领取权与核验

- 基线 A 模拟 claimBatch([1])：Unauthorized。
- 转移后 creator 模拟 claimBatch([1])：UNVERIFIED。
- 基线 ERC-1155 数量 A ID 1 / creator ID 1 / B ID 2：0 / 1 / 1。
- 目标覆盖：`{"vaultAccruedUnclaimedFollowsShare":"UNVERIFIED","aCannotClaimBeforeTransfer":"VERIFIED_BY_PINNED_ETH_CALL","creatorCannotClaimAfterTransfer":"UNVERIFIED","alreadyClaimedDebtPreserved":"UNVERIFIED","pendingAtBaseline":"98682","pendingAtFinal":null,"actualHarvestInflow":"112075","claimable1BeforeTransfer":"56038"}`。
- 核验：`{"harvestExactCallAndReceipt":true,"harvestReceiptVerified":true,"baselineUnchangedBeforeHarvest":true,"positiveAccruedBeforeTransfer":true,"harvestedWithoutClaiming":true,"inflowMatchesReceivedDelta":true,"inflowMatchesBalanceDelta":true,"harvestCutoffMatchesSnapshot":true,"creatorHoldsFundedShare":true,"fundedMinerStillActive":true,"noOtherVaultTransactionsInRound":true,"allVaultRoundLogsDecode":true,"onlyExpectedVaultEventsInRound":true,"allRoundInflowOnlyFirstHarvest":true,"allRoundPaymentsOnlyOrdinaryClaims":true,"canonicalRoundLogs":true,"aUnauthorizedAtBaseline":true}`。

收取后的独立检查：**POSITIVE_ACCRUED_BALANCE_CONFIRMED**，范围仅为 harvest 阶段，区块 125709696，ID 1 claimable 0.00056038 BEM。收取阶段检查通过，可以按预定流程进入份额转移；四笔流程尚未完成。

creator harvest 预演：`reports/live-accrued-transfer-simulation.json`，状态 DRY_RUN_SUCCEEDED_NO_TRANSACTION_SENT。预演观察 pending 0.00096731 BEM，最大估算 Gas 0.00000865535 BNB。预演采用 latest 读取，其观察不是原子固定区块快照；不能代替真实收取回执与正数权益检查。

- [harvest 交易](https://bscscan.com/tx/0x670075f6c17e3adf9ad924aee89adfd9a838fad31df83291b024446d0a731cb4)：区块 125709696，交易序号 73，Gas 0.0000066801 BNB。

## 分阶段只读核验

保存基线：`node scripts/claim-accrued-transfer-report.mjs --mode live`。

首笔仅收取成功后：`node scripts/claim-accrued-transfer-report.mjs --mode live --harvest-tx <H>`。必须得到 FUNDED_AWAITING_TRANSFER，并确认 ID 1 claimable > 0、claimed 不变、无支付，再进入转移。

四笔分别成功后：`node scripts/claim-accrued-transfer-report.mjs --mode live --harvest-tx <H> --transfer-tx <T> --a-tx <A> --b-tx <B>`。

原报告与本轮独立基线均保留。BEM 逐笔事件对账适用于当前普通无扣税 ERC-20 转账语义。钱包总余额变化与 BNB Gas 不充当 Vault 收益支付证据。
