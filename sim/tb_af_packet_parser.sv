`timescale 1ns/1ps
`include "af_parser_config.svh"
module tb_af_packet_parser;
 localparam W=`AF_PARSER_WIDTH,B=W/8;
 reg clk=0;always #2 clk=~clk;reg rst_n=0;
 reg [W-1:0] data=0;reg [B-1:0] keep=0;reg valid=0,last=0,bad=0;wire ready;
 reg [511:0] cfg;wire hv;reg hr=0;wire ha;wire [511:0] header;wire [15:0] he;
 wire pv;reg pr=0;wire [W-1:0] pd;wire [B-1:0] pk;wire pl;
 wire fv;reg fr=0;wire reserved,commit;wire [15:0] errors,fb,sb;wire [511:0] fh;
 assign ha=he==0 && !cfg[67];
 af_packet_parser #(.WIDTH(W),.IDLE_TIMEOUT(256)) dut(.clk(clk),.rst_n(rst_n),.s_data(data),.s_keep(keep),.s_valid(valid),.s_last(last),.s_error(bad),.s_ready(ready),
 .cfg_epoch(32'd7),.cfg_config(32'd11),.cfg_first_frequency(cfg[160+:32]),.cfg_adc_stride(cfg[192+:32]),
 .cfg_destination(cfg[128+:16]),.cfg_frequencies(cfg[144+:16]),.cfg_t_log2(cfg[288+:2]),.cfg_epoch_adc(cfg[224+:64]),
 .cfg_mac(48'h020000000001),.cfg_ip(32'h0a000001),.cfg_port(16'd7148),.cfg_mtu(16'd9000),
 .h_valid(hv),.h_ready(hr),.h_accept(ha),.h_header(header),.h_errors(he),
 .p_valid(pv),.p_ready(pr),.p_data(pd),.p_keep(pk),.p_last(pl),
 .f_valid(fv),.f_ready(fr),.f_reserved(reserved),.f_commit(commit),.f_errors(errors),.f_header(fh),.f_frame_bytes(fb),.f_science_bytes(sb));
 reg [W+B+1:0] beats [0:`AF_PARSER_BEAT_COUNT-1];reg [511:0] infos [0:`AF_PARSER_FRAMES-1],headers [0:`AF_PARSER_FRAMES-1];
 reg [7:0] gold [0:`AF_PARSER_GOLD_BYTES-1];
 integer frame_index,cycle=0,sent,start,count,bytes_out=0,results=0,commits=0,rejects=0,decisions=0,i,fd,fi,reset_cut;
 reg frame_live=0,frame_done=0,fired=1,saw_last=0;
 reg hh=0,ph=0,ff=0;reg [527:0] old_h;reg [W+B:0] old_p;reg [561:0] old_f;
 always @(negedge clk)if(rst_n)begin hr=cycle%5>=2;pr=cycle%7>=3;fr=cycle%11>=3;end
 always @(posedge clk)begin
  cycle=cycle+1;if(cycle>200000)$fatal(1,"parser timeout");
  if(rst_n)begin
   if(hh && (!hv || {he,header}!==old_h))$fatal(1,"header changed under stall");
   if(ph && (!pv || {pd,pk,pl}!==old_p))$fatal(1,"payload changed under stall");
   if(ff && (!fv || {fh,errors,reserved,commit,fb,sb}!==old_f))$fatal(1,"finish changed under stall");
   hh=hv&&!hr;old_h={he,header};ph=pv&&!pr;old_p={pd,pk,pl};ff=fv&&!fr;old_f={fh,errors,reserved,commit,fb,sb};
   if(hv&&hr)begin
    if(!frame_live || header!==headers[frame_index])$fatal(1,"header bytes mismatch frame=%0d",frame_index);
    decisions=decisions+1;
   end
   if(pv&&pr)begin
    if(!frame_live || saw_last || pk==0 || (({1'b0,pk}&({1'b0,pk}+1))!=0) || (!pl && !(&pk)))$fatal(1,"payload framing mismatch");
    for(i=0;i<B;i=i+1)if(pk[i])begin
     if(bytes_out>=cfg[80+:16] || pd[8*i+:8]!==gold[cfg[96+:32]+bytes_out])$fatal(1,"science byte mismatch frame=%0d byte=%0d",frame_index,bytes_out);
     bytes_out=bytes_out+1;
    end
    saw_last=pl;
   end
   if(fv&&fr)begin
    if(!frame_live || frame_done || commit!==cfg[64] || fb!==cfg[320+:16] || sb!==bytes_out || fh!==headers[frame_index])$fatal(1,"result mismatch frame=%0d commit=%b expected=%b errors=%h frame_bytes=%0d expected=%0d science=%0d/%0d",frame_index,commit,cfg[64],errors,fb,cfg[320+:16],sb,bytes_out);
    if(commit && (!reserved || errors!=0 || bytes_out!=cfg[80+:16] || !saw_last))$fatal(1,"incomplete accepted payload");
    if(!commit && errors==0)$fatal(1,"rejection without reason");
    if((errors&cfg[368+:16])!==cfg[368+:16])$fatal(1,"wrong error class frame=%0d errors=%h required=%h",frame_index,errors,cfg[368+:16]);
    if(commit)commits=commits+1;else rejects=rejects+1;
    results=results+1;frame_done=1;
   end
  end
 end
 task automatic resync_tail;
  begin
   @(negedge clk);valid=1;data=0;keep=1;last=1;bad=1;
   do @(posedge clk);while(!ready);
   @(negedge clk);valid=0;last=0;bad=0;
  end
 endtask
 task automatic replay(input integer selected_frame);
  begin
   frame_index=selected_frame;
   @(negedge clk);cfg=infos[frame_index];start=cfg[0+:32];count=cfg[32+:32];sent=0;fired=1;
   bytes_out=0;saw_last=0;frame_done=0;frame_live=1;
   while(sent<count)begin
    @(negedge clk);
    if(!valid || fired)begin
     valid=cycle%6!=1;{bad,last,keep,data}=beats[start+sent];
    end
    @(posedge clk);fired=valid&&ready;if(fired)sent=sent+1;
   end
   @(negedge clk);valid=0;last=0;bad=0;
   while(!frame_done)@(negedge clk);
   frame_live=0;
   if(!cfg[65])resync_tail();
  end
 endtask
 initial begin
  $readmemh(`AF_PARSER_BEATS,beats);$readmemh(`AF_PARSER_INFO,infos);$readmemh(`AF_PARSER_HEADERS,headers);$readmemh(`AF_PARSER_GOLD,gold);
  repeat(35)@(negedge clk);rst_n=1;resync_tail();
  for(fi=0;fi<`AF_PARSER_FRAMES;fi=fi+1)replay(fi);
  // Interrupt a real packet. Reset must discard in-flight state and drain its old tail.
  @(negedge clk);frame_index=7;cfg=infos[7];start=cfg[0+:32];count=cfg[32+:32];frame_live=1;bytes_out=0;saw_last=0;frame_done=0;
  for(reset_cut=0;reset_cut<3;reset_cut=reset_cut+1)begin
   @(negedge clk);valid=1;{bad,last,keep,data}=beats[start+reset_cut];
   do @(posedge clk);while(!ready);
  end
  @(negedge clk);rst_n=0;valid=0;frame_live=0;hh=0;ph=0;ff=0;
  repeat(2)@(negedge clk);rst_n=1;
  for(reset_cut=3;reset_cut<count;reset_cut=reset_cut+1)begin
   @(negedge clk);valid=1;{bad,last,keep,data}=beats[start+reset_cut];
   do @(posedge clk);while(!ready);
  end
  @(negedge clk);valid=0;last=0;bad=0;replay(7);
  if(results!=`AF_PARSER_FRAMES+1 || commits!=33 || rejects==0)$fatal(1,"case coverage mismatch");
  fd=$fopen(`AF_PARSER_PASS,"w");$fwrite(fd,"PASS width=%0d frames=%0d commits=%0d rejects=%0d decisions=%0d cycles=%0d reset_inflight=PASS\n",W,results,commits,rejects,decisions,cycle);$fclose(fd);
  $display("AF_PARSER_PASS width=%0d frames=%0d",W,results);$finish;
 end
endmodule
