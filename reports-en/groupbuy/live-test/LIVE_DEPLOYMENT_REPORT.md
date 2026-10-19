# BSC Mainnet Deployment Record by Transaction

This is an actual mainnet execution record, separate from earlier local tests and fork rehearsal reports. The user confirmed each transaction separately before signing. This flow does not include listing, purchase, contributions or miner transfers.

Current status: **All four mainnet deployments are confirmed successful, and Safe initial governance is complete; Factory selected the intended template/protocol configuration and pool creation is unpaused.** Latest read-only evidence is in “On-chain review after executeBatch completion” below.

Actual gas fees for the four transactions total **0.00054914865 BNB**; the cumulative budget retained with pre-signature gas margins is **0.00066448855 BNB**. All transaction values are 0; no miner purchase or transfer occurred.

| Order | Mainnet deployed contract | Address | Actual gas fee, BNB |
| --- | --- | --- | ---: |
| 1 | Vault template | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` | 0.00034986185 |
| 2 | GovernanceTimelock | `0x02f453192530e07541E61B43DA079273F410979b` | 0.00007108135 |
| 3 | Factory implementation | `0xE45D94579425a6a2006D3e067C8d51De6B15C4fc` | 0.000115618 |
| 4 | Factory proxy | `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1` | 0.00001258745 |

## Completed: Vault template

| Item | Actual result |
| --- | --- |
| Network | BSC mainnet, chainId 56 |
| Sender | `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` |
| nonce | 5 |
| Transaction value | 0 |
| Contract address | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` |
| Transaction hash | `0x2c57fb7ffa37051f9a038827272f8d72a9d102a3379fa81ea5db0c8ad39aca69` |
| Block | 128563434 |
| Receipt status | success; script reached at least 15 confirmations and verified the canonical block |
| gasUsed | 6,997,237 |
| Actual gas fee | **0.00034986185 BNB** |
| Pre-signature approved gasLimit × gasPrice | 0.0004232363 BNB |
| Runtime hash | `0xbd048645bfc14c772c190fa5d532e883ba0bf58fe8bef3e4b94894ce3b7f3559` |
| Code/initialization checks | Same runtime as the passed fork rehearsal; template initialization locked; validator address/runtime match |

This address is the Vault implementation template, not a user clone that has already purchased a miner. The template constructor's MarketValidator was deployed and verified in the same transaction.

Complete deployment parameters, receipts, logs and actual fees are saved in [deployment-state.json](../../../live-test/deployment-state.json). The cumulative budget ledger is `deployments/live-budget.json`, reserving maximum fees without automatic reset; this transaction reserves 0.0004232363 BNB.

## Completed Safe governance steps

1. User executed scheduleBatch in Safe; the on-chain operation first entered WAITING and subsequently reached READY.
2. User executed executeBatch in Safe; the latest on-chain check returned ALREADY_EXECUTED and all configuration postconditions passed.

ABI for manual Safe construction: [GovernanceTimelock.builder.abi.json](../../../live-test/safe-builder/GovernanceTimelock.builder.abi.json). This is a static ABI from compilation; addresses/governance parameters must be generated after actual deployment verification, and predicted addresses must not be treated as deployed addresses.

This round did not request or use Safe owner private keys and did not sign for Safe. The user built, confirmed and executed both Safe transactions in wallets.

## Completed: GovernanceTimelock

- Deployed address: `0x02f453192530e07541E61B43DA079273F410979b`.
- Transaction: `0xc6094c145393986142f26f1d4d709096abefd934199b3ef811cd9f46959259d6`.
- creator nonce=6, block 128563718, receipt success; at least 15 confirmations, canonical receipt, input and runtime verified.
- gasUsed=1,421,627; actual fee **0.00007108135 BNB**; maximum fee reservation for this transaction 0.00008604465 BNB.
- minimumDelayFloor=getMinDelay=600; deploymentAddress equals the actual Timelock address.
- Safe holds proposer/executor/canceller; Timelock itself is the only DEFAULT_ADMIN. creator, guardian and zero address have none of those governance powers; Timelock itself has no proposer/executor/canceller.
- Actual fees for two transactions total **0.0004209432 BNB**; cumulative maximum fee reservation **0.00050928095 BNB**.

## Completed: GroupBuyFactory implementation

- Deployed address: `0xE45D94579425a6a2006D3e067C8d51De6B15C4fc`.
- Transaction: `0x4946e965fae959c0ae2717cdd16faa6f4e4624ea9cff63721ab08cba2b9d76c2`.
- creator nonce=7, block 128564045, receipt success; at least 15 confirmations, canonical receipt, input and runtime verified.
- gasUsed=2,312,360; actual fee **0.000115618 BNB**; maximum fee reservation for this transaction 0.00013991275 BNB.
- Actual fees for three transactions total **0.0005365612 BNB**; cumulative maximum fee reservation **0.0006491937 BNB**.
- This is the implementation address and cannot replace the Factory proxy deployed in transaction 4 for configuration or pool creation.

## Completed: Factory proxy and atomic initialization

- Deployed address: `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1`.
- Transaction: `0x446e42c7238f383d718f20065e56d032fd0bb4d22ee694d85b3433a1ebb6683c`.
- creator nonce=8, block 128564390, receipt success; at least 15 confirmations, canonical receipt, input and runtime verified.
- gasUsed=251,749; actual fee **0.00001258745 BNB**; maximum fee reservation for this transaction 0.00001529485 BNB.
- EIP1967 implementation is this round's Factory implementation, upgradeAdmin is this round's Timelock, guardian is B, requiredMinDelay=600.
- `creationPaused=true`, awaiting initial Safe configuration; deployment state recorded as `DEPLOYED_UNCONFIGURED`.
- All four were executed separately following individual user confirmations, without duplicate broadcasts or failed mainnet deployment transactions.

## Final read-only governance verification and Safe handoff

Complete record: [governance-inspection-1792417534420.json](../../../live-test/observations/governance-inspection-1792417534420.json). Checkpoint is finalized block **128564487**, hash `0x2e3b80a9897f3b0cbe37e79f811370f2280f4d0e3f11ef84561937103fc89944`.

- Four CREATE receipts, runtime, proxy implementation, fixed template/validator and 600-second governance conditions passed verification again.
- All RoleGranted/RoleRevoked from Timelock deployment block 128563718 to the checkpoint were replayed, processing 4 role events. Final membership is Timelock self-admin and Safe proposer/executor/canceller only, with no extra role members found.
- Role history report hash: `0x90a3f0f7e65ed3acca8a438d48a0614455a7a06118df792960bbc9743e87e2de`.
- `creationPaused=true`, `selectedTemplate=0x0`, governance operation `UNSCHEDULED`, returning `SCHEDULE_REQUIRED`.
- Read-only inner scheduleBatch simulation from the Safe address passed; actual Safe 2/2 signatures, schedule and execute were not yet executed.

Evidence-field correction: embedded `governance.governanceAssigned=false` and “No Timelock has been deployed or role assigned” in `governance.limitations` in the raw inspection file are static descriptions retained from the early Safe identity checker, not the post-deployment on-chain state. This deployment/role conclusion is determined by outer `deploymentEvidence`, `roles` and `roleHistory` in that file. Timelock is deployed and roles verified; the pending item is Safe's initial configuration batch. The raw inspection file is unchanged to preserve the audit trail.

Files generated after mainnet address verification:

- [First Safe schedule import file](../../../live-test/observations/safe-schedule-1792417534418.json)
- [Second Safe execute import file](../../../live-test/observations/safe-execute-1792417534419.json), **executable only after an on-chain wait and a READY check**
- [Complete parameters for both governance transactions](../../../live-test/observations/governance-bundle-1792417534419.json)
- [Mainnet protocol configuration](../../../live-test/observations/mainnet-config-1792417534420.json), not a reviewed live manifest
- [Manual construction ABI](../../../live-test/safe-builder/GovernanceTimelock.builder.abi.json) and [manual field instructions](../../../live-test/safe-builder/手工填写说明.md)

Transaction Builder target is **Timelock `0x02f453192530e07541E61B43DA079273F410979b`**, BNB value **0**; Safe `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03` is the initiating account.

At this point, only scheduleBatch should be built and executed by the user first. After it actually executes on-chain, wait at least 600 seconds, then run `node live-test/governance.mjs --env ../.env --deployment live-test/deployment-state.json --inspect`. Only after `READY_FOR_USER_SAFE_EXECUTION` may the second executeBatch be built/executed. Each requires 2/2 and they cannot be combined for immediate execution.

## 2026-10-19: Read-only review after the user completed Safe schedule

The user supplied a Safe page showing scheduleBatch signed 2/2 and successfully executed. A subsequent read-only RPC review is recorded in [governance-inspection-1792418836681.json](../../../live-test/observations/governance-inspection-1792418836681.json).

- Finalized checkpoint: 128567382, hash `0x17075ed15b9f8979d20695e71e2b9c7ba125795b4723f025a16a1250689117eb`, Beijing time 2026-10-19 22:07:01.
- Intended operationId `0x811d9fff56b2f952640c71d9f7558794b726ba0fdeed549d297879f1c5bb35f5` exists, state `WAITING_TIMELOCK_DO_NOT_EXECUTE`; 511 seconds remain at the checkpoint.
- On-chain readyAt is `1792419332`, Beijing time **2026-10-19 22:15:32**. At that time, another read-only check is still required; executeBatch may run only after `READY_FOR_USER_SAFE_EXECUTION`.
- `creationPaused=true`; configuration is not yet effective. The supplied screenshot lacks a complete transaction hash, so no hash is filled in or guessed here.
- This verification signed/broadcast nothing; no miner trading had occurred yet.

## 2026-10-19: Readiness check before executeBatch

After the user confirmed the wait ended, read-only `--inspect` ran again. Full result: [governance-inspection-1792419443813.json](../../../live-test/observations/governance-inspection-1792419443813.json).

- Returns `READY_FOR_USER_SAFE_EXECUTION`; operation READY, `canExecute=true`, remaining wait 0.
- Finalized checkpoint timestamp `1792419428` exceeds readyAt `1792419332`.
- operationId and configHash match the original governance batch; inner Timelock executeBatch simulation from the specified Safe passed. This does not replace actual Safe dual signatures or the outer execution receipt.
- This check did not sign/broadcast; the second Safe executeBatch still awaited user construction/execution.

## 2026-10-19: On-chain review after executeBatch completion

After the user reported the second Safe transaction succeeded, read-only inspection ran again. Full result: [governance-inspection-1792420465210.json](../../../live-test/observations/governance-inspection-1792420465210.json).

- Finalized checkpoint: 128570997, hash `0xc1821a297c6943fecc6878e188b6f9036afc1ef89ab43730d55cf61d64006f2b`, timestamp `1792420448`.
- Status `ALREADY_EXECUTED`, operation DONE, Timelock timestamp completion marker `1`. operationId exactly matches the original batch.
- `selectedTemplate=0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a`; template approval, version and codeHash all pass postconditions.
- `selectedConfigHash=0x9469c79d863bbdd7831478b42a27714454375c25ed63199875cc87891374bd7a`; configuration is approved and its recomputed stored-content hash matches.
- `creationPaused=false`; pool creation is unpaused.
- Factory implementation remains `0xE45D94579425a6a2006D3e067C8d51De6B15C4fc`; Timelock minimum delay and nondecreasing floor remain 600 seconds, with specified Safe and role history verified again.
- Success evidence is the completed operation's on-chain state and Factory postconditions. Safe transaction hashes or gas fees not supplied by the user are not guessed; the four-deployment gas total excludes user-executed Safe transaction gas.
- This check neither signs nor broadcasts. Deployment and initial configuration are complete; this flow has not yet created a pool, contributed, purchased a miner or claimed rewards.

`deployment-state.json` retains the original `DEPLOYED_UNCONFIGURED` state at four-deployment completion for the deployment receipt verifier. Current governance state is determined by the latest observation above and this report; original deployment evidence is not rewritten.
