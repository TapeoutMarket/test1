# Creator 67 份认购：独立逐笔入口

此目录只实现当前冻结会话的第四笔 `creator-contribute`。creator 地址固定为 `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`，nonce 固定为 10，向既有 Vault `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` 支付 **0.20301 BNB**，认购完整 IDs 1–67，`requireCompletion=false`。不实现 B 的认购、退款、重新部署或治理操作。

本轮已完成主网认购：交易 `0xc6318e68d9433b597bd9d3296478fd328c4cf77eb6fe9c2802e3cfd483e37abd`，区块 128578206，至少 15 个确认。creator 实际获得 ID 1–67，Vault 收到 0.20301 BNB，实际 gas 费用 0.0001774711 BNB；仍为 FUNDING，矿机仍在 A。完整 [journal](transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) 已保存。无需再次认购；保留 journal 时再次运行只核对原 hash。以下保留原操作说明。

## 先生成只读计划

在 `groupbuy-v1` 目录执行：

```bash
node --import tsx mainnet-funding/creator-contribute.mjs \
  --env ../.env --session mainnet-test/session.json \
  --public-rpc-fallback
```

显式公共模式固定使用 `https://bsc-dataseed.defibit.io`，独立检查点使用 `https://bsc-dataseed.bnbchain.org`；省略该选项时使用当前工程 `.env` 中的 `BSC_RPC_URL`。没有自动换节点或自动重试。只读阶段不读取私钥字段。

计划核对冻结源码、前序脚本、session、manifest、订单、配置和完整 artifact hashes；卖家两笔以及创建池交易均需 canonical receipt 与 15 个确认。建池前置重新核对 canonical 回执、至少 15 个确认、固定 nonce/gas/value/calldata 以及完整 `PoolCreated` / `VaultInitialized` 事件，不向公共 RPC 重读可能已裁剪的历史 storage。原建池完成时保存的状态报告保留为历史证据；本笔预检通过 SDK 和完整份额检查独立核对当前 clone/config/空池状态。计划会明确记录这一验证范围。

每轮观察在固定区块核对标准 clone、SDK 身份、订单可执行、矿机仍归 A 且授权有效、creator latest/pending nonce=10、池为 FUNDING 且未出资。完整 100 个 ID 的 holder、supply、creator balance 均需为空；1–67 的每份成本必须为 0.00303 BNB，总和为 0.20301 BNB。批量检查保留全部 ID，读取并发受到限制。gas 先独立估算、加 20% 余量，再携带同一报价和明确 gas 上限模拟。

## 预算与逐笔发送

累计预算计算为：**所有已有预留 + 本笔本金 0.20301 BNB + 本笔 gas 上限费用**。不删除历史预留、不抵扣未来可能获得的费用收入。

下一笔建议由用户审阅计划后另行确认累计上限 **0.20451 BNB**（原 gas 总预算 0.0015 + creator 本金 0.20301）。这不是对 B 后续本金的授权。下列模板仅供用户在审阅具体计划并确认后，于自己的交互终端执行；hash 和费用必须来自最新冻结计划：

```bash
MODE=live ALLOW_LIVE_SEND=true LIVE_RELEASE_VERIFIED=true \
node --import tsx mainnet-funding/creator-contribute.mjs \
  --env ../.env --session mainnet-test/session.json \
  --public-rpc-fallback --broadcast \
  --reviewed-plan-hash <PLAN_HASH> \
  --max-tx-fee-bnb <本笔gas费用上限> \
  --max-total-spend-bnb 0.20451
```

必须准确输入脚本显示的整行 `SEND creator-contribute ...`。确认后才读取当前工程 `CREATOR_PRIVATE_KEY`，并核对派生地址。脚本再次检查冻结输入、状态、nonce 和报价；先持久化预算和 journal，再签名；hash 先保存，随后至多广播一次。

**公共池存在上链竞争。** `requireCompletion=false` 不会从合约层禁止购买。若第三人在本笔确认前先认购剩余 33 个 ID，本笔可能凑齐 100 份并自动购买矿机。重复空池检查能缩小观察窗口，不能消除此竞争。脚本的预期结果是 FUNDING/67 份/没有 `Purchased`；不符合时保存回执并停止，不将实际发生的购买误报为预期测试通过。

## 回执与恢复

至少 15 个确认并核对 canonical block、hash、sender、target、nonce、calldata、value、gas 后，先保存回执，再验证业务：

- 恰一条 `Contributed`：creator、IDs 1–67、本金 0.20301 BNB、soldCount=67。
- 恰一条合约实际采用的 `TransferBatch` mint：operator/to=creator、from=零地址、完整 IDs、数量全为 1；没有额外转移、退出或 `Purchased`。
- 回执区块中，1–67 的 holder/supply/creator balance 正确，68–100 仍为空；FUNDING、fundedWei/totalPrincipalIn/Vault 原生余额均为 0.20301 BNB，退款和 purchaseSpent 均为 0，soldBitmap 正确，矿机仍归 A。

状态是区块结束观察；同区块第三人操作可能令严格后置检查停止。未知发送结果不重发、不释放预算；只核对既有 hash：

```bash
node --import tsx mainnet-funding/creator-contribute.mjs \
  --env ../.env --session mainnet-test/session.json \
  --public-rpc-fallback --reconcile
```

计划与交易记录分别位于 `mainnet-funding/plans/`、`mainnet-funding/transactions/`。不要删除 budget/journal 后重试。已经预留但没有 hash 的情况需要人工调查。失败退款是另一笔独立动作，本入口不会自动退款。

离线测试不读 `.env`、不访问 RPC、不签名：

```bash
node --import tsx --test mainnet-funding/*.test.mjs
```
