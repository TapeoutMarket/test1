# TapeOut 协议核验

核验日期：2026-10-03（Asia/Shanghai）。这份记录是**官方公开资料与固定区块只读核验**；没有执行用户目标矿机的真实链 fork，也没有签名或广播。Mock 通过不代表主网兼容。

## 资料、地址与证据等级

官方入口：[TapeOut PoD](https://tapeout.net/pod/)。本次直接读取该页引用的公开前端资源与 [官方主网配置](https://tapeout.net/pod/pod-mainnet.json)，没有读取其他本地项目。地址仅用于公开核验记录，不写为 `.env.example` 或部署脚本默认值。

| 对象 | 官方配置中的 BSC 主网地址 |
| --- | --- |
| 网络 | BNB Smart Chain，chain ID 56 |
| PodMining | `0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46` |
| BEM | `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a` |
| TapeOut 电路 NFT / Processor | `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C` |
| Behemoth 电路 NFT / Processor | `0x1F5Cb4aeaE1807Bf60c3b9C0D8aDBCC14e91f12C` |
| PodLens | `0xdD20B9537b9f5DB9d2A23E6B11Ad863cF81930d8` |

用户尚未选择实际 NFT 合约及 Token ID。`TapeOut12167-TestVault` 是需求示例，不能据此把 12167 视为用户授权测试的真实矿机。

保存的公开证据位于 `docs/evidence/`：

- `pod-mainnet.json`：官方公开配置原文；含 task 元信息，不能当作当前 NFT owner 或当前矿机状态。
- `official-frontend-extract.json`：官方前端 `main-C1q9aWV9.js` 的相关 ABI、短文案及完整原资源 SHA-256。仅保留相关摘录，不保存整份网页 bundle。
- `pod-stats.json`：官方快照，`generatedAt=2026-10-03T01:22:32.224Z`，区块 `125395543`。快照与下面实时 RPC 查询区块不同。
- `public-rpc-discovery.json`、`public-rpc-request.json`、`public-rpc-labels.json`、`public-rpc-response.json`、`public-rpc-summary.json`：通过官网公开 `/rpc` 只读取得的请求、原始响应及摘要，不含私人 RPC 凭证。
- `mining-sourcify.json`：Sourcify 对该 Mining 地址的查询返回 `match: null`；不能当作验证成功。
- `implementation-request.json`、`implementation-response.json`、`implementation-code-request.json`、`implementation-code-response.json`、`implementation-summary.json`：在同一个固定区块解析真实实现并取得实现 runtime code hash。

## 已确认与未确认

只读查询固定在 **BSC 区块 125396248 (`0x7796518`)**，所有 `eth_call` / `eth_getCode` 请求使用该 block tag。

| 检查项 | 结果与限制 |
| --- | --- |
| NFT 标准 | 该 TapeOut collection 的 `supportsInterface(0x80ac58cd)` 返回 true，确认声明支持 ERC-721。没有把晶体管 ERC-1155 与矿机 NFT 混为一谈。用户最终选择其他 collection 时必须重新验证。 |
| Mining 接口 | 官方当前前端 ABI 明确包含 `minerKey(address,uint256) pure returns(bytes32)`、`pending(bytes32) view returns(uint256)`、`claim(bytes32)`（无返回值）。Vault 直接调用这些接口，并向 Mining 查询 key，不自行推测 key 算法。 |
| pending 转移语义 | 官网文案说明未领取收益随 NFT 新 owner。是否在用户选择的真实实现、区块、NFT 上完整成立：**UNVERIFIED**，fork 会断言转移前后 pending 保留且旧 owner 未因转移收到 BEM。 |
| claim 权限与收款人 | 官网文案说明第三方可以触发领取，奖励支付领取当时 NFT holder。真实实现的权限、Vault 上下文与第三方调用路径：**UNVERIFIED**。fork 分别覆盖 Vault 调用及第三方直接调用。 |
| `tx.origin` / 合约账户限制 | **UNVERIFIED**。前端 ABI 和文案不能证明不存在隐藏限制，须取得实际实现源码并跑 Vault 直接调用真实 claim。没有采用会改变 `msg.sender` 的外部 Adapter。 |
| 当前 Mining 状态 | 固定区块 `owner()=address(0)`、`paused()=false`、`isSealed()=true`。这些读值不能证明所有相关合约不可升级，也不能证明指定矿机有收益或仍处于可领取状态。 |
| BEM 小数位 | `decimals()=8`，由固定区块 RPC 确认。UI 仍读取实际 token decimals；合约使用最小单位整数。 |
| BEM 非 rebasing / 无扣税 | **UNVERIFIED**。本轮未取得并匹配实际 BEM 已验证源码，因此不能证明普通 ERC-20 会计假设成立。fork 会严格比较实际收款差额，但一次收款测试也不证明所有路径无扣税或未来永不变更。 |
| 完整真实链路 | **未执行**。缺少用户提供的 RPC、明确目标 NFT、指定 fork 区块等完整参数；仅公开读链不能替代 fork。 |

## 代理、implementation 与源码版本

[Mining BscScan](https://bscscan.com/address/0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46#code) 本次访问返回 Cloudflare 403 页面；[Sourcify 查询](https://sourcify.dev/server/v2/contract/56/0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46?fields=all) 返回没有匹配验证结果。**没有声称已取得完整已验证实现源码。**

固定区块运行时代码证据：

| 合约 | runtime 字节数 | `keccak256(runtime)` |
| --- | ---: | --- |
| Mining | 130 | `0xed6b710a769987f50494d713f278817992e3266e45898a990be878efc2fcbbce` |
| TapeOut collection | 295 | `0xd8c4b0216e0aadd615fbd134465b6af060a11769edc7c844d8f14d1b8a783992` |
| BEM | 2205 | `0x982ba79538b51e54ee1382f57522098af0635b0f67f2574d393b29ed0958b344` |

从实际 runtime 的指令序列可以看到 Mining 读取 EIP-1967 implementation slot 后执行 `DELEGATECALL`；collection runtime 向嵌入地址 `0xf8d6d8eb894d6971c8976ad8b4971cbefe028156` 查询 selector `0x5c60da1b`（`implementation()`），然后 `DELEGATECALL`。因此不能把表面合约视为无代理的最终逻辑。

直接在 Mining、collection、BEM 上调用 `implementation()` 均 revert。这个结果**不表示没有代理**。随后在同一区块读取 Mining 的 EIP-1967 implementation slot，并对上述 collection runtime 中嵌入的 beacon 调用 `implementation()`，取得以下实际实现：

| 入口 | 固定区块 125396248 的实际 implementation | 实现 runtime 字节数 | 实现 `keccak256(runtime)` |
| --- | --- | ---: | --- |
| Mining | `0xa3dbe873da37cd4e4a13c7cef23a7db6ca60f898` | 24574 | `0x63b1124d3448fdeb28b163c52142e15a7a464d7ae7d817e51f6c242b62424479` |
| TapeOut collection（beacon `0xf8d6d8eb894d6971c8976ad8b4971cbefe028156`） | `0x8e1d125def6d3826c278299273a0760d47626068` | 12560 | `0x2ea433839e23b3773b7880d6f1807affb0f648ae98760b9a3b6394879665c345` |

这两个地址和 code hash 由固定区块真实 RPC 响应确认，**实现的完整源码版本/审阅仍 UNVERIFIED**；不能从 code hash 推导不存在限制。上方入口 runtime hash 与本表实现 hash 已明确区分。fork 日志解析标准 implementation slot 的低 20 字节并记录实现地址、code hash；collection 可配置 `MINER_BEACON_ADDRESS` 以再次验证 runtime 嵌入的 beacon 调用模式和实际实现。此参数不填时明确记录该 fork 的 beacon provenance 尚未核实，须另存该 fork 区块的公开只读证据。

本工程固定 Solidity 0.8.24、OpenZeppelin 5.4.0、Foundry forge-std v1.9.7。EVM 目标 `paris` 是保守编译选择，避免让本实验依赖 PUSH0、MCOPY、瞬态存储等较新操作码；使用常规存储型 ReentrancyGuard。没有据此声明已验证 BSC 最新硬分叉全部规则。最终目标链兼容性仍由固定区块 fork 的部署和全流程执行验证。

## Fork 执行方法和失败含义

执行入口 `npm run test:fork`。仅从启动进程环境读取下列公开配置，**不会读取项目 `.env`，也不会读取任何私钥**：

```text
BSC_RPC_URL
EXPECTED_CHAIN_ID
FORK_BLOCK_NUMBER
MINER_COLLECTION
MINER_TOKEN_ID
POD_MINING_ADDRESS
BEM_TOKEN_ADDRESS
FORK_ACCRUAL_SECONDS    # 可选，默认 86400
MINER_BEACON_ADDRESS    # 可选，无默认；用于核验所选collection实际beacon实现
```

在终端自行导出这些参数，再运行入口；不要把带凭证的 RPC URL 粘贴到共享日志或命令示例。参数缺失输出 `UNEXECUTED / 未执行`，退出码 2；格式不正确同样不执行。它不是测试成功。直接编译出的 fork 测试没有 `RUN_FORK_TESTS=true` 时用 `vm.skip(true)` 明确标 skip，不执行 RPC。

`scripts/foundry-runner.mjs` 还提供 `mock` / `build` 两种入口：使用项目内隔离 cwd、显式 root/config 和空 `.env`，防止 Foundry 自动加载根 `.env`；子进程环境采用白名单，不透传私钥。没有重设 HOME。编译产物仍输出到根 `out/`。fork 错误输出中的 RPC 地址被隐藏。

测试从真实 `ownerOf` 取得合法 owner，并只在本地 `vm.prank`。要求起始 `pending > 0`，否则失败并要求更换真实测试状态；不能因 claim 未 revert 就认定兼容。完整测试检查：

1. 原 owner 部署 Vault，并 safeTransfer 真实 NFT；断言所有权、历史 pending 和原 owner 的 BEM 变化。
2. **Vault 自身**调用真实 Mining.claim，要求实际 BEM 正增量；两个 ID 可各领取一半，并严格核对收款差额。
3. 转移 ID 1；旧 holder 失去权限。推进本地 fork 时间/区块，执行未替换的真实 Mining 逻辑；再次要求真实 BEM 正增量，新 holder 实际收到收益。
4. 新 holder 集齐两枚后原子赎回，结清余数、销毁份额并确认 NFT 最终归属。
5. 独立用例检查 owner 正常取回、owner 紧急取回、冻结份额仍能领取，以及第三方 Mining.claim 收入的同步和不重复记账。

本地 `vm.warp` / `vm.roll` 测试的新增收益是**真实合约逻辑在本地时间推进下的模拟结果**，不是对未来真实链状态的观察。`pending()` 可能落后于动态累计值；官方前端另有 Lens `pendingLive(bytes32)`。测试记录 pending，并以 claim 的真实余额增量作为到账判据。没有给 Vault `deal` BEM，没有写 Mining 存储，也没有 mock/替换真实 claim。RPC 只读取链状态，部署与资产操作都在本地 fork。

如果转移自动结算旧收益、Vault 被拒绝领取、第三方 claim 不被允许、余额无正增量、收款扣税或新收益没有增加，对应用例必须失败并记录不兼容条件，不能修改断言让它静默通过。完整报告必须区分已执行、失败、未执行；本地交易标识不能作为真实主网交易凭证。

后续实链前仍须：在所选区块解析并审阅全部实际实现、核验 BEM 会计假设、确认矿机状态及 pending、跑完真实 fork、由用户逐项确认真实操作。owner 无需持有份额即可取回 NFT 是本实验的恢复特权，不是公众众筹机制。
