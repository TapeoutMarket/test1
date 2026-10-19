# B 最后 33 份认购与购机

**本笔已主网确认**：交易 `0x17509be1a415297b7ffbad6ad346625d6f67cb24aaffdd66ab4aae7e79f9f0a6`，区块 128579551，至少 15 个确认。矿机在 Vault、池 ACTIVE、creator/B 为 67/33，实际 gas 0.000101148 BNB。完整证据见 [validation.json](./validation.json) 和 [主报告](../mainnet-test/MAINNET_TEST_REPORT.md)。以下发送说明保留作历史操作记录；已有 journal 时仅核对原 hash，不能再次认购。

本目录是最后一笔 `buyer-b-complete` 的独立受保护脚本。它使用已部署 Factory、固定 Vault、已冻结订单与治理配置，不部署或修改任何合约。源码准备和离线测试不代表主网已执行；本笔已获得用户逐笔确认并执行。

固定动作：B `0x63979C9d5200A5080be93eb440D469d2F2ec6682`，nonce `4`，认购 IDs `68..100`，本金 `0.09999 BNB`，`requireCompletion=true`。目标 Vault `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A`。calldataHash `0xa882e97b7b1ef72a1f182255615ebb73147e4bd4bad9c629076a01fb5ce851ba`。

运行位置为 `groupbuy-v1`。默认只读计划只读取当前工作区 `.env` 中的 RPC；不会读取 B 私钥、签名或发送交易：

```sh
node --import tsx mainnet-completion/buyer-b-complete.mjs \
  --env ../.env --session mainnet-test/session.json --public-rpc-fallback
```

`--public-rpc-fallback` 是显式固定公共节点模式，主 RPC 为 `https://bsc-dataseed.defibit.io`，独立身份检查节点为 `https://bsc-dataseed.bnbchain.org`。没有自动切换或请求重试。只读请求全局并发上限为 8。当前 `.env` 中 RPC 的值仍会在确认后及发送前核对未变。

只读计划会生成 `mainnet-completion/plans/buyer-b-complete-<hash>.json`。用户批准该具体计划、单笔 gas 上限与累计支出上限之后，才能使用下列模板。计划 hash 和 gas 上限须从本次正式输出填写，不得复制旧报价：

```sh
MODE=live ALLOW_LIVE_SEND=true LIVE_RELEASE_VERIFIED=true \
node --import tsx mainnet-completion/buyer-b-complete.mjs \
  --env ../.env --session mainnet-test/session.json --public-rpc-fallback \
  --broadcast --reviewed-plan-hash '<本次计划 hash>' \
  --max-tx-fee-bnb '<本次批准的 gas 费用上限>' \
  --max-total-spend-bnb 0.3045
```

`0.3045 BNB` 已随本笔获得用户批准（两位本金 `0.303` 加全流程 gas 预算 `0.0015`）。历史预留不释放；本笔本金与最大 gas 全额追加计入全局预算，不抵扣 creator 的预期手续费收入。TTY 会要求粘贴包含发送方、目标、本金、IDs、完成标记、calldataHash、计划 hash、gas 上限和 RPC 模式的完整 `SEND` 行。只有在确认后的再次校验通过后，脚本才读取当前 `.env` 中的 `HOLDER_B_PRIVATE_KEY`，并验证派生地址是 B。

成功的这笔交易必须完成 100 份融资并购买矿机：Seaport 协议事件应精确记录 `0.3 BNB` 给 A、`0.003 BNB` 给 creator，矿机 #3204 转入 Vault。若其他交易先改变份额或订单状态，本笔可能 revert 并消耗 gas；已存入的 creator 本金不会由这笔失败交易自动退款。

发送前验证全部原源码/ABI/会话/订单/manifest 哈希、原四笔交易的 15 确认规范回执、creator 67 份的精确铸造事件，以及当前 100 个 ID：1..67 属于 creator、68..100 为空。当前池必须为 FUNDING、已售 67、本金与原生余额均为 `0.20301 BNB`、矿机仍归 A、订单有效且未成交。历史交易只复核回执与事件，不要求公共 RPC 仍保留旧区块 storage。

先持久化预算预留和 journal，再签名，签名哈希先落盘，最后只发送一次相同原始交易。所有 HTTP 交易发送重试关闭。任何已记录交易或未知结果都只允许核对，不能自动再次签名、替换 nonce 或释放预算：

```sh
node --import tsx mainnet-completion/buyer-b-complete.mjs \
  --env ../.env --session mainnet-test/session.json --public-rpc-fallback --reconcile
```

15 确认后，规范回执先写入 journal，再核对精确 33 份 `TransferBatch`、`Contributed(soldCount=100)`、`Purchased`、ERC-721 `Transfer` 和唯一 Seaport `OrderFulfilled`。该回执区块末状态必须为 ACTIVE、100 份按 67/33 分属 creator/B、全部 supply=1、本金累计与 purchaseSpent=`0.303 BNB`、fundedWei/原生余额=0、矿机实际 owner=Vault、订单完整成交。

支付证据分两层：成功回执及已验证 Seaport runtime 下的完整 consideration 事件匹配记录为 `protocolEventMatch: VERIFIED`；独立交易隔离余额或 trace 核对记录为 `independentBalanceOrTraceVerification: NOT_RUN`。不将任意前后余额差当作本笔到账额。购机可能同步既有 BEM，会允许 `RewardsSynced`，但本笔没有测试矿机 harvest 或持有人 claim，这项仍为 `NOT_RUN`。

离线测试：

```sh
node --import tsx --test mainnet-completion/*.test.mjs
```

离线测试只使用公开冻结输入、合成日志及 mock 客户端，不读取 `.env`、访问 RPC 或操作真实 lock/budget/journal。
