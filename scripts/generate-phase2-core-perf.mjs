// Full mapped128 finite processing-side load; no RFSoC/switch/CMAC timing is implied.
import fs from 'node:fs';import path from 'node:path';
import {encode} from '../models/packet.mjs';import {wrapEthernet,axisBeats} from '../models/ethernet-frame.mjs';
const out=path.resolve(process.argv[2]??''),blocks=16;
if(!process.argv[2]||!fs.existsSync(path.join(out,'af_core_config.svh')))throw Error('Use prepared external core vector directory');
const net={destination_mac:'020000000001',source_mac:'020000000002',destination_ip:'0a000001',source_ip:'0a000002',source_port:7148,destination_port:7148,mtu:9000};
const wires=[],gold=[];
for(let b=0;b<blocks;b++){
 const bodies=[];
 for(let source=0;source<256;source++){
  const body=Buffer.alloc(640);let k=0;
  for(let t=0;t<2;t++)for(let f=0;f<20;f++)for(let l=0;l<8;l++){
   body.writeInt8(((b*2+t+f+source+l)%256)-128,k++);body.writeInt8(127-((t+3*f+7*l+source+b)%256),k++);
  }
  bodies.push(body);for(let i=0;i<640;i+=64)gold.push(Buffer.from(body.subarray(i,i+64)).reverse().toString('hex'));
 }
 for(let j=0;j<256;j++){
  const source=(j*73+b*19)%256,spec=BigInt(2*b);
  const app=encode({epoch:7,config:11,source,destination:127,first_frequency:2540,frequencies:20,spectra:2,inputs:8,
   first_spectrum:spec,first_adc_sample:9007199254740993n+spec*49152n,sequence:BigInt(b)},bodies[source]);
  for(const beat of axisBeats(wrapEthernet(app,net),512)){
   const data=BigInt('0x'+Buffer.from(beat.data_hex,'hex').reverse().toString('hex'));
   wires.push((data|(BigInt('0x'+beat.keep_hex)<<512n)|(BigInt(beat.last)<<576n)).toString(16).padStart(145,'0'));
  }
 }
}
for(const [name,rows]of [['load',wires],['gold',gold]])fs.writeFileSync(path.join(out,'core_perf_'+name+'.mem'),rows.join('\n')+'\n');
const filename=n=>path.join(out,n).replaceAll('\\','/');
fs.writeFileSync(filename('af_core_perf_config.svh'),[
 ['AF_CORE_PERF_BLOCKS',blocks],['AF_CORE_PERF_BEATS',wires.length],['AF_CORE_PERF_WORDS',gold.length],
 ...['load','gold'].map(n=>['AF_CORE_PERF_'+n.toUpperCase()+'_FILE','"'+filename('core_perf_'+n+'.mem')+'"']),
 ['AF_CORE_PERF_PASS','"'+filename('core_perf_pass.txt')+'"'],['AF_CORE_PERF_TRACE','"'+filename('core_service.csv')+'"']
].map(([k,v])=>'`define '+k+' '+v).join('\n')+'\n');
fs.writeFileSync(filename('core_perf_config.json'),JSON.stringify({blocks,sources:256,words_per_source:10,clock_hz:250000000,
 period_ticks:6400,first_deadline_ticks:69200,consumer_ready_duty:'25/32',pause_ticks:[63700,68700],
 deadline_basis:'phase1 mapped128: (block+1)*25.6us + 251.2us',scope:'Backpressured maximum injection, permuted sources, no switch jitter/CMAC/CDC'},null,2)+'\n');
console.log(`Generated ${blocks*256} full packets, ${gold.length} golden science words`);
