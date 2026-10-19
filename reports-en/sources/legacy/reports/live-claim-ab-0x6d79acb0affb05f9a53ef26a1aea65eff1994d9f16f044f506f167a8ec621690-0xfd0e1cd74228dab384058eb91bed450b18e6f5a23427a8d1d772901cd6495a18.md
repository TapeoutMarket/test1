# A / B 累计领取对比报告

状态：**VERIFIED_EQUAL_CUMULATIVE**。网络：BSC chain 56，BEM 精度 8。本报告的累计金额仅指该 Vault 自创建起支付给 A / B 的 BEM，不是钱包总余额，不扣除 BNB Gas。

Vault：`0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`；矿机 ID 3204。
A（ID 1）：`0x1b55E6A757987576E1a130A011f9E12498De7DB9`；B（ID 2）：`0x63979C9d5200A5080be93eb440D469d2F2ec6682`。
本轮前基线：区块 125607064，hash `0x8f877f02b69a0538758daa238f90d60a07a499ed2bcd073e8eee3a7dd6be6f6a`，2026/10/4 11:48:55（Asia/Shanghai）。

## 领取金额（BEM）

| 地址 / 份额 | 本轮前累计已领账本 | 本轮实际领取 | 自创建起累计实际支付 | 本轮结束剩余可领取 |
| --- | ---: | ---: | ---: | ---: |
| A / ID 1 | 0.00042458 | 0.00235178 | 0.00277636 | 0 |
| B / ID 2 | 0 | 0.00277636 | 0.00277636 | 0 |

| 观察时点 | 区块 | Mining 待领取 BEM | 累计确认到账 BEM | 每份累计应得 BEM | Vault BEM 余额 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 本轮前基线 | 125607064 | 0.00294041 | 0.00084916 | 0.00042458 | 0.00042458 |
| A 交易前一区块末 | 125643419 | 0.00469993 | 0.00084916 | 0.00042458 | 0.00042458 |
| A 交易所在区块末 | 125643420 | 0 | 0.00555273 | 0.00277636 | 0.00277637 |
| B 交易前一区块末 | 125643526 | 0 | 0.00555273 | 0.00277636 | 0.00277637 |
| B 交易所在区块末 | 125643527 | 0 | 0.00555273 | 0.00277636 | 0.00000001 |

本轮 A 交易内 BEM 转入 Vault：**0.00470357 BEM**；Harvested 确认入账：0.00470357 BEM。B 交易内转入：0 BEM。

交易前一区块是固定区块观察，不是交易执行瞬间的 pending。实际转入以 BEM Transfer 事件记录；Harvested 可能还包含此前未同步的转入，不能机械地把 pending 或 Harvested 当作 Mining 本笔支付。

## 交易与结论

- [A 领取交易](https://bscscan.com/tx/0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690)，区块 125643420，序号 95，Gas 0.0000091622 BNB。
- [B 领取交易](https://bscscan.com/tx/0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18)，区块 125643527，序号 72，Gas 0.0000051426 BNB。
- 历史扫描：从部署区块 125537081 到 125643527，Vault RewardClaimed 与 BEM Transfer(from=Vault)；逐交易、逐接收人核对，并与 claimed(1/2) 及 totalPaid 对账。
- 累计 A − B：0 BEM。
- 核验通过：同一批已到账收益下，自创建起 A 与 B 累计实际领取相等。
- 分配余数：0.00000001 BEM。
- 检查结果：`{"aExactCall":true,"bExactCall":true,"receiptsMatch":true,"receiptActorsMatch":true,"afterBaseline":true,"aBeforeB":true,"aReceiptVerified":true,"bReceiptVerified":true,"sameReceiptCutoff":true,"sameSnapshotCutoff":true,"cumulativeShareClaimsEqual":true,"bothSharesSettled":true,"holdersMatch":true,"minerStillActive":true,"paidMatchesClaims":true,"receivedConserved":true,"onlyDustRemains":true,"historyValid":true,"id1HistoryMatchesLedger":true,"id2HistoryMatchesLedger":true,"aWalletPaymentsMatchId1":true,"bWalletPaymentsMatchId2":true,"allClaimsMatchTotalPaid":true,"allTransfersMatchTotalPaid":true,"cumulativeWalletPaymentsEqual":true,"aRoundReconcilesBaseline":true,"bRoundReconcilesBaseline":true}`。

## 自部署起逐笔实际支付

| 区块 | 收款人 | 支付 BEM | 交易 |
| --- | --- | ---: | --- |
| 125545984 | A | 0.00042458 | [0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a](https://bscscan.com/tx/0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a) |
| 125643420 | A | 0.00235178 | [0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690](https://bscscan.com/tx/0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690) |
| 125643527 | B | 0.00277636 | [0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18](https://bscscan.com/tx/0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18) |

## 比较口径

这两笔交易不是原子操作，也不保证同一区块。本轮前 A 比 B 多领 0.00042458 BEM，因此在同一到账截止下，本轮 B 应补领相应历史差额。不能要求“本轮金额相等”来代替“累计金额相等”。

Mining pending 增长不会自动进入 Vault。若两笔之间又有实际 BEM 到账（额外 harvest、第三方领取或转入），B 的普通 claim 也会同步入账，这时可能不在同一比较截止，需复核而非强行判通过。pending 预读量不等同于实际到账量。

同区块时两份 snapshot 都是区块末态，必须使用两笔各自的 RewardsSynced 与 RewardClaimed / BEM Transfer 事件辨别。领取顺序按区块及 transactionIndex 核对。尾数按最小单位保留，允许 Vault 最后剩一个最小单位。

模拟证据另存 live-claim-ab-simulations.json：两次模拟独立执行，B 的模拟未使用 A 实际执行后的状态，不能冒充完整主网流程。最终通过只依赖真实成功回执、历史支付和固定区块账本。BEM 事件核验以普通无扣税 ERC-20 转账语义为前提。
