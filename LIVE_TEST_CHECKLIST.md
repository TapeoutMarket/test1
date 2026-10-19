# 小额实链测试：当前 NOT_RUN

本轮没有实链部署、参与、购买、转移或赎回授权。环境变量、已导入JSON、Mock通过、fork成功均不自动构成广播授权。本表交付未来逐笔使用的门槛。

## 发布前阻塞项

- 独立审查100份候选代码、实际模板runtime体积、完整compile/test/invariant/gas结果与编译锁定版本；本工具自检不是第三方审计。
- 用用户提供RPC和真实完整订单完成固定区块BSC fork。当前真实fork和live均NOT_RUN。
- 官方CircuitMarket现行实现/ABI未知，正式适配为CIRCUIT_RESERVED并禁用；代理地址/codehash固定不代表implementation固定，不能通过别的合约SLOAD核验代理槽。
- 核实Seaport当前信息、domain/version/codehash、签名/counter/status、零conduit实际授权、collection/Mining/BEM版本和普通无扣税BEM假设。
- Factory upgradeAdmin为真实Timelock合约，治理多签为proposer，延迟不低于确认值，Timelock拥有自身admin，guardian独立且不能绕过治理。检查真实角色与升级权限，不能只填标签。
- 核验固定GovernanceTimelock源码/runtime与不可变minimumDelayFloor、普通非代理部署、无外部bootstrap admin；guardian不得拥有PROPOSER_ROLE或DEFAULT_ADMIN_ROLE。Factory的接口形状检查不能证明一个仿冒controller是真的；多签也必须核实真实合约与控制权。
- Vault clone指向普通固定逻辑地址、初始化已锁定、无owner/升级/任意执行/管理提款。旧池参数与账本不随Factory新配置改变；保留募资阶段固定Factory终止权。

## 每笔独立授权

1. 用户具体指定操作、chain56、发送账户、目标Factory/Vault/template、完整订单与最大金额，明确gas预算和后果。
2. `MODE=live`、`ALLOW_LIVE_SEND=true`、`LIVE_RELEASE_VERIFIED=true`、显式`--broadcast`、终端逐字确认全部满足；默认值均不发送。
3. `EXPECTED_EXECUTION_CHAIN_ID=56`、`EXPECTED_TEMPLATE`与`EXPECTED_CODE_HASH`匹配；确认EXECUTION_RPC_URL为预定真实网络。live拒绝loopback URL及Anvil/Hardhat/Ganache等已知开发客户端。远程URL、chain56和客户端字符串本身仍不是独立主网证明。不要打印完整凭证URL。钱包密钥只来自用户单独配置的live环境，不放进JSON、浏览器、VITE_*、源码或报告。
4. `MAX_TX_FEE_BNB`与`MAX_TOTAL_TEST_SPEND_BNB`均为正且由用户批准。CLI采用保守累计预占本金+最高gas，锁文件防并发绕过；未知发送结果不释放预算、不自动重发。预算账本位于deployments/live-budget.json，不能擅自删掉以绕过限额。
5. 逐笔simulateContract、gas估算并预留20%，核对exact calldata hash、目标、金额和发送地址。known reject只模拟，不为失败证明损耗真实gas。
6. 精确确认文本包含操作、chain、from/to、value、gas/gasPrice、calldata hash及manifest hash；配置文件不是授权。不自动连发下一笔。确认后、签名前重新加载manifest并核验链上身份、网络与模拟。

## 已审阅身份清单

所有live操作（含dry-run）必须提供仓库内JSON `LIVE_MANIFEST_FILE`及`EXPECTED_MANIFEST_HASH`。后者为文件完整UTF-8字节的keccak256，包含末尾换行；必须来自用户另行确认的审阅结果，不能由CLI读取未知文件后自我批准。严格字段以`sdk/live-identity.ts`的`liveManifestSchema`为准，未知字段被拒绝，不接受productionReady等公开标签替代证据。

- `network`：独立审阅的BSC checkpointBlock/checkpointHash。RPC必须返回该区块hash；这可排除不匹配的网络，不能证明运营方未伪造RPC或未隐藏后续fork。
- `factory`：proxy地址/runtime codeHash及实际implementation地址/runtime codeHash；Factory操作使用RPC读取EIP-1967槽交叉核验。
- `template`：固定普通实现地址/runtime codeHash、其immutable MarketValidator地址及runtime codeHash。Vault严格识别标准ERC1167完整runtime并提取implementation，不能只核clone codehash或公开模板标签。
- `config`/`configHash`、`dependencies`：完整不可变Config与collection/Mining/BEM地址和runtime codeHash；校验Vault存储配置及重算hash。真实官方市场仍禁用，mockOnly必须false。
- `vault`：地址、runtime codeHash、creator、termsHash、完整purchasePayload的payloadHash和round；新池还核对Factory预测地址及创建参数。
- `governance`：Timelock/多签的实际runtime、独立guardian、正数minimumDelay、已审阅角色历史的固定区块/hash及审阅报告hash。自动检查delay floor、self-admin及已知关键角色；报告hash只是对外部审阅的承诺，CLI不自行证明完整角色历史、多签成员或源码可信性，须人工完成。

codeHash均针对实际部署runtime。编译artifact中的immutable占位值与实际部署字节不同，不能直接拿`exports/contracts.json`的runtimeArtifactHash充当部署codeHash。对代理外部依赖还要另行审阅其implementation/升级控制权；runtime hash不锁定代理语义。

直接退款、普通领取、无harvest赎回及残余领取只核固定Vault/模板/配置身份，不要求Factory、市场、Mining或validator当前可用；不得因Factory暂停、升级或外部依赖故障关闭用户直接退出路径。创建/参与/harvest/正常赎回另查相关依赖，Factory操作另查治理。

## 指定资产与公开卖单

不得为了测试自动将真实矿机低价公开挂牌，不撤销他人订单，不自动给其他账户充值。公开订单可能被第三方先成交，不能承诺“只有测试钱包买”。购买输入需冻结完整payload；最后参与者使用requireCompletion保护，市场变动则回滚，不替换订单或加钱。

Vault才是市场调用者/收货者。先核验模板、Factory proxy与新clone，再由用户选择有限金额订单逐笔测试。Factory只登记，不集中保管用户本金、矿机或BEM。

## 成功回执之后

- 核对原hash、success、from/to、chain、canonical block；替换或超时先查链，禁止盲目重发。
- 新池：PoolCreated中的creator/template/configHash与请求一致，clone FUNDING、零售出份额。
- 参与：指定ID给真实参与者，effective funds正确；满额原子ACTIVE，矿机owner=Vault，不留满额FUNDING。
- 退出：本人ID销毁、实际本金给指定recipient；其他用户原权益不变。
- 领取：RewardClaimed按ID累计；BEM Transfer按实际收款对账，普通claim无Harvested。钱包总余额/BNBgas不冒充收益。
- 转移：ERC1155真实余额和holderOf相符，claimed不清零；正数可领权益前后连续。
- 赎回：只有100份实际持有者，全部份额销毁，固定beneficiary，NFT已交付；no-harvest不宣称已支付未知BEM，恢复后残余给固定受益人。
- 保留各笔前后固定区块原始余额和事件；同块末态含其他交易，不能把普通块余额差当作本笔支付。SDK回执后检查如失败状态为REQUIRES_REVIEW，不宣称成功、不自动重发。

如发现异常，停止新增参与并复核；guardian最多对FUNDING触发不可逆退款状态，不能提走用户资产、冻结直接退出或接管ACTIVE矿机。不可升级Vault的代码缺陷不能承诺事后管理员修复。
