// Read-only experiment collection. Never launches, alters, or accepts a run.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const external='D:/work/build/apertureforge-fpga/';
const hash=data=>createHash('sha256').update(data).digest('hex');
function artifact(file){return fs.existsSync(file)?{path:file.replaceAll('\\','/'),sha256:hash(fs.readFileSync(file))}:null;}
function configuration(build){
 return Object.fromEntries(fs.readFileSync(external+build+'/reports/cmac_configuration.tsv','utf8').trim().split(/\r?\n/)
  .map(line=>line.split('\t')).filter(([name])=>name.startsWith('CONFIG.')));
}
function parens(text,start){let depth=0,quote=false;
 for(let i=start;i<text.length;i++){
  if(text[i]==='"'&&text[i-1]!=='\\')quote=!quote;
  if(quote)continue;
  if(text[i]==='(')depth++;
  if(text[i]===')'&&--depth===0)return {body:text.slice(start+1,i),end:i};
 }throw Error('Unbalanced generated public wrapper');
}
function bindings(body){const entries={};const re=/\.(\w+)\s*\(/g;let m;
 while((m=re.exec(body))){const p=parens(body,re.lastIndex-1);entries[m[1]]=p.body.replace(/\s+/g,'');re.lastIndex=p.end+1;}
 return entries;
}
function coreInterface(build){
 const file=external+build+'/project/af_cmac_shell.gen/sources_1/ip/af_cmac/cmac_usplus_v3_1_26/af_cmac_wrapper.v';
 const text=fs.readFileSync(file,'utf8').replace(/\/\/[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
 const offset=text.indexOf('cmac_usplus_v3_1_26_top');if(offset<0)throw Error('Expected real CMAC library core');
 const p=parens(text,text.indexOf('(',offset)),next=text.indexOf('(',p.end+1),ports=parens(text,next);
 return {artifact:artifact(file),parameters:bindings(p.body),ports:bindings(ports.body)};
}
function differences(a,b){return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(k=>a[k]!==b[k]).map(k=>({name:k,physical:a[k]??null,digital:b[k]??null}));}
function digitalIdentity(){
 const full='cx-p2_11-shell-20261104-04',digital='cx-p2_11-shell-20261104-06',a=coreInterface(full),b=coreInterface(digital);
 const names=['af_afp1_header_check','af_packet_parser','af_ring_control','af_ring_store','af_receive_core','af_rx_ingress','af_receive_pipeline'];
 const rtl=names.map(name=>{const pa=artifact(external+full+'/source/rtl/'+name+'.sv'),pb=artifact(external+digital+'/source/rtl/'+name+'.sv');return {name,physical:pa,digital:pb,identical:pa.sha256===pb.sha256};});
 return {scope:'Configuration and frozen-source comparison only; NOT formal equivalence or a functional PASS',
  configuration_differences:differences(configuration(full),configuration(digital)),
  core_parameter_count:Object.keys(a.parameters).length,core_parameter_differences:differences(a.parameters,b.parameters),
  core_symbolic_port_count:Object.keys(a.ports).length,core_symbolic_port_differences:differences(a.ports,b.ports),
  artifacts:[a.artifact,b.artifact],receiver_rtl:rtl,
  limitations:['Core symbolic bindings do not prove upstream clock/reset driver equivalence.',
   'Digital simulation uses ideal lane clocks and testbench resets; physical shell retains real GT clock/reset wrappers.']};
}
function clockRecheck(){
 const dir=external+'cx-p2_11-sta-20261104-02';
 return {build:dir,scope:'SAME_ROUTE_STA_RECHECK; not a new synthesis or place/route',
  input_artifact:JSON.parse(fs.readFileSync(dir+'/input_artifact.json','utf8').replace(/^\uFEFF/,'')),
  source_snapshot:artifact(dir+'/source_snapshot.json'),points:[125,200,250].map(mhz=>{
   const where=dir+'/sta_'+mhz+'MHz',text=fs.readFileSync(where+'/timing.rpt','utf8');
   const m=text.match(/WNS\(ns\)[^\n]*\n[^\n]*\n\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(\d+)\s+(\d+)\s+(-?[\d.]+)/);
   if(!m)throw Error('Missing fresh STA values');
   return {processing_mhz:mhz,wns_ns:Number(m[1]),tns_ns:Number(m[2]),setup_failing_endpoints:Number(m[3]),whs_ns:Number(m[5]),
    setup_hold_met:Number(m[1])>=0&&Number(m[5])>=0,
    artifacts:['scope.tsv','timing.rpt','clocks.rpt','clock_interaction.rpt','processing_paths.rpt','bus_skew.rpt'].map(f=>artifact(where+'/'+f))};
  })};
}
function job(build,label){
 const dir=external+build+'/'+label;
 const statusFile=dir+'/job_status.json',elaborateFile=dir+'/elaborate.stdout.txt';
 const state=fs.existsSync(statusFile)?JSON.parse(fs.readFileSync(statusFile,'utf8')):{status:'NOT RUN'};
 const stats=fs.existsSync(elaborateFile)?fs.readFileSync(elaborateFile,'utf8').match(/Design Stats: (\d+) nets \((\d+) decl, (\d+) agg, (\d+) reg\), (\d+) processes, (\d+) instances \((\d+) unique\)/):null;
 const spec=fs.existsSync(dir+'/job_spec.json')?JSON.parse(fs.readFileSync(dir+'/job_spec.json','utf8')):{};
 const simulationLines=fs.existsSync(dir+'/simulate.stdout.txt')?fs.readFileSync(dir+'/simulate.stdout.txt','utf8').split(/\r?\n/):[];
 return {build:dir,scope:state.verification_scope??'FUNCTIONAL_TEST',status:state.status,
  failure_kind:state.failure_kind??null,error:state.error??null,instances:stats?Number(stats[6]):state.instances??null,
  last_progress:simulationLines.filter(s=>s.startsWith('AF_CMAC_DIGITAL_PROGRESS ')).at(-1)??null,
  observed_control_probe_events:simulationLines.filter(s=>/^AF_DIGITAL_(RESET_PROBE_COMPLETE|BAD_FRAME_PROBE_COMPLETE) /.test(s)),
  instance_limit:state.instance_limit??null,profile_only:state.verification_scope==='INSTANCE_PROFILE_ONLY',
  acceptance:state.acceptance??null,metrics:state.metrics??null,
  artifacts:['source_snapshot.json','profile_config.json','generated_config.json','job_spec.json','job_status.json',
   'compile.stdout.txt','elaborate.stdout.txt','simulate.stdout.txt'].map(f=>artifact(dir+'/'+f)).filter(Boolean),
  marker:spec.marker?artifact(spec.marker):null};
}
const b05='cx-p2_11-shell-20261104-05',b06='cx-p2_11-shell-20261104-06';
const profiles={
 fast_serial_peer:job(b05,'serial_peer_verification'),
 full_endpoint:job(b05,'instance_profile_endpoint_02'),gt_quad:job(b05,'instance_profile_gt_quad_03'),
 gt_channel:job(b05,'instance_profile_gt_channel_03'),gt_common:job(b05,'instance_profile_gt_common'),
 axis_tx:job(b05,'instance_profile_axis_tx'),axis_rx:job(b05,'instance_profile_axis_rx'),
 digital_endpoint:job(b06,'instance_profile_endpoint'),digital_peer_pipeline:job(b06,'digital_peer_verification'),
 digital_peer_pipeline_02:job(b06,'digital_peer_verification_02'),digital_peer_pipeline_03:job(b06,'digital_peer_verification_03'),
 digital_peer_pipeline_04:job(b06,'digital_peer_verification_04'),digital_peer_pipeline_05:job(b06,'digital_peer_verification_05')};
const delayedBuild=external+'cx-p2_06-pipeline-20261104-15';
const delayedMarker=delayedBuild+'/vectors/pipeline_pass.txt';
const delayedText=fs.existsSync(delayedMarker)?fs.readFileSync(delayedMarker,'utf8').trim():null;
const data={schema:1,collected_utc:new Date().toISOString(),collector:artifact(fileURLToPath(import.meta.url)),
 scope:'Simulator instance optimization; counts are NOT FPGA cell counts',
 builds:[b05,b06].map(name=>({path:external+name,source_snapshot:artifact(external+name+'/source_snapshot.json'),
  configuration:artifact(external+name+'/reports/cmac_configuration.tsv'),SYNTH:'NOT RUN',ROUTED:'NOT RUN'})),
 profiles,
 digital_identity:digitalIdentity(),clock_recheck:clockRecheck(),
 delayed_configuration_regression:{build:delayedBuild,SIM:delayedText?.startsWith('PASS packets=4096 read_words=98304 ')?'PASS':'NOT VERIFIED',
  SYNTH:'NOT RUN',ROUTED:'NOT RUN',marker:delayedText,
  artifacts:['source_snapshot.json','reports/delayed_config.tsv','vectors/pipeline_pass.txt',
   'project/af_pipeline.sim/sim_1/behav/xsim/simulate.log'].map(f=>artifact(delayedBuild+'/'+f)).filter(Boolean)},
 digital_coverage:{included:['Two real cmac_usplus models','Parallel encoded lane connection','AXIS RX','Ingress CDC/FIFO','Parser/ring/store','Full payload scoreboard'],
  excluded:['GT serial/CDR/QPLL behavior','GT reset/clock startup and physical integration','Board and optical link'],
  functional_pass:Object.values(profiles).some(p=>p.status==='COMPLETE'&&p.scope==='CMAC_DIGITAL_BOUNDARY_ONLY'&&
   /^PASS scope=CMAC_DIGITAL_BOUNDARY /.test(p.acceptance??'')),
  does_not_complete_full_serial_M3:true},
 prior_shell_implementation:'Real 1CMACE4/4GTYE4_CHANNEL/1GTYE4_COMMON SYNTH/ROUTED evidence stays in phase2-cx-m3.json shell-04; not rerun here',
 notes:['PROFILE COMPLETE means diagnostic ran for 1ns; observed=x is not a functional result.',
 'Separate module counts use different contexts and are not additive exact netlists.',
 'FAST_SIM_MODE=1 did not reduce full serial-peer count; debug was already off.',
 'UNIFAST installed models cover GTXE2/GTHE2, not GTYE4/CMACE4; no model substitution performed.']};
fs.writeFileSync(path.join(root,'reports/phase2-cmac-instance-optimization.json'),JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(profiles).map(([key,p])=>[key,{status:p.status,scope:p.scope,instances:p.instances}]))));
