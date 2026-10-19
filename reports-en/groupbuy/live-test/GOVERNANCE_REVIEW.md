# Governance Configuration and Multisig Verification for This Mainnet Test

**This is the historical identity review before deployment. All four mainnet deployments are now complete; see [LIVE_DEPLOYMENT_REPORT.md](LIVE_DEPLOYMENT_REPORT.md) for governance state and receipts.**

2026-10-19, Beijing time. The user selected the existing multisig `0x1f502a0b76EA9b42821B82e424C741AeF87C3D03` and a minimum Timelock delay of **600 seconds (10 minutes)**. These choices are recorded in [SESSION_PLAN.json](../../../live-test/SESSION_PLAN.json). At this preparation stage, no on-chain permissions had been assigned to this multisig, and no deployments or transactions had been broadcast.

**For the subsequent deployment entry point, complete proxy rehearsal, and two Safe configuration files, see the [preparation acceptance report](DEPLOYMENT_PREPARATION_REPORT.md) and [runbook](MAINNET_DEPLOY_RUNBOOK.md).** The `NOT_PREPARED` state and 45 tests at the end of this document describe the first draft snapshot. Later rehearsals do not overwrite that original unsigned draft.

## Why a Multisig Was Previously Required

A multisig is not a BSC technical requirement for mainnet testing. The original specification requires multisig + Timelock governance for formal deployments; the existing live SDK consequently requires a multisig identity with deployed code.

| Option | Existing contract support | Required changes |
| --- | --- | --- |
| creator directly becomes Factory upgradeAdmin | EOA currently rejected | Factory must change and its real Timelock requirement must be removed; this cannot be described as preserving every other restriction |
| creator becomes Timelock proposer/executor | Already supported by Solidity | Add an explicit EOA governance validation branch and tests for mainnet testing; preserve the real delay and Vault restrictions |
| Existing multisig becomes Timelock proposer/executor | Already supported | No core contract or live validation changes; selected for this run |

References: lines 44–45 of the original specification; `initialize`, `onlyAdmin`, and `_authorizeUpgrade` in `src/GroupBuyFactory.sol`; the constructor in `src/GovernanceTimelock.sol`; governance runtime and role checks in `sdk/live-identity.ts`. The earlier claim that mainnet testing always requires a multisig was too absolute; it describes this project's current mainnet configuration policy.

## Actual On-Chain Verification

Final raw record: [governance-1792415753503.json](../../../live-test/observations/governance-1792415753503.json). Status: `SAFE_141_RUNTIME_AND_CURRENT_CONFIGURATION_MATCH`.

- Chain: BSC, chainId 56.
- Fixed finalized block: 128560557.
- Block hash: `0xf7dc2e59dfecaf40693793df973c2646f07fb55066b9082f0dca722eb0b08741`.
- VERSION: 1.4.1; Safe nonce: 4.
- Two owners, threshold=2: execution requires **2/2** confirmations.
- Owner 1: `0xf0972A5ee0FD4054159A8c7177e59126ef478dA9`.
- Owner 2: `0x15C059A5aCB36142Eea576BDbC0330Fd7E9d3099`.
- Neither owner is this test's creator/A/B. The user stated that they control the multisig; RPC reads verify membership and threshold, not access to private keys.
- Module pagination was complete, with no enabled modules; the transaction guard slot was zero.
- The singleton getter matched storage slot 0: `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`.
- Fallback: `0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99`.

Code provenance checks:

| Object | Evidence | Result |
| --- | --- | --- |
| SafeL2 1.4.1 singleton | On-chain address and runtime hash against [Safe's official deployment record](https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/safe_l2.json) | Match |
| SafeProxyFactory 1.4.1 | On-chain runtime hash against the [official proxy factory record](https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/safe_proxy_factory.json) | Match |
| User multisig proxy runtime | Byte-for-byte comparison with the actual return segment of `proxyCreationCode()` from the verified Factory | Match |
| CompatibilityFallbackHandler 1.4.1 | On-chain address and runtime hash against the [official fallback record](https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/compatibility_fallback_handler.json) | Match |

Proxy runtime hash: `0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c`.

During development, the verifier incorrectly assumed that runtime was the suffix of the entire creation bytecode; error strings also follow the constructor. This was corrected to use the explicit `CODECOPY/RETURN` range (offset=0x119, length=0xab), with a regression test. Earlier observations containing `proxyRuntimeMatchesFactoryCreationCodeSuffix=false` record the old method, not detection of a malicious proxy. The final conclusion uses the complete matching return segment above. Earlier observations were retained unchanged.

This verifies current configuration and public runtime identity; it is not a complete historical audit. Authorized Safe participants can later change owners, threshold, modules, and guard, so checks should be repeated before signing. The raw module-guard extension slot for Safe 1.4.1 was also recorded, but was not used as permission evidence for this version.

## Selected Roles and Preserved Restrictions

```text
Existing Safe (2/2)
    ↓ propose schedule / perform execute
New GovernanceTimelock (wait at least 600 seconds)
    ↓ sole Factory upgradeAdmin
New GroupBuyFactory
```

- Timelock proposer/executor are the user-provided Safe. There is no external bootstrap admin; Timelock itself holds DEFAULT_ADMIN_ROLE.
- Factory upgradeAdmin is the Timelock address, not the Safe or creator directly.
- Guardian remains B: `0x63979C9d5200A5080be93eb440D469d2F2ec6682`; it receives no Timelock proposer/admin role.
- creator pays deployment fees, creates the pool, and contributes for 67 shares. B contributes for 33; A sells for 0.3 BNB.
- The 600-second floor cannot be reduced. It delays Factory configuration/upgrades, not ordinary holder claims, transfers, refunds, or redemption.
- Vault remains a fixed-implementation ERC-1167 clone, without an asset-management owner or upgrade entry point.
- Factory/guardian can only make an unpurchased pool refundable; they cannot withdraw funds, select refund beneficiaries, or control a purchased miner.
- Normal miner redemption still requires actual ownership of all 100 shares. Neither multisig nor creator status bypasses this requirement.

## Reproducible Commands

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node live-test/inspect-governance.mjs --env ../.env
node --test live-test/inspect-governance.test.mjs
node live-test/prepare-deployments.mjs --env ../.env
```

These entry points only read chain state, estimate gas, and generate local unsigned parameters. They do not send transactions. A deployment preparation bundle is not a reviewed live manifest and cannot replace post-deployment runtime/role/receipt checks. After actual deployment, prepare the Safe schedule/execute configuration before creating a pool and testing purchase.

## Generated Deployment Draft

Actual file: [unsigned-deployments-1792415847788.json](../../../live-test/observations/unsigned-deployments-1792415847788.json). Generated at block 128560759, hash `0x268b36f8d824868b9acf3626c781bcdc17bd7400e6e491bd66f3319df6c06d03`; creator latest/pending nonce were both 5. The bundle contains full initcode; the terminal prints only a summary.

| Step / nonce | Contract | Predicted address (not yet deployed at this snapshot) | Fee BNB with 20% gas margin |
| --- | --- | --- | ---: |
| 1 / 5 | GroupBuyVault template | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` | 0.0004232363 |
| 2 / 6 | GovernanceTimelock | `0x02f453192530e07541E61B43DA079273F410979b` | 0.00008604465 |
| 3 / 7 | GroupBuyFactory implementation | `0xE45D94579425a6a2006D3e067C8d51De6B15C4fc` | 0.00013991275 |
| 4 / 8 | Factory ERC1967Proxy, atomically initialized in its constructor | `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1` | Not estimated; depends on prior deployments |

The first three estimates total **0.0006491937 BNB**, at gasPrice=0.05 gwei. This is not a complete lifecycle budget. These addresses depend on creator using consecutive nonces 5–8. Any intervening transaction, failed deployment, or other nonce change requires new predictions and parameters; do not retry the old bundle directly.

The draft has `readyToSign=false`: proxy simulation and estimation must be repeated against actually deployed dependencies. Actual Safe `scheduleBatch/executeBatch` configuration remains `NOT_PREPARED`; the full gas budget and reviewed live manifest are incomplete. `LIVE_RELEASE_VERIFIED` was not set.

Tests for all four supporting tools ran: preflight 10, multisig inspection 6, deployment preparation 19, receipt verification 10, totaling **45/45 PASS**. Only `live-test/` was added or changed. Core contract and SDK verification input hash remained `9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba`, so the unchanged core's complete regression was not rerun.
