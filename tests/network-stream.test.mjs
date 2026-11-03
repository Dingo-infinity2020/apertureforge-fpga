import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {simulate} from '../models/corner-turn.mjs';import {simulateStream,Heap} from '../models/network-stream.mjs';
const c=JSON.parse(fs.readFileSync(new URL('../config/phase1.json',import.meta.url)));
test('heap matches independent numeric sort including ties',()=>{
 const h=new Heap(),items=[9,1,3,3,8,0].map(time=>({time}));items.forEach(x=>h.push(x));
 assert.deepEqual(Array.from({length:items.length},()=>h.pop().time),items.map(x=>x.time).sort((a,b)=>a-b));
});
test('streamed all-destination execution matches batch packet oracle under delay and finite queues',()=>{
 const s={...c.scenarios[0],retained_bins:13,channels_per_destination:4};
 for(const policy of ['burst','rotated','phased','paced'])for(const jitter_us of [0,100]){
  const o={sources:7,blocks:12,policy,jitter_us,retain_all:true,source_queue_bytes:10000,switch_queue_bytes:1000};
  const a=simulate(c,s,o),b=simulateStream(c,s,o);
  for(const k of ['generated','source_dropped','switch_dropped','delivered','source_wire_bytes_generated','delivered_wire_bytes'])assert.equal(a.stats[k],b.stats[k],k);
  const sort=arr=>[...arr].sort((x,y)=>x.block-y.block||x.destination-y.destination||x.source-y.source);
  const aa=sort(a.packets),bb=sort(b.packets);assert.equal(aa.length,bb.length);
  for(let i=0;i<aa.length;i++){assert.equal(aa[i].source,bb[i].source);assert.equal(aa[i].destination,bb[i].destination);assert.ok(Math.abs(aa[i].time-bb[i].time)<1e-8);}
 }
});
