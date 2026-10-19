import test from 'node:test';
import assert from 'node:assert/strict';
import {limitedReadProvider} from './creator-contribute.mjs';

test('all primary read requests share the global limit of eight',async()=>{
  let active=0,maximum=0;const seen=[];
  const provider=limitedReadProvider({request:async({id})=>{seen.push(id);active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setImmediate(resolve));active--;return id;}});
  const results=await Promise.all(Array.from({length:100},(_,id)=>provider.request({id})));
  assert.equal(maximum,8);assert.equal(active,0);assert.equal(seen.length,100);assert.equal(new Set(seen).size,100);assert.deepEqual(results,Array.from({length:100},(_,i)=>i));
});
test('rejected read releases its slot without retrying or blocking queued reads',async()=>{
  const counts=new Map();let active=0,maximum=0;
  const provider=limitedReadProvider({request:async({id})=>{counts.set(id,(counts.get(id)??0)+1);active++;maximum=Math.max(maximum,active);try{await new Promise(resolve=>setImmediate(resolve));if(id%7===0)throw new Error('MOCK_READ_FAILURE');return id;}finally{active--;}}});
  const results=await Promise.allSettled(Array.from({length:40},(_,id)=>provider.request({id})));
  assert.equal(maximum,8);assert.equal(active,0);assert.equal(results.filter(r=>r.status==='rejected').length,6);assert.equal(counts.size,40);assert.ok([...counts.values()].every(count=>count===1));assert.equal(await provider.request({id:41}),41);
});
for(const cap of [0,-1,1.5,17])test(`invalid read concurrency ${cap} fails closed`,()=>assert.throws(()=>limitedReadProvider({request:async()=>{}},cap),/INVALID_READ_CONCURRENCY/));
