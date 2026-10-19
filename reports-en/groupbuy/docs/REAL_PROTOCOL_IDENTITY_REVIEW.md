# Read-Only Identity Verification of Real BSC Protocols

This report completes protocol identity verification at a fixed block. A verified-source record was obtained for Seaport and matched against the on-chain runtime hash at that block; full source semantics for Mining and BEM still include Unknowns. This is not a complete security audit and does not establish mainnet deployment or passage of a full fork lifecycle.

**Fixed and retested:** An independent fork diagnostic confirmed that Mining.claim may still produce a positive actual receipt when `pending=0`. Vault removed the condition that skipped claim on that basis. After the fix, the main runner passed 23 scenarios and 25 fork transactions; the second harvest verified positive new actual receipts and a ledger increment. Amounts and receipts below come from the final post-fix report.

- Network: BSC, chainId `56`.
- Fixed block: `128554249`.
- Block hash: `0xe44fafd52f2b1da68b810514554c21061d327cccb046b6c8afdfb315a1ef991d`.
- Upstream reads passed through this project's local read-only proxy; upstream RPC credentials were not read, private keys were not used and no transactions were sent.
- Structured result: [real-protocol-identity-review.json](../../../reports/real-protocol-identity-review.json). Baseline state evidence: [authorized-source-observation.json](../../../reports/authorized-source-observation.json).

## Addresses and code identity

| Object | Address | Runtime bytes | Observation at the block |
| --- | --- | ---: | --- |
| Seaport | `0x0000000000000068F116a894984e2DB1123eB395` | 23981 | `information()` returns version `1.6`; verified-source record identifies it as non-proxy |
| Miner NFT | `0xb1024b89886B9a34Aa4ff5F31C411D708b20a14C` | 295 | Beacon proxy |
| Mining | `0x7E2E0DC66a3bD9103E69b766afA62d9f7b697b46` | 130 | Proxy reading its implementation from the ERC-1967 implementation slot; not an ERC-1167 clone |
| BEM | `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a` | 2205 | `decimals() = 8`, `minter() = Mining` |

The Collection, Mining and BEM addresses match [TapeOut's official mainnet configuration](https://tapeout.net/pod/pod-mainnet.json). Official configuration establishes address provenance only; contract behavior requires separate verification.

The four addresses' runtime keccak256 hashes are:

```text
Seaport   0x16bd146d392a011a996f447b813623d4857ba2d7621af38194a009cbc03ab5f4
Collection 0xd8c4b0216e0aadd615fbd134465b6af060a11769edc7c844d8f14d1b8a783992
Mining    0xed6b710a769987f50494d713f278817992e3266e45898a990be878efc2fcbbce
BEM       0x982ba79538b51e54ee1382f57522098af0635b0f67f2574d393b29ed0958b344
```

## Seaport: verified-source record matched to runtime identity

The [official OpenSea deployment table](https://github.com/ProjectOpenSea/seaport/blob/main/docs/Deployment.md) lists this address as Seaport 1.6. `information()` at the fixed block also returns `1.6`; ConduitController is `0x00000000F9490004C11Cef243f5400493c00Ad63`.

The [Sourcify chain 56 verification record](https://sourcify.dev/server/v2/contract/56/0x0000000000000068F116a894984e2DB1123eB395?fields=all) returns `runtimeMatch = match`, `creationMatch = match` and `proxyResolution.isProxy = false`. The compilation target is `src/Seaport.sol:Seaport`, with compiler `0.8.24+commit.e11b9ed9`. Its `onchainBytecode` hash exactly matches the hash read through RPC at this report's fixed block.

Sourcify compilation output includes immutable-transformation information; the raw hash of unprocessed `recompiledBytecode` differs from the on-chain hash. This report relies on its verification result cross-checked with on-chain code, does not claim the two raw bytecodes are directly identical, and did not repeat an independent compilation audit.

## Miner NFT and Mining: proxy implementations resolved

The miner NFT runtime queries `implementation()` on a Beacon and delegates execution. The Beacon at this block is `0xf8d6d8eb894d6971c8976ad8b4971cbefe028156`, whose `implementation()` returns `0x8E1D125Def6d3826C278299273a0760D47626068`. The implementation runtime is 12560 bytes, hash `0x2ea433839e23b3773b7880d6f1807affb0f648ae98760b9a3b6394879665c345`. Complete analysis of Beacon upgrade permissions is **Unknown**.

Mining runtime loads `0xa3dbe873da37cd4e4a13c7cef23a7db6ca60f898` from the ERC-1967 implementation slot and delegates execution. The implementation runtime is 24574 bytes, hash `0x63b1124d3448fdeb28b163c52142e15a7a464d7ae7d817e51f6c242b62424479`. Reads at the proxy address returned `owner() = address(0)`, `isSealed() = true`, `paused() = false`; these are state observations at that block and cannot alone prove the absence of all upgrade or privileged paths.

The [official TapeOut application release file](https://tapeout.net/pod/assets/main-C1q9aWV9.js) includes ABI entries for `minerKey(address,uint256)`, `getMiner(bytes32)`, `pending(bytes32)`, `claim(bytes32)` and `claimMany(bytes32[])`. For configured miner `#3204`, `minerKey()` actually returns `0xb0e5b7d325dead6144886258056fb8e27ff5f6192aaa90fd0b45682c297c1c0d`; `pending()` returns raw integer `13532613`. Using the 8 decimals actually read, this is `0.13532613 BEM`; it is a fixed-block snapshot and does not guarantee the same receipt amount in a subsequent harvest.

Mining permissions for arbitrary callers, recipients on every `claim` path, and the complete accrual/settlement rules of pending remain **Unknown**. The official application ABI proves the call interface only; the corresponding implementation source was not obtained this round, so interface names cannot replace behavioral proof. Completed fork claims, Vault receipts and wallet transfers below are independent evidence for those paths and cannot be extended to every state or entry point.

The independent [Mining settlement diagnostic](../../../reports/real-mining-settlement-f2b486c2-14e2-4034-a43a-e80c61b40974-1792413996165.json) used a fresh fork of the same fixed source block. Miner-holding address A first called Mining.claim once, then test time advanced 3600 seconds. Pending before the second call was `0`; afterward A's BEM balance rose from `13902271` to `13939872`, an actual receipt of `37601` raw. The local receipt is `0x0c08fd994c6ad53949f04bacf5f5d8c24321b9dce39590f17f919faf99c9066f`, fork block `128554252`, status success. An additional claim in the same block as the first claim was simulated only by eth_call, returning SUCCESS with no transaction sent. After capturing evidence, the two diagnostic transactions were removed by snapshot restoration, cleanup PASS; they must not be treated as receipts remaining on the local canonical chain after restoration.

This counterexample proves that zero pending does not mean claim cannot settle rewards; without source, it does not establish the entire internal storage or accrual mechanism. The old `_harvest` zero-pending skip condition was removed: it now always calls the fixed Mining.claim, then syncs actual receipts, with real errors still propagated. The corrected Vault regression confirmed another harvest at pending=0 received `37601` raw new funds and increased totalAccounted by the same amount. The old test's reliance on a positive balance alone was also replaced by a new-receipt check; old dust cannot satisfy a new-reward assertion.

## BEM: decimals and minter read, full transfer semantics unproven

At this block, `decimals() = 8` and `minter()` is Mining. BEM's standard ERC-1967 implementation, admin and beacon slots are all zero; zero slots alone cannot exclude custom proxy mechanisms. Source-level conclusions about fee-free transfers on all paths, no rebase and no other privileged balance changes all remain **Unknown** this round.

A particular fork case showing matching Vault receipts, account balance deltas and transfer events establishes only that transfer path's behavior. Reports must continue recording raw integers and actual receipt deltas; one transfer without a discrepancy cannot be generalized into a token-wide audit conclusion.

## Unobtained sources and boundaries

The attempted BscScan pages returned HTTP 403 verification pages; Sourcify queries for the Mining proxy, Mining implementation and BEM returned HTTP 404 / `match:null`. This means the attempted retrieval did not obtain sources, not that sources exist nowhere or that the contract is necessarily unverified.

The Mining implementation IPFS CID extracted from actual runtime compilation metadata is `QmQ5utAzxYyU5yXN7QqkFn3pjAatiJB1Yi5CZwMmHchUuq`; BEM's CID is `QmRVuR4snZHCRcTNSts1ky6K6JkCBHaR3SqzN5VHS9ACqA`. Both `ipfs.io` and `dweb.link` gateways returned HTTP 429 / gateway-migration notices, and no metadata body was obtained. Therefore, this report does not treat third-party descriptions such as “anyone can claim,” “no tax,” or “no upgrade” as verified facts.

This report's read-only identity research sent **0** transactions. Local fork lifecycle, mainnet transactions and cross-machine LAN connectivity are different evidence categories; identity verification does not replace their test receipts.

## Completed local fork path evidence after the fix

The independent [real-bsc-fork-tests.json](../../../reports/real-bsc-fork-tests.json) records **23 scenarios PASS and 25 local fork transactions**, using the same upstream block as this report. Mainnet transactions and upstream RPC writes were both 0. The order was created only inside the fork through NFT approval and Seaport `validate`, with public signature `0x`; the full import path for an existing public market signed order was not verified. Real NFT, Mining and BEM code/storage were not modified. The 2 independent diagnostic transactions above were snapshot-restored and are not mixed into the main runner's 25.

Amounts and receipts in this section come from the final post-fix report, completed at `2026-10-19T12:47:20.106Z`, order hash `0x157965afaffa5c5949ab133f9da4054d7607201aad675c29b81fc0f6370c3f2a`. The fixed source block and identity-verification conclusions are unchanged.

| Specific path | Observation (raw BEM integers) | Supported conclusion |
| --- | ---: | --- |
| First harvest after Vault purchases the miner | Vault actually receives `13533093`, per-share credit `135330`, remainder `93` | With this miner and state, Vault can receive positive BEM from Mining and allocate actual receipts |
| A claims 44 IDs, leaving ID 1 unclaimed | A gains `5954520`, B gains `0` | This batch claim did not pay rights belonging to other IDs |
| B claims its original 55 IDs | B gains `7443150`, ID 1's unclaimed rights remain `135330` | Accounted but unclaimed rights for ID 1 still exist |
| Unclaimed ID 1 transfers from A to B | Old-holder claim simulation reports `NotHolder`; B actually receives `135330` | These positive unclaimed rights follow the ID and can be claimed by the new holder |
| Another harvest after the first claims | Before call pending=`0`; new actual receipt `37601`; Vault rises from `93` to `37694` | Zero no longer prevents claim; actual new receipt equals the totalAccounted increment, without counting old remainder as new rewards |
| Normal redemption branch after consolidation | A receives `37694`; Vault balance becomes zero | This snapshot branch completes miner delivery and ledger settlement, then is reverted |
| Residual claim after redemption without harvest | A receives residual `37694` | This branch delivers the miner first, retains BEM, then the fixed beneficiary settles it |

The first harvest's local receipt is `0x85f2e4a2c0aa5c921f1bfd85180b4b49a3e6d4470c5385bc1fca392537594c6c`, fork block `128554264`; the new holder's post-transfer claim receipt is `0x1e8a1b56675240f0895d4f90af6b86309665f029c2b2d9737ef5a288ec66039b`, fork block `128554268`; the repeat harvest after pending=0 has receipt `0xbb4c0e08ec3731f159bdaaa59d89723df909e16290cb8ac35aedfe04aaef3d79`, fork block `128554271`. These hashes are local fork evidence, not mainnet transactions. Receipts in refund/redemption branches reverted by snapshot must be interpreted with the original test report's branch markings.

These positive receipts, continuing settlement, balance deltas and rights transfers provide actual runtime compatibility evidence. Source-audit conclusions on all-path Mining permissions and recipient rules, and all-path BEM fees, rebase and upgrade mechanisms remain Unknown.
