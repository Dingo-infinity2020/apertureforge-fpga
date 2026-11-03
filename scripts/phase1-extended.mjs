import fs from 'node:fs';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {simulateStream} from '../models/network-stream.mjs';import {ReceiveRing} from '../models/receive-ring.mjs';
import {routes} from '../models/packet.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(root+p));const c=read('config/phase1.json'),cfg=read('config/phase1-sustained.json');
const files=['config/phase1.json','config/phase1-sustained.json','models/corner-turn.mjs','models/network-stream.mjs','models/receive-ring.mjs','scripts/phase1-extended.mjs'];
const hashes=Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(root+p)).digest('hex')]));
const rows=[];const mean=a=>a.reduce((n,x)=>n+x,0)/a.length;
for(const spec of cfg.scenarios)for(const seed of cfg.seeds){
 const s={...c.scenarios.find(x=>x.id===spec.base),channels_per_destination:spec.channels};
 const start=Date.now();console.log(`START ${spec.id} seed=${seed} blocks=${cfg.blocks}`);
 const period=s.hop/s.complex_hz*s.spectra_per_packet*1e6,slotBytes=spec.channels*8*s.spectra_per_packet*2*256;
 const service=slotBytes*8/100e9*1e6,deadline=2*period+cfg.jitter_us+100;
 const pauses=[];for(let b=8;b<cfg.blocks;b+=8)pauses.push([b*period+50,b*period+70]);
 const destinationRings=routes(s).map(r=>new ReceiveRing({sources:256,blocks:cfg.blocks,depth:spec.depth,
  period_us:period,deadline_us:deadline,service_us:r.frequencies/spec.channels*service,pauses,compact_outputs:true}));
 const net=simulateStream(c,s,{blocks:cfg.blocks,seed,jitter_us:cfg.jitter_us,policy:'paced',
  switch_queue_bytes:cfg.switch_queue_bytes,source_assembly_banks:cfg.source_assembly_banks,
  onDelivered:p=>destinationRings[p.destination].push({...p,epoch:1,config:1})});
 function replay(service_us){const r=new ReceiveRing({sources:256,blocks:cfg.blocks,depth:spec.depth,period_us:period,deadline_us:deadline,service_us,pauses});
  for(const p of net.packets)r.push({...p,epoch:1,config:1});r.advance((cfg.blocks+1)*period+deadline+cfg.blocks*(service_us+20)+10000);return r;}
 for(const r of destinationRings)r.advance((cfg.blocks+1)*period+deadline+cfg.blocks*(service+20)+10000);
 const ring=destinationRings[0],a=ring.accounting();
 const destinationAccounting=destinationRings.map((r,destination)=>({destination,outputs:r.outputs.length,...r.accounting(),
  max_output_latency_us:Math.max(...r.outputs.map(x=>x.end-(x.block+1)*period)),
  all_source_bitmaps_complete:r.outputs.every(x=>x.source_bitmap_hex==='ff'.repeat(32))}));
 const windows=net.per_destination.map(d=>({middle:mean(d.wait_by_block_us.slice(cfg.blocks/4,cfg.blocks/2)),last:mean(d.wait_by_block_us.slice(3*cfg.blocks/4)),peak_bytes:d.peak_bytes}));
 const drift=Math.max(...windows.map(x=>x.last-x.middle));
 const ringBytes=spec.depth*(slotBytes+cfg.slot_metadata_bytes_assumed);
 const coefficients=cfg.weight_banks*2048*spec.channels*4; // diagonal calibration or one direct beam, I/Q16
 const budgetBytes=ringBytes+coefficients+cfg.ingress_fifo_bytes_assumed+cfg.algorithm_work_bytes_reserved;
 const rawLimit=c.hardware.raw_bram_uram_mib_approx*1048576*cfg.raw_ram_fraction_budget;
 const networkPass=net.stats.source_dropped===0&&net.stats.switch_dropped===0&&drift<=period/4&&net.stats.source_max_wait_us<period;
 const ringPass=destinationAccounting.every(x=>x.rejected===0&&x.missing===0&&x.resident===0&&x.outputs===cfg.blocks&&x.all_source_bitmaps_complete);
 const slow=spec.id==='reference74'&&seed===cfg.seeds[0]?replay(slotBytes*8/50e9*1e6).accounting():null;
 const row={id:spec.id,seed,base:spec.base,blocks:cfg.blocks,all_destinations:net.per_destination.length,channels:spec.channels,
  science_mhz_per_card:spec.channels*s.complex_hz/s.fft_size/1e6,science_bps_per_card:slotBytes*8/period*1e6,
  source_pps:net.per_destination.length/period*1e6,receiver_pps:256/period*1e6,
  stats:net.stats,output_queue_window_drift_us:drift,per_destination_windows:windows,
  ring:{depth:spec.depth,deadline_after_ready_us:deadline,service_us:service,pauses,stats:a,
    verified_destinations:destinationAccounting.length,destination_accounting:destinationAccounting,
    max_output_latency_us:Math.max(...destinationAccounting.map(x=>x.max_output_latency_us))},
  memory:{raw_data_bytes:spec.depth*slotBytes,metadata_bytes:spec.depth*cfg.slot_metadata_bytes_assumed,
    coefficient_bytes:coefficients,ingress_fifo_bytes:cfg.ingress_fifo_bytes_assumed,algorithm_reserved_bytes:cfg.algorithm_work_bytes_reserved,
    total_bytes:budgetBytes,usable_raw_limit_bytes:rawLimit,source_assembly_data_bytes:cfg.source_assembly_banks*8*s.retained_bins*s.spectra_per_packet*2},
  gates:{network:networkPass,ring:ringPass,raw_memory:budgetBytes<=rawLimit},slow_service_negative_control:slow,elapsed_ms:Date.now()-start};
 rows.push(row);fs.writeFileSync(root+`reports/phase1-sustained-${spec.id}-${seed}.json`,JSON.stringify({hashes,row},null,2)+'\n');
 console.log(JSON.stringify({done:spec.id,seed,gates:row.gates,drops:net.stats.source_dropped+net.stats.switch_dropped,ring_missing:a.missing,drift_us:drift,elapsed_ms:row.elapsed_ms}));
}
fs.writeFileSync(root+'reports/phase1-sustained.json',JSON.stringify({evidence:'512_BLOCK_ALL_DESTINATION_EVENT_TRACES_NOT_HARDWARE',config:cfg,hashes,rows},null,2)+'\n');
const f=x=>Number(x.toFixed(3));const md=['# 第一阶段持续轨迹与缓存预算','',
 '512块、256源、全部频率目的地网络及各自独立ring联合验证、100µs确定性hash抖动；每8块下游停顿20µs。完整设置和源文件SHA256见JSON。末季度与中段季度输出排队均值比较是有限运行漂移检查，不是任意抖动/无限运行证明。', '',
 '| 场景 | seed | 节点数 | 科学Gb/s/片 | 网络 | ring | 含预留MiB | 85%RAM预算 | 队列均值最大漂移µs |', '|---|---:|---:|---:|---|---|---:|---|---:|'];
for(const r of rows)md.push(`| ${r.id} | ${r.seed} | ${r.all_destinations} | ${f(r.science_bps_per_card/1e9)} | ${r.gates.network} | ${r.gates.ring} | ${f(r.memory.total_bytes/1048576)} | ${r.gates.raw_memory} | ${f(r.output_queue_window_drift_us)} |`);
md.push('', 'RAM总量含原始槽、96B/槽元数据、双份I/Q16校准或单波束系数、256KiB接收FIFO和1MiB算法工作预留。分配效率、bank端口、布局与精确RAM资源尚待综合；85%上限为规划条件。');
fs.writeFileSync(root+'reports/phase1-sustained.md',md.join('\n')+'\n');
