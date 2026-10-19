#!/usr/bin/env node
// Fork-only order preparation: impersonate the owner, approve one NFT, validate an unsigned order.
// Never loads .env, reads a private key, signs a public order, or contacts the source RPC.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {createWalletClient,encodeFunctionData,http,keccak256,parseAbi,zeroAddress,zeroHash} from 'viem';
import {ROOT} from '../sdk/contracts.ts';
import {actorAddress,executionConfig,publicClient,safeDiagnostic,verifyExecutionTarget} from '../sdk/execution.ts';
import {domainSeparator,orderAbi,orderHash,parseOrderEnvelope} from '../sdk/order-envelope.ts';
import {checkProtocol} from '../sdk/protocol.ts';

export const FORK_ORDER_SOURCE='LOCAL_FORK_CREATED_NO_PUBLIC_SIGNATURE';
export const SELLER_PRICE_WEI=300000000000000000n;
export const MARKET_FEE_WEI=3000000000000000n;
export const BUYER_TOTAL_WEI=SELLER_PRICE_WEI+MARKET_FEE_WEI;
const serial=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
const need=(ok,message)=>{if(!ok)throw new Error('UnverifiedProtocol: '+message);};
const nftAbi=parseAbi(['function ownerOf(uint256) view returns(address)','function getApproved(uint256) view returns(address)','function approve(address,uint256)']);
const componentABI=[...orderAbi[0].components[0].components.filter(field=>field.name!=='totalOriginalConsiderationItems'),{name:'counter',type:'uint256'}];
export const seaportAbi=[...parseAbi(['function information() view returns(string version,bytes32 domainSeparator,address conduitController)','function getCounter(address) view returns(uint256)','function getOrderStatus(bytes32) view returns(bool isValidated,bool isCancelled,uint256 totalFilled,uint256 totalSize)']),
 {type:'function',name:'getOrderHash',stateMutability:'view',inputs:[{name:'order',type:'tuple',components:componentABI}],outputs:[{type:'bytes32'}]},
 {type:'function',name:'validate',stateMutability:'nonpayable',inputs:[{...orderAbi[0],name:'orders',type:'tuple[]'}],outputs:[{name:'validated',type:'bool'}]}];

export function creationInputs(argv,env){
 if(argv.length>1||argv.length===1&&argv[0]!=='--send-local')throw new Error('Invalid arguments: only --send-local is supported; no broadcast or private-key option exists');
 need(env.MODE==='fork'&&env.SOURCE_CHAIN_ID==='56'&&env.EXPECTED_EXECUTION_CHAIN_ID==='56','explicit fork mode and chain IDs 56 required');
 need(!env.FORK_EXECUTION_TOPOLOGY||env.FORK_EXECUTION_TOPOLOGY==='loopback','order creation requires this computer\'s loopback fork');
 for(const key of ['EXECUTION_RPC_URL','FORK_BLOCK_NUMBER','FORK_BLOCK_HASH','FORK_SELLER_ADDRESS','FORK_COLLECTION_ADDRESS','FORK_TOKEN_ID','FORK_MARKET_ADDRESS','FORK_FEE_RECIPIENT'])need(!!env[key],'missing explicit '+key);
 need(/^(0|[1-9][0-9]*)$/.test(env.FORK_TOKEN_ID)&&BigInt(env.FORK_TOKEN_ID)<2n**256n,'invalid FORK_TOKEN_ID');
 const result={send:argv[0]==='--send-local',execution:executionConfig(env),seller:actorAddress(env.FORK_SELLER_ADDRESS),collection:actorAddress(env.FORK_COLLECTION_ADDRESS),tokenId:env.FORK_TOKEN_ID,market:actorAddress(env.FORK_MARKET_ADDRESS),feeRecipient:actorAddress(env.FORK_FEE_RECIPIENT)};
 need(!same(result.market,result.collection),'market and collection must differ');
 return result;
}
export function buildForkOrder(input){
 const {seller,collection,tokenId,market,feeRecipient,version,counter,timestamp,blockNumber,blockHash,marketCodeHash,collectionCodeHash,salt}=input;
 const startTime=String(timestamp),endTime=String(BigInt(timestamp)+86400n);
 const parameters={offerer:seller,zone:zeroAddress,offer:[{itemType:2,token:collection,identifierOrCriteria:String(tokenId),startAmount:'1',endAmount:'1'}],consideration:[
  {itemType:0,token:zeroAddress,identifierOrCriteria:'0',startAmount:String(SELLER_PRICE_WEI),endAmount:String(SELLER_PRICE_WEI),recipient:seller},
  {itemType:0,token:zeroAddress,identifierOrCriteria:'0',startAmount:String(MARKET_FEE_WEI),endAmount:String(MARKET_FEE_WEI),recipient:feeRecipient}],orderType:0,startTime,endTime,zoneHash:zeroHash,salt:String(salt),conduitKey:zeroHash,totalOriginalConsiderationItems:'2'};
 const {totalOriginalConsiderationItems:_count,...common}=parameters;
 const envelope={schemaVersion:'1',source:{kind:'json',name:FORK_ORDER_SOURCE},sourceChainId:56,market,collection,tokenId:String(tokenId),seller,buyerPaysWei:String(BUYER_TOTAL_WEI),currency:{kind:'native',symbol:'BNB',token:zeroAddress},fees:[{kind:'seller',recipient:seller,amountWei:String(SELLER_PRICE_WEI)},{kind:'market',recipient:feeRecipient,amountWei:String(MARKET_FEE_WEI)}],nativeStartTime:startTime,nativeEndTime:endTime,quoteExpiresAt:null,validation:{status:'unknown',blockNumber:String(blockNumber),blockHash},exportedAt:input.exportedAt??new Date().toISOString(),identity:{status:'verified',marketCodeHash,collectionCodeHash,proxy:null,evidenceVersion:'fork-local-seaport-getters-v1'},protocol:'seaport',orderHash:zeroHash,seaport:{parameters,components:{...common,counter:String(counter)},signature:'0x',domain:{name:'Seaport',version,chainId:56,verifyingContract:market,domainSeparator:zeroHash}}};
 envelope.seaport.domain.domainSeparator=domainSeparator(envelope);envelope.orderHash=orderHash(envelope);
 return parseOrderEnvelope(envelope);
}
async function save(relative,value,{exclusive=false}={}){
 const file=path.join(ROOT,relative),directory=path.dirname(file);await fs.mkdir(directory,{recursive:true});
 need(await fs.realpath(directory)===directory,'output directory symlink refused');
 try{need(!(await fs.lstat(file)).isSymbolicLink(),'output symlink refused');}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.writeFile(file,serial(value),{mode:0o600,...(exclusive?{flag:'wx'}:{})});return relative;
}
export async function main(argv=process.argv.slice(2),env=process.env){
 if(argv.length===1&&argv[0]==='--help'){console.log('Local fork only; default read-only plan. --send-local impersonates the supplied seller, approves only the selected NFT, then calls real Seaport.validate with signature=0x. Required: MODE=fork, SOURCE_CHAIN_ID=EXPECTED_EXECUTION_CHAIN_ID=56, EXECUTION_RPC_URL, FORK_BLOCK_NUMBER/HASH, FORK_SELLER_ADDRESS, FORK_COLLECTION_ADDRESS, FORK_TOKEN_ID, FORK_MARKET_ADDRESS, FORK_FEE_RECIPIENT. Fixed seller price 0.3 BNB plus 0.003 BNB fee. No .env/private key/source-RPC access.');return 0;}
 let report={scope:'LOCAL_FORK_CREATED_NO_PUBLIC_SIGNATURE',status:'NOT_RUN',mainnetTransactionsSent:0,marketDatabaseWrites:0,sourceRPCWrites:0,privateKeysRead:false,publicOrderSignatureProduced:false,transactions:[]},reportFile,client,input,impersonated=false;
 try{
  input=creationInputs(argv,env);need(await fs.realpath(process.cwd())===await fs.realpath(ROOT),'run from repository root');
  client=publicClient(input.execution);const target=await verifyExecutionTarget(input.execution,client);
  const before=await client.getBlock({blockTag:'latest'}),number=before.number;
  const [owner,marketCode,collectionCode,information,counter]=await Promise.all([
   client.readContract({address:input.collection,abi:nftAbi,functionName:'ownerOf',args:[BigInt(input.tokenId)],blockNumber:number}),
   client.getCode({address:input.market,blockNumber:number}),client.getCode({address:input.collection,blockNumber:number}),
   client.readContract({address:input.market,abi:seaportAbi,functionName:'information',blockNumber:number}),client.readContract({address:input.market,abi:seaportAbi,functionName:'getCounter',args:[input.seller],blockNumber:number})]);
  need(same(owner,input.seller),'seller does not own the selected miner on this fork');
  need(marketCode&&marketCode!=='0x'&&collectionCode&&collectionCode!=='0x','market and collection must contain real fork code');
  need(same((await client.getBlock({blockNumber:number})).hash,before.hash),'initial execution checkpoint changed');
  let order=buildForkOrder({...input,version:information[0],counter,timestamp:before.timestamp,blockNumber:number,blockHash:before.hash,marketCodeHash:keccak256(marketCode),collectionCodeHash:keccak256(collectionCode),salt:BigInt('0x'+randomBytes(32).toString('hex'))});
  need(same(order.seaport.domain.domainSeparator,information[1]),'Seaport information domain differs from chain56 market/version domain');
  need(same(await client.readContract({address:input.market,abi:seaportAbi,functionName:'getOrderHash',args:[order.seaport.components],blockNumber:number}),order.orderHash),'complete order hash differs from Seaport.getOrderHash');
  const initialStatus=await client.readContract({address:input.market,abi:seaportAbi,functionName:'getOrderStatus',args:[order.orderHash],blockNumber:number});
  need(!initialStatus[0]&&!initialStatus[1]&&initialStatus[2]===0n,'fresh order hash already has state');
  const basename=`fork-created-${input.tokenId}-${order.orderHash.slice(2,18)}`;
  reportFile=`reports/${basename}.json`;
  report={...report,status:'PREPARED_NOT_EXECUTED',execution:target,orderOrigin:'fork-created',seller:input.seller,market:input.market,collection:input.collection,tokenId:input.tokenId,feeRecipient:input.feeRecipient,feeRecipientRole:'EXPLICIT_FORK_TEST_RECIPIENT_NOT_VERIFIED_MARKET_FEE_CONFIGURATION',sellerPriceWei:SELLER_PRICE_WEI,marketFeeWei:MARKET_FEE_WEI,buyerTotalWei:BUYER_TOTAL_WEI,sourcePin:{blockNumber:input.execution.forkBlockNumber,blockHash:input.execution.forkBlockHash},before:{blockNumber:number,blockHash:before.hash,timestamp:before.timestamp},orderHash:order.orderHash,marketCodeHash:keccak256(marketCode),collectionCodeHash:keccak256(collectionCode),planOrder:order,notes:['This is a fork-specific order, not an imported existing mainnet listing.','Only real Seaport code on the selected fork is used. Runtime hashes and ABI/domain checks are not a full source audit.','signature=0x cannot authorize a mainnet order; any Seaport validation occurs only inside this fork.']};
  await client.simulateContract({address:input.collection,abi:nftAbi,functionName:'approve',args:[input.market,BigInt(input.tokenId)],account:input.seller});
  await client.simulateContract({address:input.market,abi:seaportAbi,functionName:'validate',args:[[{parameters:order.seaport.parameters,signature:'0x'}]],account:input.seller});
  report.simulations='PASS';await save(reportFile,report);
  if(!input.send){console.log(serial({...report,reportFile}));return 0;}
  const wallet=createWalletClient({transport:http(input.execution.executionRpcUrl,{retryCount:0,timeout:15000})});
  const recheck=async()=>{
   await verifyExecutionTarget(input.execution,client);
   const block=await client.getBlock({blockTag:'latest'});
   const [currentOwner,currentCounter,currentCode,currentCollection,currentInformation]=await Promise.all([
    client.readContract({address:input.collection,abi:nftAbi,functionName:'ownerOf',args:[BigInt(input.tokenId)],blockNumber:block.number}),client.readContract({address:input.market,abi:seaportAbi,functionName:'getCounter',args:[input.seller],blockNumber:block.number}),client.getCode({address:input.market,blockNumber:block.number}),client.getCode({address:input.collection,blockNumber:block.number}),client.readContract({address:input.market,abi:seaportAbi,functionName:'information',blockNumber:block.number})]);
   need(same(currentOwner,input.seller)&&currentCounter===counter&&currentCode&&keccak256(currentCode)===report.marketCodeHash&&currentCollection&&keccak256(currentCollection)===report.collectionCodeHash,'fork owner, counter or runtime changed');
   need(currentInformation[0]===order.seaport.domain.version&&same(currentInformation[1],order.seaport.domain.domainSeparator)&&block.timestamp<BigInt(order.nativeEndTime),'Seaport domain or order time changed');
   need(same((await client.getBlock({blockNumber:block.number})).hash,block.hash),'execution checkpoint changed');
  };
  await recheck();await client.request({method:'anvil_impersonateAccount',params:[input.seller]});impersonated=true;report.sellerImpersonatedOnlyInFork=true;
  const transact=async(operation,address,abi,functionName,args)=>{
   await recheck();await client.simulateContract({address,abi,functionName,args,account:input.seller});
   const estimate=await client.estimateContractGas({address,abi,functionName,args,account:input.seller}),gas=estimate*12n/10n+10000n;
   need(gas<=2000000n,'local order transaction exceeds 2 million gas cap');
   const calldata=encodeFunctionData({abi,functionName,args});
   const transactionHash=await wallet.writeContract({address,abi,functionName,args,account:input.seller,chain:null,gas,gasPrice:await client.getGasPrice()});
   report.transactions.push({operation,transactionHash,to:address,from:input.seller,calldataHash:keccak256(calldata),value:'0',status:'SUBMITTED_FORK_ONLY'});await save(reportFile,report);
   const receipt=await client.waitForTransactionReceipt({hash:transactionHash,timeout:60000});
   need(receipt.status==='success'&&same(receipt.from,input.seller)&&same(receipt.to,address),'fork transaction receipt failed or identity mismatched');
   need(same((await client.getBlock({blockNumber:receipt.blockNumber})).hash,receipt.blockHash),'fork receipt is not canonical');
   Object.assign(report.transactions.at(-1),{status:'success',blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,gasUsed:receipt.gasUsed,effectiveGasPrice:receipt.effectiveGasPrice});await save(reportFile,report);return receipt;
  };
  await transact('approve-selected-nft',input.collection,nftAbi,'approve',[input.market,BigInt(input.tokenId)]);
  need(same(await client.readContract({address:input.collection,abi:nftAbi,functionName:'getApproved',args:[BigInt(input.tokenId)]}),input.market),'token-specific approval postcondition failed');
  const receipt=await transact('validate-unsigned-seaport-order',input.market,seaportAbi,'validate',[[{parameters:order.seaport.parameters,signature:'0x'}]]);
  const status=await client.readContract({address:input.market,abi:seaportAbi,functionName:'getOrderStatus',args:[order.orderHash],blockNumber:receipt.blockNumber});
  need(status[0]===true&&status[1]===false&&status[2]===0n,'unsigned order was not validated and unfilled on this fork');
  order=parseOrderEnvelope({...order,validation:{status:'verified',blockNumber:String(receipt.blockNumber),blockHash:receipt.blockHash},exportedAt:new Date().toISOString()});
  const protocol=await checkProtocol(client,order);need(protocol.executable,'created order fails fresh execution-chain checks');
  await recheck();
  await client.request({method:'anvil_stopImpersonatingAccount',params:[input.seller]});impersonated=false;
  report.impersonationStopped=true;report.status='FORK_ORDER_CREATED';report.validationCheckpoint=order.validation;report.protocol=protocol;
  report.orderFile=await save(`fixtures/${basename}.json`,order,{exclusive:true});
  report.nextEnvironment={ORDER_FILE:report.orderFile,FORK_ORDER_ORIGIN:'fork-created'};await save(reportFile,report);
  console.log(serial({...report,reportFile}));return 0;
 }catch(error){
  report={...report,status:'FAILED',reason:safeDiagnostic(error).reason};if(reportFile)try{await save(reportFile,report);}catch{}
  console.error(serial(report));return 1;
 }finally{
  if(impersonated&&client&&input)try{await verifyExecutionTarget(input.execution,client);await client.request({method:'anvil_stopImpersonatingAccount',params:[input.seller]});}catch{/* Never retry a transaction or contact any other RPC to recover. */}
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;}).catch(error=>{console.error(serial(safeDiagnostic(error)));process.exitCode=1;});
