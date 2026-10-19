# ERC-1155 ID 1 转移与收益领取测试报告

状态：**VERIFIED_TRANSFER_AND_EQUAL_CUMULATIVE**。BSC chain 56；BEM 精度 8。本报告只统计该 Vault 的 BEM 支付，不把钱包总余额或 BNB Gas 当作收益。

- Vault：`0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`；托管矿机 ID 3204。
- A（原 ID 1 持有人）：`0x1b55E6A757987576E1a130A011f9E12498De7DB9`。
- owner（接收 ID 1）：`0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`；B（ID 2）：`0x63979C9d5200A5080be93eb440D469d2F2ec6682`。
- 固定基线：区块 125646568，hash `0x3f107ac054e3424f1b63a698555815b94b0e2a01ace0209fb210712432212d7a`，2026/10/4 16:45:18（Asia/Shanghai）。

## 本轮目的与实际覆盖

| 验证目标 | 结果 | 证据范围 |
| --- | --- | --- |
| 新持有人接收 ID 1 后能够领取 | VERIFIED_ON_LIVE | owner 真实成功领取回执、BEM 支付和 ERC-1155 持有数量 |
| 原持有人 A 转移后不能再领取 ID 1 | VERIFIED_BY_PINNED_ETH_CALL | 转移后固定区块 eth_call 返回 Unauthorized，不发送失败交易 |
| 转移前 Mining 内未收取收益由新持有人接续领取 | VERIFIED_ON_LIVE | 转移前 pending 0.00206523 BEM；转移保留账本，后续 owner 收取收益并领取 |
| 转移前已进 Vault、ID 1 已可领但未提走的正数余额随份额转移 | NOT_EXERCISED_ON_LIVE | 转移前 ID 1 claimable 0 BEM |

本轮转移前 ID 1 在 Vault 的可领取金额为 0，因此本次主网交易没有覆盖“Vault 已到账正数未领余额转移”子场景。Mining 的未收取收益与 Vault 的已入账未领取余额分开记录，不能把前者的结果当成后者的主网实测。

本轮另行执行了隔离 Mock 验证（2/2 通过），覆盖已到账未领权益随 ID 转移及已领账本不清零。记录见 `reports/live-transfer-claim-local-validation.json`；这是本地验证，不能代替上述未覆盖场景的主网实测。

## 实际领取与累计对账（BEM）

| 地址 / 份额 | 本轮前份额已领取账本 | 本轮实际支付 | 自创建起该钱包收到 Vault 支付 |
| --- | ---: | ---: | ---: |
| A（原 ID 1） | 0.00277636 | 0 | 0.00277636 |
| owner（新 ID 1） | 继承 ID 1 账本，不清零 | 0.00103905 | 0.00103905 |
| B（ID 2） | 0.00277636 | 0.00103905 | 0.00381541 |

ID 1 自创建起实际支付 = A 历史收入 + owner 收入 = **0.00381541 BEM**；ID 2 给 B 的累计实际支付 = **0.00381541 BEM**。比较的是两个份额的完整历史，不能要求 owner 钱包单独累计等于 B。

累计 ID 1 − ID 2：**0 BEM**。owner 与 B 本轮支付差：0 BEM。最终 ID 1/2 账本已领取：0.00381541 / 0.00381541；剩余可领取：0 / 0；均分尾数：0.00000001 BEM。

## 固定区块观察

| 时点 | 区块 | Mining 待领取 | 累计确认到账 | 每份累计应得 | Vault 余额 | owner 钱包 BEM 余额 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 本轮前基线 | 125646568 | 0.00015077 | 0.00555273 | 0.00277636 | 0.00000001 | 0 |
| 转移前一区块末 | 125686385 | 0.00206523 | 0.00555273 | 0.00277636 | 0.00000001 | 0 |
| 转移所在区块末 | 125686386 | 0.00206523 | 0.00555273 | 0.00277636 | 0.00000001 | 0 |
| owner 领取前一区块末 | 125686476 | 0.00206523 | 0.00555273 | 0.00277636 | 0.00000001 | 0 |
| owner 领取所在区块末 | 125686477 | 0 | 0.00763083 | 0.00381541 | 0.00103906 | 0.00103905 |
| B 领取前一区块末 | 125686605 | 0.00000278 | 0.00763083 | 0.00381541 | 0.00103906 | 0.00103905 |
| B 领取所在区块末 | 125686606 | 0.00000278 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00103905 |

| 时点 | 区块 | ID 1 累计已领取 | ID 1 已到账可领取 |
| --- | ---: | ---: | ---: |
| 本轮前基线 | 125646568 | 0.00277636 | 0 |
| 转移前一区块末 | 125686385 | 0.00277636 | 0 |
| 转移所在区块末 | 125686386 | 0.00277636 | 0 |
| owner 领取前一区块末 | 125686476 | 0.00277636 | 0 |
| owner 领取所在区块末 | 125686477 | 0.00381541 | 0 |
| B 领取前一区块末 | 125686605 | 0.00381541 | 0 |
| B 领取所在区块末 | 125686606 | 0.00381541 | 0 |

owner 领取交易内 BEM 转入 Vault：**0.0020781 BEM**；Harvested 确认入账：0.0020781 BEM。B 普通领取内 BEM 转入：0 BEM。

交易前一区块 pending 是固定区块观测，不是交易执行瞬间的精确值。实际到账使用 BEM Transfer 事件，Harvested 还可能包含此前未同步的直接转入。Mining 的新 pending 留待后续收取，不自动改变本轮 Vault 的分配截止。

## 转移与领取权限

- 转移回执核对：`{"oneExactShareTransfer":true,"noBatchTransfer":true,"noAccountingEvents":true,"noVaultBEMPaymentDuringTransfer":true}`。
- 目标操作是 ID 1 从 A → owner、数量 1，再由 owner 领取 ID 1，B 普通领取 ID 2；是否符合以各项检查为准。
- 转移后区块末的 claimed(1/2)：0.00277636 / 0.00277636 BEM。
- owner 领取在后续区块；转移所在区块末与基线 claimed/totalPaid 连续性检查：通过。
- owner 转移前不是份额持有人；其 owner 身份本身不会赋予 ID 1 领取权。
- 基线 ERC-1155 数量（A 的 ID 1 / owner 的 ID 1 / B 的 ID 2）：1 / 0 / 1。最终数量：0 / 1 / 1。
- 权限模拟辅助证据：`reports/live-transfer-claim-authority.json`（只读 eth_call；不是实际失败交易）
- owner 在基线区块无 ID 1 的领取权限：已验证，区块 125646568，claimBatch([1]) 返回 Unauthorized。
- A 在转移后失去 ID 1 的领取权限：已验证，区块 125686386，claimBatch([1]) 返回 Unauthorized。

```json
{
  "beforeTransfer": {
    "chainId": 56,
    "vault": "0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B",
    "blockNumber": "125646568",
    "blockHash": "0x3f107ac054e3424f1b63a698555815b94b0e2a01ace0209fb210712432212d7a",
    "actor": "0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129",
    "holder1": "0x1b55E6A757987576E1a130A011f9E12498De7DB9",
    "holder2": "0x63979C9d5200A5080be93eb440D469d2F2ec6682",
    "functionName": "claimBatch",
    "ids": [
      "1"
    ],
    "status": "REVERTED",
    "errorName": "Unauthorized",
    "note": "Pinned-block eth_call simulation only; no transaction submitted."
  },
  "afterTransfer": {
    "chainId": 56,
    "vault": "0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B",
    "blockNumber": "125686386",
    "blockHash": "0xedf1d320d0a6d3c06058776571c4aa8eabce89bea64d7b3faedc31044d03f710",
    "actor": "0x1b55E6A757987576E1a130A011f9E12498De7DB9",
    "holder1": "0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129",
    "holder2": "0x63979C9d5200A5080be93eb440D469d2F2ec6682",
    "functionName": "claimBatch",
    "ids": [
      "1"
    ],
    "status": "REVERTED",
    "errorName": "Unauthorized",
    "note": "Pinned-block eth_call simulation only; no transaction submitted."
  }
}
```


转移预演证据（只读模拟，不是实际转移）：`reports/live-transfer-claim-simulation.json`。

```json
{
  "status": "DRY_RUN_SUCCEEDED_NO_TRANSACTION_SENT",
  "mode": "live",
  "chainId": 56,
  "vault": "0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B",
  "sender": "0x1b55E6A757987576E1a130A011f9E12498De7DB9",
  "recipient": "0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129",
  "shareId": "1",
  "shareAmount": "1",
  "operation": "transfer",
  "preflightReportedBlock": "125646185",
  "pendingObserved": "12621",
  "vaultBemBalanceObserved": "1",
  "gasWithBuffer": "90536",
  "gasPrice": "50000000",
  "maximumFeeBNB": "0.0000045268",
  "calldataHash": "0x0c2e5dc6aab6ce7bd09f20997ded75bc507f45f6cf0f21982087465bb3da4018",
  "note": "CLI preflight reads and simulation used their respective latest states, not one pinned block. This is a transfer simulation only; subsequent owner/B claims have not been executed."
}
```


## 交易与核验

- [A 转移 ID 1](https://bscscan.com/tx/0xa4c188fc662453dd42b59117e0a8f2511861919cee1ac0faaa2b2ad63cc4ed40)：区块 125686386，序号 62，Gas 0.0000032526 BNB。
- [owner 收取收益并领取](https://bscscan.com/tx/0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f)：区块 125686477，序号 39，Gas 0.0000090222 BNB。
- [B 普通领取](https://bscscan.com/tx/0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441)：区块 125686606，序号 38，Gas 0.0000034326 BNB。
- 历史扫描：部署区块 125537081 至 125686606，逐交易、逐收款人核对 Vault RewardClaimed 与 BEM Transfer(from=Vault)。
- 核验通过：转移后 owner 能领取 ID 1；ID 1 的 A 与 owner 历史支付合计和 ID 2 的 B 历史支付相等，ID 1 既往 claimed 未被重置。
- 检查结果：`{"ownerAndBClaimsMatch":true,"transferExactCall":true,"transferReceiptMatches":true,"threeDistinctTransactions":true,"transferAfterBaseline":true,"transferBeforeOwnerClaim":true,"ownerBeforeBClaim":true,"oneExactShareTransfer":true,"noBatchTransfer":true,"noAccountingEvents":true,"noVaultBEMPaymentDuringTransfer":true,"aReceiptVerified":true,"bReceiptVerified":true,"sameReceiptCutoff":true,"ownerUnauthorizedBeforeTransfer":true,"aUnauthorizedAfterTransfer":true,"transferERC1155BalancesMatch":true,"finalERC1155BalancesMatch":true,"sameSnapshotCutoff":true,"cumulativeShareClaimsEqual":true,"bothSharesSettled":true,"holdersMatch":true,"minerStillActive":true,"paidMatchesClaims":true,"receivedConserved":true,"onlyDustRemains":true,"historyValid":true,"id1HistoryMatchesLedger":true,"id2HistoryMatchesLedger":true,"aPlusOwnerPaymentsMatchId1":true,"bPaymentsMatchId2":true,"allClaimsMatchTotalPaid":true,"allTransfersMatchTotalPaid":true,"cumulativeSharePaymentsEqual":true,"id1ClaimedNotReset":true,"id2ClaimedContinuous":true,"noAPaymentThisRound":true,"onlyExpectedOwnerRoundPayment":true,"onlyExpectedBRoundPayment":true,"transferredHolderAtBlockEnd":true,"transferBlockLedgerCompatible":true}`。

## 自部署起逐笔支付

| 区块 | 收款人 | BEM | 交易 |
| --- | --- | ---: | --- |
| 125545984 | A（原 ID 1 持有人） | 0.00042458 | [0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a](https://bscscan.com/tx/0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a) |
| 125643420 | A（原 ID 1 持有人） | 0.00235178 | [0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690](https://bscscan.com/tx/0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690) |
| 125643527 | B（ID 2） | 0.00277636 | [0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18](https://bscscan.com/tx/0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18) |
| 125686477 | owner（新 ID 1 持有人） | 0.00103905 | [0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f](https://bscscan.com/tx/0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f) |
| 125686606 | B（ID 2） | 0.00103905 | [0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441](https://bscscan.com/tx/0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441) |

## 比较边界

三笔交易按区块及 transactionIndex 排序，不要求同时发送。同一到账截止由 owner/B 各自回执的最后一条 RewardsSynced 及固定区块账本共同核对。若中间另有实际 BEM 到账并被 B 同步，报告会要求复核。单纯 Mining pending 增长不影响本轮截止。

ERC-1155 转移的是 ID 1 的领取权及未领权益，A 已经领取的历史金额仍计入 ID 1，不能重新领取。最终须保持矿机仍归 Vault、状态 Active、ID 1 归 owner、ID 2 归 B；两份额结算完仅允许剩余 0 或 1 个 BEM 最小单位。BEM 事件对账以普通无扣税 ERC-20 语义为前提。原 A 单独领取及 A/B 对比报告均保留。
