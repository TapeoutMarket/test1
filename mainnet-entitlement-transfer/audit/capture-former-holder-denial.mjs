#!/usr/bin/env node
// Read-only evidence capture, only after this transfer and before the B claim.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {ContractFunctionRevertedError,createPublicClient,custom,http,keccak256,decodeErrorResult,encodeErrorResult} from 'viem';
import {guardedProvider,json} from '../../live-test/preflight.mjs';
import {limitedReadProvider} from '../../mainnet-funding/creator-contribute.mjs';
import {chainIdentity} from '../../mainnet-test/send-step.mjs';
import {loadInput} from '../entitlement.mjs';

const DIRECTORY=new URL('./',import.meta.url);
const JOURNAL=new URL('../transactions/a058f5643584aba832221e3c1da85b2bb463fbc19ca76746eb70ca248d3db05c.json',import.meta.url);
const RPC='https://bsc-dataseed.defibit.io';
const TOOL='e5669faba9b75877600266d392ffd66a3a89313572b726ba4e894c948d34ab38';

async function main(){
  assert.equal(process.argv.length,2,'THIS_READ_ONLY_CAPTURE_ACCEPTS_NO_ARGUMENTS');
  const journal=JSON.parse(await fs.readFile(JOURNAL,'utf8'));
  assert.equal(journal.steps.length,2,'CAPTURE_ONLY_AFTER_TRANSFER_AND_BEFORE_B_CLAIM');
  const [harvest,transfer]=journal.steps;
  assert.equal(harvest.status,'CONFIRMED');assert.equal(transfer.status,'CONFIRMED');
  assert.equal(transfer.step,'transfer-share');assert.equal(transfer.entitlementToolHash,TOOL);
  assert.equal(transfer.after.formerHolderDenied?.status,'PASS');
  const input=await loadInput({sessionFile:'mainnet-test/session.json',step:'buyer-b-claim',publicRpcFallback:true});
  assert.equal(input.toolHash,TOOL);
  const client=createPublicClient({transport:custom(limitedReadProvider(guardedProvider(http(RPC,{retryCount:0,timeout:20000})({})),8),{retryCount:0})});
  const identity=await chainIdentity(client,input);
  const block=await client.getBlock({blockTag:'latest'}),at={blockNumber:block.number};
  const read=(functionName,args=[])=>client.readContract({address:input.action.pool,abi:input.vaultAbi,functionName,args,...at});
  const [holder,creatorBalance,buyerBBalance,claimedRaw,claimableRaw,accPerShareRaw,code]=await Promise.all([
    read('holderOf',[1n]),read('balanceOf',[input.session.creator,1n]),read('balanceOf',[input.session.buyerB,1n]),
    read('claimed',[1n]),read('claimable',[1n]),read('accPerShare'),client.getCode({address:input.action.pool,...at}),
  ]);
  assert.equal(holder.toLowerCase(),input.session.buyerB.toLowerCase());
  assert.equal(creatorBalance,0n);assert.equal(buyerBBalance,1n);
  assert.equal(claimedRaw,136654n);assert.equal(claimableRaw,323n);assert.equal(accPerShareRaw,136977n);
  assert.equal(keccak256(code),input.manifest.vault.codeHash);
  let revert;
  try{await client.simulateContract({address:input.action.pool,abi:input.vaultAbi,account:input.session.creator,functionName:'claim',args:[1n],...at,gas:3000000n,value:0n});}
  catch(error){for(let current=error,i=0;i<10&&current&&typeof current==='object';i++,current=current.cause)if(current instanceof ContractFunctionRevertedError){revert=current;break;}}
  assert.ok(revert,'EXPECTED_TYPED_CONTRACT_REVERT_REQUIRED');
  assert.equal(revert.raw,encodeErrorResult({abi:input.vaultAbi,errorName:'NotHolder'}));
  const decoded=decodeErrorResult({abi:input.vaultAbi,data:revert.raw});assert.equal(decoded.errorName,'NotHolder');
  assert.equal((await client.getBlock(at)).hash,block.hash);
  const result={schemaVersion:1,status:'PASS',scope:'LIVE_READ_ONLY_FORMER_HOLDER_DENIAL',observedAt:new Date().toISOString(),chainId:56,rpcEndpoint:RPC,identity,
    blockNumber:String(block.number),blockHash:block.hash,timestamp:String(block.timestamp),vault:input.action.pool,account:input.session.creator,newHolder:input.session.buyerB,
    functionName:'claim',args:['1'],callValueWei:'0',callGas:'3000000',rawRevertData:revert.raw,decodedErrorName:decoded.errorName,decodedArgs:decoded.args??[],
    state:{holder,creatorBalance:String(creatorBalance),buyerBBalance:String(buyerBBalance),claimedRaw:String(claimedRaw),claimableRaw:String(claimableRaw),accPerShareRaw:String(accPerShareRaw),vaultCodeHash:keccak256(code)},
    transferTransactionHash:transfer.transactionHash,transferEntryHash:keccak256(Buffer.from(json(transfer))),transferReceiptBlockNumber:String(transfer.receipt.blockNumber),
    sourceHash:TOOL,scriptSha256:createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'),transactionsSent:0,privateKeysUsed:false};
  await fs.writeFile(new URL('former-holder-denial-live.json',DIRECTORY),json(result),{mode:0o600});
  console.log(json({status:result.status,output:'mainnet-entitlement-transfer/audit/former-holder-denial-live.json',blockNumber:result.blockNumber,rawRevertData:result.rawRevertData,decodedErrorName:result.decodedErrorName,claimedRaw:result.state.claimedRaw,claimableRaw:result.state.claimableRaw,transactionsSent:0,privateKeysUsed:false}));
}
main().catch(()=>{console.error(json({status:'STOPPED_READ_ONLY_CAPTURE',reason:'PREREQUISITE_OR_LIVE_PROOF_DID_NOT_MATCH',transactionsSent:0,privateKeysUsed:false}));process.exitCode=1;});
