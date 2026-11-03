// Full wire/beat reference for the NEXT parser replay. Software validation only.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {encode,routes} from '../models/packet.mjs';import {wrapEthernet,axisBeats,frameFromBeats,validateNetworkBeats} from '../models/ethernet-frame.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.argv[2]??''),sourceRoot=path.resolve(root);
if(!process.argv[2]||out.toLowerCase()===sourceRoot.toLowerCase()||out.toLowerCase().startsWith(sourceRoot.toLowerCase()+path.sep))throw Error('External vector directory required');
fs.mkdirSync(out,{recursive:true});
const c=JSON.parse(fs.readFileSync(path.join(root,'config/phase1.json'))),sessionBase={epoch:7,config:11,epoch_adc_sample:'9007199254740993'};
const net={destination_mac:'020000000001',source_mac:'020000000002',destination_ip:'0a000001',source_ip:'0a000002',source_port:7148,destination_port:7148,mtu:9000};
const profiles=[{...c.scenarios[0],id:'candidate128',channels_per_destination:32},{...c.scenarios[1],id:'mapped128',channels_per_destination:20},...c.scenarios,
 ...[{id:'diagnostic_t1_bin1',width:1,bins:3,T:1},{id:'diagnostic_t1_bin3',width:3,bins:6,T:1},{id:'diagnostic_t8_bin1',width:1,bins:3,T:8}]
 .map(d=>({...c.scenarios[0],id:d.id,retained_bins:d.bins,channels_per_destination:d.width,spectra_per_packet:d.T}))];
const cases=[];
for(const s of profiles)for(const src of [0,255])for(const dest of [0,routes(s).length-1]){
 const route=routes(s)[dest],nf=route.frequencies,T=s.spectra_per_packet,spec=26n/BigInt(T)*BigInt(T);
 const p={...route,source:src,epoch:7,config:11,spectra:T,inputs:8,first_spectrum:spec,sequence:spec/BigInt(T),
  first_adc_sample:BigInt(sessionBase.epoch_adc_sample)+spec*BigInt(s.hop*s.ddc_decimation)};
 const body=Buffer.alloc(16*nf*T);for(let i=0;i<body.length;i++)body[i]=(src+17*i+31*dest)%256;
 const wire=wrapEthernet(encode(p,body),net),session={...sessionBase,destination:dest};
 for(const width of [32,64,512]){
  const beats=axisBeats(wire,width),result=validateNetworkBeats(beats,width,net,c,s,session);
  if(!result.body.equals(body))throw Error('Reference byte mismatch');
  cases.push({id:`${s.id}_src${src}_dest${dest}_w${width}`,width,profile:s,session,science_hex:body.toString('hex'),beats,expected:'ACCEPT_AT_FINAL_BEAT'});
 }
}
const production=cases.find(x=>x.id==='mapped128_src255_dest127_w512');
for(const [name,mutate]of [
 ['tail_error',x=>x.at(-1).error=true],['keep_hole',x=>x[2].keep_hex='fffffffffffffffd'],
 ['truncated',x=>{x.pop();x.at(-1).last=true;}],['extra_tail',x=>{const b=axisBeats(Buffer.concat([frameFromBeats(x),Buffer.from([0])]),512);x.splice(0,x.length,...b);}],
 ['early_last',x=>x[1].last=true],['missing_last',x=>x.at(-1).last=false]
]){
 const row=structuredClone(production);row.id='negative_'+name;mutate(row.beats);
 try{validateNetworkBeats(row.beats,row.width,net,c,row.profile,row.session);throw Error('Negative accepted');}catch(e){if(e.message==='Negative accepted')throw e;row.expected='REJECT';row.reason=e.message;}
 cases.push(row);
}
const sources=['models/packet.mjs','models/ethernet-frame.mjs','config/phase1.json','scripts/generate-phase2-network-vectors.mjs'];
const manifest={schema:1,evidence:'SOFTWARE_REFERENCE_PASS; RTL_REPLAY_NOT_RUN',net,science_start_byte:106,fcs:'STRIPPED',udp_checksum_policy:'ZERO_ONLY',cases,
 source_hash_normalization:'UTF-8 CRLF converted to LF',source_sha256:Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(root,p),'utf8').replaceAll('\r\n','\n')).digest('hex')]))};
fs.writeFileSync(path.join(out,'network_vectors.json'),JSON.stringify(manifest,null,2)+'\n');console.log(`Generated ${cases.length} full-frame cases; RTL replay NOT RUN`);
