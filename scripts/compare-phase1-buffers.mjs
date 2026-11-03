import fs from 'node:fs';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const report=JSON.parse(fs.readFileSync(root+'reports/phase1-sustained.json'));
const c=JSON.parse(fs.readFileSync(root+'config/phase1.json'));
const cfg=report.config,rows=[];
for(const spec of cfg.scenarios){const reference=report.rows.find(x=>x.id===spec.id);
 if(!reference)throw Error('missing sustained row');
 const s=c.scenarios.find(x=>x.id===spec.base),T=s.spectra_per_packet,L=spec.channels,D=spec.depth;
 const rawSlot=256*8*L*T*2,meta=D*cfg.slot_metadata_bytes_assumed;
 for(const beams of [1,4,16]){
  const coeff=cfg.weight_banks*2048*L*beams*4;
  const accum=D*L*T*beams*2*16,weightPower=D*L*beams*2*8;
  const fixed=coeff+meta+cfg.ingress_fifo_bytes_assumed+cfg.algorithm_work_bytes_reserved;
  const raw=fixed+D*rawSlot,arrival=fixed+accum+weightPower;
  const hybrid=fixed+2*rawSlot,spill=Math.max(0,D-2)*rawSlot;
  const bandwidth=reference.science_bps_per_card/8;
  rows.push({id:spec.id,beams,slots:D,channels:L,coefficients_bytes:coeff,metadata_bytes:meta,
   algorithm_reserved_bytes:cfg.algorithm_work_bytes_reserved,ingress_fifo_bytes:cfg.ingress_fifo_bytes_assumed,
   source_assembly_data_bytes:reference.memory.source_assembly_data_bytes,
   raw:{total_onchip_bytes:raw,data_bytes:D*rawSlot,full_write_read_bytes_s:2*bandwidth,within_budget:raw<=reference.memory.usable_raw_limit_bytes},
   arrival:{total_onchip_bytes:arrival,accumulators_bytes:accum,weight_power_bytes:weightPower,within_budget:arrival<=reference.memory.usable_raw_limit_bytes,
    complex_macs_per_s:reference.science_bps_per_card/16*beams,note:'Weighted-sum arithmetic only validated at small scale; rate is a requirement, NOT synthesized throughput'},
   hybrid:{total_onchip_bytes:hybrid,ddr_spill_bytes:spill,worst_full_spill_write_read_bytes_s:2*bandwidth,within_onchip_budget:hybrid<=reference.memory.usable_raw_limit_bytes,
    ddr_verified:false,note:'Capacity estimate, not tested arbitration/latency. Must guarantee mixed burst throughput and deadline.'},
   ddr_examples:[2400,2666.6666666667,3200].map(mtps=>({mtps,data_bits:64,efficiency_assumed:0.75,
    effective_read_plus_write_bytes_s:mtps*1e6*8*0.75,full_spill_requirement_fits_assumption:2*bandwidth<=mtps*1e6*8*0.75}))});
 }
}
fs.writeFileSync(root+'reports/phase1-buffer-comparison.json',JSON.stringify({evidence:'ANALYTICAL_MEMORY_AND_BANDWIDTH_WITH_SMALL_INTEGER_REFERENCE_TESTS',assumptions:cfg,rows},null,2)+'\n');
const f=x=>Number(x.toFixed(3));const md=['# P1-05 缓存架构比较','',
 '容量为解析预算；原始槽与服务期限已在持续轨迹中测试，到包即累加只做小规模宽位整数科学真值验证，混合DDR尚未实现/测试。不得据此将arrival或hybrid称为已达标的高速数据通路。', '',
 '统一配置：I/Q8输入，64bit实部与虚部累加，独立极化，I/Q16频率相关系数双份更新，另存64bit有效权重功率。每槽96B元数据、256KiB接收FIFO、1MiB算法工作预留；上限取器件原始RAM约4.36MiB的85%。预留不是完整算法资源实测。','',
 '| 场景 | 波束数 | 原始槽+系数等MiB | 到包累加+系数等MiB | 两槽+DDR的片内MiB | DDR最多溢出MiB | 全量DDR写+读GB/s |',
 '|---|---:|---:|---:|---:|---:|---:|'];
for(const r of rows)md.push(`| ${r.id} | ${r.beams} | ${f(r.raw.total_onchip_bytes/1048576)} ${r.raw.within_budget?'可容纳':'超预算'} | ${f(r.arrival.total_onchip_bytes/1048576)} ${r.arrival.within_budget?'可容纳':'超预算'} | ${f(r.hybrid.total_onchip_bytes/1048576)} | ${f(r.hybrid.ddr_spill_bytes/1048576)} | ${f(r.raw.full_write_read_bytes_s/1e9)} |`);
md.push('', '## 决策', '',
 '推荐第一版接收RTL先采用candidate128/mapped128的原始电压环形槽：它保持算法接口与原始样本，可复现，且在所声明工作区预留条件下留有容量余量。74节点仍是入口下限，但考虑系数、工作区与FIFO后原始槽不满足当前85%片内RAM预算，不能作为首个完整接收配置。', '',
 '少量固定定向波束可继续采用到包即乘加以降低raw ring占用。精确整数参考已检验乱序、重复、缺失源功率权重、epoch切换与系数切换；必须宽位累加后一次舍入，中途饱和会产生到达顺序相关结果。该路线需要满足每包实时乘加和系数bank访存，尚未综合。增加波束后频率相关系数可主导片内空间；不是仅靠省去raw ring就能放下16波束。', '',
 '混合DDR可扩展窗口，但当前没有MIG性能证明，不能作为基准成立的前提。74节点满载科学流89.6Gb/s时，写加读至少22.4GB/s，超过单64bit DDR在2400/2666.7/3200MT/s且75%效率假设下的14.4/16/19.2GB/s；不承诺全部流持续落DDR。128节点的51.2Gb/s对应12.8GB/s，只有在实际混合突发访问达到该要求、且不侵占其他功能带宽时才可使用。', '',
 'DDR容量只决定能留多久；写读带宽、按包块的突发/转置、刷新、ECC、仲裁与最坏延迟决定能否连续工作。不得每2字节样本进行随机DDR读写，应先按源/时间块突发写入，再片内分块转置。', '',
 '源端paced三bank的数据装配预算：ideal200 384KiB、mapped320 240KiB、ideal500 768KiB，另有包头/描述符/输出队列。源队列中的payload通常引用装配bank，不应无条件再复制一份；如实际打包器复制，则须把额外FIFO单独加入。', '',
 '1ms差分窗口对应的原始数据已超片内RAM，需降低每片负载或测过的DDR支持。科学触发电压长ring不在此短时接收承诺中。');
fs.writeFileSync(root+'reports/phase1-buffer-comparison.md',md.join('\n')+'\n');
console.log('Generated raw/arrival/hybrid comparison: '+rows.length+' configurations');
