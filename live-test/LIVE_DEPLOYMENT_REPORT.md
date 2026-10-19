# BSC 主网逐笔部署记录

这是实际主网执行记录，独立于之前的本地测试和 fork 演练报告。每笔签署前由用户单独确认；本次流程不包含挂单、买入、出资或转移矿机。

当前状态：**四笔主网部署全部确认成功，Safe 初始治理操作已完成；Factory 已选中预定模板和协议配置，建池暂停已解除。** 最新只读证据见文末“executeBatch 完成后的链上复核”。

四笔实际 gas 费用合计 **0.00054914865 BNB**；按签名前 gas 余量累计保留的预算为 **0.00066448855 BNB**。所有交易 value 都为 0；没有进行矿机购买或转移。

| 顺序 | 主网已部署合约 | 地址 | 实际 gas 费用 BNB |
| --- | --- | --- | ---: |
| 1 | Vault 模板 | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` | 0.00034986185 |
| 2 | GovernanceTimelock | `0x02f453192530e07541E61B43DA079273F410979b` | 0.00007108135 |
| 3 | Factory 实现 | `0xE45D94579425a6a2006D3e067C8d51De6B15C4fc` | 0.000115618 |
| 4 | Factory 代理 | `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1` | 0.00001258745 |

## 已完成：Vault 模板

| 项目 | 实际结果 |
| --- | --- |
| 网络 | BSC 主网，chainId 56 |
| 发送者 | `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` |
| nonce | 5 |
| 交易 value | 0 |
| 合约地址 | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` |
| 交易 hash | `0x2c57fb7ffa37051f9a038827272f8d72a9d102a3379fa81ea5db0c8ad39aca69` |
| 区块 | 128563434 |
| receipt 状态 | success；脚本达到至少 15 个确认并核验 canonical block |
| gasUsed | 6,997,237 |
| 实际 gas 费用 | **0.00034986185 BNB** |
| 签名前批准的 gasLimit × gasPrice | 0.0004232363 BNB |
| runtime hash | `0xbd048645bfc14c772c190fa5d532e883ba0bf58fe8bef3e4b94894ce3b7f3559` |
| 代码/初始化检查 | 与已通过 fork rehearsal 的 runtime 相同；模板初始化已锁；validator 地址/runtime 匹配 |

该地址是 Vault 实现模板，不是已经买入矿机的用户 clone。模板构造器创建的 MarketValidator 已由同一笔交易部署并验证。

完整部署参数、回执、日志和实际费用保存在 [deployment-state.json](deployment-state.json)。累计预算账本位于 `deployments/live-budget.json`，按最大费用预留且不自动归零；本笔预留为 0.0004232363 BNB。

## 已完成的 Safe 治理步骤

1. 用户在 Safe 执行 scheduleBatch；链上操作先进入 WAITING，随后达到 READY。
2. 用户在 Safe 执行 executeBatch；最新链上检查返回 ALREADY_EXECUTED，全部配置后置条件通过。

Safe 手工构建用 ABI：[GovernanceTimelock.builder.abi.json](safe-builder/GovernanceTimelock.builder.abi.json)。它是编译结果中的静态 ABI；地址和治理参数必须在真实部署核验后生成，不能把预测地址当成已部署地址。

本轮没有请求或使用 Safe owner 私钥，也没有代替 Safe 签名。Safe 两笔交易由用户在钱包中构建、确认并执行。

## 已完成：GovernanceTimelock

- 部署地址：`0x02f453192530e07541E61B43DA079273F410979b`。
- 交易：`0xc6094c145393986142f26f1d4d709096abefd934199b3ef811cd9f46959259d6`。
- creator nonce=6，区块 128563718，receipt success；至少 15 个确认，canonical receipt、输入与 runtime 已验证。
- gasUsed=1,421,627；实际费用 **0.00007108135 BNB**；本笔最大费用预留 0.00008604465 BNB。
- minimumDelayFloor=getMinDelay=600，deploymentAddress 等于实际 Timelock 地址。
- Safe 持有 proposer/executor/canceller；只有 Timelock 自身为 DEFAULT_ADMIN；creator、guardian、零地址没有上述治理权限；Timelock 自身无 proposer/executor/canceller。
- 两笔实际费用合计 **0.0004209432 BNB**；累计最大费用预留 **0.00050928095 BNB**。

## 已完成：GroupBuyFactory 实现

- 部署地址：`0xE45D94579425a6a2006D3e067C8d51De6B15C4fc`。
- 交易：`0x4946e965fae959c0ae2717cdd16faa6f4e4624ea9cff63721ab08cba2b9d76c2`。
- creator nonce=7，区块 128564045，receipt success；至少 15 个确认，canonical receipt、输入与 runtime 已验证。
- gasUsed=2,312,360；实际费用 **0.000115618 BNB**；本笔最大费用预留 0.00013991275 BNB。
- 三笔实际费用合计 **0.0005365612 BNB**；累计最大费用预留 **0.0006491937 BNB**。
- 此地址是实现，不能替代第 4 笔已部署的 Factory 代理地址用于配置和建池。

## 已完成：Factory 代理和原子初始化

- 部署地址：`0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1`。
- 交易：`0x446e42c7238f383d718f20065e56d032fd0bb4d22ee694d85b3433a1ebb6683c`。
- creator nonce=8，区块 128564390，receipt success；至少 15 个确认，canonical receipt、输入与 runtime 已验证。
- gasUsed=251,749；实际费用 **0.00001258745 BNB**；本笔最大费用预留 0.00001529485 BNB。
- EIP1967 implementation 为本轮 Factory 实现，upgradeAdmin 为本轮 Timelock，guardian 为 B，requiredMinDelay=600。
- `creationPaused=true`，等待 Safe 初始配置；部署状态记录为 `DEPLOYED_UNCONFIGURED`。
- 四笔已按用户逐笔确认分别执行，没有重复广播或失败的主网部署交易。

## 最终只读治理核验与 Safe 交接

完整记录：[governance-inspection-1792417534420.json](observations/governance-inspection-1792417534420.json)。检查点为 finalized 区块 **128564487**，hash `0x2e3b80a9897f3b0cbe37e79f811370f2280f4d0e3f11ef84561937103fc89944`。

- 四份 CREATE 回执、runtime、proxy implementation、固定模板/validator 及 600 秒治理条件再次核验通过。
- 重放 Timelock 部署区块 128563718 至检查点的全部 RoleGranted/RoleRevoked，处理 4 个角色事件。最终只有 Timelock self-admin 和 Safe proposer/executor/canceller，未发现额外角色成员。
- 角色历史报告 hash：`0x90a3f0f7e65ed3acca8a438d48a0614455a7a06118df792960bbc9743e87e2de`。
- `creationPaused=true`，`selectedTemplate=0x0`，治理操作为 `UNSCHEDULED`，返回 `SCHEDULE_REQUIRED`。
- 从 Safe 地址进行只读 scheduleBatch 内层模拟已通过；真实 Safe 2/2 签名、schedule 和 execute 均未执行。

证据字段勘误：上述原始检查文件内嵌的 `governance.governanceAssigned=false` 及 `governance.limitations` 中“No Timelock has been deployed or role assigned”是早期 Safe 身份检查器保留的静态描述，不代表此次部署后的链上状态。本次部署和角色结论以该文件外层的 `deploymentEvidence`、`roles`、`roleHistory` 为准；Timelock 已部署且角色已核验，待执行的是 Safe 初始配置批次。原始检查文件保持不变，保留审计轨迹。

主网地址核验后生成的文件：

- [第一次 Safe schedule 导入文件](observations/safe-schedule-1792417534418.json)
- [第二次 Safe execute 导入文件](observations/safe-execute-1792417534419.json)，**仅在链上等待后检查 READY 才能执行**
- [两笔治理完整参数](observations/governance-bundle-1792417534419.json)
- [主网协议配置](observations/mainnet-config-1792417534420.json)，这不是 reviewed live manifest
- [手工构建 ABI](safe-builder/GovernanceTimelock.builder.abi.json) 与 [手工填写说明](safe-builder/手工填写说明.md)

Transaction Builder 的目标合约为 **Timelock `0x02f453192530e07541E61B43DA079273F410979b`**，BNB value 为 **0**；Safe `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03` 是发起账户。

当前只应先构建并由用户执行 scheduleBatch。它实际执行上链后至少等待 600 秒，再运行 `node live-test/governance.mjs --env ../.env --deployment live-test/deployment-state.json --inspect`，得到 `READY_FOR_USER_SAFE_EXECUTION` 后构建/执行第二笔 executeBatch。两笔各需 2/2，不能合并立刻执行。

## 2026-10-19：用户完成 Safe schedule 后的只读复核

用户提供 Safe 页面，显示 `scheduleBatch` 已 2/2 签署并执行成功。随后通过 RPC 只读复核，记录为 [governance-inspection-1792418836681.json](observations/governance-inspection-1792418836681.json)。

- finalized 检查点：128567382，hash `0x17075ed15b9f8979d20695e71e2b9c7ba125795b4723f025a16a1250689117eb`，北京时间 2026-10-19 22:07:01。
- 预定 operationId `0x811d9fff56b2f952640c71d9f7558794b726ba0fdeed549d297879f1c5bb35f5` 已存在，状态 `WAITING_TIMELOCK_DO_NOT_EXECUTE`；检查点剩余 511 秒。
- 链上 readyAt 为 `1792419332`，即北京时间 **2026-10-19 22:15:32**。到时仍需再次运行只读检查，取得 `READY_FOR_USER_SAFE_EXECUTION` 后，才能执行第二笔 `executeBatch`。
- `creationPaused=true`，配置尚未生效。用户本次提供的截图未包含完整交易 hash，因此此处不填写或推测其 hash。
- 本次核验没有签名或广播交易；仍未进行矿机买卖。

## 2026-10-19：executeBatch 执行前就绪核验

用户确认等待结束后再次运行只读 `--inspect`，完整结果见 [governance-inspection-1792419443813.json](observations/governance-inspection-1792419443813.json)。

- 返回 `READY_FOR_USER_SAFE_EXECUTION`；operation 状态为 READY，`canExecute=true`，剩余等待为 0。
- finalized 检查点时间戳 `1792419428` 已超过 readyAt `1792419332`。
- operationId、configHash 与原始治理批次一致；从指定 Safe 地址模拟 `executeBatch` 内层 Timelock 调用通过。该模拟不代替真实 Safe 双签及外层执行回执。
- 本次检查无签名、无广播；第二笔 Safe `executeBatch` 尚待用户构建和执行。

## 2026-10-19：executeBatch 完成后的链上复核

用户报告第二笔 Safe 交易成功后，再次运行只读检查，完整结果见 [governance-inspection-1792420465210.json](observations/governance-inspection-1792420465210.json)。

- finalized 检查点：128570997，hash `0xc1821a297c6943fecc6878e188b6f9036afc1ef89ab43730d55cf61d64006f2b`，时间戳 `1792420448`。
- 状态 `ALREADY_EXECUTED`，operation 为 DONE，Timelock timestamp 为完成标记 `1`。operationId 与原始批次完全一致。
- `selectedTemplate=0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a`；模板批准、版本与 codeHash 均通过后置条件。
- `selectedConfigHash=0x9469c79d863bbdd7831478b42a27714454375c25ed63199875cc87891374bd7a`；配置已批准且存储内容重新计算的 hash 一致。
- `creationPaused=false`，建池暂停已解除。
- Factory 实现仍为 `0xE45D94579425a6a2006D3e067C8d51De6B15C4fc`；Timelock 最短延迟及不可降低下限仍为 600 秒，指定 Safe 及角色历史再次核验通过。
- 本次使用已完成操作的链上状态及 Factory 后置条件作为成功证据，未推测用户未提供的 Safe 交易 hash 或 gas 费用；四笔部署 gas 合计不包含用户执行 Safe 交易的 gas。
- 此检查不签名、不广播。当前完成的是部署和初始配置；尚未在本次流程中执行建池、出资、购买矿机或收益领取。

`deployment-state.json` 保留四笔部署时的原始 `DEPLOYED_UNCONFIGURED` 状态供部署回执验证器使用；当前治理状态以上述最新 observation 和本报告为准，不改写原始部署证据。
