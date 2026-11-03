import {routes} from './packet.mjs';
export function hash32(a,b,c,d,seed=1) {
 let x=(Math.imul(a+1,0x9e3779b1)^Math.imul(b+1,0x85ebca6b)^Math.imul(c+1,0xc2b2ae35)^d^seed)>>>0;
 x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;return (x>>>0)/4294967296;
}
// Store-and-forward abstraction: all source links -> unlimited crossbar -> bounded output FIFOs.
// Time is microseconds. No per-cycle FPGA behavior or real switch topology is implied.
export function simulate(c,s,o={}) {
 const sourceCount=o.sources??c.antennas*c.polarizations/c.inputs_per_source;
 const groups=routes(s),D=groups.length,blocks=o.blocks??32,policy=o.policy??'paced';
 if(!['burst','rotated','phased','paced'].includes(policy)||![sourceCount,blocks].every(x=>Number.isInteger(x)&&x>0)||c.line_bps<=0||c.science_bits_per_component!==8)throw Error('network parameters');
 const jitter=o.jitter_us??0,latency=o.latency_us??1,seed=o.seed??1;
 const sourceCap=o.source_queue_bytes??2*(c.inputs_per_source*s.retained_bins*s.spectra_per_packet*2+D*130);
 const assemblyBanks=o.source_assembly_banks??3;
 const switchCap=o.switch_queue_bytes??524288;
 const period=s.hop/s.complex_hz*s.spectra_per_packet*1e6;
 const wireUs=bytes=>bytes*8/c.line_bps*1e6;
 const byDest=groups.map(()=>[]);
 const stats={generated:sourceCount*D*blocks,source_dropped:0,switch_dropped:0,delivered:0,
  source_peak_bytes:0,source_max_wait_us:0,source_peak_assembly_banks:0,source_assembly_dropped:0,switch_peak_bytes:0,switch_max_wait_us:0,
  max_release_to_arrival_us:0,max_block_source_skew_us:0,period_us:period,
  source_wire_bytes_generated:0,delivered_wire_bytes:0,tail_wait_us:[],peak_by_destination:[]};
 for(let src=0;src<sourceCount;src++) {
  let free=0,pending=0,head=0;const queue=[],blockEnds=[];
  for(let b=0;b<blocks;b++) {
   const active=blockEnds.filter(end=>end>b*period+1e-10).length;
   if(active+1>assemblyBanks){stats.source_dropped+=D;stats.source_assembly_dropped+=D;
    stats.source_wire_bytes_generated+=c.inputs_per_source*s.retained_bins*s.spectra_per_packet*2+D*130;continue;}
   stats.source_peak_assembly_banks=Math.max(stats.source_peak_assembly_banks,active+1);
   for(let slot=0;slot<D;slot++) {
   const dest=policy==='burst'?slot:(slot+src)%D;
   const science=groups[dest].frequencies*c.inputs_per_source*s.spectra_per_packet*2;
   const bytes=science+130,release=(b+1)*period;
   const phase=(policy==='phased'||policy==='paced')?src/sourceCount*period:0;
   const due=release+phase+(policy==='paced'?slot*period/D:0);
   stats.source_wire_bytes_generated+=bytes;
   while(head<queue.length&&queue[head].end<=due+1e-10)pending-=queue[head++].bytes;
   if(pending+bytes>sourceCap){stats.source_dropped++;continue;}
   const start=Math.max(due,free);free=start+wireUs(bytes);pending+=bytes;queue.push({end:free,bytes});
   stats.source_peak_bytes=Math.max(stats.source_peak_bytes,pending);
   stats.source_max_wait_us=Math.max(stats.source_max_wait_us,start-due);
   const arrival=free+latency+jitter*hash32(src,b,dest,0,seed);
   byDest[dest].push({source:src,block:b,destination:dest,release,ingress:arrival,science,bytes,source_start:start,source_end:free});
   }
   blockEnds.push(free);
  }
 }
 const selected=[];
 for(let dest=0;dest<D;dest++) {
  const packets=byDest[dest].sort((a,b)=>a.ingress-b.ingress||a.source-b.source);
  let free=0,pending=0,head=0,peak=0;const queue=[],ranges=new Map();
  const blockWait=Array(blocks).fill(0);
  for(const p of packets) {
   while(head<queue.length&&queue[head].end<=p.ingress+1e-10)pending-=queue[head++].bytes;
   if(pending+p.bytes>switchCap){stats.switch_dropped++;continue;}
   const start=Math.max(free,p.ingress);free=start+wireUs(p.bytes);pending+=p.bytes;
   queue.push({end:free,bytes:p.bytes});peak=Math.max(peak,pending);
   stats.switch_max_wait_us=Math.max(stats.switch_max_wait_us,start-p.ingress);
   blockWait[p.block]=Math.max(blockWait[p.block],start-p.ingress);
   const delivered={...p,time:free};
   stats.delivered++;stats.delivered_wire_bytes+=p.bytes;
   stats.max_release_to_arrival_us=Math.max(stats.max_release_to_arrival_us,free-p.release);
   const range=ranges.get(p.block)??[Infinity,-Infinity];range[0]=Math.min(range[0],free);range[1]=Math.max(range[1],free);ranges.set(p.block,range);
   if(o.retain_all||dest===(o.destination??0))selected.push(delivered);
  }
  for(const range of ranges.values())stats.max_block_source_skew_us=Math.max(stats.max_block_source_skew_us,range[1]-range[0]);
  stats.switch_peak_bytes=Math.max(stats.switch_peak_bytes,peak);stats.peak_by_destination.push(peak);
  if(dest===(o.destination??0))stats.tail_wait_us=blockWait;
 }
 if(stats.generated!==stats.source_dropped+stats.switch_dropped+stats.delivered)throw Error('network accounting');
 return {stats,packets:selected.sort((a,b)=>a.time-b.time||a.source-b.source),assumptions:{sourceCount,blocks,policy,jitter,latency,sourceCap,switchCap,assemblyBanks,seed}};
}
