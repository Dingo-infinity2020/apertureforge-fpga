import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {routes} from '../models/packet.mjs';import {axisBeats,frameFromBeats,ipChecksum,validateNetworkBeats} from '../models/ethernet-frame.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));const [input,outArg,widthArg]=process.argv.slice(2),W=Number(widthArg),B=W/8,out=path.resolve(outArg??'');
if(!input||!outArg||![32,64,512].includes(W)||out.toLowerCase().startsWith(path.resolve(root).toLowerCase()))throw Error('Expected external network_vectors.json, external output, width');
fs.mkdirSync(out,{recursive:true});const manifest=JSON.parse(fs.readFileSync(input)),c=JSON.parse(fs.readFileSync(path.join(root,'config/phase1.json')));
const beatWords=[],info=[],gold=[],frames=[],headers=[];
const put=(v,n,shift)=>v|(BigInt(n)<<BigInt(shift));
const selected=manifest.cases.filter(r=>r.width===W);selected.push({...structuredClone(selected.find(r=>r.id.startsWith('mapped128'))),deny:true,id:'admission_denied_w'+W});
const base=selected.find(r=>r.id.startsWith('mapped128'));
function fixIp(b){b.writeUInt16BE(0,24);b.writeUInt16BE(ipChecksum(b.subarray(14,34)),24);}
for(const [name,mask,change]of [
 ['ethertype',0x100,b=>b[12]=0x86],['vlan',0x100,b=>b.writeUInt16BE(0x8100,12)],
 ['ihl',0x100,b=>b[14]=0x46],['fragment',0x100,b=>{b[20]|=0x20;fixIp(b);}],
 ['udp_nonzero_checksum',0x100,b=>b[40]=1],['ip_checksum',0x200,b=>b[24]^=1],
 ['mac',0x800,b=>b[0]^=1],['ip_destination',0x800,b=>{b[30]^=1;fixIp(b);}],['udp_port',0x800,b=>b[36]^=1],
 ['ip_length',0x400,b=>{b.writeUInt16BE(b.readUInt16BE(16)-1,16);fixIp(b);}],['udp_length',0x400,b=>b[39]^=1],
 ['afp_magic',1,b=>b[42]^=1],['afp_epoch',4,b=>b[50]^=1],['afp_adc_time',128,b=>b[78]^=1],
 ['afp_payload_length',32,b=>b[94]^=1],['afp_reserved',2,b=>b[88]=1],
 ['afp_source',8,b=>b.writeUInt16LE(65535,58)],['afp_frequency',16,b=>b[62]^=1]
]){
 const row=structuredClone(base),wire=frameFromBeats(row.beats,W);change(wire);
 row.id='negative_'+name+'_w'+W;row.required_mask=mask;row.bad_expected=true;row.beats=axisBeats(wire,W);selected.push(row);
}
const oversized=structuredClone(base);oversized.id='negative_oversize_w'+W;oversized.bad_expected=true;oversized.required_mask=0x4000;
oversized.beats=axisBeats(Buffer.concat([frameFromBeats(base.beats,W),Buffer.alloc(9000)]),W);selected.push(oversized);
for(const row of selected){
 const segments=[];let segment=[];
 for(const beat of row.beats){segment.push(beat);if(beat.last){segments.push(segment);segment=[];}}
 if(segment.length)segments.push(segment);
 for(let j=0;j<segments.length;j++){
  const beats=segments[j],start=beatWords.length,offset=gold.length,body=j===0?Buffer.from(row.science_hex,'hex'):Buffer.alloc(0);
  let commit=true;try{validateNetworkBeats(beats,W,manifest.net,c,row.profile,row.session);}catch{commit=false;}if(row.deny)commit=false;
  if(row.bad_expected && commit)throw Error('Negative mutation accepted: '+row.id);
  const raw=Buffer.concat(beats.map(b=>Buffer.from(b.data_hex,'hex'))),header=Buffer.alloc(64);raw.subarray(42,106).copy(header);
  headers.push(header.reverse().toString('hex'));
  const wireBytes=beats.reduce((n,b)=>n+[...BigInt('0x'+b.keep_hex).toString(2)].filter(x=>x==='1').length,0);
  const actual=Math.min(wireBytes,Math.ceil(9015/B)*B),required=row.required_mask??(row.deny?0x8000:0);
  for(const beat of beats){const data=BigInt('0x'+Buffer.from(beat.data_hex,'hex').reverse().toString('hex'));
   beatWords.push((data|(BigInt('0x'+beat.keep_hex)<<BigInt(W))|(BigInt(beat.last)<<BigInt(W+B))|(BigInt(beat.error)<<BigInt(W+B+1))).toString(16).padStart(Math.ceil((W+B+2)/4),'0'));}
  gold.push(...body);const r=routes(row.profile)[row.session.destination],log=Math.log2(row.profile.spectra_per_packet);
  let cfg=0n;for(const [n,shift]of [[start,0],[beats.length,32],[commit,64],[beats.at(-1).last,65],[row.deny??false,67],[body.length,80],[offset,96],
   [row.session.destination,128],[r.frequencies,144],[r.first_frequency,160],[row.profile.hop*row.profile.ddc_decimation,192],
   [row.session.epoch_adc_sample,224],[log,288],[actual,320],[required,368]])cfg=put(cfg,n,shift);
  info.push(cfg.toString(16).padStart(128,'0'));frames.push({id:row.id+`_part${j}`,commit,ended:beats.at(-1).last,bytes:actual,science:body.length});
 }
}
for(const [name,rows]of [['beats',beatWords],['info',info],['headers',headers],['gold',gold.map(n=>n.toString(16).padStart(2,'0'))]])fs.writeFileSync(path.join(out,name+'.mem'),rows.join('\n')+'\n');
const filename=n=>path.join(out,n).replaceAll('\\','/');
fs.writeFileSync(filename('af_parser_config.svh'),[
 ['AF_PARSER_WIDTH',W],['AF_PARSER_FRAMES',info.length],['AF_PARSER_BEAT_COUNT',beatWords.length],['AF_PARSER_GOLD_BYTES',gold.length],
 ...['beats','info','headers','gold'].map(n=>['AF_PARSER_'+n.toUpperCase(),'"'+filename(n+'.mem')+'"']),['AF_PARSER_PASS','"'+filename('simulation_pass.txt')+'"']
].map(([k,v])=>'`define '+k+' '+v).join('\n')+'\n');
fs.writeFileSync(filename('parser_vectors.json'),JSON.stringify({schema:1,width:W,scope:'Independent full-frame oracle, per physical TLAST segment; missing TLAST uses idle timeout/resync',
 input_sha256:createHash('sha256').update(fs.readFileSync(input)).digest('hex'),frames},null,2)+'\n');
console.log(`Exported width=${W} frames=${frames.length} beats=${beatWords.length} gold=${gold.length}`);
