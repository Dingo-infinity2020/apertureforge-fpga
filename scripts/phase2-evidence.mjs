// Publish compact, sanitized evidence only. Raw tool/license logs remain external.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const external=path.resolve(process.argv[2]??'D:/work/build/apertureforge-fpga');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;
function utilization(text){
 const labels={lut:'CLB LUTs',ff:'CLB Registers',bram36_tiles:'Block RAM Tile',uram:'URAM',dsp:'DSPs'};
 const result=Object.fromEntries(Object.entries(labels).map(([k,label])=>{
  const line=text.split('\n').find(l=>l.split('|')[1]?.trim().replaceAll('*','')===label);
  if(!line)throw Error(`Missing resource ${label}`);return [k,Number(line.split('|')[2].trim().replaceAll(',',''))];
 }));
 for(const [k,label]of Object.entries({lut_logic:'LUT as Logic',lut_memory:'LUT as Memory',lut_distributed_ram:'LUT as Distributed RAM',
  lut_shift_register:'LUT as Shift Register',ramb18:'RAMB18',ramb36_fifo:'RAMB36/FIFO'})){
  const line=text.split('\n').find(l=>l.split('|')[1]?.trim().replaceAll('*','')===label);
  result[k]=line?Number(line.split('|')[2].trim().replaceAll(',','')):null;
 }
 return result;
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
 ['p2_05_store_candidate_20261103_01','raw store, candidate128 full payload capacity','utilization_synth_1.rpt','timing_synth_1.rpt','utilization_impl_1.rpt','timing_impl_1.rpt'],
 ['p2_03_header_pipe_20261103_01','8-stage aligned AFP1 header, variable runtime arithmetic','utilization_synth.rpt','timing_synth.rpt','utilization_route.rpt','timing_route.rpt'],
 ['p2_04_control_20261103_01','256-source 10-slot transaction metadata, payload store not connected','utilization_synth_1.rpt','timing_synth_1.rpt','utilization_impl_1.rpt','timing_impl_1.rpt'],
 ['p2_04_control_runtime_20261103_01','same full-size control, RuntimeOptimized synthesis comparison','utilization_synth_1.rpt','timing_synth_1.rpt','utilization_impl_1.rpt','timing_impl_1.rpt'],
 ...[32,64,512].map(w=>[`p2_03_parser_w${w}_20261103_01`,`Ethernet/IPv4/UDP/AFP1 parser width ${w}, ideal external admission`,
  'utilization_synth_1.rpt','timing_synth_1.rpt','utilization_impl_1.rpt','timing_impl_1.rpt']),
 ['p2_06_core_20261103_01','Real parser, ring admission, generation guards and full mapped128 raw RAM; stallable input',
  'utilization_synth_1.rpt','timing_synth_1.rpt','utilization_impl_1.rpt','timing_impl_1.rpt']
];
const firstCommit='9961c69e11f5e124f7ba6abc3afec26bf8fade5b';
const firstBatch=JSON.parse(execFileSync('git',['show',`${firstCommit}:reports/phase2-progress.json`],{cwd:root,encoding:'utf8'}));
const runs=configs.map(([id,scope,su,st,ru,rt])=>{
 const dir=path.join(external,id),reports=path.join(dir,'reports'),artifacts={};
 function report(name){const p=path.join(reports,name),t=read(p);if(t!==null)artifacts[`reports/${name}`]=hash(t);return t;}
 function stage(u,t){const ut=report(u),tt=report(t);if(!ut||!tt)return {status:'NOT_COLLECTED'};
  return {status:'COLLECTED',resources:utilization(ut),timing:timing(tt)};}
 const simulation=read(path.join(dir,'vectors/behavioral_simulation_pass.txt'))??read(path.join(dir,'vectors/simulation_pass.txt'));
 const post_implementation_simulation=read(path.join(dir,'vectors/post_implementation_simulation_pass.txt'))?.trim()??'NOT_COLLECTED';
 const time_edges=read(path.join(dir,'vectors/time_edges_pass.txt'))?.trim()??'NOT_RUN';
 const run_state_text=read(path.join(dir,'reports/run_state.json'));
 if(simulation && !simulation.startsWith('PASS '))throw Error('Invalid PASS marker');
 const synthesis=stage(su,st),routed=stage(ru,rt),same_route_clock_rechecks={};
 for(const mhz of [200,125]){
  const t=report(`timing_route_recheck_${mhz}mhz.rpt`);if(t)same_route_clock_rechecks[mhz]=timing(t);
 }
 const routeStatus=report('route_status.rpt'),drc=report('drc.rpt');report('cdc.rpt');report('clocks.rpt');
 const drcSeverity={Error:0,'Critical Warning':0,Warning:0};
 if(drc)for(const line of drc.split('\n')){const col=line.split('|').map(c=>c.trim());if(col[2] in drcSeverity && /^\d+$/.test(col[4]))drcSeverity[col[2]]+=Number(col[4]);}
 for(const n of ['simulation_pass.txt','behavioral_simulation_pass.txt','post_implementation_simulation_pass.txt','time_edges_pass.txt','parser_perf_pass.txt','parser_perf_netlist_pass.txt','parser_vectors.json','beats.mem','info.mem','headers.mem','gold.mem',
  'core_perf_pass.txt','core_service.csv','core_perf_config.json','core_vectors.json','core_beats.mem','core_info.mem','core_gold.mem','core_perf_load.mem','core_perf_gold.mem']){
  const t=read(path.join(dir,'vectors',n));if(t!==null)artifacts[`vectors/${n}`]=hash(t);
 }
 if(fs.existsSync(path.join(dir,'vectors/vector_manifest.json')))artifacts['vectors/vector_manifest.json']=hash(fs.readFileSync(path.join(dir,'vectors/vector_manifest.json')));
 const historical=firstBatch.runs.some(r=>r.id===id);
 const historicalFiles=id.includes('header')?
  ['rtl/af_afp1_header_check.sv','sim/tb_af_afp1_header_check.sv','constraints/af_header_ooc.xdc','tcl/phase2_header.tcl','models/packet.mjs','scripts/generate-phase2-header-vectors.mjs']:
  ['rtl/af_ring_store.sv','sim/tb_af_ring_store.sv','constraints/af_store_ooc.xdc','tcl/phase2_store.tcl'];
 const snapshot=historical?{commit:firstCommit,source_sha256:Object.fromEntries(historicalFiles.map(f=>[f,firstBatch.source_sha256[f]]))}:JSON.parse(fs.readFileSync(path.join(dir,'source_snapshot.json'),'utf8'));
 const perf_text=read(path.join(dir,'vectors/parser_perf_pass.txt'));
 const perf=perf_text?Object.fromEntries([...perf_text.matchAll(/(\w+)=(\d+)/g)].map(m=>[m[1],Number(m[2])])):null;
 if(perf){perf.scope='Repeated identical mapped128 packet, ideal grant and no sink stall; parser only, NOT receiver throughput';
  perf.clock_hz=250e6;perf.packets_per_second=perf.packets*perf.clock_hz/perf.total_cycles;
  perf.science_bits_per_second=perf.science_bytes*8*perf.clock_hz/perf.total_cycles;
  perf.routed_clock_internal_pass=routed.timing?.wns_ns>=0 && routed.timing?.whs_ns>=0;}
 const corePerfText=read(path.join(dir,'vectors/core_perf_pass.txt'));
 const corePerf=corePerfText?Object.fromEntries([...corePerfText.matchAll(/(\w+)=(\d+)/g)].map(m=>[m[1],Number(m[2])])):null;
 if(corePerf){
  corePerf.scope='RTL cycle measurement, backpressured maximum injection; 25/32 consumer duty and one 5000-cycle pause; not non-stallable CMAC throughput';
  corePerf.assumed_clock_hz=250e6;corePerf.receive_pps=corePerf.packets*250e6/corePerf.receive_cycles;
  corePerf.receive_science_bps=corePerf.packets*640*8*250e6/corePerf.receive_cycles;
  corePerf.end_to_end_science_bps=corePerf.packets*640*8*250e6/corePerf.end_to_end_cycles;
  corePerf.target_clock_closed=routed.timing?.wns_ns>=0 && routed.timing?.whs_ns>=0;
  corePerf.meets_10mpps_at_assumed_clock=corePerf.receive_pps>=1e7;
 }
 return {id,scope,source_snapshot:snapshot,external_build_dir:dir.replaceAll('\\','/'),part:'xcku5p-ffvb676-1-i',clock_period_ns:4,
  simulation:simulation?.trim()??'NOT_COLLECTED',post_implementation_simulation,time_edges,
  last_observed_run_state:run_state_text?JSON.parse(run_state_text):null,
  supplementary_source_snapshot:id.includes('control')?JSON.parse(fs.readFileSync(path.join(dir,'time_edge_sources/source_snapshot.json'),'utf8')):null,
  synthesis,routed,same_route_clock_rechecks,parser_performance:perf,core_performance:corePerf,
  core_performance_source_snapshot:corePerf?JSON.parse(fs.readFileSync(path.join(dir,'performance_source/source_snapshot.json'),'utf8')):null,
  routed_quality:routeStatus?{routing_errors:Number(routeStatus.match(/nets with routing errors[^:\n]*:\s*(\d+)/)?.[1]??NaN),
   drc_checks:Number(drc?.match(/Checks found:\s*(\d+)/)?.[1]??NaN),drc_severity:drc?drcSeverity:null,
   scope:'OOC internal paths; external I/O delays, board connectivity and real CDC not established'}:null,
  parser_performance_netlist:read(path.join(dir,'vectors/parser_perf_netlist_pass.txt'))?.trim()??'NOT_RUN',artifact_sha256:artifacts};
});
const files=['models/packet.mjs','models/ethernet-frame.mjs','scripts/generate-phase2-header-vectors.mjs','scripts/generate-phase2-network-vectors.mjs',
 'tests/ethernet-frame.test.mjs','scripts/export-phase2-parser-vectors.mjs','scripts/generate-phase2-core-vectors.mjs','scripts/generate-phase2-core-perf.mjs','scripts/phase2-evidence.mjs','scripts/phase2-snapshot.mjs'];
for(const dir of ['rtl','sim','constraints','tcl'])for(const f of fs.readdirSync(path.join(root,dir)))files.push(`${dir}/${f}`);
const manifest={schema:1,date:'2026-11-03',tool:'Vivado 2026.1 via MCP',baseline_commit:'75b4bc6ea90015a96db94e1b18c2672802581d3e',
 phase_status:'PAUSED',source_hash_normalization:'UTF-8 text, CRLF converted to LF; artifact hashes retain raw report bytes',
 source_sha256:Object.fromEntries(files.sort().map(p=>[p,hash(fs.readFileSync(path.join(root,p),'utf8').replaceAll('\r\n','\n'))])),
 dependencies:{cmac:{status:'USER_REPORTED_LICENSE_AVAILABLE_CHECKOUT_PENDING',last_probe_status:'ACTUAL_IP_SYNTH_FAILED_LICENSE',
  ip:'cmac_usplus:3.1',feature:'cmac_usplus@2020.05',caui4:true,interface:'AXIS'},
  missing_part_prefixes:['xcku11p','xcku15p'],rfsoc_development:'OUT_OF_SCOPE_INPUT_MODEL_ONLY',hardware:'NOT_RUN'},
 network_reference:(()=>{const dir=path.join(external,'p2_01_network_20261103_01/vectors'),p=path.join(dir,'network_vectors.json'),raw=fs.readFileSync(p,'utf8'),n=JSON.parse(raw);
  return {source_artifact_evidence:n.evidence,rtl_replay_status:runs.filter(r=>r.id.includes('parser_w')).every(r=>r.simulation.startsWith('PASS '))?'DERIVED_PARSER_REPLAY_PASS':'NOT_VERIFIED',
   external_vector_file:p.replaceAll('\\','/'),sha256:hash(raw),cases:n.cases.length,
   positive:n.cases.filter(c=>c.expected==='ACCEPT_AT_FINAL_BEAT').length,negative:n.cases.filter(c=>c.expected==='REJECT').length,
   widths:[32,64,512],science_start_byte:n.science_start_byte,udp_checksum_policy:n.udp_checksum_policy,source_sha256:n.source_sha256};})(),
 rejected_experiments:[{id:'p2_01_header_20261103_01',reason:'OOC property misspelled; physical I/O buffers inferred; implementation stopped; not accepted as OOC evidence'},
 {id:'p2_05_store_mapped_20261103_01/netlist-startup',reason:'Original bench initialized RAM during glbl.GSR; post-synthesis and post-implementation mismatch at word 1; bench startup moved from 20ns to 140ns and full routed netlist test rerun, RTL unchanged'}],runs,
 limits:['Stallable processing-side parser/ring/RAM core connected; non-stallable ingress and CDC not implemented',
 'OOC external I/O delays and physical CMAC clock tree absent; internal timing only',
 'Combined core misses 250MHz timing and 10Mpps even at the assumed 250MHz simulation clock',
 'Core has RTL integration tests; combined-core post-implementation simulation NOT RUN',
 'Science algorithms not yet built; RFSoC development excluded by user scope clarification','Full shell and alternative parts remain NOT VERIFIED']};
fs.writeFileSync(path.join(root,'reports/phase2-progress.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(runs.map(r=>({id:r.id,sim:r.simulation,synth:r.synthesis.status,
 routed:r.routed.status,wns_ns:r.routed.timing?.wns_ns??null})),null,2));
