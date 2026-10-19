#!/usr/bin/env node
// Read-only source postcheck. All RPC traffic uses the current host's loopback read proxy.
// No .env/private key access, wallet client, signing, or transaction submission exists here.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createPublicClient,http,parseAbi} from 'viem';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUTPUT='reports/real-source-postcheck.json';
const HASH=/^0x[0-9a-fA-F]{64}$/;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const serial=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2)+'\n';
class CheckError extends Error {constructor(code){super(code);this.code=code;}}
const need=(ok,code)=>{if(!ok)throw new CheckError(code);};
const sha=v=>createHash('sha256').update(v).digest('hex');
const nftABI=parseAbi(['function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)']);
const marketABI=parseAbi(['function getOrderStatus(bytes32) view returns(bool isValidated,bool isCancelled,uint256 totalFilled,uint256 totalSize)']);
function localOrigin(raw){const u=new URL(raw);need(u.protocol==='http:'&&u.hostname==='127.0.0.1'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/','SOURCE_PROXY_MUST_BE_NUMERIC_LOOPBACK_HTTP_ORIGIN');return u;}
async function input(relative){const file=path.join(ROOT,relative);need(await fs.realpath(file)===file,'INPUT_FILE_BOUNDARY');const text=await fs.readFile(file,'utf8');return {value:JSON.parse(text),evidence:{path:relative,sha256:sha(text)}};}
async function save(value){const directory=path.join(ROOT,'reports');await fs.mkdir(directory,{recursive:true});need(await fs.realpath(directory)===directory,'OUTPUT_DIRECTORY_BOUNDARY');const target=path.join(ROOT,OUTPUT);try{need(!(await fs.lstat(target)).isSymbolicLink(),'OUTPUT_FILE_BOUNDARY');}catch(error){if(error.code!=='ENOENT')throw error;}await fs.writeFile(target,serial(value),{mode:0o600});}
export function assessSnapshots(before,after,expectedOwner){
 const unknown=state=>state.isValidated===false&&state.isCancelled===false&&BigInt(state.totalFilled)===0n&&BigInt(state.totalSize)===0n;
 return {sourcePinnedOwnerMatchesInput:same(before.owner,expectedOwner),latestObservedOwnerMatchesInput:same(after.owner,expectedOwner),tokenApprovalUnchangedBetweenObservedBlocks:same(before.tokenApproved,after.tokenApproved),marketOperatorApprovalUnchangedBetweenObservedBlocks:before.approvedForAllToMarket===after.approvedForAllToMarket,generatedOrderUnknownAtSourcePin:unknown(before.orderStatus),generatedOrderUnknownAtLatestObservedBlock:unknown(after.orderStatus)};
}
export async function main(argv=process.argv.slice(2)){
 if(argv.length===1&&argv[0]==='--help'){console.log('Read-only source postcheck: node scripts/check-authorized-source.mjs\nReads only public local-session.json, authorized-source-observation.json and real-bsc-fork-tests.json. Uses sourceProxyURL to read one latest block then pins owner/approval/order status reads to that number/hash. Writes reports/real-source-postcheck.json. Never loads .env or signs/sends transactions.');return 0;}
 let report={schemaVersion:1,status:'NOT_RUN',scope:'READ_ONLY_SOURCE_POSTCHECK_FOR_ONE_CHECKPOINT',generatedAt:new Date().toISOString(),transactionsSentByThisScript:0,sourceRPCWritesByThisScript:0,privateKeysRead:false,loadedEnvFile:false,rpcMethodsUsed:['eth_chainId','eth_getBlockByNumber','eth_call'],sourceEndpoint:'LOCAL_READ_ONLY_PROXY_NOT_SERIALIZED'};
 try{
  need(argv.length===0,'NO_ARGUMENTS_SUPPORTED');need(await fs.realpath(process.cwd())===await fs.realpath(ROOT),'RUN_FROM_REPOSITORY_ROOT');
  const [manifestInput,observationInput,runInput]=await Promise.all([input('deployments/fork/56/local-session.json'),input('reports/authorized-source-observation.json'),input('reports/real-bsc-fork-tests.json')]);
  const manifest=manifestInput.value,observation=observationInput.value,run=runInput.value;
  need(manifest.status==='RUNNING'&&manifest.scope==='LOCAL_BSC_FORK_TRANSPORT'&&manifest.chainId===56&&manifest.upstreamWriteMethodsAllowed===false,'SOURCE_PROXY_MANIFEST_NOT_READY');
  need(observation.status==='READ_ONLY_SOURCE_OBSERVED'&&observation.chainId===56&&run.status==='PASS'&&run.scope==='REAL_BSC_STATE_LOCAL_FORK_ONLY','PUBLIC_INPUT_STATUS_MISMATCH');
  const pin=BigInt(observation.blockNumber);
  need(String(manifest.forkBlockNumber)===String(pin)&&same(manifest.forkBlockHash,observation.blockHash)&&String(run.sourcePin.blockNumber)===String(pin)&&same(run.sourcePin.blockHash,observation.blockHash)&&run.hostInstanceId===manifest.instanceId,'SOURCE_PIN_OR_HOST_ID_MISMATCH');
  for(const value of [observation.collection,observation.market,observation.nftOwner,run.actors.A])need(ADDRESS.test(value??''),'INVALID_PUBLIC_ADDRESS');
  need(same(observation.nftOwner,run.actors.A)&&same(observation.collection,run.realContracts.collection)&&same(observation.market,run.realContracts.market)&&String(observation.tokenId)===String(run.realContracts.tokenId),'ASSET_OR_ACTOR_INPUT_MISMATCH');
  need(HASH.test(observation.blockHash)&&HASH.test(run.order.orderHash)&&run.orderOrigin==='fork-created'&&run.order.publicSignature==='0x','INVALID_PIN_OR_FORK_ORDER_INPUT');
  const source=localOrigin(manifest.sourceProxyURL),execution=localOrigin(manifest.executionRPCURL);need(source.href!==execution.href,'SOURCE_AND_EXECUTION_ENDPOINTS_MUST_DIFFER');
  const client=createPublicClient({transport:http(source.href,{retryCount:0,timeout:20000}),cacheTime:0});
  need(await client.getChainId()===56,'SOURCE_CHAIN_ID_MISMATCH');
  const sourcePin=await client.getBlock({blockNumber:pin});need(same(sourcePin.hash,observation.blockHash),'SOURCE_PIN_HASH_CHANGED');
  const latest=await client.getBlock({blockTag:'latest'});need(latest.number>=pin&&HASH.test(latest.hash??''),'INVALID_SOURCE_LATEST_CHECKPOINT');
  const snapshot=async blockNumber=>{
   const [owner,tokenApproved,approvedForAllToMarket,status]=await Promise.all([
    client.readContract({address:observation.collection,abi:nftABI,functionName:'ownerOf',args:[BigInt(observation.tokenId)],blockNumber}),
    client.readContract({address:observation.collection,abi:nftABI,functionName:'getApproved',args:[BigInt(observation.tokenId)],blockNumber}),
    client.readContract({address:observation.collection,abi:nftABI,functionName:'isApprovedForAll',args:[observation.nftOwner,observation.market],blockNumber}),
    client.readContract({address:observation.market,abi:marketABI,functionName:'getOrderStatus',args:[run.order.orderHash],blockNumber})]);
   return {owner,tokenApproved,approvedForAllToMarket,orderStatus:{isValidated:status[0],isCancelled:status[1],totalFilled:String(status[2]),totalSize:String(status[3])}};
  };
  const [pinnedState,latestState]=await Promise.all([snapshot(pin),snapshot(latest.number)]);
  const [pinAgain,latestAgain]=await Promise.all([client.getBlock({blockNumber:pin}),client.getBlock({blockNumber:latest.number})]);
  need(same(pinAgain.hash,sourcePin.hash)&&same(latestAgain.hash,latest.hash),'SOURCE_CHECKPOINT_CHANGED_DURING_READ');
  const checks=assessSnapshots(pinnedState,latestState,observation.nftOwner);
  report={...report,status:Object.values(checks).every(Boolean)?'PASS':'OBSERVED_STATE_DIFFERENCE',inputs:[manifestInput.evidence,observationInput.evidence,runInput.evidence],forkRunCompletedAt:run.completedAt,hostInstanceId:manifest.instanceId,chainId:56,collection:observation.collection,tokenId:String(observation.tokenId),market:observation.market,orderHash:run.order.orderHash,sourcePin:{blockNumber:pin,blockHash:sourcePin.hash,timestamp:sourcePin.timestamp,state:pinnedState},latestObserved:{blockNumber:latest.number,blockHash:latest.hash,timestamp:latest.timestamp,selection:'LATEST_OBSERVED_THEN_PINNED_BY_NUMBER_AND_HASH',state:latestState},checks,checkpointHashesRechecked:true,evidenceLimits:['This report observes two explicit source-chain checkpoints through the authorized read-only proxy, not an exhaustive history of all mainnet transactions.','Matching owner/approval values cannot prove that no intermediate unrelated transactions ever occurred.','An unknown generated order at the observed source block shows this exact fork order was neither validated nor filled there. It does not certify all other orders.','The fork-only transaction hashes are not mainnet receipt evidence. No provider credential or execution secret is read by this script.']};
  await save(report);console.log(serial({...report,reportFile:OUTPUT}));return report.status==='PASS'?0:1;
 }catch(error){report={...report,status:'FAIL',reasonCode:error instanceof CheckError?error.code:'SOURCE_POSTCHECK_FAILED_PROVIDER_DETAILS_REDACTED'};try{await save(report);}catch{}console.error(serial(report));return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;}).catch(()=>{console.error('SOURCE_POSTCHECK_FAILED_PROVIDER_DETAILS_REDACTED');process.exitCode=1;});
