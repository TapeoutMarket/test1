# 测试报告

日期：2026-10-03（Asia/Shanghai）。范围：本目录新建的本地测试工程。没有真实 NFT/BEM 转移、真实链部署或 git push。未声称已审计。

## 状态

| 验证层级 | 状态 | 证据与边界 |
| --- | --- | --- |
| Mock 合约测试 | **通过** | 49 项，0 失败：44 单元/异常/确定性回归、2 fuzz、3 invariant |
| 脚本/前端配置测试 | **通过** | 15 项，0 失败；权限门槛、RPC约束、费用预算、错误脱敏、紧急预检、替换回执、前端配置 |
| Anvil RPC 工作流 | **通过** | 2 个场景；交易均在本地 chain 31337；测试结束恢复快照 |
| 分步 CLI 集成 | **通过** | 12 项，包括实际本地单笔发送、dry-run 不改状态、预期拒绝发送 |
| TypeScript / UI production build | **通过** | Vite 6.4.3 最终构建成功；有约 508 kB 分块体积提醒 |
| UI 浏览器读链 | **通过** | 读取本地部署的真实 Mock 数据、状态和禁用原因，无页面错误 |
| UI 浏览器钱包签名全流程 | **未执行** | 内置测试浏览器没有钱包；链写入通过 RPC/CLI 另行验证，不能冒充钱包体验已验收 |
| 真实链 fork | **未执行** | 未提供用户选定目标 NFT / 固定 fork 区块 / RPC 等配置；已运行入口验证缺参输出UNEXECUTED并exit2，未启动fork |
| 实链只读目标预检 | **未执行** | 用户的具体配置尚未填入；公开协议资料与公开 RPC 研究另记在 PROTOCOL_CHECK |
| 实链广播/真实资产测试 | **未执行** | 本轮明确禁止；没有加载真实签名账户或发送实链交易 |

Mock 通过不等于 TapeOut 主网兼容。公开 RPC 的 ABI/字节码读取不等于 fork 领取测试。fork 即使未来通过，也不等于真实矿机已广播完成测试。

## 实际执行命令

```bash
npm install --cache .npm-cache --ignore-scripts
# 审计后锁定修复版本：viem 2.57.2、Vite 6.4.3；移除不再使用的npm solc
npm ci --ignore-scripts --offline
npm run compile
forge build --offline --sizes
forge test --offline --no-match-path 'test/fork/*'
npm test
node scripts/foundry-runner.mjs mock --match-test testFuzz --fuzz-runs 1024
npm run test:fork
npm run test:scripts
npm run chain
npm run deploy:mock
npm run smoke
npm run check:cli
npm run build
npm run dev
```

Solidity 编译器 0.8.24+commit.e11b9ed9，Paris，optimizer 200；macOS 官方下载 SHA-256：`cc2d44c706905ccc382f484625dff61d741e0c24232d226f139a6835fc644f3f`。Vault 运行时代码 11,509 bytes，低于 24,576 bytes 限制。Foundry 1.4.3，forge-std v1.9.7，OpenZeppelin 5.4.0，Node 20.19.5。

依赖安装后的 npm 审计为 **0 个已知漏洞**；这是当次依赖数据库结果，不代表应用无漏洞。所有 npm 依赖锁定在 package-lock.json。

## 20 项需求的合约覆盖

| 场景 | 代表测试（`test/TestMinerVault.t.sol`） |
| --- | --- |
| 创建者owner/两种ID供应 | `testCreatorAndFixedShares`、`testNoMintBurnOrOwnerTransferEntrypoints` |
| 存入前冻结单/批转移 | `testAwaitingDepositFreezesSingleAndBatchTransfers` |
| 错误矿机/来源/重复存入 | `testDepositWrongCollectionWrongIdAndWrongSource`、`testDepositChecksOwnershipAndCannotRepeat` |
| 历史100/新增20，各分50% | `testHistoricalAndNewRewardsAreHalfEachAndClaimsIndependent` |
| A先领不影响B | 同上，分别检查每次支付与第二份余额 |
| 新增收入/不重复领取 | 同上、`testDirectDonationsAndThirdPartyMiningClaimReconcileOnce` |
| ID转移继承全部未领权益 | `testUnclaimedRightsAndClaimedDebtFollowTransferredID`、`testTransferBeforeAnyClaimGivesEntireHistoryToNewHolder` |
| claimBatch非法/重复/无权限 | `testClaimBatchDuplicateIllegalAndUnauthorizedIDsCannotPartiallyPay` |
| 第三方harvest不抢奖励 | `testMiningOwnerRestrictionRejectsDirectStrangerButVaultHarvestWorks` |
| 直接到账/外部claim核对一次 | `testDirectDonationsAndThirdPartyMiningClaimReconcileOnce` |
| 半份额不准取矿机 | `testHalfHolderAndOperatorCannotRedeemOrWithdraw` |
| operator不算100%持有人 | 同上 |
| 集齐赎回、销毁、结算、NFT归属 | `testFullHolderRedeemsSettlesOddUnitBurnsAndReceivesMiner` |
| owner正常恢复不抢BEM | `testOwnerNormalWithdrawKeepsShareRightsAndFreezesTransfers` |
| Mining持续故障时紧急恢复 | `testMiningFailureMakesNormalCloseAtomicButEmergencyAvailable`、`testContractCallerRejectedCanStillEmergencyRecover` |
| 紧急关闭后冻结/继续领取 | `testEmergencySkipsBrokenMiningAndTokenAndPreservesArrivedRewards` |
| Closed不可重启/重复取回 | `testClosedCannotReactivateRepeatWithdrawHarvestOrDoublePay` |
| 奇数/小额余数正确 | `testOddSmallUnitRemaindersCarryForward`、两项 Closed dust 测试 |
| ERC721/ERC1155单批/BEM/Mining回调 | `testERC1155SingleAndBatchReceiverCannotReenterAnyAssetPath`、`testERC721OwnerReceiverCannotReenterRecoveryOrOtherPaths`、`testBEMCallbackCannotDoubleClaimOrHarvestOrClose`、`testMiningAndNFTExternalCallbacksCannotReenter` |
| 支付/NFT失败原子回滚 | `testBEMPaymentFailureRollsBackIncomeAndDebt`、`testRedemptionPaymentFailureRollsBackHarvestBurnAndClose`、`testNFTTransferFailureRollsBackRedemptionPaymentsBurnAndHarvest`、`testOwnerNFTTransferFailureRollsBackBothClosePaths` |

另外覆盖 non-safe deposit 的 owner确认及 Awaiting 紧急取回、构造时依赖故障、claim成功无到账、普通claim不依赖Mining、zero-amount转移不改持有人、非法供应/第三ID、恶意接收者拒收、Vault不接收自身份额，以及正常赎回后误转BEM的处理。

默认两个 fuzz 各设置 **256 runs**，含缓存失败样本的用例会多执行一次。修复后额外把两个 fuzz 的新样本数提高到 **1024**；收益转移用例加上原失败样本共1025次，赎回用例1024次，均通过。三个 invariant 各 **128 runs × 64 depth = 8192 calls**，handler未发生未处理revert：

- 总支付不超过实际收入；以独立 ghostReceived 核对 `余额 + 累计支付 = 真正收到的总额`。
- 余额可与两ID未领权益、余数、尚未同步的实际入账相核对。
- 每个ID供应最多1，0/3不存在；NFT只能通过授权关闭路径离开，至多成功关闭一次。

## RPC/CLI 与 UI 证据

`reports/local-smoke.json`：

1. 本地 NFT存入 → 任意第三方harvest历史100 → A领取50 → ID2转手 → 新增20 → A再领10/新持有人领60 → 两ID合并 → 最后1最小单位收益 → 原子赎回。总支付120 BEM+1最小单位，余额0，份额烧毁，NFT归满额持有人。
2. 历史100到账后让Mining.claim、Mining查询、BEM查询与转账故障 → owner紧急取回成功 → BEM恢复后A/B各领50。NFT已离开，到账权益仍保留。

`reports/cli-smoke.json`：12个子进程检查。预检、存入模拟、存入发送、第三方harvest、A/B分别claim、B转份额给A、正常赎回模拟、owner正常/紧急模拟，以及两个预期拒绝案例均符合结果。脚本本地错误退出1的两例是**成功拦截**：Mock `--broadcast` 和无TTY确认的赎回；不是合约测试失败。

`npm run test:fork` 缺参退出2同样是明确“未执行”的预期行为，不计入通过的fork测试。已完成4项fork测试的本地编译，未来仅在显式参数齐全时执行真实协议模拟。

上述 reports 是本地生成、默认忽略文件。测试结束恢复Awaiting快照；不能把已恢复快照中的本地交易hash拿到BSC浏览器当证据。

浏览器读取到了：Vault `0x5fc8d32690cc91d4c39d9d3abcbd16989f875707`、链31337、NFT #12167、owner持有矿机、两ID各供应1、当前A/B持有人、pending100、实际到账0。未连接钱包时所有写按钮禁用。Closed界面停止把Mining后续pending展示成Vault资产。

## 发现并修复的问题与残留限制

- 初始依赖告警：固定升级Vite/viem并移除不用的npm solc后，安装审计0告警。
- Foundry macOS系统代理在沙箱内panic：离线测试解决；改正旧`testFail*`命名与新版Foundry冲突。
- 最终隔离测试发现一个fuzz失败：本机`forge fmt`错误展开了含`prank`的单行条件块，导致false分支以测试合约身份领取并收到Unauthorized。此前格式化后仅编译、未重新测试的遗漏已纠正。用`_claimAs()`绑定prank与目标调用，加上false/true固定反例回归后，最终49项及扩大fuzz运行全部通过；Vault合约无需为该测试问题改动。
- CLI最初有括号语法错误：分步CLI集成捕获、修复后12项重跑通过。
- 紧急脚本预检原先仍核对Mining/BEM代码：现在恢复路径跳过这些依赖，新增测试验证。
- viem替换/取消回执：脚本与UI均核对原hash，新增测试，防止误报原操作成功。
- UI约508kB分块提示不影响构建；当前只是本地测试面板，未做性能优化。
- Foundry直接运行曾尝试写全局signature cache，被沙箱拒绝，编译仍exit0；最终npm编译/测试在隔离cwd和空.env下运行，产物与编译缓存留在项目内。
- owner特权、普通ERC20余额假设、代理后续升级、目标协议源码未完全核验、真实状态条件、NFT自身转账限制均是剩余风险，不能用Mock测试消除。
