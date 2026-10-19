# BSC 主网测试准备与预检报告

记录时间：2026-10-19（北京时间）。这份报告保留最初主网只读预检和两项实现合约 gas 估算的历史记录，**没有部署、挂单、出资、领取或转移真实资产**。最初的预检工具不含签名/广播功能；后续已新增仅供用户在交互终端逐笔确认的部署入口。

**当前部署与治理交付请看 [部署验收报告](DEPLOYMENT_PREPARATION_REPORT.md) 和 [主网部署操作手册](MAINNET_DEPLOY_RUNBOOK.md)。** 下文的缺多签、延迟待定、没有部署入口等内容是较早准备阶段的记录，不是当前待办。主网是否执行仍以真实回执为准。

**后续更新：**用户现已提供已有 BSC Safe `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03`，并选择 600 秒 Timelock。当前已确认 Safe 1.4.1、2/2，runtime 与官方来源及当前配置检查通过，详情见 [治理核验报告](GOVERNANCE_REVIEW.md)。下文第 4 节“没有多签”的描述属于该地址提供前的准备记录；当前无需新建 Safe。主网部署仍未执行。

用户已提出真实主网测试，并确认 creator 67 份、B 33 份。此前文档中“本轮没有实链授权”的措辞是旧阶段记录，不作为本轮缺少授权的依据。当前待补项是治理配置、对应部署交易准备及完整 gas 预算。

## 1. 当前已确认参数

机器可读计划：[SESSION_PLAN.json](SESSION_PLAN.json)。该文件是测试计划，不是已部署地址清单，也不能替代 SDK 的 live manifest。

| 角色 | 地址 | 计划 |
| --- | --- | --- |
| A / 卖家 | `0x1b55E6A757987576E1a130A011f9E12498De7DB9` | 出售 TapeOut #3204，卖家收款 0.3 BNB |
| creator / 出资人一 | `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` | ID 1–67，共 67 份，支付 0.20301 BNB |
| B / 出资人二 | `0x63979C9d5200A5080be93eb440D469d2F2ec6682` | ID 68–100，共 33 份，支付 0.09999 BNB |

NFT collection：`0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C`；token ID：`3204`。

当前 V1 订单规则是卖价额外加 1% 费用，因此买方合计需 **0.303 BNB**，每份 **0.00303 BNB**，gas 另算。沿用前轮测试配置，0.003 BNB 费用接收者为 creator；这是本次测试接收者，不代表已核验的官方市场收费配置。成交前必须完整支付本金，不能预先扣除成交后返回 creator 的费用。

## 2. 实际主网观察

最终本轮观察：[preflight-1792415304382.json](observations/preflight-1792415304382.json)。较早两份 preflight 记录保留原始时间点，其中 allocationConfirmed=false 已由本轮后续明确答复和最终观察更新，不是当前计划。

- chainId：56；provider finalized 区块：**128559559**。
- 区块 hash：`0x59304d47c19c74d993d14f26069afa693ddee590350ed79b5de5eae40e734aeb`。
- 观察时间：`2026-10-19T13:08:24.374Z`，即北京时间 21:08:24。
- 当前工程 RPC 与另一路 `https://bsc-dataseed.bnbchain.org` 对同一区块的 hash 一致。该公开端点列于 [BNB 官方 RPC 文档](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/)。
- 历史 fork 固定区块 hash 仍与当前来源链一致。

| 地址角色 | 实际 BNB 余额 | 已确认出资本金 | 出资后、扣 gas 前余额 |
| --- | ---: | ---: | ---: |
| creator | 0.2048357342 | 0.20301 | 0.0018257342 |
| A | 0.0049597677 | 0 | 0.0049597677 |
| B | 0.1148789795 | 0.09999 | 0.0148889795 |

这是固定区块余额，不保证之后仍然相同。两位买家的实际余额足够本金；用户最初描述的恰好 0.2 + 0.1 则不足以买满，本轮以实际读取和明确确认后的金额为准。

矿机 #3204 仍属于 A。`getApproved(3204)=0x0`，A 对 Seaport 的 `isApprovedForAll=false`。尚未创建新的真实订单，Seaport seller counter=0。Seaport 1.6、NFT、Mining、BEM 的外层 runtime hash 与 fork 基线一致；这不是代理实现与完整源码语义审计结论。

Mining `pending=13,557,760` raw，BEM decimals=8，即 **0.13557760 BEM** 的 pending 视图值。这不是已经到账的金额。之前真实 fork 已证明 pending=0 时仍可能 claim 得到正数，后续报告必须用实际 BEM 入账、事件及份额账本核算。

## 3. 已估算 gas 与未确定部分

只调用 `eth_estimateGas`，没有签名。观察到 gasPrice=50,000,000 wei（0.05 gwei）。

| 操作 | 原始估算 gas | 加 20% 余量 | 按观察 gasPrice 的费用 BNB |
| --- | ---: | ---: | ---: |
| GroupBuyVault 模板部署（包含构造器内 validator 创建） | 7,053,938 | 8,464,726 | 0.0004232363 |
| GroupBuyFactory 实现部署 | 2,331,879 | 2,798,255 | 0.00013991275 |
| 两项合计 | — | 11,262,981 | 0.00056314905 |

**这不是完整流程预算或费用上限。** 尚未包含治理多签、GovernanceTimelock、Factory proxy、配置 schedule/execute、订单批准与授权、clone 创建、两笔出资及买入、后续 BEM/份额/赎回交易。Timelock 参数和真实多签尚缺，完整估算及每笔/累计 gas 上限待补；不能据此宣称全部余额足够，也不应自动修改 `.env` 的 live 开关。

## 4. 当前为何没有开始部署

用户明确答复目前**没有治理多签**，Timelock 最短延迟也未指定。

原始规格 [tapeout-groupbuy-codex-prompt.md](../tapeout-groupbuy-codex-prompt.md) 第 44 行写明：“Factory 具有显式配置的 upgradeAdmin（正式部署接多签 + Timelock）与独立 guardian。” 当前主网校验 [sdk/live-identity.ts](../sdk/live-identity.ts) 实际要求 code-bearing multisig、真实 Timelock、正延迟、角色历史审阅证据，以及与链上地址和 runtime 对齐的 manifest。fork 使用 creator EOA 和 1 秒延迟只是本地测试配置。

这里需要准备的是控制 Factory 配置/升级的治理账户，不是 Vault 的资产管理 owner。固定 clone 没有资产管理 owner，Factory 的取消权限仍只限未买成的 FUNDING 池转为可退款。

继续准备部署所需公开信息：

1. BSC 主网已经部署的治理多签地址，以及其 owners、确认阈值。只创建一个尚未部署的地址不满足 code-bearing 检查。
2. Timelock 最短延迟（秒）。这个值会成为不可降低的 floor；不是可以随意撤回的临时测试参数。
3. 完整估算后确定的单笔及累计 gas 预算。

若使用 Safe，可以从 [Safe 官方创建指南](https://help.safe.global/articles/7267202833-creating-a-safe-on-a-web-browser) 进入官方应用，选择 BNB Smart Chain，设置自己的签名人及阈值，并由钱包完成实际部署。网络支持可查 [Safe 官方网络列表](https://docs.safe.global/advanced/smart-account-supported-networks?service=Transaction+Service)。签名人与阈值尚未替用户选定。沿用 fork 时 B 担任 guardian，需保持其不兼任 Timelock proposer/admin；完整身份与角色仍要核验。

仓库目前只有 `deploy-local`，它明确拒绝 live；fork 创建订单脚本也只允许本地 impersonation。因此不能把 MODE 改成 live 后复用 runner。治理参数确定后，还需要生成供用户检查和亲自签署的部署/配置交易，验证 receipt，再生成 reviewed live manifest。本轮未生成这份缺参数的部署包。

## 5. 主网测试顺序与证据

主池采用正常赎回路径。下面是待执行清单，**各项均为 NOT_RUN**：

1. 部署、核验治理及合约，按真实 Timelock 等待配置生效。先完成这一步再生成短期订单，避免等待期间订单过期。
2. A 对 #3204 做 token-specific approve，再由 A 授权完整 Seaport 订单。使用 FULL_OPEN 时别人也可能成交；不写入市场数据库不等于订单限制了买家。
3. 创建固定 clone，核对 0.303 BNB 条款、订单哈希、100 份本金及期限。
4. creator 出资 ID 1–67，B 出资 68–100；满额购买时核对卖家和费用到账、矿机 owner=Vault，以及失败回滚路径。
5. 先 harvest 固定一个到账检查点，再分开 `claim-batch`，期间不插入第二次 harvest。比较每 ID 累计权益及实际转账，不能把 67/33 的两个钱包要求成总额相同。
6. 保留一个有未领权益的 ID，从 creator 转给 B；用只读模拟验证旧持有人不能领取，再由新持有人领取旧权益，核对新持有人余额和该 ID 账本。
7. 等待真实时间产生新的收益，再 harvest。记录实际新增 BEM，不用 fork 的 `evm_increaseTime`。
8. 两位参与者将 100 个 ID 归集至 A；由 A 正常 redeem，核对矿机归属、最终 BEM、份额销毁及会计总量。

guardian 退款测试和 without-harvest 赎回分支需要独立池/独立轮次。主网不能 snapshot/revert，取消后不能恢复 FUNDING，同一矿机也不能在同一池被赎回两次。负例优先做只读模拟，不能为了套用 fork 的 23 项数字而发送失败交易或虚报完成。

## 6. 本轮新增工具与实际验证

只在 `live-test/` 新增文件，没有修改合约、SDK、旧 fork runner、`.env`、市场或数据库。核心 verificationInputHash 仍为：

`9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba`

前轮完整回归报告和源码归档仍对应原冻结版本；本目录是新增的主网准备补充，未包含在旧归档中。

从工程目录执行：

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node live-test/preflight.mjs --env ../.env
node --test live-test/preflight.test.mjs live-test/verify-receipt.test.mjs
node live-test/verify-receipt.mjs --help
```

实际结果：

| 验证 | 结果 |
| --- | --- |
| 主网余额、矿机归属、批准、Seaport 域/counter、runtime、pending | 已读取，记录固定区块 |
| 两路 RPC 区块 hash 交叉核对 | MATCH |
| 两个无参数实现合约的部署 gas 估算 | 成功，仅模拟 |
| 预检/本金取整/确认分配/只读 RPC 拒绝写入测试 | 10/10 PASS |
| 回执身份、CREATE、gas、revert、确认数、重组及脱敏 fixture 测试 | 10/10 PASS |
| 新收据脚本对本轮真实交易的集成核验 | NOT_RUN，本轮没有真实交易 |
| 本轮主网部署、挂单、购买、收益、转移、赎回 | NOT_RUN |

用户发出一笔交易后，可用下列模板核验；预期参数应来自签署前已经审阅的交易，不能事后从交易本身抄回作为预期值：

```bash
node live-test/verify-receipt.mjs \
  --env ../.env \
  --tx '<实际交易哈希>' \
  --from '<预期发送地址>' \
  --to '<预期目标地址或CREATE>' \
  --value '<预期wei整数>' \
  --data-hash '<签名前calldata或部署initcode的keccak256>' \
  --confirmations 15
```

该工具读取 receipt、transaction、canonical block、确认数和实际 gas。确认不足会返回 `NOT_PASSED/WAITING_CONFIRMATIONS`，不会等待或重发。`RECEIPT_MATCHED_BUSINESS_UNVERIFIED` 仅表示交易参数和成功回执匹配；仍需按本报告第 5 节核对事件与资产余额，才能宣布业务测试通过。CREATE 后还需额外核验预测地址和实际 runtime。

工具只消费显式指定环境文件中的 `BSC_RPC_URL`，不使用私钥；错误不会打印 provider URL。传输层仅放行只读 JSON-RPC，拒绝发送交易、签署、impersonation 和余额注入等方法。
