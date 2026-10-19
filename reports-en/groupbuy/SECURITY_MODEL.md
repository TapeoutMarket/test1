# TapeOut GroupBuy V1 Security and Permission Model

The accurate public description is: **Vault has no custodial owner and is not upgradeable, while retaining limited Factory termination authority during funding.** Factory is upgradeable; this does not justify calling the whole system governance-free, trustless or audited. This file describes the current source boundaries; executed evidence and unexecuted items are separated in `CONTRACT_REPORT.md`.

## 1. Role and permission matrix

| Role | Permitted actions | Powers not granted |
| --- | --- | --- |
| Factory upgradeAdmin (Timelock) | Upgrade Factory after a delay, approve/select future templates and configurations, resume new pool creation | Current V1 has no entry point to withdraw Vault principal, BEM or NFTs, or replace refund beneficiaries |
| guardian | Pause creation; irreversibly terminate registered FUNDING pools into refundability, at most 32 pools per batch | Resume creation, upgrade, change configuration, collect others' refunds, cancel ACTIVE/REDEEMED pools |
| creator | Be recorded as the creation source; act under ordinary holder rules if contributing personally | Change order/price/deadline, cancel others' contributions, manage assets or receive exclusive rewards |
| Current share holder | Withdraw own principal in FUNDING/REFUNDABLE; claim for and transfer held IDs in ACTIVE | Others' principal/rewards; independently withdraw the underlying NFT with less than 100% ownership |
| ERC-1155 operator | Transfer shares in ACTIVE under ERC-1155 approval | Directly withdraw, claim or redeem for holders; approval itself is not actual ownership |
| Actual 100% holder | Normal redemption; or recover the NFT while bypassing Mining/BEM in a failure | Bypass transfer failures in the underlying NFT itself |
| redeemedBeneficiary | Exclusively claim residual and late BEM after closure, choosing the BEM recipient personally | Change the recorded beneficiary, reactivate the pool, or call Mining again for the miner already handed out |
| Any address | Create a valid new pool, confirm explicit permanent invalidity/expiry, harvest/sync in ACTIVE | Arbitrarily choose market/asset calls, or acquire others' rewards by triggering harvest |

An operator can first make a valid approved transfer to become the holder of those shares and then claim as a holder; holding all 100 shares also permits redemption. The market UI must disclose approval risks and must not create false confidence by saying only that operators cannot redeem directly.

## 2. Actual delay and upgrade boundaries

Factory's `_authorizeUpgrade` requires the caller to equal the fixed upgradeAdmin and the controller's current minimum delay to be no shorter than Factory's initialization requirement. An ordinary EOA or guardian cannot upgrade directly. The Factory implementation constructor disables its initializer; ERC1967Proxy initialization and deployment are atomic and cannot be repeated.

The repository's `GovernanceTimelock` inherits the locked OpenZeppelin TimelockController version. No external bootstrap admin exists at deployment; Timelock itself holds DEFAULT_ADMIN_ROLE. Deployment requires a nonzero delay and valid proposer/executor lists; a formal proposer should be an independently verified multisig. At initialization, guardian must be separate from Timelock and must not also hold proposer or default-admin roles.

`minimumDelayFloor` is fixed in the ordinary Timelock contract's code. `getMinDelay()` returns the greater of the internal setting and immutable floor, and OpenZeppelin scheduling actually calls this virtual function. Even a delayed self-call to `updateDelay(0)` cannot schedule subsequent operations with 0 delay. Configuration, resuming creation and upgrades must all follow actual schedule → wait → execute; local short-delay test roles are not evidence of a production multisig.

Factory's initialization checks for code/interface/getMinDelay/self-admin prevent misconfiguration, but **ABI return values alone cannot prove that the controller truly enforces a delay**: a malicious custom contract can fake those return values. The formal deployment manifest must verify actual Timelock sources, runtime bytecode, immutable floor, role members and multisig identity; an impersonated controller or EOA development configuration must not be marked production-ready. Subsequent role changes likewise require monitoring and governance review.

Factory uses ERC-7201 namespaced storage. Upgrade tests check Factory registration/roles/configuration alongside existing Vault terms, code and BEM ledgers. Namespaced storage reduces accidental layout collisions but does not prevent malicious upgrade code from arbitrarily modifying Factory's own state.

A malicious new Factory implementation can ignore approval or expected-parameter checks for future creation, approve malicious templates, forge an “official pool” label, tamper with indexes and disrupt creation service. Users should verify each deployed clone's actual runtime, implementation address, validator address/code, terms and independent manifest, rather than trusting only an upgradeable Factory's current labels or events.

## 3. Fixed clone and read-only validator

Vault has no Ownable, upgrade function, Beacon, arbitrary execute, administrator withdrawal or migration entry point. ERC-1167's sole delegatecall points to fixed ordinary template logic; the template has no registry choosing a further upgradeable execution implementation.

The template exposes immutable `implementationSelf()`, a fixed template ID and initializer lock state. When approving, Factory checks code existence, the designated codehash, version record, self-identity and disabled initializer together. This rejects common misconfigurations such as treating an ordinary ERC1967Proxy as a template. Approval still trusts governance's independent source and codehash review; malicious code can imitate the same getters, so a marker must not be treated as formal proof.

`MarketValidator` is created by the template constructor as an ordinary contract with no stored configuration, asset operations or upgrade entry point; its immutable address is embedded in the template code. Vault queries bound terms and protocol state only through STATICCALL, never transfers money to the validator, lets it execute a purchase or calls Mining through it. Vault remains the purchase caller and NFT recipient, and the Mining.claim caller and BEM recipient. Clone business state is fully written during initialize and does not depend on implementation storage initialized by its constructor.

The code-size limit was not bypassed with an unlimited code-size setting. The final report and release manifest give the exact compiler, EVM target, optimization settings and runtime byte count; these values do not guarantee mainnet gas feasibility.

## 4. Limited Factory emergency termination power

Vault's `factoryCancelFunding(uint8 reasonCode)` accepts only calls from the Factory fixed at initialization and shares the reentrancy lock with other asset-state entry points. Only in FUNDING does it change state to REFUNDABLE and record the reason and event; it performs no external asset transfer. Its interface has no refund recipient, withdrawal amount, arbitrary target or calldata.

A malicious Factory V2 may arbitrarily trigger this preset termination power on old FUNDING pools, harming availability; this is an explicitly retained governance risk. The old Vault still refunds under its original ID/principal ledger. Factory cannot collect on behalf of holders, deduct funds, freeze direct user exit or move REFUNDABLE back to FUNDING.

ACTIVE, PURCHASING and REDEEMED cannot be terminated through this entry point. Existing Vaults do not read Factory's latest template, owner, pause switch or pool query. Factory pauses, upgrades to a malicious implementation that reverts queries, or an unavailable guardian do not block existing direct withdrawals, claims, valid transfers or redemptions in Vault. Malicious-upgrade tests actually attempted withdrawals, parameter changes, upgrades, NFT transfers, claims and redemptions against old pools; the boundary is enforced by contracts, not by hiding frontend buttons.

## 5. Funding and order constraints

Principal is recorded using the cost of currently effective IDs; historical deposits or the BNB balance do not determine purchase eligibility. Participation is only for msg.sender, with an exact matching amount. Refunds update/burn before transferring BNB; failures revert atomically. Factory has no ordinary receive entry point, and creation does not forward principal; BNB forcibly sent to Factory by mistake is not normal managed funding.

The final participation includes the complete purchase and asset postconditions. Recoverable failures revert directly; the same reverted transaction does not pretend to persist REFUNDABLE permanently. requireCompletion protects the user's explicit intention to complete the group purchase. Creation and participation bind expected configuration and the full payload respectively; bad signatures, wrong orders or HTTP failures do not grant public authority to close someone else's pool.

Only the canonical fixed-price Seaport subset is accepted. Both orderHash and the full execution commitment are checked, preventing replacement of payment lists when the original hash does not commit to appended tips. Actual domain/chain/market/version, counter, signature or validated order, time, ownership and the exact zero-conduit approval target must all match. Purchase rejects a target NFT mistakenly sent to Vault beforehand and checks the target ownerOf afterward to avoid a falsely successful return value.

The full public listing payload and signature are stored/emitted so subsequent participants can obtain the same order. Any third party may buy first on the public market; low-priced real public test listings cannot be created automatically with a claim that only test accounts can buy. Completeness of off-chain order JSON proves format only, not current executability; DB deletion or API unavailability must never be treated as on-chain cancellation.

## 6. BEM and failure recovery

The ledger depends on ordinary, non-rebasing, fee-free BEM. Actual receipts are reconciled as `balance + totalPaid - totalAccounted`; ordinary payments also verify exact sender and recipient balance changes. Abnormal decreases and transfer fees are not silently absorbed. ID claim history follows the ID. Historical wallet totals may differ after consolidation; an audit should reconcile IDs and actual events rather than require historical A/B wallet totals to match.

`claimBatch` does not require Mining to succeed; existing BEM can be claimed independently. If Mining fails, the convenience entry point harvestAndClaim reverts explicitly. The actual 100% holder can also use redeemWithoutHarvest to obtain the NFT on a path entirely independent of Mining or BEM.balanceOf/transfer. The fixed beneficiary after closure retains residual BEM rights and can claim personally after the token recovers; unpaid BEM must not be recorded as already claimed.

A zero `pending(key)` is not a safe criterion for “no settleable rewards.” The [real fork settlement diagnostic](../../reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) observed positive BEM after directly calling Mining.claim with pending=0, disproving the old harvest skip condition. The corrected rule requires harvest to attempt fixed Mining.claim unconditionally and account for actual receipts, retaining reverts on failure; a broad catch must not turn a failure into a successful claim of 0. A successful call without new rewards and an error are separate states. The corrected continuing-rewards regression passed, confirming another positive actual Vault receipt and ledger increment at pending=0; this finding is not a source audit of Mining's complete internal settlement mechanism.

A participant holding less than 100% cannot independently withdraw one indivisible miner. There is no majority vote, administrator takeover or forced-consolidation tool. If holders become unreachable, shares are permanently lost or the underlying NFT prohibits transfer, the current fixed implementation cannot recover the whole miner for users. Having no owner does not mean every failure can be repaired.

## 7. Reentrancy, callbacks and indexes

Participation, withdrawal, termination, claims, harvest, redemption and single/batch ERC-1155 transfers share an ordinary storage ReentrancyGuard; it does not depend on transient storage whose target-chain support is unconfirmed. Public nonReentrant wrappers call internal logic rather than each other, avoiding self-locking.

The ERC-721 receipt callback only verifies the purchase transition state and fixed collection/tokenId/from; it neither activates the pool, harvests nor performs business external calls. ERC-1155 callbacks, BNB refunds, BEM payments and NFT delivery can all invoke recipient code. The shared lock and state checks prevent reentry across entry points, and payment/delivery failures revert.

The holder helper index is maintained for legal IDs and unit supply; 0 amounts, self-transfers and duplicate batch entries cannot create extra rights through it. Direct eligibility checks both holderOf and balanceOf. setApprovalForAll is a normal ERC-1155 approval facility, and the frontend must explain its transfer capability accurately.

## 8. Unsupported or unavoidable risks

1. **The real official CircuitMarket has not been verified.** `CIRCUIT_RESERVED` fails closed in the contract; the local MOCK_CIRCUIT ABI/state classification is not evidence of the official current implementation. The real market must provide source/ABI, implementation identity, fee and valid semantics, and independent order samples.
2. **External proxies are upgradeable.** A fixed proxy address and proxy codehash do not prove an unchanged implementation. Vault does not incorrectly attempt to read another proxy's EIP-1967 slot through its own SLOAD. Off-chain fixed-block checks and monitoring can reduce risk, but cannot exclude same-block upgrades or frontrunning.
3. **Real Mining/NFT/BEM behavior still requires version-specific verification.** Local Mock permissions, pending=0 behavior, recipients and fee-free/non-rebasing behavior do not guarantee every real deployment. Unknown adapters remain release blockers; fabricated zero values cannot be inserted to pass checks.
4. **Accidental assets may remain permanently.** Donated BEM after FUNDING failure, forced/extra BNB, prematurely transferred target NFTs, non-target NFTs and other tokens have no administrator rescue entry point. Accidental transfers do not justify adding an arbitrary withdrawal backdoor.
5. **Shared fixed logic may still contain defects.** Many clones share code; one defect may affect many pools, and immutability prevents directly patching existing pools. A new version changes future pools only; independent review/audit remains necessary before public funds go live.
6. **Tool results are not an audit.** Local unit tests, fuzz, invariants, gas and static tools establish only their configuration and executed coverage. Local real Seaport code + Mock assets, real BSC fork, live-chain receipts and UI are different evidence levels.

This round had no mainnet deployment, real transaction broadcast or market/database writes. Real-chain fork and live-chain tests without explicit RPC/order materials must be marked NOT_RUN; local PASS cannot replace them.
