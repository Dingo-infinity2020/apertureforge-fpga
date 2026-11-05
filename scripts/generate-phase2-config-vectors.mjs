// Focused cross-domain configuration/flush test, not a throughput benchmark.
import fs from 'node:fs';import path from 'node:path';import {encode} from '../models/packet.mjs';import {wrapEthernet,axisBeats} from '../models/ethernet-frame.mjs';
const out=path.resolve(process.argv[2]??'');if(!process.argv[2]||!fs.existsSync(out))throw Error('Prepared external vectors directory required');
const net={destination_mac:'020000000001',source_mac:'020000000002',destination_ip:'0a000001',source_ip:'0a000002',source_port:7148,destination_port:7148,mtu:9000};
const records=[{source:255,seq:13,e:7,c:11,seed:0x11},{source:0,seq:13,e:7,c:11,seed:0x33},{source:0,seq:14,e:8,c:12,seed:0x5a}];
const load=[],gold=[],info=[];
for(const p of records){
 const body=Buffer.alloc(1280);for(let i=0;i<body.length;i++)body[i]=(p.seed+17*i+7*p.source)&255;
 const spectrum=BigInt(p.seq*8),frame=wrapEthernet(encode({epoch:p.e,config:p.c,source:p.source,destination:127,first_frequency:2540,frequencies:10,spectra:8,inputs:8,
  first_spectrum:spectrum,first_adc_sample:9007199254740993n+spectrum*49152n,sequence:BigInt(p.seq)},body),net);
 const beats=axisBeats(frame,512);info.push((BigInt(load.length)|BigInt(beats.length)<<32n|BigInt(gold.length)<<64n).toString(16).padStart(32,'0'));
 for(const b of beats)load.push((BigInt('0x'+Buffer.from(b.data_hex,'hex').reverse().toString('hex'))|BigInt('0x'+b.keep_hex)<<512n|BigInt(b.last)<<576n).toString(16).padStart(145,'0'));
 for(let i=0;i<body.length;i+=64)gold.push(Buffer.from(body.subarray(i,i+64)).reverse().toString('hex'));
}
for(const [name,rows]of [['load',load],['gold',gold],['info',info]])fs.writeFileSync(path.join(out,'config_'+name+'.mem'),rows.join('\n')+'\n');
const file=n=>path.join(out,n).replaceAll('\\','/');
fs.writeFileSync(file('af_pipeline_config_test.svh'),[
 ['AF_CFG_BEATS',load.length],['AF_CFG_WORDS',gold.length],...['load','gold','info'].map(n=>['AF_CFG_'+n.toUpperCase(),'"'+file('config_'+n+'.mem')+'"']),
 ['AF_CFG_PASS','"'+file('config_pass.txt')+'"']
].map(([k,v])=>'`define '+k+' '+v).join('\n')+'\n');
console.log('Generated cross-domain config vectors: '+load.length+' beats, '+gold.length+' golden words');
