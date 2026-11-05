// Diagnostic elaboration profiles, never a functional or hardware acceptance.
// Read generated public module interfaces; vendor implementations stay external.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),build=path.resolve(process.argv[2]??''),kind=process.argv[3];
const options={gt_quad:['af_cmac_gt','ip_0/sim/af_cmac_gt.v'],gt_channel:['af_cmac_gt_gtye4_channel_wrapper','ip_0/sim/af_cmac_gt_gtye4_channel_wrapper.v'],
 gt_common:['af_cmac_gt_gtye4_common_wrapper','ip_0/sim/af_cmac_gt_gtye4_common_wrapper.v'],
 endpoint:['af_cmac','af_cmac.v'],axis_tx:['af_cmac_axis2lbus_segmented_top','af_cmac/example_design/af_cmac_axis2lbus_segmented_top.v'],
 axis_rx:['af_cmac_lbus2axis_segmented_top','af_cmac/example_design/af_cmac_lbus2axis_segmented_top.v']};
if(!process.argv[2]||!options[kind]||path.dirname(build).toLowerCase()!==path.resolve('D:/work/build/apertureforge-fpga').toLowerCase()||
 !path.basename(build).startsWith('cx-p2_11-shell-')||!fs.existsSync(path.join(build,'source_snapshot.json')))throw Error('Owned frozen CMAC build and known diagnostic kind required');
const label=process.argv[4]??'instance_profile_'+kind;
if(!new RegExp('^instance_profile_'+kind+'(?:_[0-9]+)?$').test(label))throw Error('Invalid diagnostic label');
const extra=path.join(build,label);if(fs.existsSync(extra))throw Error('Fresh profile directory required');
const files=['scripts/prepare-phase2-instance-profile.mjs','scripts/run-vivado-sim-job.mjs','tcl/phase2_instance_profile.tcl','tcl/phase2_pipeline_run_quiet.tcl'];
fs.mkdirSync(extra);
for(const f of files){const dest=path.join(extra,'source',f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,f),dest);}
const [module,relative]=options[kind],vendor=path.join(build,'project/af_cmac_shell.gen/sources_1/ip/af_cmac',relative);
const original=fs.readFileSync(vendor,'utf8'),text=original.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').replace(/\(\*[\s\S]*?\*\)/g,'');
const head=text.match(new RegExp('module\\s+'+module+'\\s*(?:#\\([\\s\\S]*?\\))?\\s*\\(([\\s\\S]*?)\\n\\);'));
if(!head)throw Error('Unrecognized public interface: '+module);
const ports=[];
if(/\b(input|output)\b/.test(head[1])){
 let dir='',width='';for(const token of head[1].split(',')){
  const s=token.trim(),m=s.match(/^(input|output)\s+(?:(?:wire|reg)\s+)?(\[[^\]]+\])?\s*(\w+)$/);
  let name;if(m){dir=m[1];width=m[2]??'';name=m[3];}else if(/^\w+$/.test(s))name=s;else throw Error('Unsupported interface token '+s);
  ports.push({name,dir,width});
 }
}else{
 const body=text.slice(head.index+head[0].length).split('endmodule')[0];
 for(const m of body.matchAll(/\b(input|output)\s+(?:(?:wire|reg)\s+)?(\[[^\]]+\])?\s*(\w+)\s*;/g))ports.push({dir:m[1],width:m[2]??'',name:m[3]});
}
if(!ports.length||new Set(ports.map(p=>p.name)).size!==ports.length)throw Error('Invalid port inventory');
const outs=ports.filter(p=>p.dir==='output');if(!outs.length)throw Error('Observable outputs required');
const hash=s=>createHash('sha256').update(s).digest('hex'),bench='tb_af_profile_'+kind,marker=path.join(extra,'profile_done.txt').replaceAll('\\','/');
const bind=p=>p.dir==='output'?'out_'+p.name:/reset|rst/i.test(p.name)?'reset':/clk/i.test(p.name)?'clock':"'0";
const sv=`// Generated public-interface probe: INSTANCE PROFILE ONLY, NOT FUNCTIONAL PASS.\n\`timescale 1ns/1ps\nmodule ${bench};\n`+
 `localparam DATA_WIDTH=512,NUM_CHANNELS=1,NUM_COMMONS=1,FIFO_DEPTH=5;\nreg clock=0,reset=1;always #5 clock=~clock;\n`+
 outs.map(p=>`wire ${p.width} out_${p.name};`).join('\n')+'\n'+module+' dut(\n'+ports.map(p=>`.${p.name}(${bind(p)})`).join(',\n')+'\n);\n'+
 `integer fd;initial begin #0.5;reset=0;#0.5;fd=$fopen("${marker}","w");`+
 `$fwrite(fd,"PROFILE kind=${kind} scope=INSTANCE_ONLY observed=%b\\n",^{${outs.map(p=>'out_'+p.name).join(',')}});$fclose(fd);`+
 `$display("PROFILE_COMPLETE kind=${kind} NOT_A_FUNCTIONAL_TEST");$finish;end\nendmodule\n`;
fs.mkdirSync(path.join(extra,'generated'));fs.writeFileSync(path.join(extra,'generated',bench+'.sv'),sv);
fs.writeFileSync(path.join(extra,'profile_config.json'),JSON.stringify({schema:1,kind,module,bench,scope:'INSTANCE_PROFILE_ONLY',
 public_interface_source:vendor.replaceAll('\\','/'),public_interface_sha256:hash(original),generated_bench_sha256:hash(sv),ports,
 parent_snapshot_sha256:hash(fs.readFileSync(path.join(build,'source_snapshot.json')))},null,2)+'\n');
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),extra,...files],{cwd:root,stdio:'inherit'});
console.log('Generated '+kind+' profile; no functional acceptance claim');
