// Read-only collection from frozen Codex builds; does not launch Vivado.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),external='D:/work/build/apertureforge-fpga';
const sha=b=>createHash('sha256').update(b).digest('hex');
function timingSummary(text){
 const lines=text.split('\n'),start=lines.findIndex(l=>l.includes('WNS(ns)')&&l.includes('WHS(ns)'));
 const row=lines.slice(start+1).find(l=>/^\s*-?\d+\.\d+\s/.test(l));if(start<0||!row)throw Error('Missing timing summary');
 const v=row.trim().split(/\s+/).map(Number);
 return {wns_ns:v[0],tns_ns:v[1],setup_failing_endpoints:v[2],whs_ns:v[4],ths_ns:v[5],hold_failing_endpoints:v[6],
  internal_no_clock:Number(text.match(/checking no_clock \((\d+)\)/)?.[1]??NaN),
  internal_unconstrained_endpoints:Number(text.match(/checking unconstrained_internal_endpoints \((\d+)\)/)?.[1]??NaN)};
}
function collect(id,scope,rejected_reason=null){
 const dir=path.join(external,id),artifacts={};
 const read=rel=>{const file=path.join(dir,rel);if(!fs.existsSync(file))return null;const b=fs.readFileSync(file);artifacts[rel]=sha(b);return b.toString('utf8');};
 const snapshot=JSON.parse(read('source_snapshot.json'));
 function stage(name){
  const util=read(`reports/utilization_${name}.rpt`),timing=read(`reports/timing_${name}.rpt`);
  read(`reports/utilization_hier_${name}.rpt`);
  if(!util||!timing)return {status:'REPORTS_NOT_COLLECTED'};
  const labels={lut:'CLB LUTs',ff:'CLB Registers',dsp:'DSPs',uram:'URAM',bram36_tiles:'Block RAM Tile'};
  const resources=Object.fromEntries(Object.entries(labels).map(([key,label])=>{
   const line=util.split('\n').find(l=>l.split('|')[1]?.trim().replaceAll('*','')===label);
   if(!line)throw Error('Missing '+label);return [key,Number(line.split('|')[2].trim().replaceAll(',',''))];
  }));
  return {status:'COLLECTED',resources,timing:timingSummary(timing)};
 }
 const sim=(read('vectors/behavioral_simulation_pass.txt')??read('vectors/ingress_pass.txt')??read('vectors/config_pass.txt')??read('vectors/pipeline_behavioral_pass.txt')??read('vectors/pipeline_pass.txt'))?.trim()??'NOT_COLLECTED';
 const preview=read('vectors/preview_pass.txt')?.trim()??'NOT_RUN';
 const perf=read('vectors/core_perf_pass.txt')?.trim()??null;
 const synthesis=stage('synth_1'),routed=stage('impl_1');
 const route=read('reports/route_status.rpt'),drc=read('reports/drc.rpt');
 const severity={Error:0,'Critical Warning':0,Warning:0};
 if(drc)for(const line of drc.split('\n')){const c=line.split('|').map(v=>v.trim());if(c[2] in severity&&/^\d+$/.test(c[4]))severity[c[2]]+=Number(c[4]);}
 const quality=route?{routing_errors:Number(route.match(/nets with routing errors[^:\n]*:\s*(\d+)/)?.[1]??NaN),drc:severity}:null;
 const netlistAuditText=read('netlist_verification_02/acceptance_audit.json');
 const netlistAudit=netlistAuditText?JSON.parse(netlistAuditText):null;
 const post=read('vectors/post_implementation_simulation_pass.txt')?.trim()??netlistAudit?.status??'NOT_RUN';
 const netlistJobText=read('netlist_verification_02/job_status.json');
 const netlistJob=netlistJobText?JSON.parse(netlistJobText):null;
 const secondConfigText=read('netlist_verification_02/generated_config.json'),secondConfig=secondConfigText?JSON.parse(secondConfigText):null;
 const secondTB=read('netlist_verification_02/source/sim/tb_af_receive_pipeline.sv');
 if(secondConfig?.compiled_testbench_sha256&&(!secondTB||sha(secondTB)!==secondConfig.compiled_testbench_sha256))throw Error('Second supplemental testbench hash mismatch: '+id);
 const secondMarker=read('netlist_verification_02/pipeline_post_impl_pass.txt');
 if(netlistJob?.status==='COMPLETE'&&(!secondMarker||secondMarker.trim()!==netlistJob.acceptance))throw Error('Second netlist acceptance mismatch: '+id);
 for(const file of ['netlist_verification_02/source_snapshot.json','netlist_verification_02/generated_config.json',
  'netlist_verification_02/job_spec.json','netlist_verification_02/simulate.stdout.txt'])read(file);
 const currentNetlistJobText=read('netlist_verification/job_status.json'),currentNetlistJob=currentNetlistJobText?JSON.parse(currentNetlistJobText):null;
 const currentNetlistConfigText=read('netlist_verification/generated_config.json'),currentNetlistConfig=currentNetlistConfigText?JSON.parse(currentNetlistConfigText):null;
 const currentNetlistTB=read('netlist_verification/source/sim/tb_af_receive_pipeline.sv');
 if(currentNetlistConfig?.compiled_testbench_sha256&&(!currentNetlistTB||sha(currentNetlistTB)!==currentNetlistConfig.compiled_testbench_sha256))throw Error('Compiled supplemental testbench hash mismatch: '+id);
 const currentNetlistMarker=read('netlist_verification/pipeline_post_impl_pass.txt');
 if(currentNetlistJob?.status==='COMPLETE'&&(!currentNetlistMarker||currentNetlistMarker.trim()!==currentNetlistJob.acceptance))throw Error('Netlist job acceptance mismatch: '+id);
 const netlistVerifications=[];
 for(const label of ['netlist_verification','netlist_verification_02','netlist_verification_03','netlist_verification_04']){
  if(!fs.existsSync(path.join(dir,label,'source_snapshot.json')))continue;
  const configText=read(`${label}/generated_config.json`),config=configText?JSON.parse(configText):null;
  const tb=read(`${label}/source/sim/tb_af_receive_pipeline.sv`);
  if(config?.compiled_testbench_sha256&&(!tb||sha(tb)!==config.compiled_testbench_sha256))throw Error('Verification TB hash mismatch '+id+'/'+label);
  const stateText=read(`${label}/job_status.json`),state=stateText?JSON.parse(stateText):null;
  const elab=read(`project/af_pipeline.sim/${label}/impl/func/xsim/elaborate.bat`);
  const functional=!!elab&&elab.includes('unisims_ver')&&!elab.includes('simprims_ver')&&!elab.includes('--maxdelay');
  const marker=read(`${label}/pipeline_post_impl_pass.txt`);
  if(state?.status==='COMPLETE'&&marker?.trim()!==state.acceptance)throw Error('Netlist acceptance mismatch '+id+'/'+label);
  if(state?.status==='COMPLETE'){
   const mtime=fs.statSync(path.join(dir,label,'pipeline_post_impl_pass.txt')).mtimeMs;
   if(mtime<Date.parse(state.started_utc)||mtime>Date.parse(state.observed_utc)+2000)throw Error('Netlist acceptance not fresh '+id+'/'+label);
  }
  for(const f of ['source_snapshot.json','job_spec.json','compile.stdout.txt','elaborate.stdout.txt','simulate.stdout.txt','simulate.stderr.txt','user_termination_request.json','user_termination_result.json'])read(`${label}/${f}`);
  for(const f of ['tb_af_receive_pipeline_func_impl.v','tb_af_receive_pipeline_vlog.prj','compile.bat','simulate.bat']){
   const rel=`project/af_pipeline.sim/${label}/impl/func/xsim/${f}`;if(fs.existsSync(path.join(dir,rel)))artifacts[rel]=sha(fs.readFileSync(path.join(dir,rel)));
  }
  netlistVerifications.push({label,state,compiled_config:config,generated_primitive_library:!elab?'NOT_GENERATED':functional?'FUNCTIONAL_UNISIMS':'UNEXPECTED_TIMING_SIMPRIMS',
   functional_acceptance:state?.status==='COMPLETE'&&functional?state.acceptance:null});
 }
 const acceptedNetlist=netlistVerifications.find(v=>v.functional_acceptance);
 const runningNetlists=netlistVerifications.some(v=>v.state?.status==='RUNNING');
 for(const f of ['netlist_verification/source_snapshot.json','netlist_verification/job_spec.json','netlist_verification/simulate.stdout.txt',
  'netlist_result_audit/source_snapshot.json','reports/physical_checks_impl_1.tsv','reports/cdc_internal_reset_cones.tsv','supplemental_audit/source_snapshot.json'])read(f);
 const performance=perf?Object.fromEntries([...perf.matchAll(/(\w+)=(\d+)/g)].map(m=>[m[1],Number(m[2])])):null;
 if(performance){performance.scope='Finite RTL test with backpressured source, not non-stallable CMAC throughput';
  performance.assumed_clock_hz=250e6;performance.receive_pps=performance.packets*250e6/performance.receive_cycles;
  performance.receive_science_bps=performance.receive_pps*640*8;
  performance.assumed_clock_routed_pass=routed.status==='COLLECTED'&&routed.timing.wns_ns>=0&&routed.timing.whs_ns>=0;
  performance.average_10mpps_met=performance.receive_pps>=1e7;
 }
 const rechecks={};for(const mhz of [125,200]){const text=read(`reports/timing_recheck_${mhz}.rpt`);if(text)rechecks[mhz]=timingSummary(text);}
 const cdc={};
 for(const stage of ['synth_1','impl_1']){
  const text=read(`reports/cdc_${stage}.rpt`);if(!text)continue;
  const rows=text.split('\n').filter(l=>/^\s*(Critical|Warning|Info)\s/.test(l)).map(line=>{
   const v=line.match(/(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/);if(!v)throw Error('Unparsed CDC row');
   return {endpoints:Number(v[1]),safe:Number(v[2]),unsafe:Number(v[3]),unknown:Number(v[4]),no_async_reg:Number(v[5])};
  });
  cdc[stage]={rows,unsafe:rows.reduce((s,r)=>s+r.unsafe,0),unknown:rows.reduce((s,r)=>s+r.unknown,0),scope:'Clocked endpoints only; external input delays absent in OOC'};
 }
 const profileText=read('vectors/pipeline_config.json'),profile=profileText?JSON.parse(profileText):null;
 const pipelineMarker=read('vectors/pipeline_behavioral_pass.txt')??read('vectors/pipeline_pass.txt');
 const pipeline= pipelineMarker?Object.fromEntries([...pipelineMarker.matchAll(/(\w+)=(\d+)/g)].map(m=>[m[1],Number(m[2])])):null;
 if(pipeline){pipeline.scope='RTL non-stallable generated CMAC-boundary stream, not actual CMAC IP simulation';
  pipeline.nominal_profile=profile;
  pipeline.cycle_scaled_end_to_end_science_bps=pipeline.read_words*512*profile.processing_mhz*1e6/pipeline.end_to_end_cycles;
 }
 const busSkew=read('reports/bus_skew.rpt');
 const skewRows=busSkew?[...busSkew.matchAll(/^\s*(?:Slow|Fast)\s+([\d.]+)\s+([\d.]+)\s+(-?[\d.]+)\s*$/gm)].map(m=>({requirement_ns:Number(m[1]),actual_ns:Number(m[2]),slack_ns:Number(m[3])})):[];
 const physical={};for(const stage of ['synth_1','impl_1']){
  const text=read(`reports/physical_cells_${stage}.tsv`);if(!text)continue;
  const cells=text.trim().split(/\r?\n/).map(l=>{const [name,ref,loc]=l.split('\t');return {name,ref,loc};});
  physical[stage]={cells,counts:Object.fromEntries(['CMACE4','GTYE4_CHANNEL','GTYE4_COMMON','IBUFDS_GTE4'].map(ref=>[ref,cells.filter(c=>c.ref===ref).length]))};
 }
 const physicalCheckText=read('reports/physical_checks_impl_1.tsv');
 const blackboxMatch=physicalCheckText?.match(/^blackboxes\t(\d+)/m);
 for(const file of ['reports/top_paths.rpt','reports/clocks.rpt','reports/clocks_synth_1.rpt','reports/clocks_impl_1.rpt',
  'reports/cdc.rpt','reports/cdc_details_synth_1.rpt','reports/cdc_details_impl_1.rpt','reports/clock_interaction_impl_1.rpt',
  'reports/run_state.json','reports/cmac_configuration.tsv','reports/shell_parameters.tsv','vectors/core_service.csv','vectors/ingress_config.json'])read(file);
 if(id.startsWith('cx-p2_11-shell-'))for(const f of ['project/af_cmac_shell.gen/sources_1/ip/af_cmac/cmac_usplus_v3_1_26/af_cmac_wrapper.v',
  'project/af_cmac_shell.gen/sources_1/ip/af_cmac/synth/af_cmac.xdc'])read(f); // hashes only in published evidence, no vendor content
 const serialVerifications=[];
 for(const label of ['serial_peer_verification','serial_peer_verification_02']){
  const jobText=read(`${label}/job_status.json`);if(!jobText)continue;
  const job=JSON.parse(jobText),log=read(`${label}/simulate.stdout.txt`),limit=log?.match(/Number of instances in this design, (\d+), exceed maximum allowed (\d+)/);
  const config=JSON.parse(read(`${label}/generated_config.json`)),tb=read(`${label}/source/sim/tb_af_cmac_receive_shell.sv`);
  if(sha(tb)!==config.compiled_testbench_sha256)throw Error('Actual CMAC verifier source hash mismatch '+id+'/'+label);
  const marker=read(`${label}/vectors/pipeline_pass.txt`);
  if(job.status==='COMPLETE'&&marker?.trim()!==job.acceptance)throw Error('Actual CMAC acceptance mismatch '+id+'/'+label);
  for(const f of ['source_snapshot.json','job_spec.json','compile.stdout.txt','elaborate.stdout.txt','simulate.stderr.txt'])read(`${label}/${f}`);
  serialVerifications.push({label,job,status:limit?'NOT_RUN_SIMULATOR_TIER_LIMIT':job.status,
   instances:limit?Number(limit[1]):null,instance_limit:limit?Number(limit[2]):null,
   scope:'Actual af_cmac_receive_shell and second real CMAC/GT transmitter; no fake or forced MAC outputs'});
 }
 const failureLog=read('project/af_pipeline.sim/sim_1/behav/xsim/simulate.log');
 const fatal=failureLog?.split(/\r?\n/).find(l=>l.startsWith('Fatal:'))??null;
 const sourceBlocks=failureLog?[...failureLog.matchAll(/AF_SOURCE_BLOCK block=(\d+) scheduled_ns=([\d.-]+) current_ns=([\d.-]+)/g)].map(m=>({block:Number(m[1]),scheduled_ns:Number(m[2]),observed_before_wait_ns:Number(m[3])})):[];
 if(sim.startsWith('PASS ')&&sourceBlocks.length){
  if(sourceBlocks.length!==profile.blocks)throw Error('Incomplete source schedule transcript: '+id);
  for(let i=1;i<sourceBlocks.length;i++)if(sourceBlocks[i].block!==i||Math.abs(sourceBlocks[i].scheduled_ns-sourceBlocks[i-1].scheduled_ns-profile.source_release_offset_ps/1000)>0.002)throw Error('Source radio cadence mismatch: '+id);
 }
 for(const file of ['vectors/pipeline_load.mem','vectors/pipeline_gold.mem'])if(fs.existsSync(path.join(dir,file)))artifacts[file]=sha(fs.readFileSync(path.join(dir,file)));
 for(const file of ['af_pipeline_impl_1.dcp','af_cmac_shell_impl_1.dcp'])if(fs.existsSync(path.join(dir,file)))artifacts[file]=sha(fs.readFileSync(path.join(dir,file)));
 const state=fs.existsSync(path.join(dir,'reports/run_state.json'))?JSON.parse(fs.readFileSync(path.join(dir,'reports/run_state.json'),'utf8')):null;
 return {id,scope,rejected_reason,external_build_dir:dir.replaceAll('\\','/'),source_snapshot:snapshot,
  current_tree_matches_snapshot:Object.entries(snapshot.source_sha256).every(([f,h])=>fs.existsSync(path.join(root,f))&&sha(fs.readFileSync(path.join(root,f),'utf8').replaceAll('\r\n','\n'))===h),
  current_rtl_matches_snapshot:Object.entries(snapshot.source_sha256).filter(([f])=>f.startsWith('rtl/')).every(([f,h])=>fs.existsSync(path.join(root,f))&&sha(fs.readFileSync(path.join(root,f),'utf8').replaceAll('\r\n','\n'))===h),
  simulation:sim,preview_simulation:preview,performance,synthesis,routed,routed_quality:quality,post_implementation_simulation:acceptedNetlist?.functional_acceptance??(runningNetlists?'RUNNING':post),
  post_implementation_audit:netlistAudit,original_netlist_runner:netlistJob,functional_simulation_failure:fatal,source_schedule:sourceBlocks.length?sourceBlocks:null,
  current_netlist_job:currentNetlistJob,current_netlist_verification:currentNetlistConfig,second_netlist_verification:secondConfig,netlist_verifications:netlistVerifications,
  bus_skew:skewRows.length?{constraints:skewRows,minimum_slack_ns:Math.min(...skewRows.map(r=>r.slack_ns))}:null,
  real_hard_cells:physical,serial_peer_simulation:serialVerifications.at(-1)??null,serial_peer_verifications:serialVerifications,
  supplemental_physical_blackboxes:blackboxMatch?Number(blackboxMatch[1]):null,
  same_route_clock_rechecks:rechecks,cdc,pipeline_load:pipeline,last_observed_run_state:state,artifact_sha256:artifacts};
}
const configs=[
 ['cx-p2_06-20261103-01','Remove redundant preview/address mux, narrow range-checked source indices'],
 ['cx-p2_06-20261103-02','First early-header attempt','Implicit fire net declaration caused simulation timeout; not accepted'],
 ['cx-p2_06-20261104-01','Early header check with explicit fire wire; preview flush bug still present'],
 ['cx-p2_04-preview-20261104-01','Focused immediate-duplicate preview test','Reproduced stale stage-A revalidation: duplicate admitted, no PASS'],
 ['cx-p2_06-20261104-02','Early header + address simplification + invalidate both preview stages']
];
const matrixId='cx-p2_03-20261104-01',matrixDir=path.join(external,matrixId);
const ingressIds=[1,2,3,4,5,6].map(n=>`cx-p2_02-20261104-0${n}`);
const pipelineIds=Array.from({length:13},(_,i)=>`cx-p2_06-pipeline-20261104-${String(i+1).padStart(2,'0')}`);
const shellIds=[1,2,3,4].map(n=>`cx-p2_11-shell-20261104-0${n}`);
const exampleId='cx-p2_11-example-20261104-02',exampleDir=path.join(external,exampleId);
const exampleLog=fs.readFileSync(path.join(exampleDir,'example/af_cmac_ex/af_cmac_ex.sim/sim_1/behav/xsim/simulate.log'));
const instanceLimit=exampleLog.toString('utf8').match(/Number of instances in this design, (\d+), exceed maximum allowed (\d+)/);
const manifest={schema:1,phase_status:'IN_PROGRESS',baseline_commit:'ae69ad00cfe553b58391b4778283c4ba6776fc0f',part:'xcku5p-ffvb676-1-i',tool:'Vivado 2026.1 via Codex vivado MCP',
 collector_sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url),'utf8').replaceAll('\r\n','\n')),
 milestone_scope:'M2 receiver and M3 real CMAC shell only; stop before M4 science kernels',
 rfsoc_development:'OUT_OF_SCOPE',hardware:'NOT_RUN',runs:configs.map(c=>collect(...c)),
 ingress_runs:ingressIds.map(id=>collect(id,'Packet-atomic independent-clock XPM ingress; unit test geometry is recorded in marker/config')),
 pipeline_runs:pipelineIds.map((id,i)=>collect(id,'Real ingress + CDC + parser/ring/store; generated non-stallable CMAC-boundary stimulus',
  i===0?'Rejected integration: raw RX reset gated processing traffic; unsafe/unknown CDC endpoints':
  i===1?'Superseded: remaining combinational reset decode before synchronizer (CDC-10)':
  i===2?'Paced 64-descriptor configuration; SIM/SYNTH and CDC safe, superseded by burst-capable configuration':
  i===3||i===4?'Expected no-loss test failure: 64 descriptors cannot absorb a 256-source 100Gbps burst; diagnostic run05 saw no_space=92 queued=164 started=256':
  i===5?'NF10/T8 old RX preprocessing: ROUTED and audited post-route functional simulation collected':
  i===6?'NF10/T8 with RX preprocessing stage; RTL SIM; physical integration checked by real CMAC shell':
  i===7?'NF12/T8 adjacent higher-load candidate; RTL SIM passed; physical results collected when present':
  i===8?'NF13/T8 adjacent no-loss failure: first burst lost 3 packets to data-space reservation; no PASS':
  i===9||i===10?'Invalid extended stimulus: int32 picosecond scheduling overflow at block21, not a hardware capacity failure':
  i===11?'Diagnostic reproduced source schedule going backwards at packet5376/block21; no PASS':
  '128-block periodic-pause soak: corrected real-time scheduling, 32768 packets and 786432 words; actual RTL matches routed NF12 source')),
 config_switch_runs:[1,2].map(n=>collect(`cx-p2_06-config-20261104-0${n}`,'Config flush of held response, partial/queued old frames, old committed RAM and stale consumer completion',
  n===1?'Testbench phase guard raced online assertion; no PASS; corrected in fresh run02':null)),
 cmac_shell_runs:shellIds.map((id,i)=>collect(id,'Real single CMAC + four GT lanes + actual ingress/CDC/parser/ring/raw URAM; OOC device candidate, not board pinout',
  i===0?'Before RX keep/count preprocessing; synthesis setup failed':i===1?'Timing closed after RX preprocessing; two DRC critical warnings from unfixed reference-clock pin/site':null)),
 cmac_vendor_example:{id:exampleId,source_snapshot:JSON.parse(fs.readFileSync(path.join(exampleDir,'source_snapshot.json'),'utf8')),
  status:instanceLimit?'NOT_RUN_SIMULATOR_TIER_LIMIT':'NOT_VERIFIED',elaboration_completed:true,simulation_engine_started:false,
  simulator_tier:'BASIC',instances:instanceLimit?Number(instanceLimit[1]):null,instance_limit:instanceLimit?Number(instanceLimit[2]):null,
  simulation_log_sha256:sha(exampleLog),configuration_sha256:sha(fs.readFileSync(path.join(exampleDir,'reports/cmac_configuration.tsv'))),
  scope:'Real generated CMAC/GT vendor serial-loopback example; no forced CMAC outputs or substitute model'},
 parser_matrix:{id:matrixId,source_snapshot:JSON.parse(fs.readFileSync(path.join(matrixDir,'source_snapshot.json'),'utf8')),
  simulation:Object.fromEntries([32,64,512].map(w=>[w,fs.readFileSync(path.join(matrixDir,`w${w}/vectors/behavioral_simulation_pass.txt`),'utf8').trim()]))},
 limitations:['Real CMAC shell implemented; timing/DRC/CDC are separate. Preserve two raw vendor-internal CDC-10 endpoints until justified; no blanket waiver',
 'Actual CMAC/GT vendor example cannot start with current XSim BASIC 50000-instance limit; higher simulator entitlement not confirmed','SDF and board tests not run',
 'Clock and throughput numbers from different frozen builds must not be combined','Finite backpressured-source load is not proof of continuous line-rate reception']};
const receiver=manifest.pipeline_runs.find(r=>r.id.endsWith('-08')),soak=manifest.pipeline_runs.find(r=>r.id.endsWith('-13')),shell=manifest.cmac_shell_runs.at(-1);
const sourceIdentity=Object.entries(receiver.source_snapshot.source_sha256).filter(([f])=>f.startsWith('rtl/')).every(([f,h])=>
 soak.source_snapshot.source_sha256[f]===h&&shell.source_snapshot.source_sha256[f]===h);
const profileKeys=['nf','T','slots','wpp','processing_mhz','ingress_data_depth','ingress_desc_depth','mode'];
const profileIdentity=profileKeys.every(k=>receiver.pipeline_load.nominal_profile[k]===soak.pipeline_load.nominal_profile[k]);
const geometry=Object.fromEntries(fs.readFileSync(path.join(shell.external_build_dir,'reports/shell_parameters.tsv'),'utf8').trim().split(/\r?\n/).map(l=>{const[k,v]=l.split('\t');return[k,Number(v)];}));
const shellGeometryIdentity=geometry.slots===soak.pipeline_load.nominal_profile.slots&&geometry.words_per_packet===soak.pipeline_load.nominal_profile.wpp&&
 geometry.data_depth===soak.pipeline_load.nominal_profile.ingress_data_depth&&geometry.descriptor_depth===soak.pipeline_load.nominal_profile.ingress_desc_depth;
const routedPass=r=>r.routed.status==='COLLECTED'&&r.routed.timing.wns_ns>=0&&r.routed.timing.whs_ns>=0&&
 r.routed.timing.internal_no_clock===0&&r.routed.timing.internal_unconstrained_endpoints===0&&r.routed_quality?.routing_errors===0&&
 r.routed_quality.drc.Error===0&&r.routed_quality.drc['Critical Warning']===0&&r.bus_skew?.minimum_slack_ns>=0;
manifest.milestone_audit={scope:'Explicit evidence gates for tested NF12/T8/S5/125MHz receiver, not a board or science-kernel capacity claim',
 receiver_rtl_identity_across_routed_soak_and_real_cmac:sourceIdentity,
 receiver_profile_identity_between_routed_and_soak:profileIdentity,real_cmac_storage_geometry_matches_test:shellGeometryIdentity,
 sustained_rtl_test:{id:soak.id,passed:soak.simulation.startsWith('PASS ')&&soak.pipeline_load?.packets===32768&&soak.pipeline_load?.read_words===786432&&soak.pipeline_load?.pause_windows===16},
 receiver_implementation:{id:receiver.id,passed:routedPass(receiver)&&receiver.cdc.impl_1?.unsafe===0&&receiver.cdc.impl_1?.unknown===0},
 receiver_post_route_functional:{id:receiver.id,passed:receiver.post_implementation_simulation.startsWith('PASS '),status:receiver.post_implementation_simulation},
 real_cmac_implementation:{id:shell.id,passed:routedPass(shell)&&shell.supplemental_physical_blackboxes===0&&shell.real_hard_cells.impl_1?.counts.CMACE4===1&&shell.real_hard_cells.impl_1?.counts.GTYE4_CHANNEL===4},
 real_cmac_serial_simulation:{passed:shell.serial_peer_simulation?.status==='COMPLETE',status:shell.serial_peer_simulation?.status??'NOT_RUN'},
 real_cmac_cdc:{closed:shell.cdc.impl_1?.unsafe===0&&shell.cdc.impl_1?.unknown===0,unsafe:shell.cdc.impl_1?.unsafe,unknown:shell.cdc.impl_1?.unknown,disposition:'Raw vendor reset-status CDC-10 retained; no waiver'},
 original_250mhz_10mpps_target:'NOT_MET',board_validation:'NOT_RUN',science_kernels:'NOT_STARTED',completion:'NOT_ACHIEVED'};
const m2EvidenceComplete=sourceIdentity&&profileIdentity&&shellGeometryIdentity&&manifest.milestone_audit.sustained_rtl_test.passed&&
 manifest.milestone_audit.receiver_implementation.passed&&manifest.milestone_audit.receiver_post_route_functional.passed&&
 manifest.ingress_runs.at(-1).simulation.startsWith('PASS ')&&manifest.config_switch_runs.at(-1).simulation.startsWith('PASS ')&&
 manifest.runs.at(-1).preview_simulation.startsWith('PASS commands=15')&&Object.values(manifest.parser_matrix.simulation).every(s=>s.startsWith('PASS '));
manifest.milestone_audit.m2_tested_profile=m2EvidenceComplete?'EVIDENCE_COMPLETE_FOR_TESTED_PROFILE':'INCOMPLETE';
manifest.milestone_audit.m3=shell.serial_peer_simulation?.status==='NOT_RUN_SIMULATOR_TIER_LIMIT'?'BLOCKED_SIMULATOR_TIER':'INCOMPLETE';
if(m2EvidenceComplete&&manifest.milestone_audit.m3==='BLOCKED_SIMULATOR_TIER')manifest.phase_status='BLOCKED_SIMULATOR_TIER';
const optimizationFile=path.join(root,'reports/phase2-cmac-instance-optimization.json');
if(fs.existsSync(optimizationFile)){
 const optimizationBytes=fs.readFileSync(optimizationFile),optimization=JSON.parse(optimizationBytes.toString('utf8'));
 const digitalJobs=Object.values(optimization.profiles??{}).filter(p=>p.scope==='CMAC_DIGITAL_BOUNDARY_ONLY');
 manifest.instance_optimization={artifact:'reports/phase2-cmac-instance-optimization.json',sha256:sha(optimizationBytes),
  collected_utc:optimization.collected_utc,digital_jobs:digitalJobs.map(p=>({build:p.build,status:p.status,instances:p.instances,acceptance:p.acceptance})),
  digital_functional_pass:optimization.digital_coverage?.functional_pass??false,
  coverage:'Real CMAC digital boundary only; does not close original full-serial or GT/reset dynamic gates',
  same_route_sta_points:optimization.clock_recheck?.points.map(p=>({mhz:p.processing_mhz,wns_ns:p.wns_ns,whs_ns:p.whs_ns})),
  m3_completion:'NOT_ACHIEVED'};
 if(digitalJobs.some(p=>p.status==='RUNNING'))manifest.phase_status='IN_PROGRESS_DIGITAL_SIM_WITH_FULL_SERIAL_LIMIT';
}
const load=soak.pipeline_load.nominal_profile;
manifest.cache_accounting={scope:'Exact logical dimensions and routed allocation for NF12 profile; bandwidth below is a width-times-clock bound, not measured throughput',
 input_fifo:{entries:load.ingress_data_depth,bits_per_entry:577,raw_bus_data_bytes:load.ingress_data_depth*512/8,
  keep_last_metadata_bytes:load.ingress_data_depth*65/8,total_logical_bytes:load.ingress_data_depth*577/8,
  actual_bram36_equivalent:shell.routed.resources.bram36_tiles,physical_bram_bits:shell.routed.resources.bram36_tiles*36864,
  descriptor_entries:load.ingress_desc_depth,descriptor_memory:'Distributed RAM; independent of the data FIFO'},
 science_ring:{slots:load.slots,sources:256,words_per_packet:load.wpp,word_bits:512,
  logical_science_bytes:load.slots*256*load.wpp*64,actual_uram_blocks:shell.routed.resources.uram,
  physical_uram_bits:shell.routed.resources.uram*294912,payload_efficiency:load.slots*256*load.wpp*512/(shell.routed.resources.uram*294912)},
 raw_store_port_upper_bound:{clock_hz:load.processing_mhz*1e6,bits_per_word:512,read_bps:load.processing_mhz*1e6*512,write_bps:load.processing_mhz*1e6*512,
  limits:'One read and one write port; same-address collision serialized; parser/control and consumer stalls reduce useful rates'},
 input_contract:{science_bps:load.science_bps,nominal_pps:load.expected_pps,wire_bps:load.expected_pps*(load.wpp*64+106+24)*8},
 source_reports:[shell.id+'/reports/utilization_hier_impl_1.rpt',shell.id+'/reports/utilization_impl_1.rpt'],external_ddr:'NOT_USED_NOT_VERIFIED'};
const migrationFile=path.join(root,'reports/phase2-v2025-migration.json');
if(fs.existsSync(migrationFile)){
 const bytes=fs.readFileSync(migrationFile),migration=JSON.parse(bytes.toString('utf8'));
 manifest.v2025_migration={artifact:'reports/phase2-v2025-migration.json',sha256:sha(bytes),
  simulation:migration.simulation.status,scope:migration.simulation.scope,
  functional_pass:migration.simulation.functional_pass,progress:migration.simulation.last_progress,
  standard_hardware:migration.implementation,m3_completion:'NOT ACHIEVED'};
 manifest.milestone_audit.real_cmac_serial_simulation_2026=manifest.milestone_audit.real_cmac_serial_simulation;
 manifest.milestone_audit.real_cmac_serial_simulation={passed:migration.simulation.functional_pass,status:migration.simulation.status,
  tool:'2025.1',build:migration.build,scope:migration.simulation.scope};
 const q=migration.implementation.routed_quality;
 const implemented=q?.timing?.wns_ns>=0&&q?.timing?.whs_ns>=0&&q?.timing?.wpws_ns>=0&&q?.cdc?.unsafe===0&&q?.cdc?.unknown===0&&
  q?.drc?.Error===0&&q?.drc?.['Critical Warning']===0&&q?.route_errors===0&&q?.fully_routed>0&&q?.fully_routed===q?.routable&&
  q?.no_clock===0&&q?.unconstrained_internal===0&&q?.physical?.blackboxes===0&&q?.physical?.cmac===1&&q?.physical?.gt_channel===4&&q?.physical?.gt_common===1&&q?.bus_skew_min_slack_ns>=0;
 manifest.milestone_audit.real_cmac_implementation_2026=manifest.milestone_audit.real_cmac_implementation;
 manifest.milestone_audit.real_cmac_cdc_2026=manifest.milestone_audit.real_cmac_cdc;
 manifest.milestone_audit.real_cmac_implementation={build:migration.implementation.build,tool:'2025.1',passed:implemented,
  scope:'Standard FAST_SIM_MODE=0 OOC hardware, not board validation'};
 manifest.milestone_audit.real_cmac_cdc={closed:q?.cdc?.unsafe===0&&q?.cdc?.unknown===0,...q?.cdc,
  disposition:'2025.1 raw report; old 2026 CDC-10 results retained separately, no waiver'};
 if(migration.simulation.status==='RUNNING'){
  manifest.phase_status='IN_PROGRESS_V2025_MIGRATION';manifest.milestone_audit.m3='IN_PROGRESS_V2025_MIGRATION';
 }
 const integrity=migration.integrity;
 const boundary=manifest.pipeline_runs.find(r=>r.id.endsWith('-09'));
 const digitalControls=manifest.instance_optimization?.digital_jobs.some(j=>j.status==='COMPLETE'&&/reset_probe=1 bad_probe=1/.test(j.acceptance??''));
 const identity=integrity?.hardware_rtl_matches_current_worktree===true&&integrity.implementation_sources.every(s=>s.verified)&&
  integrity.standard_hardware_sources.every(s=>s.verified)&&migration.implementation.configuration_differences_from_2026.length===0;
 const m3Complete=m2EvidenceComplete&&implemented&&migration.simulation.functional_pass&&identity&&digitalControls&&
  boundary?.current_rtl_matches_snapshot&&/no_space=3/.test(boundary.functional_simulation_failure??'');
 manifest.milestone_audit.acceptance_gates={m2:m2EvidenceComplete,standard_hardware_implemented:implemented,
  full_serial_functional:migration.simulation.functional_pass,source_and_standard_configuration_identity:identity,
  digital_reset_and_bad_frame_regression:!!digitalControls,adjacent_nf13_failure_recorded:!!boundary?.functional_simulation_failure};
 if(m3Complete){
  manifest.phase_status='M2_M3_COMPLETE_STOP_BEFORE_M4';manifest.milestone_audit.m3='EVIDENCE_COMPLETE_FOR_TESTED_PROFILE';
  manifest.milestone_audit.completion='ACHIEVED_M2_M3_SCOPE';manifest.v2025_migration.m3_completion='ACHIEVED_FOR_TESTED_PROFILE';
  manifest.tool='Vivado 2026.1 receiver evidence and Vivado 2025.1 real-CMAC migration; each build version remains separate';
  manifest.limitations=['Acceptance is restricted to NF12/T8/S5/125MHz; NF13 same-buffer burst drops 3 packets, not a chip-wide limit',
   'Original 250MHz/10Mpps target not met; standard implementation has only +0.030ns setup margin',
   'Full serial simulation uses vendor FAST_SIM_MODE=1; standard FAST_SIM_MODE=0 hardware implemented separately, not gate-level equivalence',
   'Reset/error-frame controls tested at the real-CMAC digital boundary; full serial load test covers startup and link stability',
   '2026 raw internal CDC-10 and simulator-tier failures retained as historical results; 2025 raw CDC unsafe/unknown zero',
   'No SDF, board mapping, optics, DDR, JTAG, PCIe, driver or RFSoC development; scientific consumer is a test model, M4 not started',
   'No claim of continuous 100Gb/s useful reception, maximum chip frequency, final board count or science-kernel capacity'];
 }
}
fs.writeFileSync(path.join(root,'reports/phase2-cx-m3.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({phase_status:manifest.phase_status,pipeline:manifest.pipeline_runs.slice(5).map(r=>({id:r.id,sim:r.simulation,post:r.post_implementation_simulation,
 routed_wns:r.routed.timing?.wns_ns})),real_cmac:manifest.cmac_shell_runs.slice(2).map(r=>({id:r.id,routed_wns:r.routed.timing?.wns_ns,
 drc:r.routed_quality?.drc,unsafe_cdc:r.cdc.impl_1?.unsafe,serial_sim:r.serial_peer_simulation?.status}))},null,2));
