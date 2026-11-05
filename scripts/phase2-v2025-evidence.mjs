// Collect only existing migration evidence; never starts or accepts a run.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const build='D:/work/build/apertureforge-fpga/cx-p2_11-shell-v2025-20261104-01';
const job=build+'/serial_peer_verification',hash=b=>createHash('sha256').update(b).digest('hex');
const hardware='D:/work/build/apertureforge-fpga/cx-p2_11-shell-v2025-20261104-02';
const artifact=p=>fs.existsSync(p)?{path:p,sha256:hash(fs.readFileSync(p))}:null;
const read=p=>fs.existsSync(p)?fs.readFileSync(p,'utf8'):'';
const state=read(job+'/job_status.json'),status=state?JSON.parse(state):{status:'NOT RUN'};
const marker=read(job+'/vectors/pipeline_pass.txt').trim(),log=read(job+'/simulate.stdout.txt');
const markerFresh=fs.existsSync(job+'/vectors/pipeline_pass.txt')&&
 fs.statSync(job+'/vectors/pipeline_pass.txt').mtimeMs>=Date.parse(status.started_utc)&&
 fs.statSync(job+'/vectors/pipeline_pass.txt').mtimeMs<=Date.parse(status.observed_utc)+2000;
const snapshotCheck=b=>{
 const s=JSON.parse(read(b+'/source_snapshot.json'));
 return Object.entries(s.source_sha256).map(([f,h])=>({file:f,expected:h,
  verified:hash(read(b+'/source/'+f).replaceAll('\r\n','\n'))===h}));
};
const implementationSources=snapshotCheck(build),hardwareSources=snapshotCheck(hardware);
const compiledTb=job+'/source/sim/tb_af_cmac_receive_shell.sv';
const generated=JSON.parse(read(job+'/generated_config.json'));
const tbVerified=hash(fs.readFileSync(compiledTb))===generated.compiled_testbench_sha256;
const hwRtlMatch=implementationSources.filter(v=>v.file.startsWith('rtl/')).every(v=>
 v.verified&&hardwareSources.some(w=>w.file===v.file&&w.expected===v.expected&&w.verified)&&
 hash(read(path.join(root,v.file)).replaceAll('\r\n','\n'))===v.expected);
const config=p=>Object.fromEntries(read(p).trim().split(/\r?\n/).map(l=>l.split('\t')).filter(([k])=>k.startsWith('CONFIG.')));
const oldConfig=config('D:/work/build/apertureforge-fpga/cx-p2_11-shell-20261104-04/reports/cmac_configuration.tsv');
const newConfig=config(hardware+'/reports/cmac_configuration.tsv');
const timing=read(hardware+'/reports/timing_impl_1.rpt'),util=read(hardware+'/reports/utilization_impl_1.rpt');
const timingRow=timing.match(/WNS\(ns\)[^\n]*\n[^\n]*\n\s*([^\n]+)/)?.[1].trim().split(/\s+/).map(Number);
const cdcRows=read(hardware+'/reports/cdc_impl_1.rpt').split(/\r?\n/).filter(s=>/^(Info|Warning|Critical)/.test(s))
 .map(s=>s.trim().split(/\s{2,}/)).filter(r=>r.length>=10&&r.slice(-5).every(v=>/^\d+$/.test(v)));
const drcRows=read(hardware+'/reports/drc.rpt').split(/\r?\n/).map(s=>s.split('|').map(v=>v.trim()))
 .filter(r=>r.length===6&&/^\d+$/.test(r[4])&&['Warning','Critical Warning','Error'].includes(r[2]));
const cellMap=Object.fromEntries(read(hardware+'/reports/physical_checks_impl_1.tsv').trim().split(/\r?\n/).map(s=>s.split('\t')));
const number=(text,re)=>{const v=text.match(re)?.[1];return v===undefined?null:Number(v.replaceAll(',',''));};
const route=read(hardware+'/reports/route_status.rpt');
const busSlacks=[...read(hardware+'/reports/bus_skew.rpt').matchAll(/Slack\s*\([^)]*\)\s*:\s*(-?[\d.]+)/g)].map(m=>Number(m[1]));
const quality={resources:{lut:number(util,/\|\s*CLB LUTs\*?\s*\|\s*([\d,]+)/),ff:number(util,/\|\s*CLB Registers\s*\|\s*([\d,]+)/),
 dsp:number(util,/\|\s*DSPs\s*\|\s*([\d,]+)/),uram:number(util,/\|\s*URAM\s*\|\s*([\d,]+)/),bram36_equivalent:number(util,/\|\s*Block RAM Tile\s*\|\s*([\d.]+)/)},
 timing:timingRow?.length>=12?{wns_ns:timingRow[0],tns_ns:timingRow[1],whs_ns:timingRow[4],wpws_ns:timingRow[8]}:null,
 no_clock:number(timing,/checking no_clock\s*\((\d+)\)/),unconstrained_internal:number(timing,/checking unconstrained_internal_endpoints\s*\((\d+)\)/),
 cdc:cdcRows.length?{unsafe:cdcRows.reduce((s,r)=>s+Number(r.at(-3)),0),unknown:cdcRows.reduce((s,r)=>s+Number(r.at(-2)),0)}:null,
 drc:drcRows.length?Object.fromEntries(['Warning','Critical Warning','Error'].map(level=>[level,drcRows.filter(r=>r[2]===level).reduce((s,r)=>s+Number(r[4]),0)])):null,
 route_errors:number(route,/nets with routing errors\.+\s*:\s*(\d+)/),fully_routed:number(route,/fully routed nets\.+\s*:\s*(\d+)/),
 routable:number(route,/routable nets\.+\s*:\s*(\d+)/),bus_skew_min_slack_ns:busSlacks.length?Math.min(...busSlacks):null,
 physical:{blackboxes:number(read(hardware+'/reports/physical_checks_impl_1.tsv'),/^blackboxes\t(\d+)/m),
  cmac:Number(cellMap.CMACE4??NaN),gt_channel:Number(cellMap.GTYE4_CHANNEL??NaN),gt_common:Number(cellMap.GTYE4_COMMON??NaN)}};
const synopsis={schema:1,collected_utc:new Date().toISOString(),tool:'Vivado 2025.1',part:'xcku5p-ffvb676-1-i',build,
 collector:artifact(fileURLToPath(import.meta.url)),source_snapshot:artifact(build+'/source_snapshot.json'),
 identity:JSON.parse(read(build+'/migration_identity.json')),
 integrity:{implementation_sources:implementationSources,standard_hardware_sources:hardwareSources,
  hardware_rtl_matches_current_worktree:hwRtlMatch,compiled_testbench:artifact(compiledTb),compiled_testbench_verified:tbVerified,marker_fresh:markerFresh},
 cmac_configuration:artifact(build+'/reports/cmac_configuration.tsv'),
 simulation:{scope:'Two actual CMAC/GT endpoints over serial lines and real receive shell; no GT bypass',status:status.status,
  phase:status.phase,error:status.error??null,acceptance:status.acceptance??null,metrics:status.metrics??null,
  functional_pass:status.status==='COMPLETE'&&markerFresh&&tbVerified&&hwRtlMatch&&marker===status.acceptance&&/^PASS packets=4096 read_words=98304 /.test(marker)&&log.includes('AF_CMAC_PIPELINE_PASS packets=4096 read_words=98304'),
  last_progress:log.split(/\r?\n/).filter(s=>/^AF_SERIAL_(PROGRESS|TIME) /.test(s)).at(-1)??null,
  artifacts:['source_snapshot.json','generated_config.json','job_spec.json','job_status.json','compile.stdout.txt','elaborate.stdout.txt','simulate.stdout.txt','vectors/pipeline_pass.txt'].map(f=>artifact(job+'/'+f)).filter(Boolean)},
 simulation_configuration_synthesis:{scope:'FAST_SIM_MODE=1 synthesis only; shortened marker interval, not the standard hardware configuration',
  reports:['utilization_synth_1.rpt','timing_synth_1.rpt','physical_cells_synth_1.tsv'].map(f=>artifact(build+'/reports/'+f)).filter(Boolean)},
 implementation:{build:hardware,scope:'Standard FAST_SIM_MODE=0 2025.1 hardware implementation; never import 2026 timing as migration PASS',
  routed_quality:quality,
  configuration_differences_from_2026:[...new Set([...Object.keys(oldConfig),...Object.keys(newConfig)])].filter(k=>oldConfig[k]!==newConfig[k]).map(k=>({name:k,v2026:oldConfig[k]??null,v2025:newConfig[k]??null})),
  source_snapshot:artifact(hardware+'/source_snapshot.json'),configuration:artifact(hardware+'/reports/cmac_configuration.tsv'),
  SYNTH:fs.existsSync(hardware+'/reports/utilization_synth_1.rpt')?'REPORT_COLLECTED':'NOT COLLECTED',
  ROUTED:fs.existsSync(hardware+'/reports/route_status.rpt')?'REPORT_COLLECTED':'NOT COLLECTED',
  reports:['utilization_synth_1.rpt','timing_synth_1.rpt','utilization_impl_1.rpt','timing_impl_1.rpt','route_status.rpt','drc.rpt','cdc_impl_1.rpt','clocks_impl_1.rpt','bus_skew.rpt'].map(f=>artifact(hardware+'/reports/'+f)).filter(Boolean)},
 board:'NOT RUN',science_kernels:'NOT STARTED',m3_completion:'See phase2-cx-m3.json milestone_audit; this collector covers migration only'};
fs.writeFileSync(path.join(root,'reports/phase2-v2025-migration.json'),JSON.stringify(synopsis,null,2)+'\n');
console.log(JSON.stringify({simulation:synopsis.simulation.status,phase:status.phase,progress:synopsis.simulation.last_progress,implementation:synopsis.implementation}));
