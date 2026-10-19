#!/usr/bin/env node
// Read-only: derive an explicit candidate Config from an imported order and a verified fork.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {keccak256,parseAbi,stringToHex} from 'viem';
import {ROOT,buildTerms,protocolConfigSchema} from '../sdk/contracts.ts';
import {JsonFileOrderSource,confinedFile} from '../sdk/order-source.ts';
import {assertExecutableEnvelope} from '../sdk/order-envelope.ts';
import {checkProtocol} from '../sdk/protocol.ts';
import {actorAddress,executionConfig,publicClient,safeDiagnostic,verifyExecutionTarget} from '../sdk/execution.ts';
const stringify=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const sha=x=>createHash('sha256').update(x).digest('hex');
function requireThat(ok,message){if(!ok)throw new Error('UnverifiedProtocol: '+message);}
export function selectDeadline(env,endTime,now){
 const margin=env.FORK_SAFETY_MARGIN??'300';
 if(!/^[1-9][0-9]*$/.test(margin)||BigInt(margin)>=2n**64n)throw new Error('Invalid FORK_SAFETY_MARGIN');
 const upper=BigInt(endTime)-BigInt(margin),oneHour=now+3600n;
 const supplied=env.FORK_DEADLINE;
 if(supplied!==undefined&&!/^[1-9][0-9]*$/.test(supplied))throw new Error('Invalid FORK_DEADLINE');
 const deadline=supplied?BigInt(supplied):(upper<oneHour?upper:oneHour);
 if(deadline>=2n**64n||deadline>upper||deadline<=now+120n)throw new Error('Invalid deadline: leave more than 120 seconds for local governance and purchase; use a longer-lived existing order');
 return {deadline,safetyMargin:margin,selection:supplied?'EXPLICIT':'MIN_ORDER_END_MINUS_MARGIN_AND_FORK_NOW_PLUS_ONE_HOUR'};
}
export async function verifyOrderCheckpoint(order,env,client){
 const origin=env.FORK_ORDER_ORIGIN??'external';
 requireThat(['external','fork-created'].includes(origin),'invalid FORK_ORDER_ORIGIN');
 const forkCreatedMarker=order.source.name==='LOCAL_FORK_CREATED_NO_PUBLIC_SIGNATURE';
 const pin=BigInt(env.FORK_BLOCK_NUMBER),checkpoint=BigInt(order.validation.blockNumber);
 if(origin==='external'){
  requireThat(!forkCreatedMarker,'fork-created input requires explicit FORK_ORDER_ORIGIN=fork-created');
  requireThat(checkpoint===pin&&same(order.validation.blockHash,env.FORK_BLOCK_HASH),'external order validation must match the pinned fork block');
 }else{
  requireThat(order.protocol==='seaport'&&forkCreatedMarker&&order.source.kind==='json'&&order.seaport.signature==='0x','fork-created variant requires this fork unsigned validated order marker');
  requireThat(checkpoint>=pin,'fork-created validation checkpoint cannot precede the source pin');
 }
 const canonical=await client.getBlock({blockNumber:checkpoint});
 requireThat(canonical.number===checkpoint&&same(canonical.hash,order.validation.blockHash),'order validation checkpoint is not canonical on the selected execution fork');
 return {origin,stateScope:origin==='fork-created'?'LOCAL_FORK_CREATED_NO_PUBLIC_SIGNATURE':'EXTERNAL_SOURCE_PINNED_ORDER',blockNumber:checkpoint,blockHash:canonical.hash,sourcePin:pin,executionCanonicalHashMatched:true};
}
async function writeExclusive(relative,value){
 const file=path.join(ROOT,relative);await fs.mkdir(path.dirname(file),{recursive:true});
 requireThat(await fs.realpath(path.dirname(file))===path.dirname(file),'output directory symlink refused');
 const body=stringify(value);
 try{await fs.writeFile(file,body,{flag:'wx'});}catch(e){
  if(e.code!=='EEXIST')throw e;
  requireThat(!(await fs.lstat(file)).isSymbolicLink(),'output symlink refused');
  requireThat(await fs.readFile(file,'utf8')===body,'existing prepared file differs; choose a new explicit FORK_CASE_NAME');
 }
 return relative;
}
export async function main(argv=process.argv.slice(2),env=process.env){
 if(argv.length){if(argv.length===1&&argv[0]==='--help'){console.log('Read-only fork preparation. MODE=fork; ORDER_FILE; FORK_BLOCK_NUMBER/HASH; FORK_MINING_ADDRESS; FORK_BEM_ADDRESS; explicit verified execution RPC. Optional FORK_CASE_NAME, FORK_DEADLINE, FORK_SAFETY_MARGIN. Never signs or sends transactions.');return 0;}throw new Error('Invalid arguments; no broadcast option exists');}
 const required=['ORDER_FILE','FORK_BLOCK_NUMBER','FORK_BLOCK_HASH','EXECUTION_RPC_URL','FORK_MINING_ADDRESS','FORK_BEM_ADDRESS'];
 const missing=required.filter(k=>!env[k]);
 if(missing.length){console.log(stringify({status:'NOT_RUN',missing,realForkLifecycle:'NOT_RUN',transactionsSent:0}));return 0;}
 requireThat(env.MODE==='fork'&&env.SOURCE_CHAIN_ID==='56'&&env.EXPECTED_EXECUTION_CHAIN_ID==='56','explicit fork mode and chain IDs 56 required');
 requireThat(await fs.realpath(process.cwd())===await fs.realpath(ROOT),'run from repository root');
 const client=publicClient(executionConfig(env)),execution=await verifyExecutionTarget(executionConfig(env),client);
 const file=await confinedFile(ROOT,env.ORDER_FILE),order=await new JsonFileOrderSource(file,ROOT).load();
 requireThat(order.protocol==='seaport','real official CircuitMarket remains disabled');assertExecutableEnvelope(order);
 requireThat(order.validation.status==='verified'&&order.identity.status==='verified','reviewed real input identities required');
 const orderCheckpoint=await verifyOrderCheckpoint(order,env,client);
 const protocol=await checkProtocol(client,order);requireThat(protocol.executable,'order failed fresh fork checks');
 const block=await client.getBlock({blockNumber:protocol.blockNumber});
 const mining=actorAddress(env.FORK_MINING_ADDRESS),bem=actorAddress(env.FORK_BEM_ADDRESS);
 const code=await Promise.all([mining,bem].map(address=>client.getCode({address,blockNumber:block.number})));
 requireThat(code.every(c=>c&&c!=='0x'),'Mining and BEM must have real code at observation block');
 const miningAbi=parseAbi(['function minerKey(address,uint256) view returns(bytes32)','function pending(bytes32) view returns(uint256)']);
 const key=await client.readContract({address:mining,abi:miningAbi,functionName:'minerKey',args:[order.collection,BigInt(order.tokenId)],blockNumber:block.number});
 const pending=await client.readContract({address:mining,abi:miningAbi,functionName:'pending',args:[key],blockNumber:block.number});
 const decimals=await client.readContract({address:bem,abi:parseAbi(['function decimals() view returns(uint8)']),functionName:'decimals',blockNumber:block.number});
 requireThat(same((await client.getBlock({blockNumber:block.number})).hash,block.hash),'observation block changed');
 const timing=selectDeadline(env,order.seaport.parameters.endTime,block.timestamp);
 const config=protocolConfigSchema.parse({chainId:'56',templateVersion:1,marketKind:0,market:order.market,collection:order.collection,mining,bem,marketCodeHash:order.identity.marketCodeHash,seaportDomainSeparator:order.seaport.domain.domainSeparator,seaportVersionHash:keccak256(stringToHex(order.seaport.domain.version)),safetyMargin:timing.safetyMargin,mockOnly:false});
 const built=buildTerms(order,config,timing.deadline,`tapeout${order.tokenId}`,'');
 const caseName=env.FORK_CASE_NAME??`miner-${order.tokenId}-${String(block.number)}`;
 requireThat(/^[a-z0-9][a-z0-9-]{0,79}$/.test(caseName),'invalid FORK_CASE_NAME');
 const configFile=await writeExclusive(`fixtures/fork-${caseName}.config.json`,config);
 const result={status:'PREPARED_READ_ONLY_NOT_EXECUTED',caseName,productionReady:false,realForkLifecycle:'NOT_RUN',transactionsSent:0,execution,orderCheckpoint,orderFile:path.relative(ROOT,file),orderFileSHA256:sha(await fs.readFile(file)),orderHash:order.orderHash,market:order.market,collection:order.collection,tokenId:order.tokenId,observation:{blockNumber:block.number,blockHash:block.hash,timestamp:block.timestamp},configFile,configHash:built.configHash,termsHash:built.termsHash,deadline:timing.deadline,deadlineSelection:timing.selection,buyerPaysWei:order.buyerPaysWei,mining:{address:mining,codeHash:keccak256(code[0]),minerKey:key,pendingRaw:pending},bem:{address:bem,codeHash:keccak256(code[1]),decimals},positiveAccrualTransferTest:pending>0n?'PENDING_OBSERVED_NOT_YET_RECEIVED':'NOT_RUN_NO_POSITIVE_PENDING_OBSERVED',semanticReview:'UNKNOWN: successful getters and runtime hashes do not prove claim recipient/permission, proxy implementation, or non-tax/non-rebasing BEM semantics. Review primary sources and actual fork receipts.',commands:{deployPlan:['npm','run','cli','--','deploy-local'],createPlan:['npm','run','cli','--','create-pool','--order',path.relative(ROOT,file),'--config',configFile,'--deadline',String(timing.deadline),'--round','1','--name',built.terms.name,'--factory','<NEW_FORK_FACTORY>','--expected-template','<NEW_FORK_TEMPLATE>','--from','<LOCAL_A>']}};
 const reportFile=await writeExclusive(`reports/fork-${caseName}-prepared.json`,result);
 console.log(stringify({...result,reportFile}));return 0;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(stringify(safeDiagnostic(error)));process.exitCode=1;});
