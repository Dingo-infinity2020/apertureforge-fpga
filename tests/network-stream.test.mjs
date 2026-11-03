import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {simulate} from '../models/corner-turn.mjs';import {simulateStream,Heap} from '../models/network-stream.mjs';
import {ReceiveRing} from '../models/receive-ring.mjs';
const c=JSON.parse(fs.readFileSync(new URL('../config/phase1.json',import.meta.url)));
test('heap matches independent numeric sort including ties',()=>{
 const h=new Heap(),items=[9,1,3,3,8,0].map(time=>({time}));items.forEach(x=>h.push(x));
 assert.deepEqual(Array.from({length:items.length},()=>h.pop().time),items.map(x=>x.time).sort((a,b)=>a-b));
});
test('online destination rings equal independent offline per-destination replay, including remainder group',()=>{
 const s={...c.scenarios[0],retained_bins:13,channels_per_destination:4};
 const make=()=>new ReceiveRing({sources:7,blocks:6,depth:5,period_us:40.96,deadline_us:200,service_us:1,compact_outputs:true});
 const live=Array.from({length:4},make);
 const trace=simulateStream(c,s,{sources:7,blocks:6,retain_all:true,jitter_us:100,
  onDelivered:p=>live[p.destination].push({...p,epoch:1,config:1})});
 for(let d=0;d<4;d++){
  const offline=make();for(const p of trace.packets.filter(x=>x.destination===d))offline.push({...p,epoch:1,config:1});
  offline.advance(2000);live[d].advance(2000);
  assert.deepEqual(live[d].outputs,offline.outputs);assert.deepEqual(live[d].accounting(),offline.accounting());
  assert.ok(live[d].outputs.every(x=>x.source_bitmap_hex==='7f'));
 }
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
