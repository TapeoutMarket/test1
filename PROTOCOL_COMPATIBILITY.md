# 协议兼容性与证据边界

本文件描述本仓库候选实现的实际约束。源码、编译成功、本地模拟资产测试、真实协议源码本地集成、真实链状态 fork、主网回执是不同证据。本轮已使用只读 BSC RPC，将区块 `128554249` 的真实状态 fork 到本地，并执行 Seaport 1.6 的 fork 内 validate 无签名订单生命周期；随后直接领取诊断发现 pending 零值不能阻止 claim，修复后的持续收益回归已通过，包含 pending=0 后再次 harvest 的正数实收。没有使用私钥签名或广播主网交易。既有公开市场订单、主网部署及 UI 联调仍未执行，不能把 fork 结果写成主网可用或已通过安全审计。

## 1. 分层状态

| 层次 | 本文件核验时状态 | 证据与边界 |
|---|---|---|
| Mock 资产与 MockCircuit | PASS（已执行的 VaultEdge 16 项） | `test/unit/VaultEdge.t.sol`，通过真实 Factory proxy → clone；其他单测的最终逐项结果见 `reports/CONTRACT_REPORT.json` |
| 锁定真实 Seaport 源码的本地集成 | PASS | RealSeaportTest 的 10 项真实源码履约及失效测试通过；最终干净重跑与源码快照见交付报告 |
| BSC 真实状态 fork 的已执行路径 | 修复后 PASS | 固定区块 128554249；已部署 Seaport 1.6 字节码；订单在 fork 内 validate、签名为 0x；已新增并通过 pending=0 后正数实收及账本增量检查，见 [实际 fork 报告](reports/real-bsc-fork-tests.json) 与 [结算诊断](reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) |
| 既有公开市场订单导入及 fork 履约 | NOT_RUN | 尚未用市场导出的既有完整订单执行，不能由 fork-created 订单替代 |
| BSC 实链部署及交易 | NOT_RUN | 本轮无广播授权，不发真实交易 |
| 现有市场 UI／数据库联调 | NOT_RUN | 本轮未读取或修改另一个项目、API 写接口或数据库 |

测试证据的最终版本以同一源码快照生成的 `CONTRACT_REPORT.json` 和 reports/ 内逐类原始输出为准。检查命令：`npm run test:integration`；它测试本地 artifact 与 Mock 资产，不读取 BSC。

## 2. 编译、部署身份与调用者

项目 Factory、Vault、MarketValidator 使用 Solidity 0.8.24、Paris、via-IR、optimizer 200 和 OpenZeppelin contracts / contracts-upgradeable 5.4.0。共享重入保护使用普通 storage，不依赖 transient storage。真实运行时字节数、编译器完整版本、源码 hash、ABI / codehash 以本次生成的 `RELEASE_MANIFEST.json` 和合约报告为准；没有提高 EIP-170 的代码大小限制。

Vault 是 ERC-1167 clone，指向一个普通的固定逻辑合约。模板初始化已锁定，Factory 在同一交易完成 clone 与 initialize。模板的 `implementationSelf()` 是构造器 immutable；Factory 同时核对模板标识、初始化锁、审批 codehash 和配置版本，拒绝把标准升级代理误当成固定模板。ERC-1167 的固定转发目标定义见 [ERC-1167](https://eips.ethereum.org/EIPS/eip-1167)。治理仍可批准恶意的新模板，所以这些检查不能替代未来模板的源码审查与独立 codehash 核对。

为符合真实代码大小限制，模板构造器一次创建无状态 `MarketValidator`，其地址固定在 immutable 中。Vault 对它只有只读 STATICCALL；验证器没有 owner、升级、资产接收或执行购买能力，不查 Factory 最新配置，也不使用动态 registry / delegatecall 选择实现。购买由 **Vault → 固定市场** 直接调用，Mining 同样由 **Vault → 固定 Mining** 调用。模板与其固定验证器都属于需要审计、验证和归档的执行代码；升级 Factory 不会更换旧 Vault 的验证器。

## 3. Seaport：明确的固定价子集

接受一个非 criteria ERC-721、数量 1、FULL_OPEN、zone / zoneHash / conduitKey 均为零的订单。只接受两项固定数量的原生币 consideration：第一项是卖家价款，第二项为向下取整的 1% 买家费用；两项收款人、金额和次序均进入 commitment。`totalOriginalConsiderationItems` 必须为 2。ERC-20、WBNB、拍卖变价、criteria、restricted、partial、非零 conduit、任意聚合 calldata 和额外 tips 均拒绝。

订单结构、counter 和 zero-conduit 时应检查 Seaport 本身授权的定义依据官方 [Seaport Models](https://docs.opensea.io/docs/seaport-models)。本项目额外施加的两项付款与 1% 规则来自本轮规格，并不是声称所有 Seaport 订单都具有该结构。

保存和核对的身份包括配置中的 chainId=56、市场地址 / codehash、实际 `information()` 返回的域和版本、seller、全部 OrderComponents 与签署 counter、orderHash、全部执行参数、完整签名 payload 的 `keccak256`。域另外按 Seaport 名称、实际版本、chainId 和 verifyingContract 重算；不是只信输入的域。订单 bytes 必须是规范的 `abi.encode(Types.Order)`，不接受尾随附加字段。

签名支持 EOA 65 字节、EIP-2098 64 字节、ERC-1271，或 Seaport 已认可的 validated 订单；不实现额外的 bulk-order 签名包装。未被链上预验证的 bulk 签名不属于本 V1 支持范围。`isValidated` 不代替取消、counter、期限、完全成交、所有权或授权检查。绑定条款/hash/domain 后，明确的取消、counter 变化和完全成交事实先于当前签名可用性分类，避免 ERC-1271 卖家后续撤销签名掩盖已经确认的取消；签名失效本身仍归 UNKNOWN，不能单独永久终止。

初始化固定的 deadline 必须早于等于订单 endTime 减 **正数** safetyMargin，并且晚于 startTime。未开始的订单可以创建空池，但不能接受出资。购买前再次核对固定订单；购买后同时要求 `ownerOf == Vault`、Seaport 返回成功、该 orderHash 的 size>0 且 filled==size、未取消。初始 0/0 不视为完全成交。

| 状态 | 新出资 / 购买 | 公共永久终止 |
|---|---|---|
| 单笔取消、counter 变化、size>0 且完全成交、到期 | 拒绝 | 可终止当前 FUNDING 池 |
| 尚未开始 | 拒绝 | 不因尚未开始而终止 |
| NFT 授权撤回 | 拒绝 | 视为可恢复，不自动结束 |
| NFT owner 不再为固定卖家 | 拒绝 | 单凭 owner 变化不判永久取消 |
| 调用失败、签名状态无法确认、读取异常 | 拒绝，显示 UNKNOWN | 不视为取消；仍可本人退出或到期退款 |

公开有效卖单和签名 payload 可能被第三方履约；没有“仅测试钱包能买”的保证。订单公开被其他人买走时，最后一次贡献及本次铸造整体回滚，之前参与者仍能自行撤回本金。

## 4. 本地真实 Seaport 的版本限制

已锁定 `seaport-core@1.5.0`、`seaport-types@0.0.1`（来源元数据指向官方 [seaport-core](https://github.com/ProjectOpenSea/seaport-core) 与 [seaport-types](https://github.com/ProjectOpenSea/seaport-types)），由 `scripts/build-seaport.mjs` 使用 `solc@0.8.17`、London、via-IR、optimizer 200 独立编译。`fixtures/seaport/BUILD.json` 包含实际编译器版本、每份输入源码 SHA-256、配置和运行时代码大小。`Seaport.json` / `ConduitController.json` 是上述真实源码的 artifact，不是总返回 true 的 MockSeaport。

编译器版本分离是为了复现这组真实协议源码的编译要求，不是将候选 Vault 降级到旧编译器。测试 VM 使用 chainId 56 来维持本地构造订单的域一致性；**chainId 56 的本地 VM 不代表 BSC 主网，也不代表真实链状态 fork**。

本地 1.5.0 artifact 测试与 BSC fork 是两套证据。在 BSC 固定区块 `128554249`，`0x0000000000000068F116a894984e2DB1123eB395` 的 `information()` 返回 1.6；Sourcify 验证记录中的已部署 runtime 与该区块 RPC 代码哈希一致，记录识别为非代理。该已部署字节码上的 fork 内 validate 无签名订单生命周期已通过，见 [身份核验](docs/REAL_PROTOCOL_IDENTITY_REVIEW.md) 和 [实际 fork 报告](reports/real-bsc-fork-tests.json)。此结果不覆盖更新版本、未来区块或既有公开市场订单；后续订单仍需核对 actual domain/version、market codehash、counter、授权和验证区块。

## 5. 官方 CircuitMarket：真实路径默认关闭

规格提供的代理 `0x6feEbbEbC07BcB90bd1Ac8b0CF9BaA4f0fF2B46f` 与历史实现 `0x725771c38361abEF7b844729B978c775F7A83dFb` 仅为历史线索。本轮未核验该代理当前实现、实际完整 ABI、费用结算、托管模式、收货地址或 getter / seal 语义。

因此 `MarketKind.CIRCUIT_RESERVED` 被 Factory 和购买逻辑拒绝，没有把未知版本伪装为兼容。`IMockCircuitMarket`、`MarketKind.MOCK_CIRCUIT` 明确只用于本地模型，并强制 `mockOnly=true`。本地模型的 `listingView` 中 active 是挂牌存续字段，不能机械等同真实 API 的 valid；模型中的 listingPrice 表示买方精确总付款。真实 ABI 未确认前不把这个定义复制到生产。

Mock 测试覆盖固定 listingId、卖家 / collection / tokenId、价格和 fee 快照、listingFor 交叉核对、授权撤回后恢复、改价、重挂、读取未知、购买回滚及错误 NFT 交付。原生 expiry 没有被编造；独立 deadline 始终存在。报价 `quoteExpiresAt` 只是链下 TTL，不决定合约永久取消。

未来真实适配必须核验代理本身的查询和购买，不向 implementation 买入。固定 proxy 地址 / codehash 不能证明 implementation 没变；Vault 不能用自己的 SLOAD 读别的合约 EIP-1967 槽。没有可靠链上 getter / seal 证据时，RPC 身份核验只能作为链下预检，不能消除同区块代理升级抢先等剩余风险。即使可查询 implementation，仍须复核 getter 与权限语义。现阶段该项是实链发布阻塞项。

## 6. NFT、Mining 与 BEM

本地 MockNFT 是标准 ERC-721 模型，购买既测试普通 transferFrom，也测试安全收货与 ownerOf 后置条件。另在真实 BSC 固定区块 fork 中已执行 TapeOut #3204 的购买与赎回；Collection 的 Beacon 与该区块实现已解析，详见 [身份核验](docs/REAL_PROTOCOL_IDENTITY_REVIEW.md)。这些具体路径不证明 NFT 的全部升级权限、特殊转移限制或挖矿资格规则。

Mining 接口是 `minerKey(address,uint256)`、`pending(bytes32)`、`claim(bytes32)`。Vault 从固定 Mining 读取 key，没有猜测生产 key 编码。真实固定区块已读取 key、pending、实现地址及 owner/isSealed/paused，实际 fork 中 Vault 调 Mining 并收到正数 BEM 的路径已执行。[独立结算诊断](reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) 进一步确认：A 直接调用 Mining 前 pending=0，仍收到 `37601` raw BEM。因此旧版“pending 为零就不 claim”的前提已被实际行为证伪。修正规则是每次 harvest 都调用固定 Mining.claim，再按实收记账；真实错误原样回滚，不把异常伪装成成功领取 0。修复后的 Vault 持续收益回归已通过；二次 harvest 前 pending=0，新增实收和 totalAccounted 增量均为 `37601` raw。Mining 的完整调用授权、收款规则、计息与升级权限语义仍为 UNKNOWN；不能由该反例断言 pending 的全部内部实现只是某个存储字段。

MockBEM 使用 8 位精度，真实 BEM 在固定区块也实读 `decimals() = 8`、`minter() = Mining`；合约账本始终按原始整数工作，没有把 8 或 18 写入收益计算。实际 fork 已核对执行路径中的 Vault 实收、钱包余额差和带正数权益的 ID 转移后领取。BEM 全路径是否非 rebasing、非扣税及不存在特权余额变更仍为 UNKNOWN。支付同时核对 Vault 余额减少量和收款人增加量；扣税、减少异常或转账故障使交易回滚。正向 rebase 无法仅靠余额对账可靠地区分普通入账，因此完整 token 语义仍需源码审计。

普通 claimBatch 只同步并领取实际进入 Vault 的 BEM，不要求 Mining 正常。harvest 先同步已有直接转入，再由 Vault 调 Mining、核对新增入账。累计每 ID 权益减该 ID 已领取额，而不是当前余额乘持仓比例。ERC-1155 标准提供批量转移 / 余额能力，项目的批量收益与赎回规则是独立业务逻辑，不能由标准本身推断。[ERC-1155](https://eips.ethereum.org/EIPS/eip-1155)

赎回全部 100 ID 后，迟到 BEM 仅固定 redeemedBeneficiary 可领取。redeemWithoutHarvest 不调用 Mining 或 BEM，只关闭、销毁份额并交付 NFT；未实际付款不会被记成已支付。它仍依赖底层 NFT 允许转账，不能绕过 NFT 自身故障。

## 7. 实际链验证的必需输入

本轮已取得只读 RPC、固定区块 `128554249` 及其 hash，并核验 Seaport / Collection / Mining / BEM 身份；已执行订单为 fork 内新建并 validate 的无签名订单。后续既有市场订单测试仍需市场导出的完整 OrderEnvelope、同一验证区块的身份和来源；官方 CircuitMarket 另需准确 ABI、proxy implementation 与治理证据。将资料放入当前仓库或显式只读 API 后，按 `FORK_TEST_RUNBOOK.md` 验证本地 loopback Anvil、实际 fork 信息、签名域和交易发往本地的隔离条件。

修复后已执行路径及金额见 [实际 fork 报告](reports/real-bsc-fork-tests.json)，pending 零门缺陷见 [结算诊断](reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json)；修复后的持续收益回归已通过，证据包含首次领取后再次 harvest 的新增实收。既有公开市场订单、主网及 UI 测试保持 NOT_RUN，Mining/BEM 全语义保持 UNKNOWN。不能修改真实协议 bytecode/storage 或用 mockCall 绕过签名、授权与收益逻辑来填补证据。
