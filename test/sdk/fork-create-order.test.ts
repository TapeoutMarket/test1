import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFunctionData,encodeFunctionData} from 'viem';
const creator=await import(new URL('../../scripts/fork-create-order.mjs',import.meta.url).href);
const address=(n:number)=>`0x${n.toString(16).padStart(40,'0')}`;
const hash=`0x${'11'.repeat(32)}`;
const env={MODE:'fork',SOURCE_CHAIN_ID:'56',EXPECTED_EXECUTION_CHAIN_ID:'56',EXECUTION_RPC_URL:'http://127.0.0.1:18545',FORK_BLOCK_NUMBER:'100',FORK_BLOCK_HASH:hash,FORK_SELLER_ADDRESS:address(1),FORK_COLLECTION_ADDRESS:address(2),FORK_TOKEN_ID:'3204',FORK_MARKET_ADDRESS:address(3),FORK_FEE_RECIPIENT:address(4)};
const data=()=>({seller:address(1),collection:address(2),tokenId:'3204',market:address(3),feeRecipient:address(4),version:'1.6',counter:7n,timestamp:10000n,blockNumber:105n,blockHash:hash,marketCodeHash:hash,collectionCodeHash:hash,salt:123n,exportedAt:'2026-10-19T00:00:00.000Z'});
test('fork order creator defaults to plan and permits only explicit same-computer fork sending',()=>{
 assert.equal(creator.creationInputs([],env).send,false);assert.equal(creator.creationInputs(['--send-local'],env).send,true);
 for(const args of [['--broadcast'],['--private-key','secret'],['--send-local','--send-local']])assert.throws(()=>creator.creationInputs(args,env));
 for(const changed of [{MODE:'live'},{MODE:'mock'},{SOURCE_CHAIN_ID:'1'},{EXECUTION_RPC_URL:'https://remote.invalid'},{EXECUTION_RPC_URL:'http://192.168.1.5:8545'},{FORK_EXECUTION_TOPOLOGY:'lan-relay'},{FORK_TOKEN_ID:'-1'},{FORK_BLOCK_HASH:undefined}])assert.throws(()=>creator.creationInputs([],{...env,...changed}));
});
test('fork order envelope fixes 0.3 BNB seller plus 1 percent fee and a one-day unsigned expiry',()=>{
 const order=creator.buildForkOrder(data());
 assert.equal(order.source.kind,'json');assert.equal(order.source.name,'LOCAL_FORK_CREATED_NO_PUBLIC_SIGNATURE');
 assert.equal(order.seaport.signature,'0x');assert.equal(order.validation.status,'unknown');
 assert.equal(order.fees[0].amountWei,'300000000000000000');assert.equal(order.fees[1].amountWei,'3000000000000000');assert.equal(order.buyerPaysWei,'303000000000000000');
 assert.equal(BigInt(order.nativeEndTime)-BigInt(order.nativeStartTime),86400n);assert.equal(order.seaport.components.counter,'7');
 assert.equal(order.validation.blockNumber,'105');assert.equal(order.seaport.parameters.totalOriginalConsiderationItems,'2');
});
test('real Seaport validate ABI encodes the full unsigned order and canonical components',()=>{
 const order=creator.buildForkOrder(data());
 const encoded=encodeFunctionData({abi:creator.seaportAbi,functionName:'validate',args:[[{parameters:order.seaport.parameters,signature:'0x'}]]});
 const decoded=decodeFunctionData({abi:creator.seaportAbi,data:encoded});
 assert.equal(decoded.functionName,'validate');
 const arg=(decoded.args as unknown as [{signature:string;parameters:{totalOriginalConsiderationItems:bigint}}[]])[0][0];
 assert.equal(arg.signature,'0x');assert.equal(arg.parameters.totalOriginalConsiderationItems,2n);
 const hashCall=encodeFunctionData({abi:creator.seaportAbi,functionName:'getOrderHash',args:[order.seaport.components]});
 assert.equal(decodeFunctionData({abi:creator.seaportAbi,data:hashCall}).functionName,'getOrderHash');
});
