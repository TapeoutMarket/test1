# 真实 BSC 协议身份只读核验

本报告完成固定区块的协议身份核验。Seaport 已取得验证源码记录并与该区块的链上 runtime 哈希匹配；Mining、BEM 的完整源码语义仍有 Unknown。本报告不是完整安全审计，也不代表主网部署或完整 fork 生命周期已通过。

**已修复并复测：** 独立 fork 诊断证实 `pending=0` 时 Mining.claim 仍可能带来正数实收。Vault 已移除据此跳过 claim 的条件；修复后主 runner 的 23 个场景、25 笔 fork 交易通过，二次 harvest 已核对正数新增实收和账本增量。下方金额与回执来自修复后的最终报告。

- 网络：BSC，chainId `56`。
- 固定区块：`128554249`。
- 区块哈希：`0xe44fafd52f2b1da68b810514554c21061d327cccb046b6c8afdfb315a1ef991d`。
- 上游读取经过本项目本地只读代理；未读取上游 RPC 凭据，未使用私钥，未发送交易。
- 结构化结果：[real-protocol-identity-review.json](../reports/real-protocol-identity-review.json)。基础状态证据：[authorized-source-observation.json](../reports/authorized-source-observation.json)。

## 地址及代码身份

| 对象 | 地址 | runtime 字节数 | 该区块观察 |
| --- | --- | ---: | --- |
| Seaport | `0x0000000000000068F116a894984e2DB1123eB395` | 23981 | `information()` 返回版本 `1.6`，验证源码记录识别为非代理 |
| 矿机 NFT | `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C` | 295 | Beacon 代理 |
| Mining | `0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46` | 130 | 从 ERC-1967 implementation 槽读取实现的代理；不是 ERC-1167 clone |
| BEM | `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a` | 2205 | `decimals() = 8`，`minter() = Mining` |

上述 Collection、Mining、BEM 地址与 [TapeOut 官方主网配置](https://tapeout.net/pod/pod-mainnet.json) 一致。官方配置仅支持地址来源；合约行为需另外核验。

四个地址的 runtime keccak256 分别为：

```text
Seaport   0x16bd146d392a011a996f447b813623d4857ba2d7621af38194a009cbc03ab5f4
Collection 0xd8c4b0216e0aadd615fbd134465b6af060a11769edc7c844d8f14d1b8a783992
Mining    0xed6b710a769987f50494d713f278817992e3266e45898a990be878efc2fcbbce
BEM       0x982ba79538b51e54ee1382f57522098af0635b0f67f2574d393b29ed0958b344
```

## Seaport：已完成源码记录与 runtime 的身份匹配

[OpenSea 官方部署表](https://github.com/ProjectOpenSea/seaport/blob/main/docs/Deployment.md) 将该地址列为 Seaport 1.6。固定区块 `information()` 同样返回 `1.6`，ConduitController 为 `0x00000000F9490004C11Cef243f5400493c00Ad63`。

[Sourcify 链 56 验证记录](https://sourcify.dev/server/v2/contract/56/0x0000000000000068F116a894984e2DB1123eB395?fields=all) 返回 `runtimeMatch = match`、`creationMatch = match`、`proxyResolution.isProxy = false`；编译对象为 `src/Seaport.sol:Seaport`，编译器为 `0.8.24+commit.e11b9ed9`。记录中的 `onchainBytecode` 哈希与本报告固定区块 RPC 所读哈希完全一致。

Sourcify 的编译输出带有 immutable transformation 信息；未经这些处理的 `recompiledBytecode` 原始哈希与链上哈希不同。本报告依据其验证结果及链上代码交叉匹配，不声称两份原始字节码直接相同，也没有重新完成一次独立编译审计。

## 矿机 NFT 与 Mining：代理实现已解析

矿机 NFT runtime 向 Beacon 查询 `implementation()`，再委托执行。该区块的 Beacon 为 `0xf8d6d8eb894d6971c8976ad8b4971cbefe028156`，其 `implementation()` 返回 `0x8E1D125Def6d3826C278299273a0760D47626068`。实现 runtime 为 12560 字节，哈希为 `0x2ea433839e23b3773b7880d6f1807affb0f648ae98760b9a3b6394879665c345`。Beacon 的完整升级权限分析为 **Unknown**。

Mining runtime 从 ERC-1967 implementation 槽载入 `0xa3dbe873da37cd4e4a13c7cef23a7db6ca60f898`，然后委托执行。实现 runtime 为 24574 字节，哈希为 `0x63b1124d3448fdeb28b163c52142e15a7a464d7ae7d817e51f6c242b62424479`。在代理地址读取到 `owner() = address(0)`、`isSealed() = true`、`paused() = false`；这些是该区块的状态观察，不能单独证明所有升级或特权路径都不存在。

[TapeOut 官方应用发布文件](https://tapeout.net/pod/assets/main-C1q9aWV9.js) 内含 `minerKey(address,uint256)`、`getMiner(bytes32)`、`pending(bytes32)`、`claim(bytes32)`、`claimMany(bytes32[])` 的 ABI。配置矿机 `#3204` 的 `minerKey()` 实际返回 `0xb0e5b7d325dead6144886258056fb8e27ff5f6192aaa90fd0b45682c297c1c0d`，`pending()` 返回原始整数 `13532613`。按照实读的 8 位精度，该值为 `0.13532613 BEM`；这是固定区块快照，不保证之后 harvest 的实收金额相同。

Mining 的任意调用者权限、`claim` 全部路径的收款地址、pending 的完整计息与结算规则，目前仍为 **Unknown**。官方应用 ABI 只证明调用接口；本轮未取得对应实现源码，不能用接口名称替代行为证明。下文已完成的 fork claim、Vault 入账和钱包转账是对应路径的独立证据，不能扩展为对所有状态和入口的证明。

独立的 [Mining 结算诊断](../reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) 在同一来源固定区块的 fresh fork 中，先由持矿地址 A 调用一次 Mining.claim，再推进 3600 秒测试时间。第二次调用前 pending 为 `0`，调用后 A 的 BEM 余额从 `13902271` 增至 `13939872`，实收 `37601` raw；本地回执为 `0x0c08fd994c6ad53949f04bacf5f5d8c24321b9dce39590f17f919faf99c9066f`，fork 区块 `128554252`，状态 success。首次领取所在同一区块的再次 claim 仅以 eth_call 模拟，结果 SUCCESS、未发送交易。两笔诊断交易捕获证据后已通过 snapshot 恢复，cleanup PASS；不能当作恢复后仍在本地规范链上的回执。

该反例证明 pending 零值不意味着 claim 无法结算收益；未取得源码，不能进一步断言它的全部内部存储或计息机制。旧 `_harvest` 的 pending 零值跳过条件已删除：现在始终调用固定 Mining.claim，再同步实际到账，真实错误继续传播。修复后的 Vault 回归确认 pending=0 时再次 harvest 获得 `37601` raw 新增实收，totalAccounted 增加相同金额。旧测试仅以余额大于零判断成功的问题也已改为检查新增实收，旧 dust 不能满足新增收益断言。

## BEM：精度和 minter 已读取，完整转账语义尚未证明

该区块 `decimals() = 8`，`minter()` 为 Mining。BEM 的标准 ERC-1967 implementation、admin、beacon 槽均为零；零槽不能独立排除任何自定义代理机制。所有路径是否无转账税、是否无 rebase、是否不存在其他特权余额变更，本轮源码级结论均为 **Unknown**。

具体 fork 用例若证明 Vault 实收数、账户余额差及转账事件一致，只能说明那次转账路径的表现。报告需要继续记录原始整数和实收差值，不能把一次无差额转账概括成全局代币审计结论。

## 未取得的源码与边界

本轮尝试的 BscScan 页面返回 HTTP 403 验证页；Sourcify 对 Mining 代理、Mining 实现及 BEM 的查询返回 HTTP 404 / `match:null`。这表示该次检索没有取得源码，不表示源码在任何地方都不存在，也不表示合约一定未验证。

从实际 runtime 编译元数据提取的 Mining 实现 IPFS CID 为 `QmQ5utAzxYyU5yXN7QqkFn3pjAatiJB1Yi5CZwMmHchUuq`，BEM CID 为 `QmRVuR4snZHCRcTNSts1ky6K6JkCBHaR3SqzN5VHS9ACqA`；`ipfs.io` 与 `dweb.link` 两个网关均返回 HTTP 429 / 网关迁移提示，没有取得元数据正文。因此本报告没有把第三方介绍中的“任何人可 claim”“无税”“无升级”等描述当成已验证事实。

本报告的只读身份研究发送交易数为 **0**。本地 fork 生命周期、主网交易、局域网跨机联通是不同证据类别；此身份核验不替代其测试回执。

## 修复后已完成的本地 fork 路径证据

独立的 [real-bsc-fork-tests.json](../reports/real-bsc-fork-tests.json) 已记录 **23 个场景 PASS、25 笔本地 fork 交易**，与本报告使用相同上游区块。主网交易和上游 RPC 写入均为 0。订单仅在 fork 内通过 NFT 授权与 Seaport `validate` 创建，公开签名为 `0x`；未验证导入既有公开市场签名订单的完整路径。没有修改真实 NFT、Mining 或 BEM 的代码或存储。另有上文独立诊断的 2 笔交易，已恢复 snapshot，不混入主 runner 的 25 笔。

本节金额及回执取自修复后最终报告，完成时间为 `2026-10-19T12:47:20.106Z`，订单 hash 为 `0x157965afaffa5c5949ab133f9da4054d7607201aad675c29b81fc0f6370c3f2a`。固定来源区块和身份核验结论不变。

| 具体路径 | 观察结果（BEM 原始整数） | 能支持的结论 |
| --- | ---: | --- |
| Vault 购得矿机后首次 harvest | Vault 实收 `13533093`，每份入账 `135330`，余数 `93` | 本次矿机及状态下，Vault 能从 Mining 获取正数 BEM 并按实收分账 |
| A 领取 44 个 ID，保留 ID 1 未领 | A 增加 `5954520`，B 增加 `0` | 本次批量领取未支付其他 ID 的权益 |
| B 领取其原有 55 个 ID | B 增加 `7443150`，ID 1 未领权益仍为 `135330` | 已入账但尚未领取的 ID 1 权益仍存在 |
| 将未领的 ID 1 从 A 转给 B | 旧持有人模拟领取报 `NotHolder`；B 实收 `135330` | 本次正数未领权益随 ID 转移，新持有人可领取 |
| 首次领取后再次 harvest | 调用前 pending=`0`，新增实收 `37601`，Vault 从 `93` 增至 `37694` | 零值不会再阻止 claim；新增实收与 totalAccounted 增量一致，未把旧余数当成新收益 |
| 归集后正常赎回分支 | A 收到 `37694`，Vault 余额归零 | 该 snapshot 分支完成矿机交付与账本结清，随后分支被回退 |
| 无 harvest 赎回后领取残余 | A 收到残余 `37694` | 该分支先交付矿机、保持 BEM，之后由固定受益人结清 |

首次 harvest 的本地回执为 `0x85f2e4a2c0aa5c921f1bfd85180b4b49a3e6d4470c5385bc1fca392537594c6c`，fork 区块 `128554264`；转移后新持有人领取的回执为 `0x1e8a1b56675240f0895d4f90af6b86309665f029c2b2d9737ef5a288ec66039b`，fork 区块 `128554268`；pending=0 后再次 harvest 的回执为 `0xbb4c0e08ec3731f159bdaaa59d89723df909e16290cb8ac35aedfe04aaef3d79`，fork 区块 `128554271`。这些哈希是本地 fork 证据，不能当作主网交易使用。退款和赎回分支中被 snapshot 回退的回执，应按原测试报告的分支标记解释。

上述正数入账、持续结算、余额差和权益转移提供了实际运行兼容性证据。Mining 全路径调用权限、收款规则，以及 BEM 全路径税、rebase 和升级机制的源码审计 Unknown 保持不变。
