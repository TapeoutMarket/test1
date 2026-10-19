# BEM 未领取权益随份额 NFT 转移：主网最终测试报告

完成日期：2026-10-20（北京时间）。**结论：PASS。** 第9–11笔均已逐笔获用户批准，在BSC主网成功，并由冻结发送器核验至少15个区块确认。先harvest形成正数未领权益，再把creator的份额#1转给B：未领权益和已领取历史保持，creator无法再领取#1，B随后实际收到转移前已累积的 **0.00000323 BEM**。完整原始事件、100份账本、拒绝证据和预算的独立对账均PASS。

## 测试对象与范围

| 项目 | 值 |
| --- | --- |
| 网络 | BSC主网，chainId 56 |
| Vault / ERC-1155份额合约 | `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| creator / 转出方 | `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` |
| B / 接收及领取方 | `0x63979C9d5200A5080be93eb440D469d2F2ec6682` |
| BEM | `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a`，8位小数 |
| 矿机 | collection `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C`，ID 3204 |
| 本轮转移对象 | Vault的份额NFT #1，数量1；矿机#3204始终留在Vault |

本轮验证的是已harvest入账、尚未领取的正数权益如何跟随份额ID。后续Mining继续产生但没有harvest的收益，不混入本轮固定入账点。B仅领取新接收的#1；其原有33份及creator其余66份的本批收益均保留。

## 起点与同批收益计算

初始只读快照区块128588150，hash `0x24570a72a46a4a0a7a4c25cac90e57d18f2178b745846e0d6eadbd1d84010fb1`。池为ACTIVE、共100份且每份supply=1；creator持有#1–67，B持有#68–100。所有100份上一轮收益均已领取，`claimed=136654`、`claimable=0`。

| 起点字段 | raw最小单位 | BEM |
| --- | ---: | ---: |
| totalAccounted | 13,665,485 | 0.13665485 |
| totalPaid | 13,665,400 | 0.13665400 |
| accPerShare / 各ID的claimed | 136,654 | 0.00136654 |
| Vault余额 / 旧remainder | 85 | 0.00000085 |

第9笔实际新入账 **32,254 raw = 0.00032254 BEM**，与旧余数一起分配：

```text
可分配额 = 32254 + 85 = 32339
每份新增权益 d = floor(32339 / 100) = 323
新 accPerShare = 136654 + 323 = 136977
新 remainder = 32339 % 100 = 39
```

323 raw是本批每份新增未领取额；136977 raw是累计每份入账记录。历史已领取的136654 raw不会因转移重新支付。起点原始证据：[initial-readonly-baseline.json](audit/initial-readonly-baseline.json)。上一轮独立的67/33分配报告：[BEM_REWARDS_TEST_REPORT.md](../mainnet-rewards/BEM_REWARDS_TEST_REPORT.md)。

## 三笔真实交易

| 步骤 | 操作与发起人 | 主网交易 | 区块 / 北京时间 | 实际gas BNB |
| --- | --- | --- | --- | ---: |
| 9 | creator nonce13，harvest() | [0605e956…6778a0c](https://bscscan.com/tx/0x0605e95651b4ffe0f5f7dba453e627fad99abb4bc15166b21dd86bd996778a0c) | 128589337 / 2026-10-20 00:51:46 | 0.00000760315 |
| 10 | creator nonce14，safeTransferFrom(creator,B,1,1,0x) | [28dee167…5066df7](https://bscscan.com/tx/0x28dee1670e0d52d10cd7532fef95bc1274b627484e3f108154a36f6ee5066df7) | 128590538 / 2026-10-20 01:00:46 | 0.00000344225 |
| 11 | B nonce6，claim(1) | [e93ae962…ecb4531](https://bscscan.com/tx/0xe93ae9625ef450311dc4565807bdd427de09970969ced30eb4660e5d7ecb4531) | 128591816 / 2026-10-20 01:10:22 | 0.0000040223 |

三笔value均为0；成功回执及全量后置状态均为CONFIRMED / positiveTest PASS，每笔只广播一次，无恢复重发。统一gasPrice=50,000,000 wei（0.05 gwei）。

| 步骤 | 批准gas上限 | 实际gasUsed | 批准费用上限BNB |
| --- | ---: | ---: | ---: |
| 9 | 191,589 | 152,063 | 0.00000957945 |
| 10 | 95,993 | 68,845 | 0.00000479965 |
| 11 | 104,284 | 80,446 | 0.0000052142 |

回执区块hash依次为：

- 第9笔：`0x1ee0cba6c0ee415acabe5accc65328e4bdb26b68c00ed5797ae16905d692e8dc`。
- 第10笔：`0x5a564d6600202bb217b40edaabdc82ea4ce9d91a08210ab6d856425b061be3da`。
- 第11笔：`0x34a8fb7196408148be7448d4c24dcdc4703de4e272a026e580fb44ca513ae933`。

原始回执、事件及逐步100份状态：[交易journal](transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json)。

已逐笔批准的冻结计划原文：

- 第9笔：[new-harvest计划](plans/new-harvest-ae6c38525e7d931bd552417f56777405d72ce85ce3cdc62c5869d7f97f28a31b.json)，hash `0xae6c38525e7d931bd552417f56777405d72ce85ce3cdc62c5869d7f97f28a31b`。
- 第10笔：[transfer-share计划](plans/transfer-share-6651de0dea2efc355dcfee004e7a59ac8c44203646cf5b491a93faa6fc3c3129.json)，hash `0x6651de0dea2efc355dcfee004e7a59ac8c44203646cf5b491a93faa6fc3c3129`。
- 第11笔：[buyer-b-claim计划](plans/buyer-b-claim-46758ef326247602f3667555b97e6e245bac64e51ef8f0dc8e4376f44e26b169.json)，hash `0x46758ef326247602f3667555b97e6e245bac64e51ef8f0dc8e4376f44e26b169`。

## 权益随转移的实际证据

| 检查点 | #1持有人 | claimed raw | claimable raw | 本轮已向B支付 raw |
| --- | --- | ---: | ---: | ---: |
| 第9笔harvest后 | creator | 136,654 | 323 | 0 |
| 第10笔转移后 | B | 136,654 | 323 | 0 |
| 第11笔领取后 | B | 136,977 | 0 | 323 |

第9笔第一条RewardsSynced的received=0，保持旧账本；BEM的`Transfer(零地址,Vault,32254)`、第二条RewardsSynced与Harvested新增额一致。没有向持有人付款。

第10笔回执只有精确的`TransferSingle(operator=creator,from=creator,to=B,id=1,value=1)`，没有收益同步、领取、BEM转账或矿机移动。转移后creator/B为66/34份，#1的claimed和claimable不变；其余99份状态不变。

在转移回执区块128590538，creator只读模拟`claim(1)`严格解码为 **NotHolder**。独立实时采集又在固定区块128590706验证：#1持有人B，creator/B对#1的余额为0/1，claimed=136654、claimable=323；原始revert **`0x7623fb52`** 经已编译Vault ABI精确解码为 **NotHolder()**。该区块位于转移之后、B领取之前；没有为预期失败广播交易或支付gas。creator仍可领取自己其他66份的权益。

第11笔精确产生`RewardClaimed(B,1,323)`和BEM的`Transfer(Vault,B,323)`。其RewardsSynced.received=0，没有再次harvest或改变入账点。仅#1的claimed推进323、claimable归零，其他99份权益保留。**B实际领取323 raw，等于转移前#1已累积而未领取的323 raw。** 到账认定依据原始事件和Vault账本，不用无关钱包余额变化替代交易归因。

独立证据：

- [harvest原始事件与账本审计](audit/harvest-independent-audit.json)、[转移审计](audit/transfer-independent-audit.json)、[B领取审计](audit/buyer-b-claim-independent-audit.json)。
- [实时原始NotHolder证据](audit/former-holder-denial-live.json)、[原始错误字节独立解码](audit/former-holder-denial-independent-audit.json)。

## 最终状态与金额守恒

以下为最终回执区块 **128591816** 的核验结果；不是未来时点余额承诺。

| 字段 | raw / 数量 | BEM |
| --- | ---: | ---: |
| totalAccounted | 13,697,739 | 0.13697739 |
| totalPaid | 13,665,723 | 0.13665723 |
| accPerShare | 136,977 | 0.00136977 |
| #1本笔实际领取 | 323 | 0.00000323 |
| 其他99份合计未领权益 | 31,977 | 0.00031977 |
| remainder | 39 | 0.00000039 |
| Vault BEM余额 | 32,016 | 0.00032016 |

```text
本批守恒：B实收323 + Vault剩余32016 = 新入账32254 + 旧余数85 = 32339
Vault剩余：其他99份权益99×323 + 余数39 = 32016
累计守恒：totalPaid13665723 + Vault余额32016 = totalAccounted13697739
```

creator持有#2–67共66份，本批保留未领21,318 raw（0.00021318 BEM）；B持有#1和#68–100共34份，其中#1已领取，本批其余33份保留未领10,659 raw（0.00010659 BEM）。矿机#3204仍在ACTIVE Vault，全部100份supply均为1，Vault原生BNB余额为0。未执行其余99份本批领取、份额归集、赎回或失败退款。

## 费用与预算

本轮三笔实际gas合计 **0.0000150677 BNB**。历史四部署加前八笔测试实际gas基线0.0010715065 BNB，加本轮三笔后合计 **0.0010865742 BNB**；Safe外层执行费用另列于主报告，不计入该数。历史gas基线取自[不可变报告快照](audit/historical-gas-report-baseline.json)的对应历史字段，没有伪称本次重新查询全量历史回执。

全部15项累计最大预留 **0.3043235844 BNB**，低于已批准上限 **0.3045 BNB**，剩余可预留 **0.0001764156 BNB**。其中认购本金为历史0.303 BNB，本轮只追加gas。完整保留原12项及其有序摘要，没有释放未用gas余量或抵扣收到的资产。[本轮结束预算快照](audit/final-budget-snapshot.json)，raw hash `0x01576a8758853300bf277c294d77af403883631b7c65577a321ed17238b12287`。

## 本地检查、完整对账与运行命令

| 类别 | 实际结果 | 证据 |
| --- | --- | --- |
| 原有合约定向测试 | 1/1 PASS | testDifferentClaimHistoryAndPositiveRightsFollowId，覆盖正权益转移和旧地址拒绝 |
| 新三步受保护发送器测试 | 21/21 PASS | [entitlement.test.mjs](entitlement.test.mjs) |
| 与旧发送/观察脚本合并回归 | 714/714 PASS，无失败或跳过 | [regression.tap](audit/regression.tap) |
| 新完整离线对账测试 | 9/9 PASS | [reconciliation-tests.tap](audit/reconciliation-tests.tap) |
| 真实三笔回执与全部100份后置状态 | 全部CONFIRMED / PASS | journal与三份独立审计 |
| 最终保存证据完整对账 | PASS，exit 0 | [final-reconciliation.json](audit/final-reconciliation.json) |

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1

# 独立重算本轮保存的原始事件、计划、100份账本、错误字节和结束预算
node --import tsx mainnet-entitlement-transfer/audit/final-reconcile.mjs

# 本轮本地测试
node --import tsx --test mainnet-entitlement-transfer/entitlement.test.mjs \
  mainnet-entitlement-transfer/audit/final-reconcile.test.mjs

# 原合约对应的定向测试
node scripts/forge.mjs test --match-test testDifferentClaimHistoryAndPositiveRightsFollowId -vv
```

最终对账命令只读取保存证据，不读环境变量、不访问RPC、不签名或广播；它的freshChainConfirmation/freshNotHolderSimulation为NOT_RUN，不能当作新一次实时链验证。真实至少15确认和回执区块状态由冻结发送器核验，原始错误另有上述独立实时采集。首次最终PASS被保留，后续重跑另写latest-attempt.json；此固定测试结束对账要求本轮15项预算状态，后续追加预算不属于本轮审计。

本轮结束时的预算raw输入已额外保存为final-budget-snapshot.json，和当时deployments/live-budget.json字节相同，可用于保全历史证据。上一轮67/33审计固定12项预算，其PASS保留为历史结果，不用于本轮15项结束状态。

冻结发送器：[entitlement.mjs](entitlement.mjs)，工具hash `e5669faba9b75877600266d392ffd66a3a89313572b726ba4e894c948d34ab38`。最终离线审计脚本SHA-256：`16a5464da1762292648abb81d32f52087d718fcd8c0c73282f56ab2aa1ae4ac7`。全部三笔计划、签名前确认范围与运行说明见[README](README.md)及[plans](plans)。未修改Vault、Factory或已冻结发送器；未写市场或数据库。

汇总主报告：[MAINNET_TEST_REPORT.md](../mainnet-test/MAINNET_TEST_REPORT.md)；机器可读最终摘要：[validation.json](validation.json)。
