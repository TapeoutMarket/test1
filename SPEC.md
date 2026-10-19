# TapeOut 拼单 V1 业务规格与实际实现

本文件描述本仓库阶段一候选实现，不是主网上线记录或审计结论。真实运行结果、代码体积及工具状态以 `CONTRACT_REPORT.md`、`CONTRACT_REPORT.json` 和 `reports/` 原始证据为准。旧两份额实验不能证明本版本的 100 份额、募资与治理路径正确。

## 1. 合约与可信标识

一个 `GroupBuyVault` 托管一台指定 ERC-721 矿机，并实现 ERC-1155 的 ID 1～100。每个 ID 的有效供应量最多为 1；每个有效 ID 对买成之后分配的新入账 BEM 拥有 1% 权益。没有预铸给创建者的份额，没有增发、公众 burn 或资产管理 owner。

Factory 使用 ERC1967Proxy + UUPS。Vault 使用标准 45 字节 ERC-1167 clone，固定指向普通 `GroupBuyVault` 逻辑地址。模板构造器锁定自身 initializer，并创建不可替换、无状态的 `MarketValidator`。该 validator 的地址固化在模板代码 immutable 中；clone 通过 `STATICCALL` 读取它，不使用可变 registry 或额外 delegatecall。购买和 Mining 的真实外部调用始终由 Vault 发起。

每个 Vault 固定保存 Factory、creator、网络、模板版本、市场类型/地址、collection、tokenId、Mining、BEM、协议代码身份快照、订单条款、deadline 和元数据。`configHash = keccak256(abi.encode(Config))`，`termsHash = keccak256(abi.encode(Terms))`。完整配置与条款定义见 `src/Types.sol`，订单 payload 可通过 `purchasePayload()` 及创建/初始化事件取得。

显示名称和 URI 不是可信资产标识。集成必须同时展示 chainId、collection、tokenId、Vault、Factory、模板地址/版本及条款 hash。本版名称为创建时固定字符串，长度上限 64 字节，metadata URI 上限 2048 字节，payload 上限 16384 字节；没有事后修改入口。

## 2. 状态机

| 状态 | 允许的主要动作 | 转换条件 |
| --- | --- | --- |
| FUNDING = 0 | 为自己参与、本人退出、固定 Factory 终止、公开确认失效 | 满额同笔进入购买；或不可逆变为 REFUNDABLE |
| PURCHASING = 1 | 当前交易内部购买与限定 NFT 收货回调 | 购买与后置检查成功进入 ACTIVE；失败整笔回滚 |
| ACTIVE = 2 | 转移份额、同步/领取 BEM、100% 持有人赎回 | 只能进入 REDEEMED |
| REFUNDABLE = 3 | 原持有人按原 ID 本金自行退款 | 不复活，不接受新参与或重铸 |
| REDEEMED = 4 | 固定赎回受益人领取残余 BEM | 不复活，不再调用 Mining |

交易成功结束时不会留下“FUNDING 已售 100 份但尚未购买”的状态。达到 100 份的最后一次 `contribute` 同时执行购买；市场调用、BEM 初次同步或资产后置校验失败时，最后一次出资、铸造和所有购买效果一并回滚，此前其他人的本金账本保持不变。

deadline 在初始化后不能延长。全部人退出、ID 再次出售和资金归零都不重置 deadline。到期后停止参与与购买，任何人可调用 `markRefundable()` 终止；即使市场、Mining、Factory 或 API 故障，原参与者仍可以直接 `withdraw` 自己的本金，无须等待别人确认失效。

未到期时，`markRefundable()` 仅接受绑定订单的明确永久状态：CANCELLED、COUNTER_CHANGED、FILLED、EXPIRED、LISTING_ENDED、PRICE_CHANGED。UNKNOWN、授权丢失、尚未开始、仅所有权变化不会被粗略转换为永久取消。状态查询异常映射为 UNKNOWN，阻止当前参与/购买；不伪装为已撤销或零收益。

## 3. 出资、取整与退出

固定目标总付款为 P，包含绑定订单所有既有市场收款，不包含执行者 gas，不另加拼单协议费。要求 P ≥ 100 wei。令 `base = P / 100`，`r = P % 100`：

- ID 1～r 成本为 `base + 1` wei；其余 ID 成本为 `base` wei。
- 100 个 ID 成本之和严格等于 P；每份成本都为正，收益权仍完全相等。
- `contribute(ids, requireCompletion, payload)` 要求 ID 非空、最多 100 个、范围合法、无重复、当前空闲，且 `msg.value` 精确等于这些 ID 的固定成本之和。
- 参与者就是 `msg.sender`，没有代付或赠送接口。Factory 创建池不接受/转发参与本金，创建与首次参与是两笔独立操作。

FUNDING 份额不可转移。持有人可在 FUNDING 或 REFUNDABLE 调用 `withdraw(ids, recipient)`，销毁本人 ID 并退回对应精确本金。recipient 必须由本人指定，不能为零地址或 Vault；operator、creator、guardian 和 Factory 不能替持有人指定退款地址。BNB 支付失败使整笔退出回滚，ID、余额和退款记录一起恢复，不影响其他人独立退出。

FUNDING 退出后的 ID 可按原成本再次购买；终止后的 REFUNDABLE 只能退款，不能重新购买。ACTIVE 不允许退本金、重新铸造或增发。发起者退出不关闭池；所有人都退出后，原条款仍有效且未到期时，池继续可用。

`requireCompletion=true` 表示本次必须筹满并成功购买。若其他人先退出，使提交的 ID 不再凑足 100，则本次整体回滚。普通参与模式按执行时空闲 ID 和有效份数判断，不承诺提交时看到的状态一直保持。

本金账本分别记录 `totalPrincipalIn`、`totalPrincipalRefunded`、`fundedWei` 和 `purchaseSpent`，满足：

`历史有效入金 = 已退出/退款本金 + 已购买支出 + 尚未使用本金`。

直接或强制转入的额外 BNB 不计入这组本金变量，不铸份额、不补满、不按当前 `address.balance` 触发购买。

## 4. Factory 创建、版本与紧急终止

`createPool(expectedTemplate, expectedConfigHash, terms, payload, round)` 要求与 Factory 当前选定配置一致。正常治理切换模板或配置后，排队中的旧请求回滚，不被静默换成新条款。

CREATE2 salt 为：

`keccak256(abi.encode(chainId, creator, template, configHash, termsHash, keccak256(payload), round))`。

预测地址同时绑定调用者、模板、完整配置/条款、payload 与轮次。另一地址相同输入不会占用用户预测地址；相同调用者使用新 round 可创建新一轮。无永久 NFT 全局占位。重复使用同一已存在地址返回 `PoolAlreadyExists`。创建 clone 与 initialize 是同一笔交易；初始化失败不会留下未初始化 clone、登记记录或消耗该 salt。

Factory 的 guardian 只能暂停新池创建，或对已登记池调用 `factoryCancelFunding(reasonCode)`。该入口只由初始化时固定的 Factory 调用，只允许 FUNDING → REFUNDABLE，不转出资金，不改本金、领取记录、订单、价格、期限或受益人。它没有金额、recipient 或任意 calldata 参数。批量取消最多 32 个；分页查询最多 100 个。

只有 upgradeAdmin 经真实 Timelock 能升级 Factory、批准/选择新模板配置、恢复新池创建。旧池的退款、领取、份额转移及赎回不查询 Factory 当前配置或暂停状态。恶意 Factory 新实现仍可滥用预设取消权限中止旧 FUNDING 池，但不能据此提取本金或控制 ACTIVE 矿机。

## 5. 市场执行子集

Seaport 仅接受一个指定非 criteria ERC-721，数量 1，FULL_OPEN，zone/zoneHash/conduitKey 全为零，两项固定原生币 consideration。第一项付给 seller；第二项为第一项金额整数除以 100 的市场费。两项金额之和必须等于锁定 P，`feeBps=100`，`totalOriginalConsiderationItems=2`，不接受新增 tip。

Vault 固定完整执行 payload 的 hash，严格检查规范 ABI 编码、OrderComponents hash、counter、开始/结束时间、签名或 Seaport 已验证订单、实际 EIP-712 域与版本、seller、NFT、金额和收款人。deadline 不超过订单 endTime 减 safetyMargin。counter 增长、单笔取消、完全成交、到期、所有权和零 conduit 所需授权分别检查；初始 `filled=0,size=0` 不等于已成交。

本阶段官方真实 CircuitMarket 配置使用 `CIRCUIT_RESERVED`，Factory 和校验器都拒绝启用。`MOCK_CIRCUIT` 仅是独立本地模型，且必须 `mockOnly=true`；其 listingView/listingFor/buy 接口和行为不能当作真实官方市场已验证 ABI。未知真实实现、费用或 `valid=false` 语义不得通过降低校验来启用。详见 `PROTOCOL_COMPATIBILITY.md`。

付款由 Vault 向固定市场发起，value 精确为 P。正常 `transferFrom` 交付可通过最终 ownerOf 验证；`safeTransferFrom` 回调额外要求 PURCHASING、固定 collection/tokenId 及固定 seller。购买结束后必须确认矿机归 Vault，返回 true 或收货回调本身不代表购买成功。

## 6. 按 ID 的 BEM 账本与一笔批量领取

账本分母始终为 100。对普通、非 rebasing、非扣税 BEM：

`newReceived = balanceOf(Vault) + totalPaid - totalAccounted`。

同步将 `newReceived + remainder` 按 100 分配到累计 `accPerShare`，余数保留到下次。若余额减少使表达式为负则回滚，不篡改历史。`claimed[id]` 独立记录该 ID 已领取的累计每份额度，转移 ID 不重置它；当前持有人继承未领取部分。

`claimBatch(ids)` 最多接收 100 个 ID，逐一验证当前实际持有人、范围和去重，先更新账本，再合并一次 BEM 付款。A 持有 45 个、B 持有 55 个时，各自可以一笔领取自己的全部 ID。金额是各 ID 的 `accPerShare - claimed[id]` 之和，不能用当前 Vault 余额乘以持仓比例；历史领取不同的 ID 可能有不同未领额度。付款同时核对 Vault 余额减少和接收人余额增加恰等于应付金额。

`claim`/`claimBatch` 只依赖已到账 BEM，不依赖 Mining。`harvest` 可由任何人触发，但只把固定矿机收益收进 Vault；触发者不会自动收款。`harvestAndClaim(ids)` 先收取，再领取本人指定 ID。harvest 先同步直接转入的 BEM，再从实际 Mining 到账计算 Harvested 事件增量，避免把旧捐赠误记为本次 Mining 收入。

Mining 接口为 `minerKey(collection, tokenId)`、`pending(key)`、`claim(key)`。`pending(key)` 只作为观察值，不能用 `pending=0` 判定没有可结算收益：固定区块 fork 的 [直接领取诊断](reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) 已观察到 pending 为 0 时，调用 claim 仍实收正数 BEM。因此 harvest 必须调用固定 Mining 的 `claim(key)`，再以实际到账余额记账；Mining 的任何真实错误直接回滚，不 catch 成功返回 0。若实际 claim 成功但无新增入账，记账增量才为 0。该诊断不等于 Mining 完整计息源码审计。初始 BEM=0 合法，不承诺附带收益。

## 7. 两条赎回路径

正常 `redeemMiner()` 必须由实际拥有全部 1～100 ID 的单一地址调用。它最后 harvest/sync，结清各 ID 未领收益及余数，记录 `redeemedBeneficiary`，销毁所有 ID，将 NFT 交给该地址，并结束为 REDEEMED。关键步骤失败全部回滚，不出现份额销毁却未交付矿机的成功状态。

`redeemWithoutHarvest()` 同样只允许实际 100% 持有人。它不调用 Mining，也不读取/转账 BEM，仅关闭、销毁份额、记录固定受益人并交付矿机。已经在 Vault 中的 BEM 不被伪造为已支付；历史累计数据和 ID 领取历史保留。

代币恢复后，只有固定 `redeemedBeneficiary` 可 `claimResidual(recipient)`，领取尚存及后到的 BEM。该入口没有重新调用 Mining。故障赎回后的各 ID 已销毁，`claimable(id)` 为 0 不表示残余 BEM 被支付或丢失；应展示固定受益人和残余领取入口。未进入 Vault 的 Mining pending 随已交付 NFT 按外部协议处理。

operator 授权不赋予直接领取、退出或赎回资格；但 ERC-1155 operator 在 ACTIVE 中有合法转移权限，能先把获授权的份额转给自己或别人，使新地址成为真实持有人。不要把“operator 不能直接赎回”误解为“授权 operator 不会失去份额及其收益权”。不足 100% 的持有人没有单独取回不可分割矿机的入口。

## 8. 意外资产与不可恢复边界

| 资产/状态 | 实际处理 |
| --- | --- |
| FUNDING 期间直接转入 BEM | 不立刻分配；买成后纳入全部 100 份的收益。失败/退款时不是承诺本金，不存在管理员提取入口，可能永久留存 |
| ACTIVE 直接 BEM 或第三方合法 Mining claim 到 Vault | 按实际余额同步，避免漏记或双记 |
| REDEEMED 后迟到 BEM | 仅固定赎回受益人可领取，不再给已烧毁份额建立新债权 |
| 直接/强制额外 BNB | 单列为异常余额，不计本金、不补满；本版没有通用回收入口，可能永久留存 |
| 购买前用 transferFrom 强塞目标 NFT | 新参与/购买因目标不再由绑定 seller 持有而拒绝；不能再付钱后把预先持有当作购买成功。已有参与者仍可退款，误送矿机可能永久留存 |
| 非目标 NFT、其他 ERC-20 或其他误送资产 | 不提供管理员救援、通用 execute 或迁移后门；不能保证恢复 |
| 底层 NFT 禁止转账/失败 | 两种赎回都会失败；Vault 不能绕过底层 NFT 规则 |

新池之间不强制唯一。同一订单可对应多个历史/竞争池；一池买成后，其他池的最后购买会重新检查并回滚，剩余参与者仍有独立本金退出路径。公开有效卖单可能被任何外部买家抢先成交，本版不承诺只有测试钱包或本池可购买。
