# Acceptance Report: Multisig, 600-Second Timelock, and Proxy Deployment Preparation

**Subsequent actual mainnet execution is recorded separately in [LIVE_DEPLOYMENT_REPORT.md](LIVE_DEPLOYMENT_REPORT.md). This report preserves the findings before deployment began; NOT_RUN below refers to that acceptance checkpoint.**

Recorded 2026-10-19, Beijing time. This phase implemented the deployment entry point, governance file generator, transaction recovery checks, and an independent real BSC fork rehearsal. **All 117 offline tests passed; all four fork deployments and two governance calls succeeded; the read-only mainnet deployment preview passed.** Mainnet deployment and actual Safe dual signatures were **NOT_RUN**. This phase sent **0** mainnet transactions.

For execution order and complete copyable commands, see [MAINNET_DEPLOY_RUNBOOK.md](MAINNET_DEPLOY_RUNBOOK.md). It contains the actual filenames and hashes for this run; no parameters need to be inferred from older fork configuration.

## 1. Fixed Governance Arrangement

| Item | Configuration for this run |
| --- | --- |
| Governance Safe | `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03`, verified Safe 1.4.1, 2/2 |
| Timelock floor / initial minDelay | 600 seconds; the floor cannot be reduced |
| Timelock proposer / executor / canceller | The Safe above |
| Timelock DEFAULT_ADMIN_ROLE | Timelock itself; no deployer bootstrap admin |
| Factory upgradeAdmin | New Timelock |
| Factory guardian | B: `0x63979C9d5200A5080be93eb440D469d2F2ec6682` |
| Deployment payer | creator: `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` |

The Factory proxy is atomically initialized in its constructor and initially pauses pool creation. The initial governance batch approves the fixed template, approves the real Seaport configuration, selects the template/config, and resumes creation. These four actions execute atomically in one executeBatch.

**Two separate Safe 2/2 approvals are required: one scheduleBatch, then one executeBatch at least 600 seconds later.** Timing starts when schedule actually executes on-chain. creator signs all four deployments; they do not require Safe confirmation. Later ordinary user contributions, reward claims, share transfers, and normal redemption require no Safe confirmation.

Vault remains a fixed clone with no asset-management owner and no upgrade capability. Factory/guardian cannot extract pool funds, change refund beneficiaries, or bypass redemption's all-shares requirement.

## 2. Deliverables

| File | Purpose |
| --- | --- |
| `deploy-mainnet.mjs` | Read-only preview by default; can sign and send one deployment after per-step confirmation in a human-operated terminal; `--reconcile` only checks the recorded hash |
| `deployment-io.mjs` | Atomic/fsync journal, shared lock, persistent cumulative budget, path confinement, and tool hash |
| `governance.mjs` | After actual deployment, verifies receipts/roles/code and generates schedule/execute Safe JSON; reads READY/DONE without sending |
| `rehearse-deployment.mjs` | Read-only upstream + isolated Anvil 1.4.3 fork bound only to 127.0.0.1; executes deployments/governance and shuts down automatically |
| `.test.mjs` files | Offline fixtures and negative cases |
| `local-test-results.tap` / `validation.json` | Actual test output and machine-readable summary |

Contracts, SDK, original fork runner, `.env`, marketplace, and database were unchanged. `live-test/` supplements the original source archive; that older archive does not automatically include these entry points.

## 3. Independent Real Fork Results

Full raw evidence: [deployment-2f3eb594-5f59-4507-869d-20abc20062ee.json](../../../live-test/rehearsals/deployment-2f3eb594-5f59-4507-869d-20abc20062ee.json). Run UTC `2026-10-19T13:29:18.473Z` to `13:29:28.609Z`.

- Source chain: BSC 56; fixed source block **128560759**.
- Source block hash: `0x268b36f8d824868b9acf3626c781bcdc17bd7400e6e491bd66f3319df6c06d03`.
- creator used the actual source-block balance and nonce; no test balance injection. Fork nonce moved 5 → 9.
- The upstream read-only proxy rejected write RPC. Impersonation and time advancement occurred only in the isolated local fork.
- Final run: `status=PASS`, `cleanup.status=PASS`; Anvil and the read-only proxy stopped.

| Deployment order | Predicted / actual fork address | Fork gasUsed | gasLimit (20% margin) |
| --- | --- | ---: | ---: |
| Vault template | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` | 6,997,237 | 8,396,685 |
| Timelock | `0x02f453192530e07541E61B43DA079273F410979b` | 1,421,627 | 1,705,953 |
| Factory implementation | `0xE45D94579425a6a2006D3e067C8d51De6B15C4fc` | 2,312,360 | 2,774,832 |
| Factory proxy, atomic initialization | `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1` | 251,749 | 302,099 |
| Total | None of these four addresses was deployed on mainnet by this phase | **10,982,973** | **13,179,569** |

The source RPC observed gasPrice=50,000,000 wei (0.05 gwei). Actual fork fees for four deployments totaled **0.00054914865 BNB**; using gasLimit with margin gives **0.00065897845 BNB**. creator's fork balance changed from **0.2048357342** to **0.20428658555 BNB**; the difference exactly matched receipt gas fees.

This does not promise future mainnet costs. Mainnet node estimates differ from Anvil; the deployment entry point resimulates and re-estimates each step against current mainnet state, reserving creator's **0.20301 BNB** contribution principal.

Inner governance scheduleBatch used 85,614 gas and executeBatch 413,011 gas. The Safe address was locally impersonated with zero gasPrice to isolate the authorization path. **Safe.execTransaction was not executed, actual 2/2 signatures were not verified, and outer Safe gas was not measured.** Zero inner-call fees do not mean real governance is free.

Checks actually passed:

- Predicted addresses, successful receipts, canonical blocks, and nonempty runtime for all four CREATE operations.
- Fixed Vault template initializer lock; validator runtime matched compiled source.
- Factory EIP1967 implementation slot, upgradeAdmin, guardian, 600-second requirement, and initial pause.
- Timelock minimumDelayFloor/getMinDelay, deploymentAddress, and 20 role-membership reads.
- Reinitializing either initialized proxy or Factory implementation returned `InvalidInitialization`.
- Direct creator Factory administration returned `Unauthorized`; creator schedule returned `AccessControlUnauthorizedAccount`.
- Execution before 600 seconds and repeated execution after completion returned `TimelockUnexpectedOperationState`.
- After 600 seconds, all four configuration operations succeeded; selected template/config matched, `creationPaused=false`, operationDone=true.

The first sandbox attempt failed with `RPC_CONNECTION_FAILED`, deploying 0 contracts. Its raw failure record remains [deployment-3de6be95-b41c-4886-8930-1852d8b5f479.json](../../../live-test/rehearsals/deployment-3de6be95-b41c-4886-8930-1852d8b5f479.json). The PASS above came from a later run after network permission was granted; the original failure was not relabeled.

## 4. Read-Only Mainnet Preview

After the formal rehearsal, runbook section 4's `deploy-mainnet.mjs --step 1` ran without `--broadcast`. Evidence: [mainnet-step-plan-1792416611980.json](../../../live-test/observations/mainnet-step-plan-1792416611980.json).

Result: `READ_ONLY_PLAN`. creator latest/pending nonce were both 5; the first predicted address had no code; creation simulation succeeded. Current full Safe configuration and protocol runtime checks passed. Cumulative reserved spend was 0.

- Mainnet first-step estimate: 7,053,938 gas.
- With 20% margin: 8,464,726 gas.
- Observed gasPrice: 0.05 gwei; maximum fee **0.0004232363 BNB**.
- No private key was parsed/used; no transaction was signed/broadcast.

Mainnet simulation of steps 2–4 requires their actual preceding deployments and is repeated during each human-operated step. The fork verified the full dependency order, but does not replace those mainnet prerequisite checks.

## 5. Offline Tests by Category

Actual command: `node --test live-test/*.test.mjs`. Full output: [local-test-results.tap](../../../live-test/local-test-results.tap).

| Category | PASS | Coverage |
| --- | ---: | --- |
| Read-only mainnet preflight | 10 | Principal, 67/33 allocation, read-only RPC method boundary |
| Safe identity | 6 | Official runtime, CODECOPY return segment, owners/modules/guard |
| Unsigned deployment plan | 19 | Consecutive nonces, CREATE prediction, governance constructor parameters, source/artifact |
| Receipt verification | 10 | CREATE, from/to/value/data, failures, confirmations, reorgs, redaction |
| Deployment budget/persistence | 14 | Cumulative spend, duplicate nonces, locks, atomic writes, corrupt files, symlinks |
| Human deployment entry point | 24 | Real TTY, switches, explicit budget, post-confirmation changes, record hash before send, no resend on timeout, journal/budget binding, RPC freeze, nonce recheck |
| Governance files/checks | 19 | Actual ABI, consistent calls, salt binding, complete role event replay, receipt/rehearsal/runtime/validator consistency, READY/DONE |
| Isolated rehearsal | 15 | Bundle/source binding, local isolation/cleanup, exact reverts, network errors cannot count as passing negative cases |
| **Total** | **117** | **0 failed / 0 skipped** |

Core verification inputs did not change, so core Solidity/SDK/full purchase-reward regressions were not repeated; earlier results remain separate historical evidence. This fork covered deployment and initial governance, not a repeat of the full purchase, rewards, transfer, and redemption lifecycle.

## 6. Evidence Binding and Unexecuted Items

Unsigned draft: [unsigned-deployments-1792415847788.json](../../../live-test/observations/unsigned-deployments-1792415847788.json). Its `readyToSign=false` and unestimated proxy describe generation-time state; the original file remains unchanged. The new entry point requires a matching PASS rehearsal and current checks before allowing human confirmation of each step.

```text
bundleHash (keccak256 of original bytes)
0x72166ad218a0963b3eeee898d62da0514e69fec8afed2a91b38e6e7eb138012d

bootstrapToolHash (added runtime scripts + SESSION_PLAN)
c8941190c7f030d61537600dbc1d194e6a92349fc7395c590ff3e814bf971361

core verificationInputHash (unchanged)
9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba

Initial governance configHash
0x9469c79d863bbdd7831478b42a27714454375c25ed63199875cc87891374bd7a

Initial governance operationId
0x811d9fff56b2f952640c71d9f7558794b726ba0fdeed549d297879f1c5bb35f5
```

Changing source, SESSION, runtime scripts, bundle, or nonce invalidates the old rehearsal for that plan. Do not clear budget or journal files to retry; recovery commands are in the runbook.

| Item | Status at this checkpoint |
| --- | --- |
| Local offline tests, isolated real fork deployment/governance | PASS |
| Current read-only preview of mainnet step 1 | PASS |
| Four mainnet deployments and actual receipt integration | NOT_RUN |
| Actual Safe 2/2 signatures, schedule/execute | NOT_RUN |
| Mainnet Safe files ready to import/sign | Generated by governance.mjs after all four actual deployments are verified; rehearsal contains only configuration previews |
| Reviewed live manifest | NOT_GENERATED; requires actual deployment and role/runtime evidence |
| Actual listing, contributions, purchase, claims, share transfer, redemption in this phase | NOT_RUN |

Preparation is complete. The user should first perform all four deployments using the runbook, then execute governance with two separate Safe 2/2 transactions. After `ALREADY_EXECUTED` and saved live-chain evidence, prepare the live manifest and order for purchase testing.
