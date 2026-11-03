import test from 'node:test';import assert from 'node:assert/strict';
import {encode} from '../models/packet.mjs';
import {ipChecksum,wrapEthernet,unwrapEthernet,axisBeats,frameFromBeats} from '../models/ethernet-frame.mjs';
const net={destination_mac:'020000000001',source_mac:'020000000002',destination_ip:'0a000001',source_ip:'0a000002',source_port:7148,destination_port:7148,mtu:9000};
function frame(bytes=640){const body=Buffer.alloc(bytes);for(let i=0;i<bytes;i++)body[i]=(i*73+19)%256;
 const app=encode({epoch:7,config:11,source:255,destination:3,first_frequency:60,frequencies:20,spectra:2,inputs:8,
 first_spectrum:26n,first_adc_sample:9007199254740993n+26n*49152n,sequence:13n},body);return {body,app,wire:wrapEthernet(app,net)};}
test('independent IPv4 checksum vector and production 106-byte science offset',()=>{
 // Fixed independent IPv4 header and expected literal checksum.
 assert.equal(ipChecksum(Buffer.from('450000730000400040110000c0a80001c0a800c7','hex')),0xb861);
 const {body,app,wire}=frame();assert.equal(wire.length,746);assert.equal(wire[106],body[0]);assert.equal(wire[107],body[1]);
 assert.deepEqual(unwrapEthernet(wire,net),app);assert.deepEqual(wire.subarray(106),body);
 for(const width of [32,64,512])assert.deepEqual(frameFromBeats(axisBeats(wire,width),width),wire);
 const beats=axisBeats(wire);assert.equal(beats.length,12);assert.equal(BigInt('0x'+beats.at(-1).keep_hex),(1n<<42n)-1n);
});
test('all payload remainder classes reconstruct byte-for-byte at three beat widths',()=>{
 for(let bytes=16;bytes<=1024;bytes+=16){const {wire,app}=frame(bytes);
  for(const width of [32,64,512])assert.deepEqual(unwrapEthernet(frameFromBeats(axisBeats(wire,width),width),net),app);
 }
});
test('unsupported IP/UDP forms, corrupted checksum and length/destination are refused',()=>{
 const {wire}=frame();
 for(const [offset,value,reason]of [[12,0x86,'UNSUPPORTED'],[14,0x46,'UNSUPPORTED'],[23,6,'UNSUPPORTED'],[20,0x60,'UNSUPPORTED'],[41,1,'UNSUPPORTED'],[24,0,'IP_CHECKSUM'],[39,0,'NETWORK_LENGTH'],[0,3,'NETWORK_DESTINATION']]){
  const bad=Buffer.from(wire);bad[offset]=value;assert.throws(()=>unwrapEthernet(bad,net),new RegExp(reason));
 }
 assert.throws(()=>unwrapEthernet(wire.subarray(0,-1),net),/NETWORK_LENGTH/);
 assert.throws(()=>unwrapEthernet(Buffer.concat([wire,Buffer.alloc(1)]),net),/NETWORK_LENGTH/);
});
test('bad final status, keep holes, zero tail, and misplaced last cannot become a packet',()=>{
 const {wire}=frame();
 for(const mutate of [b=>b.at(-1).error=true,b=>b[1].keep_hex='fffd',b=>b.at(-1).keep_hex='0',b=>b[0].last=true,b=>b.at(-1).last=false]){
  const beats=axisBeats(wire);mutate(beats);assert.throws(()=>frameFromBeats(beats),/FRAME_ERROR|KEEP|LAST/);
 }
});
