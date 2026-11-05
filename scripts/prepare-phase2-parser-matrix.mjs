// Freeze a fresh parser regression matrix. Never edits earlier build evidence.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),build=path.resolve(process.argv[2]??'');
if(!process.argv[2] || path.dirname(build).toLowerCase()!==path.resolve('D:/work/build/apertureforge-fpga').toLowerCase() ||
 !path.basename(build).startsWith('cx-') || fs.existsSync(build))throw Error('Fresh external cx- matrix required');
const files=['rtl/af_afp1_header_check.sv','rtl/af_packet_parser.sv','sim/tb_af_packet_parser.sv','constraints/af_parser_ooc.xdc',
 'tcl/phase2_parser.tcl','scripts/generate-phase2-network-vectors.mjs','scripts/export-phase2-parser-vectors.mjs',
 'scripts/prepare-phase2-parser-matrix.mjs','models/packet.mjs','models/ethernet-frame.mjs','config/phase1.json'];
fs.mkdirSync(build);const frozen=path.join(build,'source');
for(const f of files){const dest=path.join(frozen,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest);}
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),build,...files],{cwd:root,stdio:'inherit'});
const reference=path.join(build,'reference');
execFileSync(process.execPath,[path.join(frozen,'scripts/generate-phase2-network-vectors.mjs'),reference],{stdio:'inherit'});
for(const width of [32,64,512])execFileSync(process.execPath,[path.join(frozen,'scripts/export-phase2-parser-vectors.mjs'),
 path.join(reference,'network_vectors.json'),path.join(build,'w'+width,'vectors'),String(width)],{stdio:'inherit'});
