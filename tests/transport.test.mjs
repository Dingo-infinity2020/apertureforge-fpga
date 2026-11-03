import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {simulate} from '../models/corner-turn.mjs';
import {ReceiveRing} from '../models/receive-ring.mjs';
const c=JSON.parse(fs.readFileSync(new URL('../config/phase1.json',import.meta.url)));
test('small network matches independent per-link list schedule',()=>{
 const s={...c.scenarios[0],retained_bins:5,channels_per_destination:2};
 const tiny={...c,line_bps:1e9};const r=simulate(tiny,s,{sources:3,blocks:3,policy:'burst',retain_all:true});
 const input=[];const period=s.hop/s.complex_hz*s.spectra_per_packet*1e6;
 for(let src=0;src<3;src++){let free=0;for(let b=0;b<3;b++)for(let d=0;d<3;d++){
  const bytes=(d===2?1:2)*8*2*2+130;free=Math.max(free,(b+1)*period)+bytes*8/1000;
  input.push({source:src,block:b,destination:d,time:free+1,bytes});}}
 const expected=[];for(let d=0;d<3;d++){let free=0;for(const p of input.filter(p=>p.destination===d).sort((a,b)=>a.time-b.time||a.source-b.source)){
  free=Math.max(free,p.time)+p.bytes*8/1000;expected.push({...p,time:free});}}
 expected.sort((a,b)=>a.time-b.time||a.source-b.source);
 assert.equal(r.packets.length,expected.length);for(let i=0;i<expected.length;i++)assert.ok(Math.abs(r.packets[i].time-expected[i].time)<1e-8);
});
test('analytic byte/packet accounting and overload control',()=>{
 const s=c.scenarios[0];const r=simulate(c,s,{blocks:8,policy:'paced'});
 assert.equal(r.stats.generated,256*74*8);assert.equal(r.stats.source_dropped+r.stats.switch_dropped,0);
 assert.equal(r.stats.source_wire_bytes_generated,256*8*(8*4096*2*2+74*130));
 const overload=simulate(c,{...s,spectra_per_packet:1},{blocks:24,policy:'burst',switch_queue_bytes:65536});
 assert.ok(overload.stats.switch_dropped>0);
 const limited=simulate(c,s,{sources:4,blocks:2,source_queue_bytes:100});assert.ok(limited.stats.source_dropped>0);
 const banks=simulate(c,s,{blocks:8,policy:'paced',source_assembly_banks:2});assert.ok(banks.stats.source_assembly_dropped>0);
});
const options={sources:3,blocks:6,depth:3,period_us:10,deadline_us:15,service_us:2};
test('ring reorders, releases by fixed deadlines, tracks duplicate/loss and wraps generations',()=>{
 const r=new ReceiveRing(options);
 const p=(block,source,time)=>({epoch:1,config:1,block,source,time});
 assert.equal(r.push(p(0,1,11)),'accepted');assert.equal(r.push(p(0,1,12)),'duplicate');
 r.push(p(1,2,13));r.push(p(0,0,14));r.push(p(0,2,15));r.push(p(1,0,21));
 r.advance(40);assert.equal(r.push(p(0,0,40)),'late');
 for(let b=3;b<6;b++)for(let src=0;src<3;src++)r.push(p(b,src,40+(b-3)*10+src));
 r.advance(200);const a=r.accounting();assert.equal(a.resident,0);assert.equal(r.outputs.length,6);
 assert.deepEqual(r.outputs[0].sources,[0,1,2]);assert.deepEqual(r.outputs[1].sources,[0,2]);
 assert.equal(r.outputs[2].valid_sources,0);assert.equal(a.reasons.duplicate,1);assert.equal(a.reasons.late,1);
 for(const out of r.outputs)assert.equal(new Set(out.sources).size,out.sources.length);
});
test('ahead, source error, session change and finite slots under downstream pauses',()=>{
 const r=new ReceiveRing({...options,depth:2,pauses:[[0,60]]});
 const p=(b,s,t,e=1)=>({block:b,source:s,time:t,epoch:e,config:1});
 assert.equal(r.push(p(5,0,1)),'ahead');assert.equal(r.push(p(0,7,2)),'format');
 assert.equal(r.push(p(0,0,3,2)),'session');
 for(let src=0;src<3;src++)r.push(p(0,src,10+src));r.push(p(1,0,20));
 assert.equal(r.push(p(2,0,21)),'ahead');assert.ok(r.accounting().peak_slots<=2);
 r.switchSession(22,2,2);assert.equal(r.accounting().resident,0);assert.equal(r.accounting().discarded,4);
 assert.equal(r.push(p(0,1,23)),'session');
 assert.equal(r.push({block:0,source:0,time:33,epoch:2,config:2}),'accepted');
 r.advance(300);assert.equal(r.accounting().consumed,1);assert.equal(r.outputs[0].epoch,2);
});
test('window full has explicit loss accounting during stalled service',()=>{
 const r=new ReceiveRing({...options,depth:2,pauses:[[0,100]]});
 for(let src=0;src<3;src++)r.push({time:11+src,epoch:1,config:1,block:0,source:src});
 assert.equal(r.push({time:31,epoch:1,config:1,block:2,source:0}),'window_full');
 r.advance(300);assert.equal(r.accounting().reasons.window_full,1);assert.equal(r.accounting().resident,0);
});
test('fault traces match independent group/filter oracle with nonbinding depth',()=>{
 for(let seed=1;seed<=40;seed++){
  const r=new ReceiveRing({sources:8,blocks:17,depth:17,period_us:10,deadline_us:40});
  let state=seed;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  const events=[];
  for(let b=0;b<17;b++)for(let src=0;src<8;src++){
   if(rand()<0.12)continue;
   const p={epoch:1,config:1,block:b,source:src,time:(b+1)*10+rand()*60};events.push(p);
   if(rand()<0.2)events.push({...p,time:p.time+0.01});
  }
  events.sort((a,b)=>a.time-b.time);
  for(const p of events)r.push(p);r.advance(1000);r.accounting();
  for(let b=0;b<17;b++){
   const expected=[...new Set(events.filter(x=>x.block===b&&x.time<(b+1)*10+40).map(x=>x.source))].sort((a,b)=>a-b);
   assert.deepEqual(r.outputs[b].sources,expected);
  }
 }
});
test('all-missing blocks expire, exact deadline arrivals are late; arrival order independent source membership',()=>{
 const r=new ReceiveRing(options);assert.equal(r.push({time:25,epoch:1,config:1,block:0,source:0}),'late');
 r.advance(200);assert.equal(r.outputs.length,6);assert.equal(r.accounting().missing,18);
 for(const order of [[0,1,2],[2,0,1]]){
  const x=new ReceiveRing(options);order.forEach((source,i)=>x.push({time:11+i,epoch:1,config:1,block:0,source}));
  x.advance(200);assert.deepEqual(x.outputs[0].sources,[0,1,2]);assert.equal(x.accounting().consumed,3);
 }
});
