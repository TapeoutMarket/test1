# TapeOut 拼单合约：真实 BSC 状态本地 fork 测试报告

本轮结果：**23 个场景全部 PASS，取得 25 笔本地 fork 交易回执**。固定 BSC 状态中的真实 Seaport、矿机 NFT、Mining 与 BEM 完成了购买、入库、收益分配、未领权益转移、完整归集及退出。主网交易、市场 API 与数据库写入均为 0。

这 25 笔包含随后恢复快照的 guardian 退款分支和正常赎回分支，不能当作一条最终保留链上的连续交易，也不能当作主网交易哈希查询。本报告金额从机器报告读取，以整数进行交叉核验。另有独立 Mining 结算诊断的 2 笔 fork 回执，诊断完成后已恢复快照，不计入主流程的 25 笔。

**本轮发现并修复了一个实际兼容问题：Mining.pending() 返回 0 时，claim() 仍可能结算正数收益。**旧 Vault 以 pending 非零为条件调用 claim，会漏掉这部分即时结算。下述结论仅对应移除该门控并重新执行后的版本。[first-pass 历史报告](../reports/real-bsc-fork-tests-first-pass.json)与 [before-pending-fix 历史报告](../reports/real-bsc-fork-tests-before-pending-fix.json)保留用于追踪问题，不能再作为当前发布结论。

## 1. 执行范围、角色和真实状态

- 执行时间（Asia/Shanghai）：2026-10-19T20:46:52+08:00 至 2026-10-19T20:47:20+08:00。
- BSC chain ID：56。
- 固定源区块：128554249。
- 固定源区块 hash：0xe44fafd52f2b1da68b810514554c21061d327cccb046b6c8afdfb315a1ef991d。
- 执行网络：仅本机 127.0.0.1 上的 Anvil fork；上游真实 RPC 通过只读代理提供状态。
- 矿机：ERC-721 #3204；Vault 收益凭证：ERC-1155 #1–100，每个 ID 数量为 1。
- BEM decimals：8。所有 BEM 数值同时保留 raw 最小单位和 8 位小数表示。
- 机器报告：[real-bsc-fork-tests.json](../reports/real-bsc-fork-tests.json)；独立保存的订单预检：[real-fork-preflight.json](../reports/real-fork-preflight.json)。

| 角色 | 地址 | 本轮用途 |
| --- | --- | --- |
| creator | 0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129 | 发起人；Timelock proposer/executor；测试手续费收款人 |
| A | 0x1b55E6A757987576E1a130A011f9E12498De7DB9 | 初始矿机所有者/卖家；认购 #1–45；最终归集 100 份并取回矿机 |
| B | 0x63979C9d5200A5080be93eb440D469d2F2ec6682 | 认购 #46–100；Factory guardian；接收 #1 后领取其未领收益 |

准备辅助程序读取了用户授权的 .env，用于取得 RPC 并派生/核对公开地址；报告未保存密钥或 provider 凭据。测试 runner 本身只读取公开观测报告与本地 manifest，**不读取 .env 或私钥**。本轮使用本地 Anvil impersonation，没有用真实私钥签名。三个地址各获模拟 100 BNB，仅存在于 fork。

| 真实合约 | 地址 |
| --- | --- |
| collection | 0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C |
| mining | 0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46 |
| bem | 0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a |
| market | 0x0000000000000068F116a894984e2DB1123eB395 |

上表合约代码与资产状态来自固定源区块；Seaport information() 返回版本 1.6。本轮没有把阶段一“本地 Seaport 1.5 + Mock 资产”的结果当作此项验证，没有修改真实 NFT、Mining、BEM 或 Seaport 的代码与 storage。

## 2. 订单、费用和本地治理部署

矿机卖价 **0.3 BNB**，测试手续费 **0.003 BNB**，买方合计支付 **0.303 BNB**。

| 项目 | raw wei | BNB |
| --- | ---: | ---: |
| 卖家 A 收款 | 300000000000000000 | 0.300000000000000000 |
| 测试手续费收款人 creator | 3000000000000000 | 0.003000000000000000 |
| 买方总支付 | 303000000000000000 | 0.303000000000000000 |
| 每个 ID 认购价 | 3030000000000000 | 0.003030000000000000 |

creator 是本次订单设置的测试费收款地址，不代表真实市场的手续费配置。A 同时担任卖家与部分认购人，用于复用给定的三个测试地址；认购本金与卖家收款分别核对。

本次 order hash：0x157965afaffa5c5949ab133f9da4054d7607201aad675c29b81fc0f6370c3f2a。

[本次 fork 订单文件](../fixtures/fork-created-3204-157965afaffa5c59.json)中的 signature 为 0x。A 在本机 fork 调用真实 Seaport.validate，使订单在这条 fork 上有效。**该订单不是主网已发布的签名订单，也没有向市场 API 发布。**

| 组件 | 仅存在于本机 fork 的部署地址 |
| --- | --- |
| template | 0x91dda15869d9a9261799ebfa1126cf9dfac0d43a |
| timelock | 0x02f453192530e07541e61b43da079273f410979b |
| factoryImplementation | 0xe45d94579425a6a2006d3e067c8d51de6b15c4fc |
| factory | 0x4c680b72d3561d7649e3df85e78fb588fcff9db1 |
| vault | 0x3059065Fc566A17d80AdDFcc2BD5f677AF300Acb |

Timelock proposer/executor 为 creator，独立 guardian 为 B。测试延迟为 1 秒，实际执行了 scheduleBatch、推进本地时间、executeBatch。该配置不是生产治理。Vault 是固定实现的 ERC-1167 clone，无资产管理 owner，不能升级；Factory 权限边界另以退款与 ACTIVE 状态拒绝测试核验。

## 3. 募资、退出、guardian 退款和真实购买

A 认购 #1–45，合计 0.136350000000000000 BNB。A 退出 #1 时，扣除 gas 后核对返还本金为 0.003030000000000000 BNB。该 ID 释放后由 A 重新认购，恢复持有 45 份。

在这一募资状态建立快照，单独测试 guardian：

1. B 调用 Factory.guardianCancel(reason=3)，Vault 从 FUNDING 进入 REFUNDABLE。
2. B 和 creator 尝试替 A 退款，仅模拟，均以 NotHolder 拒绝；没有发送越权交易。
3. A 退出全部 45 份，核对本金返还 0.136350000000000000 BNB，Vault 募资余额和有效份数归零，矿机仍由 A 持有。
4. 恢复快照，回到 45 份募资状态。取消与退款分支不成为后续购买流程的前置事实。

B 随后认购 #46–100，支付 0.166650000000000000 BNB。第 100 份入账在同一笔交易中触发真实 Seaport 成交：

- 矿机 #3204 所有者变为本地 Vault，状态为 ACTIVE。
- A 实际收到 300000000000000000 wei，即 0.300000000000000000 BNB。
- creator 实际收到 3000000000000000 wei，即 0.003000000000000000 BNB。
- ACTIVE 后 B 再尝试 guardianCancel，仅模拟，以 InvalidState 拒绝。

这些检查支持本轮权限结论：guardian 能终止未买成的募资并开放持有人退款，不能替参与人拿走本金，也不能通过该入口控制已购矿机。

## 4. pending 门控问题、最小修复和首次真实入账

### 4.1 发现、复现与修复

最初完整流程能够通过，是因为二次 harvest 当时只检查 Vault 有正余额，旧余数也能满足断言。随后针对真实 Mining 单独诊断，发现推进时间后 pending 为 0，直接 claim 仍产生正数 BEM；因此“pending=0 就没有可领取收益”的假设不成立。

归档诊断 [test-real-mining-settlement.mjs](../scripts/test-real-mining-settlement.mjs) 在同一固定源状态的全新本地快照中复现，报告为 [real-mining-settlement](../reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json)，执行时间 2026-10-19T20:46:36+08:00 至 2026-10-19T20:46:46+08:00：

| 诊断操作 | pending 前值 raw | 实际 BEM 增量 raw | 本地交易 hash |
| --- | --- | --- | --- |
| first-claim | 13532613 | 13533051 | 0x72fecb1f622b9e5f8fbcb3cb9d365e5d178110346196b3fe5aafa1c2856f6135 |
| second-claim-after-3600-seconds | 0 | 37601 | 0x0c08fd994c6ad53949f04bacf5f5d8c24321b9dce39590f17f919faf99c9066f |

第一次 claim 后，在其确切区块 128554250 以 eth_call 立即重复调用，pending 为 0，结果 SUCCESS、返回 0x；它是只读模拟，不是一笔交易。随后推进本地时间 3,600 秒，第二次交易的 pending 前值仍为 0，实际收到 37,601 raw（0.00037601 BEM），余额增量与 Transfer 事件净值一致。诊断结束已停止 impersonation 并恢复原快照，原始状态再次核对成功。

[GroupBuyVault.sol](../src/GroupBuyVault.sol) 的最小修改是：_harvest 不再用 pending() != 0 决定是否调用 Mining.claim；按矿机 key 调用 claim，并继续只按 Vault 实际收到的 BEM 记账。Mining 调用失败仍向上传播，没有吞掉异常或给账本记入未到账收益。claimBatch 仍只领取 Vault 已入账权益，不调用 Mining；redeemWithoutHarvest 仍保留跳过 Mining/BEM 依赖的退出路径。

新增以下 5 个本地单测，属于 Mock 行为回归，与本节真实 fork 证据分开：

| 测试 | 验证点 |
| --- | --- |
| testHarvestSettlesNewRewardsWhenCachedPendingIsZero | 首次领取后 pending=0，新增未结算收益仍被二次 harvest 收入并分配 |
| testHarvestAndClaimPaysRewardsNotReportedByPending | pending=0 的收益可经 harvestAndClaim 入账并领取，保留其他 ID 的权益 |
| testNormalRedeemSettlesRewardsNotReportedByPending | 正常赎回结算 pending 未反映的收益，支付全部余额并销毁份额 |
| testHarvestPropagatesZeroRewardAndMiningFailures | 零收益拒绝或 Mining 故障时回滚，不产生虚假账本入账 |
| testClaimBatchDoesNotDependOnMiningOrSettleItsRewards | 只领已入账权益不依赖 Mining，不碰未结算收益 |

测试源码：[FundingRewards.t.sol](../test/unit/FundingRewards.t.sol)。修复后的全量回归通过：79 个 Solidity 测试全部 Success，其中 FundingRewards 的 24 项包含上列 5 项新增回归，已逐项核对 Success；78 个 SDK 测试、typecheck、gas、format 和 export 也均通过。完整单测执行结果保存在 [solidity-tests.json](../reports/solidity-tests.json)，SDK 结果见 [sdk-tests.txt](../reports/sdk-tests.txt)。主 runner 同时加强断言：推进 3,600 秒后，必须确认 pendingBeforeRaw=0 且 actualNewVaultInflowRaw>0，旧余数不再能够让该项通过。

### 4.2 首次真实 BEM 入账和批量领取

harvest 前 Mining.pending 为 13,532,613 raw（0.13532613 BEM）。实际进入 Vault 的数额为 13,533,093 raw（0.13533093 BEM），以余额增量和回执为准。pending 读取与实际到账不是同一个观测值。本轮直接交易证据确认 claim 可以结算 pending 未反映的正数收益；完整产出公式及源码级语义仍不在本轮核验范围。

| 记录 | raw 最小单位 | BEM | 依据 |
| --- | --- | --- | --- |
| harvest 前 Mining.pending | 13,532,613 | 0.13532613 | 预先读取的 pending |
| 实际进入 Vault | 13,533,093 | 0.13533093 | Vault 余额增量 |
| 每个 ID 记账权益 | 135,330 | 0.00135330 | 实际入账除以 100，整数向下取整 |
| A 领取 #2–45，共 44 份 | 5,954,520 | 0.05954520 | 一笔 claim-batch |
| B 领取 #46–100，共 55 份 | 7,443,150 | 0.07443150 | 一笔 claim-batch |
| 转移后 B 领取 #1 | 135,330 | 0.00135330 | 一笔 claim-batch |
| 分配后余数 | 93 | 0.00000093 | 留在 Vault，退出时结清 |

整数关系已经程序核对：

    13533093 = 100 × 135330 + 93
    5954520 + 7443150 + 135330 + 93 = 13533093

A 第一次有意只领取 #2–45，共 44 个 ID，保留 #1 的正数未领权益。一笔 claim-batch 向 A 支付 0.05954520 BEM；这一笔 B 收到 0，B 的每个未领 ID 保留 0.00135330 BEM。B 随后一笔交易领取 #46–100 共 55 份，收到 0.07443150 BEM。

这验证了**传入多个自有 ID，可用一笔交易领取这些 ID 的未领权益**。调用方需要列出要领取的 ID；不是每次按当前持有 NFT 数量把 Vault 全余额重新分配。

账本金额均为 raw 最小单位：

| 检查点 | 本地块号 | 累计入账 raw | 累计支付 raw | Vault 余额 raw | 余数 raw |
| --- | --- | --- | --- | --- | --- |
| 首次 harvest 后 | 128554264 | 13,533,093 | 0 | 13,533,093 | 93 |
| A 领取 44 份后 | 128554265 | 13,533,093 | 5,954,520 | 7,578,573 | 93 |
| B 领取 55 份后 | 128554266 | 13,533,093 | 13,397,670 | 135,423 | 93 |
| #1 转移后 | 128554267 | 13,533,093 | 13,397,670 | 135,423 | 93 |
| B 领取 #1 后 | 128554268 | 13,533,093 | 13,533,000 | 93 | 93 |

## 5. 未领取权益随 #1 转移

转移前，A 的 #1 尚未领取 135,330 raw（0.00135330 BEM）。

- A 把 #1 转给 B 后，holderOf(1) 变为 B；claimed(1) 不变，claimable(1) 仍为 135,330 raw。
- 原持有人 A 再领取 #1，仅模拟，以 NotHolder 拒绝。
- 新持有人 B 实际领取，B 余额增加 135,330 raw（0.00135330 BEM），随后 claimable(1)=0。
- 已领取收益没有重复支付；随 NFT 移动的是该 ID 的未领账本权益。

holder、claimed、claimable、真实 BEM 余额增量和支付回执共同验证了新地址可用，以及正数未领 BEM 权益随 ID 转移。

## 6. 归集 100 份及两个退出分支

B 把 #1 与 #46–100 共 56 份转给 A。balanceOfBatch 核对 A 对 #1–100 每个 ID 的余额都是 1。

随后推进本地时间 3,600 秒。第二次 harvest 前 pending 读数为 **0**，Vault 只有此前余数 93 raw；修复后实际新增入账 **37,601 raw（0.00037601 BEM）**。该交易的余额增量与累计入账增量一致，验证了 pending=0 也必须尝试实际结算。

| 检查项 | 二次 harvest 前 raw | 二次 harvest 后 raw |
| --- | ---: | ---: |
| 累计入账 totalAccounted | 13,533,093 | 13,570,694 |
| 累计支付 totalPaid | 13,533,000 | 13,533,000 |
| Vault BEM 余额 | 93 | 37,694 |
| 每 ID 累计 accPerShare | 135,330 | 135,706 |
| 余数 remainder | 93 | 94 |

退出基线有 **37,694 raw（0.00037694 BEM）**，由旧余数与第二次正收益构成，不能只称为 dust：

    37694 = 93 + 37601
    37694 = 100 × 376 + 94
    13570694 = 13533000 + 37694

从这一相同快照基线，分别验证两个互斥退出分支：

| 分支 | 矿机与份额 | 退出时 BEM | 后续 |
| --- | --- | --- | --- |
| redeemMiner | 矿机给 A，100 份全部销毁 | A 收到 37694 raw（0.00037694 BEM），Vault 清零 | 核验后恢复快照 |
| redeemWithoutHarvest | 矿机给 A，100 份全部销毁 | Vault 保留 37694 raw，A 的 BEM 不变 | A 再 claimResidual，领取 37694 raw（0.00037694 BEM） |

**正常赎回分支独立对账：**基线 Vault 余额 37,694 raw，加上赎回当笔累计入账增量 0 raw，等于 A 此分支收到的 37,694 raw。本次赎回与前一 harvest 的本地区块时间戳相同，实测额外入账为 0。redeemMiner 会再次尝试 Mining.claim，其他执行时刻可能又有新增收益，不能预设支付一定等于快照前余额；本轮并未宣称赎回当笔已测到额外正收益。

**跳过 harvest 分支独立对账：**矿机退出交易的 BEM Transfer 事件数为 0，A 当笔 BEM 增量为 0，Vault 余额仍为 37,694 raw。之后 claimResidual 才将这笔已有 BEM 付给赎回受益人 A，余额归零。此分支没有尝试领取仍留在 Mining 的任何新增收益，矿机随后已归 A。这里未注入真实 Mining 或 BEM 故障。

最终保留后一分支：矿机归 A，Vault 为 REDEEMED，有效份数 0，Vault BEM 余额 0；累计入账与累计支付均为 13,570,694 raw（0.13570694 BEM）。

两个退出分支互斥，**不能把两条分支的支付相加为 A 的实际累计领取**。最终保留分支中，A 本轮实收为第一次领取 44 份加 residual，即 5,992,214 raw；B 本轮实收为原 55 份加受让 #1，即 7,578,480 raw。二者合计 13,570,694 raw，与总入账一致。这里都使用本轮余额增量，不把钱包原有 BEM 算入收益。A 归集 100 份后不能重新领取此前 A/B 已收走的收益。

## 7. 源链隔离及未覆盖范围

所有交易只发往本机 fork。上游代理仅允许读方法；真实 RPC 凭据没有进入 Anvil 命令行或本报告。主网部署、主网广播、市场发布和数据库写入均为 0。

独立的 [real-source-postcheck.json](../reports/real-source-postcheck.json) 在 2026-10-19T20:47:38+08:00 复核了源链固定区块与最新观察区块，检查结果为 PASS。最新观察点为区块 128556806，hash 为 0x45507aece822a5e9cc1e788f72e4a02f0b67939c4c021fc07bb5fe07784b86a8：

- 矿机 #3204 所有者仍为 A：0x1b55E6A757987576E1a130A011f9E12498De7DB9。
- token-specific getApproved 返回零地址；A 对本次 Seaport 的 isApprovedForAll 为 false。
- 本次 fork 新建订单在源链 isValidated=false、isCancelled=false、totalFilled=0、totalSize=0。
- 前后观察点的 hash 均再次核对；补充报告记录的测试报告 SHA-256 与本报告所依据的最终机器报告相同。

这提供了本次订单没有在所观察源链区块验证或成交、原矿机和授权在这些观察点保持原状的具体证据。它不是全部主网交易历史审计，不能排除两次观察之间的无关交易。源 RPC 写入为 0 同时由只读代理方法白名单与执行端固定为本机 Anvil 保证。

| 范围 | 结果 | 证据边界 |
| --- | --- | --- |
| 真实 BSC 状态下的 Seaport 1.6 / NFT / Mining / BEM | PASS | 本轮实际 fork 回执、余额与状态 |
| 主网部署、主网交易 | NOT_RUN | 发送主网交易数为 0 |
| 真实市场已发布订单、市场 API、数据库 | NOT_RUN | fork 内新建并 validate；未对外发布 |
| 生产 Timelock / 多签治理 | NOT_RUN | 本地测试延迟 1 秒，使用 impersonation |
| pending=0 后再次实际领取并入账 | PASS | 第二次真实 Mining 入账 37,601 raw；本轮已修复遗漏门控 |
| 正常赎回当笔新增 Mining 收益 | NOT_RUN | 本轮赎回前已有正数 BEM；赎回当笔实际新增为 0；pending=0 场景另由第二次 harvest 与诊断覆盖 |
| 真实 Mining / BEM 故障注入 | NOT_RUN | 未改真实合约代码或 storage，未制造依赖故障 |
| CircuitMarket 真实适配 | NOT_RUN | 本轮仅执行 Seaport 路径 |
| 完整异常订单矩阵、跨多池压力、生产确认与重组 | NOT_RUN | 不属于本轮 23 场景 |
| 独立源码 / 安全审计和生产上线许可 | NOT_RUN | getter、runtime hash、fork 成功不替代审计 |

首次实际 harvest 和 pending=0 后第二次正数入账，已验证本次固定状态、这个矿机、这组真实合约中 Vault 可以调用 Mining 并收到 BEM。该结果不自动证明所有矿机、所有未来区块、真实依赖异常或未来协议升级均兼容。

## 8. 回执索引和证据校验

以下全部为本地 fork 回执。带 later-reverted 的分支在验证后恢复快照，可能与最终分支使用相同本地块号而拥有不同交易及区块 hash。完整 logs、block hash、gas price、余额和状态前后值见机器报告。

| 操作 | 分支 | 本地块号 | gasUsed | 本地交易 hash |
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

- 机器报告 SHA-256：8762427a6054472f7d064e708eeda3997aaf625f45d21cc41c56b945d594131e。
- 验证输入 hash：9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba。
- 运行时既有代码变更：false。
- 独立诊断报告 SHA-256：da262b505e7c19424cbab897f5af215d66455cb0daec81c67f88853e36402345；诊断输入 hash 为 565320da2c84f6540cf546556291e491e764e64867c859fbf47bae41c1f1c142，与诊断结束 hash 相同。
- 主流程输入 hash 在运行中因生成本轮订单/配置而更新；immutableCodeChangedDuringRun=false，既有执行逻辑未在运行中修改。
- 两笔诊断交易已被快照恢复，不可当作主流程最终链上的回执。

本次生成的输入文件：

| 本次生成文件 | SHA-256 |
| --- | --- |
| [fixtures/fork-created-3204-157965afaffa5c59.json](../fixtures/fork-created-3204-157965afaffa5c59.json) | 0e8722d1f23b7c00e4f37477e3777af99aabcfc600438281ed0950a3a6a1c7d3 |
| [fixtures/fork-authorized-3204-1792414018906.config.json](../fixtures/fork-authorized-3204-1792414018906.config.json) | 5ab54ec5411059a2e016ac787fef59d83bb0d6cdc622d1e1fd8c1a982d18ae8c |
- 本报告只对应上述一次运行；新 fork / 新订单 / 重跑后的数字与哈希必须重新从机器报告生成，不能沿用。

## 最终交付回归

所有下列结果均绑定当前验证输入 hash `9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba`。

| 类别 | 结果 | 原始记录 |
| --- | --- | --- |
| Solidity 单测、集成、fuzz、不变量及规模用例 | 79/79 PASS | reports/solidity-tests.json |
| SDK | 78/78 PASS | reports/sdk-tests.txt |
| 本地 Mock CLI 流水 | 57 项 PASS | reports/local-smoke.json |
| 本机 fork 传输隔离 | 32 项 PASS | reports/fork-local-selftest.json |
| 可选 LAN 代码的本机传输自测 | 30 项 PASS；未开放 LAN | reports/fork-lan-selftest.json |
| 真实 BSC 状态 fork | 23 场景 PASS，25 笔本地回执 | reports/real-bsc-fork-tests.json |

格式、干净编译、gas、TypeScript 与 ABI/存储布局导出均 PASS。独立 Mining 诊断另有 2 笔已恢复快照的本地交易；不能与主流程回执混为主网记录。归档入口为 `npm run report`、`npm run archive`；源码包及校验文件位于 `artifacts/`，市场窗口交接文件为 `MARKET_HANDOFF.md`。
