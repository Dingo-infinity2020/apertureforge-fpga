// Add immutable verification sources to the same owned implementation experiment.
// The implementation RTL/XDC/source snapshot is never changed.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),build=path.resolve(process.argv[2]??'');
if(!process.argv[2]||path.dirname(build).toLowerCase()!==path.resolve('D:/work/build/apertureforge-fpga').toLowerCase()||
 !path.basename(build).startsWith('cx-p2_06-pipeline-')||!fs.existsSync(path.join(build,'source_snapshot.json')))throw Error('Existing owned pipeline experiment required');
const label=process.argv[3]??'netlist_verification';
if(!/^netlist_verification(?:_[0-9]+)?$/.test(label))throw Error('Invalid verification label');
const extra=path.join(build,label);if(fs.existsSync(extra))throw Error('Verification source snapshot already exists');
const files=['sim/tb_af_receive_pipeline.sv','tcl/phase2_pipeline_netlist.tcl','tcl/phase2_pipeline_run_quiet.tcl','scripts/prepare-phase2-pipeline-netlist.mjs','scripts/run-vivado-sim-job.mjs'];
fs.mkdirSync(extra);
for(const f of files){const dest=path.join(extra,'source',f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest);}
const original=fs.readFileSync(path.join(build,'vectors/af_pipeline_config.svh'),'utf8');
const behavioralMarker=path.join(build,'vectors/pipeline_behavioral_pass.txt');
if(!fs.existsSync(behavioralMarker)){
 const marker=path.join(build,'vectors/pipeline_pass.txt');
 if(!fs.existsSync(marker)||!fs.readFileSync(marker,'utf8').startsWith('PASS '))throw Error('Preserve a valid RTL acceptance before netlist preparation');
 fs.copyFileSync(marker,behavioralMarker,fs.constants.COPYFILE_EXCL);
}
const marker=path.join(extra,'pipeline_post_impl_pass.txt').replaceAll('\\','/');
const cfg=original.replace(/(`define AF_PIPE_PASS) "[^"\r\n]*"/,'$1 "'+marker+'"');
if(cfg===original)throw Error('Acceptance marker not replaced');
fs.mkdirSync(path.join(extra,'vectors'));
const configFile=path.join(extra,'vectors/af_pipeline_verify_config.svh').replaceAll('\\','/');
fs.writeFileSync(configFile,cfg);
// Vivado post-implementation script generation can retain sim_1's -i paths.
// Bind this verification-only include explicitly, without changing test logic.
const testFile=path.join(extra,'source/sim/tb_af_receive_pipeline.sv');
const testSource=fs.readFileSync(testFile,'utf8');
const boundTest=testSource.replace('`include "af_pipeline_verify_config.svh"','`include "'+configFile+'"');
if(boundTest===testSource)throw Error('Verification include not bound');
// Some Vivado post-implementation script generation also drops the alternate
// simset's verilog_define. Bind the verification mode in this frozen TB itself.
const compiledTest='`define AF_PIPE_NETLIST\n'+boundTest;
fs.writeFileSync(testFile,compiledTest);
const hash=s=>createHash('sha256').update(s).digest('hex');
fs.writeFileSync(path.join(extra,'generated_config.json'),JSON.stringify({original_config_sha256:hash(original),verification_config_sha256:hash(cfg),
 repository_testbench_sha256:hash(testSource),compiled_testbench_sha256:hash(compiledTest),
 change:'Explicit AF_PIPE_NETLIST and verification include path; only AF_PIPE_PASS value changes, stimulus/golden paths and scoreboard remain unchanged'},null,2)+'\n');
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),extra,...files],{cwd:root,stdio:'inherit'});
