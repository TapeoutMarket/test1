# 钱包 A 单独领取 BEM 测试报告

状态：**VERIFIED_A_ONLY_CLAIM**。网络：BSC chain 56。金额小数位：8。时间均另存 UTC；本报告展示时区 Asia/Shanghai。

## 测试对象

- Vault：`0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`
- 矿机：`0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C`，ID 3204
- A / ID 1：`0x1b55E6A757987576E1a130A011f9E12498De7DB9`
- B / ID 2：`0x63979C9d5200A5080be93eb440D469d2F2ec6682`
- 领取前快照：2026/10/4 04:04:30，区块 125545165，hash `0xf9727e719899e231c74c8c461d1376b3b2f1bd216524547034daf772638941a6`

## 本次模拟

DRY_RUN_PASS：以钱包 A 调用 harvestAndClaim([1])，未签名、未广播。预检输出区块 125545369（模拟 RPC 使用当时最新状态，不是该区块的固定状态证明）。估算 Gas 351758，费用上限 0.0000175879 BNB。


## 数量记录

| 观察时点 | 区块 | Mining 待领取 BEM | Vault BEM 余额 | ID 1 可领取 BEM | ID 2 可领取 BEM |
| --- | ---: | ---: | ---: | ---: | ---: |
| 领取前快照 | 125545165 | 0.0008068 | 0 | 0 | 0 |
| 交易前一区块 | 125545983 | 0.0008393 | 0 | 0 | 0 |
| 交易所在区块结束 | 125545984 | 0 | 0.00042458 | 0 | 0.00042458 |

- 领取前 Mining 待领取：0.0008068 BEM（原始单位 80680）。
- 本笔 A 实际领取：**0.00042458 BEM（原始单位 42458）**。
- 本笔 B 实际领取：0 BEM（原始单位 0）。
- 本笔 BEM 转入 Vault：0.00084916 BEM（原始单位 84916）。
- 本笔 harvest 确认入账量：0.00084916 BEM（原始单位 84916）；可能包含此前直接转入但未同步的 BEM，不能等同于 Mining 新支付量。
- A 累计已领取（ID 1）：0.00042458 BEM（原始单位 42458）。
- B 累计已领取（ID 2）：0 BEM（原始单位 0）。
- B 保留可领取额：0.00042458 BEM（原始单位 42458）。

## 交易证据

- [BscScan 交易](https://bscscan.com/tx/0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a)
- 交易区块：125545984，区块内序号 42；receipt：success。
- 调用已核对：A → Vault.harvestAndClaim([1])。
- 实际 Gas 费用：0.0000132972 BNB。
- 各项核对：`{"onlyAId1Claimed":true,"aPositivePaymentMatchesEvent":true,"bHasNoVaultPayment":true,"oneHarvest":true,"bClaimedUnchangedSinceBaseline":true,"holdersMatchAtReceipt":true,"minerStillActiveInVault":true,"aBalanceBlockDeltaMatchesReceipt":true,"bBalanceBlockDeltaZero":true,"aClaimedBlockDeltaMatchesReceipt":true}`。

## 本轮结束时的后续测试基准

- ID 1 已领取：0.00042458 BEM（原始单位 42458）；尚可领取：0 BEM（原始单位 0）。
- ID 2 已领取：0 BEM（原始单位 0）；尚可领取：0.00042458 BEM（原始单位 42458）。
- Vault 余额：0.00042458 BEM（原始单位 42458）；分配余数：0 BEM（原始单位 0）。
- 本笔转入 Vault 的 BEM 比初始快照 pending 多 0.00004236 BEM（原始单位 4236）；比交易前一区块 pending 多 0.00000986 BEM（原始单位 986）。

这些差额仅是观测值对比，具体协议计算原因未验证，不能全部归因于时间增长。后续应按实际新增到账和每个 ID 的已领取账本核对，并保留 ID 2 的历史未领权益。

## 口径与后续对照

本笔支付以该 receipt 中 Vault 的 RewardClaimed 事件和 BEM 的 Vault→A Transfer 事件交叉核对；区块间钱包余额差仅作辅助，可能含其他交易。金额保留原始整数，避免浮点和四舍五入误差。

Mining pending 会随时间变化；只有实际进入 Vault 的 BEM 才参与分配。A 本笔领取可包含 ID 1 之前积累的未领权益，不能机械等于领取前 pending / 2。正常 BEM 转账语义仍是事件与到账量核验的假设。

“B 本笔未领取”按该交易事件核对；claimed(2) 单调累计值保持不变可证明快照后 ID 2 没有领取正数收益，但不排除零金额调用。前后份额持有人一致不证明期间从未转移。钱包 B 是否收到其他来源 BEM 是另一项观察，不与份额领取混同。已保存 claimed(1/2)、accPerShare、remainder 和 Vault 余额，供后续测试对照。
