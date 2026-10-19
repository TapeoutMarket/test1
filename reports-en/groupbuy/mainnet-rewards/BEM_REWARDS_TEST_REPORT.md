# Mainnet Test Report: Same-Batch BEM Rewards Distributed 67/33

Prepared: 2026-10-19; live execution and final update: 2026-10-20 (Beijing time). **Result: PASS. Harvest, creator's 67-share claim, and B's 33-share claim were all confirmed on mainnet, each with at least 15 block confirmations. Rewards at the same accounting checkpoint were correctly distributed 67/33.**

## Final Conclusion

| Item | Raw integer (1 BEM=10^8 raw) | BEM |
| --- | ---: | ---: |
| Actual harvest inflow to Vault | 13,665,485 | 0.13665485 |
| Creator holds 67 shares, actual claim | 9,155,818 | **0.09155818** |
| B holds 33 shares, actual claim | 4,509,582 | **0.04509582** |
| Remainder retained in Vault | 85 | **0.00000085** |

Per-share q=136,654 raw; distributable total=100q=13,665,400 raw. Creator's actual receipt×33 and B's actual receipt×67 both equal 302,141,994. Their combined receipts plus the 85raw remainder equal this harvest batch's inflow of 13,665,485raw exactly. The 67/33 allocation applies to the same integer entitlement per share; the 85raw remainder stays in the Vault.

Both claims used claimBatch, each in one transaction, with no further harvest. Both RewardsSynced.received values were 0; totalAccounted/accPerShare/remainder retained the same H/q/r. At completion, all 100 IDs had claimed=136,654 and claimable=0, holdings remained creator67/B33, and miner #3204 remained in the ACTIVE Vault.

These conclusions cover only the batch actually received in transaction 6's harvest. Mining rewards generated between transactions were not mixed into this round. Entitlement transfer, consolidation/redemption, and failure refunds were not executed on mainnet in this round.

## Goal and Fixed Sequence

Vault: `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A`, BSC mainnet chainId=56, fixed ERC-1167 clone.

1. Creator calls `harvest()` to account for BEM actually paid by Mining.
2. Creator calls `claimBatch([1…67])` to claim 67 shares' entitlements at once.
3. B calls `claimBatch([68…100])` to claim the other 33 shares' entitlements at once.

Each transaction has value=0 and requires its own user confirmation before signing. No further harvest occurs during claims. Before initial accounting, all rewards counters and claimed/claimable for all 100 IDs must be 0. Every step rechecks current assets, identity, shares, nonce, balance, and frozen quote, then verifies full receipt events and state after at least 15 confirmations.

## Same-Batch Rewards Criteria

Let the integer actually received by harvest be R (BEM decimals=8), with per-share q=floor(R/100) and remainder r=R mod 100. When all initial claimed values are 0:

- Creator should receive 67q raw.
- B should receive 33q raw.
- The Vault should finally retain only r raw, in the range 0–99 raw.

Harvest must be positive with q>0 to proceed with a positive-distribution test. Mining pending is recorded only as an observation, never as actual R or an upper bound. R is checked jointly against the actual BEM Transfer, RewardsSynced, Harvested, and accounting state.

Both subsequent claims must retain the post-harvest totalAccounted, accPerShare, and remainder; each RewardsSynced.received must be 0. Each ID's RewardClaimed amount must sum to the BEM Transfer. If another call or a direct BEM transfer changes the accounting checkpoint in between, the script stops the same-batch comparison rather than presenting changed amounts as the original rewards batch.

## Independent Read-Only Checks Before Execution

[Raw inspection record](../../../mainnet-rewards/observations/harvest-readonly-precheck-1792424751116.json), block 128580506, PASS, no signature or transaction.

| Field | Observation |
| --- | --- |
| State and assets | ACTIVE, 100 shares exist, miner #3204 in Vault |
| Ownership | Creator holds ID1–67, B holds ID68–100 |
| creator latest/pending nonce | 11 / 11 |
| B latest/pending nonce | 5 / 5 |
| Creator BNB balance | 0.00402984675 BNB |
| Vault BEM and totalAccounted/totalPaid/accPerShare/remainder | All 0 |
| claimed/claimable for all 100 IDs | All 0 |
| Mining pending | 13,654,713 raw = 0.13654713 BEM, observation only |
| Preliminary harvest gas estimate/20% headroom | 229,143 / 274,972 |
| gasPrice / preliminary maximum fee | 0.05 gwei / 0.0000137486 BNB |

This was an independent preparation check, not yet the final frozen send plan; the final plan and live recheck govern signing. The existing shared budget maximum reservation was 0.3040979852 BNB, the approved cumulative cap was 0.3045 BNB, and every historical reservation was retained.

## Actual Transaction Results

| Step | Status | Transaction | Actual BEM | Actual gas |
| --- | --- | --- | --- | --- |
| harvest | CONFIRMED (at least 15 confirmations) | `0xb3af0c8a9cc570826a4782fd3b09f9d306fdd5d7dd89c7b10c0985899f5a03ea` | Received 0.13665485 BEM | 0.00001102315 BNB |
| creator claim 67 | CONFIRMED (at least 15 confirmations) | `0x5a7426b05a54f8bfbf6a9012a5094110689dde36910048f63736d9db0c9767bd` | Actually received 0.09155818 BEM | 0.0001044409 BNB |
| B claim 33 | CONFIRMED (at least 15 confirmations) | `0x09bad685e01819a520fa4120c5c6023c12768a6171846df73862614939785105` | Actually received 0.04509582 BEM | 0.0000527602 BNB |

Final 67/33 distribution conclusion: **PASS**. Both actual receipts, the common accounting checkpoint, and remainder conservation were verified.

## Script, Offline Validation, and Executed Transaction 6 Plan

The [three-step script](../../../mainnet-rewards/rewards.mjs), [operating instructions](../../../mainnet-rewards/README.md), and [validation summary](../../../mainnet-rewards/validation.json) are complete. All **30/30** offline tests for the new module and **693/693** full relevant regression tests passed (631 existing sender/receipt tools, 32 read-only observer, 30 new rewards tools). Independent source review found no blocking issue.

Coverage includes fixed callers/nonces/complete ID sets, actual harvest mint and both accounting passes, integer q/r distribution, before/after entitlements for all 100 IDs, failed-test states for zero or less than 100raw, the same accounting checkpoint in both later claims, canonical receipts with 15 confirmations, historical record hash chains, cumulative budgets, and duplicate-send prevention. A shared-object issue between the simulated plan and input found during testing was fixed by copying an independent plan, ensuring mutation-based negative cases are effective. Deployed contracts were unchanged.

New tool hash: `501b3ba397abf2d824216a7e246fb90a79d5f81b79046e9cd8b89ed77a5e1649`. The root agent rechecked all three complete calls, raw plan-file hashes, the current tool hash, and cumulative fee arithmetic.

| Transaction 6 field | Approved and executed frozen plan |
| --- | --- |
| Plan file | [frozen harvest plan](../../../mainnet-rewards/plans/harvest-1a048e74fb5a3d9cc42b496479bffca3958d632017f51bad9b3439beb2339bec.json) |
| planHash | `0x1a048e74fb5a3d9cc42b496479bffca3958d632017f51bad9b3439beb2339bec` |
| Network / actor / nonce | BSC mainnet 56 / creator / 11 |
| Target | `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| Call / value | `harvest()` / 0 BNB |
| Gas estimate / limit | 229,143 / 274,972 |
| gasPrice / maximum fee | 0.05 gwei / **0.0000137486 BNB** |
| Cumulative maximum reservation afterward | **0.3041117338 BNB** |
| Retained approved cumulative cap | **0.3045 BNB**, not increased for this transaction |
| calldataHash | `0xe060bba62b44b0683c379ec71ca27d4186dc6879cdda27161f89f1f206f42aaf` |

Formal preview observation block **128581971**, hash `0x6fd5683a8961c35190a39145bd43dc36e4d21e7d559ce59676a447573856a032`; creator nonce 11, balance 0.00402984675 BNB. The Vault was ACTIVE, all 100 shares remained allocated 67/33, and rewards counters, Vault BEM, and all ID claimed/claimable values were 0. Mining pending was **13,659,838 raw = 0.13659838 BEM**, an observation only, not a guarantee of actual receipt. Canonical receipts/exact events for the five prerequisite transactions, current clone/dependency code, gas estimation, and bounded calls all passed.

This harvest only accounts for actual Mining rewards in the Vault; it does not pay creator or B. Signing requires each transaction's separate user confirmation. The two claim plans are generated only after the actual harvest receipt establishes H/q/r. The above was the preparation state before execution; this transaction subsequently received individual approval and was executed. Cumulative reservation after transaction 6 was 0.3041117338 BNB; the final value is in the closing fees section.

## Actual Transaction 6 Harvest Result (Historical State at That Receipt)

The user separately approved the harvest plan above. Execution time: **2026-10-20T00:00:16+08:00**. After rechecking frozen nonce11, value0, gas/price, the script sent exactly once, without resend or recovery. Transaction: [view receipt](https://bscscan.com/tx/0xb3af0c8a9cc570826a4782fd3b09f9d306fdd5d7dd89c7b10c0985899f5a03ea), block **128582473**, hash `0x6cb9440dac9faa6e74407bed3727b2d532cbec87de84627f251901ff37f69f7a`, at least 15 confirmations, journal=CONFIRMED.

| Field | Actual result |
| --- | --- |
| gasUsed / gasPrice / actual gas fee | 220,463 / 0.05 gwei / **0.00001102315 BNB** |
| Actual Mining inflow H | **13,665,485 raw = 0.13665485 BEM** |
| Per-share rewards q | **136,654 raw = 0.00136654 BEM** |
| Remainder r | **85 raw = 0.00000085 BEM** |
| Creator's 67 shares due | **9,155,818 raw = 0.09155818 BEM**, unclaimed at this harvest receipt (subsequently claimed) |
| B's 33 shares due | **4,509,582 raw = 0.04509582 BEM**, unclaimed at this harvest receipt (subsequently claimed) |
| Vault ledger after accounting | balance=totalAccounted=13,665,485; totalPaid=0; accPerShare=136,654; remainder=85 |
| 100 IDs | Ownership unchanged at 67/33, all supply=1, all claimed=0, all claimable=136,654 |

Exact events: all four fields of the first RewardsSynced were 0; the only BEM Transfer minted 13,665,485 raw from zero→Vault. The second RewardsSynced and Harvested.received were both 13,665,485, with matching q/r. No RewardClaimed, share transfer, or miner transfer occurred. The complete [raw receipt and business record](../../../mainnet-rewards/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) was saved. This step only received funds into the Vault; actual rewards paid to creator and B in this transaction were both 0.

The following two transactions use only claimBatch against this single confirmed checkpoint: creator should receive 0.09155818 BEM, B should receive 0.04509582 BEM, and the Vault should finish with 0.00000085 BEM. These were amounts due at the confirmed checkpoint; actual final receipts still required individual transaction-receipt verification.

Cumulative maximum reservation: 0.3041117338 BNB, retaining the 0.3045 BNB cap. Actual cumulative gas for four deployments plus six test transactions: 0.0009143054 BNB (Safe outer execution fees separate). No historical gas reservation was released.

## Transaction 7, Creator Claims 67 Shares: Confirmed on Mainnet

The harvest also passed an [independent audit of saved evidence](../../../mainnet-rewards/harvest-independent-audit.json), with no discrepancy. That audit only cross-checks local saved evidence; it is not a new RPC observation.

Transaction 7 [frozen plan](../../../mainnet-rewards/plans/creator-claim-d2fccac1bc6993e56054022ac3d573058569eb2da68d43c3803392c644737cd0.json), hash `0xd2fccac1bc6993e56054022ac3d573058569eb2da68d43c3803392c644737cd0`. Creator nonce12, same Vault target, `claimBatch([1…67])`, value0; due **9,155,818 raw = 0.09155818 BEM**, with no further harvest.

Formal observation block 128582687, hash `0x026b04e5592a458fe15f51266e3caae6553fd75ade2ef0f1cbc8846a673abe05`. The original canonical harvest receipt and historical record hash, current ownership/claimed for all 100 shares, Vault ledger, and balance still matched the original H/q/r. Gas estimation and bounded calls passed; no other accounting checkpoint was mixed in.

Gas estimate 2,127,154, limit 2,552,585, gasPrice0.05gwei, maximum fee **0.00012762925 BNB**; cumulative maximum reservation after approved execution **0.30423936305 BNB**, retaining the **0.3045 BNB** cap. This read-only preparation did not sign/broadcast/add a reservation; the user subsequently approved execution, detailed below. B's **0.04509582 BEM** entitlement remained preserved, with B's claim requiring separate confirmation.

### Actual Transaction 7 Receipt

Execution time **2026-10-20T00:17:14+08:00**, transaction [view receipt](https://bscscan.com/tx/0x5a7426b05a54f8bfbf6a9012a5094110689dde36910048f63736d9db0c9767bd), block **128584733**, hash `0x7c1eb093baa4043f871e954aebc049cabe04c8faf28bc27179c0f4feb005c388`, at least 15 confirmations, journal=CONFIRMED. Sent once using the user-approved nonce12 and frozen parameters, without resend or recovery.

| Check | Actual result |
| --- | --- |
| Creator actually received | **9,155,818 raw = 0.09155818 BEM**, exactly 67×136,654 |
| Exact payment evidence | 67 RewardClaimed events for ID1–67, each 136,654 raw; the only BEM Transfer was Vault→creator 9,155,818 raw |
| Same-batch checkpoint | Exactly one RewardsSynced.received=0; no Harvested; H/q/r remained 13,665,485/136,654/85 |
| Creator claim history | All 1–67 claimed=136,654, all claimable=0 |
| B's preserved entitlement | All 68–100 claimed=0, each claimable=136,654, totaling **4,509,582 raw = 0.04509582 BEM** |
| Vault balance | **4,509,667 raw = 0.04509667 BEM**, B's entitlement plus the 85raw remainder |
| totalAccounted / totalPaid | 13,665,485 / 9,155,818 |
| gasUsed / price / actual fee | 2088818 / 0.05 gwei / **0.0001044409 BNB** |

Ownership, supply, and rewards histories for all 100 IDs were verified; the miner remained in the Vault. No Mining call, share transfer, or miner transfer occurred. End-of-block wallet balances are only snapshots; actual claim attribution is based on this transaction's exact BEM Transfer, RewardClaimed, and Vault payment checks.

Cumulative maximum reservation **0.30423936305 BNB**, below the approved 0.3045 BNB cap; actual gas for four deployments plus seven test transactions totaled **0.0010187463 BNB**. B had not yet claimed at the transaction 7 receipt; transaction 8 subsequently completed, with final conclusions at the beginning and below.

## Transaction 8, B Claims 33 Shares: Confirmed on Mainnet

Creator's actual claim also passed an [independent audit of saved evidence](../../../mainnet-rewards/creator-claim-independent-audit.json), with no discrepancy. That audit did not make a new RPC observation.

Transaction 8 [frozen plan](../../../mainnet-rewards/plans/buyer-b-claim-5200423939663e694c2f7997950cbfefcc74bf0d0346b99f3f0977528f61ec61.json), hash `0x5200423939663e694c2f7997950cbfefcc74bf0d0346b99f3f0977528f61ec61`. B nonce5, same Vault target, `claimBatch([68…100])`, value0; due **4,509,582 raw = 0.04509582 BEM**, with no further harvest.

Formal observation block 128584887, hash `0x12f069e1698fc701e362a213a1fd34929f882cac5a97b23a11663067ed108670`. Both canonical harvest/creator receipts and the complete historical hash prefix, current ownership and claim history for all 100 shares, H/q/r, and totalPaid all matched. Vault balance was 4,509,667 raw, expected to retain only the 85raw remainder after B's claim. Gas estimation and bounded simulation passed.

Gas estimate 1,077,134, limit 1,292,561, gasPrice0.05gwei, maximum fee **0.00006462805 BNB**; cumulative maximum reservation after execution **0.3043039911 BNB**, retaining the **0.3045 BNB** cap. The above describes read-only preparation; the user subsequently approved and executed the transaction individually, with actual results below.

### Actual Transaction 8 Receipt

Execution time **2026-10-20T00:24:28+08:00**, transaction [view receipt](https://bscscan.com/tx/0x09bad685e01819a520fa4120c5c6023c12768a6171846df73862614939785105), block **128585699**, hash `0xf74d7978513b1afc5ae06fbd24d5e93e9746e588282b8a92b4d554e3e2e10586`, at least 15 confirmations, journal=CONFIRMED. Sent once with the user-approved nonce5 and frozen parameters, without resend or recovery.

| Check | Actual result |
| --- | --- |
| B actually received | **4,509,582 raw = 0.04509582 BEM**, exactly 33×136,654 |
| Exact payment evidence | 33 RewardClaimed events for ID68–100, each 136,654raw; the only BEM Transfer was Vault→B 4,509,582raw |
| Same-batch checkpoint | 1 RewardsSynced.received=0, no Harvested, H/q/r unchanged |
| Final Vault ledger | totalAccounted=13,665,485; totalPaid=13,665,400; accPerShare=136,654; remainder=85 |
| Vault balance | **85raw = 0.00000085 BEM** |
| All 100 IDs | All claimed=136,654 and claimable=0; holder/supply/wallet batch balances all match the original 67/33 allocation |
| Miner and state | owner=Vault, ACTIVE, no miner or share transfer |
| gasUsed / gasPrice / actual fee | 1,055,204 / 0.05gwei / **0.0000527602 BNB** |

### Final Fees and Repeatable Reconciliation

Actual gas for the three rewards transactions was harvest **0.00001102315 BNB**, creator **0.0001044409 BNB**, B **0.0000527602 BNB**, totaling **0.00016822425 BNB**. Actual cumulative gas for four deployments plus eight test transactions was **0.0010715065 BNB**. Both subscription principals totaled 0.303 BNB; gross outgoing principal plus gas was **0.3040715065 BNB**, without offsetting the 0.003 BNB fee received by creator. Safe outer execution fees remain separate.

The shared budget retains all 12 historical reservations. Cumulative maximum reservation **0.3043039911 BNB** is below the approved **0.3045 BNB** cap, leaving **0.0001960089 BNB** available for reservation. The 0.0002324846 BNB difference between reservation and actual expenditure was not released.

The [final machine reconciliation result](../../../mainnet-rewards/audit/final-reconciliation.json) is **PASS, exit0**. The command independently decodes raw receipts and checks the 3 frozen plans and historical entryHash chain, all 100 shares' ledgers at each step, the 67/33 ratio, conservation, and all historical budgets. The **6/6 PASS** new offline reconciliation tests are recorded separately from the sender/observer tools' **693/693** regression. Reconciliation only checks saved evidence; it makes no new RPC call, signature, or broadcast. The sender completed actual mainnet confirmation of each of the three transactions separately.

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-rewards/audit/final-reconcile.test.mjs
node --import tsx mainnet-rewards/audit/final-reconcile.mjs
```

The [validation summary](../../../mainnet-rewards/validation.json), [complete raw journal](../../../mainnet-rewards/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json), three frozen plans, and each transaction's complete state were saved. Independent local evidence audit rechecked the final result; its scope is cross-checking saved evidence, not presenting an offline command as a new live-chain proof.
