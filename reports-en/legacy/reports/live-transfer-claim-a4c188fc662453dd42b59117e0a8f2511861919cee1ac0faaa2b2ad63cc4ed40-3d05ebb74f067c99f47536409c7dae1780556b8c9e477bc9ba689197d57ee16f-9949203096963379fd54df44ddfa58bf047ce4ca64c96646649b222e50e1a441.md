# ERC-1155 ID 1 Transfer and Reward Claim Test Report

Status: **VERIFIED_TRANSFER_AND_EQUAL_CUMULATIVE**. BSC chain 56; BEM decimals: 8. This report counts only BEM paid by this Vault; total wallet balances and BNB gas are not reward income.

- Vault: `0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B`; custodied miner ID 3204.
- A (original ID 1 holder): `0x1b55E6A757987576E1a130A011f9E12498De7DB9`.
- owner (ID 1 recipient): `0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129`; B (ID 2): `0x63979C9d5200A5080be93eb440D469d2F2ec6682`.
- Fixed baseline: block 125646568, hash `0x3f107ac054e3424f1b63a698555815b94b0e2a01ace0209fb210712432212d7a`, 2026/10/4 16:45:18 (Asia/Shanghai).

## Objectives and actual coverage

| Verification objective | Result | Evidence scope |
| --- | --- | --- |
| New holder can claim after receiving ID 1 | VERIFIED_ON_LIVE | owner's actual successful claim receipt, BEM payment, and ERC-1155 balance |
| Original holder A cannot claim ID 1 after transfer | VERIFIED_BY_PINNED_ETH_CALL | Post-transfer fixed-block eth_call returns Unauthorized; no failing transaction sent |
| New holder inherits unharvested Mining rewards from before transfer | VERIFIED_ON_LIVE | Pre-transfer pending 0.00206523 BEM; transfer preserves the ledger; owner subsequently harvests and claims |
| Positive received-but-unclaimed Vault balance for ID 1 follows the share | NOT_EXERCISED_ON_LIVE | ID 1 claimable before transfer was 0 BEM |

ID 1's Vault claimable amount was 0 before this transfer, so these mainnet transactions did not cover transfer of a positive received-but-unclaimed Vault balance. Unharvested Mining rewards and accounted but unclaimed Vault balances are recorded separately; results for the former cannot be presented as a mainnet test of the latter.

A separate isolated Mock verification (2/2 passed) covered received-but-unclaimed entitlement following the ID and the claimed ledger remaining intact. See `reports/live-transfer-claim-local-validation.json`. This is local verification, not a substitute for the unexercised mainnet scenario above.

## Actual claims and cumulative reconciliation (BEM)

| Address / share | Share's claimed ledger before round | Actual payment this round | Wallet's Vault receipts since creation |
| --- | ---: | ---: | ---: |
| A (original ID 1) | 0.00277636 | 0 | 0.00277636 |
| owner (new ID 1) | Inherits ID 1 ledger without reset | 0.00103905 | 0.00103905 |
| B (ID 2) | 0.00277636 | 0.00103905 | 0.00381541 |

Actual payments for ID 1 since creation = A's historical receipts + owner's receipts = **0.00381541 BEM**. Cumulative actual payments for ID 2 to B = **0.00381541 BEM**. This compares the full history of both shares; owner's wallet alone need not equal B's cumulative receipts.

Cumulative ID 1 − ID 2: **0 BEM**. Payment difference between owner and B this round: 0 BEM. Final claimed ledgers for IDs 1/2: 0.00381541 / 0.00381541; still claimable: 0 / 0; equal-allocation dust: 0.00000001 BEM.

## Fixed-block observations

| Observation | Block | Mining pending | Cumulative accounted receipts | Cumulative entitlement per share | Vault balance | owner wallet BEM balance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Pre-round baseline | 125646568 | 0.00015077 | 0.00555273 | 0.00277636 | 0.00000001 | 0 |
| End of block before transfer | 125686385 | 0.00206523 | 0.00555273 | 0.00277636 | 0.00000001 | 0 |
| End of transfer's block | 125686386 | 0.00206523 | 0.00555273 | 0.00277636 | 0.00000001 | 0 |
| End of block before owner claim | 125686476 | 0.00206523 | 0.00555273 | 0.00277636 | 0.00000001 | 0 |
| End of owner claim's block | 125686477 | 0 | 0.00763083 | 0.00381541 | 0.00103906 | 0.00103905 |
| End of block before B claim | 125686605 | 0.00000278 | 0.00763083 | 0.00381541 | 0.00103906 | 0.00103905 |
| End of B claim's block | 125686606 | 0.00000278 | 0.00763083 | 0.00381541 | 0.00000001 | 0.00103905 |

| Observation | Block | ID 1 cumulative claimed | ID 1 received and claimable |
| --- | ---: | ---: | ---: |
| Pre-round baseline | 125646568 | 0.00277636 | 0 |
| End of block before transfer | 125686385 | 0.00277636 | 0 |
| End of transfer's block | 125686386 | 0.00277636 | 0 |
| End of block before owner claim | 125686476 | 0.00277636 | 0 |
| End of owner claim's block | 125686477 | 0.00381541 | 0 |
| End of block before B claim | 125686605 | 0.00381541 | 0 |
| End of B claim's block | 125686606 | 0.00381541 | 0 |

BEM transferred into the Vault within owner's claim: **0.0020781 BEM**; amount accounted by Harvested: 0.0020781 BEM. Inflow within B's ordinary claim: 0 BEM.

Pending in the previous block is a fixed-block observation, not an exact value at execution. Actual receipts use BEM Transfer events; Harvested may include earlier unsynchronized direct transfers. New Mining pending awaits a later harvest and does not automatically change this round's Vault allocation cutoff.

## Transfer and claim authority

- Transfer receipt checks: `{"oneExactShareTransfer":true,"noBatchTransfer":true,"noAccountingEvents":true,"noVaultBEMPaymentDuringTransfer":true}`.
- Intended operations: transfer one unit of ID 1 from A → owner, then owner claims ID 1 and B ordinarily claims ID 2. Compliance is determined by the individual checks.
- claimed(1/2) at the end of the transfer block: 0.00277636 / 0.00277636 BEM.
- owner's claim occurred in a later block; continuity checks of claimed/totalPaid between the transfer block end and baseline passed.
- owner was not a share holder before transfer. Being owner alone does not confer the right to claim ID 1.
- Baseline ERC-1155 balances (A's ID 1 / owner's ID 1 / B's ID 2): 1 / 0 / 1. Final balances: 0 / 1 / 1.
- Auxiliary authority simulation evidence: `reports/live-transfer-claim-authority.json` (read-only eth_call, not actual failed transactions).
- owner lacked ID 1 claim authority at baseline: verified at block 125646568; claimBatch([1]) returned Unauthorized.
- A lost ID 1 claim authority after transfer: verified at block 125686386; claimBatch([1]) returned Unauthorized.

```json
{
  "beforeTransfer": {
    "chainId": 56,
    "vault": "0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B",
    "blockNumber": "125646568",
    "blockHash": "0x3f107ac054e3424f1b63a698555815b94b0e2a01ace0209fb210712432212d7a",
    "actor": "0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129",
    "holder1": "0x1b55E6A757987576E1a130A011f9E12498De7DB9",
    "holder2": "0x63979C9d5200A5080be93eb440D469d2F2ec6682",
    "functionName": "claimBatch",
    "ids": [
      "1"
    ],
    "status": "REVERTED",
    "errorName": "Unauthorized",
    "note": "Pinned-block eth_call simulation only; no transaction submitted."
  },
  "afterTransfer": {
    "chainId": 56,
    "vault": "0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B",
    "blockNumber": "125686386",
    "blockHash": "0xedf1d320d0a6d3c06058776571c4aa8eabce89bea64d7b3faedc31044d03f710",
    "actor": "0x1b55E6A757987576E1a130A011f9E12498De7DB9",
    "holder1": "0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129",
    "holder2": "0x63979C9d5200A5080be93eb440D469d2F2ec6682",
    "functionName": "claimBatch",
    "ids": [
      "1"
    ],
    "status": "REVERTED",
    "errorName": "Unauthorized",
    "note": "Pinned-block eth_call simulation only; no transaction submitted."
  }
}
```

Transfer rehearsal evidence (read-only simulation, not an actual transfer): `reports/live-transfer-claim-simulation.json`.

```json
{
  "status": "DRY_RUN_SUCCEEDED_NO_TRANSACTION_SENT",
  "mode": "live",
  "chainId": 56,
  "vault": "0x4D42634488E9E9C30D1AbAFd4C5f47b29502E35B",
  "sender": "0x1b55E6A757987576E1a130A011f9E12498De7DB9",
  "recipient": "0x7eEDccb674e9549b61B01Eb65aC68DA071ADF129",
  "shareId": "1",
  "shareAmount": "1",
  "operation": "transfer",
  "preflightReportedBlock": "125646185",
  "pendingObserved": "12621",
  "vaultBemBalanceObserved": "1",
  "gasWithBuffer": "90536",
  "gasPrice": "50000000",
  "maximumFeeBNB": "0.0000045268",
  "calldataHash": "0x0c2e5dc6aab6ce7bd09f20997ded75bc507f45f6cf0f21982087465bb3da4018",
  "note": "CLI preflight reads and simulation used their respective latest states, not one pinned block. This is a transfer simulation only; subsequent owner/B claims have not been executed."
}
```

## Transactions and verification

- [A transfers ID 1](https://bscscan.com/tx/0xa4c188fc662453dd42b59117e0a8f2511861919cee1ac0faaa2b2ad63cc4ed40): block 125686386, index 62, gas 0.0000032526 BNB.
- [owner harvests and claims](https://bscscan.com/tx/0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f): block 125686477, index 39, gas 0.0000090222 BNB.
- [B ordinary claim](https://bscscan.com/tx/0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441): block 125686606, index 38, gas 0.0000034326 BNB.
- Historical scan: deployment block 125537081 through 125686606, reconciling Vault RewardClaimed and BEM Transfer(from=Vault) per transaction and recipient.
- Verification passed: owner can claim ID 1 after transfer; historical payments for ID 1 to A plus owner equal historical payments for ID 2 to B; ID 1's prior claimed amount was not reset.
- Checks: `{"ownerAndBClaimsMatch":true,"transferExactCall":true,"transferReceiptMatches":true,"threeDistinctTransactions":true,"transferAfterBaseline":true,"transferBeforeOwnerClaim":true,"ownerBeforeBClaim":true,"oneExactShareTransfer":true,"noBatchTransfer":true,"noAccountingEvents":true,"noVaultBEMPaymentDuringTransfer":true,"aReceiptVerified":true,"bReceiptVerified":true,"sameReceiptCutoff":true,"ownerUnauthorizedBeforeTransfer":true,"aUnauthorizedAfterTransfer":true,"transferERC1155BalancesMatch":true,"finalERC1155BalancesMatch":true,"sameSnapshotCutoff":true,"cumulativeShareClaimsEqual":true,"bothSharesSettled":true,"holdersMatch":true,"minerStillActive":true,"paidMatchesClaims":true,"receivedConserved":true,"onlyDustRemains":true,"historyValid":true,"id1HistoryMatchesLedger":true,"id2HistoryMatchesLedger":true,"aPlusOwnerPaymentsMatchId1":true,"bPaymentsMatchId2":true,"allClaimsMatchTotalPaid":true,"allTransfersMatchTotalPaid":true,"cumulativeSharePaymentsEqual":true,"id1ClaimedNotReset":true,"id2ClaimedContinuous":true,"noAPaymentThisRound":true,"onlyExpectedOwnerRoundPayment":true,"onlyExpectedBRoundPayment":true,"transferredHolderAtBlockEnd":true,"transferBlockLedgerCompatible":true}`.

## Payments since deployment

| Block | Recipient | BEM | Transaction |
| --- | --- | ---: | --- |
| 125545984 | A (original ID 1 holder) | 0.00042458 | [0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a](https://bscscan.com/tx/0x4da3cb2bce785ebcd3932742547f73e30d44a1a528f955c2a5df29b81398d86a) |
| 125643420 | A (original ID 1 holder) | 0.00235178 | [0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690](https://bscscan.com/tx/0x6d79acb0affb05f9a53ef26a1aea65eff1994d9f16f044f506f167a8ec621690) |
| 125643527 | B (ID 2) | 0.00277636 | [0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18](https://bscscan.com/tx/0xfd0e1cd74228dab384058eb91bed450b18e6f5a23427a8d1d772901cd6495a18) |
| 125686477 | owner (new ID 1 holder) | 0.00103905 | [0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f](https://bscscan.com/tx/0x3d05ebb74f067c99f47536409c7dae1780556b8c9e477bc9ba689197d57ee16f) |
| 125686606 | B (ID 2) | 0.00103905 | [0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441](https://bscscan.com/tx/0x9949203096963379fd54df44ddfa58bf047ce4ca64c96646649b222e50e1a441) |

## Comparison boundaries

The three transactions are ordered by block and transactionIndex; simultaneous submission is unnecessary. A common receipt cutoff is checked using the last RewardsSynced in owner's and B's receipts together with fixed-block ledgers. If another actual BEM inflow occurs in between and B synchronizes it, the report requires review. Mere Mining pending growth does not change this round's cutoff.

The ERC-1155 transfer conveys ID 1's claim authority and unclaimed entitlement. Amounts already claimed by A remain counted against ID 1 and cannot be claimed again. Final requirements are: miner still owned by Vault, state Active, ID 1 owned by owner, ID 2 owned by B, and only 0 or 1 minimum BEM units remaining after both shares settle. BEM event reconciliation assumes ordinary untaxed ERC-20 semantics. The original A-only and A/B comparison reports are retained.
