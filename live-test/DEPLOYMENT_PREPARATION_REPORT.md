# 多签、600 秒 Timelock 与代理部署准备验收报告

**后续实际主网执行记录已单独建立：[LIVE_DEPLOYMENT_REPORT.md](LIVE_DEPLOYMENT_REPORT.md)。本文保留部署开始前的验证结论；下文 NOT_RUN 表示本文验收时状态。**

记录日期：2026-10-19，北京时间。本轮已经实现部署入口、治理文件生成器、交易恢复检查和独立真实 BSC fork 演练，**117 项离线测试全部通过，fork 四笔部署与两笔治理调用全部成功，主网只读部署预览通过**。主网部署与真实 Safe 双签均为 **NOT_RUN**，本轮主网发送交易数为 **0**。

执行顺序和可复制的完整命令：[MAINNET_DEPLOY_RUNBOOK.md](MAINNET_DEPLOY_RUNBOOK.md)。该手册已经填入本轮真实文件名及 hash，不需要从旧 fork 配置猜参数。

## 1. 固定治理安排

| 项目 | 本轮配置 |
| --- | --- |
| 治理 Safe | `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03`，核验为 Safe 1.4.1、2/2 |
| Timelock floor / 初始 minDelay | 600 秒；floor 不能降低 |
| Timelock proposer / executor / canceller | 上述 Safe |
| Timelock DEFAULT_ADMIN_ROLE | Timelock 自身，无部署者 bootstrap admin |
| Factory upgradeAdmin | 新 Timelock |
| Factory guardian | B：`0x63979C9d5200A5080be93eb440D469d2F2ec6682` |
| 部署付款人 | creator：`0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` |

Factory proxy 构造时原子初始化，部署后先暂停建池。初始治理批次依次批准固定模板、批准真实 Seaport 配置、选择模板/config、恢复建池，四项操作在一次 executeBatch 中原子执行。

**需要两次独立 Safe 2/2 确认：scheduleBatch 一次，至少 600 秒后 executeBatch 一次。** 计时从 schedule 实际上链执行开始。四笔部署均由 creator 签署，不需要 Safe 确认。普通用户后续出资、收益领取、份额转移和正常赎回不需要 Safe 确认。

Vault 固定 clone、无资产管理 owner、不能升级的设计保持不变。Factory/guardian 不能提取池资金、改退款受益人或绕过全部份额的赎回条件。

## 2. 交付文件

| 文件 | 用途 |
| --- | --- |
| `deploy-mainnet.mjs` | 默认只读预览；人工终端逐笔确认后可签名和发送一笔部署；`--reconcile` 仅核对记录的 hash |
| `deployment-io.mjs` | 原子/fsync journal、共享锁、持久化累计预算、文件路径限制和工具 hash |
| `governance.mjs` | 真实部署完成后验证回执/角色/代码，生成 schedule、execute 两份 Safe JSON；只读查询 READY/DONE |
| `rehearse-deployment.mjs` | 只读上游 + 仅 127.0.0.1 的 Anvil 1.4.3 隔离 fork，执行部署及治理批次后自动关闭 |
| 各 `.test.mjs` | 离线 fixture 与负例测试 |
| `local-test-results.tap` / `validation.json` | 本轮实际测试输出与机器可读汇总 |

没有修改合约、SDK、原 fork runner、`.env`、市场或数据库。`live-test/` 是原源码包之外的补充；旧源码包不会自动包含这些新入口。

## 3. 独立真实 fork 结果

原始完整证据：[deployment-2f3eb594-5f59-4507-869d-20abc20062ee.json](rehearsals/deployment-2f3eb594-5f59-4507-869d-20abc20062ee.json)。运行时间 UTC `2026-10-19T13:29:18.473Z` 至 `13:29:28.609Z`。

- 来源链：BSC 56，固定源区块 **128560759**。
- 源区块 hash：`0x268b36f8d824868b9acf3626c781bcdc17bd7400e6e491bd66f3319df6c06d03`。
- creator 使用源区块真实余额和 nonce，没有测试补币。fork 中 nonce 5 → 9。
- 上游只读代理拒绝写 RPC；局部 impersonation 和推进时间均只在隔离 fork 发生。
- 正式运行 `status=PASS`，`cleanup.status=PASS`，Anvil 和只读代理已停止。

| 部署顺序 | 预测地址／fork 实际地址 | fork gasUsed | gasLimit（20% 余量） |
| --- | --- | ---: | ---: |
| Vault 模板 | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` | 6,997,237 | 8,396,685 |
| Timelock | `0x02f453192530e07541E61B43DA079273F410979b` | 1,421,627 | 1,705,953 |
| Factory 实现 | `0xE45D94579425a6a2006D3e067C8d51De6B15C4fc` | 2,312,360 | 2,774,832 |
| Factory proxy，原子初始化 | `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1` | 251,749 | 302,099 |
| 合计 | 四个地址均未由本轮部署到主网 | **10,982,973** | **13,179,569** |

源 RPC 观察 gasPrice=50,000,000 wei（0.05 gwei）。fork 四笔实际费用合计 **0.00054914865 BNB**；按余量 gasLimit 计算 **0.00065897845 BNB**。creator 在 fork 的余额由 **0.2048357342** 变为 **0.20428658555 BNB**，余额差与 receipt gas 费用精确一致。

这不是未来主网实际费用承诺。主网节点的估算与 Anvil 有差异；部署入口每一步在主网当前状态重新模拟和估算，并保留 creator 的 0.20301 BNB 出资本金。

治理内层 scheduleBatch 使用 85,614 gas，executeBatch 使用 413,011 gas。这里从 Safe 地址进行本地 impersonation，并用零 gasPrice 隔离权限路径；**没有执行 Safe.execTransaction，没有验证真实 2/2 签名，也没有测量 Safe 外层 gas**。不能把内层零费用当成真实治理无需 gas。

实际通过的检查：

- 四笔 CREATE 的预测地址、成功回执、canonical block、非空 runtime。
- 固定 Vault template initializer 锁定；validator runtime 与源码编译结果一致。
- Factory EIP1967 implementation slot、upgradeAdmin、guardian、600 秒要求、初始暂停状态。
- Timelock minimumDelayFloor/getMinDelay、deploymentAddress 和 20 项角色成员读值。
- 已初始化 proxy 和 Factory 实现重复初始化均返回 `InvalidInitialization`。
- creator 直接管理 Factory 返回 `Unauthorized`；creator schedule 返回 `AccessControlUnauthorizedAccount`。
- 未满 600 秒执行、完成后重复执行均返回 `TimelockUnexpectedOperationState`。
- 满 600 秒后四项配置执行成功，选定模板/config 正确，`creationPaused=false`，operationDone=true。

初次沙箱尝试因 `RPC_CONNECTION_FAILED` 失败，部署数为 0，原始失败记录保留为 [deployment-3de6be95-b41c-4886-8930-1852d8b5f479.json](rehearsals/deployment-3de6be95-b41c-4886-8930-1852d8b5f479.json)。获得运行网络权限后重新执行才得到上述 PASS；没有把第一次失败改写为成功。

## 4. 主网只读预览

在正式 rehearsal 之后，实际执行了手册第 4 节的 `deploy-mainnet.mjs --step 1`，不带 `--broadcast`。证据：[mainnet-step-plan-1792416611980.json](observations/mainnet-step-plan-1792416611980.json)。

结果为 `READ_ONLY_PLAN`，creator latest/pending nonce 都为 5，首笔预测地址无代码、创建模拟成功，实时 Safe 完整配置和协议 runtime 核验通过，累计已预留支出为 0。

- 主网首笔估算：7,053,938 gas。
- 加 20%：8,464,726 gas。
- 当时 gasPrice：0.05 gwei；最大费用 **0.0004232363 BNB**。
- 私钥未被解析/使用，交易未签署/广播。

第 2–4 步主网模拟需要前置合约实际部署；由人工执行每一步时重新完成。fork 已完整验证依赖顺序，但不能替代这些主网前置检查。

## 5. 离线逐类测试

实际命令：`node --test live-test/*.test.mjs`。完整原始输出：[local-test-results.tap](local-test-results.tap)。

| 分类 | PASS | 覆盖要点 |
| --- | ---: | --- |
| 主网只读预检 | 10 | 本金、67/33 分配、只读 RPC 方法边界 |
| Safe 身份检查 | 6 | 官方 runtime、CODECOPY 返回段、owners/modules/guard |
| 未签名部署计划 | 19 | nonce 连续、CREATE 预测、治理构造参数、源码与 artifact |
| 回执检查 | 10 | CREATE、from/to/value/data、失败、确认数、重组、脱敏 |
| 部署预算与持久化 | 14 | 累计支出、重复 nonce、锁、原子写、损坏文件、symlink |
| 人工部署入口 | 24 | 真 TTY、开关、明确预算、确认后变化、先记录 hash 后发送、超时不重发、journal/预算绑定、RPC 冻结、nonce 复查 |
| 治理文件与检查 | 19 | 真实 ABI、两笔调用一致、salt 绑定、全角色事件重放、回执及 rehearsal/runtime/validator 一致、READY/DONE |
| 隔离 rehearsal | 15 | bundle/source 绑定、本地隔离与清理、精确 revert、网络错误不得算负例通过 |
| **合计** | **117** | **0 failed / 0 skipped** |

未更改核心验证输入，因此本轮没有重复运行核心 Solidity/SDK/完整购买收益回归；前轮结果仍属独立历史证据。本次 fork 范围为部署和初始治理配置，不冒充重新完成买入、收益、转移、赎回整条流程。

## 6. 证据绑定与尚未执行项

未签名草稿：[unsigned-deployments-1792415847788.json](observations/unsigned-deployments-1792415847788.json)。原草稿内 `readyToSign=false`、代理尚未估算等是生成时状态，保持原始文件不变；新增入口要求匹配本轮 PASS rehearsal 并实时重检后，才允许人工逐笔确认。

```text
bundleHash (原始文件 keccak256)
0x72166ad218a0963b3eeee898d62da0514e69fec8afed2a91b38e6e7eb138012d

bootstrapToolHash (新增运行脚本 + SESSION_PLAN)
c8941190c7f030d61537600dbc1d194e6a92349fc7395c590ff3e814bf971361

core verificationInputHash (未变化)
9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba

初始治理 configHash
0x9469c79d863bbdd7831478b42a27714454375c25ed63199875cc87891374bd7a

初始治理 operationId
0x811d9fff56b2f952640c71d9f7558794b726ba0fdeed549d297879f1c5bb35f5
```

如果 source、SESSION、运行脚本、bundle 或 nonce 改变，旧 rehearsal 不能继续作为对应计划的证据。预算和 journal 不允许为重试而清空；恢复命令见手册。

| 事项 | 本轮状态 |
| --- | --- |
| 本地离线测试、隔离真实 fork 部署/治理 | PASS |
| 主网第 1 笔实时只读预览 | PASS |
| 主网四笔部署及真实回执集成 | NOT_RUN |
| 真实 Safe 2/2 签名、schedule/execute | NOT_RUN |
| 可导入并签署的主网 Safe 文件 | 主网四部署确认后由 governance.mjs 生成；rehearsal 中仅存配置预览 |
| Reviewed live manifest | NOT_GENERATED，需真实部署和角色/运行状态证据 |
| 本轮真实挂单、出资、购买、领取、份额转移、赎回 | NOT_RUN |

本阶段准备已完成。实际操作由用户先按手册完成四笔部署，再用现有 Safe 两次 2/2 执行治理。得到 `ALREADY_EXECUTED` 并保存实链证据后，再准备购买测试的 live manifest 和订单。
