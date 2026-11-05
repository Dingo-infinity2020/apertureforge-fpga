import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),build=path.resolve(process.argv[2]??'');
if(!process.argv[2]||path.dirname(build).toLowerCase()!==path.resolve('D:/work/build/apertureforge-fpga').toLowerCase()||
 !path.basename(build).startsWith('cx-')||fs.existsSync(build))throw Error('Fresh external cx- build required');
const files=['rtl/af_rx_ingress.sv','sim/tb_af_rx_ingress.sv','constraints/af_ingress_ooc.xdc','tcl/phase2_ingress.tcl','scripts/prepare-phase2-ingress-run.mjs'];
fs.mkdirSync(build);const frozen=path.join(build,'source');
for(const f of files){const target=path.join(frozen,f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,f),target);}
fs.mkdirSync(path.join(build,'vectors'));
const marker=path.join(build,'vectors/ingress_pass.txt').replaceAll('\\','/');
const large=process.argv[3]==='large';
if(process.argv[3]&&!large)throw Error('Optional argument must be large');
fs.writeFileSync(path.join(build,'vectors/af_ingress_config.svh'),'`define AF_INGRESS_PASS "'+marker+'"\n`define AF_INGRESS_LARGE '+Number(large)+'\n');
fs.writeFileSync(path.join(build,'vectors/ingress_config.json'),JSON.stringify({large,data_depth:large?4096:64,desc_depth:large?64:16,max_frame_bytes:large?9014:512,rtl_synthesis_parameters:'default 4096/64/9014, independent of testbench',minimum_reset_rx_cycles:16},null,2)+'\n');
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),build,...files],{cwd:root,stdio:'inherit'});
console.log('Frozen ingress source: '+frozen.replaceAll('\\','/'));
