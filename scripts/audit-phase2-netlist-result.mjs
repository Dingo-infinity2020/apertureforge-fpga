// Explicit adjudication of a completed simulation whose launcher expected the
// wrong marker path. Preserve the original FAILED job status; never rewrite it.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const [jobArg,markerArg]=process.argv.slice(2),job=path.resolve(jobArg??''),marker=path.resolve(markerArg??'');
const allowed=path.resolve('D:/work/build/apertureforge-fpga'),rel=path.relative(allowed,job),buildName=rel.split(path.sep)[0];
if(!jobArg||!markerArg||rel.startsWith('..')||path.isAbsolute(rel)||!buildName.startsWith('cx-'))throw Error('Owned verification job required');
const markerRel=path.relative(allowed,marker);if(markerRel.startsWith('..')||markerRel.split(path.sep)[0]!==buildName)throw Error('Marker outside owned build');
const spec=JSON.parse(fs.readFileSync(path.join(job,'job_spec.json'),'utf8')),state=JSON.parse(fs.readFileSync(path.join(job,'job_status.json'),'utf8'));
if(state.status!=='FAILED'||!state.error?.includes('ENOENT')||!state.error.includes(path.basename(spec.marker))||fs.existsSync(spec.marker))throw Error('Not a missing-marker-path-only failure');
const raw=fs.readFileSync(marker,'utf8').trim(),metrics=Object.fromEntries([...raw.matchAll(/(\w+)=(\d+)/g)].map(m=>[m[1],Number(m[2])]));
if(!raw.startsWith('PASS '))throw Error('Actual marker is not PASS');
for(const [k,v]of Object.entries(spec.expected))if(metrics[k]!==v)throw Error('Actual acceptance mismatch '+k);
const time=fs.statSync(marker).mtimeMs;if(time<Date.parse(state.started_utc)||time>Date.parse(state.observed_utc)+2000)throw Error('Actual marker not fresh for job');
const stdout=fs.readFileSync(path.join(job,'simulate.stdout.txt'),'utf8'),stderr=fs.readFileSync(path.join(job,'simulate.stderr.txt'),'utf8');
if(!stdout.includes(`AF_PIPELINE_PASS packets=${metrics.packets} read_words=${metrics.read_words}`)||/^(Fatal:|ERROR[: ])/m.test(stdout+'\n'+stderr))throw Error('Simulator transcript contradicts PASS');
const projectFile=fs.readFileSync(path.join(spec.script_dir,'tb_af_receive_pipeline_vlog.prj'),'utf8');
const include=projectFile.match(/-i "([^"\n]+)"/);if(!include||path.resolve(spec.script_dir,include[1]).toLowerCase()!==path.dirname(marker).toLowerCase())throw Error('Actual compile include path not proven');
const original=fs.readFileSync(path.join(path.dirname(marker),'af_pipeline_config.svh'),'utf8').replaceAll('\r\n','\n');
const verification=fs.readFileSync(path.join(job,'vectors/af_pipeline_config.svh'),'utf8').replaceAll('\r\n','\n');
const withoutMarker=s=>s.replace(/^`define AF_PIPE_PASS[^\n]*/m,'`define AF_PIPE_PASS <audited-path>');
if(withoutMarker(original)!==withoutMarker(verification))throw Error('Configuration differs beyond marker path');
const hash=b=>createHash('sha256').update(b).digest('hex');
const snapshot=JSON.parse(fs.readFileSync(path.join(job,'source_snapshot.json'),'utf8'));
const testFile=path.join(job,'source/sim/tb_af_receive_pipeline.sv'),workerFile=path.join(job,'source/scripts/run-vivado-sim-job.mjs');
for(const [name,file]of [['sim/tb_af_receive_pipeline.sv',testFile],['scripts/run-vivado-sim-job.mjs',workerFile]])
 if(hash(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'))!==snapshot.source_sha256[name])throw Error('Frozen verifier source mismatch');
if(!projectFile.includes(path.relative(spec.script_dir,testFile).replaceAll('\\','/')))throw Error('Actual testbench binding not proven');
const build=path.join(allowed,buildName),result={schema:1,status:'FUNCTIONAL_SIM_PASS_WITH_RUNNER_MARKER_PATH_ERROR',
 actual_acceptance:raw,metrics,actual_marker:marker.replaceAll('\\','/'),original_runner_status:state.status,original_runner_error:state.error,
 evidence:'Frozen worker reached its marker read only after compile/elaborate/simulate returned zero. Actual fresh marker and PASS transcript match; generated config differs only in marker path. Original job status remains FAILED.',
 implementation_checkpoint_sha256:hash(fs.readFileSync(path.join(build,'af_pipeline_impl_1.dcp'))),
 compiled_netlist_sha256:hash(fs.readFileSync(path.join(spec.script_dir,'tb_af_receive_pipeline_func_impl.v'))),
 compile_project_sha256:hash(projectFile),testbench_sha256:hash(fs.readFileSync(testFile)),
 simulator_stdout_sha256:hash(stdout),actual_marker_sha256:hash(raw),source_snapshot_sha256:hash(fs.readFileSync(path.join(job,'source_snapshot.json'))),
 scope:'Post-route functional simulation only; no SDF or CMAC IP simulation'};
fs.writeFileSync(path.join(job,'acceptance_audit.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:result.status,metrics},null,2));
