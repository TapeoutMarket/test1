# TapeOut Protocol Verification

Verification date: 2026-10-03 (Asia/Shanghai). This record covers **official public materials and fixed-block read-only verification**. It did not execute a real-chain fork for the user's target miner and involved no signature or broadcast. Mock success does not prove mainnet compatibility.

## Materials, addresses, and evidence levels

Official entry: [TapeOut PoD](https://tapeout.net/pod/). This work directly read public frontend resources referenced by that page and the [official mainnet configuration](https://tapeout.net/pod/pod-mainnet.json), without reading other local projects. Addresses are recorded only for public verification and are not written as defaults in `.env.example` or deployment scripts.

| Subject | BSC mainnet address in official configuration |
| --- | --- |
| Network | BNB Smart Chain, chain ID 56 |
| PodMining | `0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46` |
| BEM | `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a` |
| TapeOut circuit NFT / Processor | `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C` |
| Behemoth circuit NFT / Processor | `0x1F5Cb4aeaE1807Bf60c3b9C0D8aDBCC14e91f12C` |
| PodLens | `0xdD20B9537b9f5DB9d2A23E6B11Ad863cF81930d8` |

The user had not yet selected an actual NFT contract and token ID. `TapeOut12167-TestVault` is a requirement example; it does not authorize treating 12167 as a real miner selected for testing.

Saved public evidence is in `docs/evidence/`:

- `pod-mainnet.json`: original official public configuration; contains task metadata and cannot establish current NFT owner or miner state.
- `official-frontend-extract.json`: relevant ABI, short copy excerpts, and full original resource SHA-256 from official frontend `main-C1q9aWV9.js`. Only relevant excerpts are retained, not the entire web bundle.
- `pod-stats.json`: official snapshot, `generatedAt=2026-10-03T01:22:32.224Z`, block `125395543`; differs from the live RPC query block below.
- `public-rpc-discovery.json`, `public-rpc-request.json`, `public-rpc-labels.json`, `public-rpc-response.json`, `public-rpc-summary.json`: requests, raw responses, and summary from read-only access through the official site's public `/rpc`; no private RPC credentials.
- `mining-sourcify.json`: Sourcify query for this Mining address returned `match: null`; not a successful verification.
- `implementation-request.json`, `implementation-response.json`, `implementation-code-request.json`, `implementation-code-response.json`, `implementation-summary.json`: actual implementations resolved and their runtime code hashes obtained at the same fixed block.

## Confirmed and unconfirmed

Read-only queries were pinned to **BSC block 125396248 (`0x7796518`)**. Every `eth_call` / `eth_getCode` request used that block tag.

| Check | Result and limitation |
| --- | --- |
| NFT standard | This TapeOut collection returned true for `supportsInterface(0x80ac58cd)`, confirming its declaration of ERC-721 support. Transistor ERC-1155 was not confused with miner NFTs. Reverification is required if the user ultimately selects another collection. |
| Mining interface | The current official frontend ABI explicitly contains `minerKey(address,uint256) pure returns(bytes32)`, `pending(bytes32) view returns(uint256)`, and `claim(bytes32)` (no return value). Vault calls these directly and asks Mining for the key instead of guessing the key algorithm. |
| Pending transfer semantics | Official copy says unclaimed rewards follow the new NFT owner. Full applicability to the user-selected actual implementation/block/NFT: **UNVERIFIED**. Fork assertions require pending to persist across transfer and no BEM payment to the old owner merely from transfer. |
| Claim authority and recipient | Official copy says a third party may trigger a claim and rewards go to the then-current NFT holder. Actual implementation permissions, Vault context, and third-party path: **UNVERIFIED**. Fork coverage separates Vault calls from direct third-party calls. |
| `tx.origin` / contract-account restrictions | **UNVERIFIED**. Frontend ABI and copy do not establish the absence of hidden restrictions. Actual implementation source and a Vault call to the real claim are required. No external Adapter that changes `msg.sender` is used. |
| Current Mining state | Fixed-block reads: `owner()=address(0)`, `paused()=false`, `isSealed()=true`. These do not prove all related contracts are non-upgradeable or that the selected miner has rewards or remains claimable. |
| BEM decimals | `decimals()=8`, confirmed by fixed-block RPC. UI still reads actual token decimals; the contract uses minimum-unit integers. |
| BEM non-rebasing / untaxed | **UNVERIFIED**. Complete verified actual BEM source was not obtained and matched, so ordinary ERC-20 accounting assumptions are not proven. Fork tests strictly compare actual receipt deltas; even one receipt test does not prove every path untaxed or immutable forever. |
| Complete real-protocol flow | **Not executed**. Complete user-provided RPC, explicit target NFT, selected fork block, and other parameters are missing. Public reads do not replace a fork. |

## Proxies, implementations, and source versions

[Mining BscScan](https://bscscan.com/address/0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46#code) returned a Cloudflare 403 page during this access. The [Sourcify query](https://sourcify.dev/server/v2/contract/56/0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46?fields=all) returned no matching verification. **No claim is made that complete verified implementation source was obtained.**

Fixed-block runtime code evidence:

| Contract | Runtime bytes | `keccak256(runtime)` |
| --- | ---: | --- |
| Mining | 130 | `0xed6b710a769987f50494d713f278817992e3266e45898a990be878efc2fcbbce` |
| TapeOut collection | 295 | `0xd8c4b0216e0aadd615fbd134465b6af060a11769edc7c844d8f14d1b8a783992` |
| BEM | 2205 | `0x982ba79538b51e54ee1382f57522098af0635b0f67f2574d393b29ed0958b344` |

Actual runtime instructions show Mining reading the EIP-1967 implementation slot, then executing `DELEGATECALL`. The collection runtime asks embedded address `0xf8d6d8eb894d6971c8976ad8b4971cbefe028156` for selector `0x5c60da1b` (`implementation()`), then executes `DELEGATECALL`. These surface contracts therefore cannot be treated as final non-proxy logic.

Direct `implementation()` calls on Mining, collection, and BEM all reverted. This **does not indicate absence of proxies**. Reading Mining's EIP-1967 implementation slot at the same block and calling `implementation()` on the collection runtime's embedded beacon yielded the actual implementations below:

| Entry | Actual implementation at fixed block 125396248 | Implementation runtime bytes | Implementation `keccak256(runtime)` |
| --- | --- | ---: | --- |
| Mining | `0xa3dbe873da37cd4e4a13c7cef23a7db6ca60f898` | 24574 | `0x63b1124d3448fdeb28b163c52142e15a7a464d7ae7d817e51f6c242b62424479` |
| TapeOut collection (beacon `0xf8d6d8eb894d6971c8976ad8b4971cbefe028156`) | `0x8e1d125def6d3826c278299273a0760d47626068` | 12560 | `0x2ea433839e23b3773b7880d6f1807affb0f648ae98760b9a3b6394879665c345` |

These addresses and code hashes are confirmed by actual fixed-block RPC responses. **Complete implementation source versions/review remain UNVERIFIED**; a code hash does not prove absence of restrictions. Entry runtime hashes above are distinguished from implementation hashes here. Fork logs parse the lower 20 bytes of the standard implementation slot and record implementation address/code hash. `MINER_BEACON_ADDRESS` may be configured for the collection to reverify its embedded beacon-call pattern and actual implementation. If omitted, that fork's beacon provenance is explicitly recorded as unverified and public read-only evidence for that fork block must be saved separately.

This project pins Solidity 0.8.24, OpenZeppelin 5.4.0, and Foundry forge-std v1.9.7. EVM target `paris` is a conservative compilation choice, avoiding reliance on newer opcodes such as PUSH0, MCOPY, and transient storage. It uses the ordinary storage-based ReentrancyGuard. This does not claim verification of all latest BSC hard-fork rules. Final target-chain compatibility still requires fixed-block fork deployment and full-flow execution.

## Fork procedure and meaning of failures

Entry point: `npm run test:fork`. It reads only the following public configuration from the launching process environment, **not the project `.env` or any private key**:

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

Export these values privately in your terminal, then run the entry point. Do not paste credential-bearing RPC URLs into shared logs or command examples. Missing parameters output `UNEXECUTED / 未执行` with exit code 2; invalid formats likewise prevent execution. This is not test success. Directly compiled fork tests explicitly use `vm.skip(true)` without `RUN_FORK_TESTS=true` and perform no RPC.

`scripts/foundry-runner.mjs` also supplies `mock` / `build` entry points. They use a project-local isolated cwd, explicit root/config, and empty `.env` so Foundry cannot automatically load the root `.env`. The subprocess environment is allowlisted and private keys are not forwarded. HOME is not reset. Artifacts still output to root `out/`. RPC addresses in fork errors are redacted.

Tests obtain the legitimate owner from actual `ownerOf` and impersonate only locally with `vm.prank`. Initial `pending > 0` is required; otherwise tests fail and require another real test state. A claim merely avoiding revert does not establish compatibility. Full checks are:

1. Original owner deploys Vault and safeTransfers the real NFT; assert ownership, historical pending, and original owner's BEM change.
2. **The Vault itself** calls real Mining.claim, requiring positive actual BEM inflow. Each of the two IDs can claim half, with strict receipt-delta checks.
3. Transfer ID 1; old holder loses authority. Advance local fork time/blocks and execute unmodified real Mining logic. Again require positive actual BEM inflow and actual payment to the new holder.
4. New holder gathers both shares and redeems atomically, settles remainder, burns shares, and confirms final NFT ownership.
5. Independent cases check owner's normal/emergency recovery, frozen shares continuing to claim, synchronization of third-party Mining.claim receipts, and no duplicate accounting.

New rewards in local `vm.warp` / `vm.roll` tests are **simulation results from real contract logic under local time progression**, not observations of future chain state. `pending()` may lag dynamic accrual; the official frontend separately provides Lens `pendingLive(bytes32)`. Tests record pending and determine receipts from actual claim balance increases. No BEM is `deal`-assigned to the Vault, Mining storage is not written, and the real claim is not mocked/replaced. RPC only reads chain state; deployment and asset operations occur within the local fork.

If transfer automatically settles old rewards, Vault claim is rejected, third-party claiming is disallowed, no positive balance increase occurs, receipt is taxed, or new rewards fail to grow, the corresponding case must fail and record the incompatibility. Assertions must not be weakened to pass silently. The complete report must distinguish executed, failed, and unexecuted states; local transaction identifiers are not real mainnet evidence.

Before later live-chain use: resolve and review all actual implementations at the selected block, verify BEM accounting assumptions, confirm miner state/pending, complete the real fork, and obtain itemized user confirmations for real actions. Owner's ability to retrieve the NFT without holding shares is a recovery privilege of this experiment, not a public crowdfunding mechanism.
