# TapeOut 拼单合约 V1：给合约 Codex 的完整开发 Prompt

你负责一个独立的拼单合约仓库。请在当前工作目录内实际实现、编译、测试并交付完整工程，不要只输出方案或示例代码。

本轮交付是：**正式业务模型的合约候选实现 + 可复现本地测试 + SDK/CLI + 跨仓库订单接口 + 中文报告 + 可复制的完整仓库归档**。它不是自动上线授权，也不是安全审计证书。

## 0. 工作边界和执行顺序

- 只读写当前项目目录。不扫描父目录、其他市场项目、历史实验目录或那些目录中的 .env、数据库、私钥、Git/SSH 配置。当前目录若已有我提供的文件，先阅读并保留。
- 允许访问官方公开文档、公开合约源码与我显式配置的只读 RPC/本地 HTTP API；公开 GitHub URL 不代表可以扫描另一个本地项目。
- 没有旧测试合约源码时，按本规格重新实现和回归测试，不能声称复用了已审计/已测试的同一份代码。
- 不修改现有市场，不改数据库，不做数据库迁移，不调用市场挂单/撤单/广播等写接口，不部署服务到公网，不创建远程仓库，不 git push。
- 只在当前目录 git init（若尚未初始化）。生成本地源码归档及清单；远程仓库创建与推送另等用户授权。
- 阶段一：规格、合约、Mock 与本地真实 Seaport 代码集成测试、CLI、交接文档。现在执行。
- 阶段二：获得订单样本/RPC 后，执行真实链状态的本地 fork 集成。入口和工具现在实现，缺参则明确标记未执行。
- 阶段三：用户明确指定操作后才允许小规模实链部署/交互。本轮不自动广播。
- 无 RPC、无有效订单、源码不全或没有私钥，不阻塞阶段一；但真实协议适配验证不足的模块必须 fail closed，并标记实链发布阻塞项，不能用 Mock 伪造通过。
- 不为了完成任务绕过失败断言、伪造报告或简化掉核心安全条件。

## 1. 固定业务模型

一个矿机 NFT 对应一个独立 GroupBuyVault。Factory 只创建和登记，不集中保管大家的 NFT、BNB 或 BEM。

每个 Vault 本身实现 ERC-1155：

- ID 固定 1～100，每个 ID 同时有效供应量最多为 1；不是一个 ID 供应量 100。
- 每个 ID 对成功购入矿机的新入账 BEM 享有 1%；未领取权益跟随 ID，领取历史也按 ID 保存。
- 创建时不预铸 100 枚给创建者。参与者按整数份额付费，购买哪些空闲 ID，就铸造哪些 ID。
- 募资期间份额不可转移；允许本人部分或全部撤资，销毁对应 ID 并退回实际本金，空出的 ID 可重新购买。
- 矿机买成后才能转移份额。之后不再允许本金退款、重新铸造或增发。
- 只有同时持有全部 100 个 ID 的地址才能赎回整台矿机。operator 授权不等于持有。
- creator 仅用于来源记录和展示，不具有取消他人出资、改订单、改期限、提走资产等权限。
- 发起者退出不结束整个池；其他参与者留在原池，新用户可买空出的 ID。所有人退出后，只要原条款仍有效且未到期，原池也可以继续使用。
- 一旦退款终止或已赎回，该 Vault 不可复活；重新拼单使用新一轮/新地址。
- 不承诺买入时附带 BEM 数量。初始 BEM 为 0 是合法情况；不设正数 minInitialBem。未来“成交前帮卖家领取 BEM”不在本轮实现范围内。
- 不做收益率承诺、不自动补贴 gas、不另收拼单协议费；正常成交所需的既有市场费用包含在目标总付款内。

## 2. 代理、Factory 和权限：按这个方案实现

### 2.1 Factory

采用 OpenZeppelin 的 ERC1967Proxy + UUPS Factory 实现，使用相匹配的初始化、权限及存储布局工具。

- Factory 具有显式配置的 upgradeAdmin（正式部署接多签 + Timelock）与独立 guardian。不要把 timelock 的“延迟”只写在文档而绕过实际升级授权。
- 本地测试可以使用测试角色与缩短延迟，但正式部署清单必须验证真实角色、升级控制器及延迟配置，不能把单 EOA 开发配置标为生产就绪。
- upgradeAdmin 管理 Factory 升级、新 Vault 模板/协议配置的批准与版本选择，以及恢复新池创建。新配置只影响后续创建。
- guardian 只可暂停创建新池，或对指定已存在的 FUNDING 池触发不可逆的紧急募资终止。
- V1 不让 Factory 收取参与本金；创建和首次参与可以是两笔交易。避免用 Factory 转发后把 Factory 错记成份额持有人/出资人。任何后续增加的一笔创建并参与优化必须另测真实受益人。
- 不用无界循环遍历所有池。提供事件和分页查询；批量紧急终止也要有明确上限。
- 创建请求携带 expectedTemplate/configHash，防止正常管理升级与用户交易排队时发生静默模板/条款替换。报告仍需说明恶意 Factory 新实现对未来新池的风险。

### 2.2 每个 Vault

采用标准 ERC-1167 最小代理 clone，指向**普通、固定逻辑地址**，不是 UUPS/Transparent/Beacon 代理。

- Vault 没有 owner，没有 Ownable 管理者，没有 upgradeTo/upgradeToAndCall，没有 Beacon，没有任意 execute/delegatecall，没有管理员提款或迁移入口。
- 模板逻辑不得再查询 Factory 来选择执行实现；也不得通过另一个可升级代理作为 clone 的实现地址，伪装成不可升级。
- 可以使用 ERC1155Upgradeable 等初始化友好的基类，这不等于开放升级权限。
- 模板实现部署时锁定 initializer；创建 clone 和初始化必须在同一笔交易里完成。检查模板存在代码，初始化一次且完整，初始化失败则创建整体回滚。
- 部署前核验代码大小、EVM 目标与依赖版本。克隆内状态不得依赖实现构造器初始化过的 storage。
- 创建时复制并固定：Factory 地址、网络、模板版本、市场类型与地址、矿机地址/编号、Mining/BEM 地址、全部购买条款、固定期限、元数据。
- 旧 Vault 的提款、收益领取、转移、赎回不得动态依赖 Factory 的最新配置、owner、暂停开关或可用性。
- CREATE2 可用，但 salt 必须包含条款/模板/轮次等足够信息，不能只用 NFT 地址+编号，让失败后永远无法重建。防止用户预测地址被换参数抢占。
- 同一矿机的多个历史池按事件/索引区分，不设不可释放的永久占位。若提供单活动池策略，必须证明空池抢占与到期释放不会造成拒绝服务；V1 可以仅索引并在前端推荐现有池，不强行全局唯一。

### 2.3 有限紧急权限

允许 Vault 暴露一个固定范围的入口，例如 factoryCancelFunding(reasonCode)：

- 只能由初始化固定的 Factory 调用。
- 只能在 FUNDING、未购买状态执行，并使用共享的重入保护。
- 唯一效果是 FUNDING → REFUNDABLE，以及记录原因/事件；不转出任何 BNB/BEM/NFT。
- 不接收退款受益人、提款金额、任意调用参数；不修改每人的余额、退款额、订单、价格、截止时间或收益记录。
- 不允许 REFUNDABLE → FUNDING；对 PURCHASING/ACTIVE/REDEEMED 一律拒绝。
- 退款仍由参与者按原账本自行领取；Factory 无权代收、扣款、冻结退出或使退款依赖自己正常工作。
- guardian 失联、Factory 暂停、升级出错或 Factory 对外查询回滚，都不阻断用户已经拥有的直接退出/退款/领取/赎回路径。

公开表述为“无托管 owner、不可升级，保留募资阶段的有限 Factory 终止权”，不能声称没有任何治理权限。

必须测试恶意 Factory V2：它可以滥用预设终止权造成募资中断，但不能借此提走旧池资产或改写 ACTIVE 池。不要把这些边界依赖于前端按钮隐藏。

## 3. 状态机与固定期限

建议状态：FUNDING、PURCHASING（仅交易内过渡）、ACTIVE、REFUNDABLE、REDEEMED；可采用等价但同样严格的设计。

- 满额时购买必须原子执行。交易成功结束时不允许留下“FUNDING 但已售100份，等待创建者稍后买”的状态。
- Seaport 池的 deadline 必须早于或等于该订单 endTime 减创建时核验的安全余量；余额与期限计算不能溢出/下溢。
- 官方没有原生到期字段的版本仍必须有独立 deadline。
- deadline 初始化后不延长，不因退出、再次加入、资金归零而重置。
- 到期后停止新入金和购买，任何人可将池结束为 REFUNDABLE；用户退款不能依赖市场、Mining、Factory 或 API 的成功响应。
- 未买成前，用户原本就可以自由撤回自己的份额本金，不需要先证明订单取消。
- 普通链上调用失败/错误 calldata/错误签名/读取未知不等于永久取消。公共失效确认只能针对绑定订单的明确事实；错误订单输入不能用来关闭别人的池。
- 对可以恢复的授权丢失等情况，阻止当前新参与/购买，但不自动伪装为永久取消；用户仍可自行退出，或到期退出。
- 真正取消、完全成交、绑定挂牌结束、到期等可终止。官方价格与固定条款不符时可按预先说明的策略结束本轮，不自动改价或迁移资金。

## 4. 出资、退出、ID 复用与整数会计

购买总付款 P 包含所有既有市场收款项目，不包含未来执行者的交易 gas；P 固定。

对 P 不能被100整除的情况，采用确定规则，例如：

base = P / 100；r = P % 100；
ID 1～r 的成本为 base+1 wei，其余为 base wei。

要求 P >= 100 wei，所有 ID 成本为正。100 个 ID 成本合计必须恰好为 P。份额收益权仍都是1%，最多1 wei的成本差异应公开。

- 用户只能为自己参与，V1 不做赠送、代付和出资人/受益人拆分。
- 提供明确的 ID 列表参与接口，或保证等效安全的数量+预期ID接口；ID 去重、范围和空闲状态逐一校验。
- msg.value 必须等于此次有效 ID 的固定成本总和，避免隐藏超额退款/短款补齐。
- 退出销毁本人指定 ID，减少有效数量与有效资金，再返还确切成本。接收者由本人调用明确指定（默认本人），方便合约钱包；别人/Factory 不能替换退款接收人。
- 退出资金转账失败则该次退出完整回滚，不能烧掉 ID 后钱留不明账；其他用户仍可独立退出。
- 空出的 ID 必须可被再次购买，不能只增长 nextTokenId 直到耗尽。
- 募资阶段 ID 的供应量是0或1；ACTIVE时恰好100个ID各1；销毁再铸只允许在未终止的 FUNDING。
- 不允许外部随意 burn、mint、修改 supply 或转移募资份额；operator 授权不赋予提款、领取收益或赎回矿机的权限。
- 使用位图/固定范围等明确记录空闲与已售 ID，避免无界遍历。
- purchase 判定只用当前有效出资，不用历史累计入金或 address(this).balance。异常转入/强制转入 BNB 不会铸造份额或自动凑满。
- 记录退款/退出事件，并维护本金守恒；合法100份成本=当前有效总成本的不变量。

参与接口需要 requireCompletion 保护：

用户明确点击“完成拼单”时，若有人提前退出使这笔交易不再能筹满并买成，则本次参与整体回滚，不默默变成普通募资。

并发顺序以链上执行状态为准：退出先执行则重新算剩余份额；购买先成功则后续本金退出拒绝。

## 5. 市场购买适配与调用身份

首版只接 BNB Chain 56：

1. 本市场 Seaport 的固定价、单个指定 ERC-721 矿机卖单；
2. 已核验版本的 TapeOut 官方 CircuitMarket 固定价挂牌。

不自动换市场、不换订单、不买替代编号、不支持 ERC-20/WBNB 付款、拍卖、criteria 或任意聚合 calldata。

购买模块优先使用内部逻辑/内部库，由 Vault 直接调用市场。Mining 同样由 Vault 直接调用，不可把调用者身份误变成外部 Adapter。

如单实现因代码体积必须拆模板，可采用两个固定且独立审查的 Vault 实现（共享源码基类），保持相同外部接口，不能通过可变 registry + delegatecall 绕过不可升级约束。

购买前验证绑定条款和链上状态；付款只到初始化固定市场，value为锁定精确金额。购买后确认目标矿机 ownerOf == Vault；不能仅信返回 true 或 NFT 接收回调。

- 不要求所有市场都会走 safeTransferFrom；支持正常 transferFrom 收货的后置校验。
- onERC721Received 只接受购买过渡状态下的指定 collection/tokenId/from；回调不激活池、不 harvest、不执行复杂外部操作。
- 不允许提前意外收到同一个 NFT 后，仅凭已持有 NFT 就向市场送钱并误判购买成功。报告必须写清 unsolicited transfer、非目标资产及强制BNB/BEM转入的边界，不为此增加管理员通用提款。
- 外部调用失败或后置条件不符，最后一笔参与、铸造、购买全部回滚。此前其他参与者本金保持可退出。
- 不试图在 revert 的同一笔交易中永久保存 REFUNDABLE。

## 6. Seaport 子集、订单绑定和失效

当前市场仓库文档的已知线索是：单个非criteria ERC721、amount=1、FULL_OPEN、zone/zoneHash/conduitKey为0、两项原生币 consideration，卖家收价款、另一项为1%买方市场费。这个线索不是对所有新版本的保证。

阶段一按这个明确子集实现；实际接入前必须用本市场导出的真实样本和代码复核。遇到其他类型应明确 UnsupportedOrder，而不是移除验证。

必须保存并验证：
- chainId、Seaport地址、实际EIP-712域/版本、seller；
- 完整 OrderComponents 含签署时counter，offer/consideration、时间、salt、zone/hash、conduit；
- 原订单hash、精确总付款、全体收款人及金额；
- 执行条款的完整commitment，含 totalOriginalConsiderationItems 等实际传入字段。

注意：Seaport orderHash 不一定承诺履约时额外附加的全部 tips。V1只接受创建时确定的完整付款列表，禁止后加收款人/加价，也不能仅验证orderHash就放行任意额外consideration。

- 验证原签名或Seaport认可的已验证订单；哈希存在、isValidated=false/true均不能单独代表现在可执行。签名验证实现不可把不同域、链、合约或counter的签名混用。
- 在创建时将必要失效检查字段固定下来，并核对其确实属于所绑定订单；不能让调用者给订单填一个假的更晚endTime。
- 购买时核对同一订单内容和全额成交，不允许新用户替换原签名订单条款。
- 单笔取消检查 getOrderStatus.isCancelled。
- 批量作废检查 getCounter(seller) 与原counter。
- 到期检查 block.timestamp 与订单endTime；未开始订单不接受参与。
- 已完全成交判断必须避免把初始 totalSize=0,totalFilled=0 误判为成交。
- NFT owner、订单要求的真实授权对象、市场/集合身份均核验。
- 对本V1零conduit之外的订单明确不支持；不要错误地检查Seaport授权后当作任意conduit可用。
- 删除本地DB记录不等于链上取消；API无响应不作为永久取消事实。
- 创建时订单完整数据必须可被后续参与者获取。可把规范化订单及签名发到事件/提供可导出payload；需分析公开有效卖单数据的行为，不使用私密订单当作本V1默认输入。
- 完整payload保存和接入使用方便，但链上不从HTTP/数据库拉取签名；由用户交易携带并校验。

## 7. 官方 CircuitMarket 子集

现有市场接入线索：代理 0x6feEbbEbC07BcB90bd1Ac8b0CF9BaA4f0fF2B46f；历史已知实现 0x725771c38361abEF7b844729B978c775F7A83dFb。均需在实际测试区块重新验证，不视为当前有效承诺。

接口线索：
- listingView(listingId)：seller、collection、tokenId、price、feeBps、valid；
- listingFor(collection,tokenId)：当前listingId、seller、price、valid；
- listings、listingOf；
- buy(uint256 id,uint96 expectedPrice) payable。

必须使用实际已验证源码/ABI定义准确接口。未知实现不假装兼容。只向代理查询和购买，不能向implementation发交易。

- 固定market、listingId、seller、矿机、价格和必要费用快照，交叉检查 listingView/listingFor、所有权、授权。
- 目前接入结构不包含原生expiry；不要凭空编造。quoteExpiresAt只是后台报价TTL，不是挂牌到期。
- 即使没有原生到期，每个Vault仍有独立不可延长deadline。
- 挂牌清除/撤销/售出结束本轮；同矿机新listingId不自动接续。
- 固定价格不符时不买，不自动加钱，不自动将降价差额变成协议收入；V1不做降价继续成交的成功退款分配。
- valid=false要分类：明确挂牌结束、授权丢失、价格不符、状态未知等。不把所有读取失败当作已撤销。
- 核实订单是否非托管以及真正NFT收货地址；不能机械套用其他市场的owner规则。

特别注意代理升级风险：
- proxy地址固定、proxy codehash固定，不代表implementation不变。
- 普通Vault不能通过自己的SLOAD读取另一个代理的EIP-1967槽；禁止用这个错误方法实现“链上验证implementation”。
- 如已核验市场存在可靠的implementation getter/不可逆seal及其权限语义，可使用并测试；否则只能明确区分链下RPC身份核验与合约可强制的约束。
- 标明外部市场升级权限的残余信任风险。链下预检+监控+guardian终止可减少暴露，但不能声称排除同区块升级抢先等所有风险。
- 无法证明安全适配的真实部署配置，默认不启用；合约和Mock实现可交付，但在报告中保留实链阻塞项，不放宽规则强行通过。

## 8. BEM 收取和每个ID的账本

沿用已明确的经济模型，而不是直接余额乘以持仓比例。

- 固定100为分母。
- 全局累计每份应得accPerShare；claimed[id]独立；转移不重置claimed或把旧收益留给旧持有人。
- 收入以实际到账核对。收到0时是零增量，不把旧账清零。
- 余数保存到下一次分配，单位始终为最小代币整数，不写死18位。
- harvest()由Vault调用固定Mining，把收益收进Vault；可由任何人触发，但不能把收益交给触发者。
- claim(id)/claimBatch(ids)领取已到账收益；不得强制依赖Mining可用。
- harvestAndClaim(ids)便利入口；外部Mining错误不得伪装成成功领取0。
- pending为0的协议若会回滚，应根据实际源码对已知零收益分支做明确处理；不要catch所有错误直接返回0。
- 处理第三方直接向Vault转入BEM、或第三方直接向Mining领取并把BEM发给当前NFT owner的情况，避免漏记或双记。
- 在普通、非rebasing、非扣税BEM语义下，可用 balance+totalPaid-totalAccounted 对账；必须核对真实代币假设。余额减少异常不能被当作新收入或静默修正历史。
- FUNDING不分配收入。对募资期间意外BEM转入，明确“买成后才进入份额分配；拼单失败时不构成承诺的本金退款项目”等规则和残余资产处理，不能分给未确定参与者或自动给管理员。
- claimBatch支持最多100个ID；验证当前持有人、去重、范围，一次合并付款。先更新状态，再外部转账。
- 测试45/55各一笔领取、100个ID一笔领取、份额之间领取历史不同的情况。

## 9. 正常赎回和无管理员的故障退出

正常redeemMiner：调用者必须实际拥有全部1～100。

最后harvest并同步 → 结清全部ID的未领BEM与余数 → 销毁全部份额 → 固定记录redeemedBeneficiary → NFT交给赎回者 → REDEEMED。

任一关键步骤失败，正常赎回原子回滚；不能烧了份额却没有拿到矿机。

因为正式Vault没有owner，不照搬实验版 ownerEmergencyWithdrawMiner。

为避免Mining异常永久阻止100%持有者取回NFT，另实现一个**只有100%实际持有人可用**的redeemWithoutHarvest：

- 不调用Mining、不依赖BEM.balanceOf/transfer成功；只处理内部关闭/份额销毁和目标NFT交付。
- 记录固定赎回受益人；已经到Vault但尚未付出的BEM及余数，仅该受益人可在代币恢复后领取，不因份额销毁丢失。
- 保留历史收入/支付数据，不伪造支付；未进入Vault的Mining pending随NFT归属按外部协议处理。
- REDEEMED后不得再替已转出的矿机调用Mining；迟到的BEM残余有清晰、固定受益人规则。
- Factory/guardian/creator均不能调用此功能绕过100%份额条件；operator也不能。
- 仍依赖底层NFT本身允许转账，不能承诺绕过外部NFT故障。

不足100%的持有人不自动获得底层资产单独提款权。明确这种不可分割资产下的恢复边界，不能添加未经授权的多数投票或管理员接管来“解决”。

## 10. 元数据、事件与可核验性

name可以按受支持集合类型+矿机编号生成，例如tapeout12167、behemoth335。每个ID的uri描述对应1%及底层资产身份。

- 展示名称不是可信标识；必须公开chainId、collection、minerId、vault、factory、template版本/地址与条款hash。
- 不设owner修改uri/名称/权益的入口；名称长度/metadata尺寸有界。
- 提供各ID成本、当前持有人/余额、可用ID、有效出资、截止时间、market状态检查结果、claimable、各状态原因的只读接口。
- holder辅助索引不能因ERC1155零金额、自转账、重复batch或回调变更而失真，必须与balanceOf交叉测试。
- 事件至少覆盖创建、参与、退出、ID释放、购买成功、终止原因、BEM同步/领取、赎回。地址/ID/原始整数、版本、原订单身份可追踪。
- 执行模板/配置清单要可供外部工具独立读取，而不只相信可升级Factory当前返回的“官方”标签。

## 11. 技术选型与安全检查

优先 Foundry + Solidity + 锁定版本的OpenZeppelin；TS工具用viem与可运行CLI。依赖、编译器、优化参数、EVM目标写入锁文件/清单。

- 为clone正确初始化ReentrancyGuard与ERC1155相关基类。
- 不盲用transient storage/new opcode；目标BSC兼容性未证实时采用已核验的普通storage方案。
- 在ERC1155单笔/批量接收回调、ERC721收货回调、BNB退款、BEM付款、市场外部调用中共用明确的状态/重入保护策略。
- 不在带nonReentrant的公开入口之间错误互调；公共包装器调用内部实现。
- 不扩展市场/矿机/Mining/BEM的任意地址能力。创建时应用受支持集合与协议配置；旧池快照不可变。
- 无Owner的实现不代表共享代码bug不会影响所有clone；报告写明公共实现及外部协议风险。
- 运行格式、编译、单测、fuzz、invariant、gas报告、存储布局与静态分析（可用时）。工具不可用要记录，不编造扫描结果。
- 检查真实runtime字节数，不通过无限code-size设置掩盖真实部署失败。
- 新候选代码必须独立审计/复核后才考虑公众资金使用，不能用旧两份额实验报告代替新版本审计。

## 12. 必须实际执行的本地测试

除正常路径外，至少涵盖以下组别；输出逐项名称和结果，不凑一个无法复核的总数。

A. 代理与权限
- Factory初始化/升级授权/存储布局/guardian边界；implementation和clone均不能被重复初始化。
- 原子create+initialize；零代码模板、错配置、初始化失败。
- clone地址预测、参数替换、salt占用与新轮次。
- Factory升至V2后旧clone实现、参数、BEM账本和提款权限不变。
- 恶意Factory V2试图调用转账/升级/改参/ACTIVE终止均失败；FUNDING取消只能开放原款退款。
- Factory暂停、回滚、guardian失联时，原有退出/退款/领取/赎回不受阻。

B. 募资与退出
- 1/45/55/100份参与与wei非整除价格；msg.value错误；空/重复/越界/已售ID。
- A发起50份，B20份，A全退，C接50份，D补30份并购买。
- 部分退出、全部人退出后重入、不延长期限、已释放ID重复复用多轮。
- operator越权、Funding转账/任意burn拒绝。
- 最后一笔requireCompletion与撤资竞态两种执行顺序；非must-complete模式正常重新判断。
- 重入、恶意退款接收者、单人失败不阻断其他退出。
- 强制BNB、异常捐款、历史入金不被计为有效参与。

C. 两种市场
- 正常购买、买错NFT/接收地址/价格/付款人/额外tip/被篡改payload全拒绝。
- Seaport单笔cancel、counter增长、到期、未开始、完全成交、初始0/0状态、授权撤回恢复、不同域/签名/链、API删除但链上有效。
- 官方撤单、售出、价格上/下调、同NFT重新listing、valid=false不同原因、代理实现变化与核验未知。
- 订单临时/永久状态区分；恶意用户提交错误订单不能结束其他池。
- 订单在最后出资之前刚被别人买走，最后出资整体回滚，旧参与者可退出。
- official quoteExpiresAt过期不触发永久退款状态；自身deadline可独立触发退款。
- Mock之外，再用锁定版本真实Seaport Solidity代码+本地Mock NFT跑签名→创建池→满额履约，不用总返回true的MockSeaport替代全部覆盖。

D. 收益与赎回
- 0初始BEM、0同步不清旧账、后续正数收入、旧pending实际到账。
- 45/55份额领款守恒、领取顺序不同、不同ID历史不同、带正数权益转手、旧持有人拒绝、重复claim拒绝或零支付。
- 直接BEM/第三方claim入账、余数多轮累计、不按当前余额百分比付款。
- 100份正常赎回、零pending赎回、非零余数赎回、少一份/仅operator赎回失败。
- Mining/BEM故障下100%持有人redeemWithoutHarvest、记录受益人、恢复后残余BEM领取、不得重复支付。
- 支付/NFT转移失败正常路径回滚，Closed不复活，Factory不干涉。
- ERC1155批量重复项、零金额、自转账、恶意接收合约回调和其他跨入口重入。

E. Invariant与规模
- 每ID供应0/1，ACTIVE共100，REDEEMED全销毁。
- 有效出资=当前参与ID固定成本之和；总本金入金=已退出/退款+已购买支出+尚未使用的本金；异常捐款单列。
- BEM实际收支与剩余余额及未入账流入可核对，绝不超付；按ID累计核对，不要求历史上各钱包收款相同。
- 终止不可复活，ACTIVE不可退原本金，未经100%持有人不能移动NFT。
- 100ID铸造、批量退出、45/55/100领取、100归集/赎回实测gas，报告编译和链执行限制。
- 所有测试与部署默认路径必须通过真实Factory proxy→clone，不只测试直接部署实现的替代对象。

## 13. 独立仓库联调：JSON/API，而非浏览器直连数据库

本合约窗口和市场窗口有不同目录，不越界读文件。通过以下方式交换：

1. 本合约仓库导出ABI、TypeScript类型、部署清单、错误/事件说明与OrderEnvelope JSON Schema。
2. 市场窗口在自己的目录读取自己的本地数据库，经只读API或人工导出JSON提供订单。
3. 合约仓库只导入当前目录JSON，或读取用户显式配置的localhost只读API；不需要数据库密码，不访问PostgreSQL，不假定数据库记录就是链上事实。

现在实现OrderSource接口与两种来源：JsonFileOrderSource、HttpOrderSource（未配置时不得自动探测网络/其他项目端口）。HTTP只允许明确列出的读操作，即使某个报价读接口使用POST也不能借此调用写动作。

定义并交付OrderEnvelope v1，至少包括：
- schemaVersion、source/protocol、sourceChainId；
- market、collection、tokenId、seller、buyerPaysWei、币种、费用明细；
- orderHash或listingId、完整原订单或挂牌快照；
- Seaport完整OrderParameters/OrderComponents与counter、signature、originalConsideration数量、域信息；
- listing原生start/end（官方无则null）、独立报价TTL、验证区块number/hash、导出时间；
- 代理/实现身份核验信息及明确的verified/unknown状态；
- 可选来源commit/配置版本。禁止私钥/RPC密码/DB凭证进入Envelope。

“列表卡片只有hash和价格”不足以履约；缺完整签名payload时要返回明确缺项。浏览器直接买矿机用的to/data/value不能不解码就交给Vault盲执行。

market-handoff文档还必须要求：
- 导出的订单买方不固定为最后一位参与者；实际购买调用者/收货人是Vault。
- 原buy-quote可能会因尚未补款的Vault余额不足而拒绝；新增联调模拟要覆盖contribute→purchase整条路径，而不是仅模拟直接buy。
- 一个有效JSON不意味着对应链上挂单仍有效，执行前重新核验。
- Seaport/官方订单都需独立样本，取消/改价等变体用隔离测试环境，不改生产记录来假装链上状态。
- 不假定本市场现有API已经导出完整签名；列出需要市场窗口确认/补充的字段与只读接口。

## 14. CLI、fork以及实链边界

现在提供可运行CLI/脚本，至少覆盖：
protocol-check、import-order、deploy-local、create-pool、contribute、withdraw、mark-refundable、guardian-cancel、harvest、claim-batch、transfer-shares、redeem、redeem-without-harvest、inspect、report。

所有操作默认dry-run；脚本不得打印私钥或完整带凭证RPC URL。

提供.env.example，区分：
MODE=mock|fork|live
EXECUTION_RPC_URL（默认本地）
FORK_SOURCE_RPC_URL（只读主网来源）
SOURCE_CHAIN_ID=56
EXPECTED_EXECUTION_CHAIN_ID
FORK_BLOCK_NUMBER
MARKET_API_BASE_URL（默认空）
ORDER_FILE
DEPLOYER_PRIVATE_KEY、PARTICIPANT_A_PRIVATE_KEY、PARTICIPANT_B_PRIVATE_KEY（默认空）
FACTORY_ADDRESS、VAULT_ADDRESS、EXPECTED_TEMPLATE、EXPECTED_CODE_HASH
GOVERNANCE_MULTISIG、GUARDIAN_ADDRESS、TIMELOCK_MIN_DELAY（正式部署必须明确核验）
ALLOW_LIVE_SEND=false、MAX_TX_FEE_BNB、MAX_TOTAL_TEST_SPEND_BNB

私钥不用于Mock/fork，不提供前端私钥签名HTTP服务。真实私钥不能放进VITE_*、bundle、浏览器storage或报告。

Fork流程：
- 固定实际区块number/hash，真实Seaport或官方市场+真实NFT/Mining/BEM状态。
- 新Factory和Vault在本地部署；用户与seller可在本地impersonate，给本地参与者补gas/本金。
- 需要执行现有主网Seaport签名时，本地EVM chainId必须与该签名域兼容（通常保持56）；不能擅自用31337导致签名失效，再伪造签名验证成功。
- 必须另外检查执行RPC为明确的loopback Anvil实例及其fork信息，不能只看chainId=56就判断在主网或本地。未知客户端/远程执行目标拒绝本地测试广播。
- 所有交易只向本地EXECUTION_RPC_URL发送；FORK_SOURCE_RPC_URL仅用于读取，未授权绝不eth_sendRawTransaction。
- 真订单+完整签名从API/JSON导入后冻结为fixture；Fork内后续状态判断使用本地链，不混用市场后台的主网最新状态。
- 不覆盖目标真实协议bytecode/storage，不伪造BEM入账，不用mockCall绕过签名/授权/领取；用prank模拟卖家合法取消/改价等动作可以，但明确是本地分叉上的动作。
- 本地fork使用56不代表事件可写入生产DB；两个窗口不得把本地测试事件同步到生产索引。
- 单独记录“真实Seaport代码+Mock资产本地测试”和“真实链状态完整fork测试”，不能混称。

Live流程现在只交付脚本和清单：
- 广播必须MODE=live、ALLOW_LIVE_SEND=true、显式--broadcast、具体操作人工确认全部满足。
- 每笔确认网络/RPC、账户、目标地址/模板、订单、金额、gas上限和后果。配置.env不是授权广播。
- 不自动部署、买入、低价挂卖、撤销他人订单、充值其他账户或批量消费。
- 明确警告公开测试卖单可能被第三方买走；不得为测试自动把真实矿机低价公开挂单，也不承诺“只有测试钱包能买”。
- 先部署/验证Factory与模板和clone，再针对用户选择的有限金额订单逐笔测试。成功后核对receipt、NFTowner、原始余额与事件。
- known reject用只读模拟即可，不为生成“失败证据”自动广播损耗gas。
- 测试UI本轮非阻塞；先交付CLI与SDK，后续市场UI可连接它们。UI实现若另需修改，只能留给市场窗口或经用户另行授权。

## 15. 历史线索，不是本轮最新验证结论

用户历史两份额实验已经记录过领取、带权益转移及完整赎回成功；新100份与募资路径必须重新验证。

历史BSC配置：
TapeOut collection = 0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C
Mining = 0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46
BEM = 0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a
BEM历史decimals = 8
官方市场代理见第7节。
本市场历史Seaport地址线索 = 0x0000000000000068F116a894984e2DB1123eB395

这些地址必须在实际配置/测试区块重新核验。历史报告未证明Behemoth及所有未来Mining版本均兼容。

Mining接口线索为 pending(bytes32)、claim(bytes32)、minerKey(address,uint256)；读取实际ABI/源码/链上返回核对，不猜key编码。确认Vault调用权限与实际收款人；不照抄仅EOA成功的调用路径。

## 16. 完整仓库交付结构与报告

目录可调整，但至少具有：

src/                 Factory、Vault、固定购买模块、接口
script/              Foundry部署/演示脚本
test/unit/           模块测试
test/integration/    两市场集成、Proxy→Clone端到端
test/invariant/      有状态不变量
test/fork/           固定区块真实协议测试入口
sdk/                 TypeScript ABI/类型/条款hash/客户端
cli/                 可运行命令行
schemas/             OrderEnvelope JSON Schema
fixtures/            不含秘密的本地订单与后续导入目录
exports/             ABI、类型、接口、示例清单（可脚本生成）
docs/                中文规格、权限、接入、威胁模型
reports/             每类实际运行证据和机器可读JSON
deployments/         按模式/链/版本分目录的清单
.github/workflows/   无秘密的本地CI
README.md、.env.example、.gitignore、锁文件、构建与归档脚本。

必须生成：
1. SPEC.md：固定业务、状态转换、费用/退出/余数/意外资产处理。
2. SECURITY_MODEL.md：权限矩阵、有限Factory终止权、升级和外部协议边界、不可升级无法补救的情况。
3. PROTOCOL_COMPATIBILITY.md：每协议/集合/实现版本/区块的证据、适配范围与未知项。
4. CONTRACT_REPORT.md + .json：源码版本/hash、编译参数、代码大小、ABI摘要、逐类已执行测试、gas、静态扫描、失败/跳过和实链阻塞项。
5. MARKET_HANDOFF.md：足够市场Codex在另一个目录实现只读订单导出的字段契约、路径建议（明确哪些只是建议）、fixture和联合验收步骤。
6. FORK_TEST_RUNBOOK.md：按顺序可执行的导出→导入→本地fork→部署→参与/退出→满额购买→领取→转手→赎回步骤及RPC隔离检查。
7. LIVE_TEST_CHECKLIST.md：独立授权门槛、资金预算、角色、验证和逐笔核对，不把未运行写为通过。
8. RELEASE_MANIFEST.json：源码快照hash、锁定依赖、编译配置、ABI/codehash、模板/Factory版本、归档文件hash。

报告分层：Mock / 真实Seaport本地集成 / BSC真实协议Fork / 实链 / UI，各自PASS/FAIL/NOT_RUN。不把只读模拟、单测、回执和UI混成一个成功总数；不把工具自检称为独立审计。

完整源码包必须可由另一个全新目录重建：包含依赖锁定和获取方式；不能缺失git submodule说明，也不能依赖未提交的本地文件。归档用显式白名单生成，不打包.env、私钥、RPC凭证、node_modules、测试私钥缓存或带秘密的broadcast配置。生成sha256清单。

最后实际运行干净构建/测试/导出/打包命令，检查归档和报告存在。只有当前阶段确实完成的内容才写完成；缺失真实外部资料时交付可运行基础和精确阻塞项。

最终回复给用户：
- 实际实现内容和仓库/源码包位置；
- 实际执行命令和逐类结果；
- Factory与Vault权限边界；
- 仍未验证的真实协议与实链风险；
- 市场窗口下一步应接收的MARKET_HANDOFF.md；
- 用户下一步填写/导入什么，以及第一条只读预检/本地测试命令。

## 17. 参考资料（实现前复核准确版本）

以下用于核对技术定义，不代表本项目已获其审计或背书：

- ERC-1167：https://eips.ethereum.org/EIPS/eip-1167
- ERC-1155：https://eips.ethereum.org/EIPS/eip-1155
- OpenZeppelin Proxy/Clones：https://docs.openzeppelin.com/contracts/5.x/api/proxy
- OpenZeppelin 初始化与升级约束：https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable
- OpenZeppelin 权限/Timelock：https://docs.openzeppelin.com/contracts/5.x/access-control
- Seaport接口：https://docs.opensea.io/docs/seaport-interface
- Seaport结构：https://docs.opensea.io/docs/seaport-models
- Foundry Fork Testing：https://www.getfoundry.sh/guides/fork-testing
- 现有市场接口线索（若可访问则只读）：HongH933/tapeout-backend，docs/circuit-listings.md、docs/official-circuit-aggregation-handoff.md、src/chain/official-circuit-quote.ts。

现在从当前目录开始实施阶段一，不需要等待真实私钥，不自动部署到主网。
