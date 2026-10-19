# BSC Mainnet Purchase and Rewards Test Progress

Initial record: 2026-10-19; final live-test update: 2026-10-20 (Beijing time). **Deployment, multisig configuration, and all eleven test transactions succeeded on mainnet, each with at least 15 block confirmations and a CONFIRMED journal entry. Miner #3204 remains in the ACTIVE Vault; the total purchase price was 0.303 BNB. The initial creator/B subscriptions were 67/33 shares; after transaction 10 transferred #1 to B, their holdings became 66/34. The previous same-batch 67/33 rewards distribution passed: 0.13665485 BEM was received, and creator/B actually received 0.09155818/0.04509582 BEM. The unclaimed-entitlement transfer test in transactions 9–11 also passed: a further 0.00032254 BEM was received; with the old remainder, this created 0.00000323 BEM of entitlement per share. Transferring #1 preserved its entitlement and historical claimed value; creator was rejected with NotHolder, and B actually received that 0.00000323 BEM. The final receipt block was 128591816; the Vault held 0.00032016 BEM, and each of the other 99 shares retained 323 raw units of entitlement. Consolidation/redemption and failure refunds have not been executed.**

All tests authorized for this round are complete. Independent audits passed for the three actual entitlement-transfer receipts, the 100-share ledger, the raw NotHolder error bytes, the budget, and the fees. The final offline CLI actually ran with PASS/exit0. All 21 new sender tests, 714 combined regression tests, and 9 new offline reconciliation tests passed. Full transaction-by-transaction evidence and results are in [BEM_ENTITLEMENT_TRANSFER_REPORT.md](../mainnet-entitlement-transfer/BEM_ENTITLEMENT_TRANSFER_REPORT.md).

## Completed Live Governance

State inspection: [governance-inspection-1792420701946.json](../../../live-test/observations/governance-inspection-1792420701946.json), checkpoint block 128571518, `ALREADY_EXECUTED`, `creationPaused=false`; the selected template and configuration match this deployment.

Actual receipt evidence: [governance-receipts-1792421032178.json](../../../mainnet-test/observations/governance-receipts-1792421032178.json). Both transactions succeeded with at least 15 confirmations; the targets, values, payloads, and order of all four Timelock calls matched. Safe `ExecutionSuccess` and Timelock events prove successful execution; this script did not independently recover each owner's signature.

| Safe operation | Mainnet transaction | Actual gas fee, BNB |
| --- | --- | ---: |
| scheduleBatch | `0x6dbd7c4c1b0b3fe9fe5d6f9c5e1401509bbc420460919c225dd55cd8cb5505df` | 0.00000801223394 |
| executeBatch | `0x4ec7f4c6dbbb750ca5c82ed38bafb9bdee47d3ee94e347425369508b0797aea7` | 0.0000270332578 |

The interval was **1,453 seconds**, satisfying the 600-second delay. Both outer transactions were sent by `0x15c059a5acb36142eea576bdbc0330fd7e9d3099` to the designated Safe. That outer executor paid the fees above, which are excluded from the creator/A/B deployment budget ledger; actual fees for the preceding four deployments remained 0.00054914865 BNB.

## Fixed Order and Initial Subscription Allocation

| Item | Value |
| --- | --- |
| Network | BSC mainnet, chainId 56 |
| Miner collection | `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C` |
| Miner ID | 3204 |
| Seller A | `0x1b55E6A757987576E1a130A011f9E12498De7DB9` |
| Seaport | `0x0000000000000068F116a894984e2DB1123eB395` |
| Seller proceeds | 0.3 BNB |
| Fee and recipient | 0.003 BNB, creator |
| Total buyer payment | 0.303 BNB, plus gas |
| creator | IDs 1–67, 67 shares, 0.20301 BNB |
| B | IDs 68–100, 33 shares, 0.09999 BNB |
| Funding deadline | 2026-10-20 22:36:11, Beijing time |
| Order expiration | 2026-10-20 22:41:11, Beijing time |
| Created Vault | `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| orderHash | `0xe7f4a836c7eee681eb2cced9357e0b54848ee79f1a4b95a058c154907fef07cd` |

The 67/33 allocation above is the initial subscription allocation. After transaction 10 was confirmed, creator held #2–67 and B held #1 and #68–100: 66/34 shares in total.

Frozen session: [session.json](../../../mainnet-test/session.json), hash `0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c`.

Complete order: [order-envelope.json](../../../mainnet-test/order-envelope.json); identity manifest: [live-manifest.json](../../../mainnet-test/live-manifest.json), hash `0x3a041e534d6a14c3173b084d6d1d17f36ed45bcf7f36cc1ff3756e3d25964113`. The manifest passed SDK identity verification and binds the predicted clone, template, configuration, order terms/payload, and governance review checkpoint; it does not itself mean that the clone was deployed or the purchase completed.

Initial read-only preparation evidence: [readiness.json](../../../mainnet-test/readiness.json); its unapproved state is a historical snapshot from before execution. At historical receipt block 128575509, when the second order-validation transaction completed, A still held the miner; Seaport had approval for #3204 alone, with no collection-wide approval. The new order was validated, uncancelled, unfilled, and used `signature=0x`. In this round, A validated the order on-chain, following the sequence verified on the fork. The FULL_OPEN order was fillable by other buyers, with no buyer restriction reserving it for this pool; this round did not publish an order to the marketplace or write to a database.

Miner approval covers #3204, rather than the whole collection, but is not limited to an orderHash. Any other still-valid Seaport order for that miner might also use the approval.

## Balances, Sequence, and First Transaction Plan

Balances at mainnet block 128571566: creator 0.20428658555 BNB, A 0.0049597677 BNB, B 0.1148789795 BNB. Both buyers had enough principal. Their remaining balances after principal but before subsequent gas were 0.00127658555 and 0.0148889795 BNB respectively. Balances, nonces, and quotes were still rechecked before each signature.

| Sequence | Action | Current evidence |
| --- | --- | --- |
| 1 | A approve(Seaport, 3204) | Mainnet success, block 128574540, at least 15 confirmations; actual fee 0.0000028134 BNB |
| 2 | A Seaport.validate(order, signature=0x) | Mainnet success, block 128575509, at least 15 confirmations; actual fee 0.0000034334 BNB |
| 3 | creator createPool | Mainnet success, block 128576858, at least 15 confirmations; actual fee 0.0000692677 BNB; initial empty-pool state and fixed clone identity verified |
| 4 | creator contribute IDs 1–67, requireCompletion=false | Mainnet success, block 128578206, at least 15 confirmations; principal 0.20301 BNB, actual gas fee 0.0001774711 BNB; all 67 mints and the full funding amount verified |
| 5 | B contribute IDs 68–100, requireCompletion=true | Mainnet success, block 128579551, at least 15 confirmations; principal 0.09999 BNB, actual gas 0.000101148 BNB; purchase in the same transaction and the complete 67/33 allocation verified |
| 6–8 | harvest, creator claims 67 shares, B claims 33 shares | All confirmed on mainnet; same-batch 67/33 distribution and remainder conservation PASS; see rewards report |
| 9 | New harvest creates unclaimed rewards before #1 is transferred | Mainnet confirmed, block 128589337; newly received 0.00032254 BEM, claimable per share 0.00000323 BEM; actual gas 0.00000760315 BNB |
| 10 | creator transfers share #1 to B | Mainnet confirmed, block 128590538; entitlement remains 323 raw, creator strictly returns NotHolder; actual gas 0.00000344225 BNB |
| 11 | B claims transferred #1 | Mainnet confirmed, block 128591816; actually received 323 raw, other 99 shares preserved; actual gas 0.0000040223 BNB |
| Later | Consolidation/redemption and failure refunds | Not executed on mainnet in this round |

First frozen plan: [seller-approve-7085fc34cae1d26f37d74391df3cb29c8688fcfa7db60d472786a6258742eac7.json](../../../mainnet-test/plans/seller-approve-7085fc34cae1d26f37d74391df3cb29c8688fcfa7db60d472786a6258742eac7.json). nonce=5, value=0, estimated gas 57,074, gas with 20% headroom 68,489, gasPrice=0.05 gwei, maximum fee **0.00000342445 BNB**.

The existing deployment budget reservation of 0.00066448855 BNB was not reset. The maximum reservation after transaction 1 was 0.000667913 BNB; after transaction 2 was confirmed, it was **0.0006720844 BNB**, below the retained cumulative cap of 0.0015 BNB. This was the historical cap at the end of transaction 2, before principal was included. Transactions 4 and 5 subsequently received separate approvals for principal, gas, and the expanded cumulative budget. The budget through purchase is in the transaction 5 section; the budget from transaction 9 onward is in the final entitlement-transfer section.

## Local Validation and Execution Entry Points

New scripts were isolated in `mainnet-test/`. Deployed contracts, SDK/CLI, historical deployment runtimes, and SESSION_PLAN were unchanged. The old core hash was `9ff04a9f9e6431657fb44b45217d8e71d39eda55ba02ae2c12081b8a00cdafba`, and the bootstrap hash was `c8941190c7f030d61537600dbc1d194e6a92349fc7395c590ff3e814bf971361`; rechecking confirmed both were unchanged.

Initial relevant tests: **69/69 PASS**—4 order/identity preparation tests, 9 Safe receipt-matching tests, and 56 seller transaction-sending protections. Coverage included incorrect governance/fee bindings, independent Safe log formats, altered nonces/quotes/targets, missing confirmation, recovery after duplicate sends, cumulative budgets, first-time directory creation, and symlink boundaries. Safe event indexed declarations and initial journal directory creation were fixed before any transaction was sent. Event declarations were checked against the [official Safe 1.4.1 source](https://raw.githubusercontent.com/safe-global/safe-smart-account/v1.4.1/contracts/Safe.sol). The later 138-test results are in the transaction 2 preparation record below.

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-test/*.test.mjs

# 两笔卖家交易已成功；以下只读复核第二笔既有 hash，不再次发送。
node --import tsx mainnet-test/send-step.mjs --env ../.env \
  --session mainnet-test/session.json --step seller-validate --public-rpc-fallback --reconcile
```

Broadcasting additionally requires `--broadcast`, the plan hash, explicit budgets, live switches, and per-transaction confirmation in a real interactive terminal. The script persists the budget/journal before reading A's signing key; after signing, it records the hash before broadcasting at most once. Any change in quote, nonce, code, or parameters stops execution and preserves the reservation. An unknown outcome permits only `--reconcile` against the recorded hash; deleting state and retrying is prohibited.

The current `send-step.mjs` supports only the two seller transactions. Pool creation has a separate `mainnet-pool/create-pool.mjs`; creator's 67-share contribution has `mainnet-funding/creator-contribute.mjs`. Both reuse identity, budget, and receipt verification and rerun `verifyLiveIdentity`. B's completion has a separate `mainnet-completion/buyer-b-complete.mjs`. All three transactions in each of `mainnet-rewards/rewards.mjs` and `mainnet-entitlement-transfer/entitlement.mjs` were individually approved, executed, and successfully verified. Rerunning existing records only reconciles their original hashes; it does not authorize a new signature. A redemption entry point still requires separate preparation and review; the old CLI broadcast flow must not be treated as having these protections.

## First Approval Transaction: Execution and Recovery Record

The user explicitly confirmed A's approve(Seaport,3204), with nonce=5, gasLimit=68,489, gasPrice=50,000,000 wei, and value=0. The frozen plan passed its execution precheck; the original parameters were signed and transaction hash `0x7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416` was saved.

The post-signing checks or submission process returned `STOPPED_RECONCILE_ONLY`; `SUBMITTED` never appeared. That sender version did not save the original error details, so the precise failed stage cannot be determined, and this cannot establish that no broadcast occurred. The original journal and budget were preserved in full; no second transaction was created and no reservation was reset.

Read-only `--reconcile` returned `TRANSACTION_OR_RECEIPT_NOT_AVAILABLE`. Subsequent checks through two RPCs are in [seller-approve-recovery-1792421377029.json](../../../mainnet-test/observations/seller-approve-recovery-1792421377029.json): neither RPC could yet find the hash or receipt; A's latest/pending nonces were both 5; the miner was still held by A and approval was zero. The repeated simulation and quote matched the original plan in full. These were observations at that time, not proof that the original request never reached any node.

The recovery plan permitted only reuse of the original budget and nonce/parameters. The reconstructed signed transaction hash had to match the recorded hash above exactly. No higher gas price, additional nonce, or retry by deleting previous state was permitted.

### Recovery and Receipt Verification Results

Independent RPC simulation added to the recovery tool identified a compatibility issue: `eth_call` with gasPrice but without gas reported insufficient balance; adding the original planned gas=68,489 passed. The actual balance was sufficient, and the independent estimate remained 57,074. This explains the recovery precheck issue, but does not determine why the original sender stopped after signing. The primary RPC in the configuration subsequently timed out repeatedly on read-only requests, so `https://bsc-dataseed.defibit.io`, listed in the [official BNB Chain documentation](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/), was explicitly selected and cross-checked with `https://bsc-dataseed.bnbchain.org`. `.env` was not modified; there was no automatic switch or automatic broadcast retry.

Pre-recovery evidence: [preview-1792421998297.json](../../../mainnet-recovery/preview-1792421998297.json). Neither RPC observed the original hash, and latest/pending nonces were both 5. Chain identity, the frozen block, protocol code, owner/approval, order status, simulation, estimate, and quote all matched the original plan. The recovery tool passed **58/58 offline tests** and independent code review; its runtime hash was `0x381edc88008328531cbb297bf9a35c325b83c4863749d00ef38c1f4c2d9227bc`.

| Receipt field | Verified result |
| --- | --- |
| Only transaction hash | [0x7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416](https://bscscan.com/tx/0x7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416) |
| Block | 128574540 |
| Block hash | `0x247d47cdf26e827119b89bd29f3d57cdaa57ef413050b9f11b604b5809e5cac0` |
| Status | success, at least 15 block confirmations |
| gasUsed / effectiveGasPrice | 56,268 / 50,000,000 wei |
| Actual fee | 2,813,400,000,000 wei = **0.0000028134 BNB** |
| Miner owner at receipt block | A, not transferred |
| getApproved(3204) | Designated Seaport address |
| isApprovedForAll(A,Seaport) | false |
| A latest / pending nonce | 6 / 6 |
| New order status | Not validated, uncancelled, unfilled |

Recovery record and full receipt: [attempt-7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416.json](../../../mainnet-recovery/attempt-7154d3e77dce853c3150f7af076e7fe8332e0101741bbf94aebf6b9d42f49416.json). Deterministic re-signing produced the original hash, and the recovery entry point invoked sending only once. Whether the original sender ever reached broadcast remains unknown; only the same single transaction is confirmed on-chain. No budget reservation was added. The cumulative maximum reservation remained **0.000667913 BNB**; actual fees for four deployments plus this transaction totaled **0.00055196205 BNB**, excluding Safe outer execution fees.

The original sender subsequently ran `--reconcile` using `mainnet-recovery/public-readonly.env`, which contained only public RPC configuration and no keys. The original [journal](../../../mainnet-test/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) was marked `CONFIRMED`; this verification sent no additional transaction.

The three sender runtime files and corresponding tests used for transaction 1 were saved as [original-seller-runtime-642f174ac0c72794.tar.gz](../../../mainnet-recovery/original-seller-runtime-642f174ac0c72794.tar.gz), without environment variables or keys. Archive SHA-256: `99228989412f6b9dbf4046a61381a6df5adbaf5ea99b8dc4dcb9491f022ebae3`. The updated runtime hash and transaction plan were separately frozen for transaction 2, while this older-version evidence was retained.

## Second Transaction, Order Validation: Confirmed on Mainnet

To continue using the public backup node, the normal sender gained an explicit `--public-rpc-fallback` flag. The plan, exact confirmation text, and journal bind the RPC mode and public endpoint; switching is never automatic. The precheck first estimates gas independently, then runs bounded `eth_call` using the same quote and 20% headroom, avoiding an excessively large public-node default gas allowance. Failures report the specific stage with sensitive details removed, while preserving the signed hash/budget and prohibiting automatic resubmission.

New sender runtime hash: `1100bae4d7187352114434a73efba06e31af0521fa149385ed616a55203d0c2c`. Core, bootstrap, session, and original transaction evidence were unchanged. Independent review and the combined local regression before transaction 2 passed **138/138**: preparation 4, Safe receipts 9, sender 67, historical recovery unit tests 58. These are historical pre-send results; later tests are reported in their later run records. The historical recovery tool pins the old sender hash and therefore will not run recovery against the updated runtime; transaction 1 is already complete and does not need to be run again.

Second frozen plan: [seller-validate-9be87271f1183c6b9828da5871b82fc05a403c2fad047ff6a14c92a2eff13f5d.json](../../../mainnet-test/plans/seller-validate-9be87271f1183c6b9828da5871b82fc05a403c2fad047ff6a14c92a2eff13f5d.json). Plan hash: `0x9be87271f1183c6b9828da5871b82fc05a403c2fad047ff6a14c92a2eff13f5d`.

| Field | Frozen value approved by the user and executed |
| --- | --- |
| chainId / sender / nonce | 56 / A / 6 |
| Target | Seaport `0x0000000000000068F116a894984e2DB1123eB395` |
| Call | `validate` the complete #3204 order for this round, `signature=0x` |
| value | 0 BNB |
| Gas estimate / gas limit | 69,523 / 83,428 |
| gasPrice | 50,000,000 wei = 0.05 gwei |
| Maximum fee for this transaction | **0.0000041714 BNB** |
| Cumulative maximum reservation afterward | **0.0006720844 BNB**, cap still 0.0015 BNB |
| dataHash | `0x2dd7ee4eccf1be846a8991e6bf007e9abc08db112f532454dffb81b9dbd08ac1` |
| Order economics | Seller A receives 0.3 BNB; creator receives 0.003 BNB; buyer pays 0.303 BNB upon fulfillment |
| Order expiration | 2026-10-20 22:41:11, Beijing time |

Read-only precheck block before sending: 128575158. The miner still belonged to A, single-token approval was correct, the order was not yet validated/cancelled/filled, and A's latest/pending nonces were 6. The original approval receipt was reverified, and the second transaction's simulation and estimate passed. After the user separately approved this transaction, the sender rechecked the frozen parameters, signed, and sent it. It completed normally without entering a rebroadcast or recovery flow.

| Receipt field | Verified result |
| --- | --- |
| Transaction hash | [0x85dc9802961954ca78a54aa54631bd6b5aa7c001ed916f455ef89292086496b0](https://bscscan.com/tx/0x85dc9802961954ca78a54aa54631bd6b5aa7c001ed916f455ef89292086496b0) |
| Block | 128575509 |
| Block hash | `0x91550b47699d186c219dee3805df14add457f96884ed6a715f7549d3f7a3a10d` |
| Status | success, at least 15 block confirmations |
| gasUsed / effectiveGasPrice | 68,668 / 50,000,000 wei |
| Actual fee | 3,433,400,000,000 wei = **0.0000034334 BNB** |
| Seaport orderStatus | `[true,false,"0","0"]`: validated, uncancelled, unfilled |
| Miner / approval | owner=A; getApproved(3204)=designated Seaport; isApprovedForAll=false |
| A latest / pending nonce | 7 / 7 |

Full evidence is in the `seller-validate` entry of the original [journal](../../../mainnet-test/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json), status `CONFIRMED`. Actual fees for the two seller transactions totaled **0.0000062468 BNB**; actual fees for four deployments plus two test transactions totaled **0.00055539545 BNB**, excluding Safe outer execution fees. The shared ledger's cumulative maximum reservation was **0.0006720844 BNB**; reservations were not reduced to actual gas used.

Creator's `createPool` was prepared after transaction 2; it subsequently received separate user approval and succeeded, as detailed below.

The code entry points and checklist for 67/33 contributions and refunds are in [POOL_TEST_NEXT_STEPS.md](POOL_TEST_NEXT_STEPS.md). Creator's 67-share contribution, B's 33-share contribution, purchase, same-batch claims, and unclaimed-entitlement transfer tests are all complete; live consolidation/redemption and failure-refund steps remain **NOT_RUN**.

## Third Transaction, Group-Buy Pool Creation: Confirmed on Mainnet

Added [create-pool.mjs](../../../mainnet-pool/create-pool.mjs) and [usage instructions](../../../mainnet-pool/README.md), supporting only this fixed `createPool` action. It does not modify deployed contracts, SDK, the first two transaction runtimes, frozen order, or governance configuration. The script reuses the global lock, budget, and record-before-signing flow. It verifies the actual receipts for the two seller transactions, the Factory proxy and implementation, Timelock/configuration/template, miner/BEM/Mining code, order executability, and CREATE2 predicted address. After creation, the same verified receipt is used to check both creation events, clone code, and zero-contribution FUNDING state.

New-directory tests: **150/150 PASS** (135 action/event/preview/budget tests; 15 independent receipt tests). Combined regression: **289/289 PASS**—preparation 4, Safe receipts 9, seller sender 67, historical recovery 59, pool creation 150. The additional historical recovery test uses an independent historical fixture, so later successful transactions no longer change its single-transaction recovery conditions; the real journal/budget were not modified.

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-test/*.test.mjs mainnet-recovery/*.test.mjs mainnet-pool/*.test.mjs

# 默认只读；不会签名或广播。
node --import tsx mainnet-pool/create-pool.mjs --env ../.env \
  --session mainnet-test/session.json --public-rpc-fallback
```

Frozen plan: [create-pool-160202869ab4bf0f4468613d2d5328bd9bc5bbf82a04783e24c6ed33f1f3528d.json](../../../mainnet-pool/plans/create-pool-160202869ab4bf0f4468613d2d5328bd9bc5bbf82a04783e24c6ed33f1f3528d.json). Plan hash: `0x160202869ab4bf0f4468613d2d5328bd9bc5bbf82a04783e24c6ed33f1f3528d`; new runtime hash: `c6e3f405ac75a0aa40d8d053cb1dc908797feed96bac56f889a1aaa6bd4fa601`.

| Field | Frozen value approved by the user and executed |
| --- | --- |
| Network | BSC mainnet, chainId 56 |
| Sender / nonce | creator `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129` / 9 |
| Target Factory | `0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1` |
| Predicted and actually created Vault | `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| Fixed template | `0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a` |
| Name / round | TapeOut3204-mainnet-67-33 / 1 |
| value | 0 BNB; this transaction only creates the pool; principal is contributed in later transactions |
| Gas estimate / gas limit | 1,409,680 / 1,691,616 |
| gasPrice | 50,000,000 wei = 0.05 gwei |
| Maximum fee for this transaction | **0.0000845808 BNB** |
| Cumulative maximum reservation afterward | **0.0007566652 BNB**, cumulative cap still 0.0015 BNB |
| dataHash | `0xf14c984f3e1de0f02811289d31eb755844b33b0df31a2002e349d4540879375f` |
| Funding deadline | 2026-10-20 22:36:11, Beijing time |

The formal read-only plan used state block 128576203: creator's latest/pending nonces were both 9, and the balance was 0.20428658555 BNB. The predicted pool had no code and was not registered. The miner remained with A, approval was correct, and the order was validated and unfilled. Factory/governance/dependency identities, both prerequisite receipts, order protocol checks, independent gas estimation, and bounded-call simulation all passed. After separate user approval, frozen parameters and quote were rechecked before signing and broadcasting, and the transaction was sent once with the original nonce and maximum fee; there was no resend or recovery.

| Receipt field | Verified result |
| --- | --- |
| Transaction hash | [0x391c7bbee1c93025675055f0f26b7a8c8913a5333fea167b50115265efc11aca](https://bscscan.com/tx/0x391c7bbee1c93025675055f0f26b7a8c8913a5333fea167b50115265efc11aca) |
| Block / block hash | 128576858 / `0x820739f8f2cd8cb2c0aba2588679f18507a2428cbe7857be8fe9844a42d4f7c6` |
| Status | success, at least 15 block confirmations |
| gasUsed / effectiveGasPrice | 1,385,354 / 50,000,000 wei |
| Actual fee | 69,267,700,000,000 wei = **0.0000692677 BNB** |
| Creation events | Exactly one Factory `PoolCreated` and one Vault `VaultInitialized`; creator, template, configuration, terms, salt, and payload all match |
| clone runtime hash | `0x61c1667856d7a9eb0d4f00dcc26f4123847f223500db9b9c5de567a2d28bee18`, standard ERC-1167 pointing to the designated template |
| Initial state | Registered in Factory; state=FUNDING(0), soldCount=0, fundedWei=0, totalPrincipalIn=0 |
| Miner owner | Still A |
| Creator balance at receipt block | 0.20421731785 BNB |

Full receipt and business-state verification: [pool-creation journal](../../../mainnet-pool/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json). The created Vault has no asset-management owner and cannot be upgraded; this transaction neither purchased the miner nor collected subscription principal. The shared ledger's cumulative maximum reservation was **0.0007566652 BNB**, preserving every previous reservation. Actual fees for four deployments plus three test transactions totaled **0.00062466315 BNB**, excluding Safe outer execution fees. The relevant 289 regression tests were rerun after pool creation and all passed.

Creator subsequently subscribed to IDs 1–67 with value=0.20301 BNB and nonce 10; this succeeded after separate approval, as detailed below. Before signing, it was made explicit that `requireCompletion=false` only means the transaction need not fill the pool: if a third party subscribes to the other 33 shares first in this public pool, the transaction could still trigger purchase. The actual receipt proves that this race did not occur and the result was the expected 67-share FUNDING state.

## Fourth Transaction, Creator's 67-Share Subscription: Confirmed on Mainnet

New entry point: [creator-contribute.mjs](../../../mainnet-funding/creator-contribute.mjs); [instructions](../../../mainnet-funding/README.md); [validation record](../../../mainnet-funding/validation.json). This entry point implements only transaction 4. At that time, only creator's contribution was approved; B received separate approval and executed later in transaction 5. New-directory tests: **183/183 PASS** (business logic 134, read concurrency 6, creation-receipt prerequisites 43); full relevant regression: **472/472 PASS**, independently reviewed. The main read-only RPC has a global concurrency limit of 8, with each request executed only once.

The initial formal preview encountered unavailable historical state on the public RPC while rereading storage at the pool-creation block; see the [failure record](../../../mainnet-funding/observations/creation-history-pruned-preview.json). That attempt did not sign, broadcast, or add a reservation. The new entry point instead rechecks the old canonical pool-creation transaction, 15 confirmations, exact gas/nonce/value/calldata, and all creation events. Current clone/configuration/all 100 IDs/empty-pool state are read separately at the latest fixed block. Original pool-creation state evidence remains preserved; the plan explicitly states `historicalStorageRechecked=false` and does not claim that old storage was reread in this run. This fix did not modify any runtime used to send an earlier transaction.

Formal plan: [creator-contribute-7c913cd7dab07b9fc12dff5da6ef83cc0b5e2e76c570010e0ad71c95bbe7b644.json](../../../mainnet-funding/plans/creator-contribute-7c913cd7dab07b9fc12dff5da6ef83cc0b5e2e76c570010e0ad71c95bbe7b644.json). Plan hash `0x7c913cd7dab07b9fc12dff5da6ef83cc0b5e2e76c570010e0ad71c95bbe7b644`, runtime hash `d0d56d26a25f63369b4982670097bdd28f9161057a102206e2ad94fc824e5542`.

| Field | Frozen value approved by the user and executed |
| --- | --- |
| Network / sender / nonce | BSC 56 / creator / 10 |
| Target | Vault `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| Call | `contribute([1…67], false, original frozen payload)` |
| Principal value | **0.20301 BNB**, 67 shares × 0.00303 BNB |
| Gas estimate / limit | 3,610,942 / 4,333,131 (20% headroom) |
| gasPrice | 50,000,000 wei = 0.05 gwei |
| Maximum gas fee for this transaction | **0.00021665655 BNB** |
| Maximum principal plus gas for this transaction | **0.20322665655 BNB** |
| Cumulative maximum reservation afterward | **0.20398332175 BNB**, including all historical reservations and this principal |
| Approved cumulative budget | **0.20451 BNB** = original gas budget 0.0015 + this principal 0.20301; excludes B's later principal |
| dataHash | `0x573a807f44e97b3bb2dbe5c403b75fec2a868beaf685a8e01beaf94494b4ccf1` |

Formal preview observation block: **128577738**, hash `0xe62b24082814909682e5eb75c664c80f210b5726c7ada5b2e1a780cf4647c47c`. Creator's latest/pending nonces were both 10, with balance **0.20421731785 BNB**; the pool was FUNDING, all 100 shares were unoccupied, the miner remained with A, and the order was validated and unfilled. Prerequisite receipts, current clone/dependency identities, cost per share, order executability, gas estimation, and bounded simulation all passed. This was a read-only result, not evidence of a successful contribution.

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-test/*.test.mjs mainnet-recovery/*.test.mjs mainnet-pool/*.test.mjs mainnet-funding/*.test.mjs

# 仅只读预览；实际发送仍需用户逐笔批准。
node --import tsx mainnet-funding/creator-contribute.mjs --env ../.env \
  --session mainnet-test/session.json --public-rpc-fallback
```

This transaction required no Safe signature; creator subscribed directly. After the user approved principal, gas, and the cumulative budget, the sender rechecked the nonce, complete empty-pool state, code, and quote, then sent once with the frozen parameters, without retry or recovery.

| Receipt field | Verified result |
| --- | --- |
| Transaction hash | [0xc6318e68d9433b597bd9d3296478fd328c4cf77eb6fe9c2802e3cfd483e37abd](https://bscscan.com/tx/0xc6318e68d9433b597bd9d3296478fd328c4cf77eb6fe9c2802e3cfd483e37abd) |
| Block / block hash | 128578206 / `0x4409f58ca8df8119a6282e6ee936bbcf1d50a70feac0e13a0e9e87680014dd99` |
| Status | success, at least 15 block confirmations |
| gasUsed / effectiveGasPrice | 3,549,422 / 50,000,000 wei |
| Actual gas fee | **0.0001774711 BNB** |
| Actual principal transferred in | **0.20301 BNB** |
| Minting and entitlements | Exactly one `TransferBatch` minted IDs 1–67 from the zero address to creator, all with quantity 1; the complete corresponding `Contributed` matched; the other 33 IDs remained empty |
| Pool state / native balance | FUNDING(0), soldCount=67, fundedWei=totalPrincipalIn=Vault native balance=0.20301 BNB |
| Purchase/refund | purchaseSpent=0, totalPrincipalRefunded=0, no `Purchased` event, miner still held by A |
| Creator balance at receipt block | **0.00102984675 BNB** |

The full [subscription journal](../../../mainnet-funding/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) was saved. Actual gas for four deployments plus four test transactions totaled **0.00080213425 BNB**, plus principal of **0.20301 BNB**; Safe outer executor fees are listed separately. The shared ledger's cumulative maximum reservation was **0.20398332175 BNB**, without reductions to actual gas used.

The next step was B subscribing to IDs 68–100 using nonce 4, paying 0.09999 BNB with `requireCompletion=true`, filling all 100 shares and automatically purchasing the miner in the same transaction. After the independent sender, full receipt verification, offline tests, and formal read-only quote were complete, the user approved transaction 5. It has now succeeded, as detailed below.

## Fifth Transaction, B's 33-Share Subscription and Miner Purchase: Confirmed on Mainnet

Entry point: [buyer-b-complete.mjs](../../../mainnet-completion/buyer-b-complete.mjs), [operating instructions](../../../mainnet-completion/README.md), [validation record](../../../mainnet-completion/validation.json). All **159/159** new offline tests and **631/631** full relevant regression tests passed; the author, independent reviewer, and root agent agreed on the review. Previous senders, session, manifest, source, and ABI were unchanged.

Formal read-only plan: [frozen plan](../../../mainnet-completion/plans/buyer-b-complete-c8a6ec4abd225407dbda632d68434f259044643a2b39b23229cc024babf8af8c.json), hash `0xc8a6ec4abd225407dbda632d68434f259044643a2b39b23229cc024babf8af8c`; new tool hash `120eb2234a7fb92585a3f3721f57eba74b2df9b7fcb66f531d67ce3c58630b49`. The root agent recalculated the raw plan-file hash, runtime hash, and budget arithmetic; all matched.

| Field | Frozen value approved by the user and executed |
| --- | --- |
| Network / sender / nonce | BSC 56 / B / 4 |
| Target Vault | `0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A` |
| Call | `contribute([68…100], true, original frozen payload)` |
| Principal | **0.09999 BNB** |
| Gas estimate / limit | 2,077,724 / 2,493,269 (20% headroom) |
| gasPrice | 50,000,000 wei = 0.05 gwei |
| Maximum gas fee for this transaction | **0.00012466345 BNB** |
| B's maximum principal plus gas | **0.10011466345 BNB** |
| Cumulative maximum reservation afterward | **0.3040979852 BNB** |
| Approved cumulative budget | **0.3045 BNB** = all principal 0.303 + original gas budget 0.0015 |
| calldataHash | `0xa882e97b7b1ef72a1f182255615ebb73147e4bd4bad9c629076a01fb5ce851ba` |

Formal observation block: **128578977**, hash `0x1809dd716fca87725bec31c1eb99940a1cae0a9478ca05dc48465588fae9e848`; B's latest/pending nonces were both 4, with balance **0.1148789795 BNB**. The pool was FUNDING, with 67 shares sold, native balance and cumulative principal both 0.20301 BNB; all IDs 1–67 belonged to creator, and all IDs 68–100 were available. The miner still belonged to A, its individual approval was Seaport, and the order was validated and unfilled. The four earlier canonical receipts, current clone/dependency identities, order executability, gas estimation, and bounded simulation all passed. Historical transaction prerequisites recheck receipts and events only; current state is checked independently, without relying on pruned historical storage.

The approved expected execution was to atomically fill all 100 shares and buy #3204: seller A receives 0.3 BNB, creator receives a 0.003 BNB fee, the miner enters the Vault, and creator/B end with 67/33 shares. There is no separate execute-purchase transaction. A change or failure reverts B's entire contribution while consuming gas; creator's principal already in the pool is not automatically refunded. A successful receipt must match the complete Seaport consideration, miner transfer, 33 share mints, and Purchased event, plus ACTIVE state, all 100 share owners, and all funding fields. At the time of the purchase receipt, independent transaction-isolated balance/trace verification of payments and BEM harvest/claim were all NOT_RUN. BEM live tests were completed separately later; independent native-currency trace verification remains NOT_RUN.

The earlier read-only preparation did not sign, broadcast, or reserve B's principal. The user subsequently approved this transaction's parameters and cumulative budget of **0.3045 BNB** separately. After rechecking, the script sent once with the same nonce, calldata, and fees, with no retry or recovery. This confirmation followed the user's explicit requirement to ask before every signature.

| Receipt field | Verified result |
| --- | --- |
| Transaction hash | [0x17509be1a415297b7ffbad6ad346625d6f67cb24aaffdd66ab4aae7e79f9f0a6](https://bscscan.com/tx/0x17509be1a415297b7ffbad6ad346625d6f67cb24aaffdd66ab4aae7e79f9f0a6) |
| Block / block hash | 128579551 / `0x5fb9f6269be9850109f2671f87ed4c2998f283cf7b0ee535edf904ba6351717c` |
| Status | success, at least 15 block confirmations, journal=CONFIRMED |
| gasUsed / effectiveGasPrice | 2,022,960 / 50,000,000 wei |
| Actual gas fee | **0.000101148 BNB** |
| B's actual principal / principal plus gas | **0.09999 BNB / 0.100091148 BNB** |
| Shares | Exactly one TransferBatch minted 68–100 to B; holder, supply, and creator/B balances for all 100 IDs verified as 67/33, supply=1 for each ID |
| Completed state | ACTIVE(2), soldCount=100, fundedWei=0, Vault BNB=0, totalPrincipalIn=purchaseSpent=0.303 BNB, totalPrincipalRefunded=0 |
| Miner ownership | The only NFT Transfer was A→Vault; ownerOf(3204)=Vault at the receipt block |
| Order and payment evidence | The unique complete Seaport OrderFulfilled and Purchased match the frozen order; offer=#3204, consideration=0.3 BNB to A and 0.003 BNB to creator; order fully filled |
| B's BNB balance at receipt block | **0.0147878315 BNB** |
| BEM starting point | Vault BEM=0, totalAccounted=totalPaid=accPerShare=remainder=0; RewardsSynced.received=0, no Harvested or RewardClaimed |

The complete [B subscription/purchase journal](../../../mainnet-completion/transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json) was saved. Protocol-event verification of native-currency payment amounts and recipients is **VERIFIED**; independent transaction-isolated balance or trace verification of receipts remains **NOT_RUN**. Arbitrary wallet balance differences across blocks are not substituted for transaction-level evidence.

Actual gas for four deployments plus five test transactions totaled **0.00090328225 BNB**, subscription principal totaled **0.303 BNB**, and principal plus actual gas totaled **0.30390328225 BNB**. Safe outer executor fees remain separate. The shared ledger's cumulative maximum reservation was **0.3040979852 BNB**, against the approved cap of **0.3045 BNB**, leaving **0.0004020148 BNB** available for further reservations; unused gas reservations were not released. Creator's 0.003 BNB proceeds do not offset cumulative principal.

After purchase, transactions 6–8 were each separately approved: `harvest()` fixed the accounting checkpoint, then creator/B called `claimBatch([1…67])` and `claimBatch([68…100])` respectively. The actual distribution was verified, as detailed later. A same-checkpoint 67:33 comparison requires both claims to have `RewardsSynced.received=0` and unchanged `accPerShare`; when all initial claimed values are 0, amounts due should be the per-ID entitlement multiplied by 67/33. At purchase completion, entitlement transfer, consolidation/redemption, and failure refunds had not run. Transactions 9–11 later completed entitlement-transfer verification; consolidation/redemption and failure refunds remain unexecuted.

## Live Mainnet Read-Only Permission and BEM Snapshot After Purchase

The purchase result also passed an [independent audit of saved evidence](../../../mainnet-completion/independent-evidence-audit.json): the plan, complete raw receipt events, 100-share ownership, nine actual gas fees, and nine budget reservations matched the report. This audit is local cross-verification, not a new RPC observation.

Actual RPC observations used [active-pool.mjs](../../../mainnet-observe/active-pool.mjs), which supports only read-only methods against fixed public nodes and has no `.env`, private keys, or broadcast entry point. Its **32/32 new offline tests passed**. Commands used:

```bash
cd /Users/jaychen/Desktop/pin/groupbuy-v1
node --import tsx --test mainnet-observe/*.test.mjs
node --import tsx mainnet-observe/active-pool.mjs
```

Actual result: [full read-only record](../../../mainnet-observe/observations/active-pool-1792424534771.json), [summary](../../../mainnet-observe/validation.json), **PASS**. Snapshot block **128580017**, hash `0x39ede1bcd01320886a7636d586e1116042bef307f5103577ee918c7f492eef25`; **465 confirmations** were observed when reverifying the purchase receipt. Both chain identities, the fixed checkpoint, current clone/configuration/dependency code, and raw purchase receipt events matched. All state reads and negative simulations were pinned to the same block, and its hash was rechecked at the end. Transactions sent: **0**.

| Negative read-only call | Cases | Actual result |
| --- | ---: | --- |
| B claims creator's ID1; creator claims B's ID68 | 2 | Both NotHolder, PASS |
| creator claimBatch with empty array, duplicate ID, ID0, ID101 | 4 | All InvalidIds, PASS |
| creator and B each directly redeem the miner | 2 | Both NotHolder, PASS; neither individually held all 100 shares |
| creator withdraw([1],self) and markRefundable() while ACTIVE | 2 | Both InvalidState, PASS |

All **10/10 mainnet read-only simulations passed**. A pass requires the actual contract error decoded by viem to match the expected name exactly. Network errors, undecodable responses, and unexpected success all fail. These were not actual sent-and-failed transactions and consumed no gas.

| BEM and ownership snapshot | Observed value |
| --- | --- |
| Miner / state / shares | #3204 in Vault, ACTIVE, all 100 shares still creator67/B33, each supply=1 |
| BEM decimals | 8 |
| Mining pending | **13,653,220 raw = 0.13653220 BEM**, observation only, no guarantee of the next actual inflow |
| Vault BEM | **0 raw** |
| totalAccounted / totalPaid / accPerShare / remainder | All 0 |
| claimed / claimable | All 100 IDs were 0 |
| Creator's existing BEM wallet balance | 103,905 raw = 0.00103905 BEM |
| A's existing BEM wallet balance | 369,220 raw = 0.00369220 BEM |
| B's existing BEM wallet balance | 437,579 raw = 0.00437579 BEM |

Those wallet BEM values are snapshots of existing balances, not proceeds from this purchase or claim. Mining's pending rewards had not been accounted for at that initial snapshot. Transactions 6–8 subsequently reconciled actual BEM inflow, RewardsSynced, Harvested, each ID's RewardClaimed, and the corresponding Transfer. Only subscription/purchase and read-only permission checks were complete at the initial snapshot; claims and transfer of a positive entitlement had not yet run. Transactions 6–8 later completed rewards distribution, and transactions 9–11 completed entitlement-transfer verification. Redemption remains unexecuted.

## Same-Batch BEM 67/33 Rewards Test: Transactions 6–8 PASS on the Live Chain (Historical Ending State)

The user requested harvest→creator→B, with separate confirmation before every signature. All three transactions were individually approved and confirmed on mainnet with at least 15 block confirmations each. The full [rewards test report](../mainnet-rewards/BEM_REWARDS_TEST_REPORT.md), [validation summary](../../../mainnet-rewards/validation.json), [three-step script](../../../mainnet-rewards/rewards.mjs), and [final offline reconciliation](../../../mainnet-rewards/audit/final-reconciliation.json) were saved.

| Step | Mainnet transaction | Actual BEM | Actual gas, BNB |
| --- | --- | ---: | ---: |
| Transaction 6 harvest | [b3af0c8a…f5a03ea](https://bscscan.com/tx/0xb3af0c8a9cc570826a4782fd3b09f9d306fdd5d7dd89c7b10c0985899f5a03ea) | Received 0.13665485 | 0.00001102315 |
| Transaction 7 creator claims 67 shares | [5a7426b0…c9767bd](https://bscscan.com/tx/0x5a7426b05a54f8bfbf6a9012a5094110689dde36910048f63736d9db0c9767bd) | Actually received 0.09155818 | 0.0001044409 |
| Transaction 8 B claims 33 shares | [09bad685…9785105](https://bscscan.com/tx/0x09bad685e01819a520fa4120c5c6023c12768a6171846df73862614939785105) | Actually received 0.04509582 | 0.0000527602 |

Raw integers: H=13,665,485, per-share q=136,654, remainder r=85. Neither claimBatch harvested again; both RewardsSynced.received values were 0 and H/q/r stayed unchanged. Each of creator's 67 and B's 33 RewardClaimed events paid q per ID; each unique BEM Transfer matched the total payment. Creator's receipt×33 and B's receipt×67 both equal 302,141,994. The two receipts plus Vault remainder, 9,155,818+4,509,582+85, equal the harvested inflow of 13,665,485: **same-batch rewards were correctly distributed 67/33**.

Final receipt block **128585699**, hash `0xf74d7978513b1afc5ae06fbd24d5e93e9746e588282b8a92b4d554e3e2e10586`: all 100 IDs had claimed=136,654 and claimable=0; holder/supply and 67/33 ownership were unchanged; the Vault held miner #3204 and remained ACTIVE. totalAccounted=13,665,485, totalPaid=13,665,400, accPerShare=136,654, remainder=85, Vault BEM=0.00000085. Rewards subsequently generated by Mining but not harvested are outside this round.

Actual gas for the three rewards transactions totaled **0.00016822425 BNB**. Actual gas for four deployments plus eight test transactions totaled **0.0010715065 BNB**, with total subscription principal 0.303 BNB. Safe outer fees remain separate. All 12 reservations were retained at the end of transaction 8: the maximum reservation at that time was **0.3043039911 BNB**, below the approved cap of **0.3045 BNB**, leaving **0.0001960089 BNB** of reservation capacity at that time.

Sender and observer regression: **693/693 PASS**; additional final reconciliation tests: **6/6 PASS**. The final reconciliation CLI actually ran with **PASS, exit0**. Its scope is cross-verification of saved local evidence, with no new RPC observation or real transaction. The protected sender verified the three actual canonical confirmations and receipt-block business states; independent audits then checked the saved data.

At the end of transaction 8, transfer of positive unclaimed entitlement, share consolidation/redemption, and failure refunds had not run. Transactions 9–11 subsequently completed the entitlement-transfer test after separate approvals. No other transaction was sent without individual approval.

## Unclaimed-Entitlement Transfer Test: Transactions 9–11 All PASS on the Live Chain

Transaction 9, [0605e956…6778a0c](https://bscscan.com/tx/0x0605e95651b4ffe0f5f7dba453e627fad99abb4bc15166b21dd86bd996778a0c), was separately approved by the user and succeeded at mainnet block 128589337 with at least 15 confirmations; the full journal records CONFIRMED / positiveTest PASS. Actual new inflow was 32,254 raw BEM; combined with the previous 85 raw remainder, it created 323 raw of unclaimed entitlement per share, with a new remainder of 39 raw: `32254+85=100×323+39`. After transaction 9, all 100 shares retained claimed=136,654 and had claimable=323. #1 still belonged to creator at that time, creator/B holdings were 67/33, Vault BEM=32,339 raw, and the ACTIVE Vault held the miner. Transfer and claim outcomes follow below.

Actual gas for transactions 9–11 was **0.00000760315 / 0.00000344225 / 0.0000040223 BNB** respectively, totaling **0.0000150677 BNB** for this round. Actual cumulative gas for four deployments plus eleven test transactions was **0.0010865742 BNB**; Safe outer fees remain separate. The 15 cumulative maximum reservations total **0.3043235844 BNB**, below the original approved cap of **0.3045 BNB**, leaving **0.0001764156 BNB** available for reservation. The 21 new tests, combined regression 714/714, and 9/9 new complete offline reconciliation tests all passed. Raw events from all three transactions, all 100 rewards records, and budget accounting passed independent audit. The offline reconciliation command for transactions 6–8 fixes the historical 12 reservations and is not intended for this round's ending state with 15 reservations.

Transaction 10, [28dee167…5066df7](https://bscscan.com/tx/0x28dee1670e0d52d10cd7532fef95bc1274b627484e3f108154a36f6ee5066df7), was successfully confirmed at block 128590538. Its raw receipt contained only the exact TransferSingle; it neither synchronized rewards nor paid BEM. #1 now belonged to B, claimed remained 136654, claimable remained 323, and creator/B holdings became 66/34. The frozen sender strictly verified at the receipt block that creator's claim(1) returned NotHolder. An additional independent read-only observation at fixed block 128590706 captured the raw error `0x7623fb52`, precisely decoded using the compiled ABI as NotHolder(); no paid failing transaction was sent. Raw evidence and an independent audit were saved.

Transaction 11, [e93ae962…ecb4531](https://bscscan.com/tx/0xe93ae9625ef450311dc4565807bdd427de09970969ced30eb4660e5d7ecb4531), was separately approved and successfully confirmed at block 128591816. B called the Vault's `claim(1)` with nonce6 and actually received the **323 raw = 0.00000323 BEM** accumulated before transfer. Raw events exactly match RewardsSynced.received=0, RewardClaimed(B,1,323), and the unique BEM Transfer(Vault,B,323), with no new harvest. Only #1's claimed rose to 136977 and its claimable became zero; all other 99 shares retained claimed=136654/claimable=323. Vault balance=32016 raw, totalPaid13665723, totalAccounted13697739, accPerShare136977, remainder39. Conservation holds: `323+32016=32254+85` and `32016=99×323+39`. The actual payment did not repay the historical 136654 raw already claimed.

The final complete offline reconciliation actually ran with **PASS / exit0**: [final-reconciliation.json](../../../mainnet-entitlement-transfer/audit/final-reconciliation.json). It independently decodes saved raw receipts/error bytes, every plan's historical prefix, and all 100 share states. It makes no new RPC calls and reads no private keys; freshChainConfirmation/freshNotHolderSimulation are both marked NOT_RUN. The frozen sender verified at least 15 actual confirmations and the corresponding receipt-block states; the raw NotHolder evidence also has an independent live capture. Historical gas uses an immutable baseline snapshot, and an additional raw copy of the ending budget was saved. Current creator/B holdings are 66/34. Creator's other 66 shares and B's original 33 shares retain a total of 31977 raw of this batch's unclaimed entitlement; 39 raw is remainder. Full report: [entitlement-transfer test report](../mainnet-entitlement-transfer/BEM_ENTITLEMENT_TRANSFER_REPORT.md).
