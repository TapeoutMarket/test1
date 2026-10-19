# BSC 真实状态 fork 测试入口

本目录目前没有可宣称通过的真实 BSC fork 测试。缺少显式只读来源 RPC、固定区块和真实完整订单，状态为 **NOT_RUN**。本地真实 Seaport 源码 + Mock 资产测试位于 `test/integration/`，不能替代这里的真实资产、Mining、BEM 和市场状态。

先在仓库根目录执行：

```bash
node scripts/fork-preflight.mjs
```

脚本只读取进程中显式提供的配置，**不会自动读取 `.env`**。缺少 `FORK_SOURCE_RPC_URL`、`ORDER_FILE` 或 `FORK_BLOCK_NUMBER` 时，将原因写入 `reports/fork-status.json` 并以退出码 0 结束；该退出码意味着正确处理了未执行条件，不意味着 fork 测试通过。

具备真实资料后，必须显式设置 `MODE=fork`、`SOURCE_CHAIN_ID=56`、`EXPECTED_EXECUTION_CHAIN_ID=56`、`EXECUTION_RPC_URL`、`FORK_SOURCE_RPC_URL`、`FORK_BLOCK_NUMBER` 和 `ORDER_FILE`。`FORK_BLOCK_HASH` 可额外固定预期 hash；无论是否提供，脚本都会向来源 RPC 查询该指定区块，并与本地 fork 和订单验证区块交叉核对。订单 JSON 必须位于当前仓库，软链接不能指向仓库外。示例 fixture 的 unknown 身份不能冒充真实订单。

脚本输出中包含的 Anvil 启动计划只是文字，**不会启动进程**；不会显示来源 URL 的实际值。用户后续手动启动时应保证来源凭证不进入终端记录、报告或源码包。示意命令：

```bash
anvil --host 127.0.0.1 --chain-id 56 --fork-url "$FORK_SOURCE_RPC_URL" --fork-block-number "$FORK_BLOCK_NUMBER"
```

预检依次要求：

1. 执行目标是无凭证的 localhost / 127.0.0.1 / ::1 HTTP origin，且与来源 URL 不同。
2. 客户端 `web3_clientVersion` 确认为 Anvil，`anvil_nodeInfo.forkConfig` 明确提供 forkBlockNumber、forkBlockHash、forkUrl；缺少字段即 fail closed，不把 chainId 56 单独视为 fork 证明。
3. 内部比较 forkUrl 与显式来源 URL，不输出任何 URL 或完整 nodeInfo；对来源和执行端均核对 chainId 56。
4. 真实订单必须经过 SDK OrderEnvelope 结构/完整 commitment 校验，validation 与 identity 标记 verified，并与指定区块 number/hash 一致。官方 `CIRCUIT_RESERVED` 仍拒绝，不能用 Mock 成功替代实际官方版本证据。
5. 向来源只读查询指定区块，不查询来源最新订单状态；后续订单状态、授权、签名和代码检查复用 SDK，全部针对本地 Anvil。
6. 预检结束复查来源固定区块 hash 未改变。任何失败写明确原因和阶段，不打印嵌套 provider 错误或凭证。

这份脚本没有部署、转账、impersonate、setBalance、签名、广播、anvil_reset 或协议存储修改能力。来源 RPC 调用白名单仅允许必要的只读方法。成功时仅 `preflight.status=PASS`，**整体 `status` 和 `completeForkTestExecuted` 仍分别为 NOT_RUN / false**。

之后须按根目录 `FORK_TEST_RUNBOOK.md`，在已核验的本地 Anvil 上执行 CLI 全流程：部署 Factory proxy / 固定模板与 clone、create-pool、参与与退出、满额购买、Mining 实际领取、按 ID 领取、带未领权益转手、100 份归集与正常 / 故障赎回。每笔只发往本地执行 RPC，保存回执、区块 hash、NFT 所有权和原始代币余额。不能覆盖真实协议代码或存储，也不能用 mockCall 让真实签名、授权和收益检查返回预定答案。

只有这些阶段实际运行完成并核对证据后，才能新增完整 fork 测试 PASS 报告；预检成功或启动一个本地节点都不够。后续 live 操作仍需要独立逐笔授权，本轮入口不能授权或发送主网交易。
