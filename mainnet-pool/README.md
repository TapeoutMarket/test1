# 本轮固定池的主网创建脚本

此入口仅支持现有冻结会话的 `createPool`。它使用 Factory `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1`，Vault 为 `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A`。

本轮已完成主网创建：交易 `0x391c7bbee1c93025675055f0f26b7a8c8913a5333fea167b50115265efc11aca`，区块 128576858，至少 15 个确认，实际费用 0.0000692677 BNB。完整结果见 [报告](../mainnet-test/MAINNET_TEST_REPORT.md) 和 [journal](transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json)。无需再次建池；保留 journal 时再次运行只核对原交易。以下为原创建流程及复核用法。

在 `groupbuy-v1` 目录先生成只读计划：

```bash
node --import tsx mainnet-pool/create-pool.mjs \
  --env ../.env --session mainnet-test/session.json \
  --public-rpc-fallback
```

显式公共 RPC 模式固定使用 `https://bsc-dataseed.defibit.io`，独立检查点由 `https://bsc-dataseed.bnbchain.org` 验证。省略该选项时使用当前工程 `.env` 的 `BSC_RPC_URL`。脚本不会因故障自动换节点。计划只记录公共端点或脱敏标签，不记录私有 RPC URL。

计划会核对原会话、订单、配置、治理证据、完整 artifact 和脚本 hash；卖家两笔真实回执均需至少 15 个确认。创建前要求 creator latest/pending nonce 均为冻结值 9、预测地址无代码且 Factory 未登记，订单已验证且未取消/成交，矿机仍由 A 持有并授权 Seaport。Factory、模板、validator、Timelock、配置及依赖身份由 SDK 复核。

用户审阅具体计划后，可在自己的交互终端逐笔发送。以下占位符必须替换成只读计划的 hash、该笔费用上限及用户确认的累计预算：

```bash
MODE=live ALLOW_LIVE_SEND=true LIVE_RELEASE_VERIFIED=true \
node --import tsx mainnet-pool/create-pool.mjs \
  --env ../.env --session mainnet-test/session.json \
  --public-rpc-fallback --broadcast \
  --reviewed-plan-hash <PLAN_HASH> \
  --max-tx-fee-bnb <本笔费用上限> \
  --max-total-spend-bnb <累计预算>
```

只有准确输入脚本展示的整行 `SEND create-pool ...` 后才读取 `CREATOR_PRIVATE_KEY`，并检查派生地址。value 固定为 0；该笔消耗 gas，不出资、不购买矿机，也不修改治理配置。确认后和签名后重新验证 nonce、状态、源文件、gas 报价、独立估算与带 gas 上限的模拟。

脚本使用现有 `deployments/live-budget.json` 和共享锁，保留历史预留。先持久化预算与 journal，再签名；签名 hash 先保存，随后最多广播一次。任何未知结果均停止，不自动重发或释放预算。核对已记录 hash：

```bash
node --import tsx mainnet-pool/create-pool.mjs \
  --env ../.env --session mainnet-test/session.json \
  --public-rpc-fallback --reconcile
```

成功标准包括 15 次确认、canonical receipt、固定 sender/target/nonce/value/calldata/gas，完整的 `PoolCreated` 和 `VaultInitialized` 字段、标准 clone runtime、Factory 注册状态，以及回执区块的 FUNDING、soldCount=0、fundedWei=0、totalPrincipalIn=0、矿机仍归 A。先保存已匹配回执，再判断业务后置条件；业务失败保留证据供核查。状态读取是区块结束状态，同区块发生其他操作时可能导致严格后置检查停止。

输出位于 `mainnet-pool/plans/` 与 `mainnet-pool/transactions/`。不要删除预算或 journal 后重试。没有记录 hash 的预留需要人工调查。此入口不实现 67/33 出资、购买、退款或其他调用；这些步骤应另生成计划并逐笔确认。

离线回归命令（不读取 `.env`、不访问 RPC、不签名）：

```bash
node --import tsx --test mainnet-pool/*.test.mjs
```
