> 历史证据：本文件对应 pending 零值跳过缺陷修复前的运行，不是当前版本验收结论。当前结果见 REAL_FORK_EVIDENCE_AUDIT.md。

# 真实 BSC 状态本机 fork：独立证据复核

本次复核结论：最终运行的 **23 项场景检查均为 PASS，25 笔交易均在本机 fork 执行成功**。已独立解码保存的原始回执日志，复算 BEM 收入与支付，核对权益转移和快照分支；未发现最终金额与回执矛盾。运行中的源码指纹保持一致。本文件是工程证据复核，不构成独立第三方安全审计，也不表示主网部署已获批准。

## 证据身份与范围

| 项目 | 最终运行证据 |
| --- | --- |
| 完成时间（UTC） | 2026-10-19T12:41:17.263Z |
| 固定源链 | BSC，chainId 56，块 128554249 |
| 固定源块 hash | `0xe44fafd52f2b1da68b810514554c21061d327cccb046b6c8afdfb315a1ef991d` |
| 本机 hostInstanceId | `8e8c713a-afb7-4a05-9ff8-941bec16e6af` |
| fork Vault | `0x7CF2a181eeB9D12E7a9779Fd27248Ce918B492B4` |
| 测试订单 hash | `0x4b806c1325967dc170bf08c74644b20dd00af8b79c58e874bbc6e54f836a0edc` |
| 运行前后相同的源码指纹 | `f2e42da586f26801c33fce1f0d446f8b7f613afe5eaa0d7715d4fa89af3cc24f` |
| 最终报告 SHA-256 | `0b1628ab6f965df007d67eaafaffaa89532343434a0c06ae16a8060b6faca66b` |
| 主链后置只读报告 SHA-256 | `4ffd6aae20fd76abfca17efd8631f4222df89df20bf01dcd02f90048a7ce7d15` |

原始证据为 [real-bsc-fork-tests.json](../reports/real-bsc-fork-tests-before-pending-fix.json)、[real-source-postcheck.json](../reports/real-source-postcheck-before-pending-fix.json)；执行过程见 [run-authorized-fork-tests.mjs](../scripts/run-authorized-fork-tests.mjs)。本复核使用保存的回执和状态快照，没有再发交易；回执在运行器收取时校验所在分支的实际块 hash，不能当作主网回执使用。

测试从上述固定源块的新 fork 开始，运行器要求初始 tip 等于固定块。矿机是 collection `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C` 的 #3204。Seaport 为 `0x0000000000000068F116a894984e2DB1123eB395`，Mining 为 `0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46`，BEM 为 `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a`。

订单仅在 fork 内由卖方 A impersonation，授权单个 NFT 并调用真实 Seaport 的 validate。公开 signature 为 `0x`；未生成可公开提交的卖单签名，未发布市场订单。卖家价 0.3 BNB、测试手续费 0.003 BNB、总额 0.303 BNB；手续费接收者 creator 是明确的测试地址，不能据此认定正式市场的收费配置。账户 BNB 余额通过 Anvil 本地测试功能配置；没有修改矿机、Mining 或 BEM 的代码和存储。治理地址为本地测试 EOA，Timelock 延迟 1 秒，不代表生产治理配置。

## BEM 金额与权益转移

BEM decimals 为 8。以下金额以原始整数为核算依据；pending 的早期观察与执行时实际到账分开记录。

| 观察或操作 | raw 最小单位 | BEM |
| --- | ---: | ---: |
| 第一次 harvest 前的 Mining pending | 13,532,613 | 0.13532613 |
| 第一次 harvest 实际进入 Vault | 13,533,322 | 0.13533322 |
| 每个份额累计应计收益 | 135,333 | 0.00135333 |
| 除以 100 后保留的余数 | 22 | 0.00000022 |
| A 批量领取 #2–#45，共 44 份 | 5,954,652 | 0.05954652 |
| B 批量领取 #46–#100，共 55 份 | 7,443,315 | 0.07443315 |
| #1 从 A 转给 B 后，由 B 领取历史未领权益 | 135,333 | 0.00135333 |
| 最终分支 A 领取剩余余数 | 22 | 0.00000022 |
| A 在最终分支的总收入 | 5,954,674 | 0.05954674 |
| B 在最终分支的总收入 | 7,578,648 | 0.07578648 |

第一次 harvest 的 BEM Transfer 为零地址向 Vault 转入 13,533,322；RewardsSynced 与 Harvested 金额一致。实际到账比 earlier pending 多 709 raw，仅记录这两个不同观察点，不用 pending 代替实际到账，也不据此推断未核实的外部挖矿计算规则。

A 原先持有 45 份，本轮故意只领取其中 44 份，将 #1 的正收益保留给转移测试。因此本轮 A/B 最终收入不应套用最初 45:55 的持有比例。A 的一笔交易包含 44 个 RewardClaimed，B 的一笔交易包含 55 个；全部 ID 唯一，每份金额为 135,333 raw，BEM Transfer 等于各自求和。

转移 #1 的交易仅有 ERC-1155 转移；转移前后该 ID 的 claimed 都为 0、claimable 都为 135,333。旧持有人 A 再领取时模拟返回 NotHolder；新持有人 B 的一笔真实 fork 交易成功收到 135,333 raw。该证据直接支持“已入 Vault、归属于该 NFT 的未领取收益随该 NFT 转移”。旧持有人拒绝证据是只读模拟回退，不是广播了一笔失败交易。

最终分支守恒为：**5,954,674 + 7,578,648 = 13,533,322 raw**。最终 totalPaid = totalAccounted = 13,533,322，Vault BEM 余额为 0。已回滚的普通赎回分支支付不能再次加入总收入。

## 两条赎回路径的实际覆盖

B 将 #1 与 #46–#100 共 56 个 ID 批量转给 A，归集后 A 对 #1–#100 的余额均为 1。随后 fork 增加 3,600 秒并再次 harvest；该次 Harvested.received 为 **0**、无 BEM Transfer，累计入账未增加。名为 prepare-positive-redemption-balance 的场景只要求 Vault 余额大于零，本次该余额全部来自 22 raw 余数，不能解释为新一轮正产出。

两条赎回分支共用同一快照基线：块 128554271，hash `0x8f860b0ab8f1df30ae5a53e0aeee60342b330ca6e0280682f08c12b6e72bb4be`，Mining pending 为 0、各份额未领收益为 0、Vault 余额及 remainder 为 22 raw。

| 分支 | 观察到的结果 | 证据边界 |
| --- | --- | --- |
| 普通 redeem | 100 个 ID 各销毁 1；#3204 从 Vault 转给 A；100 个 RewardClaimed 的 amount 都为 0；A 收到 22 raw 余数，Vault 清零 | 成功后回滚；未覆盖正 pending 或正份额未领余额下的普通赎回 |
| redeemWithoutHarvest | 从相同快照恢复后，100 个 ID 各销毁 1；#3204 转给 A；A 的 BEM 不变，Vault 保留 22 raw；本笔没有 BEM Transfer | 这是最终保留的分支；无 BEM Transfer 是回执事实，不等同于完整调用轨迹证明 |
| claimResidual | A 再发一笔收到 22 raw，Vault 清零 | 证明剩余款实际可领取，金额仅为本次余数 |

25 笔成功交易中，guardian 可退款分支有 2 笔后来被回滚，普通赎回有 1 笔后来被回滚；其余 22 笔属于最终保留的执行路径。两个不同快照分支在相同高度出现不同块 hash 属于预期行为，不能把两条分支拼成同一条链上的连续支付。

## 关键 fork 回执索引

| 操作 | 交易 hash |
| --- | --- |
| 首次 harvest | `0x6ab035546d848b347a997fd7532f35ccd851c86bcb5c9dfa744cca5f72c12c22` |
| A 领取 44 份 | `0xc3a8550b77d07db35b11055bc54d94bb8fc1701a4d648a5673d1c540133cba5f` |
| B 领取 55 份 | `0xf8498a546a2a3d66e0cb35eea77edad61d011a57fc1f853c1dc3f39865df6750` |
| A→B 转移 #1 | `0x188032364f6438d08d6581bcf0df119aecbafc9fedd55cb919ea2e748ba4e3b3` |
| B 领取 #1 历史权益 | `0x7a83061040ffb45aac948fd5400520e979c4c03f238808ed5face8db893b8f53` |
| B→A 归集 56 份 | `0x8bd428478c0cb153ec672067910b708cdf7cae1cb96cd0f734118835e09a3572` |
| 第二次 harvest，到账 0 | `0x9cff38d3ffd153e594f448dc349bc0b480d85f9a1e999232ab912995ab1f1322` |
| 普通赎回，后来回滚 | `0xc9f4a61e9ec2726e135665f0fa48064d84921d119724f1d3c4300f5d57983cd1` |
| 不 harvest 赎回，最终分支 | `0xaaa0fe9c4d502712d22e75ed7e314c1fa5706e904bc2d4f704497661304d3311` |
| 最终剩余款领取 | `0xc9d14a8bcebfd6c76c65ed4d068b56eaa01337bf2d3ae771d2a74ae1a0f66f71` |

## 源主链后置只读复核

运行器自带的 source-read-only-check 检查固定源块；它单独不能说明运行后的最新主链状态。后置脚本 [check-authorized-source.mjs](../scripts/check-authorized-source.mjs) 已补充一次最新块观察，读取公共输入和只读源代理，无私钥、无 .env、无发送交易方法。

该报告在 2026-10-19T12:41:23.320Z 生成，绑定上述最终运行报告 SHA-256。它先选择源链最新观察块 **128555974**，再对所有 owner/approval/orderStatus 读取固定这个块号，并复核固定源块和最新观察块的 hash。最新观察块 hash 为 `0x068d65a89108ddc41506274d1fdabcc738f712b90d428eaa1674d48bd6302e14`。

固定源块和最新观察块均观察到：#3204 owner 为 A；单 NFT approved 为零地址；A 对 Seaport 的 approvedForAll 为 false；此次生成的精确 orderHash 在主链 isValidated=false、isCancelled=false、totalFilled=0、totalSize=0。六项检查均为 true，报告 PASS。

这是两个明确主链检查点的证据，不是全链历史审计；相同 owner/approval 不能证明期间从未有任何其他交易。此次订单在观察块上未验证、未成交，不能扩展成所有其他订单的结论。没有主网广播的执行边界还依赖只读源代理的方法白名单、写请求固定发送至本机 Anvil，以及该流程没有加载私钥/公开签名的代码路径。

## 必须保留的覆盖限制

- 已证明真实外部合约在该固定 BSC 状态下的购买、首次正 BEM 收获、批量领取、正未领权益转移、100 份归集及两种退出路径；不等同于所有后续链状态、代币或市场版本兼容。
- 本轮没有导入已有签名市场订单，未覆盖真实市场 API、前端、数据库、订单发布、外部签名采集和生产手续费配置；这些项目不能列为已通过。
- 本轮第二次 harvest 新增 0；“持续多个正收益周期”的真实依赖行为未得到本轮证明。普通赎回基线 pending=0、未领份额收益=0，仅有 dust，正 pending 或正未领收益下的普通赎回仍待单独测试。
- 本轮没有对真实 Mining/BEM 注入失败或恶意行为。redeemWithoutHarvest 无 BEM 转移已验证，但未采集调用轨迹作为“没有调用任何外部收益依赖”的运行时证明；源码控制流与 mock 故障测试应分别表述。
- ACTIVE 状态 guardian 拒绝、旧持有人领取拒绝、非持有人退款拒绝使用模拟回退证据，不是失败交易回执。
- 23 项是包含身份、配置、部署与只读检查在内的场景检查数，不能表述为 23 个独立财务边界用例。主网部署、主网真实交易、生产治理和独立安全审计均未在本轮执行。
