import test from 'node:test';import assert from 'node:assert/strict';import {ArrivalBeam} from '../models/arrival-beam.mjs';
import {simulateStream} from '../models/network-stream.mjs';import {encode,decode,validate} from '../models/packet.mjs';
const weights=(bias=0)=>Array.from({length:2},(_,f)=>Array.from({length:24},(_,i)=>Array.from({length:2},(_,b)=>[i%3?32767:-32768,(f+i+b+bias)%7-3])));
const packet=(src,block,time,epoch=1,config=1)=>{const body=Buffer.alloc(2*2*8*2);for(let k=0;k<body.length;k++)body.writeInt8((k*17+src*13+block)%256-128,k);return {source:src,block,time,body,epoch,config};};
function reference(packets,w){
 const out=[];for(let t=0;t<2;t++)for(let f=0;f<2;f++)for(let b=0;b<2;b++)for(let pol=0;pol<2;pol++){
  let real=0n,imag=0n;
  for(let input=pol;input<24;input+=2){const p=packets.find(x=>x.source===Math.floor(input/8));if(!p)continue;
   const l=input%8,index=(t*16+f*8+l)*2,z=[p.body.readInt8(index),p.body.readInt8(index+1)].map(BigInt),a=w[f][input][b].map(BigInt);
   real+=z[0]*a[0]-z[1]*a[1];imag+=z[0]*a[1]+z[1]*a[0];}
  out.push(real,imag);
 }return out;
}
const create=()=>new ArrivalBeam({ring:{sources:3,blocks:2,depth:2,period_us:10,deadline_us:20,service_us:1},frequencies:2,spectra:2,beams:2,weights:weights()});
test('frequency dependent integer complex weights, disorder, duplicates and missing-source masks match raw reference',()=>{
 for(const order of [[0,1,2],[2,0,1],[1,2,0]]){
  const m=create(),p=order.map((s,i)=>packet(s,0,11+i));p.forEach(x=>m.push(x));
  assert.equal(m.push(packet(order[0],0,13.5)),'late'); // submitted block cannot change
  m.push(packet(2,1,22));assert.equal(m.push(packet(2,1,23)),'duplicate');m.push(packet(0,1,24));m.advance(100);
  assert.deepEqual(m.outputs[0].sum,reference(p,weights()));
  assert.deepEqual(m.outputs[1].sum,reference([packet(2,1,22),packet(0,1,24)],weights()));
  assert.deepEqual(m.outputs[1].sources,[0,2]);assert.equal(m.outputs[1].missing_sources,1);
  assert.equal(m.ring.accounting().resident,0);assert.equal(m.states.size,0);
  for(let f=0;f<2;f++)for(let b=0;b<2;b++)for(let pol=0;pol<2;pol++){
   const norm=Array.from({length:24},(_,i)=>i).filter(i=>i%2===pol&&Math.floor(i/8)!==1).reduce((n,i)=>{const [a,z]=weights()[f][i][b].map(BigInt);return n+a*a+z*z;},0n);
   assert.equal(m.outputs[1].power[(f*2+b)*2+pol],norm);
  }
 }
});
test('epoch abort clears partial sums and new coefficients do not leak into old window',()=>{
 const m=create();m.push(packet(0,0,11));m.switchSession(12,2,2,weights(5));
 assert.equal(m.push(packet(1,0,13)),'session');m.push(packet(2,0,24,2,2));m.advance(100);
 assert.deepEqual(m.outputs[0].sum,reference([packet(2,0,24,2,2)],weights(5)));assert.equal(m.ring.accounting().discarded,1);
});
test('mid-sum saturation changes with order: only wide sum then final rounding is acceptable',()=>{
 const clip=x=>Math.max(-127,Math.min(127,x));
 assert.notEqual([100,100,-100].reduce((s,x)=>clip(s+x),0),[100,-100,100].reduce((s,x)=>clip(s+x),0));
 assert.equal(clip([100,100,-100].reduce((s,x)=>s+x,0)),100);
});
test('wire codec to network arrival to bounded beam slots matches independent raw payload sums',()=>{
 const c={antennas:12,polarizations:2,inputs_per_source:8,science_bits_per_component:8,line_bps:100e9,udp_ip_mtu:9000};
 const s={retained_bins:4,channels_per_destination:2,spectra_per_packet:2,hop:4096,complex_hz:200e6,ddc_decimation:16};
 const trace=simulateStream(c,s,{sources:3,blocks:2,jitter_us:10,seed:71});
 const m=new ArrivalBeam({ring:{sources:3,blocks:2,depth:2,period_us:40.96,deadline_us:100,service_us:1},frequencies:2,spectra:2,beams:2,weights:weights()});
 const all=[];
 for(const event of trace.packets){const data=packet(event.source,event.block,event.time);all.push(data);
  const first_spectrum=BigInt(event.block*2);
  const p=validate(decode(encode({epoch:1,config:1,source:event.source,destination:0,first_frequency:0,frequencies:2,spectra:2,inputs:8,
   first_spectrum,first_adc_sample:first_spectrum*65536n,sequence:BigInt(event.block)},data.body)),c,s,{epoch:1,config:1,epoch_adc_sample:'0',destination:0});
  assert.equal(m.push({...p,block:Number(p.first_spectrum/2n),time:event.time}),'accepted');
 }
 m.advance(1000);for(let b=0;b<2;b++)assert.deepEqual(m.outputs[b].sum,reference(all.filter(x=>x.block===b),weights()));
 assert.equal(m.ring.accounting().rejected,0);
});
