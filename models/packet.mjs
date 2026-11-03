// AFP1 is a NEW offline contract. Not the existing RFSoC wire format.
export const HEADER_BYTES = 64;
const uint = (v,bits,name) => {
  if (!Number.isSafeInteger(v) || v<0 || v>2**bits-1) throw new Error(`range:${name}`);
  return v;
};
const u64 = (v,name) => {
  const n=BigInt(v); if(n<0n || n>0xffffffffffffffffn) throw new Error(`range:${name}`); return n;
};
export function routes(s) {
  uint(s.retained_bins,16,'bins'); uint(s.channels_per_destination,16,'width');
  if(!s.retained_bins || !s.channels_per_destination) throw new Error('empty route');
  const out=[];
  for(let start=0;start<s.retained_bins;start+=s.channels_per_destination)
    out.push({destination:out.length,first_frequency:start,frequencies:Math.min(s.channels_per_destination,s.retained_bins-start)});
  return out;
}
export function inputIdentity(source,local,c) {
  uint(source,16,'source'); uint(local,8,'local');
  const g=source*c.inputs_per_source+local;
  if(local>=c.inputs_per_source || g>=c.antennas*c.polarizations) throw new Error('input mapping');
  return {input:g,antenna:Math.floor(g/c.polarizations),polarization:g%c.polarizations};
}
export function sampleOffset(t,f,l,nf,ni) { return 2*((t*nf+f)*ni+l); }
export function encode(p,body) {
  const b=Buffer.alloc(HEADER_BYTES+body.length);
  b.write('AFP1',0,'ascii'); b.writeUInt8(1,4); b.writeUInt8(64,5);
  const fields=[[6,16,p.flags??1,'flags'],[8,32,p.epoch,'epoch'],[12,32,p.config,'config'],
    [16,16,p.source,'source'],[18,16,p.destination,'destination'],[20,32,p.first_frequency,'first_frequency'],
    [24,16,p.frequencies,'frequencies'],[26,16,p.spectra,'spectra']];
  for(const [offset,bits,value,name] of fields) b[`writeUInt${bits}LE`](uint(value,bits,name),offset);
  b.writeBigUInt64LE(u64(p.first_spectrum,'spectrum'),28);
  b.writeBigUInt64LE(u64(p.first_adc_sample,'adc'),36);
  b.writeUInt8(1,44); b.writeUInt8(uint(p.inputs,8,'inputs'),45);
  // 46..51 reserved zero, payload length at 52, per-source/destination sequence at 56.
  b.writeUInt32LE(body.length,52); b.writeBigUInt64LE(u64(p.sequence,'sequence'),56);
  body.copy(b,64); return b;
}
export function decode(b) {
  if(!Buffer.isBuffer(b)||b.length<64) throw new Error('short header');
  if(b.toString('ascii',0,4)!=='AFP1'||b[4]!==1||b[5]!==64) throw new Error('version');
  if(b.readUInt16LE(6)!==1 || b[44]!==1 || b.subarray(46,52).some(x=>x)) throw new Error('format/flags/reserved');
  const p={epoch:b.readUInt32LE(8),config:b.readUInt32LE(12),source:b.readUInt16LE(16),destination:b.readUInt16LE(18),
    first_frequency:b.readUInt32LE(20),frequencies:b.readUInt16LE(24),spectra:b.readUInt16LE(26),
    first_spectrum:b.readBigUInt64LE(28),first_adc_sample:b.readBigUInt64LE(36),inputs:b[45],sequence:b.readBigUInt64LE(56)};
  if(!p.frequencies||!p.spectra||!p.inputs) throw new Error('empty payload');
  const bytes=2*p.frequencies*p.spectra*p.inputs;
  if(b.readUInt32LE(52)!==bytes || b.length!==64+bytes) throw new Error('payload length');
  return {...p,body:Buffer.from(b.subarray(64))};
}
export function validate(p,c,s,session) {
  const route=routes(s)[p.destination];
  if(p.epoch!==session.epoch || p.config!==session.config) throw new Error('epoch/config');
  if(!route||route.first_frequency!==p.first_frequency||route.frequencies!==p.frequencies) throw new Error('route');
  if(p.source>=c.antennas*c.polarizations/c.inputs_per_source || p.inputs!==c.inputs_per_source) throw new Error('source');
  if(p.spectra!==s.spectra_per_packet || p.first_spectrum%BigInt(p.spectra)!==0n) throw new Error('block alignment');
  const expected=BigInt(session.epoch_adc_sample)+p.first_spectrum*BigInt(s.hop*s.ddc_decimation);
  if(p.first_adc_sample!==expected) throw new Error('time mapping');
  if(p.sequence!==p.first_spectrum/BigInt(p.spectra)) throw new Error('sequence');
  if(20+8+64+p.body.length>c.udp_ip_mtu) throw new Error('MTU');
  return p;
}
