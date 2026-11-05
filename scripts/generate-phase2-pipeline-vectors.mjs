// Radio timing remains 320MS/s / FFT4096, hop49152 ADC ticks. RFSoC is not built.
import fs from 'node:fs';import path from 'node:path';import {encode} from '../models/packet.mjs';import {wrapEthernet,axisBeats} from '../models/ethernet-frame.mjs';
const out=path.resolve(process.argv[2]??''),nf=Number(process.argv[3]??10),tlog=Number(process.argv[4]??3),slots=Number(process.argv[5]??5),mhz=Number(process.argv[6]??125);
const mode=process.argv[7]??'paced',descDepth=Number(process.argv[8]??256),blocks=Number(process.argv[9]??16),pauseMode=process.argv[10]??'once';
if(!process.argv[2]||!fs.existsSync(out)||!Number.isInteger(nf)||nf<1||nf>20||![0,1,2,3].includes(tlog)||slots<2||![125,200,250].includes(mhz))throw Error('Expected prepared external vectors, nf, tlog2, slots, processing MHz');
if(!['paced','burst'].includes(mode)||!Number.isInteger(descDepth)||descDepth<16||descDepth>1024||(descDepth&(descDepth-1)))throw Error('Mode paced/burst and power-of-two descriptor depth required');
if(!Number.isInteger(blocks)||blocks<16||blocks>256||!['once','periodic'].includes(pauseMode))throw Error('16..256 blocks and once/periodic pause required');
const T=2**tlog,wpp=nf*T/4,bodyBytes=16*nf*T,clockPs=1e6/mhz,periodPs=T*12800000;
if(!Number.isInteger(wpp))throw Error('Full 64B words required');
const net={destination_mac:'020000000001',source_mac:'020000000002',destination_ip:'0a000001',source_ip:'0a000002',source_port:7148,destination_port:7148,mtu:9000};
const wire=[],gold=[];
for(let b=0;b<blocks;b++){
 const bodies=[];
 for(let source=0;source<256;source++){
  const body=Buffer.alloc(bodyBytes);let i=0;
  for(let t=0;t<T;t++)for(let f=0;f<nf;f++)for(let l=0;l<8;l++){
   body.writeInt8((b*T+t+f+source+l)%256-128,i++);body.writeInt8(127-(t+3*f+7*l+source+b)%256,i++);
  }
  bodies.push(body);for(let k=0;k<bodyBytes;k+=64)gold.push(Buffer.from(body.subarray(k,k+64)).reverse().toString('hex'));
 }
 for(let j=0;j<256;j++){
  const source=(j*73+b*19)%256,spectrum=BigInt(b*T);
  const frame=wrapEthernet(encode({epoch:7,config:11,source,destination:127,first_frequency:2540,frequencies:nf,spectra:T,inputs:8,
   first_spectrum:spectrum,first_adc_sample:9007199254740993n+spectrum*49152n,sequence:BigInt(b)},bodies[source]),net);
  for(const beat of axisBeats(frame,512))wire.push((BigInt('0x'+Buffer.from(beat.data_hex,'hex').reverse().toString('hex'))|
   BigInt('0x'+beat.keep_hex)<<512n|BigInt(beat.last)<<576n).toString(16).padStart(145,'0'));
 }
}
for(const [name,rows]of [['load',wire],['gold',gold]])fs.writeFileSync(path.join(out,'pipeline_'+name+'.mem'),rows.join('\n')+'\n');
const file=n=>path.join(out,n).replaceAll('\\','/');
const settings={BLOCKS:blocks,NF:nf,TLOG:tlog,SLOTS:slots,WPP:wpp,DESC_DEPTH:descDepth,BURST:Number(mode==='burst'),WORDS:gold.length,BEATS:wire.length,
 BEATS_PER_PACKET:Math.ceil((106+bodyBytes)/64),CLOCK_PS:clockPs,PERIOD_TICKS:periodPs/clockPs,
 FIRST_DEADLINE_TICKS:(periodPs+251200000)/clockPs,PACKET_INTERVAL_PS:periodPs/256,PERIOD_PS:periodPs,LINE_PACKET_PS:(bodyBytes+106+24)*80,
 PAUSE_START_TICKS:(8*periodPs+50000000)/clockPs,PAUSE_TICKS:20000000/clockPs,PAUSE_INTERVAL_TICKS:8*periodPs/clockPs,REPEAT_PAUSE:Number(pauseMode==='periodic'),
 LOAD_FILE:'"'+file('pipeline_load.mem')+'"',GOLD_FILE:'"'+file('pipeline_gold.mem')+'"',PASS:'"'+file('pipeline_pass.txt')+'"'};
for(const [k,v]of Object.entries(settings))if(typeof v==='number'&&!Number.isInteger(v))throw Error('Non-integer '+k);
fs.writeFileSync(file('af_pipeline_config.svh'),Object.entries(settings).map(([k,v])=>'`define AF_PIPE_'+k+' '+v).join('\n')+'\n');
fs.writeFileSync(file('pipeline_config.json'),JSON.stringify({blocks,sources:256,nf,T,slots,wpp,processing_mhz:mhz,
 mode,ingress_data_depth:4096,ingress_desc_depth:descDepth,source_release_offset_ps:periodPs,line_rate_bps:100e9,
 burst_packet_interval_ps:(bodyBytes+106+24)*80,
 source_packet_interval_ps:periodPs/256,expected_pps:256*1e12/periodPs,science_bps:2048*2*8*nf*320e6/4096,
 first_deadline_us:(periodPs+251200000)/1e6,pause_us:20,pause_mode:pauseMode,pause_interval_blocks:pauseMode==='periodic'?8:null,
 scope:'Non-stallable generated CMAC-boundary input; no real CMAC IP in this pipeline test'},null,2)+'\n');
console.log(`Generated ${blocks*256} packets, nf=${nf} T=${T} slots=${slots} clock=${mhz}MHz words=${gold.length}`);
