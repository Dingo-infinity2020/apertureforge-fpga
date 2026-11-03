`timescale 1ns/1ps
`include "af_parser_config.svh"
`include "af_parser_perf_config.svh"
module tb_af_packet_parser_perf;
 localparam integer PACKETS=1024;
 reg clk=0;always #2 clk=~clk;reg rst_n=0,valid=0,last=0,bad=0;
 reg [511:0] data=0,cfg;reg [63:0] keep=0;wire ready;
 wire hv,pv,pl,fv,commit,reserved;wire [15:0] he,fe,fb,sb;wire [511:0] pd,hh,fh;wire [63:0] pk;
 af_packet_parser dut(.clk(clk),.rst_n(rst_n),.s_data(data),.s_keep(keep),.s_valid(valid),.s_last(last),.s_error(bad),.s_ready(ready),
 .cfg_epoch(32'd7),.cfg_config(32'd11),.cfg_first_frequency(cfg[160+:32]),.cfg_adc_stride(cfg[192+:32]),
 .cfg_destination(cfg[128+:16]),.cfg_frequencies(cfg[144+:16]),.cfg_t_log2(cfg[288+:2]),.cfg_epoch_adc(cfg[224+:64]),
 .cfg_mac(48'h020000000001),.cfg_ip(32'h0a000001),.cfg_port(16'd7148),.cfg_mtu(16'd9000),
 .h_valid(hv),.h_ready(1'b1),.h_accept(he==0),.h_header(hh),.h_errors(he),
 .p_valid(pv),.p_ready(1'b1),.p_data(pd),.p_keep(pk),.p_last(pl),
 .f_valid(fv),.f_ready(1'b1),.f_reserved(reserved),.f_commit(commit),.f_errors(fe),.f_header(fh),.f_frame_bytes(fb),.f_science_bytes(sb));
 reg [577:0] beats [0:`AF_PARSER_BEAT_COUNT-1];reg [511:0] infos [0:`AF_PARSER_FRAMES-1];
 reg [7:0] gold [0:`AF_PARSER_GOLD_BYTES-1];
 integer cycle=0,sent=0,index=0,start,count,finished=0,bytes_out=0,first_input=-1,first_finish=-1,last_finish=0,min_gap=100000,max_gap=0,i,gap,fd;
 reg running=0;
 always @(posedge clk)begin
  cycle=cycle+1;if(cycle>100000)$fatal(1,"perf timeout");
  if(running)begin
   if(valid&&ready)begin
    if(first_input<0)first_input=cycle;
    if(index==count-1)begin index=0;sent=sent+1;end else index=index+1;
   end
   if(hv && he!=0)$fatal(1,"perf header rejected");
   if(pv)begin
    for(i=0;i<64;i=i+1)if(pk[i])begin
     if(bytes_out>=640 || pd[8*i+:8]!==gold[cfg[96+:32]+bytes_out])$fatal(1,"perf science mismatch");bytes_out=bytes_out+1;
    end
    if(pl && bytes_out!=640)$fatal(1,"perf partial payload");
   end
   if(fv)begin
    if(!commit || !reserved || fe!=0 || fb!=746 || sb!=640 || bytes_out!=640)$fatal(1,"perf result mismatch");
    if(first_finish<0)first_finish=cycle;
    else begin gap=cycle-last_finish;if(gap<min_gap)min_gap=gap;if(gap>max_gap)max_gap=gap;end
    last_finish=cycle;finished=finished+1;bytes_out=0;
    if(finished==PACKETS)begin
     fd=$fopen(`AF_PARSER_PERF_PASS,"w");$fwrite(fd,"PASS packets=%0d total_cycles=%0d interval_min=%0d interval_max=%0d first_finish=%0d last_finish=%0d science_bytes=%0d\n",PACKETS,cycle-first_input+1,min_gap,max_gap,first_finish,last_finish,PACKETS*640);$fclose(fd);
     $display("AF_PARSER_PERF_PASS packets=%0d cycles=%0d interval=%0d/%0d",PACKETS,cycle-first_input+1,min_gap,max_gap);$finish;
    end
   end
  end
 end
 always @(negedge clk)if(running)begin
  valid=sent<PACKETS;{bad,last,keep,data}=beats[start+index];
 end
 initial begin
  $readmemh(`AF_PARSER_BEATS,beats);$readmemh(`AF_PARSER_INFO,infos);$readmemh(`AF_PARSER_GOLD,gold);
  cfg=infos[7];start=cfg[0+:32];count=cfg[32+:32];if(count!=12 || cfg[80+:16]!=640)$fatal(1,"wrong mapped128 fixture");
  repeat(35)@(negedge clk);rst_n=1;
  @(negedge clk);valid=1;last=1;keep=1;
  do @(posedge clk);while(!ready);
  @(negedge clk);valid=0;last=0;running=1;
 end
endmodule
