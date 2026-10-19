# 给市场窗口的 GroupBuy V1 交接

本仓库是阶段一候选实现。真实 BSC 固定区块 `128554249` 的本地 fork 已通过 Seaport 1.6 已部署字节码上的订单生命周期；订单仅在 fork 内创建、validate，签名为 `0x`。详见 [实际 fork 报告](reports/real-bsc-fork-tests.json) 与 [协议身份核验](docs/REAL_PROTOCOL_IDENTITY_REVIEW.md)。**既有公开市场订单、主网部署/交易及市场 UI 联调仍为 NOT_RUN**；Mining/BEM 全语义仍为 Unknown。本地 Mock、Seaport 源码本地测试和真实状态 fork 分别记录，不能把结构校验当作成交成功。本窗口未读取市场仓库、数据库或凭证，未调用真实挂单、撤单、签名、主网广播或其他市场写接口。

## 交接文件与稳定标识

- `schemas/order-envelope-v1.schema.json`：OrderEnvelope v1 严格 JSON Schema，未知字段不接受。
- `sdk/order-envelope.ts`：额外语义校验、完整订单 hash、域、履约 payload commitment、ID 成本整数规则；仅 JSON Schema 通过仍不足以执行。
- `sdk/order-source.ts`：当前项目范围内的 JSON 导入，以及用户明确配置的 localhost 只读 API。
- `sdk/contracts.ts`：与当前 `src/Types.sol` 一致的 Config/Terms 编码和 hash。
- `exports/`：编译导出的真实 ABI 与部署接口，不要手写猜测 ABI。
- `fixtures/seaport-order.example.json`、`fixtures/official-order.example.json`：两份无秘密的**合成结构样本**，地址和零号验证区块不代表真实挂单；签名为空、身份 unknown，因此不能交易。

可信定位使用 chainId、market、collection、tokenId、orderHash/listingId、factory、vault、template/codehash、configHash、termsHash，不以卡片名称识别资产。每个 ID 为 1%，固定 ID 1～100 各最多一枚。

## 字段契约

所有 wei、tokenId、listingId、counter、区块号与时间戳均为十进制字符串；禁止 JSON 浮点金额。地址必须为完整 20 字节地址，hash 为 32 字节。报价币种只允许原生 BNB，拒绝 ERC20/WBNB。

| 字段 | 要求 |
| --- | --- |
| `schemaVersion` | 字符串 `1` |
| `source` | `kind` 为 json/http；`name` 为不含 URL/凭证的来源标签；可选 commit/configVersion |
| `sourceChainId` | 56；fork 的签名域仍为 56 |
| `market/collection/tokenId/seller` | 完整身份，必须与签署订单/挂牌记录一致 |
| `buyerPaysWei` | 全部 consideration 之和，含既有市场费、不含执行 gas；至少 100 wei |
| `fees` | 顺序固定：seller、market，逐项 recipient 和 amountWei；不可只给净价 |
| `nativeStartTime/nativeEndTime` | Seaport 必须等于签署参数；官方暂无核验的原生到期字段，二者为 null |
| `quoteExpiresAt` | 独立后端报价 TTL 或 null；不可将 TTL 当作挂牌撤销/到期事实 |
| `validation` | 固定 blockNumber/hash 和 verified/unknown；未知不得填零假装已核验 |
| `identity` | market/collection codehash；代理实现、implementation codehash、证据机制与是否链上强制；未知使用 null 和 unknown |
| `exportedAt` | ISO UTC 时间 |

Seaport 还必须提供：完整 `parameters`、完整 `components`、counter、signature、orderHash、实际 EIP-712 域 name/version/chainId/verifyingContract/domainSeparator。Parameters 有 `totalOriginalConsiderationItems`，Components 有签署时 counter，其余字段必须一致。域和签名不得用新 counter 或其他链/地址重新拼接。

当前允许的 Seaport 子集为 FULL_OPEN、单个指定非 criteria ERC721、amount=1、zone/zoneHash/conduitKey 全零，两项固定原生币 consideration：卖家价款与该价款向下取整的 1% 市场费。两項完整列表及签名都进入 `executionHash=keccak256(abi.encode(Types.Order))`，禁止后加 tip 或任意 to/data/value。若市场实际费用或参数不同，返回 UnsupportedOrder，先共同评审，不放宽检查以求通过。

未预验证订单支持普通EOA 65字节或64字节EIP-2098签名及ERC1271；也接受Seaport已validate的绑定订单。当前未实现bulk-order签名包装，不能假装兼容；未经预验证的bulk签名应返回不支持。

官方样本提供 listingId、listingView 的 seller/collection/tokenId/price/feeBps/valid，以及 listingFor 的 listingId/seller/price/valid 交叉快照。当前正式 `CIRCUIT_RESERVED` 适配明确禁用：尚未核验现行真实实现和准确 ABI，不能将 Mock CircuitMarket 的成功当作官方兼容证据。已导入官方 JSON 可用于交换字段与定位缺项，但创建/购买仍拒绝。

本地教学另有 `fixtures/mock-pool.example.json`，它不是OrderEnvelope，不可输入真实订单接口。`create-pool --mock-terms`只在MODE=mock、loopback Anvil、Config.marketKind=2/mockOnly=true且chainId一致时可用，payload固定0x；在fork/live一律拒绝。

## 市场窗口需确认或新增的只读导出

本仓库**没有认定现有市场 API 已有这些能力**。建议而非既有路径：

| 建议接口 | 允许动作 | 返回 |
| --- | --- | --- |
| GET `/groupbuy/order` | 读指定公开订单 | 完整 Envelope，包括公开签名 payload |
| POST `/groupbuy/quote` | 只读报价/检查，不签名、不持久化、不广播 | 同一 Envelope 与已核验字段 |

GET 可由市场端事先选择具体测试样本；当前 SDK 只允许明确 path，不自动附带任意查询。POST 请求字段只允许 orderHash/listingId/collection/tokenId/buyer。配置中的 allowlist 必须逐项写明 method/path/operation，POST 仅代表明确批准的读操作，不授权任何写 API；redirect、远程域名、认证 URL、未知请求字段拒绝。未配置 API 时不扫描端口。

市场窗口应在自己的目录读取自己的 DB，然后人工导出 JSON，或实现本地只读服务。不要传 PostgreSQL 地址/密码，不需要浏览器直接连数据库。列表卡片的 hash+价格不足以履约；缺签名、counter、original consideration 数量或域时应显示精确缺项。

## 买方与联合模拟

真正向市场调用并接收 NFT 的是 **Vault**，不是 creator、最后一个参与者、Factory 或外部 Adapter。订单不得把买方锁为最后出资钱包。旧 buy-quote 如果要求当前 Vault 已有全部余额，可能在最后参与者尚未出资时拒绝；需另外验证 `contribute(ids,true,payload) → purchase → ownerOf(Vault)` 完整路径，把最后一笔 msg.value 纳入模拟，不能拿钱包直接 buy 的成功代替。

满额参与、铸造和购买必须同笔原子成功；如果卖单被别人抢先成交，最后一笔整体回滚，先前出资者仍可直接退出。`requireCompletion=true` 表示用户只接受本笔完成拼单；有人先退出导致不满额时必须整体回滚。

固定总付款 P 的 ID 成本：`P/100`，前 `P%100` 个 ID 额外 1 wei；成本最多相差 1 wei，收益权仍相同。未来 gas 不计入目标付款，不承诺初始 BEM 或收益率。

## 可复制命令

```bash
npm ci
npm run build
npm run typecheck
npm run test:sdk
npm run cli -- import-order --order fixtures/seaport-order.example.json
npm run cli -- import-order --order fixtures/official-order.example.json
```

两条 import 只证明结构可读，输出 `IMPORTED_STRUCTURE_ONLY`。真实样本放在当前仓库 `fixtures/` 后运行：

```bash
npm run cli -- import-order --order fixtures/market-export.json --out fixtures/frozen-order.json
```

输出路径不会覆盖现有文件。完整签名公开卖单的数据可能允许其他人先成交，因此仅导出已同意公开的订单；不要为联调自动挂低价真实矿机。

只读 HTTP 的显式配置示例（接口需市场窗口自行实现）：

```bash
export MARKET_API_BASE_URL=http://127.0.0.1:3100
export MARKET_API_READ_ALLOWLIST='[{"path":"/groupbuy/order","method":"GET","operation":"read-order"}]'
npm run cli -- import-order --http-path /groupbuy/order --out fixtures/frozen-api-order.json
```

执行 `protocol-check` 前先按 `FORK_TEST_RUNBOOK.md` 启动并核验本地 fork。JSON 的 verified 标记不是信任替代物；SDK 重新核对 market/collection codehash、Seaport information、counter/status、签名或 validate、ownerOf 及 `getApproved`/`isApprovedForAll`。完整参与交易仍需 simulateContract。API 删除、无响应、授权丢失不自动等于永久取消。

## 两窗口验收

1. 双方保留同一个 JSON 文件 hash 与 schemaVersion，逐项核对金额、签名域和买方语义。
2. Seaport 和官方分别提供完整样本。官方实现未知保持 blocked，不共用另一个市场的结论。
3. 本仓库已通过 fork-created 无签名订单的本地 Factory proxy→clone 生命周期；市场窗口仍需以导出的既有订单在固定区块 fork 中验收创建、45/55 参与、退出、ID 复用、满额失败/成功、领取、带权益转手及赎回，不能沿用不同订单的结果。
4. 取消、改价、授权撤销等变体仅在隔离测试链或本地 fork 上执行；不得修改生产数据库制造链上事实。
5. 本地 fork 虽为 chainId 56，RPC仍是 localhost Anvil；这些事件禁止进入生产索引。
6. 回执、区块快照、实际 BEM Transfer、余额原始整数分别保留。SDK 的只读模拟、已提交回执和 UI 验证使用不同状态，不混记 PASS。

参考定义：[Seaport 模型](https://docs.opensea.io/docs/seaport-models)、[Seaport 接口](https://docs.opensea.io/docs/seaport-interface)。接口支持范围以本仓库固定 Types 与测试为准。
