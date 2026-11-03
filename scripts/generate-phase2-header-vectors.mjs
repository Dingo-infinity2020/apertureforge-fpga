import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {encode} from '../models/packet.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.resolve(process.argv[2]??'');
if(!process.argv[2]||out.toLowerCase().startsWith(path.resolve(root).toLowerCase()))throw Error('Use external build/vector directory');
fs.mkdirSync(out,{recursive:true});const baseADC=9007199254740993n,rows=[];
function frame(overrides={},cfg={stride:65536,base:baseADC,log:1,nf:32}){const spectrum=overrides.first_spectrum??26n;
 return encode({epoch:7,config:11,source:5,destination:3,first_frequency:96,frequencies:32,spectra:2,inputs:8,
  first_spectrum:spectrum,first_adc_sample:(cfg.base+spectrum*BigInt(cfg.stride))&((1n<<64n)-1n),sequence:spectrum/BigInt(1<<cfg.log),
  frequencies:cfg.nf,spectra:1<<cfg.log,...overrides},Buffer.alloc(16*cfg.nf*(1<<cfg.log))).subarray(0,64);}
function add(name,header,errors,cfg={stride:65536,base:baseADC,log:1,nf:32}){rows.push({name,header_hex:header.toString('hex'),errors,
 config:{...cfg,base:cfg.base.toString()}});}
add('valid_large_adc',frame(),0);add('valid_first_spectrum',frame({first_spectrum:0n}),0);
const mutations=[['magic',0,0,1],['version',4,2,1],['flags',6,0,2],['reserved',46,1,2],['format',44,2,2],['inputs',45,7,2],
 ['epoch',8,8,4],['config',12,12,4],['destination',18,4,8],['frequency',20,97,16],['frequencies',24,31,16],['spectra',26,3,16],['payload_length',52,1,32],['sequence',56,14,64],['adc_time',36,0,128]];
for(const [name,offset,value,error]of mutations){const h=frame();h[offset]=value;add(name,h,error);}
add('source_out_of_range',frame({source:256}),8);add('odd_spectrum',frame({first_spectrum:27n}),64);
add('adc_product_overflow',frame({first_spectrum:(1n<<64n)-2n}),128);
let rng=0x4a39b70d;function u32(){rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return rng>>>0;}
for(let i=0;i<256;i++){
 const cfg={stride:i%19===0?0:u32(),base:(BigInt(u32())<<32n)|BigInt(u32()),log:i%4,nf:[5,20,32][i%3]};
 const bits=[64n,32n,16n][i%3],spectrum=(((BigInt(u32())<<32n)|BigInt(u32()))&((1n<<bits)-1n))&~BigInt((1<<cfg.log)-1);
 const exact=cfg.base+spectrum*BigInt(cfg.stride),flip=i%11===0;
 const h=frame({first_spectrum:spectrum,first_adc_sample:(exact&((1n<<64n)-1n))^(flip?1n:0n)},cfg);
 add(`runtime_math_${i}`,h,cfg.stride===0||exact>0xffffffffffffffffn||flip?128:0,cfg);
}
const file=p=>path.join(out,p).replaceAll('\\','/');
fs.writeFileSync(file('headers.mem'),rows.map(r=>Buffer.from(r.header_hex,'hex').reverse().toString('hex')).join('\n')+'\n');
fs.writeFileSync(file('errors.mem'),rows.map(r=>r.errors.toString(16).padStart(2,'0')).join('\n')+'\n');
fs.writeFileSync(file('config.mem'),rows.map(r=>((BigInt(r.config.nf)<<98n)|(BigInt(r.config.log)<<96n)|(BigInt(r.config.base)<<32n)|BigInt(r.config.stride)).toString(16).padStart(32,'0')).join('\n')+'\n');
fs.writeFileSync(file('af_header_config.svh'),`\`define AF_HEADER_COUNT ${rows.length}\n\`define AF_HEADERS "${file('headers.mem')}"\n\`define AF_ERRORS "${file('errors.mem')}"\n\`define AF_CONFIGS "${file('config.mem')}"\n\`define AF_PASS_FILE "${file('simulation_pass.txt')}"\n`);
fs.writeFileSync(file('vector_manifest.json'),JSON.stringify({scope:'AFP1 aligned header only, not Ethernet parser or ring',cases:rows,
 source_hash_normalization:'UTF-8 text, CRLF converted to LF',
 sources:Object.fromEntries(['models/packet.mjs','rtl/af_afp1_header_check.sv','scripts/generate-phase2-header-vectors.mjs'].map(p=>[p,createHash('sha256').update(fs.readFileSync(root+p,'utf8').replaceAll('\r\n','\n')).digest('hex')]))},null,2)+'\n');
console.log('Generated '+rows.length+' header cases at '+out);
