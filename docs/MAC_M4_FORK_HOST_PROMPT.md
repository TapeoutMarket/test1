# 交给另一台 macOS M4 的 Codex

将同一份工程源码包复制并解压到远端 Mac 的一个独立文件夹，让 Codex 在该文件夹打开。下面整段是可复制给远端 Codex 的任务；其中源 RPC 和网关 token 不需要出现在聊天中。

---

请在**当前工程目录**为 TapeOut GroupBuy 的真实状态 fork 测试准备并启动一台局域网测试服务。此电脑是 macOS、Apple M4。工程已经提供 `scripts/fork-host.mjs`，请使用现有脚本；不要另写一个无鉴权的 Anvil 公网服务。

本轮授权范围：在本机运行 BSC 固定区块的 Anvil 副本和受限 LAN 网关，主测试电脑随后会在该副本部署与测试合约。**不得部署主网、向源 RPC 广播交易、修改真实卖单/授权、操作生产市场或数据库。** 不读取其他项目、旧 `.env`、钱包文件、私钥或助记词。只读当前解压工程及用户明确提供的文件。不配置公网端口映射，不关闭全局防火墙，不执行 `sudo`。

请完成以下工作，不要只输出安装方案。

## A. 检查工程和运行时

1. 确认当前目录包含 `scripts/fork-host.mjs`、`scripts/fork-connect.mjs` 和 `package.json`；核对用户提供的源码包 SHA-256。如果缺文件或 hash 不一致，停止使用该包并报告差异。
2. 确认 `uname -m` 为 `arm64`、Node 为原生 arm64 且版本 >=20.19、Anvil 为 **v1.4.3**。已有合格工具直接复用。
3. 缺少工具时，通过 Node.js / Foundry 的官方发布渠道核实兼容的 macOS arm64 包及校验值，在当前工程目录内安装并验证。不要假设下载地址、版本或校验值；先核对官方资料。不使用 Rosetta，不升级用户其他项目的运行时，不全局安装无关软件。
4. 这里只需要运行 Node 脚本和 Anvil，不必编译 Solidity、安装 solc 或跑整套合约测试。先读取脚本的 `--help` 和本工程说明，确认它实际使用的参数；如果实现与本 prompt 不一致，报告具体差异，不放宽安全检查绕过。

## B. 收集并确认最小输入

需要以下公开配置：

- `FORK_BLOCK_NUMBER`：主测试窗口确认的十进制 BSC 固定区块号。
- `FORK_BLOCK_HASH`：同一区块完整 hash。
- `FORK_BIND_HOST`：本机一张明确 LAN 网卡的 RFC1918 IPv4 地址。
- `FORK_ALLOWED_CLIENT_IPS`：仅当前主测试电脑的 LAN IPv4 地址。
- `FORK_GATEWAY_PORT=18545`：LAN 网关端口；内部 Anvil 使用 `127.0.0.1:18546`。

若未给出网卡/IP，可读取本机网卡信息并列出适用候选，等待用户确认应使用的网络；不要自行开放所有网卡或整个子网。若指定端口已经占用，报告占用情况，不终止未知进程、不静默改端口。

`FORK_SOURCE_RPC_URL` 是用户的 **BSC 只读源 RPC**。若尚未配置，让用户在本机终端隐藏输入并导出环境变量，或使用用户认可的本机秘密传递方式。不要要求用户把密钥贴进聊天，不打印/回显 URL，不写入报告、shell 历史或源码。不要自动加载 `.env`。

可供用户在 zsh 终端亲自运行的私密输入示例：

```zsh
read -r -s 'FORK_SOURCE_RPC_URL?请输入 BSC 源 RPC（隐藏输入）：'
print
export FORK_SOURCE_RPC_URL
```

如果主测试窗口还没有选择固定区块，只能通过该 RPC **只读** 查询 finalized 区块或提出保守确认深度候选，记录 number/hash/timestamp，等待用户或主测试窗口明确确认后再继续。不能自动使用 `latest`，不能在运行中自动换块。源 RPC 必须能够读取该固定块的合约状态，能返回区块头不代表已具备历史状态。

## C. 配置仅用于 fork 的公开测试账户

使用默认 Anvil 测试账户的公开地址，不导入任何真实钱包密钥。`FORK_SANDBOX_ACCOUNTS` 使用脚本要求的逗号分隔格式，包含：

```text
deployer / A = 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
B            = 0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc
guardian     = 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
```

这些是公开测试身份。账户资金补充、交易和状态变更只能发生在 Anvil 副本；不得向这些地址转真实 BNB。A 与 guardian 必须不同。

```bash
export FORK_SANDBOX_ACCOUNTS=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266,0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc,0x70997970c51812dc3a010c7d01b50e0d17dc79c8
```

该允许列表为空时，网关会拒绝本地账户发送、资金补充和 impersonation；请勿遗漏后再放开任意账户。

## D. 启动既有服务并核对隔离

在所有输入确认后设置上述变量，运行：

```bash
node scripts/fork-host.mjs --start
```

服务必须满足：

- 内部 Anvil 只监听 loopback `127.0.0.1:18546`，chainId 保持 **56**，固定 fork number/hash 已核对。
- LAN 上只开放指定网卡的网关 `FORK_BIND_HOST:18545`，同时校验精确客户端 IP 和 token；未知来源、无 token、错误 token 应被拒绝。
- 源 RPC 经过仅允许读取方法的本地代理；所有写请求留在 Anvil。子进程命令行不得包含真实源 RPC URL。
- 限制状态修改方法；不得向外暴露任意 source 转发或在真实协议上覆盖代码/存储的便利接口。
- 将本次秘密 token 保存在 `.runtime/fork-host/token.txt`，权限 **0600**；不要打印到聊天、日志或 session JSON。
- 将公开 session 信息保存到 `deployments/fork/56/lan-session.json`。核对它不含源 RPC 凭证或 token，包含明确 session 身份和固定区块信息。

如 Node 入站被 macOS 防火墙阻止，说明具体阻断并请用户授权仅允许该 Node 服务入站；网关自身仍必须保持 IP 和 token 检查。不得关闭全局防火墙、改变路由器端口映射或开放公网。

使用当前终端保持服务运行，必要时让 `caffeinate` 的生命周期跟随该服务以免 Mac 休眠；不得永久修改系统睡眠设置。不要因为脚本已启动就声称远端客户端联通或真实 fork 集成测试已通过；必须按实际完成层次记录结果。

## E. 验证并交接

执行现有脚本提供的只读健康/身份检查，验证 chainId、Anvil 标识、固定区块 number/hash、session 身份，以及无鉴权请求确实被拒绝。不要发送真实源 RPC 写方法来“试试看”。主测试电脑连通性需由它实际验证，未发生就记为待验证。

最终向用户报告以下**公开**内容：

1. 当前目录、源码包 SHA-256、Node 与 Anvil 的实际版本和架构。
2. LAN 网关 URL、允许的客户端 IP、内部 loopback 端口。
3. 固定区块 number/hash/timestamp、session ID。
4. `deployments/fork/56/lan-session.json` 文件位置及文件内容是否脱敏。
5. 服务进程状态、已完成检查、仍未完成的远端连通/订单/完整生命周期检查。
6. 停止方式：在运行终端 Ctrl+C（SIGINT）；确认网关、内部 Anvil、只读源代理和相关防休眠进程全部退出并释放本次端口，不影响其他进程。

token 只提示其文件路径和权限。请用户通过其认可的安全渠道将该文件交给主测试电脑，**不要把 token、源 RPC 密钥或真实钱包信息发回聊天**。

主测试电脑若没有源 RPC 凭证，会依赖本次远端 session 的固定区块身份证明；请如实标记这是远端证明，而非主测试电脑独立直连上游核验。完整真实 fork 生命周期仍需后续实际执行。

主测试电脑会使用本工程的 `scripts/fork-connect.mjs --start`，配 `FORK_GATEWAY_URL`、私密 `FORK_GATEWAY_TOKEN`、`FORK_SESSION_ID`、`FORK_BLOCK_NUMBER`、`FORK_BLOCK_HASH`、`FORK_RELAY_PORT=18547`，在本机建立 loopback relay。其测试 CLI 使用 `EXECUTION_RPC_URL=http://127.0.0.1:18547`、`MODE=fork`、`FORK_EXECUTION_TOPOLOGY=lan-relay`；不直接把源 RPC 用作执行地址。

本次任务仅交付可用的远端 fork 服务与公开交接信息。真实订单由市场窗口提供；后续完整测试由主测试窗口执行。没有真实订单或 Mining 正数收益时，不伪造成功。
