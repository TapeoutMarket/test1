# 第五轮：NFT 归集与矿机、BEM 全额赎回报告

状态：**VERIFIED_FULL_REDEMPTION**。只读核验已发送交易；没有签名或广播。金额单位 BEM，精度 8 位，保留完整原始整数于 JSON。

## 对象与结果

- 网络：BSC 主网，chainId 56；Vault：`0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`。
- A：`0x1b55E6A757987576E1a130A011f9E12498De7DB9`；B：`0x63979C9d5200A5080be93eb440D469d2F2ec6682`；owner：`0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`。
- 矿机集合：`0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C`；矿机 ID：3204。
- 流程：B 将收益 NFT #2 转给 A；A 持有 #1、#2 后调用 redeemMiner()，同一交易收取 Mining、结算两份未领收益及尾数、销毁两份 NFT、将矿机转给 A。
- 结束时间：2026/10/5 01:34:08（Asia/Shanghai），区块 125717060。

| 本轮指标 | BEM | 原始单位 |
| --- | ---: | ---: |
| 赎回前 Mining pending（前一区块末观察） | 0.00034903 | 34903 |
| 赎回前 Vault 已有余额 | 0 | 0 |
| 本次实际转入 Vault | 0.00035546 | 35546 |
| ID 1 结算给 A | 0.00017773 | 17773 |
| ID 2 结算给 A | 0.00017773 | 17773 |
| 尾数单独支付给 A | 0 | 0 |
| A 本轮实际收到 Vault 支付 | **0.00035546** | 35546 |
| B / owner 本轮收到 Vault 支付 | 0 / 0 | 0 / 0 |
| 最终 Vault 余额 | 0 | 0 |

收款以 BEM Transfer(from=Vault,to=A) 为准；两份权益分别以 RewardClaimed 为准。redeemMiner 没有发出 RemainderClaimed，尾数以最后 RewardsSynced.remainder、独立 BEM 转账及到账与份额金额之差交叉核对。Mining pending 的历史观察值不代替交易实际到账。

覆盖边界：本轮赎回前 Vault 原余额为 0，因此验证的是本次 Mining 实际到账后的一笔全额结算；没有主网覆盖“赎回前已有非零余额 + 本次新增 Mining 收益共同清空”的场景。本轮尾数为 0，真实链上未发生非零尾数付款；非零尾数事件对账仅在离线合成测试中覆盖。

## 矿机、份额与账本

| 时点 | 区块 | NFT #1 持有人 | NFT #2 持有人 | totalReceived | totalPaid | claimed(1) | claimed(2) | Vault 余额 |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 上轮结算基线 | 125712665 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0x63979C9d5200A5080be93eb440D469d2F2ec6682 | 0.00875158 | 0.00875158 | 0.00437579 | 0.00437579 | 0 |
| 转移前一区块末 | 125716941 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0x63979C9d5200A5080be93eb440D469d2F2ec6682 | 0.00875158 | 0.00875158 | 0.00437579 | 0.00437579 | 0 |
| 转移所在区块末 | 125716942 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0.00875158 | 0.00875158 | 0.00437579 | 0.00437579 | 0 |
| 赎回前一区块末 | 125717059 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 0.00875158 | 0.00875158 | 0.00437579 | 0.00437579 | 0 |
| 赎回所在区块末 | 125717060 | 0x0000000000000000000000000000000000000000 | 0x0000000000000000000000000000000000000000 | 0.00910704 | 0.00910704 | 0.00455352 | 0.00455352 | 0 |

最终矿机 ownerOf(3204)：`0x1b55E6A757987576E1a130A011f9E12498De7DB9`；Vault state=2（Closed），closeReason=1（Redeemed），redeemedBeneficiary=`0x1b55E6A757987576E1a130A011f9E12498De7DB9`。两份供应量分别 0 / 0；A/B 对两份的余额均为 0。销毁收益 NFT 不会清空 claimed 历史。

## 自部署至赎回累计对账

| 口径 | 累计 BEM |
| --- | ---: |
| NFT #1 历任持有人领取 | 0.00455352 |
| NFT #2 历任持有人领取 | 0.00455352 |
| A 钱包收到 Vault 支付 | 0.0036922 |
| B 钱包收到 Vault 支付 | 0.00437579 |
| owner 钱包收到 Vault 支付 | 0.00103905 |
| 不归属于单个 ID 的尾数 | 0 |
| 全部份额领取 + 尾数 | 0.00910704 |

ID 2 本轮由 A 领取，因此“ID 2 累计”与“B 钱包累计”已经不同；不能再把 A+owner 钱包之和当作 ID 1 累计。累计来源为已验证的上轮完整历史（部署区块 125537081 至 125712665）加本轮完整事件扫描（125712666 至 125717060）；本次未重复扫描上轮截止以前的全部日志。旧报告状态、检查项、账本和历史金额已重新校验，并重新核对基线区块 hash。

赎回结束区块外部 Mining pending=0 BEM。此时矿机归 A，该观察属于退出后的矿机，不再构成 Vault 份额权益。

## 交易与检查证据

- [transfer](https://bscscan.com/tx/0x189b173121d493d303f21f0487d0655fc87098788a0646924c6ed7dc796fd383)：区块 125716942；状态 success；实际 Gas 费 0.0000032527 BNB；区块 hash `0xa3a4f60286ce86c172cce4e6ecaf7501e74e253bbc2eddfcb293ea2107660219`。
- [redeem](https://bscscan.com/tx/0xf9f3825bcdc4ae1c4397479a4c77a16492ce38f230b930655a8c1cffc1657e17)：区块 125717060；状态 success；实际 Gas 费 0.0000110884 BNB；区块 hash `0x80ae5a7f8984572c218a79e2ebedd8a136ec7d7c2daac8fc759214ea34ebc5e4`。

两笔交易位于不同区块；所有快照均为固定区块末状态。完整扫描基线后一块到赎回块的 Vault 全部事件及 BEM 流入/流出，排除本轮未指定的会计活动。重新核对各快照区块 hash；领取事件、矿机 ERC-721 Transfer、两次 ERC-1155 burn、状态与供应量互相印证。

通过 59/59 项。所有核验项通过。

```json
{
  "transferExactCallAndOriginalReceipt": true,
  "redemptionExactCallAndOriginalReceipt": true,
  "distinctTransactions": true,
  "transferAfterBaseline": true,
  "transferBeforeRedemptionDifferentBlocks": true,
  "onlyOneExactBToAShare2": true,
  "transferHasNoOtherVaultEvent": true,
  "transferHasNoVaultBEMMovement": true,
  "transferDoesNotMoveMiner": true,
  "oneAHarvest": true,
  "positiveInflowMatchesHarvest": true,
  "twoSyncsSameCutoff": true,
  "bothShareClaimEventsToA": true,
  "onlyAReceivesVaultPayment": true,
  "dustMatchesSyncRemainder": true,
  "aggregateAndDustTransfersMatch": true,
  "twoExactShareBurns": true,
  "exactMinerTransferToA": true,
  "oneRedeemedClosureToA": true,
  "onlyRedemptionVaultEvents": true,
  "allReceiptLogsCanonical": true,
  "ledgerUnchangedSinceBaseline": true,
  "transferPreservesEntireLedger": true,
  "noInterveningAccountingBeforeRedemption": true,
  "beforeTransferSharesMatch": true,
  "consolidatedBothSharesAtA": true,
  "activeCustodyUntilRedemption": true,
  "receivedIncreasesByActualInflow": true,
  "paidIncreasesByActualAPayment": true,
  "claim1HistoryPreserved": true,
  "claim2HistoryPreserved": true,
  "finalClaimsAndAccumulatorMatch": true,
  "syncMatchesFinalAccounting": true,
  "accumulatorIncludesCarry": true,
  "dustMatchesCarry": true,
  "fullBalanceAndInflowPaidToA": true,
  "finalVaultClosedRedeemedToA": true,
  "noSharesOrSupplyRemain": true,
  "finalNoClaimableOrRemainder": true,
  "finalReceivedFullyPaid": true,
  "noOtherVaultTransactionsInRound": true,
  "allVaultLogsDecode": true,
  "onlyExpectedRoundVaultEvents": true,
  "allInflowOnlyRedemption": true,
  "allPaymentsOnlyRedemptionToA": true,
  "scopedLogsMatchReceiptCounts": true,
  "allRoundLogsCanonical": true,
  "priorReportAndChecksVerified": true,
  "priorHistoryCutoffMatchesBaseline": true,
  "priorClaimEventsMatchBaseline": true,
  "priorTransfersMatchBaselinePaid": true,
  "priorHistoryHasNoDust": true,
  "historyClaimsMatchFinalLedger": true,
  "historyTransfersMatchFinalPaid": true,
  "knownWalletsReconcileAllPayments": true,
  "shareClaimsPlusSeparateDustMatchPaid": true,
  "transferReceiptBlockMatches": true,
  "redemptionReceiptBlockMatches": true,
  "allSnapshotsStillCanonical": true
}
```

## 100 份场景的边界

本次已部署合约固定只有 ID 1 和 2，claimBatch 数组长度最多 2；本轮主网测试没有验证 100 份。扩展为 1–100、每个 ID 一份且支持批量领取的合约时，A 可在一次 claimBatch 中传入其持有的 45 个 ID，B 同理传入 55 个 ID，分别用一笔交易合并领取各 ID 的未领金额；若还要收取 Mining，可使用相应批量 harvestAndClaim。需要实现并验证 100 份的账本和 gas 上限，前端应列出实际持有 ID；不会仅凭钱包持有数量自动枚举。各 ID 历史领取记录仍分别扣除，不能简单按当前池余额乘 45% 或 55% 支付。
