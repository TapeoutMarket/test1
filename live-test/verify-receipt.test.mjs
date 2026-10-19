import test from 'node:test';
import assert from 'node:assert/strict';
import {keccak256} from 'viem';
import {parseArguments,verifyReceipt} from './verify-receipt.mjs';

const txHash=`0x${'aa'.repeat(32)}`,blockHash=`0x${'bb'.repeat(32)}`,changedHash=`0x${'cc'.repeat(32)}`;
const from=`0x${'11'.repeat(20)}`,to=`0x${'22'.repeat(20)}`,created=`0x${'33'.repeat(20)}`;
const input='0x12345678';
const expected={transactionHash:txHash,from,to,valueWei:'303000000000000000',dataHash:keccak256(input),minimumConfirmations:15};
const argv=['--env','../.env','--tx',txHash,'--from',from,'--to',to,'--value',expected.valueWei,'--data-hash',expected.dataHash];

function fixture({chainId=56,version='Geth/test',receiptChange={},txChange={},head=114n,blockHashes=[blockHash,blockHash],receiptError}={}){
  const calls=[];let reads=0;
  const receipt={transactionHash:txHash,blockNumber:100n,blockHash,transactionIndex:0,from,to,contractAddress:null,status:'success',gasUsed:21000n,effectiveGasPrice:50000000n,cumulativeGasUsed:21000n,logs:[{address:to,topics:[txHash],data:'0x',blockNumber:100n,blockHash,transactionHash:txHash,transactionIndex:0,logIndex:0,removed:false}],...receiptChange};
  const tx={hash:txHash,from,to,value:BigInt(expected.valueWei),input,blockNumber:100n,blockHash,chainId:56,...txChange};
  const client={
    getChainId:async()=>{calls.push('getChainId');return chainId;},
    request:async request=>{calls.push(request.method);assert.equal(request.method,'web3_clientVersion');return version;},
    getTransactionReceipt:async request=>{calls.push('getTransactionReceipt');assert.equal(request.hash,txHash);if(receiptError)throw receiptError;return receipt;},
    getTransaction:async request=>{calls.push('getTransaction');assert.equal(request.hash,txHash);return tx;},
    getBlock:async request=>{calls.push('getBlock');assert.equal(request.blockNumber,100n);return {number:100n,hash:blockHashes[Math.min(reads++,blockHashes.length-1)]};},
    getBlockNumber:async()=>{calls.push('getBlockNumber');return head;},
  };
  return {client,calls};
}

test('requires all expected transaction fields and explicitly supplied env file',()=>{
  const parsed=parseArguments(argv);assert.equal(parsed.envFile,'../.env');assert.deepEqual(parsed.expected,expected);
  for(let i=0;i<argv.length;i+=2)assert.throws(()=>parseArguments([...argv.slice(0,i),...argv.slice(i+2)]));
});
test('rejects broadcast, signing, unknown, duplicate and malformed parameters',()=>{
  for(const extra of [['--broadcast'],['--send-local'],['--private-key','0xsecret'],['--tx',txHash],['--confirmations','0'],['--confirmations','257'],['--confirmations','1.5']])assert.throws(()=>parseArguments([...argv,...extra]));
  for(const [flag,value] of [['--tx','0x123'],['--from',`0x${'00'.repeat(20)}`],['--to','create'],['--value','0.3'],['--value','-1'],['--value',String(2n**256n)],['--data-hash','0x']]){const copy=[...argv];copy[copy.indexOf(flag)+1]=value;assert.throws(()=>parseArguments(copy));}
  assert.deepEqual(parseArguments(['--help']),{help:true});assert.throws(()=>parseArguments(['--help','--broadcast']));
});
test('accepts an explicit confirmation count and CREATE destination',()=>{
  const copy=[...argv,'--confirmations','1'];copy[copy.indexOf('--to')+1]='CREATE';
  assert.equal(parseArguments(copy).expected.to,'CREATE');assert.equal(parseArguments(copy).expected.minimumConfirmations,1);
});
test('matches canonical successful receipt and actual gas, leaving business UNVERIFIED',async()=>{
  const {client,calls}=fixture();const result=await verifyReceipt(client,expected);
  assert.equal(result.status,'RECEIPT_MATCHED_BUSINESS_UNVERIFIED');assert.equal(result.businessPostconditions.status,'UNVERIFIED');
  assert.equal(result.actualGas.feeWei,1050000000000n);assert.equal(result.confirmations.observed,15n);assert.equal(result.receipt.logs.length,1);assert.equal(result.transactionsSent,0);
  assert.deepEqual(new Set(calls),new Set(['getChainId','web3_clientVersion','getTransactionReceipt','getTransaction','getBlock','getBlockNumber']));
});
test('CREATE requires null transaction and receipt destinations',async()=>{
  const ok=await verifyReceipt(fixture({txChange:{to:null},receiptChange:{to:null,contractAddress:created}}).client,{...expected,to:'CREATE'});
  assert.equal(ok.status,'RECEIPT_MATCHED_BUSINESS_UNVERIFIED');assert.equal(ok.receipt.contractAddress,created);
  const bad=await verifyReceipt(fixture().client,{...expected,to:'CREATE'});assert.equal(bad.reasonCode,'MISMATCH_TO');
  const absent=await verifyReceipt(fixture({txChange:{to:null},receiptChange:{to:null}}).client,{...expected,to:'CREATE'});assert.equal(absent.reasonCode,'MISMATCH_CREATEDADDRESS');
});
test('refuses non-BSC and development clients without requesting any receipt',async()=>{
  for(const settings of [{chainId:1},{version:'anvil/v1.4.3'},{version:'HardhatNetwork'},{version:'Ganache'},{version:''}]){
    const {client,calls}=fixture(settings);const result=await verifyReceipt(client,expected);
    assert.equal(result.status,'NOT_PASSED');assert.equal(calls.includes('getTransactionReceipt'),false);
  }
});
test('fails each transaction identity, receipt identity, revert and inclusion mismatch',async()=>{
  const cases=[{txChange:{hash:changedHash}},{receiptChange:{transactionHash:changedHash}},{txChange:{from:created}},{receiptChange:{from:created}},{txChange:{to:created}},{receiptChange:{to:created}},{txChange:{value:0n}},{txChange:{input:'0x'}},{txChange:{chainId:1}},{receiptChange:{status:'reverted'}},{txChange:{blockHash:changedHash}},{txChange:{blockNumber:null}}];
  for(const settings of cases){const result=await verifyReceipt(fixture(settings).client,expected);assert.equal(result.status,'NOT_PASSED');assert.match(result.reasonCode,/^MISMATCH_/);}
  const reverted=await verifyReceipt(fixture({receiptChange:{status:'reverted'}}).client,expected);assert.equal(reverted.actualGas.feeWei,1050000000000n);
});
test('insufficient confirmations are explicitly not passed with observed count',async()=>{
  const result=await verifyReceipt(fixture({head:101n}).client,expected);
  assert.equal(result.status,'NOT_PASSED');assert.equal(result.reasonCode,'WAITING_CONFIRMATIONS');assert.equal(result.confirmations.observed,2n);
});
test('rejects noncanonical receipt and a reorg during observation',async()=>{
  assert.equal((await verifyReceipt(fixture({blockHashes:[changedHash]}).client,expected)).reasonCode,'NON_CANONICAL_RECEIPT');
  assert.equal((await verifyReceipt(fixture({blockHashes:[blockHash,changedHash]}).client,expected)).reasonCode,'CANONICAL_BLOCK_CHANGED');
  assert.equal((await verifyReceipt(fixture({head:99n}).client,expected)).reasonCode,'HEAD_BEHIND_RECEIPT');
});
test('missing receipt and provider failures remain unverified and redact sensitive details',async()=>{
  const secret='https://private.example/API_KEY_DO_NOT_LOG';
  const missing=Object.assign(new Error(secret),{name:'TransactionReceiptNotFoundError'});
  assert.equal((await verifyReceipt(fixture({receiptError:missing}).client,expected)).reasonCode,'TRANSACTION_OR_RECEIPT_NOT_AVAILABLE');
  const result=await verifyReceipt(fixture({receiptError:new Error(secret)}).client,expected);
  assert.equal(result.reasonCode,'RPC_READ_UNAVAILABLE_OR_INVALID_RESPONSE');assert.equal(JSON.stringify(result).includes(secret),false);
  const hostile=await verifyReceipt(fixture({receiptError:Object.assign(new Error(secret),{receiptCheckCode:secret})}).client,expected);assert.equal(hostile.reasonCode,'RPC_READ_UNAVAILABLE_OR_INVALID_RESPONSE');
  const client=fixture({version:`Geth/${secret}`}).client;const matched=await verifyReceipt(client,expected);
  assert.equal(JSON.stringify(matched,(_,value)=>typeof value==='bigint'?String(value):value).includes(secret),false);
});
