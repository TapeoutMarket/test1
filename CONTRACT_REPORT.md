# TapeOut 拼单 V1 阶段一合约报告

阶段一候选工程已在本地实施并运行。**不代表主网部署或独立审计通过；真实 BSC fork 结果按下表及独立证据区分。** 源码快照 SHA-256：`6b9c0d6195f80217f5a9aeb867e5ccecaf855e0cd8545c85455e22efdacd90bf`。

## 结果分层

| 层级 | 结果 | 边界 |
| --- | --- | --- |
| Mock / Factory proxy → clone | PASS | 本地独立新工程，100 ID |
| 真实 Seaport Solidity 本地集成 | PASS | core 1.5.0/types 0.0.1，Mock NFT/Mining/BEM |
| BSC 真实状态 fork / 本地新建订单 | PASS | signature=0x；fork 内批准与 validate，不是公开主网挂单 |
| 实链 | NOT_RUN | 本轮未部署或广播真实交易 |
| UI | NOT_RUN | 本轮交付 CLI/SDK，未修改市场 |

## 实际测试

共 79 个 Solidity 测试/不变量属性全部通过；SDK 78 项通过，TypeScript 检查通过。具体每项名称、kind/fuzz统计和结果见本报告 JSON 的 suites 以及原始 reports/solidity-tests.json。

| 套件 | 项目数 | 结果 |
| --- | --- | --- |
| test/integration/RealSeaport.t.sol:RealSeaportTest | 10 | PASS |
| test/invariant/Accounting.t.sol:AccountingInvariantTest | 2 | PASS |
| test/invariant/Accounting.t.sol:ActiveAccountingInvariantTest | 1 | PASS |
| test/unit/FactoryClones.t.sol:FactoryClonesTest | 11 | PASS |
| test/unit/FactoryGovernance.t.sol:FactoryGovernanceTest | 8 | PASS |
| test/unit/FundingRewards.t.sol:FundingRewardsTest | 24 | PASS |
| test/unit/GasBench.t.sol:GasBenchClaim100Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchClaim45Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchClaim55Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchContribute100Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchRedeem100Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchTransfer100Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchWithdraw99Test | 1 | PASS |
| test/unit/VaultEdge.t.sol:VaultEdgeTest | 16 | PASS |

Fuzz 成本测试运行 256 次；有状态不变量每个属性 128 轮、深度 64。另有持续 ACTIVE 的独立 campaign，仅生成捐款/领取/转移，避免终止后的空操作遮蔽收益序列。检查逐 ID 0/1 供应、位图、有效本金守恒、逐 ID 历史领取、余数/未入账余额与实际付款，不要求各历史钱包金额相同。

独立 loopback Anvil CLI 流水：57 项部署/调用/命令记录，PASS；使用 unlocked 本地账户，没有读取真实私钥。所有该流水交易 hash 只属于临时本地链。原始证据：reports/local-smoke.json 与 reports/local-cli-final-state.json。

## 编译、大小及 gas

Factory/Vault/固定验证器：Solidity 0.8.24、Paris、optimizer 200、viaIR；标准 storage 重入锁。真实 Seaport 1.5.0 因其精确 pragma，单独以 solc-js 0.8.17/London 从锁定源码编译，测试用真实 CREATE 部署产物；没有重写协议 storage、bytecode 或用 mockCall 冒充履约。此前尝试的 1.6.x 源码依赖 Cancun 指令，因此未计为本地源码编译通过；本次 BSC 已部署 1.6 字节码的 fork 测试另行列示。

| 合约 | runtime 字节 | EIP-170 剩余字节 |
| --- | --- | --- |
| GroupBuyVault | 24167 | 409 |
| GroupBuyFactory | 10333 | 14243 |
| GovernanceTimelock | 5663 | 18913 |
| MarketValidator | 7681 | 16895 |

没有设置无限 code-size。MarketValidator 是模板构造时创建且 immutable 绑定的固定只读合约，Vault 仅 STATICCALL 校验；购买、Mining、付款仍由 Vault 自己调用。编译产物 hash 含 immutable 占位，不能代替实际部署后 codehash。

| 操作 | 本地操作执行 gas（不含交易基础费用） |
| --- | --- |
| GAS_LOCAL_CLAIM_BATCH_45 | 1457684 |
| GAS_LOCAL_CONTRIBUTE_100_PURCHASE | 5222775 |
| GAS_LOCAL_WITHDRAW_99_FUNDING | 1366613 |
| GAS_LOCAL_CLAIM_BATCH_100 | 3106504 |
| GAS_LOCAL_CLAIM_BATCH_55_AFTER_45 | 1740363 |
| GAS_LOCAL_TRANSFER_BATCH_100_TO_REDEEMER | 3144291 |
| GAS_LOCAL_REDEEM_100_POSITIVE_HARVEST_DUST | 3285783 |

100 份一旦满额即原子购买，因此正常 FUNDING 不可能保留 100 份待批量退款；批量退款测量采用最大可停留的 99 份。gas 是本地编译/Mock条件测量，不保证真实 BSC 市场或矿机同样消耗，阶段二仍须 estimate 和实际 gas/区块限制核验。

## 修复与权限复核

开发测试发现并修复：真实 BSC fork 暴露 Mining.pending 为 0 时 claim 仍会结算新收益，移除原先错误的跳过条件，始终调用固定 Mining.claim 并让错误传播；永久失效终止分支不可达；ERC-1271 签名撤销遮蔽明确取消/counter失效；BEM 扣税造成收款不足；Harvested 把旧捐款误计为新 Mining 收入；重复 CREATE2 salt 的失败路径高 gas；初版 Vault 超代码大小；最终干净回归发现并修复 MockBEM 扣税分支及 invariant 归集步骤的条件作用域错误。对应失败原因和回归测试保留在命名测试及源码中，最终干净重跑全部通过。

Factory 使用 UUPS/ERC1967Proxy，升级、模板配置、恢复创建均走实际 Timelock；guardian 只能暂停创建或使 FUNDING → REFUNDABLE。恶意 Factory V2 可中断募资，不能改退款受益人/提款、控制 ACTIVE 矿机或升级旧 clone。Vault 没有资产管理 owner、升级或任意执行入口。operator 不能直接领取/退款/赎回，但标准 ERC1155 授权允许先转移份额；获得真实持有权后可行使对应权益。

## 未执行与发布阻塞

- BSC 真实状态 fork 的本地新建订单结果见 bscFork；既有主网签名订单、正式市场发布/API 与实链均未执行。
- 官方 CircuitMarket 的准确源码、ABI、代理实现及升级约束未核验；CIRCUIT_RESERVED 默认禁用。
- 本地源码集成为 Seaport 1.5.0；BSC 1.6 本次固定状态测试只覆盖具体已执行路径，不能推广为全部版本/订单形态兼容。
- 真实 collection、Mining、BEM 的固定区块身份与本次实收路径见独立报告；未核实的源码语义和升级边界保持 Unknown，不能以单例测试代替审计。
- 生产多签、Timelock/控制器代码、延迟和完整角色尚未配置及核验；本地 EOA 角色仅用于测试。
- Vault 代码大小余量有限且不可升级 clone 无法修补；接触公众资金前仍需独立复核/审计。

Slither：NOT_RUN（Not installed in this environment; compiler checks and tests are not an independent security audit.）。编译/格式/存储布局导出和权限升级回归已执行。没有对新增候选代码作出独立审计结论。依赖安全公告记录见 reports/npm-audit.json（若查询不可用应标 UNKNOWN，不能写零漏洞）。

## 交付与复现

先运行 npm ci --ignore-scripts；安装 Foundry v1.4.3 后运行 node scripts/bootstrap.mjs。完整本地验证：npm run verify；CLI 实际流水：npm run test:local；报告与源码包：npm run report && npm run archive。

ABI 与 TypeScript ABI：exports/；SDK：sdk/；严格订单 Schema：schemas/order-envelope-v1.schema.json；两市场公开结构样例：fixtures/。本地样例不是仍然有效的真实挂单。

市场窗口应接收 MARKET_HANDOFF.md、Schema、SDK/ABI 和样例。下一步只需在本仓库导入市场窗口导出的完整公开订单，并显式提供只读来源 RPC/固定区块，按 FORK_TEST_RUNBOOK.md 做隔离 fork；不需要数据库凭证或真实私钥。

## 真实 BSC fork 独立证据

状态：PASS。完整交易、金额、分支和未覆盖项见 reports/real-bsc-fork-tests.json，SHA-256 为 8762427a6054472f7d064e708eeda3997aaf625f45d21cc41c56b945d594131e。使用真实 BSC 固定区块的 NFT/Mining/BEM/Seaport 状态，订单在 fork 内以持有人模拟身份预验证，无可供主网重放的签名。它不验证市场数据库/UI、既有主网签名订单或主网广播。

## 本机 fork 测试准备

当前主路径为本机 loopback Anvil + 上游只读代理，不需要另一台电脑或 LAN 端口。只读候选 Config 脚本生成明确 deadline 与运行计划。SDK 共 78 项通过（含本轮新增覆盖）。本机 fork 传输自测：PASS，32 项检查；证据 reports/fork-local-selftest.json。该自测上游是本机 Mock Anvil，不能替代真实 BSC 或真实订单测试。真实 BSC fork 生命周期结果见上面的独立证据；主网交易仍为 NOT_RUN。

本次真实 Anvil 启动测试发现 v1.4.3 原生 nodeInfo 不含 forkBlockHash，已修正：核对原生 forkBlockNumber/sourceURL，并独立读取固定区块的真实 number/hash；若原生 hash 存在也必须匹配。不会用期望 hash 伪造观测值。完整本机命令见 docs/LOCAL_FORK_RUNBOOK.md。

保留的可选 LAN 路径传输自测：PASS，30 项；证据 reports/fork-lan-selftest.json。仅本机模拟传输，跨两台 Mac 的网络仍 NOT_RUN。远端 prompt 为 docs/MAC_M4_FORK_HOST_PROMPT.md；不作为当前主测试路径。

reports/archive-rebuild*.json/.txt 与 reports/archive-rebuild-run/ 如存在，属于文件内源码 hash 对应的历史重建记录，不代表本次修改后的归档已重建。当前验证以本报告的源码 hash 和 verification/localCLI/localForkTransport/lanTransport 引用为准。
