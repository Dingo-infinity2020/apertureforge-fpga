import {ReceiveRing} from './receive-ring.mjs';
// Small exact fixed-point reference. It shares admission, not scientific arithmetic, with raw-ring mode.
export class ArrivalBeam {
 constructor({ring,frequencies,spectra,inputs=8,polarizations=2,beams,weights}) {
  Object.assign(this,{frequencies,spectra,inputs,polarizations,beams});
  this.weights=this.checkWeights(weights,ring.sources);this.states=new Map();this.outputs=[];
  this.ring=new ReceiveRing({...ring,onAccept:p=>this.add(p),onOutput:r=>this.emit(r),onAbort:()=>this.states.clear()});
 }
 checkWeights(w,sources){
  if(w.length!==this.frequencies)throw Error('weight frequencies');
  for(const f of w){if(f.length!==sources*this.inputs)throw Error('weight inputs');for(const input of f){
   if(input.length!==this.beams)throw Error('weight beams');for(const z of input)if(z.length!==2||!z.every(x=>Number.isInteger(x)&&x>=-32768&&x<=32767))throw Error('weight component');}}
  return structuredClone(w);
 }
 fresh(){return {sum:Array(this.spectra*this.frequencies*this.beams*this.polarizations*2).fill(0n),
  power:Array(this.frequencies*this.beams*this.polarizations).fill(0n)};}
 add(p){let state=this.states.get(p.block);if(!state){state=this.fresh();this.states.set(p.block,state);}
  for(let f=0;f<this.frequencies;f++)for(let local=0;local<this.inputs;local++){
   const input=p.source*this.inputs+local,pol=input%this.polarizations;
   for(let beam=0;beam<this.beams;beam++){
    const [wr,wi]=this.weights[f][input][beam].map(BigInt);
    state.power[(f*this.beams+beam)*this.polarizations+pol]+=wr*wr+wi*wi;
    for(let t=0;t<this.spectra;t++){
     const offset=2*((t*this.frequencies+f)*this.inputs+local);
     const re=BigInt(p.body.readInt8(offset)),im=BigInt(p.body.readInt8(offset+1));
     const k=2*(((t*this.frequencies+f)*this.beams+beam)*this.polarizations+pol);
     state.sum[k]+=re*wr-im*wi;state.sum[k+1]+=re*wi+im*wr;
     if([state.sum[k],state.sum[k+1]].some(x=>x<-(1n<<63n)||x>=(1n<<63n)))throw Error('64bit overflow');
    }
   }
  }
 }
 emit(record){const data=this.states.get(record.block)??this.fresh();this.outputs.push({...record,...data});this.states.delete(record.block);}
 push(p){if(!Buffer.isBuffer(p.body)||p.body.length!==this.spectra*this.frequencies*this.inputs*2)throw Error('payload shape');return this.ring.push(p);}
 advance(time){this.ring.advance(time);}
 switchSession(now,epoch,config,weights){const w=this.checkWeights(weights,this.ring.sources);this.ring.switchSession(now,epoch,config);this.weights=w;}
}
