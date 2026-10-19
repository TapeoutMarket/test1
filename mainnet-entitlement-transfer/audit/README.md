# 权益随份额转移：最终离线对账

在 `groupbuy-v1` 运行：

```sh
node --import tsx mainnet-entitlement-transfer/audit/final-reconcile.mjs
```

只读取本工程公开文件，不读取 `.env`、连接 RPC、使用私钥、签名或广播。三笔新交易均为 `CONFIRMED` 且正数权益检查通过时，才会生成 `final-reconciliation.json` 的 `PASS`。尚未齐备返回 `NOT_READY`（退出码 2）；证据不一致返回 `FAIL`（退出码 1）；通过退出码 0。已存在的最终 `PASS` 永不覆盖，之后运行结果保存为 `latest-attempt.json`。

本工具独立使用编译后的 Vault/ERC20 ABI 编码固定调用、解码原始日志，并独立校验 100 个 ID 的持有人、供应量、钱包余额、已领/待领权益；不会调用发送器的事件或状态校验函数。源码/会话、三份计划 raw hash、nonce/value/calldata/gas、旧 journal 与逐步 entry hash 前缀均须一致。

原账本 H0=13665485、P0=13665400、Q0=136654、余数 85。新增实际入账 X 由两次 Sync、实际 mint 和 Harvested 共同证明；d=(X+85)/100 向下取整，Q=Q0+d，R=(X+85)%100。转移仅将 #1 从 creator 改给 B，保持其已领数 Q0 和待领 d，成为 66/34 份。最后 B 只领取 #1 的 d，其他 99 份仍待领 d；Vault 余额必须为 99d+R，且 B 实收+Vault余额=X+85。

保存的 creator `claim(1)` → `NotHolder` 元数据必须与对应区块、账户和 ID 匹配；严格错误类型的识别由原冻结发送器完成。此外，最终 PASS 必须读取同目录 `former-holder-denial-live.json`，独立用编译 ABI 解码保存的 raw revert bytes 并核对精确 `NotHolder` selector、调用参数、转移 entry hash、捕获脚本 SHA256、权益状态以及捕获时间位于转移和 B 领取之间。该文件由主线程另行执行只读捕获后保存，本对账命令不会调用捕获脚本。此处核验、解码的是已保存的证据，不是新的 RPC 模拟或最新主链确认。

回执中的实际 gas 单独计算；历史“四次部署+八笔测试”实际 gas 读取同目录不可变快照 `historical-gas-report-baseline.json` 的 `fourDeploymentsAndEightTestTransactionsActualFeeWei=1071506500000000` 字段，加本轮三笔独立回执费用得到总计。该快照复制自当时的 `mainnet-test/validation.json`，完整 raw keccak256 固定为 `0xe65b3018fb177f44e88b0c02c3e27bf7732386dec89cb532809f3b7bb96fe21f`。仅历史 gas 字段参与计算，其余快照状态是历史记录，不表示当前或最终状态。本工具不读取持续更新的主报告，也不重新查询全部历史 RPC 或解码全部历史回执。保留完整 12 项旧预算预留并加入三笔新 gas，累计预留不得超过 0.3045 BNB。

原始签名交易不落盘，因此 nonce/value/calldata 对照冻结计划与原 journal，而非重新验签。快照只表示保存的回执区块状态；Mining pending、任意钱包余额差及当前余额都不被当作交易实际收款证明。

离线测试：

```sh
node --import tsx --test --test-reporter=spec mainnet-entitlement-transfer/audit/final-reconcile.test.mjs
```
