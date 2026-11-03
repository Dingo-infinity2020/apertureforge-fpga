import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {encode} from '../models/packet.mjs';import {wrapEthernet,axisBeats} from '../models/ethernet-frame.mjs';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url))),out=path.resolve(process.argv[2]??'');
if(!process.argv[2]||out.toLowerCase().startsWith(root.toLowerCase()))throw Error('External vector directory required');
fs.mkdirSync(out,{recursive:true});
const net={destination_mac:'020000000001',source_mac:'020000000002',destination_ip:'0a000001',source_ip:'0a000002',source_port:7148,destination_port:7148,mtu:9000};
const beats=[],info=[],gold=[],records=[],base=9007199254740993n,stride=49152n;
function add(name,source,seq,epoch=7,config=11,marker=0,mode='normal'){
 const body=Buffer.alloc(640);for(let i=0;i<640;i++)body[i]=((source+17*i+31*127)^marker)&255;
 let wire=wrapEthernet(encode({epoch,config,source,destination:127,first_frequency:2540,frequencies:20,spectra:2,inputs:8,
  first_spectrum:BigInt(seq)*2n,first_adc_sample:base+BigInt(seq)*2n*stride,sequence:BigInt(seq)},body),net);
 if(mode==='short')wire=wire.subarray(0,42);if(mode==='bad_ip')wire[24]^=1;
 const frame=axisBeats(wire,512);if(mode==='bad_tail')frame.at(-1).error=true;
 const start=beats.length,offset=gold.length;
 for(const b of frame){const data=BigInt('0x'+Buffer.from(b.data_hex,'hex').reverse().toString('hex'));
  beats.push((data|(BigInt('0x'+b.keep_hex)<<512n)|(BigInt(b.last)<<576n)|(BigInt(b.error)<<577n)).toString(16).padStart(145,'0'));}
 for(let i=0;i<640;i+=64)gold.push(Buffer.from(body.subarray(i,i+64)).reverse().toString('hex'));
 info.push((BigInt(start)|(BigInt(frame.length)<<32n)|(BigInt(offset)<<64n)).toString(16).padStart(32,'0'));
 records.push({name,source,seq,epoch,config,marker,mode,start,beats:frame.length,gold_word_offset:offset});
}
add('short',255,13,7,11,0,'short');add('valid255',255,13);add('bad_tail0',0,13,7,11,0,'bad_tail');
add('bad_ip',0,13,7,11,0,'bad_ip');add('valid0',0,13);add('expires1',1,13);add('interrupted255',255,14,7,11,0x33);
add('new_epoch0',0,14,8,12,0x5a);add('recycled255',255,24,8,12,0xa5);
for(const [n,rows]of [['beats',beats],['info',info],['gold',gold]])fs.writeFileSync(path.join(out,'core_'+n+'.mem'),rows.join('\n')+'\n');
const file=n=>path.join(out,n).replaceAll('\\','/');
fs.writeFileSync(file('af_core_config.svh'),[
 ['AF_CORE_BEAT_COUNT',beats.length],['AF_CORE_GOLD_WORDS',gold.length],...['beats','info','gold'].map(n=>['AF_CORE_'+n.toUpperCase(),'"'+file('core_'+n+'.mem')+'"']),
 ['AF_CORE_PASS','"'+file('simulation_pass.txt')+'"']
].map(([k,v])=>'`define '+k+' '+v).join('\n')+'\n');
fs.writeFileSync(file('core_vectors.json'),JSON.stringify({schema:1,scope:'Real mapped128 transaction/store integration, full 256-source 10-slot instance',records},null,2)+'\n');
console.log(`Generated ${records.length} core packets, ${beats.length} physical beats`);
