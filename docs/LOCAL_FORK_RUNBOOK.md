# 本机真实状态 fork 测试

当前主路径是在这台电脑启动固定区块 BSC fork，再用本工程 SDK/CLI 测试。**不部署主网、不广播真实交易、不修改市场或数据库。** LAN 方案保留为可选路径，本流程不需要另一台电脑、网关 token、session 环境变量或任何钱包私钥。

本次已使用授权的本地 RPC 和三个公开地址，在 BSC 固定区块 128554249 执行 fork 内新建订单的生命周期测试。随后 [结算诊断](../reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) 确认 pending=0 时仍可直接 claim 获得正数 BEM；Vault 已移除旧跳过条件，修复后持续收益回归通过，二次 harvest 验证了正数新增实收及账本增量。结果见 [本次测试报告](REAL_BSC_FORK_TEST_REPORT.md)，其中详细金额和回执以修复后的最终 JSON 为准；其订单未发布到主网。下文分别提供本次专用入口和外部订单通用入口，命令本身不是成功证明。

## 本次已授权的三个账户与 fork 新建订单

用户已明确授权读取当前 `pin/.env`，复用 creator、A、B 三个地址；该文件中的 `ALLOW_LIVE_SEND` 不会用于本轮。只把私钥用于本机推导并核对公开地址，不用它们签署交易或订单。实际测试通过 Anvil impersonation 和本地 BNB 余额补充执行。A 持有的真实 TapeOut #3204 是测试标的。

从 `groupbuy-v1/` 执行下面的专用入口；只有显式传入 `--env` 才读取该文件，其他通用脚本仍不自动加载 `.env`：

```bash
# 只读：核对三个地址、NFT归属，选定 provider finalized 区块并保存公开观察。
node scripts/probe-authorized-fork.mjs --env ../.env
# 保持运行：按上一步已固定的 number/hash 启动本机 fork。
node scripts/start-authorized-fork.mjs --env ../.env
```

另开终端，在同一 `groupbuy-v1/` 执行：

```bash
node scripts/test-real-mining-settlement.mjs --run
# 确认诊断报告 status=PASS、cleanup.status=PASS 且 snapshotRestored=true 后再继续：
node scripts/run-authorized-fork-tests.mjs --run
# 保持 fork 启动器运行，核对真实来源链测试结束时的固定快照：
node scripts/check-authorized-source.mjs
```

独立结算诊断在 fresh fork 中发送两笔 Mining.claim，核对 pending=0 仍可正数结算；首次领取所在同一区块的再次调用仅用 eth_call 模拟，不发送第三笔交易。诊断结束恢复 snapshot 并停止 impersonation，必须确认 cleanup PASS 后才能让主 runner 使用恢复后的 fresh fork。诊断回执保存在独立报告中，不能计入主 runner 的交易数或当作恢复后仍在本地规范链上的交易。

测试 runner 只读公开的 source observation 和 local session；它不读取 `.env`。它在 fork 中模拟 A，针对单个 NFT 授权 Seaport，再调用真实 Seaport `validate` 创建 `signature="0x"` 的订单。卖价 **0.3 BNB**，测试费用 **0.003 BNB**，总出资 **0.303 BNB**；费用接收者明确使用 creator 作为 fork 测试配置，不代表正式市场收费地址。不会发布市场订单或生成主网可重放的签名。

该订单的验证区块在 source pin 之后，必须显式使用 `FORK_ORDER_ORIGIN=fork-created` 并核对实际 fork checkpoint hash；runner 已传入。普通外部订单的固定块要求不变。结果见 `reports/real-bsc-fork-tests.json`，状态、失败项和未执行项以实际报告为准。再次执行完整测试需要一个新启动的同区块 fork，不能直接沿用已消费订单/已赎回池；先停止当前启动器，再从固定观察重启。重跑只读 probe 会重新选择 finalized 区块，应作为新的测试批次记录。

## 1. 外部已存在订单的通用路径：准备四项输入

| 输入 | 要求 |
| --- | --- |
| BSC 只读源 RPC | chainId 56，能读取所选历史区块的合约状态；URL/API key 仅在本机隐藏输入，不贴聊天。 |
| 固定区块 number/hash | 十进制区块号和完整 32 字节 hash；双方明确确认，不使用浮动 latest。 |
| 一份完整真实 Seaport 订单 JSON | 放到本工程 `fixtures/real-order.json`，格式与 [MARKET_HANDOFF.md](../MARKET_HANDOFF.md) 一致；签名、counter、EIP-712 域和完整 consideration 缺一不可。 |
| Mining、BEM 的真实地址和身份来源 | NFT collection 来自订单；Mining/BEM 的准确源码/ABI、代理实现与收款语义仍需复核，不复制 Mock 地址。 |

首轮只需一份已存在的公开有效订单，可用 snapshot/revert 分别测两个赎回分支。不需要新建低价真实挂单。当前只支持 FULL_OPEN、单 ERC721、固定原生 BNB 价格、卖家金额加向下取整 1% 市场费、zone/conduit 为零的 Seaport 子集；官方 Circuit 适配保持禁用。

订单 `validation.blockNumber/blockHash` 必须与固定 fork 一致。固定区块处卖家须持有矿机且授权有效，订单未取消/成交/到期；剩余期限须容纳本地部署和 Timelock 延迟。尚未选块时只能只读提出候选 number/hash，确认后再启动，不能自行浮动换块。完整字段见 [FORK_INPUTS.md](FORK_INPUTS.md) 的订单与协议部分；其中 LAN 网络准备不适用于本机路径。

## 2. 本机工具链

在本工程根目录执行；通用命令不自动加载 `.env`，上面的专用授权入口仅读取显式指定的 `pin/.env`。需要 Node >=20.19、Foundry v1.4.3；编译使用本工程 solc 0.8.24 工具链。已有合格工具直接复用。

```bash
npm ci --ignore-scripts
node scripts/bootstrap.mjs
npm run build:seaport
npm run build
npm run typecheck
npm run test:sdk
```

这些命令检查本地工程，不代表真实协议测试成功。若工具链失败，先修复具体问题，不通过跳过安全检查来启动测试。

## 3. 终端一：隐藏输入源 RPC，启动本机 fork

下面公开占位值须换成本次已确认的区块信息：

```bash
export FORK_BLOCK_NUMBER='<已确认的十进制区块号>'
export FORK_BLOCK_HASH='<同一区块完整hash>'
export FORK_LOCAL_PORT=18545
```

在本机 zsh 终端由用户亲自隐藏输入 RPC，避免把 URL 写入命令历史或聊天：

```zsh
read -r -s 'FORK_SOURCE_RPC_URL?请输入 BSC 只读源 RPC（隐藏输入）：'
print
export FORK_SOURCE_RPC_URL
node scripts/fork-local.mjs --start
```

使用该启动器而不是将真实源 URL 写进 `anvil --fork-url` 命令行。启动器在内部使用只读 source proxy，Anvil 的上游为本机代理，真实 RPC 密钥不进入子进程命令行。Anvil 仅监听 `127.0.0.1:18545`，不向局域网或公网开放。

启动后读取公开 `deployments/fork/56/local-session.json`，核对 `forkBlockNumber`、`forkBlockHash`、`executionRPCURL` 和 `sourceProxyURL`。其中 `sourceProxyURL` 是本机 `127.0.0.1` 上的随机端口，不是真实 provider URL；文件不应含真实源 RPC 凭证。保持终端一运行；Ctrl+C 应关闭本次 Anvil 和内部 source proxy，不终止其他项目的进程。

## 4. 终端二：执行模式、订单与预检

在同一工程另开终端。先查看公开 manifest，**终端二的 `FORK_SOURCE_RPC_URL` 设置为它的 `sourceProxyURL`**，真实源 RPC 秘密只留在终端一。执行 RPC 设置为 `executionRPCURL`，两者不能相同。如果此前用过 LAN 方案，先清除它的 session 配置：

```bash
cat deployments/fork/56/local-session.json
unset FORK_SESSION_ID FORK_GATEWAY_URL FORK_GATEWAY_TOKEN
export MODE=fork
export FORK_EXECUTION_TOPOLOGY=loopback
export EXECUTION_RPC_URL='<manifest.executionRPCURL，默认 http://127.0.0.1:18545/>'
export FORK_SOURCE_RPC_URL='<manifest.sourceProxyURL，http://127.0.0.1:本次随机端口/>'
export SOURCE_CHAIN_ID=56
export EXPECTED_EXECUTION_CHAIN_ID=56
export FORK_BLOCK_NUMBER='<与终端一/公开manifest相同的区块号>'
export FORK_BLOCK_HASH='<与终端一/公开manifest相同的区块hash>'
export ALLOW_LIVE_SEND=false
```

导入订单，不覆盖已有冻结文件；已有本次冻结文件时直接使用它：

```bash
npm run cli -- import-order --order fixtures/real-order.json --out fixtures/frozen-order.json
export ORDER_FILE=fixtures/frozen-order.json
node scripts/fork-preflight.mjs
npm run cli -- protocol-check --order "$ORDER_FILE"
```

查看 `reports/fork-status.json`，必须有 `preflight.status=PASS` 且新鲜的 `protocol-check.executable=true` 才继续。预检通过本机只读 proxy 查询上游固定区块，并严格核对 Anvil 的 `forkUrl` 等于该 proxy URL；不要为了通过预检删除这项比较。host 重启后 proxy 端口可能变化，需重新读取本次 manifest。

只读预检的整体完整测试状态仍为 NOT_RUN；不要把订单 import 的 `IMPORTED_STRUCTURE_ONLY` 当作执行成功。预检还核对 chainId、Anvil 身份、固定区块 hash、订单域、counter/status、owner/授权；unknown 资料不能手改为 verified。

## 5. 只读生成配置和期限

```bash
export FORK_MINING_ADDRESS='<真实 Mining 地址>'
export FORK_BEM_ADDRESS='<真实 BEM 地址>'
export FORK_CASE_NAME=local-first-case
export FORK_SAFETY_MARGIN=300
node --import tsx scripts/fork-prepare.mjs
```

准备脚本无广播参数。成功状态为 `PREPARED_READ_ONLY_NOT_EXECUTED`；本例输出 `reports/fork-local-first-case-prepared.json`，包含实际 `configFile`、`deadline`、订单 SHA-256、配置/条款 hash、Mining key/pending 与 BEM decimals/codehash。

```bash
cat reports/fork-local-first-case-prepared.json
export FORK_CONFIG_FILE='<结果中的 configFile>'
export FORK_POOL_DEADLINE='<结果中的 deadline>'
export FORK_POOL_NAME='<结果 commands.createPlan 中 --name 后的值>'
```

默认 deadline 为 `min(订单 endTime - safetyMargin, fork 当前时间 + 3600)`，要求还剩超过 120 秒；可在准备前显式设置合法 `FORK_DEADLINE`。时间不足就选合适订单/固定区块重做，不修改签署条款。结果文件不覆盖，输入或观察结果变化时使用新的 case 名保留证据。

## 6. 进入实际 fork 生命周期

保持上面的 loopback 配置，按 [FORK_TEST_RUNBOOK.md](../FORK_TEST_RUNBOOK.md) 的“新 Factory 与 clone”及之后章节执行；配置文件、deadline、名称使用本次准备结果，不照抄手册里的示例值。只使用 Anvil 公开解锁的测试账户，A/deployer 与 guardian 不同，不读取真实私钥。

```bash
export FORK_A=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
export FORK_B=0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc
npm run cli -- deploy-local --from "$FORK_A"
npm run cli -- deploy-local --from "$FORK_A" --send-local
```

记录本次新 Factory/template/Timelock 地址，先通过 `configure-local.mjs` 计划与 `--send-local` 完成治理配置，再检查订单和 deadline、创建 clone。后续每个命令默认模拟，仅明确添加 `--send-local` 才发送到本机 fork；本轮 CLI 不使用 `--broadcast`。

验收顺序为：

1. A 出资 ID 1～45，退出 ID 1 并重新参与，B 出资 46～100 且要求本笔满额；核对本金、退款、矿机 owner=Vault 及 ACTIVE。
2. 真实 harvest 后核对 BEM 实际到账。还须在首次 claim 后推进隔离 fork 的时间/区块，记录再次调用前的 pending、Vault 余额和 totalAccounted，验证 pending=0 的情况下再次 harvest 也能取得正数新增实收，并核对账本增量；旧余数使余额大于零不能当成新增收益。为测试未领取权益转移，保留 ID 1 未领取，转给新持有人；旧持有人模拟领取必须失败，新持有人取得原权益，`claimed` 历史不重置。
3. 归集全部 100 份给 A，使用同一 snapshot 分别执行正常赎回、无 harvest 赎回及残余权益领取；在 revert 前保存各自回执和观察，两个分支分别对账。

Mining `pending>0` 不等于 Vault 已收款，`pending=0` 也不能作为跳过 claim 的条件：本轮直接领取诊断已给出正数实收反例。推进时间或区块本身不证明收益一定产生，必须核对实际到账及事件。正数入账或单份正数权益无法产生时，对应测试记 NOT_RUN/BLOCKED；不能人工 mint BEM、覆盖真实协议代码/存储或使用 mockCall 补成成功。普通领取使用 `claim-batch`，只有明确需要同时拉取 Mining 收益才使用 `harvest-and-claim`。

## 7. 证据与停服

保留公开 local manifest、冻结订单及 hash、准备报告、治理报告、`reports/fork-<command>-<hash>.json` 和各次只读观察。区分节点启动、预检、已模拟、已发 fork 交易与完整测试通过；实际未执行的项目保持 NOT_RUN。此处所有交易 hash/receipt 都属于本地副本，不是主网证据。

测试结束在终端一 Ctrl+C 停止本次服务，核对 Anvil/source proxy 退出和端口释放。不要删除测试证据，不关闭全局防火墙或其他未知进程。
