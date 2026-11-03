// Publish compact, sanitized evidence only. Raw tool/license logs remain external.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const external=path.resolve(process.argv[2]??'D:/work/build/apertureforge-fpga');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;
function utilization(text){
 const labels={lut:'CLB LUTs',ff:'CLB Registers',bram36_tiles:'Block RAM Tile',uram:'URAM',dsp:'DSPs'};
 return Object.fromEntries(Object.entries(labels).map(([k,label])=>{
  const line=text.split('\n').find(l=>l.split('|')[1]?.trim().replaceAll('*','')===label);
  if(!line)throw Error(`Missing resource ${label}`);return [k,Number(line.split('|')[2].trim().replaceAll(',',''))];
 }));
}
function timing(text){
 const lines=text.split('\n'),start=lines.findIndex(l=>l.includes('WNS(ns)')&&l.includes('WHS(ns)'));
 const row=lines.slice(start+1).find(l=>/^\s*-?\d+\.\d+\s/.test(l));
 if(start<0||!row)throw Error('Missing timing row');const v=row.trim().split(/\s+/).map(Number);
 return {wns_ns:v[0],tns_ns:v[1],setup_failing_endpoints:v[2],whs_ns:v[4],ths_ns:v[5],hold_failing_endpoints:v[6],
  internal_unconstrained_endpoints:Number(text.match(/checking unconstrained_internal_endpoints \((\d+)\)/)?.[1]??NaN),
  internal_no_clock:Number(text.match(/checking no_clock \((\d+)\)/)?.[1]??NaN)};
}
const configs=[
 ['p2_01_header_20261103_02','aligned AFP1 header only', 'utilization_synth.rpt','timing_synth.rpt','utilization_route.rpt','timing_route.rpt'],
 ['p2_05_store_mapped_20261103_01','raw store, mapped128 full payload capacity','utilization_synth_1.rpt','timing_synth_1.rpt','utilization_impl_1.rpt','timing_impl_1.rpt'],
 ['p2_05_store_candidate_20261103_01','raw store, candidate128 full payload capacity','utilization_synth_1.rpt','timing_synth_1.rpt','utilization_impl_1.rpt','timing_impl_1.rpt']
];
const runs=configs.map(([id,scope,su,st,ru,rt])=>{
 const dir=path.join(external,id),reports=path.join(dir,'reports'),artifacts={};
 function report(name){const p=path.join(reports,name),t=read(p);if(t!==null)artifacts[`reports/${name}`]=hash(t);return t;}
 function stage(u,t){const ut=report(u),tt=report(t);if(!ut||!tt)return {status:'NOT_COLLECTED'};
  return {status:'COLLECTED',resources:utilization(ut),timing:timing(tt)};}
 const simulation=read(path.join(dir,'vectors/behavioral_simulation_pass.txt'))??read(path.join(dir,'vectors/simulation_pass.txt'));
 const post_implementation_simulation=read(path.join(dir,'vectors/post_implementation_simulation_pass.txt'))?.trim()??'NOT_COLLECTED';
 if(simulation && !simulation.startsWith('PASS '))throw Error('Invalid PASS marker');
 const synthesis=stage(su,st),routed=stage(ru,rt),same_route_clock_rechecks={};
 if(id.includes('header'))for(const mhz of [200,125]){
  const t=report(`timing_route_recheck_${mhz}mhz.rpt`);if(t)same_route_clock_rechecks[mhz]=timing(t);
 }
 for(const n of ['route_status.rpt','drc.rpt','cdc.rpt'])report(n);
 for(const n of ['simulation_pass.txt','behavioral_simulation_pass.txt','post_implementation_simulation_pass.txt']){
  const t=read(path.join(dir,'vectors',n));if(t!==null)artifacts[`vectors/${n}`]=hash(t);
 }
 if(fs.existsSync(path.join(dir,'vectors/vector_manifest.json')))artifacts['vectors/vector_manifest.json']=hash(fs.readFileSync(path.join(dir,'vectors/vector_manifest.json')));
 return {id,scope,external_build_dir:dir.replaceAll('\\','/'),part:'xcku5p-ffvb676-1-i',clock_period_ns:4,
  simulation:simulation?.trim()??'NOT_COLLECTED',post_implementation_simulation,synthesis,routed,same_route_clock_rechecks,artifact_sha256:artifacts};
});
const files=['models/packet.mjs','scripts/generate-phase2-header-vectors.mjs','scripts/phase2-evidence.mjs'];
for(const dir of ['rtl','sim','constraints','tcl'])for(const f of fs.readdirSync(path.join(root,dir)))files.push(`${dir}/${f}`);
const manifest={schema:1,date:'2026-11-03',tool:'Vivado 2026.1 via MCP',baseline_commit:'75b4bc6ea90015a96db94e1b18c2672802581d3e',
 phase_status:'IN_PROGRESS',source_hash_normalization:'UTF-8 text, CRLF converted to LF; artifact hashes retain raw report bytes',
 source_sha256:Object.fromEntries(files.sort().map(p=>[p,hash(fs.readFileSync(path.join(root,p),'utf8').replaceAll('\r\n','\n'))])),
 dependencies:{cmac:{status:'ACTUAL_IP_SYNTH_FAILED_LICENSE',ip:'cmac_usplus:3.1',feature:'cmac_usplus@2020.05',caui4:true,interface:'AXIS'},
  missing_part_prefixes:['xcku11p','xcku15p','xczu47dr'],hardware:'NOT_RUN'},
 rejected_experiments:[{id:'p2_01_header_20261103_01',reason:'OOC property misspelled; physical I/O buffers inferred; implementation stopped; not accepted as OOC evidence'},
 {id:'p2_05_store_mapped_20261103_01/netlist-startup',reason:'Original bench initialized RAM during glbl.GSR; post-synthesis and post-implementation mismatch at word 1; bench startup moved from 20ns to 140ns and full routed netlist test rerun, RTL unchanged'}],runs,
 limits:['Modules not connected into a receiver','No full Ethernet/IP/UDP parser, admission, commit or CDC evidence',
 'OOC external I/O delays and physical CMAC clock tree absent; internal timing only','RAM store does not implement slot ownership, generation or source masks',
 'Science algorithms and RFSoC equivalent frontend not yet built','Full shell and alternative parts remain NOT VERIFIED']};
fs.writeFileSync(path.join(root,'reports/phase2-progress.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(runs.map(r=>({id:r.id,sim:r.simulation,synth:r.synthesis,routed:r.routed})),null,2));
