# 主测试电脑：连接远端 fork 并执行测试

适用于另一台 macOS M4 已按 [远端 prompt](MAC_M4_FORK_HOST_PROMPT.md) 启动网关的情况。两端使用同一版本源码包。当前交付时，**真实 BSC 状态 fork、跨两台电脑的 LAN 联通和真实订单完整生命周期均为 NOT_RUN**；下面是待执行步骤，不能当作成功记录。

本机负责编译、SDK/CLI 和报告；远端 M4 只运行 Node 网关与原生 Anvil，不需要安装 Solidity 编译器或 Rosetta。所有示例的 `<...>` 都必须替换为本次实际值。不要加载旧 `.env`，不需要真实钱包私钥或助记词。

## 1. 接收公开资料，核对同一个 session

在本工程目录操作。先安全接收远端的公开 `deployments/fork/56/lan-session.json`，以及本次真实订单 JSON。不要用本仓库合成样本替代真实订单。完整输入要求见 [FORK_INPUTS.md](FORK_INPUTS.md)。

```bash
cat deployments/fork/56/lan-session.json
```

该文件应有 `scope=BSC_FORK_TRANSPORT`、`kind=LAN_ANVIL_FORK`、`chainId=56`，并包含：

- `instanceId`：本次 session UUID，映射为 `FORK_SESSION_ID`。
- `forkBlockNumber` / `forkBlockHash`：与已确认区块一致。
- `gatewayURL`：远端具体 LAN IPv4 加端口，映射为 `FORK_GATEWAY_URL`。
- `allowedClientIPs`：包含本机正在使用的 LAN IPv4。
- `sandboxAccounts`：包含下面 A、B、guardian 三个公开测试账户。

不要 `source` 或 `eval` 这个 JSON。`sourceRPC` 应为脱敏标记，文件不应包含 token 或真实源 RPC 凭证。host 重启会产生新的 session/token；旧 relay 必须停止并用新的公开信息连接，不静默沿用旧部署地址。

## 2. 终端一：私密输入 token，启动 loopback relay

以下都是公开配置，使用 session 文件中的原值：

```bash
export FORK_GATEWAY_URL='<session.gatewayURL，例如 http://192.168.1.20:18545/>'
export FORK_SESSION_ID='<session.instanceId>'
export FORK_BLOCK_NUMBER='<session.forkBlockNumber>'
export FORK_BLOCK_HASH='<session.forkBlockHash>'
export FORK_RELAY_PORT=18547
```

用户在本机 zsh 终端亲自隐藏输入 token；token 通过认可的安全渠道取得，不在聊天中发送：

```zsh
read -r -s 'FORK_GATEWAY_TOKEN?请输入本次 fork 网关 token（隐藏输入）：'
print
export FORK_GATEWAY_TOKEN
node scripts/fork-connect.mjs --start
```

或者用户已把 token 安全保存至本工程 `.runtime/fork-client/token.txt`，可用 `export FORK_GATEWAY_TOKEN="$(cat .runtime/fork-client/token.txt)"` 读入后启动同一命令。不要打印 token、完整 `env` 或使用 `set -x`。

只有输出 `LOOPBACK_FORK_RELAY_RUNNING` 才说明本次 relay 已通过远端 session/Anvil/固定区块检查并开始监听 `127.0.0.1:18547`。它不代表订单或购买测试成功。保持终端一运行；Ctrl+C 仅停止本机 relay，不会停止远端 host。

## 3. 终端二：编译与设置执行环境

在同一工程新开终端。这里只使用本地编译工具，不启动第二个 Anvil。需要 Node >=20.19、Foundry v1.4.3；`bootstrap` 检查/准备本机 solc 0.8.24。如果工具链不能运行，应修复本机工具链，不要求远端节点机安装编译器。

```bash
npm ci --ignore-scripts
node scripts/bootstrap.mjs
npm run build:seaport
npm run build
npm run typecheck
npm run test:sdk
```

明确选择 fork 模式；终端二不需要网关 token 或源 RPC 密钥，因为终端一的 relay 已持有 token：

```bash
export MODE=fork
export FORK_EXECUTION_TOPOLOGY=lan-relay
export EXECUTION_RPC_URL=http://127.0.0.1:18547
export SOURCE_CHAIN_ID=56
export EXPECTED_EXECUTION_CHAIN_ID=56
export FORK_SESSION_ID='<同一 session.instanceId>'
export FORK_BLOCK_NUMBER='<同一 session.forkBlockNumber>'
export FORK_BLOCK_HASH='<同一 session.forkBlockHash>'
export ALLOW_LIVE_SEND=false
export FORK_A=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
export FORK_B=0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc
export FORK_GUARDIAN=0x70997970c51812dc3a010c7d01b50e0d17dc79c8
```

所有交易使用远端 Anvil 解锁的公开测试账户，且须在 host 的允许列表内。CLI 始终使用 `--send-local`；本轮不使用 CLI 的 `--broadcast`，也不设置任何 `*_PRIVATE_KEY`。

## 4. 导入订单并只读预检

市场窗口交出的真实订单先放到本工程 `fixtures/real-order.json`。以下导入不会签名、发送交易或改写订单；`--out` 不覆盖已有文件，已有本次冻结文件时直接使用它：

```bash
npm run cli -- import-order --order fixtures/real-order.json --out fixtures/frozen-order.json
export ORDER_FILE=fixtures/frozen-order.json
node scripts/fork-preflight.mjs
npm run cli -- protocol-check --order "$ORDER_FILE"
```

检查 `reports/fork-status.json` 中 `preflight.status=PASS`，以及 `protocol-check` 的 `executable=true`。总状态仍是 `NOT_RUN`，因为只读预检没有执行完整生命周期。客户端未配置源 RPC 时，报告会记录 `directSourceReadByClient:false` 和远端 session 证明；不得表述为客户端独立直连上游核验。

订单的 `validation.blockNumber/blockHash` 必须对应这个固定 fork。缺签名、域、真实 codehash 或协议身份就补齐资料，不能把 unknown 手改为 verified 来绕过。官方 Circuit 适配仍禁用。授权丢失、订单到期或已成交时不继续购买，也不自动修改真实卖单。

## 5. 生成本次 Config 和 deadline

Mining/BEM 地址必须来自本工程收到的真实协议资料。脚本只读取真实 getter/codehash，不代表已确认代理实现、claim 收款人及 BEM 非扣税/非 rebase 语义。

```bash
export FORK_MINING_ADDRESS='<经资料核验的真实 Mining 地址>'
export FORK_BEM_ADDRESS='<经资料核验的真实 BEM 地址>'
export FORK_CASE_NAME=seaport-first-session
export FORK_SAFETY_MARGIN=300
node --import tsx scripts/fork-prepare.mjs
```

默认 deadline 取 `min(订单 endTime - safetyMargin, 当前 fork 时间 + 3600)`，并要求还剩超过 120 秒；可在执行前用 `FORK_DEADLINE` 显式提供合法的十进制时间戳。余量不足时应选择更长有效期订单或重新确认合适固定区块，不能改签署订单时间。

成功输出状态为 `PREPARED_READ_ONLY_NOT_EXECUTED`。对上面的 case 名，输出文件为：

- `fixtures/fork-seaport-first-session.config.json`，实际路径也在结果的 **`configFile`** 字段。
- `reports/fork-seaport-first-session-prepared.json`，记录实际 **`deadline`**、订单 SHA-256、config/terms hash、Mining key/pending、BEM decimals 和 codehash。

```bash
cat reports/fork-seaport-first-session-prepared.json
export FORK_CONFIG_FILE='<复制结果的 configFile，例如 fixtures/fork-seaport-first-session.config.json>'
export FORK_POOL_DEADLINE='<复制结果的 deadline，十进制整数>'
export FORK_POOL_NAME='<复制准备报告 commands.createPlan 中 --name 后的值，例如 tapeout3204>'
```

配置/报告采用不覆盖写入；重跑时输入或观察区块变化，应使用新的 `FORK_CASE_NAME` 保留两次证据，不删除旧文件冒充同一次结果。`pendingRaw>0` 仅表示观察到待领取值，尚不能证明真实 BEM 已进入 Vault。

## 6. 在该 fork 部署、配置和创建池

以下流程与 [原生命周期手册](../FORK_TEST_RUNBOOK.md) 一致；保持本手册的 LAN relay 环境，不将执行 RPC 改回源 RPC。

先查看 A/B 的 fork 余额并与订单付款及 gas 比较：

```bash
cast balance "$FORK_A" --rpc-url "$EXECUTION_RPC_URL"
cast balance "$FORK_B" --rpc-url "$EXECUTION_RPC_URL"
```

若本地余额不足，只能使用网关允许的 `anvil_setBalance` 给已允许的测试账户补充 **fork 余额**，明确记录修改。不得从真实钱包转币。下面金额占位值必须先选定并换成十六进制 wei；不要改变卖家或真实协议余额来伪造测试：

```bash
cast rpc --rpc-url "$EXECUTION_RPC_URL" anvil_setBalance "$FORK_A" '<选定的仅fork余额，十六进制wei>'
cast rpc --rpc-url "$EXECUTION_RPC_URL" anvil_setBalance "$FORK_B" '<选定的仅fork余额，十六进制wei>'
```

部署前先输出计划，然后单独发送至 fork：

```bash
npm run cli -- deploy-local --from "$FORK_A"
npm run cli -- deploy-local --from "$FORK_A" --send-local
```

从此次控制台/部署回执读取三个新地址，不使用旧测试地址：

```bash
export FACTORY_ADDRESS='<此次 fork 新建的 Factory proxy>'
export EXPECTED_TEMPLATE='<此次 fork 新建的 Vault template>'
export TIMELOCK_ADDRESS='<此次 fork 新建的 Timelock>'
export LOCAL_GOVERNOR="$FORK_A"
node --import tsx scripts/configure-local.mjs \
  --factory "$FACTORY_ADDRESS" --template "$EXPECTED_TEMPLATE" \
  --timelock "$TIMELOCK_ADDRESS" --from "$LOCAL_GOVERNOR" \
  --config "$FORK_CONFIG_FILE"
node --import tsx scripts/configure-local.mjs \
  --factory "$FACTORY_ADDRESS" --template "$EXPECTED_TEMPLATE" \
  --timelock "$TIMELOCK_ADDRESS" --from "$LOCAL_GOVERNOR" \
  --config "$FORK_CONFIG_FILE" --send-local
```

该脚本会通过真实 Timelock 的 schedule/execute 流程，并只推进 fork 的时间。核对 `LOCAL_CONFIGURED` 和 `reports/local-governance-*.json`。配置后重新检查订单和 deadline，然后创建池：

```bash
npm run cli -- protocol-check --order "$ORDER_FILE"
npm run cli -- create-pool --order "$ORDER_FILE" --config "$FORK_CONFIG_FILE" \
  --deadline "$FORK_POOL_DEADLINE" --round 1 --name "$FORK_POOL_NAME" --from "$FORK_A"
npm run cli -- create-pool --order "$ORDER_FILE" --config "$FORK_CONFIG_FILE" \
  --deadline "$FORK_POOL_DEADLINE" --round 1 --name "$FORK_POOL_NAME" --from "$FORK_A" --send-local
export VAULT_ADDRESS='<此次成功创建回执中的新 clone 地址>'
```

使用准备报告给出的 Config、deadline 和名称，`--uri` 保持空，使创建条款与准备报告的 `termsHash` 一致。任一地址、deadline、名称或条款变化都应记录新的模拟和 termsHash。

## 7. A 45 份 / B 55 份，退出与满额购买

生成公开 ID 列表：

```bash
export FORK_IDS_A="$(node -e 'console.log(Array.from({length:45},(_,i)=>i+1).join(","))')"
export FORK_IDS_B="$(node -e 'console.log(Array.from({length:55},(_,i)=>i+46).join(","))')"
export FORK_IDS_A_EXCEPT_1="$(node -e 'console.log(Array.from({length:44},(_,i)=>i+2).join(","))')"
export FORK_IDS_ALL="$(node -e 'console.log(Array.from({length:100},(_,i)=>i+1).join(","))')"
```

每笔先运行不带 `--send-local` 的同一命令确认模拟成功，再单独执行发送命令。下面发送序列不是主网广播：

```bash
npm run cli -- contribute --from "$FORK_A" --ids "$FORK_IDS_A" --send-local
npm run cli -- withdraw --from "$FORK_A" --ids 1 --to "$FORK_A" --send-local
npm run cli -- contribute --from "$FORK_A" --ids 1 --send-local
npm run cli -- contribute --from "$FORK_B" --ids "$FORK_IDS_B" --require-completion --send-local
npm run cli -- report --ids "$FORK_IDS_ALL" --out reports/fork-active-45-55.json
```

核对退出的精确退款、ID 1 销毁后复用，以及最后一笔同时完成 100 份铸造和购买。真实矿机 owner 必须变为 Vault，状态为 ACTIVE，`purchaseSpent` 等于目标付款；不是“钱包直接买入成功”就算验收。最后一笔失败时保存回滚原因，先前参与者应仍能退出。

## 8. 正数收益、未领取权益转移

先通过真实 Mining harvest，确认 Vault 实际入账及 `claimable(1)>0`：

```bash
npm run cli -- harvest --from "$FORK_A"
npm run cli -- harvest --from "$FORK_A" --send-local
npm run cli -- report --ids "$FORK_IDS_ALL" --out reports/fork-after-harvest.json
```

对照实际 BEM Transfer、Vault 余额增量、`totalAccounted` 和尾数。只有 pending 变为零不能证明入账。若没有正数实际入账或 ID 1 仍无正数可领，该测试暂停并标记 NOT_RUN/BLOCKED；不 mint、不覆盖存储，不用 Mock 代替真实结果。

保留 ID 1 的未领取权益：A 先仅领取 2～45，B 领取 46～100，再将 ID 1 从 A 转给 B。期间不再 harvest，以便隔离新增 Mining 收益：

```bash
npm run cli -- claim-batch --from "$FORK_A" --ids "$FORK_IDS_A_EXCEPT_1" --send-local
npm run cli -- claim-batch --from "$FORK_B" --ids "$FORK_IDS_B" --send-local
npm run cli -- report --ids 1 --out reports/fork-id1-before-transfer.json
npm run cli -- transfer-shares --from "$FORK_A" --to "$FORK_B" --ids 1 --send-local
npm run cli -- report --ids 1 --out reports/fork-id1-after-transfer.json
```

下面旧持有人的命令**仅模拟**，预期失败；不发送失败交易。若意外成功，停止并记录缺陷：

```bash
npm run cli -- claim-batch --from "$FORK_A" --ids 1
```

新持有人模拟通过后领取：

```bash
npm run cli -- claim-batch --from "$FORK_B" --ids 1
npm run cli -- claim-batch --from "$FORK_B" --ids 1 --send-local
npm run cli -- report --ids 1 --out reports/fork-id1-after-new-holder-claim.json
```

核对转移本身未重置 ID 1 的 `claimed`，B 的实际收款等于该 ID 本次应领；不能把当前 Vault 总余额按持仓比例重新计算。A/B 持仓是 45/55 且 ID 1 中途换手，本轮不能要求两地址总收款相同，应按每个 ID 的权益和领取历史对账。

## 9. 归集、snapshot 与两种赎回分支

B 此时持有 ID 1 和 46～100，将这些归集到 A，再确认 A 持有全部 100 份：

```bash
npm run cli -- transfer-shares --from "$FORK_B" --to "$FORK_A" --ids "1,$FORK_IDS_B" --send-local
npm run cli -- report --ids "$FORK_IDS_ALL" --out reports/fork-before-redemption.json
cast rpc --rpc-url "$EXECUTION_RPC_URL" evm_snapshot
export FORK_EXIT_SNAPSHOT='<复制 snapshot 返回的 0x... ID，不包含 JSON 引号>'
```

正常赎回分支：

```bash
npm run cli -- redeem --from "$FORK_A"
npm run cli -- redeem --from "$FORK_A" --send-local
npm run cli -- report --ids "$FORK_IDS_ALL" --out reports/fork-normal-redemption.json
```

核对全部份额销毁、矿机 owner=A、REDEEMED、收益与尾数实际支付。恢复快照前保存本分支全部 receipt/report，并标明这是即将从当前节点状态回滚的历史测试分支。

回滚后执行独立的无 harvest 分支；`evm_revert` 必须返回 true，且只使用本次 session 的快照：

```bash
cast rpc --rpc-url "$EXECUTION_RPC_URL" evm_revert "$FORK_EXIT_SNAPSHOT"
npm run cli -- inspect --ids "$FORK_IDS_ALL"
npm run cli -- redeem-without-harvest --from "$FORK_A"
npm run cli -- redeem-without-harvest --from "$FORK_A" --send-local
npm run cli -- report --ids "$FORK_IDS_ALL" --out reports/fork-without-harvest-redemption.json
npm run cli -- claim-residual --from "$FORK_A" --to "$FORK_A"
npm run cli -- claim-residual --from "$FORK_A" --to "$FORK_A" --send-local
```

先确认回滚后 ACTIVE 且 A 仍持全部份额。无 harvest 路径应直接交付矿机而不调用 Mining/BEM；残余 BEM 只允许固定 beneficiary=A 领取。若余额为零，此处只证明零余额路径，不能声称验证了正数残余支付或故障恢复。snapshot/revert 后另一个分支的交易不再存在于当前 canonical 状态，报告必须分别记录，不能混合总额。

## 10. 报告与结束

CLI 的交易证据位于 `reports/fork-<command>-<hash>.json`，只读观察位于各 `--out` 文件；连同 session JSON、订单文件/hash、准备报告和治理报告一并保存。本轮报告应分别记录已执行、失败、NOT_RUN 的 case；包括每笔 fork receipt、实际 NFT owner、100 份供应、本金/退款/市场支出、BEM 实收/支付/保留权益/尾数。

本地回执不是主网交易证据。连接成功或只读 preflight PASS 不升级为完整 fork PASS。完成后在终端一 Ctrl+C 停止 relay，再让远端窗口 Ctrl+C 停止 host 并核对端口释放；不关闭其他未知进程或全局防火墙。
