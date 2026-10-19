# 三笔固定账点 BEM 收益测试

**三笔已主网确认，同批67/33分配PASS（2026-10-20）**：harvest入账0.13665485 BEM，creator/B分别实收0.09155818/0.04509582 BEM，Vault余数0.00000085 BEM。完整[报告](./BEM_REWARDS_TEST_REPORT.md)、[验证摘要](./validation.json)、[最终对账](./audit/final-reconciliation.json)已保存。以下发送说明保留为历史操作记录；既有步骤只核对已记录hash，不再次发送。

本目录只支持本轮已成交 Vault 的三个独立步骤，不自动串行发送。旧合约、会话、订单、ABI 与所有原发送器保持不变。

| 步骤 | 调用方 | 固定调用 | nonce | BNB value |
| --- | --- | --- | ---: | ---: |
| `harvest` | creator `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` | `harvest()` | 11 | 0 |
| `creator-claim` | creator | `claimBatch([1,…,67])` | 12 | 0 |
| `buyer-b-claim` | B `0x63979C9d5200A5080be93eb440D469d2F2ec6682` | `claimBatch([68,…,100])` | 5 | 0 |

固定目标：`0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A`。源码/默认只读计划和离线测试不代表任何收益交易已经上链；实际结果见该目录 journal 和主线程报告。

## 每一步的操作

在 `groupbuy-v1` 中，为下一步生成只读计划：

```sh
node --import tsx mainnet-rewards/rewards.mjs \
  --env ../.env --session mainnet-test/session.json \
  --step harvest --public-rpc-fallback
```

后两步分别将 `--step` 改为 `creator-claim`、`buyer-b-claim`。只有上一步已 CONFIRMED 且正数分配测试 PASS 才可继续。默认仅使用 `.env` 中 BSC_RPC_URL 检查配置，生成计划，不读取私钥、签名或发交易。

`--public-rpc-fallback` 显式固定主 RPC 为 `https://bsc-dataseed.defibit.io`，独立节点为 `https://bsc-dataseed.bnbchain.org`；没有自动故障切换。只读 RPC 使用方法白名单、全局并发上限 8、重试次数 0。私有 `.env` RPC 值不会写入输出，并在确认后及发送前重新确认未变化。

用户批准该笔正式计划与最大 gas 费用后，使用该笔输出的 plan hash 和费用填入模板，仍要在 TTY 输入脚本打印的完整 SEND 行：

```sh
MODE=live ALLOW_LIVE_SEND=true LIVE_RELEASE_VERIFIED=true \
node --import tsx mainnet-rewards/rewards.mjs \
  --env ../.env --session mainnet-test/session.json \
  --step harvest --public-rpc-fallback --broadcast \
  --reviewed-plan-hash '<该笔已审阅计划 hash>' \
  --max-tx-fee-bnb '<该笔批准的最大 gas 费用>' \
  --max-total-spend-bnb 0.3045
```

本目录不会提高累计 `0.3045 BNB` 上限。原 `.303 BNB` 本金与全部历史 gas 预留仍保留，本三步只追加各自最大 gas，不抵扣任何预期收益或手续费收款。单笔确认不可替代后续两笔确认。creator 两笔仅在完成确认与复核、预算预留写盘之后读取 `CREATOR_PRIVATE_KEY`；B 最后一笔读取 `HOLDER_B_PRIVATE_KEY`，均核对派生地址且不输出或保存密钥/原始签名交易。

## 固定账点与收款证据

每次预检验证原五笔交易的 canonical 15 确认回执与精确事件、所有旧工具及 core/bootstrap/manifest/ABI 哈希、固定 clone 和协议 runtime。旧交易前置仅重新核对回执/事件，不要求已可能被裁剪的旧区块 storage。当前完整状态另在一个固定最新区块读取。

所有步骤都要求 ACTIVE、100 个 ID 按 creator67/B33 持有，每 ID supply=1、钱包 batch 余额正确、矿机在 Vault。读取全部100个 `claimed`/`claimable`、BEM decimals=8、Vault/creator/A/B BEM 余额及 Mining key/pending。

首次 harvest 要求 Vault BEM、totalAccounted、totalPaid、accPerShare、remainder、全部 claimed 和 claimable 都为 0。回执必须包含两个按顺序出现的 `RewardsSynced` 和一个 `Harvested`，没有任何持有人领取或份额转移。第一个 Sync 全0；第二个 Sync 与 Harvested.received、实际 BEM mint（`Transfer(0x0 → Vault)`）金额一致。该 mint 形状已由本工程真实 BSC 状态 fork 回执确认；Mining 自身事件仍保留在原始回执中。

令实际收到 raw 为 H，q=H/100 整数向下取整、r=H%100。harvest 后必须为：Vault BEM=H、totalAccounted=H、totalPaid=0、acc=q、remainder=r、每个ID claimed=0、claimable=q。H=0 或 H<100 时，成功链上交易仍保存为 CONFIRMED，但 `positiveTest=FAIL`，停止后续认购者领取步骤，不把成功交易误报为正数收益测试成功。

此 H/q/r 连同已确认 harvest 记录的 entryHash 被后续计划冻结；原回执再次校验并重建相同账点。creator 领取前全部 claimed=0；B 领取前 IDs1..67 claimed=q，其余0。任何第三方 harvest、额外 BEM 转入、份额变化或其他领取使账点变化，脚本都会停止，不自动采用新基线。

每笔 claim 恰好一个 `RewardsSynced(received=0)`，H/q/r不变，分别67/33个 `RewardClaimed`，逐个ID金额为q，且只有一笔 BEM `Transfer(Vault → 对应钱包)`：creator=67q，B=33q。没有 Harvested、矿机或份额转移。creator 后 totalPaid=67q、Vault BEM=33q+r；B 后 totalPaid=100q、Vault BEM=r，全部ID claimed=q、claimable=0。所有金额同时保存 raw 和 decimals=8 的 BEM 表示。

Mining pending、当前区块和无关钱包 BEM 余额是观测值，允许在预览之间变化；它们不作为预计到账或同账点比较依据。claimBatch 不调用 Mining。实际支付以该笔 BEM Transfer、逐ID RewardClaimed 和合约账本为依据，不从钱包任意两次余额相减推断。

## 中断恢复与验证

共享全局 lock 与累计预算。先持久化 reservation/journal，再签名，签名 hash 先保存，最后调用一次 `sendRawTransaction`。确认后及签名后均复核冻结输入、账点、模拟、报价，发送最后再核 chain56 与 latest/pending nonce。不会自动重试广播、换 nonce、调整 gas 或释放预留。

已记录 hash 的步骤只允许核对。已经 CONFIRMED 的记录保持不可变，重新核对不会重写其 entryHash；生成下步计划时也会逐层检查原历史计划所冻结的前置记录：

```sh
node --import tsx mainnet-rewards/rewards.mjs \
  --env ../.env --session mainnet-test/session.json \
  --step harvest --public-rpc-fallback --reconcile
```

15 确认后先保存同一份 canonical receipt，再验证业务事件和该回执区块末状态。业务检查失败时保留回执及原 hash，不重新发交易。生成文件位于 `mainnet-rewards/plans/` 和 `mainnet-rewards/transactions/`。

离线测试仅使用公开冻结文件、独立ABI编码的合成回执和 mock，不读取真实 `.env`/journal/budget、调用RPC或签名：

```sh
node --import tsx --test mainnet-rewards/rewards.test.mjs
```

本目录不执行份额转移、赎回、治理、再次购机或部署。后续权益转移测试需另行准备与逐笔确认。
