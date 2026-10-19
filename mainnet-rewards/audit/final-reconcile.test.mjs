import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {encodeAbiParameters,encodeEventTopics,zeroAddress} from 'viem';
import {readiness,reconcileMath,decodeRewardReceipt} from './final-reconcile.mjs';

// Public static inputs and compiled ABI only. No real journal, budget, env or RPC.
const readJson=async file=>JSON.parse(await fs.readFile(new URL(file,import.meta.url),'utf8'));
const [session,manifest,vaultArtifact,bemArtifact]=await Promise.all([
  readJson('../../mainnet-test/session.json'),readJson('../../mainnet-test/live-manifest.json'),
  readJson('../../out/GroupBuyVault.sol/GroupBuyVault.json'),readJson('../../out/IERC20.sol/IERC20.json'),
]);
const vaultAbi=vaultArtifact.abi,bemAbi=bemArtifact.abi,clone=value=>structuredClone(value);
const H='0x'+'ab'.repeat(32),TX='0x'+'cd'.repeat(32),OTHER='0x0000000000000000000000000000000000000099';
const baseline=()=>({receivedRaw:'12345',perShareRaw:'123',remainderRaw:'45',decimals:8});
function input(step='harvest'){
  const ids=step==='harvest'?[]:Array.from({length:step==='creator-claim'?67:33},(_,n)=>BigInt(n+(step==='creator-claim'?1:68)));
  return {session,manifest,vaultAbi,bemAbi,action:{step,pool:session.pool.address,from:step==='buyer-b-claim'?session.buyerB:session.creator,ids}};
}
function log(abi,name,address,args,index){
  const event=abi.find(e=>e.type==='event'&&e.name===name),plain=event.inputs.filter(p=>!p.indexed);
  return {address,topics:encodeEventTopics({abi:[event],eventName:name,args}),data:encodeAbiParameters(plain,plain.map(p=>args[p.name])),
    transactionHash:TX,blockHash:H,blockNumber:100n,transactionIndex:2,logIndex:index,removed:false};
}
function receipt(i){
  const pool=i.action.pool,sync=(args,index)=>log(vaultAbi,'RewardsSynced',pool,args,index);
  const transfer=(args,index)=>log(bemAbi,'Transfer',manifest.config.bem,args,index);
  const logs=i.action.step==='harvest'?[
    sync({received:0n,totalAccounted:0n,accPerShare:0n,remainder:0n},1),
    transfer({from:zeroAddress,to:pool,value:12345n},2),
    sync({received:12345n,totalAccounted:12345n,accPerShare:123n,remainder:45n},3),
    log(vaultAbi,'Harvested',pool,{caller:i.action.from,received:12345n},4),
  ]:[
    sync({received:0n,totalAccounted:12345n,accPerShare:123n,remainder:45n},1),
    ...i.action.ids.map((id,n)=>log(vaultAbi,'RewardClaimed',pool,{holder:i.action.from,id,amount:123n},n+2)),
    transfer({from:pool,to:i.action.from,value:BigInt(i.action.ids.length)*123n},i.action.ids.length+2),
  ];
  return {status:'success',transactionHash:TX,blockHash:H,blockNumber:100n,transactionIndex:2,logs};
}
test('readiness requires exactly three ordered CONFIRMED positive steps',()=>{
  const journal={steps:['harvest','creator-claim','buyer-b-claim'].map(step=>({step,status:'CONFIRMED',positiveTest:{status:'PASS'}}))};
  assert.equal(readiness(journal).ready,true);assert.equal(readiness(undefined).ready,false);
  for(const change of [j=>j.steps.pop(),j=>j.steps.reverse(),j=>j.steps[2].status='SUBMITTED',j=>j.steps[0].positiveTest.status='FAIL',j=>j.steps.push(clone(j.steps[2]))]){
    const j=clone(journal);change(j);assert.equal(readiness(j).ready,false);
  }
});
test('integer distribution reconciles 67q plus33q plus remainder to actual harvest',()=>{
  const result=reconcileMath(baseline(),'8241','4059','45');
  assert.equal(result.harvested.raw,'12345');assert.equal(result.sumPaymentsPlusRemainder,'12345');
  assert.equal(result.creatorTimes33,result.buyerTimes67);assert.equal(result.vaultRemainder.raw,'45');
});
test('math rejects shifted allocation, incorrect remainder and zero or invalid checkpoint',()=>{
  for(const args of [[baseline(),'8242','4058','45'],[baseline(),'8241','4059','46'],
    [{...baseline(),perShareRaw:'124'},'8241','4059','45'],[{...baseline(),decimals:18},'8241','4059','45'],
    [{receivedRaw:'99',perShareRaw:'0',remainderRaw:'99',decimals:8},'0','0','99']])assert.throws(()=>reconcileMath(...args));
});
test('independent raw harvest decode requires exact mint source, amount and zero initial sync',()=>{
  const i=input(),r=receipt(i),result=decodeRewardReceipt(r,i);assert.deepEqual(result.baseline,baseline());assert.equal(result.claimCount,0);
  for(const args of [{from:manifest.config.mining,to:i.action.pool,value:12345n},{from:zeroAddress,to:OTHER,value:12345n},{from:zeroAddress,to:i.action.pool,value:12346n}]){
    const changed=receipt(i);changed.logs[1]=log(bemAbi,'Transfer',manifest.config.bem,args,2);assert.throws(()=>decodeRewardReceipt(changed,i));
  }
  const donated=receipt(i);donated.logs[0]=log(vaultAbi,'RewardsSynced',i.action.pool,{received:1n,totalAccounted:1n,accPerShare:0n,remainder:1n},1);
  assert.throws(()=>decodeRewardReceipt(donated,i));
});
test('both claims decode every due ID and reject missing share, extra inflow or changed payment',()=>{
  for(const [step,count,payment]of [['creator-claim',67,'8241'],['buyer-b-claim',33,'4059']]){
    const i=input(step),r=receipt(i),result=decodeRewardReceipt(r,i,baseline());assert.equal(result.claimCount,count);assert.equal(result.paymentRaw,payment);
    for(const change of [v=>v.logs.splice(1,1),v=>v.logs[0]=log(vaultAbi,'RewardsSynced',i.action.pool,{received:1n,totalAccounted:12345n,accPerShare:123n,remainder:45n},1),
      v=>v.logs[v.logs.length-1]=log(bemAbi,'Transfer',manifest.config.bem,{from:i.action.pool,to:i.action.from,value:1n},count+2)]){
      const altered=receipt(i);change(altered);assert.throws(()=>decodeRewardReceipt(altered,i,baseline()));
    }
  }
});
test('saved receipt logs reject foreign block, transaction index, duplicate index and reverted status',()=>{
  const i=input();
  for(const change of [r=>r.status='reverted',r=>r.logs[1].blockNumber=101n,r=>r.logs[1].transactionIndex=3,r=>r.logs[1].logIndex=1,r=>r.logs[1].transactionHash=H]){
    const r=receipt(i);change(r);assert.throws(()=>decodeRewardReceipt(r,i));
  }
});
