import fs from 'node:fs';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {simulateStream} from '../models/network-stream.mjs';import {ReceiveRing} from '../models/receive-ring.mjs';import {routes} from '../models/packet.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),c=JSON.parse(fs.readFileSync(root+'config/phase1.json'));
const cfg=JSON.parse(fs.readFileSync(root+'config/phase1-sustained.json')),rows=[];
for(const spec of cfg.scenarios.filter(x=>['candidate128','extension342'].includes(x.id)))for(const T of [1,2,4,8]){
 const s={...c.scenarios.find(x=>x.id===spec.base),channels_per_destination:spec.channels,spectra_per_packet:T};
 const period=s.hop/s.complex_hz*T*1e6,bytes=256*8*spec.channels*T*2;
 const pauses=[];for(let b=8;b<32;b+=8)pauses.push([b*period+50,b*period+70]);
 const rings=routes(s).map(r=>new ReceiveRing({sources:256,blocks:32,depth:spec.depth,period_us:period,
  deadline_us:2*period+200,service_us:bytes*r.frequencies/spec.channels*8/100e9*1e6,pauses,compact_outputs:true}));
 console.log(`PACKET SWEEP ${spec.id} T=${T}`);
 const net=simulateStream(c,s,{blocks:32,seed:20261103,jitter_us:100,policy:'paced',source_assembly_banks:3,
  switch_queue_bytes:524288,retain_selected:false,onDelivered:p=>rings[p.destination].push({...p,epoch:1,config:1})});
 for(const r of rings)r.advance(32*period+32*(bytes*8/100e9*1e6+20)+10000);
 const accounting=rings.map(r=>r.accounting());const coeff=cfg.weight_banks*2048*spec.channels*4;
 const memory=spec.depth*(bytes+96)+coeff+cfg.ingress_fifo_bytes_assumed+cfg.algorithm_work_bytes_reserved;
 const memory_limit=c.hardware.raw_bram_uram_mib_approx*1048576*cfg.raw_ram_fraction_budget;
 rows.push({id:spec.id,T,blocks:32,seed:20261103,period_us:period,depth:spec.depth,
  stats:net.stats,destinations:rings.length,complete_rings:rings.filter(r=>r.outputs.length===32&&r.outputs.every(x=>x.valid_sources===256)).length,
  rejected:accounting.reduce((n,r)=>n+r.rejected,0),missing:accounting.reduce((n,r)=>n+r.missing,0),resident:accounting.reduce((n,r)=>n+r.resident,0),
  raw_total_bytes:memory,memory_limit_bytes:memory_limit,raw_within_budget:memory<=memory_limit,
  source_wire_bps:(8*s.retained_bins*T*2+routes(s).length*130)*8/period*1e6,
  max_receive_latency_us:Math.max(...rings.map(r=>Math.max(...r.outputs.map(x=>x.end-(x.block+1)*period))))});
}
const inputs=['config/phase1.json','config/phase1-sustained.json','models/network-stream.mjs','models/corner-turn.mjs','models/receive-ring.mjs','scripts/phase1-packet-sweep.mjs'];
const hashes=Object.fromEntries(inputs.map(p=>[p,createHash('sha256').update(fs.readFileSync(root+p)).digest('hex')]));
fs.writeFileSync(root+'reports/phase1-packet-sweep.json',JSON.stringify({evidence:'32_BLOCK_ALL_DESTINATION_PACKET_SIZE_COMPARISON',hashes,rows},null,2)+'\n');
const f=x=>Number(x.toFixed(3));const md=['# 发包时间块联合对照','',
 '32块、256源、全部目的节点独立ring、100µs hash抖动；固定各方案原本槽深度，仅改变T。容量与超时失败不说明该T永远不可用，而说明不能直接套用默认配置。选中的200MHz T=2和500MHz T=4另有512块双seed验证。', '',
 '| 场景 | T | 每源端口Gb/s | 完整节点/全部 | 拒收 | 缺失 | 含预留MiB | 85%RAM预算 |', '|---|---:|---:|---|---:|---:|---:|---|'];
for(const r of rows)md.push(`| ${r.id} | ${r.T} | ${f(r.source_wire_bps/1e9)} | ${r.complete_rings}/${r.destinations} | ${r.rejected} | ${r.missing} | ${f(r.raw_total_bytes/1048576)} | ${r.raw_within_budget} |`);
fs.writeFileSync(root+'reports/phase1-packet-sweep.md',md.join('\n')+'\n');
