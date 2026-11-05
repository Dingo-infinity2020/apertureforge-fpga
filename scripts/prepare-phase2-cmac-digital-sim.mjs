// Supplemental real-CMAC digital-boundary test. No GT serial/PLL coverage.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url)),build=path.resolve(process.argv[2]??'');
const label=process.argv[3]??'digital_peer_verification';
const nf=Number(process.argv[4]??12),probeMode=process.argv[5]??'basic',controls=probeMode==='controls';
if(![10,12].includes(nf)||!['basic','controls'].includes(probeMode))throw Error('nf10/12 and basic/controls required');
if(!process.argv[2]||path.dirname(build).toLowerCase()!==path.resolve('D:/work/build/apertureforge-fpga').toLowerCase()||
 !path.basename(build).startsWith('cx-p2_11-shell-')||!/^digital_peer_verification(?:_[0-9]+)?$/.test(label))throw Error('Owned build and new digital label required');
const config=fs.readFileSync(path.join(build,'reports/cmac_configuration.tsv'),'utf8');
if(!/^CONFIG.GT_LOCATION\t0$/m.test(config))throw Error('Actual IP must expose digital SERDES boundary');
const profile=JSON.parse(fs.readFileSync(path.join(build,'instance_profile_endpoint/profile_config.json'),'utf8'));
if(createHash('sha256').update(fs.readFileSync(profile.public_interface_source)).digest('hex')!==profile.public_interface_sha256)
 throw Error('Public interface changed since frozen profile');
const extra=path.join(build,label);if(fs.existsSync(extra))throw Error('Fresh supplemental directory required');
const files=['scripts/prepare-phase2-cmac-digital-sim.mjs','scripts/run-vivado-sim-job.mjs',
 'scripts/generate-phase2-pipeline-vectors.mjs','sim/tb_af_receive_pipeline.sv','rtl/af_cmac_rx.sv',
 'models/packet.mjs','models/ethernet-frame.mjs','tcl/phase2_cmac_digital.tcl','tcl/phase2_cmac_digital_run.tcl'];
fs.mkdirSync(extra);for(const f of files){const to=path.join(extra,'source',f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(root,f),to);}
fs.mkdirSync(path.join(extra,'generated'));fs.mkdirSync(path.join(extra,'vectors'));
execFileSync(process.execPath,[path.join(extra,'source/scripts/generate-phase2-pipeline-vectors.mjs'),path.join(extra,'vectors'),String(nf),'3','5','125','burst','256'],{stdio:'inherit'});
const configFile=path.join(extra,'vectors/pipeline_config.json'),vectorConfig=JSON.parse(fs.readFileSync(configFile,'utf8'));
vectorConfig.scope='Real CMAC digital peer + receive pipeline; GT/PLL/serial/reset controller excluded';
vectorConfig.control_probes=controls;
fs.writeFileSync(configFile,JSON.stringify(vectorConfig,null,2)+'\n');
const original=fs.readFileSync(path.join(extra,'source/rtl/af_cmac_rx.sv'),'utf8');
const binds=Object.fromEntries([...original.matchAll(/\.(\w+)\(([^()]*)\)/g)].map(m=>[m[1],m[2]]));
Object.assign(binds,{txdata_in:'lane_tx_data',txctrl0_in:'lane_tx_ctrl0',txctrl1_in:'lane_tx_ctrl1',
 rxdata_out:'lane_rx_data',rxctrl0_out:'lane_rx_ctrl0',rxctrl1_out:'lane_rx_ctrl1',
 tx_clk:'clock',rx_clk:'clock',rx_serdes_clk_in:'{10{clock}}',
 // Despite their names, these are active-high CMAC resets in generated HDL.
 tx_reset_done:'!rst_n',rx_reset_done:'!rst_n',rx_serdes_reset_done:'{10{!rst_n}}',drp_clk:'clock'});
const wanted=new Set(['txdata_in','txctrl0_in','txctrl1_in','rx_axis_tdata','rx_axis_tkeep','rx_axis_tvalid','rx_axis_tlast','rx_axis_tuser',
 'tx_axis_tready','stat_rx_aligned','stat_rx_status','stat_rx_bad_fcs']);
const connections=profile.ports.filter(p=>p.dir==='input'||wanted.has(p.name)).map(p=>{
 if(!(p.name in binds))throw Error('Explicit input binding missing: '+p.name);
 return `.${p.name}(${binds[p.name]})`;
});
const endpoint=`// Own adapter to actual af_cmac GT_LOCATION=0. No GT behavioral substitutes.\n`+
`module af_cmac_digital_endpoint(input wire clock,rst_n,
 input wire [511:0] lane_rx_data,output wire [511:0] lane_tx_data,
 input wire [63:0] lane_rx_ctrl0,lane_rx_ctrl1,output wire [63:0] lane_tx_ctrl0,lane_tx_ctrl1,
 input wire [511:0] tx_data,input wire [63:0] tx_keep,input wire tx_valid,tx_last,tx_error,output wire tx_ready,
 output wire [511:0] m_data,output wire [63:0] m_keep,output wire m_valid,m_last,m_error,
 output wire rx_aligned,rx_status,output wire [2:0] rx_bad_fcs);
 af_cmac actual_cmac(\n${connections.join(',\n')}\n);\nendmodule\n`;
let bench=fs.readFileSync(path.join(extra,'source/sim/tb_af_receive_pipeline.sv'),'utf8');
function replace(before,after){if(!bench.includes(before))throw Error('Bench anchor changed: '+before.slice(0,60));bench=bench.replace(before,after);}
replace('module tb_af_receive_pipeline;','module tb_af_cmac_digital;');
replace('`timescale 1ns/1ps','`timescale 1ns/1ps\n`default_nettype none');
const stimulusDeclaration='reg rst_n=0,running=0,cfgv=0;reg [511:0] sd=0;reg [63:0] sk=0;reg sv=0,sl=0,se=0;';
replace(stimulusDeclaration,'');
replace('integer cycles=0,origin=0,','integer link_cycle=-1;integer cycles=0,origin=0,');
replace('integer link_cycle=-1;',`integer reset_probe=0,bad_probe=0,mac_error_seen=0,mac_bad_fcs_seen=0;integer link_cycle=-1;`);
replace('initial begin\n  $readmemh',`always @(posedge clk)if(cycles%1250==0)begin
  $display("AF_CMAC_DIGITAL_PROGRESS ns=%0t cycles=%0d aligned=%b%b status=%b%b tx_ready=%b running=%b results=%0d queued=%0d read_words=%0d",$time,cycles,d_aligned,p_aligned,d_status,p_status,tx_ready,running,results,queued,qout);$fflush();
  $display("AF_DIGITAL_CONFIG cfg=%b/%b online=%b state=%0d rx=%b m=%b active=%b fault=%b generation=%0d req=%b ack=%b core_ready=%b core_s_ready=%b core_active=%b",cfgv,cfgr,online,dut.state,ro,mo,active,fault,generation,dut.req_toggle,dut.ack_clk,dut.core_cfg_ready,dut.core_s_ready,dut.core_active);$fflush();
  if(!rst_n)link_cycle=-1;
  else if(link_cycle<0 && d_status && p_status)link_cycle=cycles;
  if(link_cycle>=0 && cycles-link_cycle>12500 && !running)$fatal(1,"digital startup timeout after link alignment");
 end
 always @(posedge rx_clk)begin
  if(!rst_n)begin mac_error_seen=0;mac_bad_fcs_seen=0;end
  else begin
   if(mac_valid && mac_error)mac_error_seen=mac_error_seen+1;
   if(|d_bad_fcs)mac_bad_fcs_seen=mac_bad_fcs_seen+1;
  end
 end
 task send_probe(input bit mark_error);integer j;begin
  @(negedge rx_clk);
  for(j=0;j<\`AF_PIPE_BEATS_PER_PACKET;j=j+1)begin
   {se,sl,sk,sd}=load[j];se=mark_error && sl;sv=1;
   do @(posedge rx_clk);while(!tx_ready);@(negedge rx_clk);
  end
  sv=0;sl=0;se=0;
 end endtask
 initial begin
  $readmemh`);
replace('reg rx_clk=0;always #1.551515 rx_clk=~rx_clk;',`${stimulusDeclaration}
 reg rx_clk=0;always #1.551515151515 rx_clk=~rx_clk;
 wire [511:0] d_lane,p_lane,mac_data;wire [63:0] d_c0,d_c1,p_c0,p_c1,mac_keep;
 wire mac_valid,mac_last,mac_error,tx_ready,d_aligned,d_status,p_aligned,p_status;wire [2:0] d_bad_fcs,p_bad_fcs;
 af_cmac_digital_endpoint peer(.clock(rx_clk),.rst_n(rst_n),.lane_rx_data(d_lane),.lane_rx_ctrl0(d_c0),.lane_rx_ctrl1(d_c1),
  .lane_tx_data(p_lane),.lane_tx_ctrl0(p_c0),.lane_tx_ctrl1(p_c1),.tx_data(sd),.tx_keep(sk),.tx_valid(sv),.tx_last(sl),.tx_error(se),.tx_ready(tx_ready),
  .m_data(),.m_keep(),.m_valid(),.m_last(),.m_error(),.rx_aligned(p_aligned),.rx_status(p_status),.rx_bad_fcs(p_bad_fcs));
 af_cmac_digital_endpoint receiving_mac(.clock(rx_clk),.rst_n(rst_n),.lane_rx_data(p_lane),.lane_rx_ctrl0(p_c0),.lane_rx_ctrl1(p_c1),
  .lane_tx_data(d_lane),.lane_tx_ctrl0(d_c0),.lane_tx_ctrl1(d_c1),.tx_data(512'd0),.tx_keep(64'd0),.tx_valid(1'b0),.tx_last(1'b0),.tx_error(1'b0),.tx_ready(),
  .m_data(mac_data),.m_keep(mac_keep),.m_valid(mac_valid),.m_last(mac_last),.m_error(mac_error),.rx_aligned(d_aligned),.rx_status(d_status),.rx_bad_fcs(d_bad_fcs));`);
replace('.s_data(sd),.s_keep(sk),.s_valid(sv),.s_last(sl),.s_error(se)',
 '.s_data(mac_data),.s_keep(mac_keep),.s_valid(mac_valid),.s_last(mac_last),.s_error(mac_error)');
replace('always @(posedge rx_clk)if(running && sv)rx_beats=rx_beats+1;',
 'always @(posedge rx_clk)if(running && mac_valid)rx_beats=rx_beats+1;');
replace('if(rf || mf || fault)$fatal(1,"pipeline fault");',
 'if(rf || mf || fault || !d_aligned || !d_status || |d_bad_fcs)$fatal(1,"digital CMAC/pipeline fault");');
replace('repeat(35)@(negedge clk);rst_n=1;\n  // Optional regression: configure long after processing reset, as after link alignment.\n  if($test$plusargs("AF_DELAY_CONFIGURATION"))repeat(14000)@(negedge clk);\n  @(negedge clk);cfgv=1;do @(posedge clk);while(!cfgr);',
 `repeat(100)@(negedge clk);rst_n=1;$display("AF_CMAC_DIGITAL_RESET_RELEASE ns=%0t",$time);$fflush();
  wait(d_aligned && d_status && p_aligned && p_status);$display("AF_CMAC_DIGITAL_LINK_UP ns=%0t",$time);$fflush();
  repeat(100)@(negedge clk);cfgv=1;do @(posedge clk);while(!cfgr);$display("AF_DIGITAL_CONFIG_HANDSHAKE ns=%0t",$time);$fflush();`);
replace('sv=1;sl=1;sk=1;sd=0;se=1;@(negedge rx_clk);sv=0;sl=0;se=0;',
 `// Actual CMAC inserts FCS on startup frame; ingress discards it to resync.
  sv=1;sl=1;sk=64'hffffffffffffffff;sd=0;se=0;
  do @(posedge rx_clk);while(!tx_ready);@(negedge rx_clk);sv=0;sl=0;
  repeat(1000)@(negedge clk);`);
replace('sv=1;{se,sl,sk,sd}=load[index];index=index+1;@(negedge rx_clk);',
 'sv=1;{se,sl,sk,sd}=load[index];index=index+1;do @(posedge rx_clk);while(!tx_ready);@(negedge rx_clk);');
if(controls){
 replace('@(negedge clk);origin=cycles;running=1;',`// Keep a real committed packet resident, then reset both actual CMACs and receiver.
  send_probe(0);wait(committed==1);repeat(20)@(negedge clk);
  if(resident!=1 || pending!=0 || written!=WPP)$fatal(1,"reset probe did not establish a resident packet");
  rst_n=0;cfgv=0;sv=0;link_cycle=-1;repeat(100)@(negedge clk);rst_n=1;
  wait(d_aligned && d_status && p_aligned && p_status);
  repeat(100)@(negedge clk);cfgv=1;do @(posedge clk);while(!cfgr);
  @(negedge clk);cfgv=0;wait(online);repeat(4)@(negedge rx_clk);
  sv=1;sl=1;sk=64'hffffffffffffffff;sd=0;se=0;
  do @(posedge rx_clk);while(!tx_ready);@(negedge rx_clk);sv=0;sl=0;
  repeat(1000)@(negedge clk);
  if(generation!=1 || resident!=0 || pending!=0 || committed!=0 || written!=0 || queued!=0 || fault)$fatal(1,"reset probe leaked old context");
  reset_probe=1;$display("AF_DIGITAL_RESET_PROBE_COMPLETE ns=%0t",$time);$fflush();
  // Actual TX AXIS error indication; observe the partner CMAC's RX error delivery.
  send_probe(1);repeat(1500)@(negedge clk);
  if(bad!=1 || errors!=1 || started!=1 || queued!=0 || idiscarded!=1 || committed!=0 || written!=0 || mac_error_seen<1)
   $fatal(1,"bad-frame probe failed bad=%0d errors=%0d started=%0d queued=%0d discarded=%0d committed=%0d mac_error=%0d",bad,errors,started,queued,idiscarded,committed,mac_error_seen);
  bad_probe=1;$display("AF_DIGITAL_BAD_FRAME_PROBE_COMPLETE mac_error=%0d bad_fcs_pulses=%0d",mac_error_seen,mac_bad_fcs_seen);$fflush();
  @(negedge clk);origin=cycles;running=1;`);
}
replace('started!=PACKETS','started!=PACKETS+bad_probe');
replace('idiscarded!=0 || bad!=0','idiscarded!=bad_probe || bad!=bad_probe');
replace('oversize!=0 || errors!=0','oversize!=0 || errors!=bad_probe');
replace('AF_PIPELINE_PASS packets=%0d read_words=%0d','AF_CMAC_DIGITAL_PASS packets=%0d read_words=%0d');
replace('PASS packets=%0d read_words=%0d','PASS scope=CMAC_DIGITAL_BOUNDARY packets=%0d read_words=%0d');
replace('pause_windows=%0d\\n','pause_windows=%0d reset_probe=%0d bad_probe=%0d mac_error_seen=%0d mac_bad_fcs_seen=%0d\\n');
replace('pause_cycles,pause_windows);$fclose(fd);','pause_cycles,pause_windows,reset_probe,bad_probe,mac_error_seen,mac_bad_fcs_seen);$fclose(fd);');
replace('`include "af_pipeline_config.svh"','`include "'+path.join(extra,'vectors/af_pipeline_config.svh').replaceAll('\\','/')+'"');
bench+='\n`default_nettype wire\n';
for(const [name,data]of [['af_cmac_digital_endpoint.sv',endpoint],['tb_af_cmac_digital.sv',bench]])fs.writeFileSync(path.join(extra,'generated',name),data);
const hash=s=>createHash('sha256').update(s).digest('hex');
fs.writeFileSync(path.join(extra,'generated_config.json'),JSON.stringify({scope:'CMAC_DIGITAL_BOUNDARY_ONLY',nf,control_probes:controls,
 excluded:['GT serial model','QPLL/CDR','GT reset controller','GT-to-CMAC physical clock/reset integration'],
 vendor_public_interface_sha256:profile.public_interface_sha256,adapter_sha256:hash(endpoint),bench_sha256:hash(bench),
 parent_snapshot_sha256:hash(fs.readFileSync(path.join(build,'source_snapshot.json')))},null,2)+'\n');
execFileSync(process.execPath,[path.join(root,'scripts/phase2-snapshot.mjs'),extra,...files],{cwd:root,stdio:'inherit'});
console.log('Prepared real CMAC digital-boundary peer test; NOT serial-shell acceptance');
