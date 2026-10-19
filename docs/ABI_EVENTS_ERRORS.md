# 当前 ABI：事件与错误说明

本文件从 `exports/*.abi.json` 的实际编译ABI生成签名和字段。字段名/类型/索引标记以这些文件为准；不是独立审计，也不代表链上已部署地址使用同一代码。`npm run export` 后运行 `node --import tsx sdk/generate-abi-guide.ts` 可重建。

所有金额均为最小单位原始整数；读取实际BEM decimals，不写死18。区分交易回执事件与区块末状态，同块后续交易可能已改变后者。解码错误时保留已知selector与结构化参数；RPC未知/读取失败标UNKNOWN，不伪造取消或零余额。

## GroupBuyVault

ABI SHA-256：`c01fcd8301d3cfb2c0113bb59afa9fea2814a664a5de023d7e7a4668304e33ed`。

### 事件

| 实际签名 | 字段与含义 |
| --- | --- |
| `ApprovalForAll(address indexed account, address indexed operator, bool approved)` | 标准operator授权只授权ERC1155转移，不赋予退款、BEM领取或100%赎回权。 |
| `Contributed(address indexed participant, uint256[] ids, uint256 principal, uint256 soldCount)` | participant为实际出资者；ids为本次ID；principal为准确本金wei；soldCount为本次参与后的有效数量。不可用历史入金替代当前资金。 |
| `FundingTerminated(uint8 reason, address indexed caller)` | 不可逆进入REFUNDABLE；caller记录触发者。reason为uint8原因码，guardian自定义原因不应强行解释为MarketStatus。事件不代表已退款。 |
| `Harvested(address indexed caller, uint256 received)` | caller是触发者，并非收益接收者；received是本次harvest引起的账本新增，可能包括之前未同步直转。Mining实际支付另看BEM Transfer(to=Vault)。 |
| `IdReleased(uint256 indexed id, address indexed participant)` | 该id从该participant释放；只有仍处FUNDING的池可重新参与该ID。 |
| `Initialized(uint64 version)` | OpenZeppelin初始化版本事件，不等于模板已通过审计或可以再次初始化。 |
| `Purchased(address indexed market, address indexed collection, uint256 indexed tokenId, uint256 paid, bytes32 orderHash, uint256 listingId)` | 固定market/collection/tokenId的购买付款paid；orderHash/listingId区分市场订单身份。仍须核对NFT owner=Vault。 |
| `Redeemed(address indexed beneficiary, bool harvested, uint256 paid, uint256 dust)` | beneficiary为固定最终受益人；harvested区分正常/无harvest路径；paid为本笔真实BEM支付总额，已包含dust；dust单列余数，不能再次加到paid。无harvest的0不表示Vault余额为0。 |
| `ResidualClaimed(address indexed beneficiary, address indexed recipient, uint256 amount)` | beneficiary为已记录的赎回者，recipient为其指定地址，amount为实际残余BEM支付。任何creator/guardian均不能据此代领。 |
| `RewardClaimed(address indexed holder, uint256 indexed id, uint256 amount)` | holder为当前领取人；id保存独立历史；amount为本次支付该ID权益，允许0。整批合并一次token付款，按本笔recipient汇总对账。 |
| `RewardsSynced(uint256 received, uint256 totalAccounted, uint256 accPerShare, uint256 remainder)` | received为本次识别新收入；totalAccounted累计确认到账；accPerShare每份累计应得；remainder为小于100的最小单位余数（赎回残余规则另见状态）。 |
| `TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)` | ERC1155批量operator/from/to/ids/values；索引器逐ID维护并与balanceOf/holderOf交叉核对。 |
| `TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)` | ERC1155 operator/from/to/id/value；数量0或自转账不可被索引器误当成持有人变化。单ID的batch调用也可能发该事件。 |
| `URI(string value, uint256 indexed id)` | 继承ERC1155元数据事件；当前实现没有owner改uri入口，不能仅因ABI有该事件推导出写权限。 |
| `UnexpectedNativeReceived(address indexed sender, uint256 value)` | 异常原生币转入单列，不铸份额、不增加有效本金；强制转入还可能没有此事件。 |
| `VaultInitialized(address indexed factory, address indexed creator, bytes32 configHash, bytes32 termsHash, bytes payload)` | factory/creator为固定来源；configHash/termsHash是完整结构编码hash；payload是公开完整履约数据。creator没有资产管理权限。 |
| `Withdrawn(address indexed participant, address indexed recipient, uint256[] ids, uint256 principal)` | participant为退出者；recipient是其指定BNB收款人；ids被销毁释放；principal为实际退款本金wei。交易回滚时事件也回滚。 |

### 错误

| 实际签名 | 字段与含义 |
| --- | --- |
| `CompletionRequired()` | requireCompletion=true但执行时本次无法满额购买；整笔参与回滚。 |
| `ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId)` | OpenZeppelin ERC1155标准输入、余额、接收者或operator校验；参数为本次实际错误对象。 |
| `ERC1155InvalidApprover(address approver)` | OpenZeppelin ERC1155标准输入、余额、接收者或operator校验；参数为本次实际错误对象。 |
| `ERC1155InvalidArrayLength(uint256 idsLength, uint256 valuesLength)` | OpenZeppelin ERC1155标准输入、余额、接收者或operator校验；参数为本次实际错误对象。 |
| `ERC1155InvalidOperator(address operator)` | OpenZeppelin ERC1155标准输入、余额、接收者或operator校验；参数为本次实际错误对象。 |
| `ERC1155InvalidReceiver(address receiver)` | OpenZeppelin ERC1155标准输入、余额、接收者或operator校验；参数为本次实际错误对象。 |
| `ERC1155InvalidSender(address sender)` | OpenZeppelin ERC1155标准输入、余额、接收者或operator校验；参数为本次实际错误对象。 |
| `ERC1155MissingApprovalForAll(address operator, address owner)` | OpenZeppelin ERC1155标准输入、余额、接收者或operator校验；参数为本次实际错误对象。 |
| `InvalidConfig()` | Vault初始化协议地址、chain56、模板版本或身份约束不符。 |
| `InvalidIds()` | 空/重复/超范围等ID输入或非法份额移动。 |
| `InvalidInitialization()` | 初始化次数或上下文不符，模板/clone不能重复初始化。 |
| `InvalidState()` | 操作不适用当前状态；ACTIVE不能退出本金，终止/赎回不能复活。 |
| `InvalidTerms()` | 固定条款、订单payload、期限、元数据或接收地址不合规。 |
| `NativePaymentFailed()` | BNB退款接收失败；销毁与账本一并回滚。 |
| `NotHolder()` | 当前调用者没有所需ID实际所有权；operator不等于持有者。 |
| `NotInitializing()` | 初始化次数或上下文不符，模板/clone不能重复初始化。 |
| `PurchaseFailed()` | 固定市场购买调用或结果失败，最后参与/铸造/付款全部回滚。 |
| `ReentrancyGuardReentrantCall()` | 共享重入保护拒绝跨入口重入。 |
| `RewardBalanceDecreased()` | BEM余额/转账语义不符普通无扣税资产假设，不能将减少量当收入。 |
| `SafeERC20FailedOperation(address token)` | BEM调用失败，token为失败资产；不能报告为零收益成功。 |
| `Unauthorized()` | 调用权限不符，例如非固定Factory终止或非赎回beneficiary领取残余。 |
| `UnavailableMarket(uint8 status)` | status给出固定市场检查结果，暂时性授权缺失/UNKNOWN不得直接视为永久撤单。 |
| `UnexpectedNFT()` | NFT身份、购买阶段收货或转移后所有者不符；不能仅信回调。 |
| `UnsupportedOrder()` | 订单超出V1子集或真实官方适配未启用；不要放宽参数强行通过。 |
| `WrongValue()` | msg.value或有效资金不等于绑定ID的精确成本。 |

## GroupBuyFactory

ABI SHA-256：`76a3955bae279fe4e384d03ac016276cc2176ba44450f9fee593c826f06d8c9d`。

### 事件

| 实际签名 | 字段与含义 |
| --- | --- |
| `ConfigurationApproved(bytes32 indexed configHash, uint32 version, uint8 marketKind)` | configHash绑定完整Types.Config，version/template市场类型可追溯。标签不替代执行时实际身份校验。 |
| `ConfigurationSelected(address indexed template, bytes32 indexed configHash)` | 后续创建使用的template/configHash；create请求携带expected值，变更不能静默替换用户请求。 |
| `CreationPauseChanged(bool paused, address indexed caller)` | 仅影响新池创建；旧Vault直接退出/退款/领取/赎回不依赖该开关。 |
| `FundingCancelRequested(address indexed vault, uint8 reasonCode, address indexed guardian)` | guardian请求固定vault终止募资，reasonCode为原因；没有代收本金或改退款接收人能力。 |
| `GovernanceConfigured(address indexed upgradeAdmin, address indexed guardian, uint256 minimumDelay)` | upgradeAdmin为Timelock，guardian独立，minimumDelay为Factory门槛；仍须核对真实codehash、Timelock floor和角色历史。 |
| `Initialized(uint64 version)` | OpenZeppelin初始化版本事件，不等于模板已通过审计或可以再次初始化。 |
| `PoolCreated(address indexed vault, address indexed creator, address indexed template, bytes32 configHash, bytes32 termsHash, uint256 round, bytes32 salt, bytes orderPayload)` | vault为新clone；creator/template/configHash/termsHash/round/salt均可追溯；orderPayload用于后续参与者完整履约。此事件在clone初始化成功后发出。 |
| `TemplateApproved(address indexed template, uint32 version, bytes32 codeHash)` | template/version/codeHash记录被批准的普通固定逻辑；新配置仅用于未来池。 |
| `Upgraded(address indexed implementation)` | Factory代理实现更换，不能将proxy codehash固定当作实现未变化。旧clone仍绑定其固定模板。 |

### 错误

| 实际签名 | 字段与含义 |
| --- | --- |
| `AddressEmptyCode(address target)` | 实际ABI中的底层依赖错误；按结构化参数复核，不从该错误推断永久订单失效。 |
| `BatchTooLarge()` | Factory批量终止超过明示上限。 |
| `ConfigurationChanged()` | 排队期间Factory当前template/configHash与用户expected值不同。 |
| `CreationPaused()` | 新池创建暂停；不影响旧池直接退出。 |
| `ERC1967InvalidImplementation(address implementation)` | Factory代理升级上下文/实现地址/槽位或非payable约束失败；不代表Vault具有升级入口。 |
| `ERC1967NonPayable()` | Factory代理升级上下文/实现地址/槽位或非payable约束失败；不代表Vault具有升级入口。 |
| `FailedCall()` | 实际ABI中的底层依赖错误；按结构化参数复核，不从该错误推断永久订单失效。 |
| `FailedDeployment()` | 实际ABI中的底层依赖错误；按结构化参数复核，不从该错误推断永久订单失效。 |
| `InsufficientBalance(uint256 balance, uint256 needed)` | 实际ABI中的底层依赖错误；按结构化参数复核，不从该错误推断永久订单失效。 |
| `InvalidConfiguration()` | Factory批准配置不满足固定协议/模板约束。 |
| `InvalidGovernance()` | 治理角色、Timelock门槛或初始化身份不符。 |
| `InvalidInitialization()` | 初始化次数或上下文不符，模板/clone不能重复初始化。 |
| `InvalidPage()` | 分页参数无效，禁止无界全量遍历。 |
| `InvalidTemplate()` | 零代码、非普通模板、runtime/初始化锁或版本检查失败。 |
| `NotInitializing()` | 初始化次数或上下文不符，模板/clone不能重复初始化。 |
| `PoolAlreadyExists()` | 同轮/条款/salt池已存在；新轮次应使用新round。 |
| `UUPSUnauthorizedCallContext()` | Factory代理升级上下文/实现地址/槽位或非payable约束失败；不代表Vault具有升级入口。 |
| `UUPSUnsupportedProxiableUUID(bytes32 slot)` | Factory代理升级上下文/实现地址/槽位或非payable约束失败；不代表Vault具有升级入口。 |
| `Unauthorized()` | Factory调用者不是所需Timelock或guardian；具体角色取决于被调用函数，不能据此推断Vault资产管理权。 |
| `UnknownPool()` | Factory未登记此Vault，不得代为终止。 |

## MarketValidator

ABI SHA-256：`72e4f0a4e26b666fb169a2df51790594d50129ccf555d0cc6ef721d5647ac277`。

### 事件

当前ABI无此类型条目。

### 错误

| 实际签名 | 字段与含义 |
| --- | --- |
| `IdentityMismatch()` | 外部协议代码/域等固定身份不符。 |
| `InvalidSignature()` | 原订单签名/Seaport认可状态不满足，不能替换签名域或counter。 |
| `UnsupportedOrder()` | 订单超出V1子集或真实官方适配未启用；不要放宽参数强行通过。 |

## GovernanceTimelock

ABI SHA-256：`eee33b7027cc6058d0d58e587dadae7e1ae40cb6788d50686adf5fdc5e3e66d6`。

### 事件

| 实际签名 | 字段与含义 |
| --- | --- |
| `CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)` | Timelock目标调用已执行；按同id/index匹配计划，不把计划事件当执行回执。 |
| `CallSalt(bytes32 indexed id, bytes32 salt)` | Timelock操作使用的salt辅助索引。 |
| `CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)` | Timelock操作id/index、target/value/data、predecessor与delay；操作尚未执行。 |
| `Cancelled(bytes32 indexed id)` | Timelock排程被取消，不是Seaport订单撤销。 |
| `MinDelayChange(uint256 oldDuration, uint256 newDuration)` | Timelock内部延迟变更；GovernanceTimelock有效getMinDelay仍受不可变floor限制。 |
| `RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)` | 角色管理关系变更。 |
| `RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)` | role授权给account，sender为授权调用者；完整治理审计需扫描grant/revoke历史。 |
| `RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)` | role从account撤回，sender为撤销调用者。 |

### 错误

| 实际签名 | 字段与含义 |
| --- | --- |
| `AccessControlBadConfirmation()` | 实际ABI中的底层依赖错误；按结构化参数复核，不从该错误推断永久订单失效。 |
| `AccessControlUnauthorizedAccount(address account, bytes32 neededRole)` | 实际ABI中的底层依赖错误；按结构化参数复核，不从该错误推断永久订单失效。 |
| `FailedCall()` | 实际ABI中的底层依赖错误；按结构化参数复核，不从该错误推断永久订单失效。 |
| `InvalidMinimumDelay()` | Timelock零延迟/非法初始角色配置。 |
| `TimelockInsufficientDelay(uint256 delay, uint256 minDelay)` | Timelock排程状态、依赖、调用权限或延迟检查失败；核对对应操作ID和当前read状态，不自动重发。 |
| `TimelockInvalidOperationLength(uint256 targets, uint256 payloads, uint256 values)` | Timelock排程状态、依赖、调用权限或延迟检查失败；核对对应操作ID和当前read状态，不自动重发。 |
| `TimelockUnauthorizedCaller(address caller)` | Timelock排程状态、依赖、调用权限或延迟检查失败；核对对应操作ID和当前read状态，不自动重发。 |
| `TimelockUnexecutedPredecessor(bytes32 predecessorId)` | Timelock排程状态、依赖、调用权限或延迟检查失败；核对对应操作ID和当前read状态，不自动重发。 |
| `TimelockUnexpectedOperationState(bytes32 operationId, bytes32 expectedStates)` | Timelock排程状态、依赖、调用权限或延迟检查失败；核对对应操作ID和当前read状态，不自动重发。 |

## 枚举、解码与索引边界

`State`：0 FUNDING、1 PURCHASING（交易内）、2 ACTIVE、3 REFUNDABLE、4 REDEEMED。

`MarketKind`：0 SEAPORT、1 CIRCUIT_RESERVED（真实官方适配禁用）、2 MOCK_CIRCUIT（仅显式本地Mock）。

`MarketStatus`：0 EXECUTABLE、1 NOT_STARTED、2 EXPIRED、3 CANCELLED、4 FILLED、5 COUNTER_CHANGED、6 OWNER_CHANGED、7 APPROVAL_MISSING、8 PRICE_CHANGED、9 LISTING_ENDED、10 UNKNOWN。初始Seaport totalSize=0/totalFilled=0不是FILLED。

市场检查的嵌套错误可能来自 `MarketValidator` 或外部Seaport/NFT/BEM，应以对应固定ABI解码；不能假装所有selector都属于Vault。构造交易只使用当前实际函数ABI，禁止把浏览器直接买NFT的任意to/data/value盲传给Vault。

Factory事件是发现/索引来源，不是旧池执行身份的唯一信任来源：实际读取标准ERC1167 runtime、固定模板及validator codehash、Vault config/terms/payload commitments。URI/ApprovalForAll等继承ABI事件也不意味着存在owner管理权。
