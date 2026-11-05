import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),build=path.resolve(process.argv[2]??'');
if(!process.argv[2]||path.dirname(build).toLowerCase()!==path.resolve('D:/work/build/apertureforge-fpga').toLowerCase()||
 !path.basename(build).startsWith('cx-')||fs.existsSync(build))throw Error('Fresh external cx- CMAC shell build required');
const files=[...['af_afp1_header_check','af_packet_parser','af_ring_control','af_ring_store','af_receive_core','af_rx_ingress','af_receive_pipeline','af_cmac_rx','af_cmac_receive_shell'].map(n=>`rtl/${n}.sv`),
 'constraints/af_cmac_shell_ooc.xdc','tcl/phase2_cmac_shell.tcl','scripts/prepare-phase2-cmac-shell-run.mjs','scripts/generate-cmac-shell.mjs'];
fs.mkdirSync(build);const frozen=path.join(build,'source');
for(const f of files){const target=path.join(frozen,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f),target);}
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),build,...files],{cwd:root,stdio:'inherit'});
