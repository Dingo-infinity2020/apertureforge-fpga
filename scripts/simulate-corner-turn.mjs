import fs from 'node:fs';import {fileURLToPath} from 'node:url';
import {simulate} from '../models/corner-turn.mjs';import {ReceiveRing} from '../models/receive-ring.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const c=JSON.parse(fs.readFileSync(root+'config/phase1.json'));
const settings=JSON.parse(fs.readFileSync(root+'config/phase1-network.json'));
const cases=[];const ringCases=[];
for(const s of c.scenarios) {
 const experiments=[...settings.policies.map(policy=>({policy,jitter_us:0})),
  ...[10,100,1000].map(jitter_us=>({policy:'paced',jitter_us}))];
 for(const e of experiments) {
  const source_queue_bytes=settings.source_queue_copies*(8*s.retained_bins*s.spectra_per_packet*2+Math.ceil(s.retained_bins/s.channels_per_destination)*130);
  const result=simulate(c,s,{...settings,...e,source_queue_bytes});const st=result.stats;
  const tail=st.tail_wait_us;const mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
  cases.push({scenario:s.id,...e,assumptions:result.assumptions,stats:st,
    first_tail_mean_us:mean(tail.slice(8,16)),last_tail_mean_us:mean(tail.slice(-8))});
  if(e.policy==='paced') {
   const period=st.period_us;
   const scienceBytes=s.channels_per_destination*8*s.spectra_per_packet*2*256;
   const deadline=2*period+e.jitter_us+100;
   const service=scienceBytes*8/100e9*1e6;
   const pauses=[];for(let b=8;b<settings.blocks;b+=8)pauses.push([b*period+50,b*period+70]);
   for(let depth=1;depth<=Math.ceil(deadline/period)+4;depth++) {
    const r=new ReceiveRing({sources:256,blocks:settings.blocks,depth,period_us:period,deadline_us:deadline,service_us:service,pauses});
    for(const p of result.packets)r.push({...p,epoch:1,config:1});
    r.advance((settings.blocks+1)*period+deadline+settings.blocks*service+10000);
    const accounting=r.accounting();
    const complete=r.outputs.length===settings.blocks&&r.outputs.every(x=>x.valid_sources===256);
    ringCases.push({scenario:s.id,jitter_us:e.jitter_us,depth,deadline_after_release_us:deadline,
      service_us:service,pauses,science_bytes_per_slot:scienceBytes,
      raw_ring_bytes:depth*scienceBytes,complete,stats:accounting,
      max_output_latency_us:Math.max(...r.outputs.map(x=>x.end-(x.block+1)*period)),
      outputs:r.outputs.map(x=>({block:x.block,valid_sources:x.valid_sources,start:x.start,end:x.end}))});
    if(complete)break;
   }
  }
  console.log(JSON.stringify({scenario:s.id,...e,drops:st.source_dropped+st.switch_dropped,peak_queue:st.switch_peak_bytes}));
 }
}
const overload=simulate(c,{...c.scenarios[0],spectra_per_packet:1},{...settings,policy:'burst',blocks:64,switch_queue_bytes:65536});
const report={evidence:'DISCRETE_EVENT_SIMULATION_NOT_HARDWARE',settings,cases,overload_control:overload.stats};
fs.writeFileSync(root+'reports/phase1-transport.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(root+'reports/phase1-ring.json',JSON.stringify({evidence:report.evidence,ringCases},null,2)+'\n');
const fmt=x=>Number(x.toFixed(3));
const md=['# P1-03 离线网络事件结果','',
 '模型：有限源队列、源100G序列化、抽象无阻塞交换fabric、有限输出FIFO及100G序列化；每包在最终输出队列之前加入有界确定性hash延迟。不是具体交换机证明。',
 '场景与种子见JSON；每场景32块，完整256源、全部目的节点。队列容量包含在服务中的完整包，因而是保守字节上界。', '',
 '| 场景 | 策略 | 抖动µs | 丢包 | 交换峰值KiB | 最坏块内源到达差µs | 释放到接收最大µs |', '|---|---|---:|---:|---:|---:|---:|'];
for(const x of cases)md.push(`| ${x.scenario} | ${x.policy} | ${x.jitter_us} | ${x.stats.source_dropped+x.stats.switch_dropped} | ${fmt(x.stats.switch_peak_bytes/1024)} | ${fmt(x.stats.max_block_source_skew_us)} | ${fmt(x.stats.max_release_to_arrival_us)} |`);
md.push('',`超载对照：ideal200、T=1、64块、64KiB输出FIFO，丢包${overload.stats.switch_dropped}；有限缓存不会隐藏长期超载。`, '',
 '这些是有限时长、确定配置的事件结果，不是对任意抖动分布或无限时长稳定性的证明。完整ring扫描、服务停顿与槽深度见phase1-ring.json。');
fs.writeFileSync(root+'reports/phase1-transport.md',md.join('\n')+'\n');
const rm=['# P1-04 原始电压环形槽扫描','',
 '同网络结果联接256源，按固定绝对截止释放；下游100Gb/s科学数据服务，每8块注入一次20µs停顿。总截止从源块ready时刻计，不是单纯差分窗口。扫描首个通过深度不是通用最小值。','',
 '| 场景 | 抖动µs | 首个全部完整槽深度 | 截止µs | 原始数据MiB | 峰值槽数 | 输出最大延迟µs |', '|---|---:|---:|---:|---:|---:|---:|'];
for(const s of c.scenarios)for(const j of [0,10,100,1000]){
 const pass=ringCases.find(x=>x.scenario===s.id&&x.jitter_us===j&&x.complete);
 rm.push(pass?`| ${s.id} | ${j} | ${pass.depth} | ${fmt(pass.deadline_after_release_us)} | ${fmt(pass.raw_ring_bytes/1048576)} | ${pass.stats.peak_slots} | ${fmt(pass.max_output_latency_us)} |`:`| ${s.id} | ${j} | 未通过 | - | - | - | - |`);
}
rm.push('','峰值容量仅原始电压，未含bitmap、标签、系数、算法工作区。超出片内容量不代表允许无界扩展，须在P1-05降低负载、缩小窗口或引入有带宽条件的DDR。');
fs.writeFileSync(root+'reports/phase1-ring.md',rm.join('\n')+'\n');
