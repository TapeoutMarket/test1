# TapeOut GroupBuy V1 Phase One Contract Report

The phase one candidate project has been implemented and run locally. **This does not establish mainnet deployment or passage of an independent audit; real BSC fork results are separated by the table and independent evidence below.** Source snapshot SHA-256: `6b9c0d6195f80217f5a9aeb867e5ccecaf855e0cd8545c85455e22efdacd90bf`.

## Evidence levels

| Level | Result | Boundary |
| --- | --- | --- |
| Mock / Factory proxy → clone | PASS | Separate new local project, 100 IDs |
| Local Solidity integration with real Seaport | PASS | core 1.5.0/types 0.0.1, Mock NFT/Mining/BEM |
| Real BSC state fork / locally created order | PASS | signature=0x; approval and validate inside the fork, not a public mainnet listing |
| Live chain | NOT_RUN | No mainnet deployment or real transaction broadcast in this round |
| UI | NOT_RUN | This round delivers CLI/SDK; the market was not modified |

## Tests actually run

All 79 Solidity tests/invariant properties passed; 78 SDK tests passed, and TypeScript checks passed. Each name, kind/fuzz statistics and result is available in the suites of this report's JSON and the raw reports/solidity-tests.json.

| Suite | Count | Result |
| --- | --- | --- |
| test/integration/RealSeaport.t.sol:RealSeaportTest | 10 | PASS |
| test/invariant/Accounting.t.sol:AccountingInvariantTest | 2 | PASS |
| test/invariant/Accounting.t.sol:ActiveAccountingInvariantTest | 1 | PASS |
| test/unit/FactoryClones.t.sol:FactoryClonesTest | 11 | PASS |
| test/unit/FactoryGovernance.t.sol:FactoryGovernanceTest | 8 | PASS |
| test/unit/FundingRewards.t.sol:FundingRewardsTest | 24 | PASS |
| test/unit/GasBench.t.sol:GasBenchClaim100Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchClaim45Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchClaim55Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchContribute100Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchRedeem100Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchTransfer100Test | 1 | PASS |
| test/unit/GasBench.t.sol:GasBenchWithdraw99Test | 1 | PASS |
| test/unit/VaultEdge.t.sol:VaultEdgeTest | 16 | PASS |

Fuzz cost tests ran 256 times; each stateful invariant property ran 128 campaigns at depth 64. A separate campaign remains ACTIVE and generates only donations/claims/transfers so that no-ops after termination cannot hide reward sequences. Checks cover per-ID 0/1 supply, the bitmap, conservation of effective principal, historical claims by ID, remainder/unaccounted balances and actual payments; historical wallet totals are not required to be equal.

Independent loopback Anvil CLI pipeline: 57 deployment/call/command records, PASS; it used unlocked local accounts and did not read real private keys. Every transaction hash in this pipeline belongs only to the temporary local chain. Raw evidence: reports/local-smoke.json and reports/local-cli-final-state.json.

## Compilation, size and gas

Factory/Vault/fixed validator: Solidity 0.8.24, Paris, optimizer 200, viaIR; a standard storage reentrancy lock. Because real Seaport 1.5.0 has an exact pragma, it was compiled separately from locked sources using solc-js 0.8.17/London, and tests deployed the artifact with a real CREATE; protocol storage or bytecode was not rewritten and mockCall was not used to impersonate fulfillment. The previously attempted 1.6.x sources require Cancun instructions and are therefore not counted as a successful local source compilation; fork tests using BSC's deployed 1.6 bytecode are listed separately.

| Contract | Runtime bytes | Bytes remaining under EIP-170 |
| --- | --- | --- |
| GroupBuyVault | 24167 | 409 |
| GroupBuyFactory | 10333 | 14243 |
| GovernanceTimelock | 5663 | 18913 |
| MarketValidator | 7681 | 16895 |

No unlimited code-size setting was used. MarketValidator is a fixed read-only contract created and immutably bound during template construction; Vault validates through STATICCALL only. Purchases, Mining calls and payments are still made by Vault itself. Compiled artifact hashes contain immutable placeholders and cannot replace the codehash after actual deployment.

| Operation | Local operation execution gas (excluding transaction base cost) |
| --- | --- |
| GAS_LOCAL_CLAIM_BATCH_45 | 1457684 |
| GAS_LOCAL_CONTRIBUTE_100_PURCHASE | 5222775 |
| GAS_LOCAL_WITHDRAW_99_FUNDING | 1366613 |
| GAS_LOCAL_CLAIM_BATCH_100 | 3106504 |
| GAS_LOCAL_CLAIM_BATCH_55_AFTER_45 | 1740363 |
| GAS_LOCAL_TRANSFER_BATCH_100_TO_REDEEMER | 3144291 |
| GAS_LOCAL_REDEEM_100_POSITIVE_HARVEST_DUST | 3285783 |

Reaching 100 funded shares immediately triggers an atomic purchase, so normal FUNDING cannot retain 100 shares awaiting batch refunds; the batch refund measurement uses the maximum retainable 99 shares. Gas was measured under local compilation/Mock conditions and does not guarantee the same consumption on the real BSC market or miner. Phase two still requires estimation and verification of actual gas/block limits.

## Fixes and permission review

Development testing identified and fixed: real BSC fork behavior in which Mining.claim settles new rewards even when Mining.pending is 0, removing the erroneous skip condition and always calling the fixed Mining.claim while propagating errors; an unreachable termination branch for permanent invalidity; ERC-1271 signature revocation hiding explicit cancellation/counter invalidity; insufficient recipient receipts caused by BEM transfer fees; Harvested miscounting old donations as new Mining income; high gas on duplicate CREATE2 salt failures; excessive code size in the initial Vault; and MockBEM's fee branch and the conditional scope in invariant consolidation steps found during the final clean regression. Failure causes and regression tests remain in named tests and sources; the final clean rerun passed throughout.

Factory uses UUPS/ERC1967Proxy. Upgrades, template configuration and resuming creation all pass through the actual Timelock; guardian can only pause creation or move FUNDING → REFUNDABLE. A malicious Factory V2 can interrupt funding but cannot change refund beneficiaries/withdraw funds, control ACTIVE miners or upgrade existing clones. Vault has no asset-management owner, upgrade or arbitrary execution entry point. An operator cannot claim/refund/redeem directly, but standard ERC1155 approval permits transferring shares first; after acquiring actual ownership, the operator can exercise the corresponding rights.

## Unexecuted work and release blockers

- Local orders created on a real BSC state fork are covered by bscFork; existing mainnet signed orders, formal market publication/API and live-chain tests were not executed.
- The exact official CircuitMarket source, ABI, proxy implementation and upgrade constraints have not been verified; CIRCUIT_RESERVED is disabled by default.
- Local source integration uses Seaport 1.5.0; this fixed-state BSC 1.6 test covers only executed paths and cannot establish compatibility with every version/order shape.
- Fixed-block identities and the actual receipt paths of the real collection, Mining and BEM are documented in the independent report. Unverified source semantics and upgrade boundaries remain Unknown; a single test cannot replace an audit.
- Production multisig, Timelock/controller code, delay and complete roles have not yet been configured and verified; local EOA roles are for testing only.
- Vault has limited code-size headroom, and immutable clones cannot be patched; independent review/audit is still required before public funds are involved.

Slither: NOT_RUN (Not installed in this environment; compiler checks and tests are not an independent security audit.). Compilation/format/storage-layout export and permission/upgrade regression were executed. No independent audit conclusion has been made on the new candidate code. Dependency security advisory records are in reports/npm-audit.json (if the query is unavailable, mark UNKNOWN rather than reporting zero vulnerabilities).

## Deliverables and reproduction

First run npm ci --ignore-scripts; install Foundry v1.4.3, then run node scripts/bootstrap.mjs. Full local validation: npm run verify; actual CLI pipeline: npm run test:local; report and source archive: npm run report && npm run archive.

ABI and TypeScript ABI: exports/; SDK: sdk/; strict order Schema: schemas/order-envelope-v1.schema.json; public structure examples for both markets: fixtures/. Local examples are not live real listings.

The market window should receive MARKET_HANDOFF.md, the Schema, SDK/ABI and examples. The next step is only to import the full public order exported by the market window into this repository and explicitly provide a read-only source RPC/fixed block, then perform an isolated fork under FORK_TEST_RUNBOOK.md; no database credentials or real private keys are needed.

## Independent real BSC fork evidence

Status: PASS. Full transactions, amounts, branches and uncovered cases are in reports/real-bsc-fork-tests.json, with SHA-256 8762427a6054472f7d064e708eeda3997aaf625f45d21cc41c56b945d594131e. Real NFT/Mining/BEM/Seaport state at a fixed BSC block was used; the order was prevalidated using an impersonated holder inside the fork, with no signature replayable on mainnet. This does not validate the market database/UI, existing mainnet signed orders or mainnet broadcasts.

## Local fork test preparation

The current primary path is loopback Anvil on this machine plus an upstream read-only proxy; no second computer or LAN port is needed. The read-only candidate Config script generates an explicit deadline and execution plan. All 78 SDK tests passed (including coverage added in this round). Local fork transport self-test: PASS, 32 checks; evidence reports/fork-local-selftest.json. Its upstream is a local Mock Anvil, so it cannot replace real BSC or real order tests. The real BSC fork lifecycle result is in the independent evidence above; mainnet transactions remain NOT_RUN.

The actual Anvil startup test found that native nodeInfo in v1.4.3 lacks forkBlockHash. This was corrected by checking native forkBlockNumber/sourceURL and independently reading the fixed block's actual number/hash; a native hash, if present, must also match. The expected hash is never used to fabricate an observation. Full local commands are in docs/LOCAL_FORK_RUNBOOK.md.

The retained optional LAN path transport self-test: PASS, 30 checks; evidence reports/fork-lan-selftest.json. This simulated transport on one machine only; networking across two Macs remains NOT_RUN. The remote prompt is docs/MAC_M4_FORK_HOST_PROMPT.md; it is not the current primary test path.

reports/archive-rebuild*.json/.txt and reports/archive-rebuild-run/, if present, are historical rebuild records tied to the source hash within each file; they do not establish that the archive was rebuilt after these changes. Current verification is determined by this report's source hash and its verification/localCLI/localForkTransport/lanTransport references.
