import test from 'node:test';
import assert from 'node:assert/strict';
const helper=await import(new URL('../../scripts/fork-prepare.mjs',import.meta.url).href);
test('fork preparation bounds default deadline by order and one hour',()=>{
 assert.equal(helper.selectDeadline({},'10000',1000n).deadline,4600n);
 assert.equal(helper.selectDeadline({},'1600',1000n).deadline,1300n);
});
test('fork preparation rejects impossible or injected deadline and margin values',()=>{
 for(const env of [{FORK_DEADLINE:'1001'},{FORK_DEADLINE:'999999'},{FORK_DEADLINE:'$(wrong)'},{FORK_SAFETY_MARGIN:'0'},{FORK_SAFETY_MARGIN:'-1'},{FORK_SAFETY_MARGIN:(2n**64n).toString()}])assert.throws(()=>helper.selectDeadline(env,'2000',1000n));
 assert.throws(()=>helper.selectDeadline({},'1100',1000n));
});
test('fork preparation accepts explicit bounded deadline and has no send flag',async()=>{
 assert.equal(helper.selectDeadline({FORK_DEADLINE:'1400',FORK_SAFETY_MARGIN:'50'},'1600',1000n).deadline,1400n);
 await assert.rejects(helper.main(['--broadcast'],{}));
 await assert.rejects(helper.main(['--send-local'],{}));
});
const pinHash=`0x${'11'.repeat(32)}`,forkHash=`0x${'22'.repeat(32)}`;
const baseEnv={FORK_BLOCK_NUMBER:'100',FORK_BLOCK_HASH:pinHash};
const input=(local=false)=>({protocol:'seaport',source:{kind:'json',name:local?'LOCAL_FORK_CREATED_NO_PUBLIC_SIGNATURE':'external-order'},seaport:{signature:local?'0x':'0x1234'},validation:{status:'verified',blockNumber:local?'102':'100',blockHash:local?forkHash:pinHash}});
const blockClient=(number=102n,hash=forkHash)=>({getBlock:async()=>({number,hash})});
test('external order validation remains pinned to the original source block',async()=>{
 assert.equal((await helper.verifyOrderCheckpoint(input(),baseEnv,blockClient(100n,pinHash))).origin,'external');
 await assert.rejects(helper.verifyOrderCheckpoint(input(true),baseEnv,blockClient()),/explicit FORK_ORDER_ORIGIN/);
 await assert.rejects(helper.verifyOrderCheckpoint({...input(),validation:{status:'verified',blockNumber:'102',blockHash:forkHash}},baseEnv,blockClient()),/pinned fork block/);
});
test('fork-created orders require explicit origin and a real canonical post-pin checkpoint',async()=>{
 const env={...baseEnv,FORK_ORDER_ORIGIN:'fork-created'};
 const result=await helper.verifyOrderCheckpoint(input(true),env,blockClient());
 assert.equal(result.stateScope,'LOCAL_FORK_CREATED_NO_PUBLIC_SIGNATURE');assert.equal(result.blockNumber,102n);assert.equal(result.sourcePin,100n);
 await assert.rejects(helper.verifyOrderCheckpoint(input(true),env,blockClient(102n,pinHash)),/not canonical/);
 await assert.rejects(helper.verifyOrderCheckpoint(input(true),env,blockClient(103n)),/not canonical/);
 await assert.rejects(helper.verifyOrderCheckpoint({...input(true),validation:{status:'verified',blockNumber:'99',blockHash:forkHash}},env,blockClient(99n)),/cannot precede/);
 await assert.rejects(helper.verifyOrderCheckpoint(input(),env,blockClient(100n,pinHash)),/unsigned validated order marker/);
 await assert.rejects(helper.verifyOrderCheckpoint({...input(true),seaport:{signature:'0xab'}},env,blockClient()),/unsigned validated order marker/);
 await assert.rejects(helper.verifyOrderCheckpoint(input(true),{...env,FORK_ORDER_ORIGIN:'any'},blockClient()),/invalid FORK_ORDER_ORIGIN/);
});
