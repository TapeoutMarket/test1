#!/usr/bin/env node
// Read-only preparation. No wallet, private-key parser, or write RPC transport.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createPublicClient,custom,http,keccak256,parseAbi,zeroAddress} from 'viem';
import {ROOT,ACCOUNTS,PRICE,FEE,TOTAL,SHARE,json,readOnlyClientFromEnv,guardedProvider} from '../live-test/preflight.mjs';
import {readConfinedJson,writeAtomic,bootstrapToolHash,acquireDeploymentLock} from '../live-test/deployment-io.mjs';
import {verificationHash} from '../scripts/release-files.mjs';
import {buildForkOrder,seaportAbi} from '../scripts/fork-create-order.mjs';
import {parseOrderEnvelope} from '../sdk/order-envelope.ts';
import {buildTerms,configurationHash,loadArtifact} from '../sdk/contracts.ts';
import {cloneRuntime,parseLiveManifest,verifyLiveIdentity} from '../sdk/live-identity.ts';
import {checkProtocol} from '../sdk/protocol.ts';

const need=(ok,code)=>{if(!ok)throw new Error(code);};
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const NFT_ABI=parseAbi(['function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function isApprovedForAll(address,address) view returns(bool)']);
export const SESSION_PATH='mainnet-test/session.json';
export const OUTPUTS={order:'mainnet-test/order-envelope.json',config:'mainnet-test/config.json',manifest:'mainnet-test/live-manifest.json',readiness:'mainnet-test/readiness.json'};

export function validateEvidence(governance,preflight,plan){
  need(governance.chainId===56&&governance.status==='ALREADY_EXECUTED'&&governance.operation?.stateName==='DONE'&&governance.creationPaused===false,'GOVERNANCE_NOT_EXECUTED');
  need(same(governance.selectedTemplate,governance.deploymentEvidence?.addresses?.template)&&same(governance.selectedConfigHash,governance.configHash),'SELECTED_CONFIGURATION_MISMATCH');
  need(governance.roleHistory?.status==='EXACT_ROLE_MEMBERSHIP_RECONSTRUCTED','ROLE_HISTORY_REQUIRED');
  const {reportHash,...roleReport}=governance.roleHistory;
  need(same(keccak256(Buffer.from(json(roleReport))),reportHash),'ROLE_HISTORY_HASH_MISMATCH');
  need(preflight.chainId===56&&preflight.independentCrossCheck?.status==='MATCH'&&preflight.historicalForkCheckpointMatches,'INDEPENDENT_CHAIN_EVIDENCE_REQUIRED');
  need(preflight.protocolRuntimeIdentities?.every(v=>v.matchesForkBaselineRuntime),'PROTOCOL_RUNTIME_CHANGED');
  need(plan.tokenId==='3204'&&same(plan.seller,ACCOUNTS.sellerA)&&plan.sellerPriceWei===String(PRICE)&&plan.marketFeeWei===String(FEE)&&plan.buyerPaysWei===String(TOTAL)&&same(plan.feeRecipient,ACCOUNTS.creator),'SESSION_SCOPE_MISMATCH');
  need(plan.contributionsConfirmedByUser&&plan.contributions.length===2&&plan.contributions[0].shares===67&&plan.contributions[1].shares===33,'ALLOCATION_NOT_CONFIRMED');
  for(const [i,role,addr,ids,shares] of [[0,'creator',ACCOUNTS.creator,'1..67',67n],[1,'buyerB',ACCOUNTS.buyerB,'68..100',33n]]){
    const item=plan.contributions[i];
    need(item.role===role&&same(item.address,addr)&&item.ids===ids&&item.valueWei===String(SHARE*shares),'ALLOCATION_BINDING_MISMATCH');
  }
  need(same(configurationHash(governance.configuration),governance.configHash),'CONFIGURATION_HASH_MISMATCH');
  return true;
}

export function buildPublicOrder({plan,config,preflight,block,information,counter,salt}){
  const collectionIdentity=preflight.protocolRuntimeIdentities.find(x=>x.field==='collection');
  need(collectionIdentity&&same(collectionIdentity.address,config.collection),'COLLECTION_IDENTITY_MISSING');
  const envelope=buildForkOrder({seller:plan.seller,collection:plan.collection,tokenId:plan.tokenId,market:config.market,feeRecipient:plan.feeRecipient,version:information[0],counter,timestamp:block.timestamp,blockNumber:block.number,blockHash:block.hash,marketCodeHash:config.marketCodeHash,collectionCodeHash:collectionIdentity.codeHash,salt});
  // Reuse only the pure struct constructor; no fork operation is called.
  envelope.source.name='MAINNET_TEST_SELLER_VALIDATION_PENDING';
  envelope.identity.evidenceVersion='mainnet-readonly-runtime-and-seaport-getters-v1';
  envelope.validation.status='unknown';
  need(same(envelope.seaport.domain.domainSeparator,information[1])&&same(information[1],config.seaportDomainSeparator),'SEAPORT_DOMAIN_MISMATCH');
  return parseOrderEnvelope(envelope);
}

export function buildManifest({governance,preflight,plan,block,request,predicted,round}){
  const addresses=governance.deploymentEvidence.addresses;
  const dependencies=Object.fromEntries(['collection','mining','bem'].map(field=>{
    const item=preflight.protocolRuntimeIdentities.find(v=>v.field===field);
    need(item&&same(item.address,governance.configuration[field]),'DEPENDENCY_IDENTITY_MISSING');
    return [field,{address:item.address,codeHash:item.codeHash}];
  }));
  return parseLiveManifest({schemaVersion:'1',mode:'live',chainId:56,
    network:{checkpointBlock:String(block.number),checkpointHash:block.hash},
    factory:{address:addresses.factory,codeHash:governance.runtime.factory,implementation:{address:addresses.factoryImplementation,codeHash:governance.runtime.factoryImplementation}},
    template:{address:addresses.template,codeHash:governance.runtime.template,validator:{address:governance.validator.address,codeHash:governance.validator.codeHash}},
    governance:{timelock:{address:addresses.timelock,codeHash:governance.runtime.timelock},multisig:{address:plan.governance.multisig,codeHash:plan.governance.multisigCodeHash},guardian:plan.governance.guardian,minimumDelay:'600',roleAuditBlock:governance.roleHistory.toBlock,roleAuditBlockHash:governance.roleHistory.checkpointBlockHash,roleAuditReportHash:governance.roleHistory.reportHash},
    config:governance.configuration,configHash:request.configHash,dependencies,
    vault:{address:predicted,codeHash:keccak256(cloneRuntime(addresses.template)),termsHash:request.termsHash,payloadHash:keccak256(request.payload),creator:ACCOUNTS.creator,round:String(round)},
  });
}

function argsOf(argv){
  const args={};
  for(let i=0;i<argv.length;i+=2){need(['--env','--governance','--preflight'].includes(argv[i])&&argv[i+1]&&!args[argv[i].slice(2)],'INVALID_ARGUMENTS');args[argv[i].slice(2)]=argv[i+1];}
  need(args.env&&args.governance&&args.preflight,'EXPLICIT_INPUTS_REQUIRED');return args;
}
async function assertAbsent(file){try{await fs.lstat(path.join(ROOT,file));throw new Error('SESSION_ALREADY_EXISTS_DO_NOT_REGENERATE');}catch(e){if(e.code!=='ENOENT')throw e;}}

async function prepare(argv){
  const args=argsOf(argv);
  need(await fs.realpath(process.cwd())===ROOT,'RUN_FROM_GROUPBUY_ROOT');
  for(const file of [SESSION_PATH,...Object.values(OUTPUTS)])await assertAbsent(file);
  const [g,p,s,state]=await Promise.all([readConfinedJson(args.governance),readConfinedJson(args.preflight),readConfinedJson('live-test/SESSION_PLAN.json'),readConfinedJson('live-test/deployment-state.json')]);
  const governance=g.value,preflight=p.value,plan=s.value;
  validateEvidence(governance,preflight,plan);
  const core=verificationHash(),bootstrap=await bootstrapToolHash();
  need(core===plan.coreVerificationInputHash&&core===governance.verificationInputHash&&bootstrap===governance.bootstrapToolHash&&bootstrap===state.value.bootstrapToolHash,'FROZEN_SOURCE_CHANGED');
  const client=await readOnlyClientFromEnv(args.env),config=governance.configuration;
  const [chainId,version,block]=await Promise.all([client.getChainId(),client.request({method:'web3_clientVersion'}),client.getBlock({blockTag:'finalized'})]);
  need(chainId===56&&!/anvil|hardhat|ganache|testrpc/i.test(version),'MAINNET_REQUIRED');
  need(block.number&&block.hash&&block.timestamp-BigInt(governance.checkpoint.timestamp)<=3600n,'FRESH_GOVERNANCE_INSPECTION_REQUIRED');
  const at={blockNumber:block.number};
  const accounts=await Promise.all(Object.entries(ACCOUNTS).map(async([role,address])=>{
    const [balance,nonce,pendingNonce,code]=await Promise.all([client.getBalance({address,...at}),client.getTransactionCount({address,blockTag:'latest'}),client.getTransactionCount({address,blockTag:'pending'}),client.getCode({address,...at})]);
    need(nonce===pendingNonce&&(!code||code==='0x'),'ACTOR_PENDING_TRANSACTION_OR_CODE');return {role,address,balance,nonce};
  }));
  const account=role=>accounts.find(a=>a.role===role);
  need(account('creator').balance>SHARE*67n&&account('buyerB').balance>SHARE*33n,'PRINCIPAL_AND_GAS_BALANCE_REQUIRED');
  const [owner,approved,approvedAll,information,counter]=await Promise.all([
    client.readContract({address:config.collection,abi:NFT_ABI,functionName:'ownerOf',args:[BigInt(plan.tokenId)],...at}),
    client.readContract({address:config.collection,abi:NFT_ABI,functionName:'getApproved',args:[BigInt(plan.tokenId)],...at}),
    client.readContract({address:config.collection,abi:NFT_ABI,functionName:'isApprovedForAll',args:[plan.seller,config.market],...at}),
    client.readContract({address:config.market,abi:seaportAbi,functionName:'information',...at}),
    client.readContract({address:config.market,abi:seaportAbi,functionName:'getCounter',args:[plan.seller],...at}),
  ]);
  need(same(owner,plan.seller)&&same(approved,zeroAddress)&&approvedAll===false,'FRESH_UNAPPROVED_SELLER_MINER_REQUIRED');
  for(const item of preflight.protocolRuntimeIdentities){const code=await client.getCode({address:item.address,...at});need(code&&same(keccak256(code),item.codeHash),'DEPENDENCY_RUNTIME_CHANGED');}
  const publicProvider=http('https://bsc-dataseed.bnbchain.org',{retryCount:0,timeout:20000})({});
  const independent=createPublicClient({transport:custom(guardedProvider(publicProvider),{retryCount:0})});
  const [otherChain,otherBlock]=await Promise.all([independent.getChainId(),independent.getBlock({blockNumber:block.number})]);
  need(otherChain===56&&same(otherBlock.hash,block.hash),'INDEPENDENT_CHECKPOINT_MISMATCH');
  for(const evidence of [governance,preflight])need(same((await client.getBlock({blockNumber:BigInt(evidence.checkpoint.blockNumber)})).hash,evidence.checkpoint.blockHash),'EVIDENCE_CHECKPOINT_CHANGED');
  const envelope=buildPublicOrder({plan,config,preflight,block,information,counter,salt:BigInt('0x'+randomBytes(32).toString('hex'))});
  const chainOrderHash=await client.readContract({address:config.market,abi:seaportAbi,functionName:'getOrderHash',args:[envelope.seaport.components],...at});
  need(same(chainOrderHash,envelope.orderHash),'CHAIN_ORDER_HASH_MISMATCH');
  const orderStatus=await client.readContract({address:config.market,abi:seaportAbi,functionName:'getOrderStatus',args:[envelope.orderHash],...at});
  need(orderStatus[0]===false&&orderStatus[1]===false&&orderStatus[2]===0n&&orderStatus[3]===0n,'ORDER_ALREADY_USED');
  const round=1n,name='TapeOut3204-mainnet-67-33',deadline=BigInt(envelope.nativeEndTime)-BigInt(config.safetyMargin);
  const request=buildTerms(envelope,config,deadline,name,''),addresses=governance.deploymentEvidence.addresses;
  const {abi}=await loadArtifact('GroupBuyFactory');
  const createArgs=[addresses.template,request.configHash,request.terms,request.payload,round];
  const predicted=await client.readContract({address:addresses.factory,abi,functionName:'predictPool',args:[ACCOUNTS.creator,...createArgs],...at});
  const existing=await client.getCode({address:predicted,...at});need(!existing||existing==='0x','PREDICTED_POOL_ALREADY_DEPLOYED');
  need(same(await client.readContract({address:addresses.factory,abi,functionName:'hashTerms',args:[request.terms],...at}),request.termsHash),'CHAIN_TERMS_HASH_MISMATCH');
  const manifest=buildManifest({governance,preflight,plan,block,request,predicted,round});
  const liveIdentity=await verifyLiveIdentity(client,manifest,{command:'create-pool',target:addresses.factory,actor:ACCOUNTS.creator,args:createArgs,expectedTemplate:addresses.template,expectedCodeHash:manifest.factory.codeHash});
  const protocol=await checkProtocol(client,envelope);
  const failed=Object.entries(protocol.checks).filter(([,ok])=>!ok).map(([name])=>name).sort();
  need(JSON.stringify(failed)===JSON.stringify(['sellerApproval','signatureOrSeaportValidation']),'UNEXPECTED_ORDER_READINESS_FAILURE');
  const session={schemaVersion:1,chainId:56,status:'FROZEN_MAINNET_TEST_SESSION',createdAt:new Date().toISOString(),
    seller:plan.seller,creator:ACCOUNTS.creator,buyerB:ACCOUNTS.buyerB,collection:plan.collection,tokenId:plan.tokenId,market:config.market,feeRecipient:plan.feeRecipient,
    sellerPriceWei:String(PRICE),feeWei:String(FEE),totalWei:String(TOTAL),fundingDeadline:String(deadline),orderExpiresAt:envelope.nativeEndTime,
    checkpoint:{blockNumber:String(block.number),blockHash:block.hash},coreVerificationInputHash:core,bootstrapToolHash:bootstrap,
    protocolRuntimeIdentities:preflight.protocolRuntimeIdentities.map(({field,address,codeHash})=>({field,address,codeHash})),
    seaport:{version:information[0],domainSeparator:information[1],counter:String(counter),orderHash:envelope.orderHash},
    order:{parameters:envelope.seaport.parameters,signature:'0x'},
    steps:{'seller-approve':{nonce:String(account('sellerA').nonce),expectedApproval:approved},'seller-validate':{nonce:String(account('sellerA').nonce+1),requiresStep:'seller-approve'},'create-pool':{nonce:String(account('creator').nonce),requiresStep:'seller-validate'},'creator-contribute':{nonce:String(account('creator').nonce+1),requiresStep:'create-pool'},'buyer-b-complete':{nonce:String(account('buyerB').nonce),requiresStep:'creator-contribute'}},
    manifestPath:OUTPUTS.manifest,manifestHash:keccak256(Buffer.from(json(manifest))),orderEnvelopePath:OUTPUTS.order,orderEnvelopeHash:keccak256(Buffer.from(json(envelope))),configPath:OUTPUTS.config,
    governanceInspectionPath:args.governance,governanceInspectionHash:keccak256(g.raw),governanceOperationId:governance.operationId,governanceAddresses:addresses,
    pool:{address:predicted,round:String(round),name,termsHash:request.termsHash,payloadHash:keccak256(request.payload),terms:request.terms,payload:request.payload,createArgs},
    plannedContributions:plan.contributions,
  };
  const readiness={status:'PREPARED_AWAITING_FIRST_TRANSACTION_CONFIRMATION',observedAt:new Date().toISOString(),checkpoint:session.checkpoint,governanceStatus:governance.status,creationPaused:false,liveIdentity,protocol,
    accounts,miner:{owner,approved,approvedAll},orderHash:envelope.orderHash,predictedPool:predicted,fundingDeadline:String(deadline),orderExpiresAt:envelope.nativeEndTime,
    fundingDeadlineBeijing:new Date(Number(deadline)*1000).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}),orderExpiresBeijing:new Date(Number(envelope.nativeEndTime)*1000).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}),
    independentCheckpoint:'MATCH',sessionPath:SESSION_PATH,sessionHash:keccak256(Buffer.from(json(session))),manifestHash:session.manifestHash,
    sourceEvidence:{governance:{path:args.governance,hash:keccak256(g.raw)},preflight:{path:args.preflight,hash:keccak256(p.raw)}},
    plannedTransactions:['seller-approve','seller-validate','create-pool','creator-contribute','buyer-b-complete'],
    note:'Order is currently unsigned and unvalidated. Seller validate will make this FULL_OPEN order publicly fillable for 0.303 BNB. No market/database listing is created. Last contribution atomically purchases; no separate purchase transaction.',
    oldPreflightStaticFields:'Legacy plannedGovernance/blockers are historical hardcoded labels; current governance conclusion comes from ALREADY_EXECUTED inspection and live identity reads.',
    gasForLaterSteps:'NOT_YET_SIMULATABLE_UNTIL_PRECEDING_STEPS',mainnetTransactionsSent:0,privateKeysConsumed:false,marketDatabaseWrites:0};
  need(same((await client.getBlock({blockNumber:block.number})).hash,block.hash),'PREPARATION_CHECKPOINT_CHANGED');
  need(verificationHash()===core&&await bootstrapToolHash()===bootstrap,'SOURCE_CHANGED_DURING_PREPARATION');
  for(const [file,value] of [[OUTPUTS.order,envelope],[OUTPUTS.config,config],[OUTPUTS.manifest,manifest],[OUTPUTS.readiness,readiness],[SESSION_PATH,session]])await writeAtomic(file,value);
  console.log(json({status:readiness.status,sessionPath:SESSION_PATH,sessionHash:readiness.sessionHash,manifestHash:session.manifestHash,orderHash:envelope.orderHash,predictedPool:predicted,fundingDeadlineBeijing:readiness.fundingDeadlineBeijing,orderExpiresBeijing:readiness.orderExpiresBeijing,mainnetTransactionsSent:0}));
  return readiness;
}
export async function main(argv=process.argv.slice(2)){
  // Share the same durable lock as deployment and mainnet test senders. A second
  // preparation cannot replace the session while the first is awaiting RPC.
  const release=await acquireDeploymentLock();
  try{return await prepare(argv);}finally{await release();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(json({status:'NOT_PREPARED',reason:error.constructor===Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'READ_OR_SIMULATION_FAILED_DETAILS_REDACTED',mainnetTransactionsSent:0}));process.exitCode=1;});
