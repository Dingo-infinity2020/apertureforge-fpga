import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {encode,decode,validate,routes,inputIdentity,sampleOffset} from '../models/packet.mjs';
const c=JSON.parse(fs.readFileSync(new URL('../config/phase1.json',import.meta.url)));
const session={epoch:7,config:1,epoch_adc_sample:'9007199254740993'};
test('all sources and retained bins assigned exactly once, rates conserve',()=>{
 const identities=new Set();
 for(let src=0;src<256;src++)for(let l=0;l<8;l++) {
  const x=inputIdentity(src,l,c); assert.equal(x.input,x.antenna*2+x.polarization);identities.add(x.input);
 }
 assert.equal(identities.size,2048);
 for(const s of c.scenarios) {
  assert.equal(s.adc_hz/s.ddc_decimation,s.complex_hz);
  const coverage=new Uint8Array(s.retained_bins);
  for(const r of routes(s)) for(let i=r.first_frequency;i<r.first_frequency+r.frequencies;i++) coverage[i]++;
  assert.ok(coverage.every(x=>x===1));
  const source=8*16*s.retained_bins*s.complex_hz/s.hop;
  const partitioned=routes(s).reduce((n,r)=>n+2048*16*r.frequencies*s.complex_hz/s.hop,0);
  assert.equal(source*256,partitioned);
  for(const r of routes(s)) assert.ok(28+64+2*8*r.frequencies*s.spectra_per_packet<=9000);
 }
});
function packet(s,src,dest,time=0n) {
 const r=routes(s)[dest],T=s.spectra_per_packet;
 const body=Buffer.alloc(T*r.frequencies*8*2);
 // Independent append order supplies signed edge values and asymmetric I/Q.
 let k=0;for(let t=0;t<T;t++)for(let f=0;f<r.frequencies;f++)for(let l=0;l<8;l++){
  body.writeInt8(((Number(time)+t+f+src+l)%256)-128,k++);
  body.writeInt8(127-((t+3*f+7*l+src)%256),k++);
 }
 return {p:{...r,source:src,epoch:session.epoch,config:session.config,spectra:T,inputs:8,
  first_spectrum:time,first_adc_sample:BigInt(session.epoch_adc_sample)+time*BigInt(s.hop*s.ddc_decimation),sequence:time/BigInt(T)},body};
}
test('actual packet round trip for 256 sources, first and remainder routes, every byte indexed',()=>{
 for(const s of c.scenarios) for(let src=0;src<256;src++) for(const dest of [0,routes(s).length-1]) {
  const {p,body}=packet(s,src,dest,BigInt(s.spectra_per_packet)*13n);
  const b=encode(p,body),d=validate(decode(b),c,s,session);
  assert.deepEqual(d.body,body); assert.equal(d.first_adc_sample,p.first_adc_sample);
  for(let t=0;t<p.spectra;t++)for(let f=0;f<p.frequencies;f++)for(let l=0;l<8;l++){
   const offset=sampleOffset(t,f,l,p.frequencies,8);
   assert.equal(d.body.readInt8(offset),((Number(p.first_spectrum)+t+f+src+l)%256)-128);
   assert.equal(d.body.readInt8(offset+1),127-((t+3*f+7*l+src)%256));
  }
 }
});
test('independent fixed wire vector uses exact 64-bit times',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('../vectors/packet-v1.json',import.meta.url)));
 const d=decode(Buffer.from(fixture.hex,'hex'));
 assert.equal(d.first_spectrum,0x0102030405060708n);
 assert.equal(d.first_adc_sample,0x1112131415161718n);
 assert.equal(d.source,2);assert.equal(d.destination,3);assert.equal(d.first_frequency,4);
 assert.deepEqual([...d.body],[128,127,255,1]);
 assert.equal(encode({...d,flags:1},d.body).toString('hex'),fixture.hex);
});
test('malformed wire and wrong session/route/time are rejected',()=>{
 const s=c.scenarios[0],{p,body}=packet(s,0,0),b=encode(p,body);
 for(const offset of [0,4,5,6,44,46,52]){ const bad=Buffer.from(b);bad[offset]^=0xff;assert.throws(()=>decode(bad)); }
 assert.throws(()=>decode(b.subarray(0,63)));assert.throws(()=>decode(b.subarray(0,b.length-1)));
 assert.throws(()=>decode(Buffer.concat([b,Buffer.from([0])])));
 const d=decode(b);
 for(const patch of [{epoch:8},{config:2},{source:256},{destination:99},{first_frequency:1},
  {frequencies:55},{first_adc_sample:d.first_adc_sample+1n},{first_spectrum:1n},{sequence:1n},{inputs:7}])
  assert.throws(()=>validate({...d,...patch},c,s,session));
 assert.throws(()=>encode({...p,source:-1},body));
 assert.throws(()=>encode({...p,first_spectrum:1n<<64n},body));
});
