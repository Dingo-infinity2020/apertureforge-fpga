import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),build=path.resolve(process.argv[2]??'');
if(!process.argv[2]||path.dirname(build).toLowerCase()!==path.resolve('D:/work/build/apertureforge-fpga').toLowerCase()||
 !path.basename(build).startsWith('cx-')||fs.existsSync(build))throw Error('Fresh external cx- config build required');
const files=[...['af_afp1_header_check','af_packet_parser','af_ring_control','af_ring_store','af_receive_core','af_rx_ingress','af_receive_pipeline'].map(n=>`rtl/${n}.sv`),
 'sim/tb_af_pipeline_config.sv','tcl/phase2_pipeline_config.tcl','scripts/prepare-phase2-config-run.mjs','scripts/generate-phase2-config-vectors.mjs','models/packet.mjs','models/ethernet-frame.mjs'];
fs.mkdirSync(build);const frozen=path.join(build,'source');
for(const f of files){const target=path.join(frozen,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f),target);}
fs.mkdirSync(path.join(build,'vectors'));
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),build,...files],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,[path.join(frozen,'scripts/generate-phase2-config-vectors.mjs'),path.join(build,'vectors')],{stdio:'inherit'});
