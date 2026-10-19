# Wallet A Only: BEM Claim Test Report

Status: **VERIFIED_A_ONLY_CLAIM**. Network: BSC chain 56. Token decimals: 8. Times are also saved in UTC; this report displays Asia/Shanghai.

## Test subjects

- Vault: `0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`
- Miner: `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C`, ID 3204
- A / ID 1: `0x1b55E6A757987576E1a130A011f9E12498De7DB9`
- B / ID 2: `0x63979C9d5200A5080be93eb440D469d2F2ec6682`
- Pre-claim snapshot: 2026/10/4 04:04:30, block 125545165, hash `0xf9727e719899e231c74c8c461d1376b3b2f1bd216524547034daf772638941a6`

## Simulation

DRY_RUN_PASS: wallet A called harvestAndClaim([1]) without signing or broadcasting. Preflight reported block 125545369 (the simulation RPC used the then-latest state; this is not proof pinned to that block). Estimated gas: 351758; maximum fee: 0.0000175879 BNB.

## Amounts recorded

| Observation | Block | Mining pending BEM | Vault BEM balance | ID 1 claimable BEM | ID 2 claimable BEM |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pre-claim snapshot | 125545165 | 0.0008068 | 0 | 0 | 0 |
| Block immediately before transaction | 125545983 | 0.0008393 | 0 | 0 | 0 |
| End of transaction's block | 125545984 | 0 | 0.00042458 | 0 | 0.00042458 |

- Mining pending before claim: 0.0008068 BEM (raw units 80680).
- A's actual claim in this transaction: **0.00042458 BEM (raw units 42458)**.
- B's actual claim in this transaction: 0 BEM (raw units 0).
- BEM transferred into the Vault in this transaction: 0.00084916 BEM (raw units 84916).
- Amount accounted by harvest: 0.00084916 BEM (raw units 84916). This may include earlier direct transfers not yet synchronized, so it cannot be equated with new Mining payments.
- A's cumulative claimed amount (ID 1): 0.00042458 BEM (raw units 42458).
- B's cumulative claimed amount (ID 2): 0 BEM (raw units 0).
- B's retained claimable amount: 0.00042458 BEM (raw units 42458).

## Transaction evidence

- [BscScan transaction](https://bscscan.com/tx/0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a)
- Transaction block: 125545984; transaction index: 42; receipt: success.
- Call checked: A → Vault.harvestAndClaim([1]).
- Actual gas fee: 0.0000132972 BNB.
- Checks: `{"onlyAId1Claimed":true,"aPositivePaymentMatchesEvent":true,"bHasNoVaultPayment":true,"oneHarvest":true,"bClaimedUnchangedSinceBaseline":true,"holdersMatchAtReceipt":true,"minerStillActiveInVault":true,"aBalanceBlockDeltaMatchesReceipt":true,"bBalanceBlockDeltaZero":true,"aClaimedBlockDeltaMatchesReceipt":true}`.

## Baseline for subsequent tests at this round's end

- ID 1 claimed: 0.00042458 BEM (raw units 42458); still claimable: 0 BEM (raw units 0).
- ID 2 claimed: 0 BEM (raw units 0); still claimable: 0.00042458 BEM (raw units 42458).
- Vault balance: 0.00042458 BEM (raw units 42458); allocation remainder: 0 BEM (raw units 0).
- The BEM transferred into the Vault exceeded pending at the initial snapshot by 0.00004236 BEM (raw units 4236), and pending in the preceding block by 0.00000986 BEM (raw units 986).

These differences compare observations only. Their specific protocol-level causes have not been verified and cannot all be attributed to elapsed time. Later checks should reconcile actual new receipts and each ID's claimed ledger while preserving ID 2's historical unclaimed entitlement.

## Measurement basis and subsequent comparisons

Payment is cross-checked using the Vault's RewardClaimed event and BEM's Vault→A Transfer event in this receipt. Wallet balance differences across blocks are supplementary and may include other transactions. Amounts retain raw integers to avoid floating-point and rounding errors.

Mining pending changes over time. Only BEM actually entering the Vault participates in distribution. A's claim may include previously accumulated unclaimed entitlement for ID 1 and need not equal pre-claim pending / 2. Normal BEM transfer semantics remain an assumption of the event and receipt checks.

“B did not claim in this transaction” is checked against its events. An unchanged monotonically cumulative claimed(2) proves that ID 2 claimed no positive reward after the snapshot, but does not exclude zero-amount calls. Identical holders before and after do not prove that no intermediate transfer occurred. Whether wallet B received BEM from other sources is a separate observation, not a share claim. Saved claimed(1/2), accPerShare, remainder, and Vault balance provide subsequent comparison baselines.
