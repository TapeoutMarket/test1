#!/usr/bin/env node
// Human-operated creation of the existing, frozen mainnet session's single pool.
// This directory does not modify or redeploy the Factory, governance, or seller tooling.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {createPublicClient,createWalletClient,custom,http,encodeFunctionData,encodeAbiParameters,getContractAddress,keccak256,parseAbi,parseEventLogs,formatEther} from 'viem';
import {ROOT,ACCOUNTS,guardedProvider,json} from '../live-test/preflight.mjs';
import {currentVerificationHash} from '../live-test/prepare-deployments.mjs';
import {readConfinedJson,writeAtomic,acquireDeploymentLock,readBudget,reserveBudget,validateBudget,bootstrapToolHash} from '../live-test/deployment-io.mjs';
import {assertRpcUnchanged,sendRecordedOnce} from '../live-test/deploy-mainnet.mjs';
import {verifyReceipt} from '../live-test/verify-receipt.mjs';
import {humanGates,rpcContext,selectRpc,safeDiagnostic,senderToolHash,actionFor as sellerActionFor,assertLedgerMatches as assertSellerLedger,chainIdentity} from '../mainnet-test/send-step.mjs';
import {loadArtifact,buildTerms,configurationHash} from '../sdk/contracts.ts';
import {parseOrderEnvelope} from '../sdk/order-envelope.ts';
import {loadLiveManifest,verifyLiveIdentity,cloneRuntime} from '../sdk/live-identity.ts';
import {checkProtocol} from '../sdk/protocol.ts';
import {checkReceiptPostconditions} from '../sdk/postconditions.ts';
import {seaportAbi} from '../scripts/fork-create-order.mjs';

const need=(ok,code)=>{if(!ok)throw new Error(code);};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const HASH=/^0x[0-9a-fA-F]{64}$/;
const UINT=/^(0|[1-9][0-9]*)$/;
const SESSION_HASH='0xa058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c';
const FACTORY='0x4c680b72D3561D7649E3DF85E78fb588FCFf9DB1';
const POOL='0xbdaacdAb0f95cC82FE32d92DEa04C3dcBFc80F9A';
const TEMPLATE='0x91Dda15869D9A9261799ebFA1126Cf9DFaC0D43a';
const CREATE_DATA_HASH='0xf14c984f3e1de0f02811289d31eb755844b33b0df31a2002e349d4540879375f';
const CONFIRMATIONS=15;
const STEP='create-pool';
const NFT_ABI=parseAbi(['function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)']);
const journalPath=hash=>`mainnet-pool/transactions/${hash.slice(2)}.json`;
const planPath=hash=>`mainnet-pool/plans/create-pool-${hash.slice(2)}.json`;
const reservationId=input=>`pool-${input.sessionHash.slice(2)}-create-pool`;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const serial=value=>json(value);

export function argumentsFor(argv){
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const flags=new Set(['--broadcast','--reconcile','--public-rpc-fallback']),fields=new Set(['--env','--session','--step','--reviewed-plan-hash','--max-tx-fee-bnb','--max-total-spend-bnb']),v={};
  for(let i=0;i<argv.length;i++){const flag=argv[i];need(!Object.hasOwn(v,flag),'DUPLICATE_ARGUMENT');if(flags.has(flag))v[flag]=true;else{need(fields.has(flag)&&argv[i+1]&&!argv[i+1].startsWith('--'),'INVALID_ARGUMENT');v[flag]=argv[++i];}}
  need(v['--env']&&v['--session'],'EXPLICIT_ENV_AND_SESSION_REQUIRED');need(!v['--step']||v['--step']===STEP,'ONLY_CREATE_POOL_SUPPORTED');need(!(v['--broadcast']&&v['--reconcile']),'BROADCAST_AND_RECONCILE_ARE_EXCLUSIVE');
  if(v['--broadcast'])need(HASH.test(v['--reviewed-plan-hash']??''),'REVIEWED_PLAN_HASH_REQUIRED');
  return {step:STEP,envFile:v['--env'],sessionFile:v['--session'],broadcast:!!v['--broadcast'],reconcile:!!v['--reconcile'],publicRpcFallback:!!v['--public-rpc-fallback'],reviewedPlanHash:v['--reviewed-plan-hash'],maxTx:v['--max-tx-fee-bnb'],maxTotal:v['--max-total-spend-bnb']};
}

export async function poolToolHash(){
  const directory=path.join(ROOT,'mainnet-pool'),records=[];need(await fs.realpath(directory)===directory,'POOL_TOOL_DIRECTORY_SYMLINK_REFUSED');
  for(const name of (await fs.readdir(directory)).filter(n=>n.endsWith('.mjs')&&!n.endsWith('.test.mjs')).sort()){const file=path.join(directory,name),stat=await fs.lstat(file);need(stat.isFile()&&!stat.isSymbolicLink(),'POOL_TOOL_SYMLINK_REFUSED');const bytes=await fs.readFile(file);records.push({path:'mainnet-pool/'+name,sha256:sha(bytes),bytes:bytes.length});}
  need(records.some(r=>r.path==='mainnet-pool/create-pool.mjs'),'POOL_TOOL_MISSING');return sha(JSON.stringify(records));
}

export function buildAction(session,manifest,envelope,factoryAbi){
  sellerActionFor(session,'seller-validate');
  need(same(session.creator,ACCOUNTS.creator)&&same(manifest.factory.address,FACTORY)&&same(session.governanceAddresses.factory,FACTORY)&&same(manifest.template.address,TEMPLATE)&&same(session.governanceAddresses.template,TEMPLATE)&&same(session.pool.address,POOL)&&same(manifest.vault.address,POOL),'FIXED_EXISTING_FACTORY_POOL_REQUIRED');
  need(same(manifest.vault.creator,session.creator)&&String(manifest.vault.round)===String(session.pool.round)&&String(session.pool.round)==='1','CREATOR_OR_ROUND_CHANGED');
  need(same(manifest.network.checkpointHash,session.checkpoint.blockHash)&&manifest.network.checkpointBlock===session.checkpoint.blockNumber,'MANIFEST_CHECKPOINT_CHANGED');
  need(same(envelope.orderHash,session.seaport.orderHash)&&same(envelope.seller,session.seller)&&same(envelope.collection,session.collection)&&String(envelope.tokenId)==='3204'&&same(envelope.market,session.market)&&String(envelope.buyerPaysWei)==='303000000000000000','ORDER_SCOPE_CHANGED');
  need(serial(envelope.seaport.parameters)===serial(session.order.parameters)&&envelope.seaport.signature==='0x','FROZEN_ORDER_PARAMETERS_CHANGED');
  const built=buildTerms(envelope,manifest.config,BigInt(session.fundingDeadline),session.pool.name,''),args=[manifest.template.address,built.configHash,built.terms,built.payload,BigInt(session.pool.round)];
  need(same(built.configHash,manifest.configHash)&&same(built.termsHash,manifest.vault.termsHash)&&same(built.termsHash,session.pool.termsHash)&&same(keccak256(built.payload),manifest.vault.payloadHash)&&same(keccak256(built.payload),session.pool.payloadHash)&&same(built.payload,session.pool.payload),'FROZEN_POOL_TERMS_OR_PAYLOAD_CHANGED');
  const data=encodeFunctionData({abi:factoryAbi,functionName:'createPool',args}),supplied=encodeFunctionData({abi:factoryAbi,functionName:'createPool',args:session.pool.createArgs});
  need(same(data,supplied),'FROZEN_CREATE_ARGUMENTS_CHANGED');need(same(keccak256(data),CREATE_DATA_HASH),'FIXED_CREATE_CALLDATA_CHANGED');
  const nonce=session.steps?.[STEP]?.nonce;need(UINT.test(String(nonce))&&BigInt(nonce)<=BigInt(Number.MAX_SAFE_INTEGER)&&session.steps[STEP].requiresStep==='seller-validate','FIXED_CREATOR_NONCE_REQUIRED');
  const salt=keccak256(encodeAbiParameters([{type:'uint256'},{type:'address'},{type:'address'},{type:'bytes32'},{type:'bytes32'},{type:'bytes32'},{type:'uint256'}],[56n,session.creator,TEMPLATE,built.configHash,built.termsHash,keccak256(built.payload),BigInt(session.pool.round)]));
  const cloneCreation=`0x3d602d80600a3d3981f3${cloneRuntime(TEMPLATE).slice(2)}`,predicted=getContractAddress({opcode:'CREATE2',from:FACTORY,salt,bytecode:cloneCreation});
  need(same(predicted,POOL),'LOCAL_PREDICTED_POOL_MISMATCH');
  return {step:STEP,from:session.creator,to:FACTORY,valueWei:'0',nonce:Number(nonce),data,dataHash:keccak256(data),args,pool:POOL,template:TEMPLATE,configHash:built.configHash,termsHash:built.termsHash,payloadHash:keccak256(built.payload),salt,round:String(session.pool.round),orderHash:envelope.orderHash};
}

async function hashedFile(file,expected){const result=await readConfinedJson(file);need(!expected||same(keccak256(result.raw),expected),'FROZEN_PUBLIC_INPUT_CHANGED');return {...result,hash:keccak256(result.raw)};}
export async function loadInput(options){
  const s=await hashedFile(options.sessionFile,SESSION_HASH),session=s.value;
  const [m,e,c,g,factory,vault,toolHash,sellerToolHash,core,bootstrap,rawFactory,rawVault]=await Promise.all([loadLiveManifest(session.manifestPath,session.manifestHash),hashedFile(session.orderEnvelopePath,session.orderEnvelopeHash),hashedFile(session.configPath),hashedFile(session.governanceInspectionPath,session.governanceInspectionHash),loadArtifact('GroupBuyFactory'),loadArtifact('GroupBuyVault'),poolToolHash(),senderToolHash(),currentVerificationHash(),bootstrapToolHash(),hashedFile('out/GroupBuyFactory.sol/GroupBuyFactory.json'),hashedFile('out/GroupBuyVault.sol/GroupBuyVault.json')]);
  need(core===session.coreVerificationInputHash&&bootstrap===session.bootstrapToolHash,'FROZEN_CORE_OR_BOOTSTRAP_CHANGED');
  need(serial(factory.abi)===serial(rawFactory.value.abi)&&serial(vault.abi)===serial(rawVault.value.abi),'ARTIFACT_CHANGED_DURING_INPUT_READ');
  need(same(configurationHash(c.value),m.manifest.configHash)&&serial(c.value)===serial(m.manifest.config),'FROZEN_CONFIG_CHANGED');
  need(g.value.status==='ALREADY_EXECUTED'&&same(g.value.operationId,session.governanceOperationId)&&same(g.value.roleHistory?.reportHash,m.manifest.governance.roleAuditReportHash),'FROZEN_GOVERNANCE_EVIDENCE_CHANGED');
  const envelope=parseOrderEnvelope(e.value),action=buildAction(session,m.manifest,envelope,factory.abi);
  const bindings={coreVerificationInputHash:core,bootstrapToolHash:bootstrap,manifestHash:m.manifestHash,orderEnvelopeHash:e.hash,configFileHash:c.hash,governanceInspectionHash:g.hash,factoryArtifactHash:rawFactory.hash,vaultArtifactHash:rawVault.hash,factoryAbiHash:keccak256(Buffer.from(serial(factory.abi))),vaultAbiHash:keccak256(Buffer.from(serial(vault.abi)))};
  return {session,sessionHash:s.hash,sessionFile:options.sessionFile,manifest:m.manifest,envelope,action,factoryAbi:factory.abi,vaultAbi:vault.abi,toolHash,sellerToolHash,bindings,...rpcContext(options)};
}
function assertInputUnchanged(a,b){need(a.sessionHash===b.sessionHash&&a.toolHash===b.toolHash&&a.sellerToolHash===b.sellerToolHash&&a.action.dataHash===b.action.dataHash&&serial(a.bindings)===serial(b.bindings)&&a.rpcMode===b.rpcMode&&a.primaryEndpoint===b.primaryEndpoint&&a.independentEndpoint===b.independentEndpoint,'LOCAL_INPUT_CHANGED_REPLAN_REQUIRED');}
const readClient=url=>{assertRpcUnchanged(url,url);return createPublicClient({transport:custom(guardedProvider(http(url,{retryCount:0,timeout:20000})({})),{retryCount:0})});};
async function onlyEnvFields(file,names){
  const expected=path.resolve(ROOT,'../.env'),stat=await fs.lstat(expected),actual=await fs.realpath(path.resolve(ROOT,file));need(stat.isFile()&&!stat.isSymbolicLink()&&actual===expected,'ONLY_CURRENT_WORKSPACE_ENV_SUPPORTED');
  const raw=await fs.readFile(actual,'utf8'),result={};for(const name of names){const rows=raw.split(/\r?\n/).filter(line=>new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=').test(line));need(rows.length===1,'ONE_REQUIRED_ENV_ASSIGNMENT_EXPECTED');result[name]=parseEnv(rows[0])[name];}return result;
}

export async function previousCheck(client,input){
  const {value:journal}=await readConfinedJson(`mainnet-test/transactions/${input.sessionHash.slice(2)}.json`);assertSellerLedger(journal,await readBudget(),input);
  const results=[];
  for(const step of ['seller-approve','seller-validate']){
    const entry=journal.steps.find(e=>e.step===step),action=sellerActionFor(input.session,step);need(entry?.status==='CONFIRMED'&&HASH.test(entry.transactionHash),'CONFIRMED_SELLER_PREREQUISITE_REQUIRED');
    const p=await hashedFile(`mainnet-test/plans/${step}-${entry.planHash.slice(2)}.json`,entry.planHash);
    need(same(p.value.sessionHash,input.sessionHash)&&same(p.value.dataHash,action.dataHash)&&p.value.nonce===action.nonce&&p.value.runtimeToolHash===entry.runtimeToolHash,'SELLER_PREREQUISITE_PLAN_MISMATCH');
    const verified=await verifyReceipt(client,{transactionHash:entry.transactionHash,from:action.from,to:action.to,valueWei:'0',dataHash:action.dataHash,minimumConfirmations:CONFIRMATIONS});
    need(verified.status==='RECEIPT_MATCHED_BUSINESS_UNVERIFIED',verified.reasonCode??'SELLER_PREREQUISITE_RECEIPT_UNVERIFIED');
    const tx=await client.getTransaction({hash:entry.transactionHash});need(tx.nonce===action.nonce&&tx.gas===BigInt(p.value.gas)&&tx.gasPrice===BigInt(p.value.gasPrice)&&verified.actualGas.feeWei<=BigInt(p.value.maxFeeWei),'SELLER_PREREQUISITE_TRANSACTION_CHANGED');
    results.push({step,transactionHash:entry.transactionHash,planHash:entry.planHash,blockNumber:String(verified.receipt.blockNumber),blockHash:verified.receipt.blockHash});
  }
  return results;
}

export async function observeBefore(client,input){
  const {session,action,factoryAbi}=input,block=await client.getBlock({blockTag:'latest'});need(typeof block.number==='bigint'&&HASH.test(block.hash),'LATEST_BLOCK_UNAVAILABLE');const at={blockNumber:block.number};
  const rf=(functionName,args=[])=>client.readContract({address:action.to,abi:factoryAbi,functionName,args,...at});
  const [latestNonce,pendingNonce,balance,creatorCode,poolCode,isPool,salt,predicted,owner,approved,approvedAll,information,counter,orderHash,status]=await Promise.all([
    client.getTransactionCount({address:action.from,blockTag:'latest'}),client.getTransactionCount({address:action.from,blockTag:'pending'}),client.getBalance({address:action.from,...at}),client.getCode({address:action.from,...at}),client.getCode({address:action.pool,...at}),rf('isPool',[action.pool]),rf('poolSalt',[action.from,...action.args]),rf('predictPool',[action.from,...action.args]),
    ...[['ownerOf',[3204n]],['getApproved',[3204n]],['isApprovedForAll',[session.seller,session.market]]].map(([functionName,args])=>client.readContract({address:session.collection,abi:NFT_ABI,functionName,args,...at})),
    ...[['information',[]],['getCounter',[session.seller]],['getOrderHash',[sellerActionFor(session,'seller-validate').orderComponents]],['getOrderStatus',[action.orderHash]]].map(([functionName,args])=>client.readContract({address:session.market,abi:seaportAbi,functionName,args,...at})),
  ]);
  need(latestNonce===action.nonce&&pendingNonce===action.nonce,'CREATOR_NONCE_CHANGED_OR_PENDING');need(!creatorCode||creatorCode==='0x','CREATOR_MUST_REMAIN_PLAIN_EOA');need((!poolCode||poolCode==='0x')&&isPool===false,'POOL_ALREADY_EXISTS');need(same(salt,action.salt)&&same(predicted,action.pool),'CHAIN_PREDICTION_OR_SALT_CHANGED');
  need(same(owner,session.seller)&&same(approved,session.market)&&approvedAll===false,'MINER_OWNER_OR_APPROVAL_CHANGED');need(information[0]===session.seaport.version&&same(information[1],session.seaport.domainSeparator)&&counter===BigInt(session.seaport.counter)&&same(orderHash,action.orderHash),'SEAPORT_IDENTITY_COUNTER_OR_ORDER_CHANGED');need(status[0]===true&&status[1]===false&&status[2]===0n,'VALIDATED_UNFILLED_ORDER_REQUIRED');
  need(block.timestamp>=BigInt(session.pool.terms.orderStart)&&block.timestamp+300n<BigInt(session.fundingDeadline)&&block.timestamp+300n<BigInt(session.orderExpiresAt),'POOL_DEADLINE_TOO_CLOSE');need(same((await client.getBlock({blockNumber:block.number})).hash,block.hash),'OBSERVATION_BLOCK_CHANGED');
  return {blockNumber:String(block.number),blockHash:block.hash,timestamp:String(block.timestamp),latestNonce,pendingNonce,balanceWei:String(balance),poolExists:false,salt,predicted,owner,approved,approvedAll,counter:String(counter),orderHash,orderStatus:status.map(x=>typeof x==='bigint'?String(x):x)};
}

export async function preview(client,input,{independent,identityCheck=verifyLiveIdentity,protocolCheck=checkProtocol,previousCheck:prior=previousCheck,chainCheck=chainIdentity,onStage=()=>{}}={}){
  onStage('PREVIEW_CHAIN_IDENTITY');await chainCheck(client,input,independent);
  onStage('PREVIEW_SELLER_RECEIPTS');const prerequisites=await prior(client,input);
  onStage('PREVIEW_FACTORY_IDENTITY');const identity=await identityCheck(client,input.manifest,{command:STEP,target:input.action.to,actor:input.action.from,args:input.action.args,expectedTemplate:input.action.template,expectedCodeHash:input.manifest.factory.codeHash});
  onStage('PREVIEW_ORDER_PROTOCOL');const protocol=await protocolCheck(client,input.envelope);need(protocol.executable===true&&same(protocol.orderHash,input.action.orderHash),'ORDER_NOT_EXECUTABLE');
  onStage('PREVIEW_CREATE_STATE');const before=await observeBefore(client,input);
  onStage('PREVIEW_GAS_PRICE');const gasPrice=await client.getGasPrice();need(gasPrice>0n,'INVALID_GAS_PRICE');
  const request={account:input.action.from,to:input.action.to,data:input.action.data,value:0n,gasPrice};
  onStage('PREVIEW_ESTIMATE_GAS');const estimate=await client.estimateGas(request),gas=(estimate*120n+99n)/100n,maxFee=gas*gasPrice;need(gas>0n&&gas<=2000000n,'CREATE_POOL_GAS_LIMIT_EXCEEDED');need(BigInt(before.balanceWei)>=maxFee,'CREATOR_GAS_BALANCE_INSUFFICIENT');
  onStage('PREVIEW_BOUNDED_CALL');await client.call({...request,gas});
  return {schemaVersion:1,status:'FROZEN_UNSIGNED_CREATE_POOL_PLAN',sessionFile:input.sessionFile,sessionHash:input.sessionHash,poolToolHash:input.toolHash,sellerRuntimeToolHash:input.sellerToolHash,bindings:input.bindings,...rpcContext(),rpcMode:input.rpcMode??rpcContext().rpcMode,primaryEndpoint:input.primaryEndpoint??rpcContext().primaryEndpoint,independentEndpoint:input.independentEndpoint??rpcContext().independentEndpoint,step:STEP,chainId:56,...input.action,args:undefined,gasEstimate:String(estimate),gas:String(gas),gasPrice:String(gasPrice),maxFeeWei:String(maxFee),maxFeeBNB:formatEther(maxFee),before,prerequisites,identity,protocol,consequence:'Create only the frozen ERC-1167 funding pool using the existing Factory. Value is zero. No share contribution, miner purchase, new Factory deployment, or governance change is included.'};
}
export function assertPlanUnchanged(a,b){
  for(const field of ['sessionHash','poolToolHash','sellerRuntimeToolHash','rpcMode','primaryEndpoint','independentEndpoint','step','chainId','from','to','valueWei','nonce','data','dataHash','pool','template','configHash','termsHash','payloadHash','salt','round','orderHash','gasEstimate','gas','gasPrice','maxFeeWei'])need(String(a[field])===String(b[field]),'REVIEWED_CREATE_TRANSACTION_CHANGED');
  need(serial(a.bindings)===serial(b.bindings)&&serial(a.prerequisites)===serial(b.prerequisites),'FROZEN_CREATE_EVIDENCE_CHANGED');
  for(const field of ['latestNonce','pendingNonce','poolExists','salt','predicted','owner','approved','approvedAll','counter','orderHash'])need(String(a.before[field])===String(b.before[field]),'FROZEN_CREATE_STATE_CHANGED');need(serial(a.before.orderStatus)===serial(b.before.orderStatus),'FROZEN_ORDER_STATUS_CHANGED');
}

export function checkCreationEvents(receipt,input){
  const {action,factoryAbi,vaultAbi}=input;
  need(receipt.logs.every(log=>log.removed!==true&&same(log.transactionHash,receipt.transactionHash)&&same(log.blockHash,receipt.blockHash)),'RECEIPT_LOG_IDENTITY_MISMATCH');
  const created=parseEventLogs({abi:factoryAbi,logs:receipt.logs.filter(l=>same(l.address,action.to)),strict:true}).filter(e=>e.eventName==='PoolCreated');
  need(created.length===1,'CREATE_POOL_EVENT_MISMATCH');const c=created[0].args;
  need(same(c.vault,action.pool)&&same(c.creator,action.from)&&same(c.template,action.template)&&same(c.configHash,action.configHash)&&same(c.termsHash,action.termsHash)&&String(c.round)===action.round&&same(c.salt,action.salt)&&same(c.orderPayload,input.session.pool.payload),'CREATE_POOL_EVENT_MISMATCH');
  const initialized=parseEventLogs({abi:vaultAbi,logs:receipt.logs.filter(l=>same(l.address,action.pool)),strict:true}).filter(e=>e.eventName==='VaultInitialized');
  need(initialized.length===1,'VAULT_INITIALIZED_EVENT_MISMATCH');const v=initialized[0].args;
  need(same(v.factory,action.to)&&same(v.creator,action.from)&&same(v.configHash,action.configHash)&&same(v.termsHash,action.termsHash)&&same(v.payload,input.session.pool.payload),'VAULT_INITIALIZED_EVENT_MISMATCH');
  return {checks:{exactPoolCreated:true,exactVaultInitialized:true,receiptLogsCanonical:true},events:[...created,...initialized].map(e=>({eventName:e.eventName,args:e.args,logIndex:e.logIndex}))};
}

export async function verifyCreated(client,input,entry,{identityCheck=verifyLiveIdentity,postconditions=checkReceiptPostconditions,onReceipt=async()=>{}}={}){
  const {action}=input,report=await verifyReceipt(client,{transactionHash:entry.transactionHash,from:action.from,to:action.to,valueWei:'0',dataHash:action.dataHash,minimumConfirmations:CONFIRMATIONS});
  need(report.status==='RECEIPT_MATCHED_BUSINESS_UNVERIFIED',report.reasonCode??'CREATE_RECEIPT_UNVERIFIED');
  const tx=await client.getTransaction({hash:entry.transactionHash});need(tx.nonce===action.nonce&&tx.gas===BigInt(entry.gas)&&tx.gasPrice===BigInt(entry.gasPrice)&&report.actualGas.feeWei<=BigInt(entry.maxFeeWei),'CREATE_RECEIPT_FROZEN_FIELDS_CHANGED');
  await onReceipt({receipt:report.receipt,actualGasFeeWei:String(report.actualGas.feeWei)});
  const receipt=report.receipt,events=checkCreationEvents(receipt,input);
  const basic=await postconditions(client,STEP,action.to,action.from,action.args,receipt);need(basic.verified,'CREATE_BASIC_POSTCONDITIONS_FAILED');
  const at={blockNumber:receipt.blockNumber},read=(functionName,args=[])=>client.readContract({address:action.pool,abi:input.vaultAbi,functionName,args,...at});
  const [code,isPool,state,soldCount,fundedWei,principal,owner,factory,creator,configHash,termsHash,payload,validator]=await Promise.all([client.getCode({address:action.pool,...at}),client.readContract({address:action.to,abi:input.factoryAbi,functionName:'isPool',args:[action.pool],...at}),read('state'),read('soldCount'),read('fundedWei'),read('totalPrincipalIn'),client.readContract({address:input.session.collection,abi:NFT_ABI,functionName:'ownerOf',args:[3204n],...at}),read('factory'),read('creator'),read('configHash'),read('termsHash'),read('purchasePayload'),read('marketValidator')]);
  need(same(code,cloneRuntime(action.template))&&same(keccak256(code),input.manifest.vault.codeHash),'CREATE_CLONE_RUNTIME_MISMATCH');
  need(isPool===true&&Number(state)===0&&BigInt(soldCount)===0n&&fundedWei===0n&&principal===0n&&same(owner,input.session.seller),'CREATE_INITIAL_FUNDING_STATE_MISMATCH');
  need(same(factory,action.to)&&same(creator,action.from)&&same(configHash,action.configHash)&&same(termsHash,action.termsHash)&&same(keccak256(payload),action.payloadHash)&&same(validator,input.manifest.template.validator.address),'CREATE_VAULT_IDENTITY_MISMATCH');
  // Reading as contribute checks clone, immutable config/origin, locked template and dependencies; this does not send a contribution.
  const identity=await identityCheck(client,input.manifest,{command:'contribute',target:action.pool,actor:action.from,args:[],expectedTemplate:action.template,expectedCodeHash:input.manifest.vault.codeHash});
  need(same((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash),'CREATE_RECEIPT_BLOCK_CHANGED');
  return {...entry,status:'CONFIRMED',receipt:report.receipt,actualGasFeeWei:String(report.actualGas.feeWei),after:{pool:action.pool,registered:true,state:0,soldCount:'0',fundedWei:'0',totalPrincipalIn:'0',nftOwner:owner,runtimeCodeHash:keccak256(code),identity,events,postconditions:basic}};
}

export function assertPoolLedger(journal,ledger,input){
  validateBudget(ledger);need(journal?.schemaVersion===1&&journal.chainId===56&&same(journal.sessionHash,input.sessionHash)&&Array.isArray(journal.steps)&&journal.steps.length<=1,'POOL_JOURNAL_SESSION_MISMATCH');
  const entry=journal.steps[0],reserved=ledger.reservations.filter(r=>r.reservationId===reservationId(input));
  if(!entry){need(reserved.length===0,'ORPHAN_POOL_RESERVATION');return;}
  need(entry.step===STEP&&['RESERVED_BEFORE_SIGNATURE','SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN','SUBMITTED','CONFIRMED'].includes(entry.status)&&entry.nonce===input.action.nonce&&same(entry.to,input.action.to)&&same(entry.dataHash,input.action.dataHash)&&same(entry.pool,input.action.pool)&&HASH.test(entry.planHash)&&entry.reservationId===reservationId(input),'POOL_JOURNAL_BINDING_MISMATCH');
  need(entry.status==='RESERVED_BEFORE_SIGNATURE'?!entry.transactionHash:HASH.test(entry.transactionHash??''),'POOL_SIGNED_HASH_STATE_MISMATCH');
  need(reserved.length===1,'POOL_RESERVATION_MISSING_OR_DUPLICATE');const r=reserved[0];need(same(r.bundleHash,input.sessionHash)&&same(r.initCodeHash,entry.dataHash)&&r.operation===STEP&&same(r.sender,input.action.from)&&r.nonce===String(entry.nonce)&&r.valueWei==='0'&&r.maxFeeWei===entry.maxFeeWei,'POOL_BUDGET_BINDING_MISMATCH');
}
async function directories(){for(const relative of ['mainnet-pool','mainnet-pool/plans','mainnet-pool/transactions']){const directory=path.join(ROOT,relative);try{await fs.mkdir(directory,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}const stat=await fs.lstat(directory);need(stat.isDirectory()&&!stat.isSymbolicLink()&&await fs.realpath(directory)===directory,'POOL_DIRECTORY_SYMLINK_REFUSED');}}
async function loadJournal(input){try{return (await readConfinedJson(journalPath(input.sessionHash))).value;}catch(e){if(e.code==='ENOENT')return {schemaVersion:1,chainId:56,sessionHash:input.sessionHash,steps:[]};throw e;}}
async function loadPlan(hash,input){need(HASH.test(hash??''),'REVIEWED_PLAN_HASH_REQUIRED');const p=await hashedFile(planPath(hash),hash);need(p.value.status==='FROZEN_UNSIGNED_CREATE_POOL_PLAN'&&same(p.value.sessionHash,input.sessionHash)&&p.value.poolToolHash===input.toolHash&&p.value.sellerRuntimeToolHash===input.sellerToolHash,'REVIEWED_PLAN_SOURCE_CHANGED');return p.value;}

export async function main(argv=process.argv.slice(2)){
  let unlock,stage='ARGUMENTS',entry,input;
  const onStage=value=>{stage=value;};
  try{
    const options=argumentsFor(argv);if(options.help){console.log('Default read-only: node --import tsx mainnet-pool/create-pool.mjs --env ../.env --session mainnet-test/session.json [--public-rpc-fallback]. Only create-pool is supported. --broadcast requires exact per-step TTY, --reviewed-plan-hash, --max-tx-fee-bnb, --max-total-spend-bnb and MODE=live ALLOW_LIVE_SEND=true LIVE_RELEASE_VERIFIED=true. --reconcile reads the recorded hash only.');return 0;}
    const limits=options.broadcast?humanGates(options,process.env,Boolean(process.stdin.isTTY&&process.stdout.isTTY)):null;
    stage='LOAD_FROZEN_INPUTS';input=await loadInput(options);const {BSC_RPC_URL:frozenEnvRpc}=await onlyEnvFields(options.envFile,['BSC_RPC_URL']),{selectedRpc}=selectRpc(options,frozenEnvRpc),client=readClient(selectedRpc);
    stage='LOAD_JOURNAL_AND_BUDGET';await directories();unlock=await acquireDeploymentLock();let journal=await loadJournal(input),ledger=await readBudget();assertPoolLedger(journal,ledger,input);entry=journal.steps[0];
    if(options.reconcile||entry){need(entry?.transactionHash,'RECORDED_HASH_REQUIRED_NO_NEW_SIGNATURE');await chainIdentity(client,input);await previousCheck(client,input);const p=await hashedFile(planPath(entry.planHash),entry.planHash);need(p.value.sessionHash===input.sessionHash&&p.value.dataHash===input.action.dataHash&&p.value.gas===entry.gas&&p.value.gasPrice===entry.gasPrice&&p.value.maxFeeWei===entry.maxFeeWei,'RECORDED_CREATE_PLAN_CHANGED');stage='RECONCILE_RECORDED_HASH';const verified=await verifyCreated(client,input,entry,{onReceipt:async evidence=>{Object.assign(entry,evidence);assertPoolLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);}});journal.steps[0]=verified;assertPoolLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);console.log(json({status:'RECONCILED_NO_SEND',transactionHash:entry.transactionHash,journalFile:journalPath(input.sessionHash),after:verified.after}));return 0;}
    const fresh=await preview(client,input,{onStage});assertInputUnchanged(input,await loadInput(options));
    if(!options.broadcast){stage='SAVE_READ_ONLY_PLAN';const planHash=keccak256(Buffer.from(json(fresh)));await writeAtomic(planPath(planHash),fresh);console.log(json({status:'READ_ONLY_PLAN',planHash,planFile:planPath(planHash),...fresh,spentAndReservedWei:ledger.spentAndReservedWei,transactionsSent:0}));return 0;}
    stage='COMPARE_REVIEWED_PLAN';const frozen=await loadPlan(options.reviewedPlanHash,input);assertPlanUnchanged(frozen,fresh);need(BigInt(frozen.maxFeeWei)<=limits.maxTxWei&&BigInt(ledger.spentAndReservedWei)+BigInt(frozen.maxFeeWei)<=limits.maxTotalWei,'CREATE_POOL_BUDGET_EXCEEDED');
    const confirmation=`SEND create-pool 56 ${frozen.from} ${frozen.to} ${frozen.pool} ${frozen.dataHash} ${options.reviewedPlanHash} ${frozen.maxFeeWei} ${frozen.rpcMode}`;
    console.log(json({status:'LIVE_HUMAN_CONFIRMATION_REQUIRED',...frozen,planHash:options.reviewedPlanHash,spentAndReservedWei:ledger.spentAndReservedWei}));console.log('Paste the complete exact line to sign and send this one createPool transaction:\n'+confirmation);stage='HUMAN_CONFIRMATION';const rl=createInterface({input:process.stdin,output:process.stdout});let answer;try{answer=await rl.question('> ');}finally{rl.close();}need(answer===confirmation,'CONFIRMATION_NOT_ACCEPTED_NO_SEND');
    stage='RECHECK_AFTER_CONFIRMATION';const latest=await loadInput(options);assertInputUnchanged(input,latest);assertRpcUnchanged(frozenEnvRpc,(await onlyEnvFields(options.envFile,['BSC_RPC_URL'])).BSC_RPC_URL);assertPlanUnchanged(frozen,await loadPlan(options.reviewedPlanHash,latest));assertPlanUnchanged(frozen,await preview(client,latest,{onStage}));
    stage='RELOAD_BUDGET_AND_JOURNAL';journal=await loadJournal(input);ledger=await readBudget();assertPoolLedger(journal,ledger,input);need(journal.steps.length===0,'POOL_STEP_ALREADY_RECORDED');
    entry={step:STEP,status:'RESERVED_BEFORE_SIGNATURE',nonce:frozen.nonce,to:frozen.to,pool:frozen.pool,dataHash:frozen.dataHash,planHash:options.reviewedPlanHash,reservationId:reservationId(input),gas:frozen.gas,gasPrice:frozen.gasPrice,maxFeeWei:frozen.maxFeeWei,poolToolHash:input.toolHash,sellerRuntimeToolHash:input.sellerToolHash,rpcMode:frozen.rpcMode,primaryEndpoint:frozen.primaryEndpoint,independentEndpoint:frozen.independentEndpoint};
    stage='RESERVE_BUDGET';const transactionHash=await sendRecordedOnce({reservation:()=>reserveBudget({id:entry.reservationId,operation:STEP,nonce:entry.nonce,sender:frozen.from,valueWei:0n,maxFeeWei:entry.maxFeeWei,maxTotalWei:limits.maxTotalWei,bundleHash:input.sessionHash,initCodeHash:frozen.dataHash}),saveReserved:async()=>{stage='SAVE_RESERVATION';journal.steps.push(entry);assertPoolLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);},
      sign:async()=>{stage='SIGN_FROZEN_CREATE_TRANSACTION';const fields=await onlyEnvFields(options.envFile,['CREATOR_PRIVATE_KEY']),{privateKeyToAccount}=await import('viem/accounts'),key=fields.CREATOR_PRIVATE_KEY.startsWith('0x')?fields.CREATOR_PRIVATE_KEY:'0x'+fields.CREATOR_PRIVATE_KEY,signer=privateKeyToAccount(key);need(same(signer.address,input.action.from),'CREATOR_PRIVATE_KEY_ADDRESS_MISMATCH');return signer.signTransaction({chainId:56,type:'legacy',nonce:frozen.nonce,to:frozen.to,value:0n,data:frozen.data,gas:BigInt(frozen.gas),gasPrice:BigInt(frozen.gasPrice)});},
      saveSigned:async hash=>{stage='SAVE_SIGNED_HASH';Object.assign(entry,{status:'SIGNED_HASH_RECORDED_OUTCOME_UNKNOWN',transactionHash:hash});assertPoolLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);},
      send:async raw=>{stage='RECHECK_BEFORE_SEND';assertInputUnchanged(input,await loadInput(options));assertRpcUnchanged(frozenEnvRpc,(await onlyEnvFields(options.envFile,['BSC_RPC_URL'])).BSC_RPC_URL);assertPlanUnchanged(frozen,await preview(client,input,{onStage}));stage='VERIFY_RECORDED_SIGNED_HASH';const recorded=await loadJournal(input);assertPoolLedger(recorded,await readBudget(),input);need(serial(recorded.steps[0])===serial(entry),'RECORDED_CREATE_ENTRY_CHANGED');assertInputUnchanged(input,await loadInput(options));assertRpcUnchanged(frozenEnvRpc,(await onlyEnvFields(options.envFile,['BSC_RPC_URL'])).BSC_RPC_URL);stage='FINAL_CREATOR_NONCE_CHECK';const [latestNonce,pendingNonce]=await Promise.all([client.getTransactionCount({address:frozen.from,blockTag:'latest'}),client.getTransactionCount({address:frozen.from,blockTag:'pending'})]);need(latestNonce===frozen.nonce&&pendingNonce===frozen.nonce,'CREATOR_NONCE_CHANGED_OR_PENDING');stage='SEND_RAW_CREATE_TRANSACTION_ONCE';return createWalletClient({transport:http(selectedRpc,{retryCount:0,timeout:20000})}).sendRawTransaction({serializedTransaction:raw});},
    });stage='SAVE_SUBMITTED_HASH';entry.status='SUBMITTED';await writeAtomic(journalPath(input.sessionHash),journal);console.log(json({status:'SUBMITTED',transactionHash,step:STEP}));
    stage='WAIT_CANONICAL_RECEIPT';await client.waitForTransactionReceipt({hash:transactionHash,confirmations:CONFIRMATIONS,timeout:60000,pollingInterval:1500});stage='VERIFY_CREATE_RECEIPT';await chainIdentity(client,input);const verified=await verifyCreated(client,input,entry,{onReceipt:async evidence=>{Object.assign(entry,evidence);assertPoolLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);}});journal.steps[0]=verified;assertPoolLedger(journal,await readBudget(),input);await writeAtomic(journalPath(input.sessionHash),journal);console.log(json({status:'CONFIRMED',transactionHash,journalFile:journalPath(input.sessionHash),after:verified.after}));return 0;
  }catch(error){console.error(json({status:entry?'STOPPED_RECONCILE_ONLY':'STOPPED',step:STEP,...safeDiagnostic(error,stage),transactionHash:entry?.transactionHash??null,journalFile:input?journalPath(input.sessionHash):null,automaticBroadcastRetry:false,note:'No automatic retry or budget release. A recorded hash is reconciled only; a reserved operation without a hash requires manual investigation.'}));return 1;}finally{if(unlock)await unlock();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;}).catch(()=>{console.error(json({status:'STOPPED',reason:'DETAILS_REDACTED',automaticBroadcastRetry:false}));process.exitCode=1;});
