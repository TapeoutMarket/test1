# 固定区块真实协议 Fork 联调手册

本次已在 BSC 固定区块 `128554249` 的本机 fork 完成真实 NFT/Mining/BEM/Seaport 路径测试；订单在 fork 内新建并 validate，未发布主网。实际结果与未覆盖项见 [中文测试报告](docs/REAL_BSC_FORK_TEST_REPORT.md) 和 [原始证据](reports/real-bsc-fork-tests.json)。本手册保留外部完整订单的通用流程；既有公开市场签名订单导入、主网和 UI 联调仍为 **NOT_RUN**。

当前选择**本机 fork**，先按 [本机手册](docs/LOCAL_FORK_RUNBOOK.md) 启动仅监听 loopback 的 Anvil 与上游只读代理，再使用本手册的生命周期命令。无需 LAN IP、token 或另一台 Mac。

若以后重新选择另一台 macOS M4 提供 LAN fork，才使用 [服务端 prompt](docs/MAC_M4_FORK_HOST_PROMPT.md) 和 [客户端手册](docs/FORK_CLIENT_RUNBOOK.md)。两种拓扑互斥；报告明确记录执行位置。没有源 RPC 的 LAN 客户端依赖受信任主机提供的区块身份，不能声称独立验证了上游。

## 1. 冻结输入

由市场窗口在其目录导出完整公开 OrderEnvelope，将 JSON 人工复制到当前仓库 `fixtures/`；合约窗口不扫描其他目录。运行 `npm run cli -- import-order --order fixtures/real-order.json --out fixtures/frozen-order.json`。保存文件 hash、订单签署域、验证区块 number/hash、市场和 NFT codehash。

官方 CircuitMarket 真实适配目前禁用；获得准确源代码/ABI和当前 implementation证据仍须先完成独立适配与测试，不能只把 Envelope.status 改成 verified。Seaport 样本必须属于明确支持的固定价子集。

## 2. RPC 隔离

在 shell 显式设置变量；CLI 不自动加载 `.env`，本手册不提供真实私钥。推荐直接遵循本机手册，使用 `fork-local.mjs` 的只读代理保留凭据。下面是手动直连的备用方式；其中源 URL 会出现在 Anvil 进程参数中，含密钥时不要使用该方式。

```bash
export MODE=fork
export SOURCE_CHAIN_ID=56
export EXPECTED_EXECUTION_CHAIN_ID=56
export EXECUTION_RPC_URL=http://127.0.0.1:8545
export FORK_BLOCK_NUMBER='<用户选择并核验的区块>'
export FORK_BLOCK_HASH='<同一区块真实hash>'
export FORK_SOURCE_RPC_URL='<用户提供的只读RPC；勿写入报告>'
anvil --host 127.0.0.1 --chain-id 56 --fork-url "$FORK_SOURCE_RPC_URL" --fork-block-number "$FORK_BLOCK_NUMBER"
```

`FORK_SOURCE_RPC_URL`仅被 Anvil 读取；SDK 的发送 transport 只能是明确 loopback `EXECUTION_RPC_URL`。CLI同时核对 `eth_chainId`、`web3_clientVersion` 必须为 Anvil、`anvil_nodeInfo.forkConfig.forkBlockNumber`、固定区块 hash。未知客户端或未知 fork metadata 一律停止；chainId=56单独不能证明是安全本地 fork。保留真实 Seaport 签名的 56 域，不能改31337后跳过签名校验。

不得将 source RPC 当执行 URL；不得覆盖真实协议 bytecode/storage；不得用 mockCall、伪造签名或人工mint BEM声称真实协议入账。参与账户可用本地 unlocked/impersonate及本地资金补充，私钥变量在mock/fork完全不用。对卖家合法cancel/改价的impersonate属于明确标注的本地状态变体。

## 3. 编译与只读检查

```bash
npm ci --ignore-scripts
node scripts/bootstrap.mjs
npm run build:seaport
npm run build
npm run typecheck
npm run test:sdk
export ORDER_FILE=fixtures/frozen-order.json
node scripts/fork-preflight.mjs
npm run cli -- protocol-check --order fixtures/frozen-order.json
```

保存检查结果中的执行链、固定区块 hash、codehash、域、counter、status、签名/已验证订单、owner与授权。所有后续市场判断使用本地 fork 状态，不再拿主网最新API报价混入本地结果。quoteExpiresAt是报价TTL，不是永久撤单事实。

## 4. 新 Factory 与 clone

```bash
npm run cli -- deploy-local
npm run cli -- deploy-local --from '<本地公开部署地址>' --send-local
```

第一条仅计划，第二条只允许核验后的本地 Anvil，通过 `script/DeployLocal.s.sol:DeployLocal` 新建 Timelock、模板和 Factory proxy；这个部署步骤不配置市场、不参与、不购买。记录控制台中的 Factory、Template、Timelock 地址以及公开部署账户。Factory 初始暂停，下一步必须通过真实 schedule → 本地延迟 → execute 流程配置后才创建池。

将本地真实 Seaport 配置保存为当前目录 JSON，字段与 `sdk/contracts.ts protocolConfigSchema` 严格一致，chainId 为字符串 "56"、marketKind 为 0、mockOnly=false、market/collection/mining/bem 与真实 fork 配置相同。Config 中的 `marketCodeHash`、`seaportDomainSeparator`、`seaportVersionHash` 及 `safetyMargin` 必须核验；Mining/BEM 地址也要来自真实接口证据。不要复制 Mock 配置或仅修改 mockOnly 字段冒充协议核验。

```bash
export FACTORY_ADDRESS='<本地新Factory proxy>'
export EXPECTED_TEMPLATE='<本地普通固定Vault模板>'
export TIMELOCK_ADDRESS='<同次部署的本地Timelock>'
export LOCAL_GOVERNOR='<部署时具有proposer/executor角色的本地公开地址>'
node --import tsx scripts/configure-local.mjs \
  --factory "$FACTORY_ADDRESS" --template "$EXPECTED_TEMPLATE" \
  --timelock "$TIMELOCK_ADDRESS" --from "$LOCAL_GOVERNOR" \
  --config fixtures/fork-config.json
node --import tsx scripts/configure-local.mjs \
  --factory "$FACTORY_ADDRESS" --template "$EXPECTED_TEMPLATE" \
  --timelock "$TIMELOCK_ADDRESS" --from "$LOCAL_GOVERNOR" \
  --config fixtures/fork-config.json --send-local
```

第一条只核验并输出未执行计划；不会推进时间或发交易。第二条仅接受显式 `MODE=mock|fork`，通过 SDK 校验 loopback Anvil、执行链和 fork 区块身份后，检查模板锁定、代码、协议域、Timelock 角色与真实 delay，发送 `scheduleBatch`，核对成功回执，再仅对本地 Anvil 调用 `evm_increaseTime`/`evm_mine`，模拟并发送 `executeBatch`。四项配置为批准模板、批准完整 Config、选择该版本、恢复新池创建；所有 value 都为 0。

每笔交易单独核对 sender、目标、status；执行后读取固定回执区块的模板批准、配置批准、selectedTemplate/configHash 和暂停状态。证据保存在 `reports/local-governance-<operationId>.json`，不是主网证据。脚本只使用 unlocked/已由用户在本地授权的账户，不读取 `.env` 或私钥；`MODE=live` 与任何 `--broadcast` 参数均拒绝。中断后同一参数可恢复已排期操作；已经完成且后置状态仍匹配时返回无新交易结果。

推进本地时间可能导致真实订单过期，所以配置完成后必须重新只读检查原订单；如果原条款已过期，选择合适订单/固定 fork 起点重做，不能篡改已固定条款或绕过订单时限。

```bash
npm run cli -- protocol-check --order fixtures/frozen-order.json
npm run cli -- create-pool --order fixtures/frozen-order.json --config fixtures/fork-config.json --deadline '<固定期限>' --round 1 --name tapeout3204 --from '<本地发起者>'
```

默认只模拟；确认结果后给**同一条**命令增加 `--send-local`。创建绑定expectedTemplate/configHash与完整Terms/payload；任何条件变化需重做模拟。成功事件中的Vault作为后续 `VAULT_ADDRESS`。Factory不代持参与本金，创建不自动参与。

## 5. 参与、退出、满额

```bash
export VAULT_ADDRESS='<新clone>'
npm run cli -- contribute --from '<A>' --ids 1,2,3
npm run cli -- withdraw --from '<A>' --ids 1 --to '<A或A指定接收者>'
npm run cli -- inspect --ids 1,2,3
```

每条先模拟，选定后独立增加 `--send-local`，检查回执、ID成本、销毁/复用与确切退款事件。45/55案例用逗号分隔的1～45与46～100；最后参与者加 `--require-completion`。制造退出抢先顺序时该最后交易必须回滚，之前参与者仍可退出。不要自动批量发交易到未知RPC。

买成后检验ACTIVE、100个ID供应各1、ownerOf(矿机)=Vault、实际市场调用者=Vault、全部收款与总目标价一致。满额前被别人买走的变体应使最后参与完整回滚。

## 6. 收益、转手与赎回

```bash
npm run cli -- harvest --from '<任意本地公开地址>'
npm run cli -- claim-batch --from '<A>' --ids 1,2,3
npm run cli -- transfer-shares --from '<A>' --to '<B>' --ids 1,2,3
npm run cli -- report --from '<B>' --ids 1,2,3 --out reports/fork-observation.json
npm run cli -- redeem --from '<真实持有全部100份者>'
npm run cli -- redeem-without-harvest --from '<真实持有全部100份者>'
npm run cli -- claim-residual --from '<已固定的redeemedBeneficiary>' --to '<其指定接收地址>'
```

这里依旧默认模拟；普通claim不得强制调用Mining。正数权益转手测试先真实harvest入Vault，再确认claimable>0后转移；旧持有人只读Unauthorized，新持有人领取且claimed历史不重置。余额/事件均用原始整数，Mining.pending不同于已到账收入。不要人工更改真实Mining/BEM状态伪造到账；若当前fork无法实际产生该路径，标记NOT_RUN/阻塞原因。

正常赎回与无harvest赎回是**独立测试分支**，可在本地snapshot/revert隔离，不能在同一个已REDEEMED池依次声称成功。无harvest路径不依赖BEM读取成功；SDK将失败余额观察记UNKNOWN，不阻止持有人紧急路径。NFT自身转移故障仍会阻断交付。

`harvest-and-claim --ids ...`是明确便利入口，会调用Mining；普通`claim-batch`不调用Mining。`claim-residual`用于REDEEMED之后由固定beneficiary领取恢复可用的BEM，不能由creator/guardian任意接管。

## 7. 报告验收

区分本地Mock、真实Seaport Solidity代码配Mock资产、BSC真实状态fork、live与UI。真实fork报告至少记录固定forknumber/hash、输入JSON hash、执行RPC类型、真实外部codehash、Factory proxy/template/clone、每笔hash/receipt、NFTowner、100份供应、出资/退款/支出、BEM入账/支付/尾数及未知项。CLI每笔报告另存 `reports/fork-<操作>-<hash>.json`；只读report不是成功交易证明。

Foundry参考：[Anvil 本地节点与 fork](https://www.getfoundry.sh/anvil/index.html)。不要把该工具文档视为本项目测试通过的证据。
