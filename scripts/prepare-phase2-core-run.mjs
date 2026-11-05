// Freeze an independent source tree before opening a fresh Codex core project.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const build=path.resolve(process.argv[2]??'');
const allowed=path.resolve('D:/work/build/apertureforge-fpga');
if(!process.argv[2] || path.dirname(build).toLowerCase()!==allowed.toLowerCase() ||
 !path.basename(build).startsWith('cx-') || fs.existsSync(build))throw Error('Fresh external cx- build required');
const files=[
 ...['af_afp1_header_check','af_packet_parser','af_ring_control','af_ring_store','af_receive_core'].map(n=>`rtl/${n}.sv`),
 'sim/tb_af_receive_core.sv','sim/tb_af_receive_core_perf.sv','sim/tb_af_ring_preview.sv','constraints/af_core_ooc.xdc',
 'tcl/phase2_core.tcl','tcl/phase2_core_perf.tcl','tcl/phase2_core_observe.tcl','tcl/phase2_netlist.tcl','tcl/phase2_preview.tcl',
 'scripts/generate-phase2-core-vectors.mjs','scripts/generate-phase2-core-perf.mjs','scripts/prepare-phase2-core-run.mjs',
 'models/packet.mjs','models/ethernet-frame.mjs','config/phase1-sustained.json'
];
fs.mkdirSync(build);
const frozen=path.join(build,'source');
for(const f of files){const dest=path.join(frozen,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest);}
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),build,...files],{cwd:root,stdio:'inherit'});
for(const script of ['generate-phase2-core-vectors.mjs','generate-phase2-core-perf.mjs'])
 execFileSync(process.execPath,[path.join(frozen,'scripts',script),path.join(build,'vectors')],{cwd:root,stdio:'inherit'});
console.log('Frozen source tree: '+frozen.replaceAll('\\','/'));
