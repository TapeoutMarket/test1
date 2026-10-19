#!/usr/bin/env node
// Public chain observations only; this script cannot sign, configure, or send transactions.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getAddress, keccak256, parseAbi, stringToHex, zeroAddress, zeroHash} from 'viem';
import {readOnlyClientFromEnv, saveObservation, json, ACCOUNTS} from './preflight.mjs';

export const MULTISIG = getAddress('0x1f502a0b76EA9b42821B82e424C741AeF87C3D03'.toLowerCase());
// Published by safe-global/safe-deployments, checked 2026-10-19. Pin the values,
// not a mutable web response. A code mismatch requires a fresh identity review.
export const SAFE141 = {
  implementation: {address:'0x29fcB43b46531BcA003ddC8FCB67FFE91900C762', codeHash:'0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff', source:'https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/safe_l2.json'},
  factory: {address:'0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67', codeHash:'0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317', source:'https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/safe_proxy_factory.json'},
  fallback: {address:'0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99', codeHash:'0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9', source:'https://raw.githubusercontent.com/safe-global/safe-deployments/main/src/assets/v1.4.1/compatibility_fallback_handler.json'},
};
const abi = parseAbi(['function VERSION() view returns(string)', 'function getOwners() view returns(address[])', 'function getThreshold() view returns(uint256)', 'function nonce() view returns(uint256)', 'function getModulesPaginated(address,uint256) view returns(address[],address)', 'function masterCopy() view returns(address)']);
const sentinel = '0x0000000000000000000000000000000000000001';
const addressFromSlot = slot => slot && /^0x0{24}[0-9a-fA-F]{40}$/.test(slot) ? getAddress('0x' + slot.slice(-40)) : null;
const same = (a,b) => String(a).toLowerCase() === String(b).toLowerCase();
async function observed(read) { try { return {status: 'OBSERVED', value: await read()}; } catch { return {status: 'UNAVAILABLE', reason: 'READ_FAILED_DETAILS_REDACTED'}; } }
export function matchesSafe141ProxyRuntime(creation, runtime) {
  // Verified factory creation code copies 0xab bytes from offset 0x119 and
  // returns them. Constructor revert-string data follows that runtime, so
  // checking the suffix of the entire creation bytecode would be incorrect.
  if (typeof creation !== 'string' || typeof runtime !== 'string') return false;
  const offset = 0x119, length = 0xab;
  const copyAndReturn = '60ab806101196000396000f3fe';
  return creation.slice(2 + offset * 2 - copyAndReturn.length, 2 + offset * 2) === copyAndReturn && runtime.length === 2 + length * 2 && creation.slice(2 + offset * 2, 2 + (offset + length) * 2) === runtime.slice(2);
}

export async function inspectGovernance(client) {
  const chainId = await client.getChainId();
  const clientVersion = await client.request({method: 'web3_clientVersion'});
  if (chainId !== 56 || typeof clientVersion !== 'string' || /anvil|hardhat|ganache|testrpc/i.test(clientVersion)) throw new Error('MAINNET_IDENTITY_REJECTED');
  const block = await client.getBlock({blockTag: 'finalized'});
  if (!block.hash || block.number === null) throw new Error('CHECKPOINT_UNAVAILABLE');
  const at = {blockNumber: block.number};
  const code = await client.getCode({address: MULTISIG, ...at});
  const report = {status: 'UNVERIFIED_GOVERNANCE_CANDIDATE', observedAt: new Date().toISOString(), chainId, address: MULTISIG, checkpoint: {blockNumber: block.number, blockHash: block.hash, timestamp: block.timestamp}, codeHash: code && code !== '0x' ? keccak256(code) : null, codeBytes: code ? (code.length-2)/2 : 0, transactionsSent: 0, privateKeysUsed: false, userPermissionStatement: 'User states they have authority for this existing multisig; RPC reads cannot prove access to signing keys.', governanceAssigned: false, requestedTimelockFloorSeconds: 600};
  if (!code || code === '0x') return {...report, status: 'NO_CODE_ON_BSC'};
  const read = (functionName,args=[]) => observed(() => client.readContract({address: MULTISIG, abi, functionName, args, ...at}));
  const names = ['VERSION', 'getOwners', 'getThreshold', 'nonce', 'masterCopy'];
  const readings = await Promise.all(names.map(name => read(name)));
  report.getters = Object.fromEntries(names.map((name,i) => [name, readings[i]]));
  report.slot0 = await observed(() => client.getStorageAt({address: MULTISIG, slot: zeroHash, ...at}));
  report.implementation = {address: addressFromSlot(report.slot0.value), evidence: 'Safe-style singleton storage slot0; must be corroborated against deployed proxy code'};
  if (report.implementation.address && report.implementation.address !== zeroAddress) {
    const implCode = await client.getCode({address: report.implementation.address, ...at});
    report.implementation.codeHash = implCode && implCode !== '0x' ? keccak256(implCode) : null;
    report.implementation.codeBytes = implCode ? (implCode.length-2)/2 : 0;
    report.implementation.masterCopyGetterMatchesSlot0 = report.getters.masterCopy.status === 'OBSERVED' && same(report.getters.masterCopy.value, report.implementation.address);
  }
  const owners = report.getters.getOwners.value;
  const threshold = report.getters.getThreshold.value;
  report.configuration = {
    ownerCount: Array.isArray(owners) ? owners.length : null,
    validThresholdAndUniqueNonzeroOwners: Array.isArray(owners) && typeof threshold === 'bigint' && threshold > 0n && threshold <= BigInt(owners.length) && owners.every(a => !same(a,zeroAddress)) && new Set(owners.map(a=>a.toLowerCase())).size === owners.length,
    thresholdRequiresMultipleSignatures: typeof threshold === 'bigint' && threshold >= 2n,
    knownTestWalletsAmongOwners: Array.isArray(owners) ? Object.fromEntries(Object.entries(ACCOUNTS).map(([role,address])=>[role,owners.some(a=>same(a,address))])) : null,
  };
  const pages = []; const seen = new Set(); let start = sentinel; let complete = false;
  for (let i=0; i<10; i++) {
    const page = await read('getModulesPaginated',[start,100n]); pages.push(page);
    if (page.status !== 'OBSERVED') break;
    const [modules,next] = page.value;
    if (modules.some(a => seen.has(a.toLowerCase()))) break;
    for (const address of modules) seen.add(address.toLowerCase());
    if (same(next,sentinel)) { complete = true; break; }
    if (!modules.length || same(next,start)) break;
    start = next;
  }
  report.modules = {complete, addresses: [...seen], pages, note: 'Enabled modules can have execution authority separate from owner threshold; any nonempty set requires separate review.'};
  report.specialSlots = {};
  for (const label of ['guard_manager.guard.address', 'fallback_manager.handler.address', 'module_manager.module_guard.address']) {
    const slot = keccak256(stringToHex(label));
    const value = await observed(() => client.getStorageAt({address: MULTISIG, slot, ...at}));
    report.specialSlots[label] = {slot, ...value, address: addressFromSlot(value.value), interpretation: 'Raw Safe-family storage observation; applicability depends on verified implementation version.'};
  }
  const proxyFactoryCode = await client.getCode({address:SAFE141.factory.address, ...at});
  const fallbackAddress = report.specialSlots['fallback_manager.handler.address'].address;
  const fallbackCode = fallbackAddress && fallbackAddress !== zeroAddress ? await client.getCode({address:fallbackAddress, ...at}) : undefined;
  const proxyCreation = await observed(() => client.readContract({address:SAFE141.factory.address, abi:parseAbi(['function proxyCreationCode() pure returns(bytes)']), functionName:'proxyCreationCode', ...at}));
  report.provenance = {
    sources:SAFE141,
    officialImplementationAddressAndCodeMatch:same(report.implementation.address,SAFE141.implementation.address) && report.implementation.codeHash === SAFE141.implementation.codeHash,
    officialProxyFactoryCodeMatch:Boolean(proxyFactoryCode && keccak256(proxyFactoryCode) === SAFE141.factory.codeHash),
    proxyRuntimeMatchesFactoryCreationReturnSection:proxyCreation.status === 'OBSERVED' && matchesSafe141ProxyRuntime(proxyCreation.value,code),
    proxyCreationCodeHash:proxyCreation.status === 'OBSERVED' ? keccak256(proxyCreation.value) : null,
    observedProxyRuntime:code,
    factoryProxyCreationCode:proxyCreation.status === 'OBSERVED' ? proxyCreation.value : null,
    officialFallbackAddressAndCodeMatch:same(fallbackAddress,SAFE141.fallback.address) && Boolean(fallbackCode && keccak256(fallbackCode) === SAFE141.fallback.codeHash),
    guardAbsent:report.specialSlots['guard_manager.guard.address'].status === 'OBSERVED' && same(report.specialSlots['guard_manager.guard.address'].address,zeroAddress),
  };
  if (!same((await client.getBlock({blockNumber:block.number})).hash,block.hash)) throw new Error('CHECKPOINT_CHANGED');
  report.currentConfigurationAcceptedForPreparation = assessGovernance(report);
  report.status = report.currentConfigurationAcceptedForPreparation ? 'SAFE_141_RUNTIME_AND_CURRENT_CONFIGURATION_MATCH' : 'GOVERNANCE_IDENTITY_OR_CONFIGURATION_REVIEW_REQUIRED';
  report.limitations = ['This is a point-in-time runtime/configuration check, not a complete historical audit.', 'Owners may change Safe configuration later; recheck immediately before deployment/configuration signing.', 'User authority is reported by the user, not proven by chain reads. No Timelock has been deployed or role assigned.'];
  return report;
}
export function assessGovernance(report) {
  return Boolean(report.getters.VERSION.value === '1.4.1' && report.configuration.validThresholdAndUniqueNonzeroOwners && report.configuration.thresholdRequiresMultipleSignatures && report.implementation.masterCopyGetterMatchesSlot0 && report.modules.complete && report.modules.addresses.length === 0 && report.provenance.officialImplementationAddressAndCodeMatch && report.provenance.officialProxyFactoryCodeMatch && report.provenance.proxyRuntimeMatchesFactoryCreationReturnSection && report.provenance.officialFallbackAddressAndCodeMatch && report.provenance.guardAbsent);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--env') throw new Error('EXPLICIT_ENV_ARGUMENT_ONLY');
    const report = await inspectGovernance(await readOnlyClientFromEnv(process.argv[3]));
    const file = await saveObservation('governance',report); console.log(json({...report, reportFile:file}));
  } catch(error) {
    console.error(json({status:'FAILED', reason:error.constructor === Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'READ_FAILED_DETAILS_REDACTED', transactionsSent:0})); process.exitCode=1;
  }
}
