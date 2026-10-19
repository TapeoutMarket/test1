# ACTIVE 池只读观测

从 `groupbuy-v1` 运行：

```sh
node --import tsx mainnet-observe/active-pool.mjs
```

固定使用 `https://bsc-dataseed.defibit.io` 和独立检查节点 `https://bsc-dataseed.bnbchain.org`，仅允许读 RPC 方法，并发上限 8，无自动重试。脚本不接受 `.env`、RPC 覆盖、私钥或广播参数，也不读取环境文件、签名或发送交易。

只在本轮 completion journal 已 `CONFIRMED`，且交易为 `0x17509be1a415297b7ffbad6ad346625d6f67cb24aaffdd66ab4aae7e79f9f0a6` 时运行。执行前重新核对公开输入和历史计划哈希、链 56 与固定 checkpoint、该交易的规范回执及至少 15 确认，并匹配完整购机事件。不会依赖已被公共节点裁剪的旧区块 storage。

同一个最新固定区块中记录 Vault、矿机 owner、BEM decimals 与 Vault/creator/A/B 余额、Mining key/pending、收益账本和全部 100 个 ID 的 holder/supply/claimed/claimable。SDK 身份核对的 latest 读取也固定到同一区块；结束时再检查该区块与购机回执区块的 canonical hash。

执行 10 个只读 `simulateContract`：两项越权 claim、四项无效 ID、两位持有人分别赎回、ACTIVE 状态 withdraw/markRefundable。每个调用均固定区块及 3,000,000 gas。仅真正解码出的 `NotHolder`、`InvalidIds`、`InvalidState` 可记为预期拒绝；网络超时、未知 revert 或意外成功均为 FAIL。

输出保存为 `mainnet-observe/observations/active-pool-<时间戳>.json`，明确 `transactionsSent: 0`、`privateKeysUsed: false`。最新快照不是购机交易实际到账证明，也不代表已经 harvest 或 claim；Mining pending 不是实际可到账上限。收益账本与历史购机观测发生变化时记录实际差异，不强制要求一直为零。

负向用例以当前计划的 creator67/B33 与 ACTIVE 为前提。以后合法转移 ID 或赎回后，相应模拟结果可变化，应结合最新 holder/state 解读，不能自动认定为权限漏洞。

离线测试：

```sh
node --import tsx --test mainnet-observe/active-pool.test.mjs
```
