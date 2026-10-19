# 主网份额转移与未领收益测试

本目录是新的独立测试工具，不修改原 Vault、Factory、会话、订单或旧发送器。三个动作必须分别生成计划、由用户确认后执行。代码和离线测试完成不代表主网测试已执行；实际进度见本目录 journal 和主线程报告。

| 步骤 | 固定调用 | 调用方 / nonce | value |
| --- | --- | --- | --- |
| `new-harvest` | `harvest()` | creator / 13 | 0 BNB |
| `transfer-share` | `safeTransferFrom(creator, B, 1, 1, 0x)` | creator / 14 | 0 BNB |
| `buyer-b-claim` | `claim(1)` | B / 6 | 0 BNB |

固定 Vault：`0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A`。creator 为 `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`，B 为 `0x63979C9d5200A5080be93eb440D469d2F2ec6682`。latest/pending nonce 必须同时等于表中值；漂移则停止，不自动选新 nonce。

在 `groupbuy-v1` 中先生成当前一步的只读计划：

```sh
node --import tsx mainnet-entitlement-transfer/entitlement.mjs \
  --env ../.env --session mainnet-test/session.json \
  --step new-harvest --public-rpc-fallback
```

随后两步分别使用 `--step transfer-share` 和 `--step buyer-b-claim`。每一步只能在其前一步已确认且正数权益测试 PASS 后准备。

用户批准该笔计划 hash 和最大 gas 后，执行以下模板，仍需在 TTY 输入打印的完整 `SEND` 行：

```sh
MODE=live ALLOW_LIVE_SEND=true LIVE_RELEASE_VERIFIED=true \
node --import tsx mainnet-entitlement-transfer/entitlement.mjs \
  --env ../.env --session mainnet-test/session.json \
  --step new-harvest --public-rpc-fallback --broadcast \
  --reviewed-plan-hash '<本笔审阅后的计划 hash>' \
  --max-tx-fee-bnb '<本笔批准的最大 gas>' \
  --max-total-spend-bnb 0.3045
```

先前全部 12 项预算预留 `0.3043039911 BNB` 必须按完整有序 hash 保留，本轮只追加 gas，累计上限保持 `0.3045 BNB`。不会抵扣收到的 BEM、手续费收入或预留与实际 gas 的差值。每笔分别批准，前一笔确认不授权后一笔。

默认只读计划仅读取本工程 `.env` 的 RPC 配置，不读取私钥。显式 `--public-rpc-fallback` 固定主节点为 `https://bsc-dataseed.defibit.io`，独立节点为 `https://bsc-dataseed.bnbchain.org`；没有自动切换或重试。只读调用经方法白名单与全局并发 8 限制。两笔 creator 操作在确认、重核和预留持久化后才读取 `CREATOR_PRIVATE_KEY`；最后 B 操作读取 `HOLDER_B_PRIVATE_KEY`，核对派生地址，密钥和原始签名交易不输出、不保存。

初始账本固定为 raw：`totalAccounted=13665485`、`totalPaid=13665400`、`accPerShare=136654`、`remainder=85`、Vault BEM `85`，所有 100 个 ID 的 `claimed=136654`、`claimable=0`，creator/B 持有 67/33 份。

新增实际 Mining 入账记作 X。第一条 `RewardsSynced` 必须收到 0 并保持原账本；BEM `Transfer(0x0 → Vault)`、第二条 Sync 和 `Harvested` 的实际新增额必须一致。新增每份权益 `d=floor((X+85)/100)`，新累计每份权益 `Q=136654+d`，新余数 `r=(X+85)%100`。因此 X=15 raw 即可产生 1 raw 新权益；不会错误要求 X 至少为 100。X=0 或 d=0 的成功交易保存为 CONFIRMED，但正数权益测试 FAIL，并阻止转移与后续领取。

转移 #1 前必须有正数未领权益 d。转移回执只允许一条精确的 `TransferSingle`，不 harvest、不同步收益、不支付 BEM。转移后 creator/B 为 66/34 份，#1 的 `claimed` 保持 136654，`claimable` 保持 d；其余 ID 不变。固定回执区块上模拟原 creator `claim(1)` 必须解码出真实 `NotHolder`；网络错误、普通错误文本或其他 revert 不算通过。

B 最后只调用 `claim(1)`，不领取自己的另外 33 份，也不再次 harvest。回执必须收到 0 新 BEM、只为 #1 产生一条 `RewardClaimed(amount=d)`，并恰好支付 `Transfer(Vault → B, d)`。仅 #1 的 `claimed` 变为 Q、`claimable` 变为 0；其余 99 份仍为 `claimed=136654`、`claimable=d`。`totalPaid=13665400+d`，Vault 保留 `99*d+r` raw。金额同时记录 raw 和 8 位小数 BEM，不用任意钱包余额差代替交易实际到账。

所有步骤核查固定 clone、矿机仍在 Vault、完整 100 份 holder/supply/batch 余额/claimed/claimable、B 为普通 EOA，以及全部旧源码、ABI、会话和当前工具 hash。历史前置只重核至少 15 确认的 canonical 回执与事件，不读取旧区块 storage；新交易先保存 canonical 回执，再验证对应区块的完整状态。历史 raw journal hash、逐笔 entry hash 和计划前缀绑定下一步；已确认记录保持不可变。

Mining pending、区块推进和无关钱包余额只是观测值。任何额外 BEM 转入、其他 harvest/领取、份额转移、报价或 nonce 变化都会使计划停止，不改用新账点。共享全局锁；预留与 journal 先落盘，签名 hash 先落盘，再广播一次。未知结果只核对原 hash，不自动补发、换 nonce 或释放预算：

```sh
node --import tsx mainnet-entitlement-transfer/entitlement.mjs \
  --env ../.env --session mainnet-test/session.json \
  --step new-harvest --public-rpc-fallback --reconcile

node --import tsx --test --test-reporter=spec mainnet-entitlement-transfer/entitlement.test.mjs
```
