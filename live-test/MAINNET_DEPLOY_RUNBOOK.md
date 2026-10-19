# BSC 主网部署与多签配置操作手册

本手册对应 `live-test/SESSION_PLAN.json`：Safe 为 `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03`，Timelock 最短延迟为 **600 秒**。本次交付只准备部署与配置。真实部署、Safe 双签、挂单、出资、购买和领取的执行情况，必须分别以真实回执和状态核验记录为准。

## 1. 谁执行什么

| 顺序 | 操作 | 签署者 | 需要 Safe 2/2 吗 |
| --- | --- | --- | --- |
| 1 | 部署 GroupBuyVault 模板（构造时创建 MarketValidator） | creator | 否 |
| 2 | 部署 GovernanceTimelock，floor=600，Safe 为 proposer/executor/canceller | creator | 否 |
| 3 | 部署 GroupBuyFactory 实现 | creator | 否 |
| 4 | 部署 ERC1967Proxy，构造时原子初始化 | creator | 否 |
| 5 | scheduleBatch：提交初始配置计划 | 现有 Safe | **是，两位 owner 都确认，然后执行上链** |
| 6 | 等待 schedule 实际执行区块之后至少 600 秒 | 无交易 | 否 |
| 7 | executeBatch：执行同一个配置计划 | 现有 Safe | **是，另一次两位 owner 都确认，然后执行上链** |
| 8 | 读取最终配置、角色、回执和 runtime | 本地只读脚本 | 否 |

部署四笔的 `value` 均为 0，只支付 gas。两笔 Safe 调用的 value 也为 0；最终执行者/relayer 仍需为外层 Safe 交易支付 gas。Safe 签名达到 2/2 但没有执行上链时，Timelock **尚未开始计时**。schedule 和 execute 不能合成一笔立即执行的交易。

核验的两个 Safe owner：

- `0xf0972A5ee0FD4054159A8c7177e59126ef478dA9`
- `0x15C059A5aCB36142Eea576BDbC0330Fd7E9d3099`

creator/A/B 均不是上述 Safe owner。脚本不会请求或使用这两位 owner 的私钥。请通过各自钱包在 Safe 中确认。

## 2. 初始化与资产权限

Factory upgradeAdmin 是新 Timelock，guardian 是 B `0x63979C9d5200A5080be93eb440D469d2F2ec6682`。Timelock 只有自身持有 DEFAULT_ADMIN_ROLE，没有部署者 bootstrap admin。Safe 持有 proposer/executor/canceller；creator 仅为部署付款人和后续参与者。

第 4 笔将实现地址、Timelock、guardian、600 秒要求放进代理构造参数，初始化与创建发生在同一笔交易中。Factory 最初暂停建池。治理 executeBatch 按顺序原子完成：`approveTemplate`、`approveConfig`、`selectConfiguration`、`resumeCreation`。

Vault 使用固定实现 ERC-1167 clone，没有资产管理 owner，也没有升级入口。Factory/guardian 的紧急取消仍限于未买成的池进入可退款；不能提款、替换退款受益人或控制已购矿机。全部 100 份的普通持有人才有正常赎回权。

## 3. 本地文件和检查

所有命令从这个目录执行：

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --test live-test/*.test.mjs
node live-test/preflight.mjs --env ../.env
node live-test/inspect-governance.mjs --env ../.env
```

只使用当前工作区 `../.env` 的 `BSC_RPC_URL`。只有人工执行第 5 节的广播模式并完成逐笔确认后，部署入口才使用其中的 `CREATOR_PRIVATE_KEY`，且必须推导为 `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`。A、B 的私钥不参与部署。

本轮验收报告会列出已经通过的部署草稿、fork rehearsal 文件及 bundle hash。它们必须一一匹配；不能混用不同时间生成的文件。

如果开始前 creator nonce 已变化，而且**尚未开始任何一笔部署/预算预留**，重新生成草稿并重新跑 rehearsal：

```bash
node live-test/prepare-deployments.mjs --env ../.env
node live-test/rehearse-deployment.mjs --env ../.env \
  --bundle live-test/observations/unsigned-deployments-实际新文件名.json --run
```

这条 rehearsal 命令需要本地 Anvil 1.4.3 和可读固定区块的 RPC。它自行启动并关闭仅绑定 127.0.0.1 的独立 fork，上游代理只放行读请求，不读取私钥、不改变主网余额。测试中的 impersonation 与推进时间只存在本地 fork。请使用命令实际输出的新文件路径和 hash。

如果已经部署了一部分，不能通过生成新 bundle、删除 journal/预算文件的方式从头重来。需要先核对当前链上 nonce、每笔 receipt 和已创建合约，再制定后续恢复方案。

## 4. 先运行不广播的部署预览

以下是本轮已经通过演练的实际三个值（均不是秘密）。若你重新生成过草稿或 rehearsal，则改用新运行输出，不能混用：

```bash
TAPEOUT_BUNDLE='live-test/observations/unsigned-deployments-1792415847788.json'
TAPEOUT_REHEARSAL='live-test/rehearsals/deployment-2f3eb594-5f59-4507-869d-20abc20062ee.json'
TAPEOUT_BUNDLE_HASH='0x72166ad218a0963b3eeee898d62da0514e69fec8afed2a91b38e6e7eb138012d'

node live-test/deploy-mainnet.mjs --env ../.env \
  --bundle "$TAPEOUT_BUNDLE" --rehearsal "$TAPEOUT_REHEARSAL" --step 1
```

成功输出 `READ_ONLY_PLAN` 和 `transactionsSent: 0`。预览检查来源链固定区块、实时 Safe/协议身份、当前 nonce、代码空地址、实际创建模拟、gas 及余额。部署 gas 之外会为 creator 保留 **0.20301 BNB**，供后续 67 份本金使用。

第 2–4 步的主网预览需要前置合约已经真实部署和确认；本次独立 fork 会提前覆盖整个顺序，包括代理构造与初始化。主网每一步仍会重新模拟。

## 5. 用户在终端逐笔部署

阅读本轮验收报告并接受本次测试发布范围后，在你操作的终端设置现有广播开关。`LIVE_RELEASE_VERIFIED` 是你的发布检查声明，不代表已有外部安全审计，也不表示实链流程已经测试成功。本次交付没有替你修改 `.env` 或设置进程开关。

```bash
export MODE=live
export ALLOW_LIVE_SEND=true
export LIVE_RELEASE_VERIFIED=true
```

下面采用**每笔最高 0.0006 BNB gas、累计最高 0.0015 BNB** 的本轮部署预算。它们是你运行命令时设置的硬限制，不是预计收费金额。累计账本按 `value + gasLimit × gasPrice` 保守预留，不因回执成功/失败自动返还额度，已有预留也计入；实际费用另从 receipt 记录。此限额仅覆盖当前四笔部署，不含 Safe 执行者的 gas，也不覆盖之后 0.303 BNB 的出资。若实际报价超限，脚本停止；先核对报价与余额，不要删除账本重置。

```bash
node live-test/deploy-mainnet.mjs --env ../.env \
  --bundle "$TAPEOUT_BUNDLE" --rehearsal "$TAPEOUT_REHEARSAL" --step 1 \
  --broadcast --reviewed-bundle-hash "$TAPEOUT_BUNDLE_HASH" \
  --max-tx-fee-bnb 0.0006 --max-total-spend-bnb 0.0015
```

检查终端显示的合约名、nonce、预测地址、initcode hash、bundle hash、gas 和最大费用，粘贴它输出的完整 `SEND DEPLOY ...` 行。必须在真实交互终端输入，不能通过管道喂确认。

**每一步显示 `CONFIRMED` 后，才执行下一步。** 如果走了恢复核验，输出会是 `RECEIPT_RECONCILED_NO_SEND`，且 journal 中对应 `step.status=CONFIRMED`，也可继续。每条命令都独立确认，不要放进自动循环：

```bash
node live-test/deploy-mainnet.mjs --env ../.env \
  --bundle "$TAPEOUT_BUNDLE" --rehearsal "$TAPEOUT_REHEARSAL" --step 2 \
  --broadcast --reviewed-bundle-hash "$TAPEOUT_BUNDLE_HASH" \
  --max-tx-fee-bnb 0.0006 --max-total-spend-bnb 0.0015

node live-test/deploy-mainnet.mjs --env ../.env \
  --bundle "$TAPEOUT_BUNDLE" --rehearsal "$TAPEOUT_REHEARSAL" --step 3 \
  --broadcast --reviewed-bundle-hash "$TAPEOUT_BUNDLE_HASH" \
  --max-tx-fee-bnb 0.0006 --max-total-spend-bnb 0.0015

node live-test/deploy-mainnet.mjs --env ../.env \
  --bundle "$TAPEOUT_BUNDLE" --rehearsal "$TAPEOUT_REHEARSAL" --step 4 \
  --broadcast --reviewed-bundle-hash "$TAPEOUT_BUNDLE_HASH" \
  --max-tx-fee-bnb 0.0006 --max-total-spend-bnb 0.0015
```

四笔完成后 `live-test/deployment-state.json` 应为 `DEPLOYED_UNCONFIGURED`。确认至少 15 个区块、canonical receipt、nonce、initcode、runtime 与 fork 对齐、治理角色和初始化均通过，才会写入 `CONFIRMED`。15 个确认数不是绝对终局保证。

广播前先持久化预算，再记录部署步骤，签名后在发送前持久化交易 hash。RPC 发送结果不明时不会自动重发。预算与 journal 相互校验，不能删除一边后绕过累计预算。期间不要使用 creator 发送其他交易。

## 6. 超时或中断后的核对

如果已经记录 hash，但未完成 receipt 确认，将 `--step` 替换为相应步骤，执行：

```bash
node live-test/deploy-mainnet.mjs --env ../.env \
  --bundle "$TAPEOUT_BUNDLE" --rehearsal "$TAPEOUT_REHEARSAL" \
  --step 1 --reconcile
```

这只核对已记录的同一笔交易，不签名、不重发，也不自动提高 gas。仍 pending、缺 receipt、nonce 被别的交易占用、实际 revert、预算存在但 journal 缺失、journal 没有 hash 或锁文件残留，都应保留文件并核对后恢复，不要盲目重试。代理初始化会用到前面预测的地址，真实失败部署消耗 nonce 后不能照搬旧包继续。

本入口的部署后置条件检查要求 Factory 尚处于初始暂停状态。第 7 节治理配置生效后，使用 `governance.mjs --inspect` 做最终核验，不要再用部署步骤的 `--reconcile` 判断配置成功。

## 7. 生成两份 Safe 导入文件

四笔部署都确认后运行：

```bash
node live-test/governance.mjs --env ../.env \
  --deployment live-test/deployment-state.json
```

脚本重新核对四笔主网部署回执、源码与 rehearsal、Safe 身份、Timelock 从部署至检查点的全部角色授予/撤销历史、Factory 代理和固定模板，然后输出：

- `files.schedule`：`safe-schedule-时间戳.json`，第一次 Safe 交易。
- `files.execute`：`safe-execute-时间戳.json`，等待后第二次 Safe 交易。
- `files.bundle`：两笔调用、四项内部配置、operationId、configHash 完整记录。
- `files.config`：后续建立 live manifest 所需配置；**它本身不是 reviewed live manifest**。

打开 [Safe 官方应用](https://app.safe.global/)，切换 BNB Smart Chain，选中上述 Safe。按照 [Safe 官方 Transaction Builder 指南](https://help.safe.global/articles/4180673514-transaction-builder)，进入 **New Transaction → Transaction Builder**，导入本次输出的 schedule JSON。

核对链 56、Safe 地址、目标为本次新 Timelock、value=0、调用为 scheduleBatch、delay=600。`operationId` 是对 batch 参数计算出的结果，不是函数的单独参数；Safe 界面可能不显示它。若界面没有解码 raw data，请对照 `files.bundle` 中的 calldata、targets、values、payloads、predecessor 和 salt；本地脚本会与 Timelock 的 `hashOperationBatch` 比较 operationId。由两位 owner 分别确认，然后执行上链。它只是排队配置，此时 Factory 仍暂停创建。

查询是否就绪：

```bash
node live-test/governance.mjs --env ../.env \
  --deployment live-test/deployment-state.json --inspect
```

- `SCHEDULE_REQUIRED`：尚未在检查点看到 schedule 执行，退出码 2。
- `WAITING_TIMELOCK_DO_NOT_EXECUTE`：未满延迟，显示剩余链上秒数，退出码 2。
- `READY_FOR_USER_SAFE_EXECUTION`：内层 executeBatch 模拟通过，退出码 0。
- `ALREADY_EXECUTED`：配置执行及最终状态核验通过，退出码 0。

检查点使用 finalized，可能稍落后于最新区块；请再次查询，以链上时间为准，不以本机倒计时或 Safe 第一次签名时间为准。

达到 READY 后，在同一 Safe 中导入对应的 execute JSON。再次核对目标/value/operationId，由两位 owner 重新确认并执行。不要重用上一笔 Safe 签名。两份文件的 Timelock batch、predecessor、salt 必须相同，execute 没有 delay 参数。

execute 上链并确认后，再运行同一个 `--inspect`，得到 `ALREADY_EXECUTED`。这证明配置已经执行；外层 Safe 实际执行 gas 和签名交易哈希还应保存在实链报告中。

## 8. 此阶段完成标准与下一阶段

完成标准：四个真实部署回执匹配；Safe schedule 与 execute 均有真实成功记录；inspection 显示 `ALREADY_EXECUTED`，`creationPaused=false`，选中的模板和 config hash 正确，角色历史没有额外成员。

本阶段不会自动批准 NFT、生成可成交订单、建池或付款。部署和配置核验后，才可据实生成 reviewed live manifest，并继续 A 以 0.3 BNB 出售 #3204、creator 67 份支付 0.20301 BNB、B 33 份支付 0.09999 BNB 的测试。不要将旧 fork manifest 当成主网 manifest 使用。

两笔 Safe 内层调用的 fork 成功不等于真实 Safe `execTransaction` 的 2/2 签名验证，也没有测得真实 Safe 外层 gas。主网步骤未执行时，必须继续标记 NOT_RUN。
