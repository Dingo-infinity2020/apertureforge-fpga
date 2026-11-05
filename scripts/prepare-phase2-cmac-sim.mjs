// Immutable supplemental verification of a previously frozen real CMAC shell.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),build=path.resolve(process.argv[2]??''),nf=Number(process.argv[3]??12);
if(!process.argv[2]||path.dirname(build).toLowerCase()!==path.resolve('D:/work/build/apertureforge-fpga').toLowerCase()||
 !path.basename(build).startsWith('cx-p2_11-shell-')||!fs.existsSync(path.join(build,'source_snapshot.json'))||![10,12].includes(nf))throw Error('Owned frozen CMAC shell, nf10/12 required');
const label=process.argv[4]??'serial_peer_verification';
if(!/^serial_peer_verification(?:_[0-9]+)?$/.test(label))throw Error('Invalid supplemental verification label');
const extra=path.join(build,label);if(fs.existsSync(extra))throw Error('Fresh supplemental verification required');
const files=['sim/tb_af_cmac_receive_shell.sv','sim/tb_af_receive_pipeline.sv','scripts/generate-phase2-cmac-testbench.mjs',
 'scripts/generate-phase2-pipeline-vectors.mjs','scripts/prepare-phase2-cmac-sim.mjs','scripts/run-vivado-sim-job.mjs',
 'tcl/phase2_cmac_sim.tcl','tcl/phase2_cmac_serial_run.tcl','models/packet.mjs','models/ethernet-frame.mjs'];
fs.mkdirSync(extra);
for(const f of files){const dest=path.join(extra,'source',f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest);}
fs.mkdirSync(path.join(extra,'vectors'));
execFileSync(process.execPath,[path.join(extra,'source/scripts/generate-phase2-pipeline-vectors.mjs'),path.join(extra,'vectors'),String(nf),'3','5','125','burst','256'],{stdio:'inherit'});
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),extra,...files],{cwd:root,stdio:'inherit'});
const file=path.join(extra,'source/sim/tb_af_cmac_receive_shell.sv'),before=fs.readFileSync(file,'utf8');
const after=before.replace('`include "af_pipeline_config.svh"','`include "'+path.join(extra,'vectors/af_pipeline_config.svh').replaceAll('\\','/')+'"');
if(after===before)throw Error('Config include not bound');fs.writeFileSync(file,after);
const hash=s=>createHash('sha256').update(s).digest('hex');
fs.writeFileSync(path.join(extra,'generated_config.json'),JSON.stringify({repository_testbench_sha256:hash(before),compiled_testbench_sha256:hash(after),
 change:'Only explicit include path; actual CMAC/GT peer test logic unchanged',nf,words_per_packet:nf*2},null,2)+'\n');
