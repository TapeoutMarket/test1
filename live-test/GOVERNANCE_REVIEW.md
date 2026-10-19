# 本轮主网测试治理配置与多签核验

**本文为部署前身份核验的历史记录。实际四笔主网部署现已完成，当前治理状态及回执见 [LIVE_DEPLOYMENT_REPORT.md](LIVE_DEPLOYMENT_REPORT.md)。**

2026-10-19，北京时间。用户已指定现有多签 `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03`，并选择 **600 秒（10 分钟）** Timelock 最短延迟。已写入 [SESSION_PLAN.json](SESSION_PLAN.json)。这是本地部署准备，尚未向该多签授予任何链上权限，也没有部署或广播交易。

**后续部署入口、代理完整演练与两笔 Safe 配置交付见 [部署验收报告](DEPLOYMENT_PREPARATION_REPORT.md) 和 [操作手册](MAINNET_DEPLOY_RUNBOOK.md)。** 本文末尾 `NOT_PREPARED` 与 45 项测试属于首次草稿生成时的快照；后续演练不改写这份原始未签名草稿。

## 为什么之前要求多签

多签不是 BSC 对主网测试的技术要求。原规格要求正式部署使用多签 + Timelock，现有 live SDK 据此要求实际有代码的多签身份。

| 方案 | 现有合约 | 所需变更 |
| --- | --- | --- |
| creator 直接成为 Factory upgradeAdmin | 当前不接受 EOA | 要改 Factory 并移除真实 Timelock 约束，不能称所有其他限制保持不变 |
| creator 作为 Timelock proposer/executor | Solidity 已支持 | 仅需明确增加主网测试的 EOA 治理校验分支及测试；保留真实延迟和 Vault 限制 |
| 现有多签作为 Timelock proposer/executor | 已支持 | 无需修改核心合约或 live 校验规则，本轮采用此方案 |

对应代码：原规格第 44–45 行；`src/GroupBuyFactory.sol` 的 `initialize`、`onlyAdmin`、`_authorizeUpgrade`；`src/GovernanceTimelock.sol` 的构造器；`sdk/live-identity.ts` 的治理 runtime 和角色校验。前轮把多签描述为主网测试必须条件过于绝对，应准确理解为当前工程的主网配置策略。

## 实际链上核验

最终原始记录：[governance-1792415753503.json](observations/governance-1792415753503.json)。状态为 `SAFE_141_RUNTIME_AND_CURRENT_CONFIGURATION_MATCH`。

- 链：BSC，chainId 56。
- 固定 finalized 区块：128560557。
- 区块 hash：`0xf7dc2e59dfecaf40693793df973c2646f07fb55066b9082f0dca722eb0b08741`。
- VERSION：1.4.1；Safe nonce：4。
- owners 共 2 个，threshold=2，因此执行需要 **2/2** 确认。
- owner 1：`0xf0972A5ee0FD4054159A8c7177e59126ef478dA9`。
- owner 2：`0x15C059A5aCB36142Eea576BDbC0330Fd7E9d3099`。
- 上述两个 owner 均不属于此次测试的 creator/A/B。用户表示拥有该多签权限；RPC 读取只能确认成员和阈值，不能证明私钥访问能力。
- 模块分页完整，已启用模块为空；transaction guard slot 为零。
- singleton getter 与 storage slot 0 一致，指向 `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`。
- fallback 为 `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`。

代码来源核对：

| 对象 | 证据 | 结果 |
| --- | --- | --- |
| SafeL2 1.4.1 singleton | 链上地址和 runtime hash 对照 [Safe 官方部署记录](https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/safe_l2.json) | 一致 |
| SafeProxyFactory 1.4.1 | 链上 runtime hash 对照 [官方 proxy factory 记录](https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/safe_proxy_factory.json) | 一致 |
| 用户多签的代理 runtime | 与已核验 Factory 的 `proxyCreationCode()` 实际返回段逐字节比较 | 一致 |
| CompatibilityFallbackHandler 1.4.1 | 链上地址和 runtime hash 对照 [官方 fallback 记录](https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/compatibility_fallback_handler.json) | 一致 |

代理 runtime hash：`0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c`。

核验脚本开发中，最初错误地把 runtime 当成整个 creation bytecode 的后缀；实际构造器末尾还附带错误字符串。已按其 `CODECOPY/RETURN` 的明确区间（offset=0x119，length=0xab）修正，并增加回归测试。早期 observation 中的 `proxyRuntimeMatchesFactoryCreationCodeSuffix=false` 记录的是旧核验方法，不代表检测到恶意代理；最终依据是上述完整返回段一致结果。没有删改早期观察文件。

这是一份当前配置与公开 runtime 身份核验，不是完整历史审计。Safe 的 owners、threshold、module 和 guard 将来仍可被其授权人更改，实际签署前应重新运行检查。Safe 1.4.1 的 module-guard 扩展 slot 原始值也被记录，但没有将该扩展 slot 当成此版本的权限证明。

## 已选定角色与保持的限制

```text
现有 Safe（2/2）
    ↓ 提议 schedule / 执行 execute
新 GovernanceTimelock（至少等待 600 秒）
    ↓ 唯一 Factory upgradeAdmin
新 GroupBuyFactory
```

- Timelock proposer/executor 均为用户提供的 Safe；没有外部 bootstrap admin。Timelock 自身持有 DEFAULT_ADMIN_ROLE。
- Factory 的 upgradeAdmin 填 Timelock 地址，而不是直接填 Safe 或 creator。
- guardian 沿用 B：`0x63979C9d5200A5080be93eb440D469d2F2ec6682`；不授予 Timelock proposer/admin。
- creator 是部署付款人、建池者和 67 份出资人。B 出资 33 份；A 卖价 0.3 BNB 的安排不变。
- 600 秒 floor 不可降低。它延迟 Factory 配置/升级，不延迟普通持有人的领取、转移、退款或赎回。
- Vault 仍为固定实现 ERC-1167 clone，没有资产管理 owner 或升级入口。
- Factory/guardian 仍只能使未买成的池进入可退款，不能提走资金、指定退款受益人或控制已买成矿机。
- 正常矿机赎回仍要求实际持有全部 100 份，多签和 creator 身份都不能绕过。

## 可重复运行

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node live-test/inspect-governance.mjs --env ../.env
node --test live-test/inspect-governance.test.mjs
node live-test/prepare-deployments.mjs --env ../.env
```

这些入口只读链状态、估算 gas、生成本地未签名参数；不会发送交易。部署准备包不是 reviewed live manifest；不能拿它替代部署后的 runtime/角色/回执核验。待实际部署后仍需准备多签内的 schedule/execute 配置，再创建池和执行购买测试。

## 已生成的部署草稿

实际生成文件：[unsigned-deployments-1792415847788.json](observations/unsigned-deployments-1792415847788.json)。生成时区块为 128560759，hash 为 `0x268b36f8d824868b9acf3626c781bcdc17bd7400e6e491bd66f3319df6c06d03`；creator 的 latest/pending nonce 都是 5。包内含完整 initcode，终端仅打印摘要。

| 顺序 / nonce | 合约 | 预测地址（尚未部署） | 加 20% gas 余量后费用 BNB |
| --- | --- | --- | ---: |
| 1 / 5 | GroupBuyVault 模板 | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` | 0.0004232363 |
| 2 / 6 | GovernanceTimelock | `0x02f453192530e07541E61B43DA079273F410979b` | 0.00008604465 |
| 3 / 7 | GroupBuyFactory 实现 | `0xE45D94579425a6a2006D3e067C8d51De6B15C4fc` | 0.00013991275 |
| 4 / 8 | Factory ERC1967Proxy，构造时原子初始化 | `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1` | 未估算，依赖前置部署 |

前三笔估算合计 **0.0006491937 BNB**，gasPrice=0.05 gwei。这不是完整流程预算。上述地址依赖 creator 连续 nonce 5–8，期间插入任何其他交易、失败的部署或其他 nonce 变化，都应重做后续预测与参数，不可直接重试旧包。

当前草稿 `readyToSign=false`：代理必须在依赖真实部署后重新模拟和估算；实际 Safe 内的 `scheduleBatch/executeBatch` 配置仍为 `NOT_PREPARED`；完整 gas 预算和 reviewed live manifest 尚未完成。没有设置 `LIVE_RELEASE_VERIFIED`。

本次执行了全部四个辅助工具的测试：预检 10、多签核验 6、部署准备 19、回执核验 10，共 **45/45 PASS**。仅 `live-test/` 有新增或修改，核心合约与 SDK 验证输入 hash 仍为 `9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba`，因此未重复运行未改动核心的完整回归。
