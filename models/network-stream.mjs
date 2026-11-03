import {routes} from './packet.mjs';
import {hash32} from './corner-turn.mjs';

// Heap storage is proportional to in-flight packets, not total simulated duration.
export class Heap {
 constructor(key=x=>x.time){this.a=[];this.key=key;}
 get length(){return this.a.length;} peek(){return this.a[0];}
 push(x){let i=this.a.length;this.a.push(x);while(i){const p=(i-1)>>1;if(this.key(this.a[p])<=this.key(x))break;this.a[i]=this.a[p];i=p;}this.a[i]=x;}
 pop(){const first=this.a[0],x=this.a.pop();if(this.a.length){let i=0;while(2*i+1<this.a.length){let j=2*i+1;if(j+1<this.a.length&&this.key(this.a[j+1])<this.key(this.a[j]))j++;if(this.key(x)<=this.key(this.a[j]))break;this.a[i]=this.a[j];i=j;}this.a[i]=x;}return first;}
}
export function simulateStream(c,s,o={}) {
 const groups=routes(s),D=groups.length,S=o.sources??256,B=o.blocks??512,policy=o.policy??'paced';
 if(!['paced','phased','rotated','burst'].includes(policy)||![S,B].every(x=>Number.isInteger(x)&&x>0))throw Error('stream parameters');
 const period=s.hop/s.complex_hz*s.spectra_per_packet*1e6,byteTime=8/c.line_bps*1e6;
 const capacity=o.switch_queue_bytes??524288,sourceCap=o.source_queue_bytes??2*(8*s.retained_bins*s.spectra_per_packet*2+D*130);
 const banks=o.source_assembly_banks??3,J=o.jitter_us??0,latency=o.latency_us??1,seed=o.seed??1;
 const st={generated:S*D*B,source_dropped:0,switch_dropped:0,delivered:0,source_assembly_dropped:0,
  source_peak_assembly_banks:0,source_peak_bytes:0,source_max_wait_us:0,switch_peak_bytes:0,switch_max_wait_us:0,
  max_release_to_arrival_us:0,max_block_source_skew_us:0,source_wire_bytes_generated:0,delivered_wire_bytes:0,period_us:period,peak_inflight_packets:0};
 function* sender(src){let free=0,ends=[],queue=[],head=0,pending=0;
  for(let b=0;b<B;b++){
   ends=ends.filter(t=>t>b*period+1e-10);
   if(ends.length+1>banks){st.source_dropped+=D;st.source_assembly_dropped+=D;st.source_wire_bytes_generated+=8*s.retained_bins*s.spectra_per_packet*2+D*130;continue;}
   st.source_peak_assembly_banks=Math.max(st.source_peak_assembly_banks,ends.length+1);
   for(let slot=0;slot<D;slot++){
    const dest=policy==='burst'?slot:(slot+src)%D;
    const science=groups[dest].frequencies*8*s.spectra_per_packet*2,bytes=science+130,release=(b+1)*period;
    const phase=(policy==='phased'||policy==='paced')?src/S*period:0;
    const due=release+phase+(policy==='paced'?slot*period/D:0);st.source_wire_bytes_generated+=bytes;
    while(head<queue.length&&queue[head].end<=due+1e-10)pending-=queue[head++].bytes;
    if(head>1024){queue=queue.slice(head);head=0;}
    if(pending+bytes>sourceCap){st.source_dropped++;continue;}
    const start=Math.max(due,free);free=start+bytes*byteTime;queue.push({end:free,bytes});pending+=bytes;
    st.source_peak_bytes=Math.max(st.source_peak_bytes,pending);st.source_max_wait_us=Math.max(st.source_max_wait_us,start-due);
    yield {source:src,block:b,destination:dest,release,science,bytes,source_start:start,source_end:free};
   }ends.push(free);
  }
 }
 const egress=new Heap(x=>x.packet.source_end*1e3+x.packet.source*1e-9),transit=new Heap(x=>x.ingress*1e3+x.source*1e-9);
 const senders=Array.from({length:S},(_,src)=>sender(src));
 for(let src=0;src<S;src++){const p=senders[src].next();if(!p.done)egress.push({packet:p.value,src});}
 const output=groups.map(()=>({free:0,queue:[],head:0,pending:0,peak:0,ranges:new Map(),wait:Array(B).fill(0),latency:Array(B).fill(0)}));
 const selected=[];
 function receive(p){const d=output[p.destination];
  while(d.head<d.queue.length&&d.queue[d.head].end<=p.ingress+1e-10)d.pending-=d.queue[d.head++].bytes;
  if(d.head>1024){d.queue=d.queue.slice(d.head);d.head=0;}
  if(d.pending+p.bytes>capacity){st.switch_dropped++;return;}
  const start=Math.max(d.free,p.ingress);d.free=start+p.bytes*byteTime;d.pending+=p.bytes;d.queue.push({end:d.free,bytes:p.bytes});
  d.peak=Math.max(d.peak,d.pending);st.switch_peak_bytes=Math.max(st.switch_peak_bytes,d.peak);
  st.switch_max_wait_us=Math.max(st.switch_max_wait_us,start-p.ingress);d.wait[p.block]=Math.max(d.wait[p.block],start-p.ingress);
  d.latency[p.block]=Math.max(d.latency[p.block],d.free-p.release);
  st.delivered++;st.delivered_wire_bytes+=p.bytes;st.max_release_to_arrival_us=Math.max(st.max_release_to_arrival_us,d.free-p.release);
  const r=d.ranges.get(p.block)??[Infinity,-Infinity];r[0]=Math.min(r[0],d.free);r[1]=Math.max(r[1],d.free);d.ranges.set(p.block,r);
  const delivered={...p,time:d.free};
  if(o.onDelivered)o.onDelivered(delivered);
  if(o.retain_all||(o.retain_selected!==false&&p.destination===(o.destination??0)))selected.push(delivered);
 }
 while(egress.length){const item=egress.pop(),p=item.packet;
  while(transit.length&&transit.peek().ingress<p.source_end-1e-10)receive(transit.pop());
  transit.push({...p,ingress:p.source_end+latency+J*hash32(p.source,p.block,p.destination,0,seed)});
  st.peak_inflight_packets=Math.max(st.peak_inflight_packets,transit.length);
  const next=senders[item.src].next();if(!next.done)egress.push({packet:next.value,src:item.src});
 }
 while(transit.length)receive(transit.pop());
 const per_destination=output.map(d=>{
  for(const r of d.ranges.values())st.max_block_source_skew_us=Math.max(st.max_block_source_skew_us,r[1]-r[0]);
  return {peak_bytes:d.peak,wait_by_block_us:d.wait,latency_by_block_us:d.latency};
 });
 if(st.generated!==st.source_dropped+st.switch_dropped+st.delivered)throw Error('stream accounting');
 return {stats:st,packets:selected.sort((a,b)=>a.time-b.time||a.source-b.source),per_destination,
  assumptions:{sourceCount:S,blocks:B,policy,jitter:J,latency,sourceCap,switchCap:capacity,assemblyBanks:banks,seed}};
}
