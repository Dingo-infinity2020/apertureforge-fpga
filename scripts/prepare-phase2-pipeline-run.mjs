import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),[buildArg,...params]=process.argv.slice(2),build=path.resolve(buildArg??'');
if(!buildArg||path.dirname(build).toLowerCase()!==path.resolve('D:/work/build/apertureforge-fpga').toLowerCase()||
 !path.basename(build).startsWith('cx-')||fs.existsSync(build))throw Error('Fresh external cx- pipeline build required');
const files=[...['af_afp1_header_check','af_packet_parser','af_ring_control','af_ring_store','af_receive_core','af_rx_ingress','af_receive_pipeline'].map(n=>`rtl/${n}.sv`),
 'sim/tb_af_receive_pipeline.sv','constraints/af_pipeline_ooc.xdc','tcl/phase2_pipeline.tcl','tcl/phase2_pipeline_delayed_config.tcl','scripts/generate-phase2-pipeline-vectors.mjs',
 'scripts/prepare-phase2-pipeline-run.mjs','models/packet.mjs','models/ethernet-frame.mjs'];
fs.mkdirSync(build);const frozen=path.join(build,'source');
for(const f of files){const target=path.join(frozen,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f),target);}
fs.mkdirSync(path.join(build,'vectors'));
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),build,...files],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[path.join(frozen,'scripts/generate-phase2-pipeline-vectors.mjs'),path.join(build,'vectors'),...params],{stdio:'inherit'});
