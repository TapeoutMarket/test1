#!/usr/bin/env node
// Explicit user-authorized environment input. Reads only; never signs or exports private keys.
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createPublicClient,http,parseAbi,getAddress,keccak256} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function authorizedInputs(file){
 if(!file)throw new Error('EXPLICIT_ENV_FILE_REQUIRED');
 const values=parseEnv(await fs.readFile(path.resolve(file),'utf8'));
 const accounts={};
 for(const role of ['CREATOR','HOLDER_A','HOLDER_B']){
  const key=values[role+'_PRIVATE_KEY'];if(!key)throw new Error('REQUIRED_ACCOUNT_MISSING');
  const address=privateKeyToAccount(key.startsWith('0x')?key:'0x'+key).address;
  if(values[role+'_ADDRESS']&&getAddress(values[role+'_ADDRESS'])!==address)throw new Error('ENV_PUBLIC_ADDRESS_MISMATCH');
  accounts[role]=address;
 }
 if(!values.BSC_RPC_URL)throw new Error('BSC_RPC_URL_MISSING');
 return {source:values.BSC_RPC_URL,accounts,collection:getAddress(values.MINER_COLLECTION),tokenId:BigInt(values.MINER_TOKEN_ID),mining:getAddress(values.POD_MINING_ADDRESS),bem:getAddress(values.BEM_TOKEN_ADDRESS),market:getAddress('0x0000000000000068F116a894984e2DB1123eB395')};
}
export async function probe(file){
 const input=await authorizedInputs(file);
 const client=createPublicClient({transport:http(input.source,{retryCount:0,timeout:20000})});
 if(await client.getChainId()!==56)throw new Error('SOURCE_CHAIN_MUST_BE_56');
 let block,selection;
 try{block=await client.getBlock({blockTag:'finalized'});selection='PROVIDER_FINALIZED_TAG';}catch{
  const latest=await client.getBlockNumber();if(latest<64n)throw new Error('SOURCE_BLOCK_TOO_LOW');
  block=await client.getBlock({blockNumber:latest-64n});selection='LATEST_MINUS_64_CONFIRMATION_BLOCKS';
 }
 if(!block?.hash||block.number===null)throw new Error('PINNED_BLOCK_UNAVAILABLE');
 const at={blockNumber:block.number};
 const collectionAbi=parseAbi(['function ownerOf(uint256) view returns(address)','function balanceOf(address) view returns(uint256)']);
 const miningAbi=parseAbi(['function minerKey(address,uint256) view returns(bytes32)','function pending(bytes32) view returns(uint256)']);
 const [codes,owner,held,information,key,decimals]=await Promise.all([
  Promise.all(['collection','mining','bem','market'].map(async field=>{const code=await client.getCode({address:input[field],...at});if(!code||code==='0x')throw new Error('PROTOCOL_CODE_MISSING');return {field,address:input[field],codeHash:keccak256(code),bytes:(code.length-2)/2};})),
  client.readContract({address:input.collection,abi:collectionAbi,functionName:'ownerOf',args:[input.tokenId],...at}),
  client.readContract({address:input.collection,abi:collectionAbi,functionName:'balanceOf',args:[input.accounts.HOLDER_A],...at}),
  client.readContract({address:input.market,abi:parseAbi(['function information() view returns(string,bytes32,address)']),functionName:'information',...at}),
  client.readContract({address:input.mining,abi:miningAbi,functionName:'minerKey',args:[input.collection,input.tokenId],...at}),
  client.readContract({address:input.bem,abi:parseAbi(['function decimals() view returns(uint8)']),functionName:'decimals',...at})
 ]);
 const pending=await client.readContract({address:input.mining,abi:miningAbi,functionName:'pending',args:[key],...at});
 if((await client.getBlock({blockNumber:block.number})).hash!==block.hash)throw new Error('PINNED_BLOCK_CHANGED');
 const report={status:'READ_ONLY_SOURCE_OBSERVED',sourceRPC:'REDACTED_USER_AUTHORIZED_ENV',chainId:56,blockSelection:selection,blockNumber:String(block.number),blockHash:block.hash,timestamp:String(block.timestamp),accounts:input.accounts,collection:input.collection,tokenId:String(input.tokenId),mining:input.mining,bem:input.bem,market:input.market,nftOwner:owner,holderAMinerBalance:String(held),holderAOwnsConfiguredMiner:owner.toLowerCase()===input.accounts.HOLDER_A.toLowerCase(),codeIdentities:codes,seaport:{version:information[0],domainSeparator:information[1],conduitController:information[2]},minerKey:key,pendingRaw:String(pending),bemDecimals:decimals,transactionsSent:0,privateKeysUsedForSigning:false,fullForkLifecycle:'NOT_RUN',sourceSemantics:'RUNTIME_OBSERVED_NOT_SOURCE_AUDITED'};
 await fs.writeFile(path.join(ROOT,'reports/authorized-source-observation.json'),JSON.stringify(report,null,2)+'\n');return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==4||process.argv[2]!=='--env')throw new Error('USE_EXPLICIT_ENV_ARGUMENT');console.log(JSON.stringify(await probe(process.argv[3]),null,2));}
 catch(error){const code=error.constructor===Error&&/^[A-Z_]+$/.test(error.message)?error.message:'SOURCE_READ_FAILED_DETAILS_REDACTED';console.error(JSON.stringify({status:'FAILED',reasonCode:code,transactionsSent:0}));process.exitCode=1;}
}
