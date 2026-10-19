#!/usr/bin/env node
// Read-only receipt matching. Business success requires separate event/state checks.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {keccak256} from 'viem';

const HASH=/^0x[0-9a-fA-F]{64}$/;
const ADDRESS=/^0x[0-9a-fA-F]{40}$/;
const UINT=/^(0|[1-9][0-9]*)$/;
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
class ReceiptCheckError extends Error {constructor(code){super(code);this.receiptCheckCode=code;}}
const publicError=code=>new ReceiptCheckError(code);
const need=(ok,code)=>{if(!ok)throw publicError(code);};
const help='Read-only: node live-test/verify-receipt.mjs --env ../.env --tx 0x... --from 0x... --to 0x...|CREATE --value <wei> --data-hash 0x... [--confirmations 15]\nOnly BSC_RPC_URL is consumed from the explicit env file. No signing, broadcasting, or automatic retry. Business postconditions remain UNVERIFIED.';

export function parseArguments(argv){
  if(argv.length===1&&argv[0]==='--help')return {help:true};
  const allowed=new Set(['--env','--tx','--from','--to','--value','--data-hash','--confirmations']);
  const values={};
  for(let i=0;i<argv.length;i++){
    const flag=argv[i];
    need(allowed.has(flag),'UNSUPPORTED_ARGUMENT');
    need(!(flag in values),'DUPLICATE_ARGUMENT');
    need(typeof argv[i+1]==='string'&&!argv[i+1].startsWith('--'),'MISSING_ARGUMENT_VALUE');
    values[flag]=argv[++i];
  }
  for(const flag of ['--env','--tx','--from','--to','--value','--data-hash'])need(!!values[flag],'MISSING_REQUIRED_ARGUMENT');
  need(HASH.test(values['--tx'])&&HASH.test(values['--data-hash']),'INVALID_TRANSACTION_OR_DATA_HASH');
  need(ADDRESS.test(values['--from'])&&!/^0x0{40}$/i.test(values['--from']),'INVALID_FROM_ADDRESS');
  need(values['--to']==='CREATE'||ADDRESS.test(values['--to']),'INVALID_TO_ADDRESS');
  need(UINT.test(values['--value'])&&BigInt(values['--value'])<2n**256n,'INVALID_VALUE_WEI');
  const confirmations=values['--confirmations']??'15';
  need(UINT.test(confirmations)&&BigInt(confirmations)>=1n&&BigInt(confirmations)<=256n,'INVALID_CONFIRMATIONS');
  return {envFile:values['--env'],expected:{transactionHash:values['--tx'],from:values['--from'],to:values['--to'],valueWei:values['--value'],dataHash:values['--data-hash'],minimumConfirmations:Number(confirmations)}};
}

function missingTransaction(error){
  let current=error;
  for(let i=0;i<6&&current&&typeof current==='object';i++,current=current.cause){
    if(current.name==='TransactionNotFoundError'||current.name==='TransactionReceiptNotFoundError')return true;
  }
  return false;
}

function serialReceipt(receipt){
  return {transactionHash:receipt.transactionHash,blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,transactionIndex:receipt.transactionIndex,from:receipt.from,to:receipt.to,contractAddress:receipt.contractAddress??null,status:receipt.status,gasUsed:receipt.gasUsed,effectiveGasPrice:receipt.effectiveGasPrice,cumulativeGasUsed:receipt.cumulativeGasUsed,logs:(receipt.logs??[]).map(log=>({address:log.address,topics:log.topics,data:log.data,blockNumber:log.blockNumber,blockHash:log.blockHash,transactionHash:log.transactionHash,transactionIndex:log.transactionIndex,logIndex:log.logIndex,removed:log.removed??false}))};
}

export async function verifyReceipt(client,expected){
  const report={schemaVersion:1,scope:'READ_ONLY_LIVE_RECEIPT_MATCH',status:'NOT_PASSED',observedAt:new Date().toISOString(),expected,transactionsSent:0,privateKeysUsed:false,businessPostconditions:{status:'UNVERIFIED',reason:'Receipt success and transaction identity do not establish expected business events, asset transfers, or final balances.'},checks:{},networkEvidence:'RPC chain/client/canonical-block observations only; not an independent proof of mainnet identity.'};
  try{
    const chainId=await client.getChainId();
    report.chainId=chainId;report.checks.chain56=chainId===56;need(report.checks.chain56,'CHAIN_ID_MISMATCH');
    const version=await client.request({method:'web3_clientVersion'});
    report.checks.nonDevelopmentClient=typeof version==='string'&&version.length>0&&!/anvil|hardhat|ganache|testrpc/i.test(version);
    // Do not copy provider-supplied text into reports: it may contain credentials.
    need(report.checks.nonDevelopmentClient,'DEVELOPMENT_OR_UNKNOWN_CLIENT');
    const receipt=await client.getTransactionReceipt({hash:expected.transactionHash});
    const tx=await client.getTransaction({hash:expected.transactionHash});
    report.receipt=serialReceipt(receipt);
    report.actual={transactionHash:tx.hash,from:tx.from,to:tx.to,valueWei:tx.value,dataHash:keccak256(tx.input),blockNumber:tx.blockNumber,blockHash:tx.blockHash};
    need(typeof receipt.gasUsed==='bigint'&&receipt.gasUsed>=0n&&typeof receipt.effectiveGasPrice==='bigint'&&receipt.effectiveGasPrice>=0n,'INVALID_GAS_RECEIPT');
    report.actualGas={gasUsed:receipt.gasUsed,effectiveGasPriceWei:receipt.effectiveGasPrice,feeWei:receipt.gasUsed*receipt.effectiveGasPrice};
    report.checks.transactionHash=same(receipt.transactionHash,expected.transactionHash)&&same(tx.hash,expected.transactionHash);
    report.checks.from=same(receipt.from,expected.from)&&same(tx.from,expected.from);
    report.checks.to=expected.to==='CREATE'?receipt.to===null&&tx.to===null: same(receipt.to,expected.to)&&same(tx.to,expected.to);
    report.checks.value=tx.value===BigInt(expected.valueWei);
    report.checks.dataHash=same(report.actual.dataHash,expected.dataHash);
    report.checks.transactionChainId=tx.chainId===undefined||tx.chainId===56;
    report.checks.receiptSuccess=receipt.status==='success';
    report.checks.includedBlock=typeof receipt.blockNumber==='bigint'&&receipt.blockNumber>=0n&&tx.blockNumber===receipt.blockNumber&&HASH.test(receipt.blockHash??'')&&same(tx.blockHash,receipt.blockHash);
    if(expected.to==='CREATE')report.checks.createdAddress=ADDRESS.test(receipt.contractAddress??'')&&!/^0x0{40}$/i.test(receipt.contractAddress);
    for(const [name,matched] of Object.entries(report.checks))need(matched,`MISMATCH_${name.toUpperCase()}`);
    const canonical=await client.getBlock({blockNumber:receipt.blockNumber});
    report.checks.canonicalReceipt=same(canonical.hash,receipt.blockHash)&&canonical.number===receipt.blockNumber;
    need(report.checks.canonicalReceipt,'NON_CANONICAL_RECEIPT');
    const head=await client.getBlockNumber();
    need(typeof head==='bigint'&&head>=receipt.blockNumber,'HEAD_BEHIND_RECEIPT');
    const count=head-receipt.blockNumber+1n;
    report.confirmations={required:expected.minimumConfirmations,observed:count,headBlock:head,finality:'CONFIRMATION_COUNT_ONLY_NOT_A_FINALITY_GUARANTEE'};
    report.checks.minimumConfirmations=count>=BigInt(expected.minimumConfirmations);
    need(report.checks.minimumConfirmations,'WAITING_CONFIRMATIONS');
    // Recheck after the head read to detect a changed receipt block during observation.
    const canonicalAgain=await client.getBlock({blockNumber:receipt.blockNumber});
    report.checks.canonicalRecheck=same(canonicalAgain.hash,receipt.blockHash)&&canonicalAgain.number===receipt.blockNumber;
    need(report.checks.canonicalRecheck,'CANONICAL_BLOCK_CHANGED');
    report.status='RECEIPT_MATCHED_BUSINESS_UNVERIFIED';
    report.reasonCode='RECEIPT_IDENTITY_AND_CONFIRMATIONS_MATCH';
  }catch(error){
    report.status='NOT_PASSED';
    report.reasonCode=error instanceof ReceiptCheckError?error.receiptCheckCode:(missingTransaction(error)?'TRANSACTION_OR_RECEIPT_NOT_AVAILABLE':'RPC_READ_UNAVAILABLE_OR_INVALID_RESPONSE');
  }
  return report;
}

export async function main(argv=process.argv.slice(2)){
  let args;
  try{args=parseArguments(argv);}catch(error){console.error(JSON.stringify({status:'NOT_PASSED',reasonCode:error.receiptCheckCode??'INVALID_ARGUMENTS'}));return 1;}
  if(args.help){console.log(help);return 0;}
  try{
    // Helpers are deliberately loaded only by the CLI; pure verification tests need no env/RPC.
    const {readOnlyClientFromEnv,saveObservation,json}=await import('./preflight.mjs');
    const client=await readOnlyClientFromEnv(args.envFile);
    const report=await verifyReceipt(client,args.expected);
    const file=await saveObservation(`receipt-${args.expected.transactionHash.slice(2,18).toLowerCase()}`,report);
    console.log(json({status:report.status,reasonCode:report.reasonCode,reportFile:file,businessPostconditions:report.businessPostconditions,transactionsSent:0}));
    return report.status==='RECEIPT_MATCHED_BUSINESS_UNVERIFIED'?0:1;
  }catch{
    console.error(JSON.stringify({status:'NOT_PASSED',reasonCode:'ENV_RPC_OR_OBSERVATION_UNAVAILABLE',transactionsSent:0}));return 1;
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().then(code=>{process.exitCode=code;});
