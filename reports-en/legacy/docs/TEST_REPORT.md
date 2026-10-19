# Test Report

Date: 2026-10-03 (Asia/Shanghai). Scope: the new local test project created in this directory. No real NFT/BEM transfers, live-chain deployment, or git push. No audit claim is made.

## Status

| Verification level | Status | Evidence and boundaries |
| --- | --- | --- |
| Mock contract tests | **Passed** | 49 tests, 0 failures: 44 unit/exception/deterministic regression, 2 fuzz, 3 invariant |
| Script/frontend configuration tests | **Passed** | 15 tests, 0 failures; authority gates, RPC bounds, fee budgets, error redaction, emergency preflight, replacement receipts, frontend configuration |
| Anvil RPC workflow | **Passed** | 2 scenarios; all transactions on local chain 31337; snapshots restored after tests |
| Stepwise CLI integration | **Passed** | 12 checks, including actual individual local sends, dry-runs preserving state, and expected send refusals |
| TypeScript / UI production build | **Passed** | Final Vite 6.4.3 build succeeded; approximately 508 kB chunk-size warning |
| UI browser chain reads | **Passed** | Read actual locally deployed Mock data, state, and disabled reasons without page errors |
| Complete UI browser wallet-signing flow | **Not executed** | Built-in test browser has no wallet; writes verified separately through RPC/CLI do not establish wallet-experience acceptance |
| Real-chain fork | **Not executed** | No user-selected target NFT / fixed fork block / RPC configuration; entry point was run and correctly reported UNEXECUTED with exit2 for missing parameters; no fork started |
| Live-chain read-only target preflight | **Not executed** | User-specific configuration not yet filled; public protocol material and public RPC research recorded separately in PROTOCOL_CHECK |
| Live-chain broadcasting / real-asset tests | **Not executed** | Explicitly prohibited this round; no real signing accounts loaded and no live transactions sent |

Mock success does not prove TapeOut mainnet compatibility. Public RPC ABI/bytecode reads do not constitute fork claim tests. A future successful fork would still not mean real-miner transactions had been broadcast and tested.

## Commands actually executed

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

Solidity compiler 0.8.24+commit.e11b9ed9, Paris, optimizer 200; official macOS download SHA-256: `cc2d44c706905ccc382f484625dff61d741e0c24232d226f139a6835fc644f3f`. Vault runtime code: 11,509 bytes, below the 24,576-byte limit. Foundry 1.4.3, forge-std v1.9.7, OpenZeppelin 5.4.0, Node 20.19.5.

The npm audit after dependency installation reported **0 known vulnerabilities**. This reflects that dependency database query, not proof of a vulnerability-free application. All npm dependencies are pinned in package-lock.json.

## Contract coverage for the 20 requirements

| Scenario | Representative tests (`test/TestMinerVault.t.sol`) |
| --- | --- |
| Creator owner / supply of both IDs | `testCreatorAndFixedShares`, `testNoMintBurnOrOwnerTransferEntrypoints` |
| Freeze single/batch transfers before deposit | `testAwaitingDepositFreezesSingleAndBatchTransfers` |
| Wrong miner/source/repeated deposit | `testDepositWrongCollectionWrongIdAndWrongSource`, `testDepositChecksOwnershipAndCannotRepeat` |
| Historical 100 / new 20, 50% each | `testHistoricalAndNewRewardsAreHalfEachAndClaimsIndependent` |
| A claims first without affecting B | Same test; checks each payment and second share balance separately |
| New income / no duplicate claims | Same test; `testDirectDonationsAndThirdPartyMiningClaimReconcileOnce` |
| ID transfer inherits all unclaimed entitlement | `testUnclaimedRightsAndClaimedDebtFollowTransferredID`, `testTransferBeforeAnyClaimGivesEntireHistoryToNewHolder` |
| claimBatch invalid/duplicate/unauthorized | `testClaimBatchDuplicateIllegalAndUnauthorizedIDsCannotPartiallyPay` |
| Third-party harvest cannot steal rewards | `testMiningOwnerRestrictionRejectsDirectStrangerButVaultHarvestWorks` |
| Direct receipt / external claim reconciled once | `testDirectDonationsAndThirdPartyMiningClaimReconcileOnce` |
| Half holder cannot withdraw miner | `testHalfHolderAndOperatorCannotRedeemOrWithdraw` |
| Operator is not a 100% holder | Same test |
| Full-holder redemption, burns, settlement, NFT ownership | `testFullHolderRedeemsSettlesOddUnitBurnsAndReceivesMiner` |
| Owner normal recovery cannot seize BEM | `testOwnerNormalWithdrawKeepsShareRightsAndFreezesTransfers` |
| Emergency recovery under persistent Mining failure | `testMiningFailureMakesNormalCloseAtomicButEmergencyAvailable`, `testContractCallerRejectedCanStillEmergencyRecover` |
| Freeze after emergency close / continue claiming | `testEmergencySkipsBrokenMiningAndTokenAndPreservesArrivedRewards` |
| Closed cannot restart/repeat recovery | `testClosedCannotReactivateRepeatWithdrawHarvestOrDoublePay` |
| Correct odd/small-unit remainders | `testOddSmallUnitRemaindersCarryForward`, two Closed dust tests |
| ERC721/ERC1155 single/batch/BEM/Mining callbacks | `testERC1155SingleAndBatchReceiverCannotReenterAnyAssetPath`, `testERC721OwnerReceiverCannotReenterRecoveryOrOtherPaths`, `testBEMCallbackCannotDoubleClaimOrHarvestOrClose`, `testMiningAndNFTExternalCallbacksCannotReenter` |
| Atomic rollback on payment/NFT failure | `testBEMPaymentFailureRollsBackIncomeAndDebt`, `testRedemptionPaymentFailureRollsBackHarvestBurnAndClose`, `testNFTTransferFailureRollsBackRedemptionPaymentsBurnAndHarvest`, `testOwnerNFTTransferFailureRollsBackBothClosePaths` |

Additional coverage: owner confirmation of non-safe deposit and emergency recovery while Awaiting; dependency failures during construction; successful claim without receipt; ordinary claims independent of Mining; zero-amount transfer not changing holder; invalid supply/third ID; malicious receivers rejecting receipt; Vault rejecting its own shares; and handling BEM accidentally transferred after normal redemption.

The two default fuzz tests each use **256 runs**; a cached failing sample adds one execution. After fixes, the number of new samples was increased to **1024** for each test. The reward-transfer case ran 1025 times including its original failing sample; redemption ran 1024 times; all passed. The three invariants each use **128 runs × 64 depth = 8192 calls**, with no unhandled handler reverts:

- Total paid never exceeds actual receipts. Independent ghostReceived checks `balance + cumulative payments = total actually received`.
- Balance reconciles with both IDs' unclaimed rights, remainder, and actual receipts not yet synchronized.
- Each ID has supply at most 1; IDs 0/3 do not exist. The NFT can leave only through authorized closure paths, with at most one successful close.

## RPC/CLI and UI evidence

`reports/local-smoke.json`:

1. Local NFT deposit → arbitrary third party harvests historical 100 → A claims 50 → ID2 changes hands → new 20 → A claims another 10/new holder claims 60 → consolidate both IDs → final 1 minimum-unit reward → atomic redemption. Total paid 120 BEM + 1 minimum unit, balance 0, shares burned, NFT owned by full holder.
2. After historical 100 arrives, induce failures in Mining.claim, Mining queries, and BEM queries/transfers → owner emergency recovery succeeds → after BEM recovery, A/B claim 50 each. The NFT has left, but received entitlement persists.

`reports/cli-smoke.json`: 12 subprocess checks. Preflight, deposit simulation/send, third-party harvest, A/B separate claims, B transfer to A, normal redemption simulation, owner normal/emergency simulations, and two expected refusals all matched expectations. The two local script exit-code-1 cases were **successful blocking**: Mock `--broadcast` and redemption without TTY confirmation; they are not contract-test failures.

`npm run test:fork` exiting 2 for missing parameters is likewise the expected explicit “not executed” behavior, not a passed fork test. Four fork tests compiled locally and will execute real-protocol simulations only when all explicit parameters are present.

These reports are locally generated and ignored by default. The tests restore an Awaiting snapshot afterward. Local transaction hashes from a restored snapshot cannot be used as evidence on a BSC explorer.

The browser read: Vault `0x5fc8d32690cc91d4c39d9d3abcbd16989f875707`, chain 31337, NFT #12167, miner held by owner, supply 1 for each ID, current A/B holders, pending 100, actual receipts 0. All write buttons are disabled without a connected wallet. The Closed UI stops displaying subsequent Mining pending as a Vault asset.

## Issues found and fixed; remaining limitations

- Initial dependency warnings: after pinning upgraded Vite/viem and removing unused npm solc, the installation audit reported 0 warnings.
- Foundry macOS system-proxy panic inside the sandbox: resolved with offline tests; old `testFail*` names conflicting with newer Foundry were corrected.
- Final isolated testing found one fuzz failure: local `forge fmt` incorrectly expanded a single-line conditional containing `prank`, making the false branch claim as the test contract and receive Unauthorized. The earlier omission of only compiling after formatting, without rerunning tests, was corrected. `_claimAs()` binds prank to its target call; fixed false/true counterexample regressions were added. All final 49 tests and expanded fuzz runs passed. The Vault contract needed no change for this test issue.
- Initial CLI parenthesis syntax error: caught by stepwise integration; after fixing, all 12 checks passed on rerun.
- Emergency-script preflight previously still checked Mining/BEM code: recovery paths now skip these dependencies, with added tests.
- viem replacement/cancellation receipts: scripts and UI now check the original hash, with added tests to prevent false success for the original operation.
- UI approximately 508 kB chunk warning does not prevent building. This remains a local test panel, without performance optimization.
- Direct Foundry execution once attempted to write a global signature cache; the sandbox denied it, though compilation exited 0. Final npm compile/tests used an isolated cwd and empty .env, keeping artifacts and compile caches within the project.
- Owner privileges, ordinary ERC20 balance assumptions, future proxy upgrades, incompletely verified target-protocol source, real-state prerequisites, and NFT transfer restrictions remain risks that Mock tests cannot eliminate.
