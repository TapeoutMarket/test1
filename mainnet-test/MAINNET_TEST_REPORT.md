# BSC 主网购买与收益测试进度

初始记录：2026-10-19；最终实测更新：2026-10-20（北京时间）。**部署、多签配置及十一笔测试交易均已主网成功，均经过至少15个区块确认，journal均为CONFIRMED。矿机#3204仍由ACTIVE Vault持有，总成交额0.303 BNB。初始creator/B认购67/33份，第10笔转移#1给B后持份为66/34。上一轮同批67/33收益分配PASS：入账0.13665485 BEM，creator/B分别实收0.09155818/0.04509582 BEM。第9–11笔未领权益转移测试也PASS：新入账0.00032254 BEM，加旧余数后每份形成0.00000323 BEM权益；#1转移后权益及历史claimed保持，creator被NotHolder拒绝，B实际领取该0.00000323 BEM。最终回执区块128591816，Vault余额0.00032016 BEM，其他99份各保留323 raw权益。归集赎回及失败退款尚未执行。**

本轮全部授权测试已完成。权益转移的三笔真实回执、100份账本、原始NotHolder错误字节、预算及费用均经独立审计PASS，最终离线CLI实际运行PASS/exit0。21项新增发送器测试、714项合并回归和9项新增离线对账测试全部通过。完整逐笔证据和结果见 [BEM_ENTITLEMENT_TRANSFER_REPORT.md](../mainnet-entitlement-transfer/BEM_ENTITLEMENT_TRANSFER_REPORT.md)。

## 已完成的真实治理

状态检查：[governance-inspection-1792420701946.json](../live-test/observations/governance-inspection-1792420701946.json)，检查点区块 128571518，`ALREADY_EXECUTED`，`creationPaused=false`，选中的模板和配置与本次部署相符。

实际回执证据：[governance-receipts-1792421032178.json](observations/governance-receipts-1792421032178.json)。两笔均 success，至少 15 个确认；四项 Timelock 调用的目标、value、payload、顺序均匹配。Safe `ExecutionSuccess` 及 Timelock 事件证明实际执行成功；本脚本未独立恢复每个 owner 的签名。

| Safe 操作 | 主网交易 | 实际 gas 费用 BNB |
| --- | --- | ---: |
| scheduleBatch | `0x6dbd7c4c1b0b3fe9fe5d6f9c5e1401509bbc420460919c225dd55cd8cb5505df` | 0.00000801223394 |
| executeBatch | `0x4ec7f4c6dbbb750ca5c82ed38bafb9bdee47d3ee94e347425369508b0797aea7` | 0.0000270332578 |

两笔间隔 **1,453 秒**，满足 600 秒延迟。外层交易均由 `0x15c059a5acb36142eea576bdbc0330fd7e9d3099` 向既定 Safe 发送。以上费用由该外层执行者支付，未计入 creator/A/B 的部署预算账本；此前四笔部署实际费用仍为 0.00054914865 BNB。

## 本轮固定订单与初始认购份额

| 项目 | 值 |
| --- | --- |
| 网络 | BSC 主网，chainId 56 |
| 矿机 collection | `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C` |
| 矿机 ID | 3204 |
| 卖家 A | `0x1b55E6A757987576E1a130A011f9E12498De7DB9` |
| Seaport | `0x0000000000000068F116a894984e2DB1123eB395` |
| 卖家收款 | 0.3 BNB |
| 费用及接收人 | 0.003 BNB，creator |
| 买家总付款 | 0.303 BNB，另加 gas |
| creator | ID 1–67，共 67 份，0.20301 BNB |
| B | ID 68–100，共 33 份，0.09999 BNB |
| 募资截止时间 | 2026-10-20 22:36:11，北京时间 |
| 订单截止时间 | 2026-10-20 22:41:11，北京时间 |
| 已创建 Vault | `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| orderHash | `0xe7f4a836c7eee681eb2cced9357e0b54848ee79f1a4b95a058c154907fef07cd` |

上表67/33为初始认购分配。第10笔确认后，creator持有#2–67，B持有#1及#68–100，合计66/34份。

冻结会话：[session.json](session.json)，hash `0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c`。

完整订单：[order-envelope.json](order-envelope.json)；身份清单：[live-manifest.json](live-manifest.json)，hash `0x3a041e534d6a14c3173b084d6d1d17f36ed45bcf7f36cc1ff3756e3d25964113`。清单通过 SDK 身份核验，绑定预测 clone、模板、配置、订单 terms/payload 及治理审阅检查点；它不代表 clone 已部署或购买完成。

最初的只读准备证据：[readiness.json](readiness.json)，其中未授权状态是执行前的历史快照。第二笔订单确认完成时的历史回执区块 128575509：A 仍持有矿机，Seaport 已获得 #3204 单独授权，未授予 collection-wide approval；新订单已经 validate，未取消、未成交，`signature=0x`。本轮由 A 在链上 validate，沿用 fork 已验证的顺序。FULL_OPEN 订单可被其他买家成交，没有为本池保留买家限制；本轮不向市场发布订单或写数据库。

矿机授权针对 #3204，不是整个 collection，但不限定 orderHash，任何仍有效的该矿机 Seaport 订单也可能使用授权。

## 余额、顺序和首笔计划

主网区块 128571566 的余额：creator 0.20428658555 BNB，A 0.0049597677 BNB，B 0.1148789795 BNB。两位买家的本金充足，扣本金但未扣后续 gas 的余量分别为 0.00127658555 和 0.0148889795 BNB。每笔签名前仍重新检查余额、nonce 和报价。

| 顺序 | 动作 | 当前证据 |
| --- | --- | --- |
| 1 | A approve(Seaport, 3204) | 主网成功，区块 128574540，至少 15 个确认；实际费用 0.0000028134 BNB |
| 2 | A Seaport.validate(order, signature=0x) | 主网成功，区块 128575509，至少 15 个确认；实际费用 0.0000034334 BNB |
| 3 | creator createPool | 主网成功，区块 128576858，至少 15 个确认；实际费用 0.0000692677 BNB，初始空池和固定 clone 身份核验通过 |
| 4 | creator contribute IDs 1–67，requireCompletion=false | 主网成功，区块 128578206，至少 15 个确认；本金 0.20301 BNB，实际 gas 费用 0.0001774711 BNB；完整 67 份铸造与入池金额核验通过 |
| 5 | B contribute IDs 68–100，requireCompletion=true | 主网成功，区块 128579551，至少 15 个确认；本金 0.09999 BNB，实际 gas 0.000101148 BNB；同笔购机及完整 67/33 份额均核验通过 |
| 6–8 | harvest、creator领取67份、B领取33份 | 均已主网确认，同批67/33分配与余数守恒PASS，见收益报告 |
| 9 | 新 harvest，形成 #1 转移前未领取收益 | 主网确认，区块128589337；新增0.00032254 BEM，每份待领0.00000323 BEM；实际gas 0.00000760315 BNB |
| 10 | creator将份额#1转给B | 主网确认，区块128590538；权益保持323 raw、creator严格NotHolder；实际gas 0.00000344225 BNB |
| 11 | B领取转移后的#1 | 主网确认，区块128591816；实收323 raw，其他99份保留；实际gas 0.0000040223 BNB |
| 后续 | 归集赎回及失败退款 | 尚未在本轮主网执行 |

首笔冻结计划：[seller-approve-7085fc34cae1d26f37d74391df3cb29c8688fcfa7db60d472786a6258742eac7.json](plans/seller-approve-7085fc34cae1d26f37d74391df3cb29c8688fcfa7db60d472786a6258742eac7.json)。nonce=5，value=0，gas 估算 57,074，加 20% 余量为 68,489，gasPrice=0.05 gwei，费用上限 **0.00000342445 BNB**。

既有部署预算预留 0.00066448855 BNB 未重置。第一笔后的最大预留为 0.000667913 BNB；第二笔确认后为 **0.0006720844 BNB**，低于沿用的 0.0015 BNB 累计限额；这是第二笔完成时的历史限额，当时尚未纳入本金；第四、第五笔随后分别确认本金、gas 和扩大后的累计预算，截至购机的预算见第五笔章节；第9笔以后的预算见末尾权益转移测试章节。

## 本地验证与执行入口

新增脚本隔离在 `mainnet-test/`，未修改已部署合约、SDK/CLI、历史部署运行时或 SESSION_PLAN。旧 core hash 为 `9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba`，bootstrap hash 为 `c8941190c7f030d61537600dbc1d194e6a92349fc7395c590ff3e814bf971361`，重新核验均未变化。

初版相关测试 **69/69 PASS**：订单/身份准备 4 项、Safe 回执匹配 9 项、卖家逐笔发送保护 56 项。覆盖错误治理/费用绑定、独立 Safe 日志格式、修改 nonce/报价/目标、缺少确认、重复发送恢复、累计预算、首次目录及符号链接边界。修复了 Safe 事件 indexed 声明和首次 journal 目录创建问题，修复前均未发送交易。事件声明对照 [Safe 1.4.1 官方源码](https://raw.githubusercontent.com/safe-global/safe-smart-account/v1.4.1/contracts/Safe.sol)。新版的 138 项结果见下方第二笔准备记录。

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-test/*.test.mjs

# 两笔卖家交易已成功；以下只读复核第二笔既有 hash，不再次发送。
node --import tsx mainnet-test/send-step.mjs --env ../.env \
  --session mainnet-test/session.json --step seller-validate --public-rpc-fallback --reconcile
```

广播另需 `--broadcast`、计划 hash、明确预算、live 开关和真实交互终端逐笔确认。脚本先持久化预算/journal，才读取 A 的签名密钥；签名后先记录 hash，再最多广播一次。报价、nonce、代码或参数变化会停止并保留预算；结果未知仅用 `--reconcile` 核验已记录 hash，不能删除状态后重试。

当前 `send-step.mjs` 只支持两笔卖家交易。建池已有独立的 `mainnet-pool/create-pool.mjs`，creator 67 份认购已有 `mainnet-funding/creator-contribute.mjs`，沿用身份、预算和回执核验，并重新执行 `verifyLiveIdentity`。B完成认购已有独立的`mainnet-completion/buyer-b-complete.mjs`，收益入口`mainnet-rewards/rewards.mjs`及权益转移入口`mainnet-entitlement-transfer/entitlement.mjs`的各三笔均已按逐笔批准执行并验证成功。已有记录再次执行只核对原hash，不授权新的签名。赎回入口仍须另行准备与审阅，不能将旧CLI的广播流程视为已具备这些保护。

## 第一笔授权的执行与恢复记录

用户明确确认了 A nonce=5、gasLimit=68,489、gasPrice=50,000,000 wei、value=0 的 approve(Seaport,3204)。执行前冻结计划核对通过，并按原参数签名，保存交易 hash：`0x7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416`。

签名后的检查或提交过程返回 `STOPPED_RECONCILE_ONLY`，没有出现 `SUBMITTED`。原错误细节未被该版本 sender 保存，无法确定具体失败步骤，不能据此判断从未广播。原 journal 和预算完整保留，未创建第二笔交易或重置预留。

只读 `--reconcile` 返回 `TRANSACTION_OR_RECEIPT_NOT_AVAILABLE`。随后两路 RPC 的检查见 [seller-approve-recovery-1792421377029.json](observations/seller-approve-recovery-1792421377029.json)：两路均暂未查到该 hash 或回执，A 的 latest/pending nonce 都为 5，矿机仍由 A 持有且授权为零。重新模拟和报价与原计划全部相同。这些是当时的观察，不构成原请求从未到达任何节点的证明。

恢复方案只允许复用原预算、原 nonce/参数，重构出的签名交易 hash 必须与上述已记录 hash 完全一致；不加价、不增加 nonce，也不以删除旧状态的方式重试。

### 恢复与回执核验结果

恢复工具新增的独立 RPC 模拟发现兼容性问题：不带 gas、带 gasPrice 的 `eth_call` 报余额不足，加入原计划的 gas=68,489 后通过；真实余额充足，独立估算仍为 57,074。这解释的是恢复预检问题，不能据此确定原 sender 签名后停止的原因。随后配置中的主 RPC 多次只读超时，因此显式选用 [BNB Chain 官方文档列出的](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/) `https://bsc-dataseed.defibit.io`，并以 `https://bsc-dataseed.bnbchain.org` 交叉核验。未修改 `.env`，没有自动切换或自动广播重试。

恢复前证据：[preview-1792421998297.json](../mainnet-recovery/preview-1792421998297.json)。两路均未观察到原 hash，latest/pending nonce 均为 5；链身份、冻结区块、协议代码、owner/approval、订单状态、模拟、估算和报价全部匹配原计划。恢复工具 **58/58 离线测试通过**，经独立代码审阅；运行文件 hash 为 `0x381edc88008328531cbb297bf9a35c325b83c4863749d00ef38c1f4c2d9227bc`。

| 回执字段 | 已核验结果 |
| --- | --- |
| 唯一交易 hash | [0x7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416](https://bscscan.com/tx/0x7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416) |
| 区块 | 128574540 |
| 区块 hash | `0x247d47cdf26e827119b89bd29f3d57cdaa57ef413050b9f11b604b5809e5cac0` |
| 状态 | success，至少 15 个区块确认 |
| gasUsed / effectiveGasPrice | 56,268 / 50,000,000 wei |
| 实际费用 | 2,813,400,000,000 wei = **0.0000028134 BNB** |
| 回执区块矿机 owner | A，未转移 |
| getApproved(3204) | 既定 Seaport 地址 |
| isApprovedForAll(A,Seaport) | false |
| A latest / pending nonce | 6 / 6 |
| 新订单状态 | 未 validate、未取消、未成交 |

恢复记录和完整回执：[attempt-7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416.json](../mainnet-recovery/attempt-7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416.json)。确定性重签得到原 hash，只在恢复入口调用一次发送；原始 sender 是否曾触及广播仍未知，链上仅确认同一笔交易。未增加预算预留，累计最大预留保持 **0.000667913 BNB**；四笔部署加本笔实际费用合计 **0.00055196205 BNB**，不含 Safe 外层执行费用。

原 sender 随后使用只含公共 RPC、没有任何密钥的 `mainnet-recovery/public-readonly.env` 执行 `--reconcile`，原 [journal](transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) 已标记 `CONFIRMED`，该核验没有再次发送交易。

第一笔执行时的三个 sender 运行文件和对应测试已经保存为 [original-seller-runtime-642f174ac0c72794.tar.gz](../mainnet-recovery/original-seller-runtime-642f174ac0c72794.tar.gz)，不包含环境变量或密钥。归档 SHA-256：`99228989412f6b9dbf4046a61381a6df5adbaf5ea99b8dc4dcb9491f022ebae3`。第二笔单独冻结了更新后的运行文件 hash 与交易计划，并保留这份旧版本证据。

## 第二笔订单确认：已主网确认

为了继续使用公共备用节点，正常 sender 增加了显式 `--public-rpc-fallback`，在计划、精确确认文本和 journal 中绑定 RPC 模式与公开端点；不会自动切换。预检先独立估算 gas，再按同一报价和 20% 余量进行有界 `eth_call`，避免公共节点采用过大的默认 gas。失败时输出脱敏的具体阶段，仍然保留签名 hash/预算并禁止自动重发。

新 sender 运行文件 hash：`1100bae4d7187352114434a73efba06e31af0521fa149385ed616a55203d0c2c`。core、bootstrap、session 和原交易证据均未变化。第二笔发送前的独立审阅及本地合并回归 **138/138 PASS**：准备 4、Safe 回执 9、sender 67、历史恢复单元测试 58。这是发送前的历史运行结果，后续新增测试以新的运行记录为准。历史恢复工具固定旧 sender hash，因此不会在新版运行文件上再执行恢复；第一笔已经完成，不需要再次运行它。

第二笔冻结计划：[seller-validate-9be87271f1183c6b9828da5871b82fc05a403c2fad047ff6a14c92a2eff13f5d.json](plans/seller-validate-9be87271f1183c6b9828da5871b82fc05a403c2fad047ff6a14c92a2eff13f5d.json)。计划 hash：`0x9be87271f1183c6b9828da5871b82fc05a403c2fad047ff6a14c92a2eff13f5d`。

| 字段 | 已获用户批准并执行的冻结值 |
| --- | --- |
| chainId / 发起人 / nonce | 56 / A / 6 |
| 目标 | Seaport `0x0000000000000068F116a894984e2DB1123eB395` |
| 调用 | `validate` 本次完整 #3204 订单，`signature=0x` |
| value | 0 BNB |
| gas 估算 / gas 上限 | 69,523 / 83,428 |
| gasPrice | 50,000,000 wei = 0.05 gwei |
| 本笔费用上限 | **0.0000041714 BNB** |
| 本笔后累计最大预留 | **0.0006720844 BNB**，上限仍为 0.0015 BNB |
| dataHash | `0x2dd7ee4eccf1be846a8991e6bf007e9abc08db112f532454dffb81b9dbd08ac1` |
| 订单经济条款 | 卖家 A 收 0.3 BNB；creator 收 0.003 BNB；买家成交时共付 0.303 BNB |
| 订单截止 | 2026-10-20 22:41:11，北京时间 |

发送前只读预检区块 128575158：矿机仍属于 A，单 token 授权正确，订单当时尚未 validate/取消/成交，A latest/pending nonce 为 6。原授权回执重新核验通过，第二笔模拟与估算通过。用户单独批准该笔后，sender 按冻结参数重新检查并签名、发送；本笔正常完成，未进入重复广播或恢复流程。

| 回执字段 | 已核验结果 |
| --- | --- |
| 交易 hash | [0x85dc9802961954ca78a54aa54631bd6b5aa7c001ed916f455ef89292086496b0](https://bscscan.com/tx/0x85dc9802961954ca78a54aa54631bd6b5aa7c001ed916f455ef89292086496b0) |
| 区块 | 128575509 |
| 区块 hash | `0x91550b47699d186c219dee3805df14add457f96884ed6a715f7549d3f7a3a10d` |
| 状态 | success，至少 15 个区块确认 |
| gasUsed / effectiveGasPrice | 68,668 / 50,000,000 wei |
| 实际费用 | 3,433,400,000,000 wei = **0.0000034334 BNB** |
| Seaport orderStatus | `[true,false,"0","0"]`：已 validate、未取消、未成交 |
| 矿机 / 授权 | owner=A；getApproved(3204)=既定 Seaport；isApprovedForAll=false |
| A latest / pending nonce | 7 / 7 |

完整证据见原 [journal](transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) 的 `seller-validate` 项，状态 `CONFIRMED`。两笔卖家交易的实际费用合计 **0.0000062468 BNB**；四笔部署加两笔测试实际费用合计 **0.00055539545 BNB**，不含 Safe 外层执行费用。共享账本累计最大预留为 **0.0006720844 BNB**；预留没有按实际 gas 回减。

第二笔完成后准备了 creator `createPool`，其随后获用户单独批准并已执行成功，具体见下节。

67/33份出资和退款的代码入口及检查清单见[POOL_TEST_NEXT_STEPS.md](POOL_TEST_NEXT_STEPS.md)。creator 67份及B 33份出资、购买、同批收益领取以及未领权益转移测试均已完成；归集赎回及失败退款实链步骤仍为 **NOT_RUN**。

## 第三笔创建拼单池：已主网确认

新增 [create-pool.mjs](../mainnet-pool/create-pool.mjs) 和 [使用说明](../mainnet-pool/README.md)，仅支持本次固定 `createPool` 动作。它不修改已部署合约、SDK、前两笔运行文件、冻结订单或治理配置。脚本复用全局锁、预算和签名前记录流程；核验两笔卖家交易的真实回执、Factory 代理及实现、Timelock/配置/模板、矿机/BEM/Mining 代码、订单可执行性和 CREATE2 预测地址。创建后以同一份已验证回执核对两条创建事件、clone 代码及零出资 FUNDING 状态。

新目录测试 **150/150 PASS**（动作、事件、预览及预算 135 项；独立回执检查 15 项）。联合回归 **289/289 PASS**：准备 4、Safe 回执 9、seller sender 67、历史恢复 59、建池 150。新增的历史恢复测试使用独立历史 fixture，后续成功交易不会再改变其单笔恢复测试条件；真实 journal/预算未修改。

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-test/*.test.mjs mainnet-recovery/*.test.mjs mainnet-pool/*.test.mjs

# 默认只读；不会签名或广播。
node --import tsx mainnet-pool/create-pool.mjs --env ../.env \
  --session mainnet-test/session.json --public-rpc-fallback
```

冻结计划：[create-pool-160202869ab4bf0f4468613d2d5328bd9bc5bbf82a04783e24c6ed33f1f3528d.json](../mainnet-pool/plans/create-pool-160202869ab4bf0f4468613d2d5328bd9bc5bbf82a04783e24c6ed33f1f3528d.json)。计划 hash：`0x160202869ab4bf0f4468613d2d5328bd9bc5bbf82a04783e24c6ed33f1f3528d`；新运行文件 hash：`c6e3f405ac75a0aa40d8d053cb1dc908797feed96bac56f889a1aaa6bd4fa601`。

| 字段 | 已获用户批准并执行的冻结值 |
| --- | --- |
| 网络 | BSC 主网，chainId 56 |
| 发起人 / nonce | creator `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` / 9 |
| 目标 Factory | `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1` |
| 预测并实际创建的 Vault | `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| 固定模板 | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` |
| 名称 / 轮次 | TapeOut3204-mainnet-67-33 / 1 |
| value | 0 BNB；该笔只创建池，本金出资在后续交易 |
| gas 估算 / gas 上限 | 1,409,680 / 1,691,616 |
| gasPrice | 50,000,000 wei = 0.05 gwei |
| 本笔费用上限 | **0.0000845808 BNB** |
| 本笔后累计最大预留 | **0.0007566652 BNB**，累计上限仍为 0.0015 BNB |
| dataHash | `0xf14c984f3e1de0f02811289d31eb755844b33b0df31a2002e349d4540879375f` |
| 募资截止 | 2026-10-20 22:36:11，北京时间 |

正式只读计划的状态区块为 128576203：creator latest/pending nonce 均为 9、余额 0.20428658555 BNB；当时预测池无代码且未登记；矿机仍在 A，授权正确，订单已 validate 且未成交。Factory/治理/依赖身份、两笔前置回执、订单协议检查、独立估算与有界调用模拟均通过。用户单独批准后，签名前及广播前复核冻结参数和报价，按原 nonce 和费用上限发送一次；没有重发或恢复。

| 回执字段 | 已核验结果 |
| --- | --- |
| 交易 hash | [0x391c7bbee1c93025675055f0f26b7a8c8913a5333fea167b50115265efc11aca](https://bscscan.com/tx/0x391c7bbee1c93025675055f0f26b7a8c8913a5333fea167b50115265efc11aca) |
| 区块 / 区块 hash | 128576858 / `0x820739f8f2cd8cb2c0aba2588679f18507a2428cbe7857be8fe9844a42d4f7c6` |
| 状态 | success，至少 15 个区块确认 |
| gasUsed / effectiveGasPrice | 1,385,354 / 50,000,000 wei |
| 实际费用 | 69,267,700,000,000 wei = **0.0000692677 BNB** |
| 创建事件 | 恰一条 Factory `PoolCreated` 与一条 Vault `VaultInitialized`，creator、模板、配置、terms、salt 和 payload 均匹配 |
| clone runtime hash | `0x61c1667856d7a9eb0d4f00dcc26f4123847f223500db9b9c5de567a2d28bee18`，标准 ERC-1167 指向既定模板 |
| 初始状态 | Factory 已登记；state=FUNDING(0)、soldCount=0、fundedWei=0、totalPrincipalIn=0 |
| 矿机 owner | 仍为 A |
| 回执区块 creator 余额 | 0.20421731785 BNB |

完整回执与业务核验：[建池 journal](../mainnet-pool/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json)。创建的 Vault 没有资产管理 owner、不可升级；本笔没有购买矿机或收取认购本金。共享账本累计最大预留为 **0.0007566652 BNB**，保留所有历史预留；四笔部署加三笔测试的实际费用合计 **0.00062466315 BNB**，不含 Safe 外层执行费用。建池后再次运行相关 289 项回归，全部通过。

creator 随后认购 ID 1–67，value=0.20301 BNB，nonce 10，已按单独批准执行成功，见下节。签名前明确告知 `requireCompletion=false` 仅表示不要求本笔凑满；公开池若被第三人抢先认购其他 33 份，仍可能触发购买。本次实际回执证明没有发生该竞态，结果为预期的 67 份 FUNDING 状态。

## 第四笔 creator 67 份认购：已主网确认

新入口：[creator-contribute.mjs](../mainnet-funding/creator-contribute.mjs)；[说明](../mainnet-funding/README.md)；[验证记录](../mainnet-funding/validation.json)。该入口只实现第四笔；当时仅批准 creator 出资，B 随后在第五笔单独获得批准并执行。新目录 **183/183 PASS**（业务 134、读取并发 6、创建回执前置 43），完整相关回归 **472/472 PASS**，经独立审阅。主只读 RPC 的全局并发上限为 8，每请求仅执行一次。

最初正式预览在重复读取建池区块 storage 时遇公共 RPC 历史状态不可用，见 [失败记录](../mainnet-funding/observations/creation-history-pruned-preview.json)；该尝试未签名、未广播、未增加预留。新入口改为重新核对旧建池 canonical 交易、15 确认、精确 gas/nonce/value/calldata 和完整创建事件，当前 clone/config/完整 100 个 ID/空池则独立读取最新固定区块。原建池状态证据继续保留；计划明确 `historicalStorageRechecked=false`，不声称本次重新读取了旧 storage。此修复未修改已发送交易使用的任何运行文件。

正式计划：[creator-contribute-7c913cd7dab07b9fc12dff5da6ef83cc0b5e2e76c570010e0ad71c95bbe7b644.json](../mainnet-funding/plans/creator-contribute-7c913cd7dab07b9fc12dff5da6ef83cc0b5e2e76c570010e0ad71c95bbe7b644.json)。计划 hash `0x7c913cd7dab07b9fc12dff5da6ef83cc0b5e2e76c570010e0ad71c95bbe7b644`，运行文件 hash `d0d56d26a25f63369b4982670097bdd28f9161057a102206e2ad94fc824e5542`。

| 字段 | 已获用户批准并执行的冻结值 |
| --- | --- |
| 网络 / 发起人 / nonce | BSC 56 / creator / 10 |
| 目标 | Vault `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| 调用 | `contribute([1…67], false, 原冻结 payload)` |
| 本金 value | **0.20301 BNB**，67 份 × 0.00303 BNB |
| gas 估算 / 上限 | 3,610,942 / 4,333,131（20% 余量） |
| gasPrice | 50,000,000 wei = 0.05 gwei |
| 本笔 gas 费用上限 | **0.00021665655 BNB** |
| 本笔本金加 gas 最大支出 | **0.20322665655 BNB** |
| 本笔后累计最大预留 | **0.20398332175 BNB**，含所有历史预留与本笔本金 |
| 已批准累计预算 | **0.20451 BNB** = 原 gas 预算 0.0015 + 本次本金 0.20301；不包含 B 后续本金 |
| dataHash | `0x573a807f44e97b3bb2dbe5c403b75fec2a868beaf685a8e01beaf94494b4ccf1` |

正式预览观察区块 **128577738**，hash `0xe62b24082814909682e5eb75c664c80f210b5726c7ada5b2e1a780cf4647c47c`：creator latest/pending nonce 均为 10、余额 **0.20421731785 BNB**；池为 FUNDING，完整 100 份均未占用，矿机仍在 A，订单已 validate 且未成交。前序回执、当前 clone/依赖身份、每份成本、订单可执行性、gas 估算及有界模拟全部通过。这是只读结果，不是出资成功证明。

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-test/*.test.mjs mainnet-recovery/*.test.mjs mainnet-pool/*.test.mjs mainnet-funding/*.test.mjs

# 仅只读预览；实际发送仍需用户逐笔批准。
node --import tsx mainnet-funding/creator-contribute.mjs --env ../.env \
  --session mainnet-test/session.json --public-rpc-fallback
```

本笔无需 Safe 签名，creator 自行认购。用户批准本金、gas 与累计预算后，发送前再次核对 nonce、完整空池、代码和报价，按冻结参数发送一次，未重试或恢复。

| 回执字段 | 已核验结果 |
| --- | --- |
| 交易 hash | [0xc6318e68d9433b597bd9d3296478fd328c4cf77eb6fe9c2802e3cfd483e37abd](https://bscscan.com/tx/0xc6318e68d9433b597bd9d3296478fd328c4cf77eb6fe9c2802e3cfd483e37abd) |
| 区块 / 区块 hash | 128578206 / `0x4409f58ca8df8119a6282e6ee936bbcf1d50a70feac0e13a0e9e87680014dd99` |
| 状态 | success，至少 15 个区块确认 |
| gasUsed / effectiveGasPrice | 3,549,422 / 50,000,000 wei |
| 实际 gas 费用 | **0.0001774711 BNB** |
| 实际转入本金 | **0.20301 BNB** |
| 铸造与权益 | 恰一条 `TransferBatch` 从零地址铸造 ID 1–67 给 creator，数量全为 1；对应完整 `Contributed` 匹配；其他 33 个 ID 仍为空 |
| 池状态 / 原生余额 | FUNDING(0)、soldCount=67、fundedWei=totalPrincipalIn=Vault 原生余额=0.20301 BNB |
| 购买/退款 | purchaseSpent=0、totalPrincipalRefunded=0，没有 `Purchased` 事件，矿机仍由 A 持有 |
| 回执区块 creator 余额 | **0.00102984675 BNB** |

完整 [认购 journal](../mainnet-funding/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) 已保存。四笔部署加四笔测试的实际 gas 合计 **0.00080213425 BNB**，另有本金 **0.20301 BNB**；Safe 外层执行者的费用单列。共享账本累计最大预留为 **0.20398332175 BNB**，不按实际 gas 回减。

下一步为 B 使用 nonce 4 认购 ID 68–100，支付 0.09999 BNB、`requireCompletion=true`，同一笔将凑齐 100 份并自动执行购机。独立发送器、完整回执验证、离线测试和正式只读报价完成后，用户已批准第 5 笔；现已执行成功，见下节。

## 第五笔 B 33 份认购并购机：已主网确认

入口：[buyer-b-complete.mjs](../mainnet-completion/buyer-b-complete.mjs)，[操作说明](../mainnet-completion/README.md)，[验证记录](../mainnet-completion/validation.json)。新增 **159/159** 离线测试通过，完整相关回归 **631/631** 通过；作者、独立审阅者及主代理复核一致。旧 sender、session、manifest、源码和 ABI 未修改。

正式只读计划：[冻结计划](../mainnet-completion/plans/buyer-b-complete-c8a6ec4abd225407dbda632d68434f259044643a2b39b23229cc024babf8af8c.json)，hash `0xc8a6ec4abd225407dbda632d68434f259044643a2b39b23229cc024babf8af8c`；新工具 hash `120eb2234a7fb92585a3f3721f57eba74b2df9b7fcb66f531d67ce3c58630b49`。主代理重新计算原始计划文件哈希、运行文件哈希和预算算术，全部匹配。

| 字段 | 已获用户批准并执行的冻结值 |
| --- | --- |
| 网络 / 发起人 / nonce | BSC 56 / B / 4 |
| 目标 Vault | `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| 调用 | `contribute([68…100], true, 原冻结 payload)` |
| 本金 | **0.09999 BNB** |
| gas 估算 / 上限 | 2,077,724 / 2,493,269（20% 余量） |
| gasPrice | 50,000,000 wei = 0.05 gwei |
| 本笔 gas 费用上限 | **0.00012466345 BNB** |
| B 本金加 gas 最大支出 | **0.10011466345 BNB** |
| 本笔后累计最大预留 | **0.3040979852 BNB** |
| 已批准累计预算 | **0.3045 BNB** = 全部本金 0.303 + 原 gas 预算 0.0015 |
| calldataHash | `0xa882e97b7b1ef72a1f182255615ebb73147e4bd4bad9c629076a01fb5ce851ba` |

正式观察区块 **128578977**，hash `0x1809dd716fca87725bec31c1eb99940a1cae0a9478ca05dc48465588fae9e848`；B latest/pending nonce 都为 4，余额 **0.1148789795 BNB**。池为 FUNDING、已售 67、原生余额和累计本金均为 0.20301 BNB；1–67 完整归 creator，68–100 全部空闲。矿机仍归 A，单独授权为 Seaport，订单已 validate 且未成交；原四笔 canonical 回执、当前 clone/依赖身份、订单可执行性、gas 估算及有界模拟全部通过。历史交易前置只复核回执与事件，当前状态独立检查，不依赖已裁剪的历史 storage。

本笔批准的执行预期为原子完成 100 份并购买 #3204：卖家 A 收款 0.3 BNB、creator 收手续费 0.003 BNB，矿机转入 Vault，最终 creator/B 各持有 67/33 份；没有额外 execute-purchase。变化或失败导致整笔 B 认购回滚并消耗 gas；creator 已入池本金不会因此自动退款。成功回执必须精确匹配完整 Seaport consideration、矿机转移、33 份铸造与 Purchased，以及 ACTIVE 状态、100 份权属及全部资金字段。购机回执当时，独立交易隔离余额/trace收款验证、BEM harvest/claim均为NOT_RUN；后续BEM实测已另行完成，原生币独立trace收款验证仍为NOT_RUN。

此前只读准备阶段未签名、未广播、未预留 B 本金。随后用户单独批准本笔参数及累计预算 **0.3045 BNB**，脚本复核后按相同 nonce、calldata 和费用发送一次，无重试或恢复。此次确认遵循用户“每次签名前询问确认”的明确要求。

| 回执字段 | 已核验结果 |
| --- | --- |
| 交易 hash | [0x17509be1a415297b7ffbad6ad346625d6f67cb24aaffdd66ab4aae7e79f9f0a6](https://bscscan.com/tx/0x17509be1a415297b7ffbad6ad346625d6f67cb24aaffdd66ab4aae7e79f9f0a6) |
| 区块 / 区块 hash | 128579551 / `0x5fb9f6269be9850109f2671f87ed4c2998f283cf7b0ee535edf904ba6351717c` |
| 状态 | success，至少 15 个区块确认，journal=CONFIRMED |
| gasUsed / effectiveGasPrice | 2,022,960 / 50,000,000 wei |
| 实际 gas 费用 | **0.000101148 BNB** |
| B 实际本金 / 本金加 gas | **0.09999 BNB / 0.100091148 BNB** |
| 份额 | 恰一条 TransferBatch 铸造 68–100 给 B；全部 100 个 ID 的 holder、supply、creator/B 余额核验为 67/33，各 ID supply=1 |
| 完成状态 | ACTIVE(2)、soldCount=100、fundedWei=0、Vault BNB=0、totalPrincipalIn=purchaseSpent=0.303 BNB、totalPrincipalRefunded=0 |
| 矿机归属 | 唯一 NFT Transfer 为 A→Vault，回执区块 ownerOf(3204)=Vault |
| 订单与支付证据 | 唯一完整 Seaport OrderFulfilled、Purchased 与冻结订单匹配；offer=#3204，consideration=0.3 BNB 给 A、0.003 BNB 给 creator；订单完全成交 |
| B 回执区块 BNB 余额 | **0.0147878315 BNB** |
| BEM 起点 | Vault BEM=0、totalAccounted=totalPaid=accPerShare=remainder=0；RewardsSynced.received=0，没有 Harvested 或 RewardClaimed |

完整 [B 认购购机 journal](../mainnet-completion/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) 已保存。原生币付款金额与接收人的协议事件验证为 **VERIFIED**；交易隔离的独立余额或 trace 收款验证仍为 **NOT_RUN**，不以任意跨区块钱包余额差代替交易级证据。

四笔部署加五笔测试的实际 gas 合计 **0.00090328225 BNB**，认购本金合计 **0.303 BNB**，本金与实际 gas 合计 **0.30390328225 BNB**。Safe 外层执行者费用继续单列。共享账本累计最大预留 **0.3040979852 BNB**，已批准上限 **0.3045 BNB**，尚余预留空间 **0.0004020148 BNB**，未将未使用的 gas 预留释放。creator 的 0.003 BNB 收入不抵扣累计本金。

购机完成后，第6–8笔分别经单独批准执行 `harvest()` 固定入账点，再由creator/B分别 `claimBatch([1…67])` 与 `claimBatch([68…100])`，实际收益分配已验证，详见后文。只有两次领取的 `RewardsSynced.received=0` 且 `accPerShare` 不变，才可比较同一账点的67:33；初次全部claimed=0时，应付各为每ID权益乘67/33。购机结束时权益转移、归集赎回和失败退款尚未执行；后续第9–11笔已完成权益转移验证，归集赎回和失败退款仍未执行。

## 购机后的真实主网只读权限与 BEM 快照

购机结果另经[独立保存证据审计](../mainnet-completion/independent-evidence-audit.json)通过：计划、完整原始回执事件、100 份权属、九笔实际 gas、九项预算预留与报告一致。该审计是本地交叉复核，不冒充新的 RPC 观察。

实际 RPC 观察使用 [active-pool.mjs](../mainnet-observe/active-pool.mjs)，仅支持固定公共节点的只读方法，没有 `.env`、私钥或广播入口。新增 **32/32 离线测试通过**。运行命令：

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-observe/*.test.mjs
node --import tsx mainnet-observe/active-pool.mjs
```

实际结果：[完整只读记录](../mainnet-observe/observations/active-pool-1792424534771.json)、[摘要](../mainnet-observe/validation.json)，**PASS**。快照区块 **128580017**，hash `0x39ede1bcd01320886a7636d586e1116042bef307f5103577ee918c7f492eef25`；购机回执重新核验时已观察到 **465 个确认**。两路链身份、固定检查点、当前 clone/config/依赖代码与购机原始回执事件均匹配。全部状态读取与负向模拟固定同一区块，结束时重查区块 hash；发送交易数为 **0**。

| 只读负向调用 | 用例数 | 实际结果 |
| --- | ---: | --- |
| B 领取 creator 的 ID1；creator 领取 B 的 ID68 | 2 | 均 NotHolder，PASS |
| creator claimBatch 空数组、重复 ID、ID0、ID101 | 4 | 均 InvalidIds，PASS |
| creator 与 B 分别直接赎回矿机 | 2 | 均 NotHolder，PASS；两人各自都未持有完整 100 份 |
| ACTIVE 下 creator withdraw([1],本人) 与 markRefundable() | 2 | 均 InvalidState，PASS |

共 **10/10 主网只读模拟通过**。仅将 viem 解码后的真实合约错误名与预期完全匹配记为通过；网络错误、无法解码或意外成功均会失败。这些不是实际发送并失败的交易，不产生 gas 支出。

| BEM 与权属快照 | 观测值 |
| --- | --- |
| 矿机 / 状态 / 份额 | #3204 在 Vault，ACTIVE，完整 100 份仍为 creator67/B33，各 supply=1 |
| BEM decimals | 8 |
| Mining pending | **13,653,220 raw = 0.13653220 BEM**，仅观测，不保证下一笔实际入账 |
| Vault BEM | **0 raw** |
| totalAccounted / totalPaid / accPerShare / remainder | 全部 0 |
| claimed / claimable | 完整 100 个 ID 均为 0 |
| creator 已有 BEM 钱包余额 | 103,905 raw = 0.00103905 BEM |
| A 已有 BEM 钱包余额 | 369,220 raw = 0.00369220 BEM |
| B 已有 BEM 钱包余额 | 437,579 raw = 0.00437579 BEM |

上述钱包BEM余额是既有余额快照，不是本次购机或领取的收入。该初始快照时Mining待领收益尚未入账；后续第6–8笔已按真实BEM inflow、RewardsSynced、Harvested、每个ID的RewardClaimed与对应Transfer完成核算。初始快照阶段只完成认购购机与只读权限检查，当时收益领取和正数权益转移尚未执行；随后第6–8笔完成收益分配，第9–11笔完成权益转移验证。赎回仍未执行。

## BEM 67/33同批收益测试：第6–8笔实链PASS（历史结束状态）

用户要求按harvest→creator→B顺序，每笔签名前单独确认；三笔已分别获批并在主网确认，均至少15个区块确认。完整[收益测试报告](../mainnet-rewards/BEM_REWARDS_TEST_REPORT.md)、[验证摘要](../mainnet-rewards/validation.json)、[三步脚本](../mainnet-rewards/rewards.mjs)、[最终离线对账](../mainnet-rewards/audit/final-reconciliation.json)均已保存。

| 步骤 | 主网交易 | 实际BEM | 实际gas BNB |
| --- | --- | ---: | ---: |
| 第6 harvest | [b3af0c8a…f5a03ea](https://bscscan.com/tx/0xb3af0c8a9cc570826a4782fd3b09f9d306fdd5d7dd89c7b10c0985899f5a03ea) | 入账0.13665485 | 0.00001102315 |
| 第7 creator领取67份 | [5a7426b0…c9767bd](https://bscscan.com/tx/0x5a7426b05a54f8bfbf6a9012a5094110689dde36910048f63736d9db0c9767bd) | 实收0.09155818 | 0.0001044409 |
| 第8 B领取33份 | [09bad685…9785105](https://bscscan.com/tx/0x09bad685e01819a520fa4120c5c6023c12768a6171846df73862614939785105) | 实收0.04509582 | 0.0000527602 |

原始整数H=13,665,485，每份q=136,654，余数r=85。两笔claimBatch没有再次harvest，RewardsSynced.received都为0，H/q/r未变；creator的67条与B的33条RewardClaimed逐ID金额都为q，各自唯一BEM Transfer与合计付款匹配。creator实收×33与B实收×67都为302,141,994；两笔实收9,155,818+4,509,582+Vault余85=harvest入账13,665,485，**同批收益按67/33正确分配**。

最终回执区块 **128585699**，hash `0xf74d7978513b1afc5ae06fbd24d5e93e9746e588282b8a92b4d554e3e2e10586`，100个ID均claimed=136,654、claimable=0，holder/supply与67/33权属未变，Vault持有矿机#3204、状态ACTIVE；totalAccounted=13,665,485、totalPaid=13,665,400、accPerShare=136,654、remainder=85、Vault BEM=0.00000085。Mining之后继续产生但未harvest的收益不包含在本轮。

三笔收益测试实际gas合计 **0.00016822425 BNB**；四部署加八笔测试实际gas合计 **0.0010715065 BNB**，认购本金合计0.303 BNB。Safe外层费用仍单列。第8笔结束时全部12项预算预留保留，当时最大预留 **0.3043039911 BNB**，低于批准上限 **0.3045 BNB**，当时尚余可预留空间 **0.0001960089 BNB**。

发送与观察相关回归 **693/693 PASS**，新增最终对账测试 **6/6 PASS**。最终对账CLI已实际运行 **PASS、exit0**，其边界是本地保存证据交叉复核，没有新增RPC或真实交易。三笔真实canonical确认及回执区块业务状态由受保护发送器验证，独立审计再检查实际保存数据。

第8笔结束时，正数未领权益转移、份额归集赎回及失败退款尚未执行；随后第9–11笔经分别批准完成权益转移测试。没有在未获逐笔批准时发送其他交易。

## 未领取权益转移测试：第9–11笔全部实链PASS

第9笔 [0605e956…6778a0c](https://bscscan.com/tx/0x0605e95651b4ffe0f5f7dba453e627fad99abb4bc15166b21dd86bd996778a0c) 经用户单独批准，主网区块128589337成功且至少15确认，完整journal为CONFIRMED / positiveTest PASS。实际新增32,254 raw BEM，加上前一轮85 raw余数，形成每份323 raw未领取权益，新余数39 raw：`32254+85=100×323+39`。第9笔结束时全部100份claimed保持136,654、claimable=323，#1当时仍由creator持有，creator/B为67/33份，Vault BEM=32,339 raw，矿机由ACTIVE Vault持有；后续转移及领取结果见下文。

第9–11笔实际gas分别为 **0.00000760315 / 0.00000344225 / 0.0000040223 BNB**，本轮三笔合计 **0.0000150677 BNB**，四部署加十一笔测试累计实际gas **0.0010865742 BNB**，Safe外层费用单列。15项累计最大预留 **0.3043235844 BNB**，低于原批准累计上限 **0.3045 BNB**，剩余可预留 **0.0001764156 BNB**。本轮新增21项测试、合并回归714/714 PASS，新增完整离线对账测试9/9 PASS；三笔原始事件、100份收益与预算均独立审计PASS。第6–8笔离线对账命令固定12项历史预留，不用于本轮15项结束状态。

第10笔 [28dee167…5066df7](https://bscscan.com/tx/0x28dee1670e0d52d10cd7532fef95bc1274b627484e3f108154a36f6ee5066df7) 已确认成功，区块128590538。原始回执只有精确TransferSingle，未同步收益或支付BEM；#1已归B，claimed仍136654、claimable仍323，creator/B现持66/34份。冻结发送器在回执区块严格验证creator的claim(1)返回NotHolder；另在固定区块128590706独立只读采集原始错误`0x7623fb52`，由compiled ABI精确解码为NotHolder()，没有付费失败交易。原始证据和独立审计均已保存。

第11笔 [e93ae962…ecb4531](https://bscscan.com/tx/0xe93ae9625ef450311dc4565807bdd427de09970969ced30eb4660e5d7ecb4531) 已单独批准并确认成功，区块128591816。B nonce6调用Vault的`claim(1)`，实际领取转移前已累积的 **323 raw = 0.00000323 BEM**。原始事件严格匹配RewardsSynced.received=0、RewardClaimed(B,1,323)及唯一BEM Transfer(Vault,B,323)，没有再次harvest；仅#1的claimed升至136977、claimable归零，其他99份仍claimed136654/claimable323。Vault余额32016 raw，totalPaid13665723、totalAccounted13697739、accPerShare136977、remainder39，满足`323+32016=32254+85`及`32016=99×323+39`。实际到账未重复支付历史已领136654 raw。

最终完整离线对账已实际运行 **PASS / exit0**：[final-reconciliation.json](../mainnet-entitlement-transfer/audit/final-reconciliation.json)。它独立解码保存的原始回执/错误字节、全部计划历史prefix和100份状态；不调用新RPC或读取私钥，freshChainConfirmation/freshNotHolderSimulation均标NOT_RUN。真实至少15确认及对应回执区块状态由冻结发送器验证，原始NotHolder另有独立实时采集。历史gas基线使用不可变快照；本轮结束预算也额外保存原始副本。当前creator/B持份66/34；creator其余66份和B原33份合计31977 raw本批权益仍未领取，39 raw为余数。完整报告：[权益转移测试报告](../mainnet-entitlement-transfer/BEM_ENTITLEMENT_TRANSFER_REPORT.md)。
