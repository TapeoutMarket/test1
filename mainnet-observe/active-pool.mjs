#!/usr/bin/env node
// Public RPC observations only: no env, private key, signer or broadcast path.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ContractFunctionRevertedError,createPublicClient,custom,http,keccak256,parseAbi} from 'viem';
import {ROOT,guardedProvider,json} from '../live-test/preflight.mjs';
import {readConfinedJson,writeAtomic} from '../live-test/deployment-io.mjs';
import {verifyReceipt} from '../live-test/verify-receipt.mjs';
import {chainIdentity,safeDiagnostic} from '../mainnet-test/send-step.mjs';
import {limitedReadProvider} from '../mainnet-funding/creator-contribute.mjs';
import {loadInput,checkCompletionEvents} from '../mainnet-completion/buyer-b-complete.mjs';
import {verifyLiveIdentity} from '../sdk/live-identity.ts';

const need=(ok,code)=>{if(!ok)throw new Error(code);};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const HASH=/^0x[0-9a-fA-F]{64}$/;
export const COMPLETION_TX='0x17509be1a415297b7ffbad6ad346625d6f67cb24aaffdd66ab4aae7e79f9f0a6';
export const PRIMARY_RPC='https://bsc-dataseed.defibit.io';
export const INDEPENDENT_RPC='https://bsc-dataseed.bnbchain.org';
const NFT_ABI=parseAbi(['function ownerOf(uint256) view returns(address)']);
const BEM_ABI=parseAbi(['function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)']);
const MINING_ABI=parseAbi(['function minerKey(address,uint256) view returns(bytes32)','function pending(bytes32) view returns(uint256)']);
const IDS=Array.from({length:100},(_,i)=>BigInt(i+1));
const plain={transactionsSent:0,privateKeysUsed:false};
const clientFor=url=>createPublicClient({transport:custom(limitedReadProvider(guardedProvider(http(url,{timeout:20000,retryCount:0})({})),8),{retryCount:0})});
export function argumentsFor(argv){need(argv.length===0||(argv.length===1&&argv[0]==='--help'),'NO_ENV_RPC_OR_TRANSACTION_ARGUMENTS_ACCEPTED');return {help:argv[0]==='--help'};}
export function negativeCases({creator,buyerB,pool}){
  return [
    ['buyer-b-claim-creator-id',buyerB,'claim',[1n],'NotHolder'],
    ['creator-claim-buyer-id',creator,'claim',[68n],'NotHolder'],
    ['creator-empty-ids',creator,'claimBatch',[[]],'InvalidIds'],
    ['creator-duplicate-ids',creator,'claimBatch',[[1n,1n]],'InvalidIds'],
    ['creator-zero-id',creator,'claimBatch',[[0n]],'InvalidIds'],
    ['creator-out-of-range-id',creator,'claimBatch',[[101n]],'InvalidIds'],
    ['creator-redeem',creator,'redeemMiner',[],'NotHolder'],
    ['buyer-b-redeem',buyerB,'redeemMiner',[],'NotHolder'],
    ['creator-withdraw-active',creator,'withdraw',[[1n],creator],'InvalidState'],
    ['creator-mark-refundable-active',creator,'markRefundable',[],'InvalidState'],
  ].map(([name,account,functionName,args,expectedError])=>({name,account,address:pool,functionName,args,expectedError}));
}
function decodedError(error){let cause=error;for(let i=0;i<10&&cause&&typeof cause==='object';i++,cause=cause.cause){if(cause instanceof ContractFunctionRevertedError)return cause.data?.errorName;}return undefined;}
export function expectedContractError(error,expectedName){return ['NotHolder','InvalidIds','InvalidState'].includes(expectedName)&&decodedError(error)===expectedName;}
export async function runNegativeChecks(client,input,blockNumber){
  const cases=[];
  for(const item of negativeCases({...input.session,pool:input.action.pool})){
    const record={...item,gas:'3000000',blockNumber:String(blockNumber)};
    try{await client.simulateContract({address:item.address,abi:input.vaultAbi,account:item.account,functionName:item.functionName,args:item.args,blockNumber,gas:3000000n,value:0n});cases.push({...record,status:'FAIL',actualError:'UNEXPECTED_SIMULATION_SUCCESS'});}
    catch(error){const matched=expectedContractError(error,item.expectedError),actual=decodedError(error);cases.push({...record,status:matched?'PASS':'FAIL',actualError:['NotHolder','InvalidIds','InvalidState'].includes(actual)?actual:'NO_EXPECTED_DECODED_CONTRACT_ERROR',...(matched?{}:{diagnostic:safeDiagnostic(error,'READ_ONLY_NEGATIVE_SIMULATION')})});}
  }
  return {status:cases.every(c=>c.status==='PASS')?'PASS':'FAIL',cases,...plain};
}
async function boundedMap(items,read){const result=new Array(items.length);let cursor=0;await Promise.all(Array.from({length:Math.min(8,items.length)},async()=>{while(cursor<items.length){const index=cursor++;result[index]=await read(items[index]);}}));return result;}
export async function observeSnapshot(client,input,{block,identityCheck=verifyLiveIdentity}={}){
  block??=await client.getBlock({blockTag:'latest'});need(typeof block.number==='bigint'&&HASH.test(block.hash),'LATEST_BLOCK_UNAVAILABLE');
  const at={blockNumber:block.number},pool=input.action.pool,{session}=input;
  // SDK obtains "latest" internally. Pin its latest read to this exact snapshot; checkpoint reads retain their explicit block.
  const pinnedClient=new Proxy(client,{get(target,property){if(property==='getBlock')return options=>options?.blockTag==='latest'?Promise.resolve(block):target.getBlock(options);const value=target[property];return typeof value==='function'?value.bind(target):value;}});
  const identity=await identityCheck(pinnedClient,input.manifest,{command:'harvest',target:pool,actor:session.creator,args:[],expectedTemplate:input.action.template,expectedCodeHash:input.manifest.vault.codeHash});
  const read=(functionName,args=[])=>client.readContract({address:pool,abi:input.vaultAbi,functionName,args,...at});
  const names=['state','soldCount','fundedWei','totalPrincipalIn','totalPrincipalRefunded','purchaseSpent','totalAccounted','totalPaid','accPerShare','remainder'];
  const holders=[['vault',pool],['creator',session.creator],['sellerA',session.seller],['buyerB',session.buyerB]];
  const [fieldValues,nftOwner,decimals,balanceValues,minerKey,shares]=await Promise.all([
    boundedMap(names,name=>read(name)),client.readContract({address:session.collection,abi:NFT_ABI,functionName:'ownerOf',args:[3204n],...at}),
    client.readContract({address:input.manifest.config.bem,abi:BEM_ABI,functionName:'decimals',args:[],...at}),
    boundedMap(holders,([,address])=>client.readContract({address:input.manifest.config.bem,abi:BEM_ABI,functionName:'balanceOf',args:[address],...at})),
    client.readContract({address:input.manifest.config.mining,abi:MINING_ABI,functionName:'minerKey',args:[session.collection,3204n],...at}),
    boundedMap(IDS,async id=>{const holder=await read('holderOf',[id]),supply=await read('totalSupply',[id]),claimed=await read('claimed',[id]),claimable=await read('claimable',[id]);return {id:String(id),holder,supply:String(supply),claimed:String(claimed),claimable:String(claimable)};}),
  ]);
  const pending=await client.readContract({address:input.manifest.config.mining,abi:MINING_ABI,functionName:'pending',args:[minerKey],...at});
  const fields=Object.fromEntries(names.map((name,i)=>[name,String(fieldValues[i])])),balances=Object.fromEntries(holders.map(([name],i)=>[name,String(balanceValues[i])]));
  const unaccounted=BigInt(balances.vault)+BigInt(fields.totalPaid)-BigInt(fields.totalAccounted);
  const checks={active:Number(fields.state)===2,all100SharesExist:fields.soldCount==='100'&&shares.length===100&&shares.every(s=>s.supply==='1'),minerOwnedByVault:same(nftOwner,pool),bemDecimals8:Number(decimals)===8,rewardBalanceNotDecreased:unaccounted>=0n,snapshotCanonical:same((await client.getBlock(at)).hash,block.hash)};
  return {status:Object.values(checks).every(Boolean)?'PASS':'FAIL',blockNumber:String(block.number),blockHash:block.hash,timestamp:String(block.timestamp),state:Number(fields.state),soldCount:fields.soldCount,fundedWei:fields.fundedWei,totalPrincipalIn:fields.totalPrincipalIn,totalPrincipalRefunded:fields.totalPrincipalRefunded,purchaseSpent:fields.purchaseSpent,nftOwner,bem:{decimals:Number(decimals),balances},mining:{minerKey,pendingRaw:String(pending),pendingIsNotGuaranteedClaimAmount:true},rewards:{totalAccounted:fields.totalAccounted,totalPaid:fields.totalPaid,accPerShare:fields.accPerShare,remainder:fields.remainder,unaccountedBem:String(unaccounted)},shares,identity,checks,...plain,scope:'LATEST_PINNED_BLOCK_OBSERVATION_NOT_TRANSACTION_PAYMENT_ATTRIBUTION',note:'These are current block-end balances and rights. They do not prove any wallet amount was received from the purchase and do not establish that harvest or claim has been executed. Mining pending is not a cap or guarantee for actual harvest.'};
}
export async function verifyCompletionPrerequisite(client,input,journal,plan){
  const entry=journal?.steps?.[0],a=input.action;
  need(journal?.schemaVersion===1&&journal.chainId===56&&same(journal.sessionHash,input.sessionHash)&&journal.steps.length===1&&entry?.status==='CONFIRMED'&&same(entry.transactionHash,COMPLETION_TX),'EXACT_CONFIRMED_COMPLETION_REQUIRED');
  need(entry.step==='buyer-b-complete'&&entry.nonce===4&&same(entry.to,a.to)&&entry.valueWei===a.valueWei&&same(entry.dataHash,a.dataHash)&&HASH.test(entry.planHash),'COMPLETION_JOURNAL_CHANGED');
  need(plan.status==='FROZEN_UNSIGNED_BUYER_B_COMPLETION_PLAN'&&same(plan.sessionHash,input.sessionHash)&&plan.completionToolHash===input.toolHash&&plan.fundingToolHash===input.fundingToolHash&&plan.poolToolHash===input.poolToolHash&&plan.sellerRuntimeToolHash===input.sellerToolHash&&json(plan.bindings)===json(input.bindings)&&same(plan.from,a.from)&&same(plan.to,a.to)&&plan.nonce===4&&plan.valueWei===a.valueWei&&same(plan.dataHash,a.dataHash)&&plan.gas===entry.gas&&plan.gasPrice===entry.gasPrice&&plan.maxFeeWei===entry.maxFeeWei,'COMPLETION_PLAN_CHANGED');
  const report=await verifyReceipt(client,{transactionHash:COMPLETION_TX,from:a.from,to:a.to,valueWei:a.valueWei,dataHash:a.dataHash,minimumConfirmations:15});need(report.status==='RECEIPT_MATCHED_BUSINESS_UNVERIFIED',report.reasonCode??'COMPLETION_RECEIPT_UNAVAILABLE');
  const tx=await client.getTransaction({hash:COMPLETION_TX});need(tx.nonce===4&&tx.gas===BigInt(plan.gas)&&tx.gasPrice===BigInt(plan.gasPrice)&&report.actualGas.feeWei<=BigInt(plan.maxFeeWei),'COMPLETION_TRANSACTION_CHANGED');
  const events=checkCompletionEvents(report.receipt,input);return {status:'PASS',transactionHash:COMPLETION_TX,blockNumber:String(report.receipt.blockNumber),blockHash:report.receipt.blockHash,confirmations:report.confirmations,checks:report.checks,eventChecks:events.checks,scope:'CANONICAL_RECEIPT_AND_EVENTS_NO_HISTORICAL_STORAGE_READ'};
}
async function directories(){for(const relative of ['mainnet-observe','mainnet-observe/observations']){const full=path.join(ROOT,relative);try{await fs.mkdir(full,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}const stat=await fs.lstat(full);need(stat.isDirectory()&&!stat.isSymbolicLink()&&await fs.realpath(full)===full,'OBSERVATION_DIRECTORY_SYMLINK_REFUSED');}}
export async function main(argv=process.argv.slice(2)){
  let stage='ARGUMENTS',report={schemaVersion:1,scope:'READ_ONLY_ACTIVE_POOL_SNAPSHOT_AND_NEGATIVE_SIMULATIONS',status:'FAIL',...plain,primaryEndpoint:PRIMARY_RPC,independentEndpoint:INDEPENDENT_RPC};
  try{
    if(argumentsFor(argv).help){console.log('Read-only: node --import tsx mainnet-observe/active-pool.mjs. Fixed public RPC and this session only. No .env, keys, signing, broadcast, or automatic retry.');return 0;}
    stage='PUBLIC_INPUT_AND_CONFIRMED_JOURNAL';const input=await loadInput({sessionFile:'mainnet-test/session.json',publicRpcFallback:true}),journalFile=`mainnet-completion/transactions/${input.sessionHash.slice(2)}.json`,{value:journal}=await readConfinedJson(journalFile),entry=journal?.steps?.[0];
    need(journal?.steps?.length===1&&entry?.status==='CONFIRMED'&&same(entry.transactionHash,COMPLETION_TX)&&HASH.test(entry.planHash),'EXACT_CONFIRMED_COMPLETION_REQUIRED');
    const planFile=`mainnet-completion/plans/buyer-b-complete-${entry.planHash.slice(2)}.json`,plan=await readConfinedJson(planFile);need(same(keccak256(plan.raw),entry.planHash),'COMPLETION_PLAN_HASH_CHANGED');
    const toolBytes=await fs.readFile(fileURLToPath(import.meta.url));Object.assign(report,{observedAt:new Date().toISOString(),observationToolSha256:createHash('sha256').update(toolBytes).digest('hex'),sessionHash:input.sessionHash,completionToolHash:input.toolHash,fundingToolHash:input.fundingToolHash,poolToolHash:input.poolToolHash,sellerRuntimeToolHash:input.sellerToolHash,bindings:input.bindings,journalFile,planFile,planHash:entry.planHash});
    const client=clientFor(PRIMARY_RPC),independent=clientFor(INDEPENDENT_RPC);
    stage='CHAIN_AND_FIXED_CHECKPOINT';report.chainIdentity=await chainIdentity(client,input,independent);
    stage='CANONICAL_COMPLETION_RECEIPT';report.completion=await verifyCompletionPrerequisite(client,input,journal,plan.value);
    stage='PINNED_ACTIVE_SNAPSHOT';const block=await client.getBlock({blockTag:'latest'});report.snapshot=await observeSnapshot(client,input,{block});
    const purchaseObservation=entry.after?.postconditions?.observation;report.rewardBaselineComparison=purchaseObservation?{scope:'HISTORICAL_PURCHASE_JOURNAL_VERSUS_CURRENT_SNAPSHOT_NOT_TRANSACTION_ATTRIBUTION',fields:Object.fromEntries(['totalAccounted','totalPaid','accPerShare','remainder'].map(name=>[name,{atPurchase:String(purchaseObservation[name]),now:report.snapshot.rewards[name],changed:String(purchaseObservation[name])!==report.snapshot.rewards[name]}])),vaultBem:{atPurchase:purchaseObservation.vaultBem===null?'UNKNOWN':String(purchaseObservation.vaultBem),now:report.snapshot.bem.balances.vault,changed:purchaseObservation.vaultBem===null?'UNKNOWN':String(purchaseObservation.vaultBem)!==report.snapshot.bem.balances.vault}}:{status:'HISTORICAL_REWARD_OBSERVATION_UNAVAILABLE'};
    stage='READ_ONLY_NEGATIVE_SIMULATIONS';report.negative=await runNegativeChecks(client,input,block.number);
    stage='FINAL_CANONICAL_RECHECK';need(same((await client.getBlock({blockNumber:block.number})).hash,block.hash)&&same((await client.getBlock({blockNumber:BigInt(report.completion.blockNumber)})).hash,report.completion.blockHash),'OBSERVATION_OR_COMPLETION_BLOCK_CHANGED');
    const again=await loadInput({sessionFile:'mainnet-test/session.json',publicRpcFallback:true});need(again.sessionHash===input.sessionHash&&again.toolHash===input.toolHash&&again.fundingToolHash===input.fundingToolHash&&again.poolToolHash===input.poolToolHash&&again.sellerToolHash===input.sellerToolHash&&json(again.bindings)===json(input.bindings),'PUBLIC_INPUT_CHANGED_DURING_OBSERVATION');
    report.status=report.snapshot.status==='PASS'&&report.negative.status==='PASS'?'PASS':'FAIL';
  }catch(error){report.failure=safeDiagnostic(error,stage);}
  try{await directories();const file=`mainnet-observe/observations/active-pool-${Date.now()}.json`;await writeAtomic(file,report);console.log(json({status:report.status,reportFile:file,blockNumber:report.snapshot?.blockNumber,negativeCases:report.negative?.cases.map(c=>({name:c.name,status:c.status,expectedError:c.expectedError,actualError:c.actualError})),failure:report.failure,...plain}));return report.status==='PASS'?0:1;}catch(error){console.error(json({status:'FAIL',...safeDiagnostic(error,'WRITE_READ_ONLY_OBSERVATION'),...plain}));return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;});
