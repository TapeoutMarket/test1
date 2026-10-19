#!/usr/bin/env node
// Human-operated fixed creator subscription, isolated from all prior frozen tools.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {createPublicClient,createWalletClient,custom,http,encodeFunctionData,keccak256,parseAbi,parseEventLogs,formatEther,zeroAddress} from 'viem';
import {ROOT,ACCOUNTS,guardedProvider,json} from '../live-test/preflight.mjs';
import {readConfinedJson,writeAtomic,acquireDeploymentLock,readBudget,reserveBudget,validateBudget} from '../live-test/deployment-io.mjs';
import {assertRpcUnchanged,sendRecordedOnce} from '../live-test/deploy-mainnet.mjs';
import {verifyReceipt} from '../live-test/verify-receipt.mjs';
import {humanGates,rpcContext,selectRpc,safeDiagnostic,actionFor as sellerActionFor,chainIdentity} from '../mainnet-test/send-step.mjs';
import {loadInput as loadPoolInput,checkCreationEvents,assertPoolLedger,previousCheck as checkSellerReceipts} from '../mainnet-pool/create-pool.mjs';
import {verifyLiveIdentity,cloneRuntime} from '../sdk/live-identity.ts';
import {checkProtocol} from '../sdk/protocol.ts';
import {checkReceiptPostconditions} from '../sdk/postconditions.ts';
import {seaportAbi} from '../scripts/fork-create-order.mjs';

const need=(ok,code)=>{if(!ok)throw new Error(code);};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const sameIds=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((id,i)=>String(id)===String(b[i]));
const HASH=/^0x[0-9a-fA-F]{64}$/;
const UINT=/^(0|[1-9][0-9]*)$/;
const STEP='creator-contribute';
const VALUE=203010000000000000n;
const COST=3030000000000000n;
const POOL='0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A';
const DATA_HASH='0x573a807f44e97b3bb2dbe5c403b75fec2a868beaf685a8e01beaf94494b4ccf1';
const IDS=Array.from({length:67},(_,i)=>BigInt(i+1));
const ALL_IDS=Array.from({length:100},(_,i)=>BigInt(i+1));
const CONFIRMATIONS=15;
const NFT_ABI=parseAbi(['function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)']);
const journalPath=hash=>`mainnet-funding/transactions/${hash.slice(2)}.json`;
const planPath=hash=>`mainnet-funding/plans/creator-contribute-${hash.slice(2)}.json`;
const reservationId=input=>`funding-${input.sessionHash.slice(2)}-creator-contribute`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const serial=value=>json(value);

export function argumentsFor(argv){
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const flags=new Set(['--broadcast','--reconcile','--public-rpc-fallback']),fields=new Set(['--env','--session','--step','--reviewed-plan-hash','--max-tx-fee-bnb','--max-total-spend-bnb']),v={};
  for(let i=0;i<argv.length;i++){const flag=argv[i];need(!Object.hasOwn(v,flag),'DUPLICATE_ARGUMENT');if(flags.has(flag))v[flag]=true;else{need(fields.has(flag)&&argv[i+1]&&!argv[i+1].startsWith('--'),'INVALID_ARGUMENT');v[flag]=argv[++i];}}
  need(v['--env']&&v['--session'],'EXPLICIT_ENV_AND_SESSION_REQUIRED');need(!v['--step']||v['--step']===STEP,'ONLY_CREATOR_CONTRIBUTE_SUPPORTED');need(!(v['--broadcast']&&v['--reconcile']),'BROADCAST_AND_RECONCILE_ARE_EXCLUSIVE');
  if(v['--broadcast'])need(HASH.test(v['--reviewed-plan-hash']??''),'REVIEWED_PLAN_HASH_REQUIRED');
  return {step:STEP,envFile:v['--env'],sessionFile:v['--session'],broadcast:!!v['--broadcast'],reconcile:!!v['--reconcile'],publicRpcFallback:!!v['--public-rpc-fallback'],reviewedPlanHash:v['--reviewed-plan-hash'],maxTx:v['--max-tx-fee-bnb'],maxTotal:v['--max-total-spend-bnb']};
}
export async function fundingToolHash(){
  const directory=path.join(ROOT,'mainnet-funding'),records=[];need(await fs.realpath(directory)===directory,'FUNDING_TOOL_DIRECTORY_SYMLINK_REFUSED');
  for(const name of (await fs.readdir(directory)).filter(n=>n.endsWith('.mjs')&&!n.endsWith('.test.mjs')).sort()){const file=path.join(directory,name),stat=await fs.lstat(file);need(stat.isFile()&&!stat.isSymbolicLink(),'FUNDING_TOOL_SYMLINK_REFUSED');const bytes=await fs.readFile(file);records.push({path:'mainnet-funding/'+name,sha256:sha(bytes),bytes:bytes.length});}
  need(records.some(r=>r.path==='mainnet-funding/creator-contribute.mjs'),'FUNDING_TOOL_MISSING');return sha(JSON.stringify(records));
}
export function buildAction(session,manifest,vaultAbi){
  sellerActionFor(session,'seller-validate');
  need(same(session.creator,ACCOUNTS.creator)&&same(session.pool.address,POOL)&&same(manifest.vault.address,POOL)&&same(manifest.vault.creator,session.creator),'FIXED_CREATOR_POOL_REQUIRED');
  need(same(session.pool.payloadHash,manifest.vault.payloadHash)&&same(keccak256(session.pool.payload),manifest.vault.payloadHash)&&same(session.pool.termsHash,manifest.vault.termsHash),'FROZEN_PAYLOAD_OR_TERMS_CHANGED');
  const allocation=session.plannedContributions?.[0];need(session.plannedContributions?.length===2&&allocation.role==='creator'&&same(allocation.address,session.creator)&&allocation.ids==='1..67'&&allocation.shares===67&&allocation.valueWei===String(VALUE)&&session.totalWei==='303000000000000000','FIXED_CREATOR_ALLOCATION_REQUIRED');
  const nonce=session.steps?.[STEP]?.nonce;need(UINT.test(String(nonce))&&BigInt(nonce)===10n&&BigInt(session.steps['create-pool'].nonce)===9n&&session.steps[STEP].requiresStep==='create-pool','FIXED_CREATOR_NONCE_REQUIRED');
  const args=[[...IDS],false,session.pool.payload],data=encodeFunctionData({abi:vaultAbi,functionName:'contribute',args});need(same(keccak256(data),DATA_HASH),'FIXED_CONTRIBUTE_CALLDATA_CHANGED');
  return {step:STEP,from:session.creator,to:POOL,pool:POOL,valueWei:String(VALUE),nonce:Number(nonce),ids:[...IDS],requireCompletion:false,args,data,dataHash:keccak256(data),template:manifest.template.address,configHash:manifest.configHash,termsHash:manifest.vault.termsHash,payloadHash:manifest.vault.payloadHash,orderHash:session.seaport.orderHash};
}
async function hashedFile(file,expected){const result=await readConfinedJson(file);need(!expected||same(keccak256(result.raw),expected),'FROZEN_PUBLIC_INPUT_CHANGED');return {...result,hash:keccak256(result.raw)};}
export async function loadInput(options){
  const poolInput=await loadPoolInput(options),toolHash=await fundingToolHash(),action=buildAction(poolInput.session,poolInput.manifest,poolInput.vaultAbi);
  return {...poolInput,poolInput,action,toolHash,poolToolHash:poolInput.toolHash};
}
function assertInputUnchanged(a,b){need(a.sessionHash===b.sessionHash&&a.toolHash===b.toolHash&&a.poolToolHash===b.poolToolHash&&a.sellerToolHash===b.sellerToolHash&&a.action.dataHash===b.action.dataHash&&serial(a.bindings)===serial(b.bindings)&&a.rpcMode===b.rpcMode&&a.primaryEndpoint===b.primaryEndpoint&&a.independentEndpoint===b.independentEndpoint,'LOCAL_INPUT_CHANGED_REPLAN_REQUIRED');}
/** Bound the entire primary read transport, including SDK reads. Each request runs once. */
export function limitedReadProvider(provider,limit=8){
  need(Number.isSafeInteger(limit)&&limit>0&&limit<=16,'INVALID_READ_CONCURRENCY');let active=0;const waiting=[];
  const drain=()=>{while(active<limit&&waiting.length){active++;waiting.shift()();}};
  return {request:async args=>{await new Promise(resolve=>{waiting.push(resolve);drain();});try{return await provider.request(args);}finally{active--;drain();}}};
}
const readClient=url=>{assertRpcUnchanged(url,url);return createPublicClient({transport:custom(limitedReadProvider(guardedProvider(http(url,{retryCount:0,timeout:20000})({}))),{retryCount:0})});};
async function onlyEnvFields(file,names){
  const expected=path.resolve(ROOT,'../.env'),stat=await fs.lstat(expected),actual=await fs.realpath(path.resolve(ROOT,file));need(stat.isFile()&&!stat.isSymbolicLink()&&actual===expected,'ONLY_CURRENT_WORKSPACE_ENV_SUPPORTED');
  const raw=await fs.readFile(actual,'utf8'),result={};for(const name of names){const rows=raw.split(/\r?\n/).filter(line=>new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=').test(line));need(rows.length===1,'ONE_REQUIRED_ENV_ASSIGNMENT_EXPECTED');result[name]=parseEnv(rows[0])[name];}return result;
}

export async function previousCheck(client,input){
  await checkSellerReceipts(client,input.poolInput);
  const {value:journal}=await readConfinedJson(`mainnet-pool/transactions/${input.sessionHash.slice(2)}.json`);assertPoolLedger(journal,await readBudget(),input.poolInput);const entry=journal.steps[0];need(entry?.status==='CONFIRMED'&&HASH.test(entry.transactionHash),'CONFIRMED_CREATE_POOL_REQUIRED');
  const plan=await hashedFile(`mainnet-pool/plans/create-pool-${entry.planHash.slice(2)}.json`,entry.planHash);
  return verifyCreationPrerequisite(client,input,entry,plan.value);
}
/** Receipt/events prove the historical creation; current clone and empty-pool state are checked by preview separately. */
export async function verifyCreationPrerequisite(client,input,entry,plan){
  const action=input.poolInput.action;
  need(entry?.status==='CONFIRMED'&&HASH.test(entry.transactionHash),'CONFIRMED_CREATE_POOL_REQUIRED');
  need(plan.status==='FROZEN_UNSIGNED_CREATE_POOL_PLAN'&&plan.poolToolHash===input.poolToolHash&&plan.sellerRuntimeToolHash===input.sellerToolHash&&serial(plan.bindings)===serial(input.bindings)&&same(plan.sessionHash,input.sessionHash)&&same(plan.dataHash,action.dataHash)&&plan.nonce===action.nonce&&same(plan.from,action.from)&&same(plan.to,action.to)&&plan.valueWei==='0'&&plan.gas===entry.gas&&plan.gasPrice===entry.gasPrice&&plan.maxFeeWei===entry.maxFeeWei,'CREATE_PREREQUISITE_PLAN_CHANGED');
  const report=await verifyReceipt(client,{transactionHash:entry.transactionHash,from:action.from,to:action.to,valueWei:'0',dataHash:action.dataHash,minimumConfirmations:CONFIRMATIONS});
  need(report.status==='RECEIPT_MATCHED_BUSINESS_UNVERIFIED',report.reasonCode??'CREATE_PREREQUISITE_RECEIPT_UNVERIFIED');
  const tx=await client.getTransaction({hash:entry.transactionHash});need(tx.nonce===action.nonce&&tx.gas===BigInt(plan.gas)&&tx.gasPrice===BigInt(plan.gasPrice)&&report.actualGas.feeWei<=BigInt(plan.maxFeeWei),'CREATE_PREREQUISITE_TRANSACTION_CHANGED');
  const events=checkCreationEvents(report.receipt,input.poolInput);
  need(same((await client.getBlock({blockNumber:report.receipt.blockNumber})).hash,report.receipt.blockHash),'CREATE_PREREQUISITE_BLOCK_CHANGED');
  return {step:'create-pool',transactionHash:entry.transactionHash,planHash:entry.planHash,blockNumber:String(report.receipt.blockNumber),blockHash:report.receipt.blockHash,pool:input.action.pool,scope:'CANONICAL_CREATION_RECEIPT_AND_EVENTS',historicalStorageRechecked:false,currentCloneStateCheckedSeparately:true,checks:events.checks};
}

async function mapReads(items,read){
  const results=new Array(items.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(8,items.length)},async()=>{while(cursor<items.length){const index=cursor++;results[index]=await read(items[index]);}}));return results;
}
export async function shareState(client,input,blockNumber){
  const read=(functionName,args=[])=>client.readContract({address:input.action.pool,abi:input.vaultAbi,functionName,args,blockNumber});
  const requests=ALL_IDS.flatMap(id=>[['holderOf',id],['totalSupply',id]]);
  const [rows,balances]=await Promise.all([mapReads(requests,([fn,id])=>read(fn,[id])),read('balanceOfBatch',[ALL_IDS.map(()=>input.action.from),ALL_IDS])]);
  const holders=rows.filter((_,i)=>i%2===0),supplies=rows.filter((_,i)=>i%2===1);
  need(holders.length===100&&supplies.length===100&&balances.length===100,'COMPLETE_SHARE_STATE_REQUIRED');
  return {holders,supplies:supplies.map(String),balances:balances.map(String)};
}
function assertShares(shares,holderCount,creator){
  need(shares.holders.every((holder,i)=>same(holder,i<holderCount?creator:zeroAddress))&&shares.supplies.every((s,i)=>s===String(i<holderCount?1:0))&&shares.balances.every((s,i)=>s===String(i<holderCount?1:0)),'EXACT_SHARE_OWNERSHIP_MISMATCH');
}
export async function observeBefore(client,input){
  const {session,action}=input,block=await client.getBlock({blockTag:'latest'});need(typeof block.number==='bigint'&&HASH.test(block.hash),'LATEST_BLOCK_UNAVAILABLE');const at={blockNumber:block.number},read=(functionName,args=[])=>client.readContract({address:action.pool,abi:input.vaultAbi,functionName,args,...at});
  const [latestNonce,pendingNonce,creatorNative,vaultNative,creatorCode,poolCode,isPool,fields,shares,costs,owner,approved,approvedAll,information,counter,orderHash,status]=await Promise.all([
    client.getTransactionCount({address:action.from,blockTag:'latest'}),client.getTransactionCount({address:action.from,blockTag:'pending'}),client.getBalance({address:action.from,...at}),client.getBalance({address:action.pool,...at}),client.getCode({address:action.from,...at}),client.getCode({address:action.pool,...at}),client.readContract({address:input.manifest.factory.address,abi:input.factoryAbi,functionName:'isPool',args:[action.pool],...at}),
    Promise.all(['state','soldCount','fundedWei','totalPrincipalIn','totalPrincipalRefunded','purchaseSpent','soldBitmap','marketStatus'].map(name=>read(name))),shareState(client,input,block.number),mapReads(IDS,id=>read('costOf',[id])),
    ...[['ownerOf',[3204n]],['getApproved',[3204n]],['isApprovedForAll',[session.seller,session.market]]].map(([functionName,args])=>client.readContract({address:session.collection,abi:NFT_ABI,functionName,args,...at})),
    ...[['information',[]],['getCounter',[session.seller]],['getOrderHash',[sellerActionFor(session,'seller-validate').orderComponents]],['getOrderStatus',[action.orderHash]]].map(([functionName,args])=>client.readContract({address:session.market,abi:seaportAbi,functionName,args,...at})),
  ]);
  need(latestNonce===action.nonce&&pendingNonce===action.nonce,'CREATOR_NONCE_CHANGED_OR_PENDING');need(!creatorCode||creatorCode==='0x','CREATOR_MUST_REMAIN_PLAIN_EOA');need(isPool===true&&same(poolCode,cloneRuntime(action.template)),'REGISTERED_CLONE_REQUIRED');
  need(fields.every(value=>BigInt(value)===0n)&&vaultNative===0n,'EMPTY_EXECUTABLE_FUNDING_POOL_REQUIRED');assertShares(shares,0,action.from);need(costs.length===67&&costs.every(c=>c===COST)&&costs.reduce((sum,c)=>sum+c,0n)===VALUE,'FIXED_SHARE_COST_MISMATCH');
  need(same(owner,session.seller)&&same(approved,session.market)&&approvedAll===false,'MINER_OWNER_OR_APPROVAL_CHANGED');need(information[0]===session.seaport.version&&same(information[1],session.seaport.domainSeparator)&&counter===BigInt(session.seaport.counter)&&same(orderHash,action.orderHash),'SEAPORT_IDENTITY_COUNTER_OR_ORDER_CHANGED');need(status[0]===true&&status[1]===false&&status[2]===0n,'VALIDATED_UNFILLED_ORDER_REQUIRED');
  need(block.timestamp>=BigInt(session.pool.terms.orderStart)&&block.timestamp+300n<BigInt(session.fundingDeadline),'FUNDING_DEADLINE_TOO_CLOSE');need(same((await client.getBlock({blockNumber:block.number})).hash,block.hash),'OBSERVATION_BLOCK_CHANGED');
  return {blockNumber:String(block.number),blockHash:block.hash,timestamp:String(block.timestamp),latestNonce,pendingNonce,balanceWei:String(creatorNative),vaultNativeWei:String(vaultNative),state:0,soldCount:'0',fundedWei:'0',totalPrincipalIn:'0',totalPrincipalRefunded:'0',purchaseSpent:'0',soldBitmap:'0',marketStatus:0,shares,costs:costs.map(String),principalWei:String(VALUE),owner,approved,approvedAll,counter:String(counter),orderHash,orderStatus:status.map(x=>typeof x==='bigint'?String(x):x)};
}
export async function preview(client,input,{independent,identityCheck=verifyLiveIdentity,protocolCheck=checkProtocol,previousCheck:prior=previousCheck,chainCheck=chainIdentity,onStage=()=>{}}={}){
  onStage('PREVIEW_CHAIN_IDENTITY');await chainCheck(client,input,independent);
  onStage('PREVIEW_CREATION_RECEIPT');const prerequisite=await prior(client,input);
  onStage('PREVIEW_CLONE_IDENTITY');const identity=await identityCheck(client,input.manifest,{command:'contribute',target:input.action.to,actor:input.action.from,args:input.action.args,expectedTemplate:input.action.template,expectedCodeHash:input.manifest.vault.codeHash});
  onStage('PREVIEW_ORDER_PROTOCOL');const protocol=await protocolCheck(client,input.envelope);need(protocol.executable===true&&same(protocol.orderHash,input.action.orderHash),'ORDER_NOT_EXECUTABLE');
  onStage('PREVIEW_FUNDING_STATE');const before=await observeBefore(client,input);
  onStage('PREVIEW_GAS_PRICE');const gasPrice=await client.getGasPrice();need(gasPrice>0n,'INVALID_GAS_PRICE');const request={account:input.action.from,to:input.action.to,data:input.action.data,value:VALUE,gasPrice};
  onStage('PREVIEW_ESTIMATE_GAS');const estimate=await client.estimateGas(request),gas=(estimate*120n+99n)/100n,maxFee=gas*gasPrice;need(gas>0n&&gas<=6000000n,'CONTRIBUTION_GAS_LIMIT_EXCEEDED');need(BigInt(before.balanceWei)>=VALUE+maxFee,'CREATOR_PRINCIPAL_AND_GAS_BALANCE_INSUFFICIENT');
  onStage('PREVIEW_BOUNDED_CALL');await client.call({...request,gas});
  return {schemaVersion:1,status:'FROZEN_UNSIGNED_CREATOR_CONTRIBUTION_PLAN',sessionFile:input.sessionFile,sessionHash:input.sessionHash,fundingToolHash:input.toolHash,poolToolHash:input.poolToolHash,sellerRuntimeToolHash:input.sellerToolHash,bindings:input.bindings,...rpcContext(),rpcMode:input.rpcMode??rpcContext().rpcMode,primaryEndpoint:input.primaryEndpoint??rpcContext().primaryEndpoint,independentEndpoint:input.independentEndpoint??rpcContext().independentEndpoint,step:STEP,chainId:56,...input.action,args:undefined,gasEstimate:String(estimate),gas:String(gas),gasPrice:String(gasPrice),maxFeeWei:String(maxFee),maxFeeBNB:formatEther(maxFee),maximumSpendWei:String(VALUE+maxFee),before,prerequisite,identity,protocol,consequence:'Pay 0.20301 BNB principal for IDs 1 through 67 to the frozen public pool. The plan requires an empty pool and expects FUNDING with 67 shares afterwards. requireCompletion=false does not prevent purchase: another participant can fund the other 33 IDs before inclusion, making this transaction complete and purchase the miner. Repeated preflight and strict receipt checks detect state changes but cannot remove that on-chain race. Principal plus gas count toward the cumulative budget.'};
}
export function assertPlanUnchanged(a,b){
  for(const field of ['sessionHash','fundingToolHash','poolToolHash','sellerRuntimeToolHash','rpcMode','primaryEndpoint','independentEndpoint','step','chainId','from','to','valueWei','nonce','data','dataHash','pool','template','configHash','termsHash','payloadHash','orderHash','requireCompletion','gasEstimate','gas','gasPrice','maxFeeWei','maximumSpendWei'])need(String(a[field])===String(b[field]),'REVIEWED_CONTRIBUTION_CHANGED');
  need(sameIds(a.ids,b.ids)&&serial(a.bindings)===serial(b.bindings)&&serial(a.prerequisite)===serial(b.prerequisite),'FROZEN_CONTRIBUTION_EVIDENCE_CHANGED');
  for(const field of ['latestNonce','pendingNonce','vaultNativeWei','state','soldCount','fundedWei','totalPrincipalIn','totalPrincipalRefunded','purchaseSpent','soldBitmap','marketStatus','owner','approved','approvedAll','counter','orderHash'])need(String(a.before[field])===String(b.before[field]),'FROZEN_FUNDING_STATE_CHANGED');need(serial(a.before.shares)===serial(b.before.shares)&&serial(a.before.costs)===serial(b.before.costs)&&serial(a.before.orderStatus)===serial(b.before.orderStatus),'FROZEN_SHARES_OR_ORDER_CHANGED');
}
export function checkContributionEvents(receipt,input){
  need(receipt.logs.every(log=>log.removed!==true&&same(log.transactionHash,receipt.transactionHash)&&same(log.blockHash,receipt.blockHash)),'RECEIPT_LOG_IDENTITY_MISMATCH');
  const events=parseEventLogs({abi:input.vaultAbi,logs:receipt.logs.filter(log=>same(log.address,input.action.pool)),strict:true}),contributions=events.filter(e=>e.eventName==='Contributed'),transfers=events.filter(e=>e.eventName==='TransferSingle'||e.eventName==='TransferBatch');
  need(contributions.length===1,'EXACT_CONTRIBUTION_EVENT_REQUIRED');const c=contributions[0].args;need(same(c.participant,input.action.from)&&sameIds(c.ids,IDS)&&c.principal===VALUE&&c.soldCount===67n,'CONTRIBUTION_EVENT_MISMATCH');
  need(transfers.length===1&&transfers[0].eventName==='TransferBatch','EXACT_BATCH_MINT_REQUIRED');const t=transfers[0].args;need(same(t.operator,input.action.from)&&same(t.from,zeroAddress)&&same(t.to,input.action.from)&&sameIds(t.ids,IDS)&&t.values.length===67&&t.values.every(n=>n===1n),'CONTRIBUTION_MINT_MISMATCH');
  need(!events.some(e=>['Purchased','Withdrawn','IdReleased','FundingTerminated','Redeemed'].includes(e.eventName)),'UNEXPECTED_PURCHASE_OR_SHARE_OPERATION');
  return {checks:{exactContribution:true,exact67ShareMint:true,noPurchase:true,receiptLogsCanonical:true},events:events.map(e=>({eventName:e.eventName,args:e.args,logIndex:e.logIndex}))};
}
export async function verifyContributed(client,input,entry,{identityCheck=verifyLiveIdentity,postconditions=checkReceiptPostconditions,onReceipt=async()=>{}}={}){
  const {action}=input,report=await verifyReceipt(client,{transactionHash:entry.transactionHash,from:action.from,to:action.to,valueWei:String(VALUE),dataHash:action.dataHash,minimumConfirmations:CONFIRMATIONS});need(report.status==='RECEIPT_MATCHED_BUSINESS_UNVERIFIED',report.reasonCode??'CONTRIBUTION_RECEIPT_UNVERIFIED');
  const tx=await client.getTransaction({hash:entry.transactionHash});need(tx.nonce===action.nonce&&tx.gas===BigInt(entry.gas)&&tx.gasPrice===BigInt(entry.gasPrice)&&report.actualGas.feeWei<=BigInt(entry.maxFeeWei),'CONTRIBUTION_RECEIPT_FROZEN_FIELDS_CHANGED');
  await onReceipt({receipt:report.receipt,actualGasFeeWei:String(report.actualGas.feeWei),actualPrincipalWei:String(VALUE)});
  const receipt=report.receipt,events=checkContributionEvents(receipt,input),basic=await postconditions(client,'contribute',action.to,action.from,action.args,receipt);need(basic.verified,'CONTRIBUTION_BASIC_POSTCONDITIONS_FAILED');
  const at={blockNumber:receipt.blockNumber},read=(functionName,args=[])=>client.readContract({address:action.pool,abi:input.vaultAbi,functionName,args,...at});
  const [fields,shares,vaultNative,owner,code,isPool]=await Promise.all([Promise.all(['state','soldCount','fundedWei','totalPrincipalIn','totalPrincipalRefunded','purchaseSpent','soldBitmap'].map(name=>read(name))),shareState(client,input,receipt.blockNumber),client.getBalance({address:action.pool,...at}),client.readContract({address:input.session.collection,abi:NFT_ABI,functionName:'ownerOf',args:[3204n],...at}),client.getCode({address:action.pool,...at}),client.readContract({address:input.manifest.factory.address,abi:input.factoryAbi,functionName:'isPool',args:[action.pool],...at})]);
  need(Number(fields[0])===0&&BigInt(fields[1])===67n&&fields[2]===VALUE&&fields[3]===VALUE&&fields[4]===0n&&fields[5]===0n&&fields[6]===(1n<<67n)-1n&&vaultNative===VALUE&&same(owner,input.session.seller),'CONTRIBUTION_FUNDING_STATE_MISMATCH');assertShares(shares,67,action.from);need(isPool===true&&same(code,cloneRuntime(action.template))&&same(keccak256(code),input.manifest.vault.codeHash),'CONTRIBUTION_CLONE_IDENTITY_MISMATCH');
  const identity=await identityCheck(client,input.manifest,{command:'contribute',target:action.pool,actor:action.from,args:action.args,expectedTemplate:action.template,expectedCodeHash:input.manifest.vault.codeHash});need(same((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash),'CONTRIBUTION_RECEIPT_BLOCK_CHANGED');
  return {...entry,status:'CONFIRMED',receipt:report.receipt,actualGasFeeWei:String(report.actualGas.feeWei),actualPrincipalWei:String(VALUE),after:{pool:action.pool,state:0,soldCount:'67',fundedWei:String(VALUE),totalPrincipalIn:String(VALUE),totalPrincipalRefunded:'0',purchaseSpent:'0',soldBitmap:String((1n<<67n)-1n),vaultNativeWei:String(vaultNative),nftOwner:owner,shares,identity,events,postconditions:basic}};
}
export function assertFundingLedger(journal,ledger,input){
  validateBudget(ledger);need(journal?.schemaVersion===1&&journal.chainId===56&&same(journal.sessionHash,input.sessionHash)&&Array.isArray(journal.steps)&&journal.steps.length<=1,'FUNDING_JOURNAL_SESSION_MISMATCH');
  const entry=journal.steps[0],reserved=ledger.reservations.filter(r=>r.reservationId===reservationId(input));if(!entry){need(reserved.length===0,'ORPHAN_FUNDING_RESERVATION');return;}
  need(entry.step===STEP&&['RESERVED_BEFORE_SIGNATURE','SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN','SUBMITTED','CONFIRMED'].includes(entry.status)&&entry.nonce===input.action.nonce&&same(entry.to,input.action.to)&&same(entry.dataHash,input.action.dataHash)&&same(entry.pool,input.action.pool)&&entry.valueWei===String(VALUE)&&HASH.test(entry.planHash)&&entry.reservationId===reservationId(input),'FUNDING_JOURNAL_BINDING_MISMATCH');
  need(entry.status==='RESERVED_BEFORE_SIGNATURE'?!entry.transactionHash:HASH.test(entry.transactionHash??''),'FUNDING_SIGNED_HASH_STATE_MISMATCH');need(reserved.length===1,'FUNDING_RESERVATION_MISSING_OR_DUPLICATE');const r=reserved[0];need(same(r.bundleHash,input.sessionHash)&&same(r.initCodeHash,entry.dataHash)&&r.operation===STEP&&same(r.sender,input.action.from)&&r.nonce===String(entry.nonce)&&r.valueWei===String(VALUE)&&r.maxFeeWei===entry.maxFeeWei,'FUNDING_BUDGET_BINDING_MISMATCH');
}
async function directories(){for(const relative of ['mainnet-funding','mainnet-funding/plans','mainnet-funding/transactions']){const directory=path.join(ROOT,relative);try{await fs.mkdir(directory,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}const stat=await fs.lstat(directory);need(stat.isDirectory()&&!stat.isSymbolicLink()&&await fs.realpath(directory)===directory,'FUNDING_DIRECTORY_SYMLINK_REFUSED');}}
async function loadJournal(input){try{return (await readConfinedJson(journalPath(input.sessionHash))).value;}catch(e){if(e.code==='ENOENT')return {schemaVersion:1,chainId:56,sessionHash:input.sessionHash,steps:[]};throw e;}}
async function loadPlan(hash,input){need(HASH.test(hash??''),'REVIEWED_PLAN_HASH_REQUIRED');const p=await hashedFile(planPath(hash),hash);need(p.value.status==='FROZEN_UNSIGNED_CREATOR_CONTRIBUTION_PLAN'&&same(p.value.sessionHash,input.sessionHash)&&p.value.fundingToolHash===input.toolHash&&p.value.poolToolHash===input.poolToolHash&&p.value.sellerRuntimeToolHash===input.sellerToolHash,'REVIEWED_PLAN_SOURCE_CHANGED');return p.value;}

export async function main(argv=process.argv.slice(2)){
  let unlock,stage='ARGUMENTS',entry,input;
  const onStage=value=>{stage=value;};
  try{
    const options=argumentsFor(argv);if(options.help){console.log('Default read-only: node --import tsx mainnet-funding/creator-contribute.mjs --env ../.env --session mainnet-test/session.json [--public-rpc-fallback]. Only creator-contribute (67 shares, 0.20301 BNB principal) is supported. --broadcast requires exact per-step TTY, --reviewed-plan-hash, --max-tx-fee-bnb, --max-total-spend-bnb and MODE=live ALLOW_LIVE_SEND=true LIVE_RELEASE_VERIFIED=true. --reconcile reads the recorded hash only.');return 0;}
    const limits=options.broadcast?humanGates(options,process.env,Boolean(process.stdin.isTTY&&process.stdout.isTTY)):null;
    stage='LOAD_FROZEN_INPUTS';input=await loadInput(options);const {BSC_RPC_URL:frozenEnvRpc}=await onlyEnvFields(options.envFile,['BSC_RPC_URL']),{selectedRpc}=selectRpc(options,frozenEnvRpc),client=readClient(selectedRpc);
    stage='LOAD_JOURNAL_AND_BUDGET';await directories();unlock=await acquireDeploymentLock();let journal=await loadJournal(input),ledger=await readBudget();assertFundingLedger(journal,ledger,input);entry=journal.steps[0];
    if(options.reconcile||entry){need(entry?.transactionHash,'RECORDED_HASH_REQUIRED_NO_NEW_SIGNATURE');await chainIdentity(client,input);await previousCheck(client,input);const p=await hashedFile(planPath(entry.planHash),entry.planHash);need(p.value.sessionHash===input.sessionHash&&p.value.dataHash===input.action.dataHash&&p.value.valueWei===String(VALUE)&&p.value.gas===entry.gas&&p.value.gasPrice===entry.gasPrice&&p.value.maxFeeWei===entry.maxFeeWei,'RECORDED_CONTRIBUTION_PLAN_CHANGED');stage='RECONCILE_RECORDED_HASH';const verified=await verifyContributed(client,input,entry,{onReceipt:async evidence=>{Object.assign(entry,evidence);assertFundingLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);}});journal.steps[0]=verified;assertFundingLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);console.log(json({status:'RECONCILED_NO_SEND',transactionHash:entry.transactionHash,journalFile:journalPath(input.sessionHash),after:verified.after}));return 0;}
    const fresh=await preview(client,input,{onStage});assertInputUnchanged(input,await loadInput(options));
    if(!options.broadcast){stage='SAVE_READ_ONLY_PLAN';const planHash=keccak256(Buffer.from(json(fresh)));await writeAtomic(planPath(planHash),fresh);console.log(json({status:'READ_ONLY_PLAN',planHash,planFile:planPath(planHash),...fresh,spentAndReservedWei:ledger.spentAndReservedWei,expectedReservedAfterWei:String(BigInt(ledger.spentAndReservedWei)+VALUE+BigInt(fresh.maxFeeWei)),transactionsSent:0}));return 0;}
    stage='COMPARE_REVIEWED_PLAN';const frozen=await loadPlan(options.reviewedPlanHash,input);assertPlanUnchanged(frozen,fresh);need(BigInt(frozen.maxFeeWei)<=limits.maxTxWei&&BigInt(ledger.spentAndReservedWei)+VALUE+BigInt(frozen.maxFeeWei)<=limits.maxTotalWei,'CONTRIBUTION_PRINCIPAL_AND_GAS_BUDGET_EXCEEDED');
    const confirmation=`SEND creator-contribute 56 ${frozen.from} ${frozen.to} ${frozen.valueWei} IDS1-67 COMPLETION_FALSE ${frozen.dataHash} ${options.reviewedPlanHash} ${frozen.maxFeeWei} ${frozen.rpcMode}`;
    console.log(json({status:'LIVE_HUMAN_CONFIRMATION_REQUIRED',...frozen,planHash:options.reviewedPlanHash,spentAndReservedWei:ledger.spentAndReservedWei,expectedReservedAfterWei:String(BigInt(ledger.spentAndReservedWei)+VALUE+BigInt(frozen.maxFeeWei))}));console.log('Paste the complete exact line to sign and send this one 0.20301 BNB creator contribution:\n'+confirmation);stage='HUMAN_CONFIRMATION';const rl=createInterface({input:process.stdin,output:process.stdout});let answer;try{answer=await rl.question('> ');}finally{rl.close();}need(answer===confirmation,'CONFIRMATION_NOT_ACCEPTED_NO_SEND');
    stage='RECHECK_AFTER_CONFIRMATION';const latest=await loadInput(options);assertInputUnchanged(input,latest);assertRpcUnchanged(frozenEnvRpc,(await onlyEnvFields(options.envFile,['BSC_RPC_URL'])).BSC_RPC_URL);assertPlanUnchanged(frozen,await loadPlan(options.reviewedPlanHash,latest));assertPlanUnchanged(frozen,await preview(client,latest,{onStage}));
    stage='RELOAD_BUDGET_AND_JOURNAL';journal=await loadJournal(input);ledger=await readBudget();assertFundingLedger(journal,ledger,input);need(journal.steps.length===0,'FUNDING_STEP_ALREADY_RECORDED');
    entry={step:STEP,status:'RESERVED_BEFORE_SIGNATURE',nonce:frozen.nonce,to:frozen.to,pool:frozen.pool,valueWei:String(VALUE),dataHash:frozen.dataHash,planHash:options.reviewedPlanHash,reservationId:reservationId(input),gas:frozen.gas,gasPrice:frozen.gasPrice,maxFeeWei:frozen.maxFeeWei,fundingToolHash:input.toolHash,poolToolHash:input.poolToolHash,sellerRuntimeToolHash:input.sellerToolHash,rpcMode:frozen.rpcMode,primaryEndpoint:frozen.primaryEndpoint,independentEndpoint:frozen.independentEndpoint};
    stage='RESERVE_BUDGET';const transactionHash=await sendRecordedOnce({reservation:()=>reserveBudget({id:entry.reservationId,operation:STEP,nonce:entry.nonce,sender:frozen.from,valueWei:VALUE,maxFeeWei:entry.maxFeeWei,maxTotalWei:limits.maxTotalWei,bundleHash:input.sessionHash,initCodeHash:frozen.dataHash}),saveReserved:async()=>{stage='SAVE_RESERVATION';journal.steps.push(entry);assertFundingLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);},
      sign:async()=>{stage='SIGN_FROZEN_CONTRIBUTION';const fields=await onlyEnvFields(options.envFile,['CREATOR_PRIVATE_KEY']),{privateKeyToAccount}=await import('viem/accounts'),key=fields.CREATOR_PRIVATE_KEY.startsWith('0x')?fields.CREATOR_PRIVATE_KEY:'0x'+fields.CREATOR_PRIVATE_KEY,signer=privateKeyToAccount(key);need(same(signer.address,input.action.from),'CREATOR_PRIVATE_KEY_ADDRESS_MISMATCH');return signer.signTransaction({chainId:56,type:'legacy',nonce:frozen.nonce,to:frozen.to,value:VALUE,data:frozen.data,gas:BigInt(frozen.gas),gasPrice:BigInt(frozen.gasPrice)});},
      saveSigned:async hash=>{stage='SAVE_SIGNED_HASH';Object.assign(entry,{status:'SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN',transactionHash:hash});assertFundingLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);},
      send:async raw=>{stage='RECHECK_BEFORE_SEND';assertInputUnchanged(input,await loadInput(options));assertRpcUnchanged(frozenEnvRpc,(await onlyEnvFields(options.envFile,['BSC_RPC_URL'])).BSC_RPC_URL);assertPlanUnchanged(frozen,await preview(client,input,{onStage}));stage='VERIFY_RECORDED_SIGNED_HASH';const recorded=await loadJournal(input);assertFundingLedger(recorded,await readBudget(),input);need(serial(recorded.steps[0])===serial(entry),'RECORDED_FUNDING_ENTRY_CHANGED');assertInputUnchanged(input,await loadInput(options));assertRpcUnchanged(frozenEnvRpc,(await onlyEnvFields(options.envFile,['BSC_RPC_URL'])).BSC_RPC_URL);stage='FINAL_CREATOR_NONCE_CHECK';const [latestNonce,pendingNonce]=await Promise.all([client.getTransactionCount({address:frozen.from,blockTag:'latest'}),client.getTransactionCount({address:frozen.from,blockTag:'pending'})]);need(latestNonce===frozen.nonce&&pendingNonce===frozen.nonce,'CREATOR_NONCE_CHANGED_OR_PENDING');stage='SEND_RAW_CONTRIBUTION_ONCE';return createWalletClient({transport:http(selectedRpc,{retryCount:0,timeout:20000})}).sendRawTransaction({serializedTransaction:raw});},
    });stage='SAVE_SUBMITTED_HASH';entry.status='SUBMITTED';await writeAtomic(journalPath(input.sessionHash),journal);console.log(json({status:'SUBMITTED',transactionHash,step:STEP}));
    stage='WAIT_CANONICAL_RECEIPT';await client.waitForTransactionReceipt({hash:transactionHash,confirmations:CONFIRMATIONS,timeout:60000,pollingInterval:1500});stage='VERIFY_CONTRIBUTION_RECEIPT';await chainIdentity(client,input);const verified=await verifyContributed(client,input,entry,{onReceipt:async evidence=>{Object.assign(entry,evidence);assertFundingLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);}});journal.steps[0]=verified;assertFundingLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);console.log(json({status:'CONFIRMED',transactionHash,journalFile:journalPath(input.sessionHash),after:verified.after}));return 0;
  }catch(error){console.error(json({status:entry?'STOPPED_RECONCILE_ONLY':'STOPPED',step:STEP,...safeDiagnostic(error,stage),transactionHash:entry?.transactionHash??null,journalFile:input?journalPath(input.sessionHash):null,automaticBroadcastRetry:false,note:'No automatic retry or budget release. A recorded hash is reconciled only; a reserved operation without a hash requires manual investigation.'}));return 1;}finally{if(unlock)await unlock();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;}).catch(()=>{console.error(json({status:'STOPPED',reason:'DETAILS_REDACTED',automaticBroadcastRetry:false}));process.exitCode=1;});
