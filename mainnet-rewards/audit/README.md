# 收益最终离线对账

在 `groupbuy-v1` 中执行：

```sh
node --import tsx mainnet-rewards/audit/final-reconcile.mjs
```

固定本轮会话与已冻结的 `501b3b…e1649` 收益脚本，仅读取公开工程文件、原始回执、三笔冻结计划和预算。不会读取 `.env`、连接 RPC、使用私钥、签名或发送交易。只写 `mainnet-rewards/audit/final-reconciliation.json`，不改原始证据或预算。

三笔均为 `CONFIRMED` 且正数收益测试通过后，独立解码编译 ABI 对应的原始日志，核对实际铸入 BEM、每份收益、67/33 笔逐 ID 领取、两笔钱包转账、100 份最终已领记录和 Vault 余数，并核对计划 raw hash、历史 entry hash 链和全部历史预算预留。实际 gas 与保守预留分列。

退出码：`0` 为离线证据对账 `PASS`，`2` 为三笔尚未齐备 `NOT_READY`，`1` 为证据不一致或读取失败 `FAIL`。保存的确认状态来自原发送器执行的至少 15 确认核验；本命令不重新查询当前确认数、当前余额或当前主链。它不是新的链上成功证明。nonce/value/calldata 对照已保存计划与 journal；工程不保存原始签名交易。
