// Abstract post-parser time slots. Packet wire validation precedes admission (packet.mjs).
// Buffers hold raw science bytes conceptually; outputs are metadata audit records, not hardware RAM.
export class ReceiveRing {
 constructor({sources,blocks,depth,period_us,deadline_us,service_us=0,epoch=1,config=1,pauses=[],onAccept=()=>{},onOutput=()=>{},onAbort=()=>{},compact_outputs=false}) {
  if(![sources,blocks,depth].every(x=>Number.isInteger(x)&&x>0)||period_us<=0||deadline_us<0||service_us<0)throw Error('ring parameters');
  if(pauses.some(([a,b],i)=>a<0||b<=a||(i>0&&a<pauses[i-1][1])))throw Error('pause order');
  Object.assign(this,{sources,blocks,depth,period_us,deadline_us,service_us,epoch,config,pauses,onAccept,onOutput,onAbort,compact_outputs});
  this.next=0;this.clock=0;this.epoch_origin_us=0;this.slots=new Map();this.busy=null;this.outputs=[];
  this.stats={arrived:0,accepted:0,rejected:0,consumed:0,discarded:0,missing:0,peak_slots:0,deadline_lateness_us:0,reasons:{}};
 }
 deadline(b){return this.epoch_origin_us+(b+1)*this.period_us+this.deadline_us;}
 reject(reason){this.stats.rejected++;this.stats.reasons[reason]=(this.stats.reasons[reason]??0)+1;return reason;}
 finishTime(start,duration){
  let t=start,remaining=duration;
  for(const [a,b] of this.pauses){if(b<=t)continue;if(a>t){const work=Math.min(remaining,a-t);remaining-=work;t+=work;if(remaining===0)return t;}if(t<b)t=b;}
  return t+remaining;
 }
 advance(now){
  if(now<this.clock)throw Error('nonmonotonic time');
  while(this.next<this.blocks){
   if(this.busy){
    if(this.busy.end>now)break;
    this.clock=this.busy.end;
    const b=this.next,slot=this.slots.get(b%this.depth);
    const sources=slot?[...slot.sources].sort((a,b)=>a-b):[];
    const record={epoch:this.epoch,config:this.config,block:b,sources,valid_sources:sources.length,
      missing_sources:this.sources-sources.length,deadline:this.deadline(b),start:this.busy.start,end:this.clock};
    this.onOutput(record);
    if(this.compact_outputs){const bitmap=Buffer.alloc(Math.ceil(this.sources/8));for(const src of sources)bitmap[src>>3]|=1<<(src%8);
      const {sources:ignored,...summary}=record;this.outputs.push({...summary,source_bitmap_hex:bitmap.toString('hex')});
    }else this.outputs.push(record);
    this.stats.consumed+=sources.length;this.stats.missing+=this.sources-sources.length;
    if(slot)this.slots.delete(b%this.depth);
    this.busy=null;this.next++;continue;
   }
   const slot=this.slots.get(this.next%this.depth);
   if(slot&&slot.block!==this.next)throw Error('generation collision');
   const ready=slot?.sources.size===this.sources;
   const start=ready?this.clock:Math.max(this.clock,this.deadline(this.next));
   if(start>now)break;
   this.stats.deadline_lateness_us=Math.max(this.stats.deadline_lateness_us,start-this.deadline(this.next));
   if(slot)slot.sealed=true;
   this.busy={start,end:this.finishTime(start,this.service_us)};
  }
  this.clock=now;
 }
 push(p){
  this.advance(p.time);this.stats.arrived++;
  if(p.epoch!==this.epoch||p.config!==this.config)return this.reject('session');
  if(!Number.isInteger(p.source)||p.source<0||p.source>=this.sources||!Number.isInteger(p.block)||p.block<0)return this.reject('format');
  if(p.block<this.next||p.time>=this.deadline(p.block)||(this.busy&&p.block===this.next))return this.reject('late');
  if(p.block>=this.blocks)return this.reject('ahead');
  if(p.block>=this.next+this.depth)return this.reject(p.time>=this.epoch_origin_us+(p.block+1)*this.period_us?'window_full':'ahead');
  const index=p.block%this.depth;let slot=this.slots.get(index);
  if(slot&&slot.block!==p.block)return this.reject('full');
  if(!slot){slot={block:p.block,sources:new Set(),sealed:false};this.slots.set(index,slot);}
  if(slot.sources.has(p.source))return this.reject('duplicate');
  slot.sources.add(p.source);this.stats.accepted++;
  this.onAccept(p);
  this.stats.peak_slots=Math.max(this.stats.peak_slots,this.slots.size);
  this.advance(p.time);return 'accepted';
 }
 switchSession(now,epoch,config){
  this.advance(now);
  for(const slot of this.slots.values())this.stats.discarded+=slot.sources.size;
  this.stats.reasons.epoch_aborted_blocks=(this.stats.reasons.epoch_aborted_blocks??0)+(this.blocks-this.next);
  this.onAbort();
  this.slots.clear();this.busy=null;this.next=0;this.epoch_origin_us=now;this.epoch=epoch;this.config=config;
 }
 accounting(){
  const resident=[...this.slots.values()].reduce((n,s)=>n+s.sources.size,0);
  if(this.stats.arrived!==this.stats.accepted+this.stats.rejected||this.stats.accepted!==this.stats.consumed+this.stats.discarded+resident)throw Error('ring accounting');
  return {...this.stats,resident};
 }
}
