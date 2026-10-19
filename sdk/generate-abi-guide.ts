// Documentation derives signatures/fields from the actual exported compiler ABI.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { ROOT } from './contracts.js';
const meanings: Record<string, string> = {
  VaultInitialized: 'factory/creator为固定来源；configHash/termsHash是完整结构编码hash；payload是公开完整履约数据。creator没有资产管理权限。',
  Contributed: 'participant为实际出资者；ids为本次ID；principal为准确本金wei；soldCount为本次参与后的有效数量。不可用历史入金替代当前资金。',
  Withdrawn: 'participant为退出者；recipient是其指定BNB收款人；ids被销毁释放；principal为实际退款本金wei。交易回滚时事件也回滚。',
  IdReleased: '该id从该participant释放；只有仍处FUNDING的池可重新参与该ID。',
  Purchased: '固定market/collection/tokenId的购买付款paid；orderHash/listingId区分市场订单身份。仍须核对NFT owner=Vault。',
  FundingTerminated: '不可逆进入REFUNDABLE；caller记录触发者。reason为uint8原因码，guardian自定义原因不应强行解释为MarketStatus。事件不代表已退款。',
  RewardsSynced: 'received为本次识别新收入；totalAccounted累计确认到账；accPerShare每份累计应得；remainder为小于100的最小单位余数（赎回残余规则另见状态）。',
  Harvested: 'caller是触发者，并非收益接收者；received是本次harvest引起的账本新增，可能包括之前未同步直转。Mining实际支付另看BEM Transfer(to=Vault)。',
  RewardClaimed: 'holder为当前领取人；id保存独立历史；amount为本次支付该ID权益，允许0。整批合并一次token付款，按本笔recipient汇总对账。',
  Redeemed: 'beneficiary为固定最终受益人；harvested区分正常/无harvest路径；paid为本笔真实BEM支付总额，已包含dust；dust单列余数，不能再次加到paid。无harvest的0不表示Vault余额为0。',
  ResidualClaimed: 'beneficiary为已记录的赎回者，recipient为其指定地址，amount为实际残余BEM支付。任何creator/guardian均不能据此代领。',
  UnexpectedNativeReceived: '异常原生币转入单列，不铸份额、不增加有效本金；强制转入还可能没有此事件。',
  TransferSingle: 'ERC1155 operator/from/to/id/value；数量0或自转账不可被索引器误当成持有人变化。单ID的batch调用也可能发该事件。',
  TransferBatch: 'ERC1155批量operator/from/to/ids/values；索引器逐ID维护并与balanceOf/holderOf交叉核对。',
  ApprovalForAll: '标准operator授权只授权ERC1155转移，不赋予退款、BEM领取或100%赎回权。',
  URI: '继承ERC1155元数据事件；当前实现没有owner改uri入口，不能仅因ABI有该事件推导出写权限。',
  Initialized: 'OpenZeppelin初始化版本事件，不等于模板已通过审计或可以再次初始化。',
  PoolCreated: 'vault为新clone；creator/template/configHash/termsHash/round/salt均可追溯；orderPayload用于后续参与者完整履约。此事件在clone初始化成功后发出。',
  GovernanceConfigured: 'upgradeAdmin为Timelock，guardian独立，minimumDelay为Factory门槛；仍须核对真实codehash、Timelock floor和角色历史。',
  TemplateApproved: 'template/version/codeHash记录被批准的普通固定逻辑；新配置仅用于未来池。',
  ConfigurationApproved: 'configHash绑定完整Types.Config，version/template市场类型可追溯。标签不替代执行时实际身份校验。',
  ConfigurationSelected: '后续创建使用的template/configHash；create请求携带expected值，变更不能静默替换用户请求。',
  CreationPauseChanged: '仅影响新池创建；旧Vault直接退出/退款/领取/赎回不依赖该开关。',
  FundingCancelRequested: 'guardian请求固定vault终止募资，reasonCode为原因；没有代收本金或改退款接收人能力。',
  Upgraded: 'Factory代理实现更换，不能将proxy codehash固定当作实现未变化。旧clone仍绑定其固定模板。',
  CallScheduled: 'Timelock操作id/index、target/value/data、predecessor与delay；操作尚未执行。',
  CallExecuted: 'Timelock目标调用已执行；按同id/index匹配计划，不把计划事件当执行回执。',
  CallSalt: 'Timelock操作使用的salt辅助索引。', Cancelled: 'Timelock排程被取消，不是Seaport订单撤销。',
  MinDelayChange: 'Timelock内部延迟变更；GovernanceTimelock有效getMinDelay仍受不可变floor限制。',
  RoleAdminChanged: '角色管理关系变更。', RoleGranted: 'role授权给account，sender为授权调用者；完整治理审计需扫描grant/revoke历史。', RoleRevoked: 'role从account撤回，sender为撤销调用者。',
  InvalidConfig: 'Vault初始化协议地址、chain56、模板版本或身份约束不符。', InvalidTerms: '固定条款、订单payload、期限、元数据或接收地址不合规。', InvalidState: '操作不适用当前状态；ACTIVE不能退出本金，终止/赎回不能复活。', InvalidIds: '空/重复/超范围等ID输入或非法份额移动。',
  NotHolder: '当前调用者没有所需ID实际所有权；operator不等于持有者。', WrongValue: 'msg.value或有效资金不等于绑定ID的精确成本。', CompletionRequired: 'requireCompletion=true但执行时本次无法满额购买；整笔参与回滚。',
  UnavailableMarket: 'status给出固定市场检查结果，暂时性授权缺失/UNKNOWN不得直接视为永久撤单。', Unauthorized: '调用权限不符，例如非固定Factory终止或非赎回beneficiary领取残余。', NativePaymentFailed: 'BNB退款接收失败；销毁与账本一并回滚。', RewardBalanceDecreased: 'BEM余额/转账语义不符普通无扣税资产假设，不能将减少量当收入。', UnexpectedNFT: 'NFT身份、购买阶段收货或转移后所有者不符；不能仅信回调。',
  PurchaseFailed: '固定市场购买调用或结果失败，最后参与/铸造/付款全部回滚。', UnsupportedOrder: '订单超出V1子集或真实官方适配未启用；不要放宽参数强行通过。', IdentityMismatch: '外部协议代码/域等固定身份不符。', InvalidSignature: '原订单签名/Seaport认可状态不满足，不能替换签名域或counter。',
  BatchTooLarge: 'Factory批量终止超过明示上限。', ConfigurationChanged: '排队期间Factory当前template/configHash与用户expected值不同。', CreationPaused: '新池创建暂停；不影响旧池直接退出。', InvalidConfiguration: 'Factory批准配置不满足固定协议/模板约束。', InvalidGovernance: '治理角色、Timelock门槛或初始化身份不符。', InvalidTemplate: '零代码、非普通模板、runtime/初始化锁或版本检查失败。', InvalidPage: '分页参数无效，禁止无界全量遍历。', PoolAlreadyExists: '同轮/条款/salt池已存在；新轮次应使用新round。', UnknownPool: 'Factory未登记此Vault，不得代为终止。', InvalidMinimumDelay: 'Timelock零延迟/非法初始角色配置。',
};
const names = ['GroupBuyVault', 'GroupBuyFactory', 'MarketValidator', 'GovernanceTimelock'];
let output = '# 当前 ABI：事件与错误说明\n\n本文件从 `exports/*.abi.json` 的实际编译ABI生成签名和字段。字段名/类型/索引标记以这些文件为准；不是独立审计，也不代表链上已部署地址使用同一代码。`npm run export` 后运行 `node --import tsx sdk/generate-abi-guide.ts` 可重建。\n\n所有金额均为最小单位原始整数；读取实际BEM decimals，不写死18。区分交易回执事件与区块末状态，同块后续交易可能已改变后者。解码错误时保留已知selector与结构化参数；RPC未知/读取失败标UNKNOWN，不伪造取消或零余额。\n\n';
for (const name of names) {
  const raw = await readFile(resolve(ROOT, `exports/${name}.abi.json`), 'utf8');
  const abi = JSON.parse(raw) as { type: string; name?: string; inputs?: { name: string; type: string; indexed?: boolean }[] }[];
  output += `## ${name}\n\nABI SHA-256：\`${createHash('sha256').update(raw).digest('hex')}\`。\n\n`;
  for (const kind of ['event', 'error']) {
    const items = abi.filter(item => item.type === kind);
    output += `### ${kind === 'event' ? '事件' : '错误'}\n\n`;
    if (!items.length) { output += '当前ABI无此类型条目。\n\n'; continue; }
    output += '| 实际签名 | 字段与含义 |\n| --- | --- |\n';
    for (const item of items) {
      const args = item.inputs!.map(input => `${input.type}${input.indexed ? ' indexed' : ''} ${input.name}`).join(', ');
      const description = meanings[item.name!] ?? (item.name!.startsWith('ERC1155') ? 'OpenZeppelin ERC1155标准输入、余额、接收者或operator校验；参数为本次实际错误对象。' : item.name!.startsWith('Timelock') ? 'Timelock排程状态、依赖、调用权限或延迟检查失败；核对对应操作ID和当前read状态，不自动重发。' : item.name!.startsWith('UUPS') || item.name!.startsWith('ERC1967') ? 'Factory代理升级上下文/实现地址/槽位或非payable约束失败；不代表Vault具有升级入口。' : item.name === 'ReentrancyGuardReentrantCall' ? '共享重入保护拒绝跨入口重入。' : item.name === 'SafeERC20FailedOperation' ? 'BEM调用失败，token为失败资产；不能报告为零收益成功。' : item.name!.includes('Initialization') || item.name === 'NotInitializing' ? '初始化次数或上下文不符，模板/clone不能重复初始化。' : '实际ABI中的底层依赖错误；按结构化参数复核，不从该错误推断永久订单失效。');
      output += `| \`${item.name}(${args})\` | ${name === 'GroupBuyFactory' && item.name === 'Unauthorized' ? 'Factory调用者不是所需Timelock或guardian；具体角色取决于被调用函数，不能据此推断Vault资产管理权。' : description} |\n`;
    }
    output += '\n';
  }
}
output += '## 枚举、解码与索引边界\n\n`State`：0 FUNDING、1 PURCHASING（交易内）、2 ACTIVE、3 REFUNDABLE、4 REDEEMED。\n\n`MarketKind`：0 SEAPORT、1 CIRCUIT_RESERVED（真实官方适配禁用）、2 MOCK_CIRCUIT（仅显式本地Mock）。\n\n`MarketStatus`：0 EXECUTABLE、1 NOT_STARTED、2 EXPIRED、3 CANCELLED、4 FILLED、5 COUNTER_CHANGED、6 OWNER_CHANGED、7 APPROVAL_MISSING、8 PRICE_CHANGED、9 LISTING_ENDED、10 UNKNOWN。初始Seaport totalSize=0/totalFilled=0不是FILLED。\n\n市场检查的嵌套错误可能来自 `MarketValidator` 或外部Seaport/NFT/BEM，应以对应固定ABI解码；不能假装所有selector都属于Vault。构造交易只使用当前实际函数ABI，禁止把浏览器直接买NFT的任意to/data/value盲传给Vault。\n\nFactory事件是发现/索引来源，不是旧池执行身份的唯一信任来源：实际读取标准ERC1167 runtime、固定模板及validator codehash、Vault config/terms/payload commitments。URI/ApprovalForAll等继承ABI事件也不意味着存在owner管理权。\n';
await writeFile(resolve(ROOT, 'docs/ABI_EVENTS_ERRORS.md'), output);
