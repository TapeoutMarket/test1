# BSC Mainnet Deployment and Multisig Configuration Runbook

This runbook corresponds to `live-test/SESSION_PLAN.json`: Safe is `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03`, and the minimum Timelock delay is **600 seconds**. This delivery prepares deployment and configuration only. Actual deployment, Safe dual signatures, listing, contributions, purchase and claims must each be established from real receipts and state-verification records.

## 1. Who executes what

| Order | Operation | Signer | Requires Safe 2/2? |
| --- | --- | --- | --- |
| 1 | Deploy GroupBuyVault template (MarketValidator created during construction) | creator | No |
| 2 | Deploy GovernanceTimelock, floor=600, Safe as proposer/executor/canceller | creator | No |
| 3 | Deploy GroupBuyFactory implementation | creator | No |
| 4 | Deploy ERC1967Proxy, atomically initialized in its constructor | creator | No |
| 5 | scheduleBatch: submit initial configuration plan | Existing Safe | **Yes, both owners confirm, then execute on-chain** |
| 6 | Wait at least 600 seconds after the block in which schedule actually executes | No transaction | No |
| 7 | executeBatch: execute the same configuration plan | Existing Safe | **Yes, both owners confirm again, then execute on-chain** |
| 8 | Read final configuration, roles, receipts and runtime | Local read-only script | No |

All four deployment transactions have `value` 0 and pay gas only. Both Safe calls also have value 0; the final executor/relayer must still pay gas for the outer Safe transaction. If signatures reach 2/2 but on-chain execution has not occurred, the Timelock **has not started counting**. schedule and execute cannot be combined into one immediately executed transaction.

The two verified Safe owners:

- `0xf0972A5ee0FD4054159A8c7177e59126ef478dA9`
- `0x15C059A5aCB36142Eea576BDbC0330Fd7E9d3099`

creator/A/B are not those Safe owners. The script will not request or use either owner's private key. Confirm through each owner's own wallet in Safe.

## 2. Initialization and asset permissions

Factory upgradeAdmin is the new Timelock; guardian is B `0x63979C9d5200A5080be93eb440D469d2F2ec6682`. Timelock alone holds its own DEFAULT_ADMIN_ROLE, without a deployer bootstrap admin. Safe holds proposer/executor/canceller; creator only pays for deployment and participates later.

Transaction 4 includes implementation address, Timelock, guardian and the 600-second requirement in the proxy constructor arguments; initialization and creation occur in the same transaction. Factory initially pauses pool creation. Governance executeBatch atomically performs, in order: `approveTemplate`, `approveConfig`, `selectConfiguration`, `resumeCreation`.

Vault uses a fixed-implementation ERC-1167 clone with no asset-management owner or upgrade entry point. Factory/guardian emergency cancellation remains limited to making unpurchased pools refundable; it cannot withdraw, replace refund beneficiaries or control purchased miners. Only an ordinary holder of all 100 shares has normal redemption rights.

## 3. Local files and checks

Run all commands from this directory:

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --test live-test/*.test.mjs
node live-test/preflight.mjs --env ../.env
node live-test/inspect-governance.mjs --env ../.env
```

Only `BSC_RPC_URL` in this workspace's `../.env` is used. Only after manually running broadcast mode in section 5 and completing each confirmation does the deployment entry point use its `CREATOR_PRIVATE_KEY`, which must derive `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`. A and B private keys are not involved in deployment.

This round's acceptance report lists the passed deployment draft, fork rehearsal file and bundle hash. These must match one another; files generated at different times must not be mixed.

If creator nonce changes before starting, and **no deployment or budget reservation has started**, regenerate the draft and rerun rehearsal:

```bash
node live-test/prepare-deployments.mjs --env ../.env
node live-test/rehearse-deployment.mjs --env ../.env \
  --bundle live-test/observations/unsigned-deployments-实际新文件名.json --run
```

This rehearsal command needs local Anvil 1.4.3 and an RPC that can read the fixed block. It starts and closes a separate fork bound only to 127.0.0.1, with an upstream proxy allowing read requests only, without reading private keys or changing mainnet balances. Test impersonation and time advancement exist only in the local fork. Use the new file paths and hashes actually output by the command.

If deployment has partially completed, do not restart by generating a new bundle or deleting journal/budget files. First check current on-chain nonce, every receipt and created contract, then prepare a continuation/recovery plan.

## 4. First run a non-broadcast deployment preview

The three actual values that passed rehearsal this round follow (none are secret). If a draft or rehearsal was regenerated, use the new run's output instead; do not mix them:

```bash
TAPEOUT_BUNDLE='live-test/observations/unsigned-deployments-1792415847788.json'
TAPEOUT_REHEARSAL='live-test/rehearsals/deployment-2f3eb594-5f59-4507-869d-20abc20062ee.json'
TAPEOUT_BUNDLE_HASH='0x72166ad218a0963b3eeee898d62da0514e69fec8afed2a91b38e6e7eb138012d'

node live-test/deploy-mainnet.mjs --env ../.env \
  --bundle "$TAPEOUT_BUNDLE" --rehearsal "$TAPEOUT_REHEARSAL" --step 1
```

Success outputs `READ_ONLY_PLAN` and `transactionsSent: 0`. Preview checks the fixed source-chain block, current Safe/protocol identity, current nonce, empty predicted addresses, actual creation simulation, gas and balance. In addition to deployment gas, **0.20301 BNB** is reserved for creator's later 67-share principal.

Mainnet previews for steps 2–4 require preceding contracts to have actually deployed and confirmed. The independent fork covers the full sequence in advance, including proxy construction/initialization. Each mainnet step still simulates again.

## 5. User deploys one transaction at a time in the terminal

After reading this round's acceptance report and accepting the test release scope, set the existing broadcast switches in the terminal you control. `LIVE_RELEASE_VERIFIED` is your release-check declaration, not a claim of external security audit or successful live-chain testing. This delivery did not modify `.env` or set process switches for you.

```bash
export MODE=live
export ALLOW_LIVE_SEND=true
export LIVE_RELEASE_VERIFIED=true
```

This deployment budget uses **at most 0.0006 BNB gas per transaction and 0.0015 BNB cumulatively**. These are hard limits set when running commands, not estimated charges. The cumulative ledger conservatively reserves `value + gasLimit × gasPrice` and does not automatically return allowance after success/failure; existing reservations count too. Actual fees are recorded separately from receipts. This limit covers only the four deployments, excluding Safe executor gas and the later 0.303 BNB contribution. If an actual quote exceeds the limit, the script stops. Check the quote/balance first rather than deleting the ledger to reset it.

```bash
node live-test/deploy-mainnet.mjs --env ../.env \
  --bundle "$TAPEOUT_BUNDLE" --rehearsal "$TAPEOUT_REHEARSAL" --step 1 \
  --broadcast --reviewed-bundle-hash "$TAPEOUT_BUNDLE_HASH" \
  --max-tx-fee-bnb 0.0006 --max-total-spend-bnb 0.0015
```

Check the displayed contract name, nonce, predicted address, initcode hash, bundle hash, gas and maximum fee, then paste its complete `SEND DEPLOY ...` line. Input must come from a real interactive terminal, not a confirmation pipe.

**Proceed to the next step only after the current step displays `CONFIRMED`.** Reconciliation may instead output `RECEIPT_RECONCILED_NO_SEND` with the corresponding journal `step.status=CONFIRMED`, which also permits continuation. Each command requires independent confirmation; do not place them in an automatic loop:

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

After all four complete, `live-test/deployment-state.json` should be `DEPLOYED_UNCONFIGURED`. `CONFIRMED` is written only after at least 15 blocks, canonical receipt, nonce, initcode, runtime aligned with the fork, governance roles and initialization all pass. 15 confirmations are not an absolute finality guarantee.

Budget is persisted before broadcasting, then deployment step is recorded, and after signing the transaction hash is persisted before sending. Unknown RPC send outcomes do not automatically retry. Budget and journal are cross-checked, and deleting one side cannot bypass the cumulative budget. Do not use creator for other transactions in the meantime.

## 6. Reconciliation after timeout/interruption

If a hash is recorded but receipt confirmation has not completed, replace `--step` with the corresponding step and run:

```bash
node live-test/deploy-mainnet.mjs --env ../.env \
  --bundle "$TAPEOUT_BUNDLE" --rehearsal "$TAPEOUT_REHEARSAL" \
  --step 1 --reconcile
```

This only checks the same recorded transaction; it does not sign, resend or automatically raise gas. Pending state, missing receipts, a nonce used by another transaction, an actual revert, a budget reservation without a journal, a journal without a hash or leftover locks all require keeping the files and reviewing recovery rather than blind retries. Proxy initialization uses earlier predicted addresses; after a real failed deployment consumes a nonce, the old bundle cannot simply continue unchanged.

This entry point's deployment postconditions require Factory still to be initially paused. After governance configuration in section 7 takes effect, use `governance.mjs --inspect` for final verification; do not use deployment-step `--reconcile` to judge configuration success.

## 7. Generate two Safe import files

After all four deployments confirm, run:

```bash
node live-test/governance.mjs --env ../.env \
  --deployment live-test/deployment-state.json
```

The script rechecks four mainnet deployment receipts, source/rehearsal, Safe identity, all Timelock role grant/revocation history from deployment to the checkpoint, Factory proxy and fixed template, then outputs:

- `files.schedule`: `safe-schedule-时间戳.json`, the first Safe transaction.
- `files.execute`: `safe-execute-时间戳.json`, the second Safe transaction after waiting.
- `files.bundle`: full record of both calls, four internal configurations, operationId and configHash.
- `files.config`: configuration needed for the later live manifest; **it is not itself a reviewed live manifest**.

Open the [official Safe app](https://app.safe.global/), switch to BNB Smart Chain and select the Safe above. Follow the [official Safe Transaction Builder guide](https://help.safe.global/articles/4180673514-transaction-builder), open **New Transaction → Transaction Builder**, and import this run's schedule JSON.

Verify chain 56, Safe address, target=new Timelock, value=0, scheduleBatch, delay=600. `operationId` is computed from batch parameters, not an independent function parameter; Safe may not display it. If raw data is not decoded, compare calldata, targets, values, payloads, predecessor and salt in `files.bundle`; the local script compares operationId with Timelock's `hashOperationBatch`. Both owners confirm separately, then execute on-chain. This queues configuration only; Factory is still paused.

Check readiness:

```bash
node live-test/governance.mjs --env ../.env \
  --deployment live-test/deployment-state.json --inspect
```

- `SCHEDULE_REQUIRED`: no executed schedule observed at the checkpoint; exit code 2.
- `WAITING_TIMELOCK_DO_NOT_EXECUTE`: delay has not elapsed; shows remaining on-chain seconds, exit code 2.
- `READY_FOR_USER_SAFE_EXECUTION`: inner executeBatch simulation passed; exit code 0.
- `ALREADY_EXECUTED`: configuration execution and final state verification passed; exit code 0.

The checkpoint uses finalized and may lag the latest block slightly. Query again and use on-chain time, not the local countdown or the first Safe signature time.

Once READY, import the matching execute JSON in the same Safe. Recheck target/value/operationId, then have both owners confirm and execute again. Do not reuse the preceding Safe signatures. Both files must have the same Timelock batch, predecessor and salt; execute has no delay parameter.

After execute is mined and confirmed, run the same `--inspect` again to obtain `ALREADY_EXECUTED`. This establishes configuration execution; actual outer Safe execution gas and signature transaction hashes should also be saved in the live-chain report.

## 8. Completion criteria and next phase

Completion requires four matching real deployment receipts; actual successful Safe schedule and execute records; inspection `ALREADY_EXECUTED`, `creationPaused=false`, correct selected template/config hash, and no extra role members in role history.

This stage does not automatically approve NFTs, generate executable orders, create pools or pay. Only after deployment/configuration verification may a reviewed live manifest be generated from actual evidence and the test continue with A selling #3204 for 0.3 BNB, creator paying 0.20301 BNB for 67 shares and B paying 0.09999 BNB for 33 shares. Do not use the old fork manifest as a mainnet manifest.

Successful inner Safe calls on the fork do not establish actual Safe `execTransaction` 2/2 signature verification or actual outer Safe gas. Mainnet steps must remain NOT_RUN until executed.
