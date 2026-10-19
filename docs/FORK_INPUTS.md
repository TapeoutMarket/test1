# 两台 Mac 的真实状态 fork：准备与交接

本轮在另一台 macOS M4 上运行 BSC 固定区块的本地 Anvil 副本，当前测试电脑通过局域网网关和本机 loopback relay 使用它。只在这个副本内创建合约、出资和测试；不部署主网、不广播真实交易、不修改真实订单、市场或数据库。源 RPC 仅用于读取 BSC 状态。

“节点已连通”“订单只读检查通过”“完整 fork 测试通过”是三种不同结果。当前没有真实 RPC、订单和固定区块输入时，真实状态 fork 结果保持 **NOT_RUN**。

## 1. 需要准备什么

| 输入 | 谁准备、交给谁 | 最低要求 |
| --- | --- | --- |
| 同一份完整工程源码包 | 当前窗口交给远端 Mac | 两端使用同一版本；核对源码包 SHA-256。远端只启动服务，不必编译 Solidity。 |
| BSC 源 RPC | 用户仅在远端 Mac 的终端私密输入 | chainId 为 56，可读取指定历史区块的完整状态；含 API key 的 URL 不放聊天或报告。 |
| 固定区块 number/hash | 主测试窗口确认后两端共用 | 十进制区块号和完整 `0x` 加 64 位十六进制 hash，不能使用浮动 `latest`。 |
| 远端 Mac 的局域网 IPv4 | 用户或远端窗口确认 | 指定一张网卡的 RFC1918 地址，不能使用 `0.0.0.0`、公网地址或路由器公网映射。 |
| 当前测试电脑的局域网 IPv4 | 用户确认给远端窗口 | 用于网关允许列表；不允许整个网段或任意来源。两台电脑应能直接互通。 |
| 一份真实公开 Seaport 完整订单 JSON | 市场窗口只读导出，人工复制到本工程 | 必须是下述支持子集；hash 和价格截图不足以履约。 |
| NFT、Mining、BEM 协议地址及身份来源 | 市场/协议窗口提供到本工程 | NFT collection 与订单一致；Mining/BEM 的准确 ABI、源码或实现身份仍需在固定区块复核。 |

不需要真实钱包私钥、助记词、钱包导出文件、生产数据库连接或真实 BNB。本地测试账户由 Anvil 解锁，余额补充只发生在 fork 副本。没有现成合适订单时先完成节点联通和资料校验，不为联调自动新建低价真实挂单。

## 2. RPC 和固定区块

源 RPC 应支持 `eth_chainId`、`eth_getBlockByNumber`，以及在指定历史区块执行 `eth_call`、`eth_getCode`、`eth_getStorageAt`、`eth_getBalance`、`eth_getTransactionCount`。节点服务若只保留近期状态，可能能返回旧区块头却无法返回旧合约状态；这种情况不能算可用的历史状态 RPC，需要可读取所选区块状态的服务。

固定区块应满足：订单在该块已存在，NFT 仍由卖家持有，卖家授权有效，订单尚未撤销或成交，且该块时间在订单起止时间内。订单余下有效时间还要容纳本地部署、至少 60 秒 Timelock 延迟、募资和测试；推进本地时间后要再次检查订单。今日已过期的订单可以在合适的历史区块测试，但不能把它报告为今日主网上仍有效。

如果还没有选块，远端可以仅通过只读 RPC 查询候选的 finalized 区块；节点不支持该标签时可提出保守确认深度的候选。**候选 number/hash 必须经用户或主测试窗口明确确认后再启动固定 fork**，不得自动换块、浮动追踪最新状态或只改订单中的区块字段。

## 3. 一份真实订单需包含的准确字段

使用仓库现有的 [严格 Schema](../schemas/order-envelope-v1.schema.json) 与 [合成结构样本](../fixtures/seaport-order.example.json)。样本中的假地址、空签名、零区块和 unknown 不是可执行输入；由市场窗口根据真实记录导出并只读核验，不手工填零补齐。

| 字段 | 内容 |
| --- | --- |
| `schemaVersion` | 字符串 `"1"` |
| `source` | `kind`、不含 URL/凭证的 `name`；可选 `commit`、`configVersion` |
| `sourceChainId`、`protocol` | 数字 `56`、字符串 `"seaport"` |
| `market`、`collection`、`tokenId`、`seller` | 完整地址和十进制 tokenId，与原始签署订单一致 |
| `buyerPaysWei`、`currency` | 全部付款原始整数，包含既有市场费；`currency` 为 native / BNB / 零地址 |
| `fees` | 按 seller、market 顺序提供两项，每项有 `kind`、`recipient`、`amountWei` |
| `nativeStartTime`、`nativeEndTime` | 与签署参数的 `startTime`、`endTime` 一致 |
| `quoteExpiresAt` | 独立报价 TTL 或 null；它不是原生订单撤销/到期证据 |
| `validation` | `status`、同一固定块的 `blockNumber`、`blockHash`；未核验保持 unknown |
| `identity` | `status`、`marketCodeHash`、`collectionCodeHash`、`proxy`、`evidenceVersion` |
| `exportedAt`、`orderHash` | ISO UTC 导出时间、完整原始订单 hash |
| `seaport.parameters` | 完整 OrderParameters，含 `totalOriginalConsiderationItems` |
| `seaport.components` | 完整 OrderComponents，含原始签署 `counter`；其余字段与 parameters 一致 |
| `seaport.signature` | 原始公开签名；不得用当前 counter 重签或伪造签名。已由 Seaport validate 的订单需提供对应链上证据。 |
| `seaport.domain` | `name`、`version`、`chainId`、`verifyingContract`、`domainSeparator`，与真实市场及签署域一致 |

`identity.proxy` 若非 null，字段为 `address`、`implementation`、`implementationCodeHash`、`mechanism`、`onchainEnforced`。准确机制未知就保留 unknown；不能把代理自身 codehash 相同当作 implementation 未变的证明。完整验证要求在 fork 上重新查询，不信任 JSON 的 verified 字样本身。

所有金额、tokenId、counter、区块号和时间戳使用十进制字符串，不使用 JSON 浮点金额。地址完整 20 字节，hash 完整 32 字节。附加未知字段会被严格 Schema 拒绝。

当前支持子集：

- `orderType=0`（FULL_OPEN），一个指定的非 criteria ERC721，amount 为 1。
- 固定价格、原生 BNB，不支持 ERC20/WBNB。
- 两项且仅两项 consideration：卖家价款，以及卖家价款除以 100 向下取整的市场费。
- `zone`、`zoneHash`、`conduitKey` 为零，`totalOriginalConsiderationItems="2"`。
- 不追加小费、不改收款人、不改签名域。未经预验证的 bulk-order 签名包装暂不支持。

首轮只需 **一份现成有效订单**。同一固定 fork 可用 snapshot/revert 测正常赎回和不 harvest 赎回等独立分支；每个分支应保留独立证据，不能在已赎回的同一个状态上继续冒充新分支成功。官方 Circuit 订单可作为后续资料交接，当前 `CIRCUIT_RESERVED` 仍禁用，不以它启动购买测试。

## 4. Mining、BEM 与 Config

真实配置需有以下字段，结构以 `sdk/contracts.ts` 的 `protocolConfigSchema` 为准：

| 字段 | 真实 fork 设置或来源 |
| --- | --- |
| `chainId`、`templateVersion`、`marketKind` | `"56"`、`1`、`0` |
| `market`、`collection` | 与真实订单一致 |
| `mining`、`bem` | 经资料与固定区块核验的真实地址，不能复制 Mock 地址 |
| `marketCodeHash` | 固定区块市场地址 runtime bytecode 的 keccak256 |
| `seaportDomainSeparator` | 实际市场 `information()` 返回值，需与订单域一致 |
| `seaportVersionHash` | 实际 `information().version` UTF-8 字节的 keccak256 |
| `safetyMargin` | 明确选择的正整数秒数，用十进制字符串；不能超出订单剩余期限 |
| `mockOnly` | `false` |

Mining 当前候选接口为 `minerKey(address,uint256) -> bytes32`、`pending(bytes32) -> uint256`、`claim(bytes32)`。必须核实实际实现、调用权限、收款人是否为当前 NFT owner；矿机 key 从真实 getter 读取，不能自行猜测编码。BEM 需核实实际 decimals、转账语义和非扣税/非 rebase 性质；账本测试统一记录原始整数，精度仅用于展示。

如要验收“未领取权益随 NFT 转移”，至少有一个阶段必须通过真实 Mining 调用向 Vault 产生正数 BEM 入账，再观察转移与领取。`pending=0`、协议调用不可用或挖矿资格不足时，该项记录 **NOT_RUN/BLOCKED** 并给出原因；不能人工 mint BEM、覆盖真实合约 bytecode/storage 或使用 mockCall 伪造该路径。只有少量正数入账但每份累计不足一个最小单位时，也不足以验收正数份额领取。

## 5. 远端服务与本机连接

远端 Mac 只需要 Node.js >=20.19 和原生 arm64 Anvil v1.4.3；本轮不需要 Solidity 编译器或 Rosetta。使用 [远端 Codex prompt](MAC_M4_FORK_HOST_PROMPT.md) 启动，默认端口分工为：

| 端口 | 监听与用途 |
| --- | --- |
| 远端 `18545` | 指定 LAN 网卡上的网关，校验客户端 IP 和令牌 |
| 远端 `18546` | `127.0.0.1` 上的内部 Anvil，不直接开放给局域网 |
| 本机 `18547` | `127.0.0.1` 上的 relay，供现有 SDK/CLI 使用 |

远端启动接口为 `node scripts/fork-host.mjs --start`。主测试电脑使用 `node scripts/fork-connect.mjs --start`，显式配置 `FORK_GATEWAY_URL`、`FORK_GATEWAY_TOKEN`、`FORK_SESSION_ID`、`FORK_BLOCK_NUMBER`、`FORK_BLOCK_HASH`、`FORK_RELAY_PORT=18547`。令牌通过安全渠道保存到本机并私密读入进程环境，不粘贴聊天。

连接成功后，测试命令的 `EXECUTION_RPC_URL` 为 `http://127.0.0.1:18547`，`MODE=fork`，`FORK_EXECUTION_TOPOLOGY=lan-relay`，两个 chainId 配置均为 56。预检另需 `ORDER_FILE` 指向本工程内的真实订单 JSON。只有远端持有真实源 RPC；本机无须复制源 RPC 密钥。预检仍须同时核对 session、固定区块 number/hash、Anvil 身份和真实订单。

本机没有源 RPC 时，报告会明确使用远端 session 身份证明，记录 `directSourceReadByClient:false`；不能说成“本机独立核验了上游 RPC”。本机 relay 只是传输入口，执行位置是远端 LAN Anvil。局域网 HTTP 仅适用于已信任的测试网络，令牌不提供传输加密；不在公共 Wi-Fi 或公网开放。

## 6. 应回传到当前测试窗口的内容

回传以下公开资料即可：

1. 远端生成的 `deployments/fork/56/lan-session.json` 原文件，以及源码包 SHA-256。
2. 已确认的远端 LAN 网关 URL、允许的本机 LAN IP、固定区块 number/hash；与 session 文件一致。
3. 完整真实订单 JSON，放入本工程 `fixtures/`；保留文件原始内容和 SHA-256。
4. NFT/Mining/BEM 的地址、准确 ABI/源码来源、代理实现身份资料，放入本工程供复核。
5. 远端 Node/Anvil 版本、启动和身份检查结果；如果失败，只提供脱敏错误及缺项。

**不要回传聊天：网关 token、源 RPC 密钥、私钥、助记词、旧 `.env` 或生产数据库凭证。** token 文件 `.runtime/fork-host/token.txt` 权限应为 0600，仅通过用户认可的安全渠道在两台电脑之间传递，并在本机私密输入。session JSON 是公开身份信息，不能代替 token。

如果用户已安全复制 token 到本工程 `.runtime/fork-client/token.txt`，可在本机终端读入；这条命令不输出 token，随后不要执行 `echo`、`env` 或 `set` 将它打印出来：

```bash
export FORK_GATEWAY_TOKEN="$(cat .runtime/fork-client/token.txt)"
```

先验收连通与只读预检，再在明确的 fork session 内进行本地合约部署和测试。完整步骤见 [FORK_TEST_RUNBOOK.md](../FORK_TEST_RUNBOOK.md)。
