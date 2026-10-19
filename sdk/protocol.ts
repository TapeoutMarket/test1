import { keccak256, parseAbi, verifyTypedData, type Address, type Hex, type PublicClient } from 'viem';
import { orderHash, seaportTypes, signingDigest, type OrderEnvelope } from './order-envelope.js';
const nftAbi = parseAbi(['function ownerOf(uint256) view returns(address)', 'function getApproved(uint256) view returns(address)', 'function isApprovedForAll(address,address) view returns(bool)']);
const marketAbi = parseAbi(['function information() view returns(string version,bytes32 domainSeparator,address conduitController)', 'function getOrderStatus(bytes32) view returns(bool isValidated,bool isCancelled,uint256 totalFilled,uint256 totalSize)', 'function getCounter(address) view returns(uint256)']);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function checkProtocol(client: PublicClient, e: OrderEnvelope) {
  if (e.protocol === 'official-circuit') return { protocol: e.protocol, status: 'UNKNOWN_DISABLED', executable: false, permanentInvalid: false, reason: 'Actual CircuitMarket implementation/ABI unverified; CIRCUIT_RESERVED disabled' };
  if (await client.getChainId() !== e.sourceChainId) throw new Error('Execution chain does not match order signing domain');
  const block = await client.getBlock({ blockTag: 'latest' }), blockNumber = block.number;
  const address = e.market as Address, collection = e.collection as Address, seller = e.seller as Address;
  const [marketCode, collectionCode, info, status, counter, owner, approved, approvedAll, sellerCode] = await Promise.all([
    client.getCode({ address, blockNumber }), client.getCode({ address: collection, blockNumber }),
    client.readContract({ address, abi: marketAbi, functionName: 'information', blockNumber }),
    client.readContract({ address, abi: marketAbi, functionName: 'getOrderStatus', args: [orderHash(e)], blockNumber }),
    client.readContract({ address, abi: marketAbi, functionName: 'getCounter', args: [seller], blockNumber }),
    client.readContract({ address: collection, abi: nftAbi, functionName: 'ownerOf', args: [BigInt(e.tokenId)], blockNumber }),
    client.readContract({ address: collection, abi: nftAbi, functionName: 'getApproved', args: [BigInt(e.tokenId)], blockNumber }),
    client.readContract({ address: collection, abi: nftAbi, functionName: 'isApprovedForAll', args: [seller, address], blockNumber }),
    client.getCode({ address: seller, blockNumber }),
  ]);
  const [validated, cancelled, filled, size] = status;
  const { domainSeparator: _separator, ...domain } = e.seaport.domain;
  let signatureValid = validated;
  if (!signatureValid && e.seaport.signature !== '0x') {
    if (sellerCode && sellerCode !== '0x') {
      try { signatureValid = same(await client.readContract({ address: seller, abi: parseAbi(['function isValidSignature(bytes32,bytes) view returns(bytes4)']), functionName: 'isValidSignature', args: [signingDigest(e), e.seaport.signature as Hex], blockNumber }), '0x1626ba7e'); } catch { signatureValid = false; }
    } else signatureValid = await verifyTypedData({ address: seller, domain: domain as never, types: seaportTypes, primaryType: 'OrderComponents', message: e.seaport.components as never, signature: e.seaport.signature as Hex }).catch(() => false);
  }
  const checks = { pinnedMarketIdentity: !!marketCode && marketCode !== '0x' && !!e.identity.marketCodeHash && same(keccak256(marketCode), e.identity.marketCodeHash),
    pinnedCollectionIdentity: !!collectionCode && collectionCode !== '0x' && !!e.identity.collectionCodeHash && same(keccak256(collectionCode), e.identity.collectionCodeHash),
    domainMatches: info[0] === e.seaport.domain.version && same(info[1], e.seaport.domain.domainSeparator),
    originalCounter: counter === BigInt(e.seaport.components.counter), notCancelled: !cancelled, notFilled: !(size > 0n && filled >= size),
    started: block.timestamp >= BigInt(e.seaport.parameters.startTime), notExpired: block.timestamp < BigInt(e.seaport.parameters.endTime),
    sellerOwnsMiner: same(owner, seller), sellerApproval: same(approved, address) || approvedAll, signatureOrSeaportValidation: signatureValid,
    sourceIdentityExplicitlyVerified: e.identity.status === 'verified',
  };
  if (!same((await client.getBlock({ blockNumber })).hash, block.hash)) throw new Error('UnverifiedProtocol: block changed while checking');
  return { protocol: e.protocol, status: Object.values(checks).every(Boolean) ? 'READ_ONLY_VALIDATED' : 'NOT_EXECUTABLE', executable: Object.values(checks).every(Boolean),
    permanentInvalid: cancelled || counter !== BigInt(e.seaport.components.counter) || size > 0n && filled >= size || block.timestamp >= BigInt(e.seaport.parameters.endTime),
    checks, blockNumber, blockHash: block.hash, orderHash: e.orderHash, quoteTtlIsNotNativeExpiry: true, executionSimulationStillRequired: true };
}
