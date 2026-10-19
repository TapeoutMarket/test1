# TapeOut GroupBuy V1 — 阶段一候选工程

100 个独立 ERC-1155 ID 的矿机拼单：按 ID 固定成本参与、自由撤资、满额原子购买、按 ID 累计 BEM 账本、100% 持有人赎回。Factory 是 UUPS/ERC1967Proxy，治理操作经过真实 Timelock；Vault 是固定实现的 ERC-1167 clone，没有资产管理 owner 或升级入口。Factory 仅保留募资阶段的有限终止权。

本仓库在当前工作目录的 `groupbuy-v1/` 子目录独立初始化，保留原两份额实验工程。本轮用户显式授权从 `../.env` 取得只读 RPC 并派生三个测试账户地址，用于本地 fork；没有使用私钥签名或操作主网资金，通用脚本不自动加载 `.env`。规格原件保存在 `tapeout-groupbuy-codex-prompt.md`。这是新候选代码，不能沿用旧两份额报告当作审计或新版本主网成功证据。

## 一次完整本地复现

需要 Node 20.19.5+、npm、Foundry v1.4.3、tar。依赖版本和 integrity 固定在 package-lock.json；forge-std 1.9.7 的实际源码及许可证随仓库保存。没有 Git submodule 或目录外源码依赖。

在解压后的仓库根目录执行（当前本机交付路径为 `/Users/jaychen/Desktop/pin/groupbuy-v1`）：

```sh
npm ci --ignore-scripts
node scripts/bootstrap.mjs
npm run verify
npm run test:local
npm run report
npm run archive
```

全新目录先从 [Foundry 官方 v1.4.3 发布](https://github.com/foundry-rs/foundry/releases/tag/v1.4.3) 安装对应平台工具。bootstrap 从 Solidity 官方发布索引获取精确 0.8.24 二进制并验证 SHA-256；本地已存在时核验版本。Mac 使用官方 macosx-amd64 编译器，ARM Mac 需系统支持运行该官方二进制；Linux CI 为 x86_64。

`verify` 实际清理编译产物，重新编译真实 Seaport 源码、主合约，执行格式、单测、fuzz、有状态 invariant、gas、TypeScript、SDK、ABI/存储布局导出及 fork 缺参门禁。日志在 reports/。Foundry 使用离线测试模式，不进行 RPC 查询或签名识别网络请求。

`test:local` 启动独立 127.0.0.1:18545 Anvil，chainId 56，部署新的 Mock/Timelock/Factory/template/clone，使用 unlocked 本地地址跑 CLI 流水并最终关闭 Anvil。它不使用真实私钥；报告内交易 hash 仅是本地链证据。该端口必须空闲。

## 验证边界

| 层级 | 工具/证据 | 说明 |
| --- | --- | --- |
| Mock | Solidity tests、Anvil CLI 回执 | 新 Factory proxy → clone 路径 |
| 真实 Seaport 代码本地集成 | core 1.5.0/types 0.0.1、独立 solc-js 0.8.17 London | 实际签名、CREATE 部署和履约，资产是 Mock |
| BSC 真实协议 fork | [实际 fork 报告](reports/real-bsc-fork-tests.json)、[协议身份核验](docs/REAL_PROTOCOL_IDENTITY_REVIEW.md)、[结算诊断](reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) | 固定区块 128554249，Seaport 1.6 身份及修复后 fork 生命周期 PASS，包含 pending=0 时再次 harvest 的正数实收；Mining/BEM 全语义仍 Unknown |
| 既有公开市场订单 | 后续市场导出的完整 OrderEnvelope | NOT_RUN；本轮订单在 fork 内创建，不代表真实市场订单导入已通过 |
| 官方真实 CircuitMarket | CIRCUIT_RESERVED | 源码/ABI/实现身份未验证，禁用；MOCK_CIRCUIT 不代表兼容 |
| 实链/UI | 独立 checklist / 市场窗口 | 本轮 NOT_RUN，不修改市场或数据库 |

本项目合约使用 solc 0.8.24、Paris、optimizer 200、viaIR；未启用 transient storage。Seaport 1.6.x 有 Cancun 指令依赖，此次没有把该版本编译或 BSC 历史地址计为已通过。后续仍须针对实际部署版本核验源码、域、地址、完整签名和固定区块。

## CLI/SDK

### 本机 fork（当前主测试路径）

按 [本机启动与测试手册](docs/LOCAL_FORK_RUNBOOK.md)，在当前电脑运行 `npm run fork:local -- --start`。Anvil 仅监听 `127.0.0.1:18545`；私密 BSC RPC 由同机只读代理提供给 Anvil，不放进子进程命令行。测试终端从 `deployments/fork/56/local-session.json` 取执行地址、只读代理地址和固定区块，使用既有 CLI/SDK。无需另一台电脑、局域网端口、网关 token 或真实钱包私钥。

`npm run test:fork-local` 验证本地 Mock 上游 → 只读代理 → 真实 Anvil fork → CLI 部署与交易，是本机基础设施测试。另已使用真实 BSC 状态在固定区块 `128554249` 执行 fork 内创建、validate 的无签名订单生命周期，记录见 [实际 fork 报告](reports/real-bsc-fork-tests.json)。后续 [结算诊断](reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) 确认 `pending=0` 时直接 claim 仍有正数实收，旧版 harvest 的零值跳过条件会漏掉该路径；已改为始终调用 Mining.claim、保留真实错误传播，修复后主 runner 的 23 场景 / 25 笔 fork 交易通过，二次 harvest 已验证正数新增实收。既有公开市场订单的后续测试仍按 [输入清单](docs/FORK_INPUTS.md) 的订单/RPC/Mining/BEM 部分准备，忽略该清单中的 LAN 主机输入。

### 两台 Mac 的局域网 fork（保留的可选路径）

macOS M4 可单独承担 fork 服务：原生 ARM64 Anvil 1.4.3 仅监听服务端 loopback；Node 网关校验客户端 IP、令牌与会话。上游 RPC 通过只读代理供 Anvil 读取，客户端通过本机 relay 调用 fork。保持 chainId 56 以验证原始订单签名。主机只运行这三个内置 Node 脚本，无需 Solidity 编译器或真实钱包私钥。

- [所需订单、RPC 与协议资料](docs/FORK_INPUTS.md)
- [给另一台 macOS M4 Codex 的完整 prompt](docs/MAC_M4_FORK_HOST_PROMPT.md)
- [本机连接与测试命令](docs/FORK_CLIENT_RUNBOOK.md)

`npm run fork:host -- --start` 启动远端服务；`npm run fork:connect -- --start` 在客户端建立 loopback relay。参数必须按文档显式提供，脚本不读取 `.env`。`npm run fork:prepare` 只读核验输入并生成候选 Config、deadline 与运行计划，不发交易。`npm run test:fork-lan` 使用真实 Anvil 和**本地 Mock 上游**测试传输隔离，不代表 BSC fork 或两台 Mac 已联通。HTTP 网关仅限可信局域网，无 TLS；不映射公网，不在不可信网络裸用令牌。

```sh
npm run cli -- help
npm run cli -- import-order --order fixtures/seaport-order.example.json
npm run cli -- deploy-local
node scripts/fork-preflight.mjs
```

上述命令分别显示帮助、只做结构导入、生成未执行的部署计划、记录缺参 NOT_RUN。所有资产操作默认只读模拟；本地发送须 `--send-local` 且核验 loopback Anvil；真实广播须全部 live 门槛、代码身份、预算和逐笔 TTY 确认。本轮不执行 live。

CLI 包含 protocol-check、import-order、deploy-local、create-pool、contribute、withdraw、mark-refundable、guardian-cancel、harvest、claim-batch、harvest-and-claim、transfer-shares、redeem、redeem-without-harvest、claim-residual、inspect、report。

`.env.example` 仅是变量说明，脚本不自动读取任何 `.env`。用户后续自行显式注入本仓库配置。fork 的 EXECUTION_RPC_URL 必须是 loopback Anvil 或明确设置 `FORK_EXECUTION_TOPOLOGY=lan-relay` 后通过会话核验的 loopback relay；FORK_SOURCE_RPC_URL 只用于来源读取，不能作为写交易目标。LAN 执行报告标记 `executionLocation=LAN_ANVIL_FORK`，不会把另一台机器称为本机链。保持 chainId 56 是为了订单域兼容，不能用它单独判断主网/本地。

合约本地部署脚本 `script/DeployLocal.s.sol:DeployLocal` 默认创建暂停的新 Factory，模板及配置批准必须经 Timelock 的 schedule/execute，不能用“本地演示”跳过真实升级授权。该脚本仅在 CLI 已核验本地 Anvil 后执行；完整自动测试采用 scripts/local-smoke.mjs。

部署后通过以下脚本配置本地 Factory（地址和 JSON 路径来自同次本地部署；MODE 必须已显式设置为 mock 或 fork）：

```sh
node --import tsx scripts/configure-local.mjs \
  --factory '<Factory proxy>' --template '<固定Vault模板>' \
  --timelock '<本地Timelock>' --from '<本地proposer/executor公开地址>' \
  --config fixtures/fork-config.json
```

默认只输出经核验的计划。给同一条命令增加 `--send-local` 才执行真实 Timelock scheduleBatch → 推进隔离 Anvil 时间 → executeBatch，并检查两笔回执和最终 Factory 配置。脚本拒绝 live、未经核验的远程执行目标和 `--broadcast`，不加载 `.env` 或私钥；Mock 配置要求 mockOnly=true，fork 只接受当前支持的真实 Seaport 配置。完整顺序和订单过期处理见 `FORK_TEST_RUNBOOK.md`；证据写入 `reports/local-governance-<operationId>.json`，execution 字段区分本机与 LAN fork。

## 交付文件

| 文件 | 用途 |
| --- | --- |
| SPEC.md / SECURITY_MODEL.md | 业务、不变量、意外资产、有限治理与恢复边界 |
| PROTOCOL_COMPATIBILITY.md | 已验证子集与未知真实协议 |
| CONTRACT_REPORT.md / .json | 逐测试名称、各层结果、gas、源码 hash、阻塞项 |
| MARKET_HANDOFF.md | 应交给市场窗口的只读 JSON/API 联调契约 |
| FORK_TEST_RUNBOOK.md / LIVE_TEST_CHECKLIST.md | 后续隔离 fork 与逐笔实链授权流程 |
| schemas/order-envelope-v1.schema.json | 严格 OrderEnvelope v1 |
| exports/*.abi.json / abi.ts | 实际编译 ABI 与 TypeScript 常量类型 |
| exports/*.storage-layout.json | 实际编译存储布局；ERC7201 namespace 另由源码常量与升级测试核验 |
| RELEASE_MANIFEST.json | 源码快照、锁文件、编译参数及外层源码包校验 |
| artifacts/tapeout-groupbuy-v1-source.tar.gz | 白名单源码归档，含依赖获取方法与 SHA256SUMS |

归档不含 `.env`、真实私钥、node_modules、broadcast、原项目文件、编译器二进制或缓存。内嵌 manifest 无法包含自己的归档 hash；使用源码包旁 `.sha256` 或外层 RELEASE_MANIFEST.json 验证压缩包，再在解压目录运行 `shasum -a 256 -c SHA256SUMS`。依赖通过 npm ci 重新取得，合约与真实 Seaport 产物可重新编译。

下一步给市场窗口 MARKET_HANDOFF.md 与 Schema/样例，让其在自己的目录导出真实完整订单。这里只导入当前仓库 JSON 或显式允许的 localhost 只读 API，不访问数据库。没有真实材料时，本地工程仍可完整复现。
