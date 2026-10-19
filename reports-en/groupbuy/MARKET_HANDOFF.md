# GroupBuy V1 Handoff to the Market Window

This repository is a phase one candidate implementation. The local fork of real BSC state at fixed block `128554249` passed an order lifecycle on deployed Seaport 1.6 bytecode; the order was created and validated only inside the fork, with signature `0x`. See the [actual fork report](../../reports/real-bsc-fork-tests.json) and [protocol identity verification](docs/REAL_PROTOCOL_IDENTITY_REVIEW.md). **Existing public market orders, mainnet deployment/transactions and market UI integration remain NOT_RUN**; full Mining/BEM semantics remain Unknown. Local Mock, local Seaport source tests and the real-state fork are recorded separately; structural validation must not be treated as a successful trade. This window did not read the market repository, database or credentials and did not call real listing, cancellation, signing, mainnet broadcasting or other market write interfaces.

## Handoff files and stable identifiers

- `schemas/order-envelope-v1.schema.json`: strict OrderEnvelope v1 JSON Schema; unknown fields are rejected.
- `sdk/order-envelope.ts`: additional semantic validation, full order hash, domain, fulfillment payload commitment and integer ID-cost rules; passing JSON Schema alone is insufficient for execution.
- `sdk/order-source.ts`: JSON import within the current project and a user-explicitly configured localhost read-only API.
- `sdk/contracts.ts`: Config/Terms encoding and hashes matching the current `src/Types.sol`.
- `exports/`: actual compiled ABI and deployment interfaces; do not guess or handwrite an ABI.
- `fixtures/seaport-order.example.json`, `fixtures/official-order.example.json`: two secret-free **synthetic structural samples**. Their addresses and zero verification block do not represent real listings; signatures are empty and identities unknown, so they cannot trade.

Trusted identification uses chainId, market, collection, tokenId, orderHash/listingId, factory, vault, template/codehash, configHash and termsHash, not asset card names. Each ID represents 1%; fixed IDs 1–100 each have at most one token.

## Field contract

All wei, tokenId, listingId, counter, block numbers and timestamps are decimal strings; JSON floating-point amounts are forbidden. Addresses must be complete 20-byte addresses, and hashes 32 bytes. Quotes permit native BNB only, rejecting ERC20/WBNB.

| Field | Requirement |
| --- | --- |
| `schemaVersion` | String `1` |
| `source` | `kind` is json/http; `name` is a source label without URL/credentials; optional commit/configVersion |
| `sourceChainId` | 56; the fork signature domain remains 56 |
| `market/collection/tokenId/seller` | Full identity, matching the signed order/listing record |
| `buyerPaysWei` | Sum of all consideration, including existing market fees and excluding execution gas; at least 100 wei |
| `fees` | Fixed order: seller, market; recipient and amountWei for each item; net price alone is insufficient |
| `nativeStartTime/nativeEndTime` | Seaport must match signed parameters; the official market has no verified native expiry field yet, so both are null |
| `quoteExpiresAt` | Separate backend quote TTL or null; TTL cannot be treated as listing cancellation/expiry |
| `validation` | Fixed blockNumber/hash and verified/unknown; unknown must not be filled with zero to pretend verification |
| `identity` | market/collection codehash; proxy implementation, implementation codehash, evidence mechanism and whether enforced on-chain; use null and unknown for unknowns |
| `exportedAt` | ISO UTC time |

Seaport must also supply complete `parameters`, complete `components`, counter, signature, orderHash, and actual EIP-712 domain name/version/chainId/verifyingContract/domainSeparator. Parameters contain `totalOriginalConsiderationItems`; Components contain the counter at signing; all other fields must match. The domain and signature must not be reconstructed with a new counter or another chain/address.

The current Seaport subset permits FULL_OPEN, one specified non-criteria ERC721, amount=1, zero zone/zoneHash/conduitKey, and two fixed native consideration items: seller price and a market fee equal to 1% of that price rounded down. Both complete list items and the signature enter `executionHash=keccak256(abi.encode(Types.Order))`; appended tips or arbitrary to/data/value are forbidden. If actual market fees or parameters differ, return UnsupportedOrder and review jointly first; do not relax checks merely to pass.

Orders not prevalidated support ordinary EOA 65-byte or 64-byte EIP-2098 signatures and ERC1271; bound orders already validated by Seaport are also accepted. Bulk-order signature wrappers are not implemented and must not be presented as compatible; unvalidated bulk signatures should return unsupported.

The official sample supplies listingId, a listingView snapshot of seller/collection/tokenId/price/feeBps/valid, and a cross-check snapshot of listingFor's listingId/seller/price/valid. The formal `CIRCUIT_RESERVED` adapter is explicitly disabled: the current real implementation and exact ABI have not been verified, and Mock CircuitMarket success is not evidence of official compatibility. Imported official JSON can exchange fields and identify omissions, but creation/purchase still reject it.

The local tutorial also has `fixtures/mock-pool.example.json`, which is not an OrderEnvelope and must not be passed to the real-order interface. `create-pool --mock-terms` is available only with MODE=mock, loopback Anvil, Config.marketKind=2/mockOnly=true and a matching chainId; its payload is fixed at 0x. It is rejected in fork/live modes.

## Read-only exports for the market window to confirm or add

This repository **does not assert that the current market API already has these capabilities**. These are suggested interfaces, not existing routes:

| Suggested endpoint | Permitted action | Return |
| --- | --- | --- |
| GET `/groupbuy/order` | Read a specified public order | Complete Envelope, including public signature payload |
| POST `/groupbuy/quote` | Read-only quote/check, without signing, persistence or broadcast | The same Envelope and verified fields |

For GET, the market side can select a concrete test sample beforehand; the current SDK allows only an explicit path and does not automatically append arbitrary queries. POST request fields permit only orderHash/listingId/collection/tokenId/buyer. The configured allowlist must specify method/path/operation item by item. POST represents only an explicitly approved read operation and does not authorize write APIs; redirects, remote domains, authenticated URLs and unknown request fields are rejected. No ports are scanned when no API is configured.

The market window should read its own DB within its own directory and manually export JSON, or implement a local read-only service. Do not send PostgreSQL addresses/passwords; browsers do not need direct database access. A card's hash+price is insufficient for fulfillment; missing signature, counter, original consideration count or domain should be shown as precise missing fields.

## Buyer and joint simulation

The entity actually calling the market and receiving the NFT is **Vault**, not creator, the final participant, Factory or an external Adapter. An order must not lock the buyer to the final contributing wallet. An old buy-quote requiring the current Vault to already hold the full balance may reject before the final participant contributes. Separately verify the complete `contribute(ids,true,payload) → purchase → ownerOf(Vault)` path, including the last msg.value in simulation; a successful direct wallet buy cannot substitute.

Full funding, minting and purchase must succeed atomically in the same transaction. If someone fills the listing first, the last transaction reverts entirely and prior contributors can still withdraw directly. `requireCompletion=true` means the user accepts only completion of the group purchase in that transaction; if someone exits first and prevents full funding, it must revert entirely.

For fixed total payment P, each ID costs `P/100`, with the first `P%100` IDs costing 1 wei extra. Costs differ by at most 1 wei, while reward rights remain equal. Future gas is not included in the target payment, and no initial BEM or yield is promised.

## Copyable commands

```bash
npm ci
npm run build
npm run typecheck
npm run test:sdk
npm run cli -- import-order --order fixtures/seaport-order.example.json
npm run cli -- import-order --order fixtures/official-order.example.json
```

Both imports prove only structural readability and output `IMPORTED_STRUCTURE_ONLY`. Put a real sample in the current repository's `fixtures/`, then run:

```bash
npm run cli -- import-order --order fixtures/market-export.json --out fixtures/frozen-order.json
```

The output path will not overwrite an existing file. A complete signed public listing may let others fill first, so export only orders approved for public disclosure; do not automatically list a low-priced real miner for integration testing.

Explicit read-only HTTP configuration example (the market window must implement the endpoint):

```bash
export MARKET_API_BASE_URL=http://127.0.0.1:3100
export MARKET_API_READ_ALLOWLIST='[{"path":"/groupbuy/order","method":"GET","operation":"read-order"}]'
npm run cli -- import-order --http-path /groupbuy/order --out fixtures/frozen-api-order.json
```

Before `protocol-check`, start and verify the local fork under `FORK_TEST_RUNBOOK.md`. JSON verified markers do not replace trust checks: SDK rechecks market/collection codehash, Seaport information, counter/status, signature or validate, ownerOf and `getApproved`/`isApprovedForAll`. The full contribution transaction still requires simulateContract. API deletion, no response or loss of approval do not automatically mean permanent cancellation.

## Acceptance between the two windows

1. Both sides retain the same JSON file hash and schemaVersion, checking amounts, signature domain and buyer semantics field by field.
2. Supply complete samples separately for Seaport and the official market. An unknown official implementation remains blocked and cannot share another market's conclusions.
3. This repository passed a local Factory proxy→clone lifecycle using a fork-created signature-free order; the market window must still accept creation, 45/55 participation, withdrawal, ID reuse, failed/successful full funding, claims, transfer with accrued rights and redemption on a fixed-block fork using its exported existing order, without reusing a different order's result.
4. Cancellation, repricing, approval revocation and other variations run only on an isolated test chain or local fork; production databases must not be changed to manufacture on-chain facts.
5. Even though the local fork has chainId 56, RPC is still localhost Anvil; these events must not enter production indexes.
6. Preserve receipts, block snapshots, actual BEM Transfer and raw integer balances separately. SDK read-only simulation, submitted receipts and UI verification use distinct statuses rather than mixing PASS results.

Reference definitions: [Seaport Models](https://docs.opensea.io/docs/seaport-models), [Seaport Interface](https://docs.opensea.io/docs/seaport-interface). Supported interfaces are determined by this repository's fixed Types and tests.
