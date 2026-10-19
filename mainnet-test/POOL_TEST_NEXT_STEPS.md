# 建池、67/33出资及收益测试交接

更新日期：2026-10-20（北京时间）。部署治理、认购购机、67/33同批收益分配及未领权益转移测试均已主网完成，十一笔测试交易均CONFIRMED、至少15确认。矿机#3204仍在ACTIVE Vault，creator/B当前持份66/34。**#1转移、creator的NotHolder拒绝及B实收转移前的0.00000323 BEM均PASS**。最终回执区块128591816，Vault余额0.00032016 BEM；其他99份本批权益尚未领取。归集赎回及失败退款仍未执行。下列建池/订单检查保留为购机历史交接，不能把历史快照当成实时状态。

第9–11笔依次完成新harvest、转移#1及B的claim(1)。新增32254 raw与旧余数85形成每份323 raw；转移保留claimed136654和claimable323；creator只读领取返回原始NotHolder()；B随后实际收到323 raw，#1已领升至136977、待领归零。其他99份保留323 raw，Vault剩32016=99×323+39。真实回执、独立审计及完整离线对账均PASS。详细证据见[权益转移最终报告](../mainnet-entitlement-transfer/BEM_ENTITLEMENT_TRANSFER_REPORT.md)。

## 1. 已有入口与需要补齐的保护

| 入口 | 当前用途 |
| --- | --- |
| [session.json](./session.json)、[live-manifest.json](./live-manifest.json)、[order-envelope.json](./order-envelope.json) | 本轮已冻结的订单、预测 clone、terms/payload、manifest hash、参与人及 nonce；保持原文件 |
| [prepare-session.mjs](./prepare-session.mjs) | 已生成本轮会话；不要重新生成订单、salt、round 或覆盖会话 |
| [cli/index.ts](../cli/index.ts) 的 `create-pool`、`contribute`、`withdraw` | 已有调用参数组装、模拟和 SDK 后置校验，可复用逻辑；旧广播入口仅等待 1 个确认，缺少本轮逐笔 sender 的完整 journal/未知结果恢复保护，不能直接视为后续受保护发送入口 |
| [send-step.mjs](./send-step.mjs) | 当前仅支持 `seller-approve` / `seller-validate`；不能传 `create-pool` 或出资步骤 |
| [create-pool.mjs](../mainnet-pool/create-pool.mjs) | 已按冻结计划 `0x160202869ab4bf0f4468613d2d5328bd9bc5bbf82a04783e24c6ed33f1f3528d` 完成唯一一笔主网建池；150 项测试通过。后续仅核验原 hash，无需再次建池 |
| [creator-contribute.mjs](../mainnet-funding/creator-contribute.mjs) | 已按计划 `0x7c913cd7dab07b9fc12dff5da6ef83cc0b5e2e76c570010e0ad71c95bbe7b644` 完成唯一一笔 creator 67 份认购；183 项测试通过。后续仅核对原 hash，无需再次认购；B 入口已完成，见下一行 |
| [buyer-b-complete.mjs](../mainnet-completion/buyer-b-complete.mjs) | B 最后 33 份及购机已主网确认，159 项新增测试、631 项完整相关回归通过；交易17509be1…f0a6，后续仅核对原hash |
| [sdk/live-identity.ts](../sdk/live-identity.ts) | `loadLiveManifest` 核原文件 hash；每笔预览、人工确认后和签名前后复核 `verifyLiveIdentity` |
| [sdk/postconditions.ts](../sdk/postconditions.ts) | `checkReceiptPostconditions` / `vaultObservation` 提供基础后置校验；仍须补本轮精确金额、完整事件及预测地址检查 |

## 2. 三笔固定动作

Factory 为 `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1`；实际已创建 Vault 为 `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A`，创建交易 `0x391c7bbee1c93025675055f0f26b7a8c8913a5333fea167b50115265efc11aca`，至少 15 个确认，完整 [journal](../mainnet-pool/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) 已保存。

| 步骤 | 发起人 / 会话预期 nonce | 调用及 value | 发出前必须确认 |
| --- | --- | --- | --- |
| create-pool | creator / 9 | Factory `createPool(...session.pool.createArgs)`，value=0 | seller-validate 真实回执已确认；预测地址未部署、Factory `isPool=false`；Factory 未暂停、选中模板/config 未变 |
| creator-contribute | creator / 10 | Vault `contribute([1…67], false, session.pool.payload)`；`203010000000000000` wei = **0.20301 BNB** | 新 clone 身份和创建回执通过；FUNDING、soldCount=0、fundedWei=0；1–67 全部空闲 |
| buyer-b-complete | B / 4 | Vault `contribute([68…100], true, session.pool.payload)`；`99990000000000000` wei = **0.09999 BNB** | creator 出资回执已确认；FUNDING、soldCount=67、fundedWei=0.20301；1–67 全由 creator 持有、68–100 全空闲 |

`[1…67]` / `[68…100]` 是说明性范围，实际 calldata 要展开为无重复整数数组。每份 `costOf(id)=3030000000000000` wei；重新求和必须与会话金额一致。nonce 只是冻结预期，latest/pending 必须一致且等于它；漂移时停止并复核，不自动改 nonce。

B 的 `requireCompletion=true` 强制本笔恰好完成 100 份；最后一笔内部直接 `_purchase()`。**没有后续独立 execute-purchase 交易**。三笔均由相应普通钱包发起，无需 Safe 再确认。

creator 的 `requireCompletion=false` 仅表示不强制凑满，并不禁止自动购买。公开池中，若第三人抢先买下其余 33 份，creator 这笔也可能成为第 100 份并触发购买。重复空池预检与回执检查不能消除上链竞态；逐笔签名前应明确这一行为。

## 3. 身份与订单绑定不能省略

调用 `verifyLiveIdentity` 时：建池的 `command='create-pool'`、target=Factory、actor=creator、args=`session.pool.createArgs`、expectedCodeHash=manifest.factory.codeHash；两笔出资均用 `command='contribute'`、target=Vault、对应 actor/args、expectedCodeHash=manifest.vault.codeHash。expectedTemplate 始终为 manifest.template.address。

- 建池：SDK 校验 BSC 固定检查点、Factory runtime 与 EIP1967 implementation、Timelock/guardian/最小延迟、已审阅角色检查点、当前模板/config 选择与建池开关；比较 creator、template、configHash、termsHash、payloadHash、round，并调用 `predictPool` 要求等于 manifest 的 Vault 地址。
- 出资：SDK 要求真实 Vault runtime 恰为指向既定模板的标准 ERC-1167 clone，核对模板锁定初始化、immutable validator、Vault 的 factory/creator/config/terms/payload；同时检查 Seaport、NFT、Mining、BEM runtime。**出资不会重新要求 Factory 当前选择/开关不变**，因为既有 clone 的配置已固定；不能误报它已经做了 Factory 当前治理全检。
- SDK 身份检查不替代订单可成交性检查。两笔出资前仍需检查 `marketStatus()==EXECUTABLE`，以及本轮 Seaport counter、getOrderHash、validated=true、cancelled=false、未成交、NFT owner=A、#3204 授权=Seaport、既定 domain/version 和期限。用 `checkProtocol` / 真实合约模拟验证；FULL_OPEN 可被第三人抢先成交，第一次模拟成功不保证稍后仍可成交。
- 本轮 fundingDeadline=`1792506971`，orderExpiresAt=`1792507271`，安全余量 300 秒。确认等待期间越过期限、撤销授权、counter 变化或订单被成交，都要停止并重查，不换订单继续旧计划。

## 4. 成功回执标准

通用：至少 15 个确认；核对同一 hash、canonical block、sender/target/nonce/value/calldataHash、success，先保存回执再判断业务状态。未知结果只核对既有 hash，不盲目重发。

| 步骤 | 必须补齐的业务证明 |
| --- | --- |
| createPool | 恰一条 Factory `PoolCreated`，vault=预测地址，creator/template/configHash/termsHash/round/salt/payload 全匹配；恰一条 Vault `VaultInitialized`；Factory `isPool=true`；clone runtime/hash 与模板指针匹配；Vault state=FUNDING(0)、soldCount=0、fundedWei=0、totalPrincipalIn=0；矿机仍归 A |
| creator 67 份 | 恰一条 Vault `Contributed`：participant=creator、精确 ID 1–67、principal=0.20301、soldCount=67；对应 ERC-1155 mint 数量均为 1，holderOf/balanceOf 一致；FUNDING、fundedWei=0.20301、totalPrincipalIn=0.20301；没有 `Purchased`，矿机仍归 A |
| B 完成 | `Contributed` 精确 ID 68–100、principal=0.09999、soldCount=100；恰一条 `Purchased` 绑定 Seaport/collection/#3204/paid=0.303/orderHash；NFT Transfer 从 A 到 Vault，ownerOf=Vault；Seaport `OrderFulfilled` 与已填满状态匹配；state=ACTIVE(2)、soldCount=100、fundedWei=0、purchaseSpent=0.303、totalPrincipalIn=0.303；creator/B 的所有 ID 与 67/33 分配一致 |

卖家 0.3 BNB 与 creator 0.003 BNB 费用收款应独立核对。金额来自冻结 consideration；余额差应扣除当笔相关 gas，并排除同区块其他交易影响；无法排除时标注未独立验证，不能仅凭总余额差宣称收款精确匹配。BEM 可在购买时已有余额，购买成功不等于已经验证收益分配。

## 5. 失败与退款路径

`contribute` 及内部购买是同一原子交易。B 补齐时若市场调用或后置检查失败，整笔 revert：B 本金没有转入 Vault、B 没有新增份额、购买未发生；已支付 gas 仍消耗，creator 先前的 0.20301 BNB/67 份仍保留。**revert 不会自动把池切为 REFUNDABLE，也不会自动退还 creator**。

未买成时，持有人可直接 `withdraw(自己持有的IDs, 自己地址)`：FUNDING 或 REFUNDABLE 都允许。可终止原因确定时另行 `markRefundable()`；合约允许截止超时以及 CANCELLED、COUNTER_CHANGED、FILLED、EXPIRED、LISTING_ENDED、PRICE_CHANGED。单独 OWNER_CHANGED、APPROVAL_MISSING 或 UNKNOWN 不属于其允许的提前终止原因；必要时可使用既定 guardian 将 FUNDING 池切为可退款，仍不能提款或改变持有人的受益权。

退款也是单独计划、单独人工确认。回执需匹配 `Withdrawn` 的 participant/recipient/完整 IDs/精确 principal，所有 `IdReleased`、ERC-1155 burn 与余额归零一致；fundedWei/soldCount 对应减少、totalPrincipalRefunded 对应增加。若仅 creator 已出资，退款应为 **0.20301 BNB**，B 没有退款余额。recipient 绑定该持有人自己；退款调用失败则本笔整体回滚，不能标记“已退款”。ACTIVE 池不再允许上述本金退出，不能将已购买后的赎回混为退款。

## 6. 预算和逐笔确认

沿用 `deployments/live-budget.json` 与共享锁；保留所有历史预留及journal。第11笔后全部15项预留合计 **0.3043235844 BNB**，已批准累计上限 **0.3045 BNB**，尚余可预留空间 **0.0001764156 BNB**。四部署加十一笔测试实际gas为 **0.0010865742 BNB**，认购本金共0.303 BNB；Safe外层费用单列。前一轮三笔收益测试实际gas为0.00016822425 BNB，第9–11笔实际gas为0.0000150677 BNB，没有释放任何历史预留。

先生成本笔完整只读计划，再由用户逐笔确认 actor、nonce、target、IDs、requireCompletion、value、gas/price/上限、manifest/session/plan hash，以及新的累计限额。累计计费仍是 `已有 spentAndReservedWei + 本笔 value + gasLimit×gasPrice`；两笔本金合计 **0.303 BNB**，累计预算必须覆盖 **已有全部预留 + 尚未出资的本金 + 后续各笔 gas 上限**（已预留的 creator 本金不重复计算），不能把已有预算清零或把本金排除。creator 后续收到的 0.003 BNB 费用不抵扣预付本金或累计预留。

受保护入口须复用：确认后再次校验冻结输入与实时状态；先持久化预算及 journal，再签名；发送前保存确定性 hash；同一交易最多广播一次；未知结果保留预留并核对，真实 revert 也不自动释放预算。必须包含独立 RPC 身份核验与携带冻结 gas 的 `eth_call`，避免本轮已记录的 provider 默认 gas 兼容性问题。建池、creator 67 份及 B 完成出资入口已具备这些保护；B 完成交易已主网确认，退款入口仍待实现与测试，不提供可直接广播的旧 CLI 替代命令。

creator 原冻结报价为 gas=4,333,131、gasPrice=0.05 gwei、费用上限 0.00021665655 BNB，实际 gas 支出为 0.0001774711 BNB。第五笔 B 的累计预算为 **0.3045 BNB**（全部本金 0.303 + 原 gas 上限 0.0015），已随第 5 笔批准并执行。完整参数及历史状态裁剪兼容处理见 [当前报告](./MAINNET_TEST_REPORT.md)。

B 正式只读报价：gas 上限 2,493,269、gasPrice=0.05 gwei、费用上限 0.00012466345 BNB；本金加 gas 最大 0.10011466345 BNB，执行后累计最大预留 0.3040979852 BNB。冻结计划与审批状态见 [第五笔验证记录](../mainnet-completion/validation.json)；本笔已批准并完成；后续收益、转移或赎回交易仍须另行逐笔批准。

## 7. 已完成的BEM同批测试

[三步受保护入口](../mainnet-rewards/rewards.mjs)只支持上一轮harvest/creator-claim/buyer-b-claim，三步均已有CONFIRMED记录；再次使用同一步只核对原hash，不再发送。后两步没有harvest，验证同一H/q/r不变、各67/33份实收正确、100个ID全部已领、余数85raw留Vault。上一轮对账固定12项历史预留，不用于当前阶段。[权益转移入口](../mainnet-entitlement-transfer/entitlement.mjs)的三笔也均已按逐笔批准执行并验证PASS，没有待执行签名。本轮[最终离线对账](../mainnet-entitlement-transfer/audit/README.md)固定本轮15项结束状态，不使用RPC或私钥。以后的归集赎回或退款须另行准备、逐笔批准。
