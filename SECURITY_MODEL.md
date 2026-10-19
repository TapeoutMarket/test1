# TapeOut 拼单 V1 安全与权限模型

准确公开表述是：**Vault 无托管 owner、不可升级，保留募资阶段的有限 Factory 终止权。** Factory 可升级，不能据此把整体系统称为无治理、无信任或已审计。本文件描述当前源码边界；执行证据与未运行项目分层见 `CONTRACT_REPORT.md`。

## 1. 角色及权限矩阵

| 角色 | 可以做什么 | 没有的权限 |
| --- | --- | --- |
| Factory upgradeAdmin（Timelock） | 经延迟升级 Factory，批准/选择未来模板和配置，恢复新池创建 | 当前 V1 没有提取 Vault 本金、BEM、NFT 或替换退款人的入口 |
| guardian | 暂停创建，对登记的 FUNDING 池触发不可逆退款终止，单批最多 32 池 | 恢复创建、升级、改配置、退款代收、取消 ACTIVE/REDEEMED |
| creator | 记录创建来源；如自己出资则按普通持有人规则操作 | 改订单/价格/deadline、取消他人出资、管理资产或独享收益 |
| 份额当前持有人 | 本人 FUNDING/REFUNDABLE 本金退出，ACTIVE 对所持 ID 领取和转移 | 其他人的本金/收益、未满 100% 时单独提出底层 NFT |
| ERC-1155 operator | 在 ACTIVE 中按 ERC-1155 授权转移份额 | 直接替持有人 withdraw、claim 或 redeem；授权本身不等于实际持有 |
| 实际 100% 持有人 | 正常赎回；或故障时跳过 Mining/BEM 取回 NFT | 绕过底层 NFT 自己的转账故障 |
| redeemedBeneficiary | 关闭后独占领取残余及迟到 BEM，自己指定 BEM 收款人 | 修改已记录受益人，重新激活池，再替已交出矿机调用 Mining |
| 任意地址 | 创建合法新池，确认明确永久失效/到期，ACTIVE harvest/sync | 任意选市场/资产调用，凭触发 harvest 取得他人收益 |

operator 可先执行合法授权转移，使自己成为所转份额的持有人，再依持有人资格领取；若最终持有全部 100 份，也能赎回。授权风险需在市场 UI 明示，不能只以“operator 不可直接赎回”给用户错误安全感。

## 2. 真实延迟与升级边界

Factory 的 `_authorizeUpgrade` 要求调用者等于固定 upgradeAdmin，且该控制器当前最小延迟不少于 Factory 初始化要求。普通 EOA 和 guardian 不能直接升级。Factory implementation 构造器禁用 initializer；ERC1967Proxy 初始化与部署原子执行，不能再次初始化。

仓库的 `GovernanceTimelock` 继承锁定版本 OpenZeppelin TimelockController，部署时没有外部 bootstrap admin，Timelock 自身持有 DEFAULT_ADMIN_ROLE。部署时要求非零延迟和有效 proposer/executor 列表；正式 proposer 应为经过独立核验的多签。guardian 初始化时必须独立于 Timelock，且不能同时持有 proposer 或 default-admin 角色。

`minimumDelayFloor` 固化在普通 Timelock 合约代码中。`getMinDelay()` 返回内部设置与不可变 floor 的较大值，OpenZeppelin 调度逻辑实际调用这个虚函数。即使经延迟自调用 `updateDelay(0)`，后续操作也不能用 0 延迟排期。配置、恢复创建和升级都必须走真实 schedule → 等待 → execute；本地短延迟测试角色不是生产多签证明。

Factory 初始化的 code/interface/getMinDelay/self-admin 检查是错误配置防护，**不能单凭 ABI 返回值证明控制器真的执行延迟**：恶意自定义合约可以伪造这些返回值。正式部署清单必须核对实际 Timelock 源码、runtime bytecode、immutable floor、角色成员及多签身份，不得把一个仿冒 controller 或 EOA 开发配置标为生产就绪。后续角色变更同样需要监控和治理审查。

Factory 使用 ERC-7201 namespaced storage；升级测试同时检查 Factory 登记/角色/配置和旧 Vault 的条款、代码、BEM 账本。namespaced storage 降低意外布局冲突，不阻止恶意升级代码任意修改 Factory 自己的状态。

恶意 Factory 新实现可以忽略未来创建的审批或 expected 参数检查，批准恶意模板、伪造“官方池”标签、篡改索引及破坏创建服务。用户应核对每个已部署 clone 的实际 runtime、实现地址、validator 地址/代码、条款及独立清单，而非只相信可升级 Factory 当前的文字标签或事件。

## 3. 固定 clone 与只读校验器

Vault 没有 Ownable、升级函数、Beacon、任意 execute、管理员提款或迁移入口。ERC-1167 的唯一 delegatecall 固定指向普通模板逻辑；模板中没有选择下一层可升级执行实现的 registry。

模板提供 immutable `implementationSelf()`、固定模板 ID 和 initializer 锁定状态；Factory 批准时同时检查代码存在、指定 codehash、版本记录、自身身份和 initializer 已禁用。这能拒绝把普通 ERC1967Proxy 错当模板等常见配置错误。批准流程仍信任治理对源码和 codehash 的独立审查；恶意代码也可仿造相同查询函数，不能把 marker 当成形式化证明。

`MarketValidator` 由模板构造器新建，为没有存储配置、资产操作或升级入口的普通合约，其 immutable 地址嵌入模板代码。Vault 只以 STATICCALL 查询绑定条款和协议状态，不向 validator 转钱，不让它执行购买，也不通过它调用 Mining。购买付款及 Mining.claim 的调用者和收款对象保持 Vault。clone 的业务状态在 initialize 中完整写入，不依赖实现构造器曾初始化的 storage。

代码大小限制未通过无限制 code-size 设置绕过。具体编译器、EVM 目标、优化配置和运行字节数由最终报告与发布清单给出；这些值不是主网 gas 可用性的保证。

## 4. 有限 Factory 紧急终止能力

Vault 的 `factoryCancelFunding(uint8 reasonCode)` 只接受初始化固定 Factory 的调用，并与其他资产状态入口共享重入锁。它只在 FUNDING 中把状态变为 REFUNDABLE、记录原因和事件，不执行外部资产转出。接口中没有退款受益人、提款金额、任意目标或 calldata。

恶意 Factory V2 可能对旧 FUNDING 池任意触发这个预设终止权，造成可用性损失；这属于明确保留的治理风险。但旧 Vault 仍按自己原来的 ID/本金账本退款。Factory 不能代领、扣款、冻结用户的直接退出，也不能使 REFUNDABLE 回到 FUNDING。

ACTIVE、PURCHASING、REDEEMED 不能通过该入口终止。旧 Vault 不读取 Factory 的最新模板、owner、暂停开关或池查询。Factory 暂停、升级为查询回滚的恶意实现、guardian 失联，都不阻断 Vault 已有的直接退出、领取、合法转移及赎回。恶意升级测试实际发起过对旧池的提款、改参、升级、转 NFT、领取和赎回尝试，边界由合约执行，不依靠隐藏前端按钮。

## 5. 资金与订单约束

合约按当前有效 ID 成本记录本金，不用历史入金或 BNB 余额判定购买资格。参与只能为 msg.sender，金额精确匹配。退款先更新/销毁再转 BNB，失败原子回滚。Factory 没有普通收款入口，创建不转发本金；误强制转入 Factory 的 BNB 也不属于正常受管资金。

最后一次参与包含完整购买与资产后置检查；对可恢复故障直接回滚，不在同一笔 revert 中假装永久保存 REFUNDABLE。requireCompletion 保护用户明确“完成拼单”的意图。创建与参与分别绑定预期配置及完整 payload，错误签名、错误订单或 HTTP 失败都不产生关闭别人池子的公共权限。

只接受规范化的固定价 Seaport 子集。orderHash 与完整执行 commitment 同时检查，防止原 hash 不承诺追加 tips 时被替换付款列表。实际域/链/市场/版本、counter、签名或已验证订单、时间、所有权和准确的零 conduit 授权对象都要一致。购买前拒绝已提前误送到 Vault 的目标 NFT，购买后核实目标 ownerOf，避免返回值伪成功。

完整公开卖单 payload 和签名会存储/发事件，使后续参与者可取得同一订单。任何第三方也可能在公开市场先买走；不能自动安排低价公开真实测试单并声称只有测试账户能买。链外订单 JSON 的完整性只证明数据格式，不证明此刻可执行，更不能把 DB 删除或 API 不可用当作链上取消。

## 6. BEM 与故障恢复

账本依赖普通、非 rebasing、非扣税 BEM，实际流入按 `balance + totalPaid - totalAccounted` 对账；普通支付还核对发送方与收款方的精确余额变化。异常减少和扣税不被静默吸收。ID 领取历史跟随 ID；归集后钱包累计收款可能不相等，审计应按 ID 及实际事件核对，不能要求历史 A/B 钱包总额相等。

`claimBatch` 不强制 Mining 成功，已有 BEM 可独立领取。Mining 出错时便利入口 harvestAndClaim 会明确回滚。100% 实际持有人还可 redeemWithoutHarvest，在完全不依赖 Mining 或 BEM.balanceOf/transfer 的路径上取得 NFT。关闭后的固定受益人保留残余 BEM 权利，代币恢复后自己领取；不能把未支付的 BEM 记成已经领走。

`pending(key)` 的零值不是“没有可结算收益”的安全判据。[真实 fork 结算诊断](reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) 已观察到 pending=0 后直接 Mining.claim 收到正数 BEM，证伪了旧版 harvest 的跳过条件。修正规则要求 harvest 无条件尝试固定 Mining.claim 并按实际到账记账，失败保持回滚；不能用广泛 catch 将故障变成成功领取 0。没有新增收益的成功调用与发生错误是两种状态。修复后持续收益回归已通过，已核对 pending=0 时 Vault 再次取得正数实收和账本增量；此发现不等于对 Mining 完整内部结算机制的源码审计。

低于 100% 的参与者不能单独取出一台不可分割矿机。这里没有多数投票、管理员接管或强制合并工具。若持有人失联、份额永久丢失或底层 NFT 禁止转账，当前固定实现不能替用户恢复整台矿机。无 owner 不代表所有故障都可修复。

## 7. 重入、回调和索引

参与、退出、终止、领取、harvest、赎回和单/批 ERC-1155 转移共享常规 storage ReentrancyGuard；不依赖未确认目标链支持的 transient storage。公开 nonReentrant 包装器调用内部逻辑，不互相调用导致自锁。

ERC-721 收货回调只确认购买过渡状态、固定 collection/tokenId/from，不激活池、不 harvest、不执行业务外部调用。ERC-1155 回调、BNB 退款、BEM 付款和 NFT 交付均可能触发对方代码；共享锁和状态检查阻止跨入口重入，支付/交付失败回滚。

holder 辅助索引针对合法 ID 和单位供应维护；0 金额、自转账和批量重复项不能借此制造额外权益。直接资格同时检查 holderOf 与 balanceOf。setApprovalForAll 是正常 ERC-1155 授权功能，前端必须准确解释其转移能力。

## 8. 不受支持或无法消除的风险

1. **官方真实 CircuitMarket 尚未核验。** `CIRCUIT_RESERVED` 在合约中 fail closed；本地 MOCK_CIRCUIT 的 ABI/状态分类不是官方当前实现证据。真实市场需提供源码/ABI、实现身份、费用与 valid 语义及独立订单样本。
2. **外部代理可升级。** 固定 proxy 地址及 proxy codehash 不证明 implementation 不变。Vault 没有通过自己的 SLOAD 读取另一代理 EIP-1967 槽的错误实现。链下固定区块检查与监控只能降低风险，不能排除同区块升级或抢先交易。
3. **Mining/NFT/BEM 的真实行为尚需逐版本验证。** 本地 Mock 的权限、pending=0、收款人、非税/非 rebasing 行为不是所有真实部署的保证。未知适配保持发布阻塞，不能补一个假的零值放行。
4. **意外资产可能永久留存。** FUNDING 失败后的捐赠 BEM、强制/额外 BNB、提前转入的目标 NFT、非目标 NFT 和其他代币没有管理员救援口。不能为了处理误转而加入任意提款后门。
5. **公共固定逻辑仍可能有缺陷。** 许多 clone 共用代码，一处漏洞可能影响多池；不可升级意味着无法直接修补旧池。新增版本仅改变未来池，公众资金上线前仍需独立审查/审计。
6. **工具结果不等于审计。** 本地单测、fuzz、invariant、gas 和静态工具只证明对应配置及执行覆盖。真实 Seaport 本地代码 + Mock 资产、真实 BSC fork、实链回执、UI 是不同证据层。

本轮没有主网部署、真实交易广播或市场/数据库写入。真实链 fork 和实链若缺少明确 RPC/订单资料必须标为 NOT_RUN，不能用本地 PASS 替代。
