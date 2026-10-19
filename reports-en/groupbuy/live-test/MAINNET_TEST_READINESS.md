# BSC Mainnet Test Preparation and Preflight Report

Recorded 2026-10-19 (Beijing time). This report preserves the initial read-only mainnet preflight and gas estimates for two implementation contracts. **No deployment, listing, contribution, claim, or transfer of real assets occurred in that phase.** The original preflight tool had no signing/broadcasting functionality; a later deployment entry point requires individual confirmations in an interactive human-operated terminal.

**For current deployment and governance deliverables, see the [preparation acceptance report](DEPLOYMENT_PREPARATION_REPORT.md) and [mainnet deployment runbook](MAINNET_DEPLOY_RUNBOOK.md).** References below to a missing multisig, undecided delay, or absent deployment entry point describe earlier preparation, not current outstanding work. Whether mainnet execution occurred must be established from actual receipts.

**Subsequent update:** the user provided the existing BSC Safe `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03` and selected a 600-second Timelock. Safe 1.4.1, 2/2, runtime provenance, and current configuration checks passed; see the [governance review](GOVERNANCE_REVIEW.md). Section 4's “no multisig” describes the checkpoint before this address was supplied; no new Safe is currently needed. Mainnet deployment had still not occurred at this update.

The user requested real mainnet testing and confirmed creator 67 shares / B 33 shares. Earlier wording that “this phase has no live-chain authorization” belongs to the previous stage and is not evidence that authorization is absent now. Outstanding preparation at this checkpoint was governance configuration, deployment transactions, and a complete gas budget.

## 1. Confirmed Parameters

Machine-readable plan: [SESSION_PLAN.json](../../../live-test/SESSION_PLAN.json). This is a test plan, not a list of deployed addresses, and cannot replace the SDK live manifest.

| Role | Address | Plan |
| --- | --- | --- |
| A / seller | `0x1b55E6A757987576E1a130A011f9E12498De7DB9` | Sell TapeOut #3204; seller receives 0.3 BNB |
| creator / contributor one | `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` | IDs 1–67, 67 shares; pay 0.20301 BNB |
| B / contributor two | `0x63979C9d5200A5080be93eb440D469d2F2ec6682` | IDs 68–100, 33 shares; pay 0.09999 BNB |

NFT collection: `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C`; token ID: `3204`.

V1 order rules add a 1% fee to the sale price. Buyers therefore pay **0.303 BNB** total, **0.00303 BNB** per share, plus gas. As in the previous test, creator receives the 0.003 BNB fee. This is this test's recipient, not a verified official marketplace fee configuration. All principal must be paid before completion; the later fee returned to creator cannot be deducted in advance.

## 2. Actual Mainnet Observations

Final observation for this preflight: [preflight-1792415304382.json](../../../live-test/observations/preflight-1792415304382.json). Two earlier records retain their original timestamps; their allocationConfirmed=false was superseded by the user's explicit allocation confirmation and final observation.

- chainId: 56; provider finalized block: **128559559**.
- Block hash: `0x59304d47c19c74d993d14f26069afa693ddee590350ed79b5de5eae40e734aeb`.
- Observed at `2026-10-19T13:08:24.374Z`, or Beijing time 21:08:24.
- The project RPC and independent `https://bsc-dataseed.bnbchain.org` returned the same block hash. This public endpoint is listed in [BNB's official RPC documentation](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/).
- The historical fixed fork block hash still matched the current source chain.

| Address role | Actual BNB balance | Confirmed principal | Balance after contribution, before gas |
| --- | ---: | ---: | ---: |
| creator | 0.2048357342 | 0.20301 | 0.0018257342 |
| A | 0.0049597677 | 0 | 0.0049597677 |
| B | 0.1148789795 | 0.09999 | 0.0148889795 |

These are fixed-block balances, not a guarantee of later balances. Both buyers had sufficient principal. The originally described exact 0.2 + 0.1 would be insufficient; this run uses actual reads and explicitly confirmed amounts.

Miner #3204 still belonged to A. `getApproved(3204)=0x0`; A's Seaport `isApprovedForAll=false`. No new actual order had been created; Seaport seller counter=0. Outer runtime hashes for Seaport 1.6, NFT, Mining, and BEM matched the fork baseline. This is not a proxy implementation or complete source-semantics audit.

Mining showed `pending=13,557,760` raw, with BEM decimals=8: a pending view of **0.13557760 BEM**, not funds already received. The earlier real fork demonstrated that claim may receive a positive amount even when pending=0. Later reports must reconcile actual BEM inflows, events, and share ledgers.

## 3. Estimated Gas and Unresolved Costs

Only `eth_estimateGas` was called; nothing was signed. Observed gasPrice=50,000,000 wei (0.05 gwei).

| Operation | Raw gas estimate | With 20% margin | Fee BNB at observed gasPrice |
| --- | ---: | ---: | ---: |
| GroupBuyVault template deployment (including validator creation in constructor) | 7,053,938 | 8,464,726 | 0.0004232363 |
| GroupBuyFactory implementation deployment | 2,331,879 | 2,798,255 | 0.00013991275 |
| Total for these two | — | 11,262,981 | 0.00056314905 |

**This is not a complete lifecycle budget or fee cap.** It excludes governance multisig, GovernanceTimelock, Factory proxy, configuration schedule/execute, order validation and approval, clone creation, both contributions and purchase, and later BEM/share/redemption transactions. Timelock parameters and actual multisig were missing at this checkpoint; full estimates and individual/cumulative gas caps were pending. These estimates cannot establish that balances cover the whole lifecycle, and do not justify automatically changing `.env` live switches.

## 4. Why Deployment Had Not Started at This Checkpoint

The user had explicitly answered that there was **no governance multisig**, and had not specified the minimum Timelock delay.

Line 44 of the [original specification](../../../tapeout-groupbuy-codex-prompt.md) requires an explicitly configured Factory upgradeAdmin, using multisig + Timelock for formal deployment, and an independent guardian. Current mainnet validation in [sdk/live-identity.ts](../../../sdk/live-identity.ts) requires a code-bearing multisig, real Timelock, positive delay, reviewed role-history evidence, and a manifest aligned with on-chain addresses/runtime. creator EOA and a 1-second delay in the fork are local test configuration only.

The account to prepare controls Factory configuration/upgrades; it is not a Vault asset-management owner. Fixed clones have no such owner. Factory cancellation remains restricted to making unpurchased FUNDING pools refundable.

Public information needed to continue preparation:

1. A governance multisig already deployed on BSC mainnet, including owners and threshold. An address created but not deployed fails code-bearing checks.
2. Minimum Timelock delay in seconds. It becomes an irreversible floor, not a freely revocable temporary test setting.
3. Individual and cumulative gas budgets based on complete estimates.

For Safe, follow the [official creation guide](https://help.safe.global/articles/7267202833-creating-a-safe-on-a-web-browser), choose BNB Smart Chain in the official app, select signers/threshold, and deploy through the wallet. See the [official network list](https://docs.safe.global/advanced/smart-account-supported-networks?service=Transaction+Service). Signers and threshold had not been chosen on the user's behalf. B may remain guardian as in the fork, but must not also be Timelock proposer/admin; full identities and roles still require verification.

At this historical checkpoint the repository only had `deploy-local`, which explicitly rejects live mode; the fork order-creation script also permits local impersonation only. Changing MODE to live cannot make that runner usable. After governance choices, generate deployment/configuration transactions for user review and signing, verify receipts, then create a reviewed live manifest. No deployment bundle with missing parameters was generated in this phase.

## 5. Mainnet Test Sequence and Evidence

The main pool uses normal redemption. At this checkpoint **every item below was NOT_RUN**:

1. Deploy and verify governance/contracts; wait for configuration under the real Timelock. Only then create the short-lived order, avoiding expiry while waiting.
2. A gives token-specific approval for #3204 and authorizes the complete Seaport order. FULL_OPEN can be filled by others; omitting marketplace database publication does not restrict buyers.
3. Create the fixed clone; verify 0.303 BNB terms, order hash, principal for 100 shares, and deadlines.
4. creator contributes for IDs 1–67, B for 68–100. At completion verify seller/fee receipts, miner owner=Vault, and purchase-failure rollback.
5. First harvest to fix an actual-inflow checkpoint, then perform separate `claim-batch` calls with no intervening harvest. Compare cumulative entitlement per ID and actual transfers. The 67/33 wallets should not be expected to receive equal totals.
6. Retain an ID with unclaimed entitlement and transfer it from creator to B. Read-only simulation must deny the former holder; the new holder then claims the old entitlement. Verify recipient balance and that ID's ledger.
7. Let real time produce new rewards, then harvest. Record actual new BEM; do not use fork-only `evm_increaseTime`.
8. Consolidate all 100 IDs into A. A performs normal redeem; verify miner ownership, final BEM, share burning, and accounting totals.

Guardian refunds and redemption without harvest need separate pools/rounds. Mainnet has no snapshot/revert; cancellation cannot restore FUNDING, and one miner cannot be redeemed twice from one pool. Prefer read-only negative simulations; do not send failing transactions or claim completion merely to reproduce the fork's 23-case count.

## 6. Added Tools and Actual Validation

Only `live-test/` was added. Contracts, SDK, previous fork runner, `.env`, marketplace, and database were unchanged. Core verificationInputHash remained:

`9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba`

The earlier full regression report and source archive still refer to their frozen version. This directory is additional mainnet preparation and is absent from that older archive.

Run from the project directory:

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node live-test/preflight.mjs --env ../.env
node --test live-test/preflight.test.mjs live-test/verify-receipt.test.mjs
node live-test/verify-receipt.mjs --help
```

Actual results:

| Validation | Result |
| --- | --- |
| Mainnet balances, miner ownership, approval, Seaport domain/counter, runtime, pending | Read and recorded at a fixed block |
| Block hash comparison across two RPCs | MATCH |
| Deployment gas estimates for two no-argument implementation contracts | Successful simulations only |
| Preflight/principal rounding/allocation confirmation/read-only RPC write rejection tests | 10/10 PASS |
| Receipt identity, CREATE, gas, revert, confirmations, reorgs, and redaction fixtures | 10/10 PASS |
| New receipt script integration with this phase's actual transactions | NOT_RUN; no actual transactions in this phase |
| Mainnet deployment, listing, purchase, rewards, transfer, redemption in this phase | NOT_RUN |

After a transaction is sent, verify it using the template below. Expected parameters must come from the transaction reviewed before signing; do not copy them retrospectively from the transaction itself as expectations:

```bash
node live-test/verify-receipt.mjs \
  --env ../.env \
  --tx '<actual transaction hash>' \
  --from '<expected sender address>' \
  --to '<expected target address or CREATE>' \
  --value '<expected integer wei>' \
  --data-hash '<keccak256 of calldata or deployment initcode reviewed before signing>' \
  --confirmations 15
```

The tool reads receipt, transaction, canonical block, confirmations, and actual gas. Insufficient confirmation returns `NOT_PASSED/WAITING_CONFIRMATIONS`, without waiting or resending. `RECEIPT_MATCHED_BUSINESS_UNVERIFIED` means only that transaction parameters and a successful receipt match. Events and balances in section 5 still need validation before declaring business success. After CREATE, verify predicted address and actual runtime separately.

The tool consumes only `BSC_RPC_URL` from the explicitly selected environment file; it does not use private keys or print provider URLs in errors. Its transport permits only read-only JSON-RPC, rejecting sends, signing, impersonation, balance injection, and similar methods.
