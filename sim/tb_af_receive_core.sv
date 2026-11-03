`timescale 1ns/1ps
`include "af_core_config.svh"
module tb_af_receive_core;
 reg clk=0;always #2 clk=~clk;reg rst_n=0;reg [63:0] tick=100;
 reg [511:0] input_data=0;reg [63:0] keep=0;reg valid=0,last=0,bad=0;wire ready;
 reg cfgv=0;wire cfgr,active,fault;reg [31:0] epoch=7,config_id=11;
 reg [63:0] first_seq=13,first_deadline=1000,blocks=3;wire [63:0] generation;
 wire result_valid,result_commit,write_fault;reg result_ready=1;wire [15:0] result_errors,result_source;wire [3:0] result_reason;wire [63:0] result_seq,result_gen;
 wire dv;reg dr=0;wire [63:0] ds,dg;wire [3:0] slot;wire [255:0] mask;wire [8:0] count;
 reg read_valid=0;wire read_ready;reg [3:0] read_slot=0,read_word=0;reg [15:0] read_source=0;
 wire data_valid;reg data_ready=1;wire [511:0] data_out;
 reg done=0;wire done_ready;reg [63:0] done_seq,done_gen;
 wire [63:0] requests,reserved,committed,aborted,rejected,consumed,discarded,canceled,resident,pending,bad_done;
 wire [63:0] written,denied,successes,failures,flushed;
 af_receive_core dut(.clk(clk),.rst_n(rst_n),.now_tick(tick),.s_data(input_data),.s_keep(keep),.s_valid(valid),.s_last(last),.s_error(bad),.s_ready(ready),
 .cfg_valid(cfgv),.cfg_ready(cfgr),.cfg_epoch(epoch),.cfg_config(config_id),.cfg_period_ticks(32'd1000),
 .cfg_first_frequency(32'd2540),.cfg_adc_stride(32'd49152),.cfg_first_sequence(first_seq),.cfg_first_deadline(first_deadline),.cfg_blocks(blocks),
 .cfg_epoch_adc(64'd9007199254740993),.cfg_destination(16'd127),.cfg_frequencies(16'd20),.cfg_t_log2(2'd1),
 .cfg_mac(48'h020000000001),.cfg_ip(32'h0a000001),.cfg_port(16'd7148),.cfg_mtu(16'd9000),.active(active),.cfg_fault(fault),.generation(generation),
 .result_valid(result_valid),.result_ready(result_ready),.result_commit(result_commit),.result_write_fault(write_fault),.result_errors(result_errors),
 .result_source(result_source),.result_reason(result_reason),.result_sequence(result_seq),.result_generation(result_gen),
 .desc_valid(dv),.desc_ready(dr),.desc_sequence(ds),.desc_generation(dg),.desc_slot(slot),.desc_mask(mask),.desc_count(count),
 .read_valid(read_valid),.read_ready(read_ready),.read_slot(read_slot),.read_source(read_source),.read_word(read_word),
 .data_valid(data_valid),.data_ready(data_ready),.data_out(data_out),.done_valid(done),.done_ready(done_ready),.done_sequence(done_seq),.done_generation(done_gen),
 .ring_requests(requests),.ring_reserved(reserved),.ring_committed(committed),.ring_aborted(aborted),.ring_rejected(rejected),
 .ring_consumed(consumed),.ring_discarded(discarded),.ring_canceled(canceled),.ring_resident(resident),.ring_pending(pending),.bad_done(bad_done),
 .words_written(written),.writes_denied(denied),.results_committed(successes),.results_rejected(failures),.contexts_flushed(flushed));
 reg [577:0] beats [0:`AF_CORE_BEAT_COUNT-1];reg [127:0] info [0:8];reg [511:0] gold [0:`AF_CORE_GOLD_WORDS-1];
 reg [511:0] expected_reads [0:127];integer qin=0,qout=0,expected_gold_index;
 integer cycles=0,results=0,descriptors=0,packet_index,base_index,packet_beats,j,fd;
 reg expect_result=0,want_commit,want_write_fault;reg [3:0] want_reason;reg [15:0] want_errors,want_source;
 reg [63:0] want_seq,want_gen;reg [255:0] want_mask;
 reg rh=0,dh=0,mh=0;reg [165:0] held_result;reg [511:0] held_data;reg [396:0] held_desc;
 always @(posedge clk)begin
  cycles=cycles+1;if(cycles>10000)$fatal(1,"receive core timeout");
  if(rst_n && !cfgv)begin
   if(rh && (!result_valid || {result_commit,write_fault,result_errors,result_reason,result_source,result_seq,result_gen}!==held_result))$fatal(1,"result unstable");
   if(dh && (!data_valid || data_out!==held_data))$fatal(1,"read data unstable");
   if(mh && (!dv || {ds,dg,slot,mask,count}!==held_desc))$fatal(1,"mask unstable");
   rh=result_valid&&!result_ready;held_result={result_commit,write_fault,result_errors,result_reason,result_source,result_seq,result_gen};
   dh=data_valid&&!data_ready;held_data=data_out;mh=dv&&!dr;held_desc={ds,dg,slot,mask,count};
   if(read_valid&&read_ready)begin expected_reads[qin]=gold[expected_gold_index];qin=qin+1;end
   if(data_valid&&data_ready)begin if(qout>=qin || data_out!==expected_reads[qout])$fatal(1,"RAM read mismatch word=%0d",qout);qout=qout+1;end
   if(result_valid&&result_ready)begin
    if(!expect_result || result_commit!==want_commit || write_fault!==want_write_fault || result_reason!==want_reason ||
     (result_errors&want_errors)!==want_errors || (want_commit && result_errors!=0) || result_source!==want_source || result_seq!==want_seq || result_gen!==want_gen)
     $fatal(1,"result mismatch packet=%0d commit=%b reason=%0d errors=%h write_fault=%b src=%0d seq=%0d gen=%0d",packet_index,result_commit,result_reason,result_errors,write_fault,result_source,result_seq,result_gen);
    results=results+1;expect_result=0;
   end
  end else begin rh=0;dh=0;mh=0;end
 end
 task automatic install(input [31:0] e,c,input [63:0] s,d,n);
  begin
   @(negedge clk);valid=0;epoch=e;config_id=c;first_seq=s;first_deadline=d;blocks=n;cfgv=1;
   do @(posedge clk);while(!cfgr);
   @(negedge clk);cfgv=0;repeat(12)@(negedge clk);
   if(!active || fault)$fatal(1,"core configuration failed");
  end
 endtask
 task automatic resync_tail;
  begin
   @(negedge clk);valid=1;last=1;keep=1;input_data=0;bad=1;
   do @(posedge clk);while(!ready);
   @(negedge clk);valid=0;last=0;bad=0;
  end
 endtask
 task automatic send(input integer id,input bit ok,input [3:0] why,input [15:0] err,input bit wf,input integer action);
  integer n,before_results;begin
   packet_index=id;base_index=info[id][0+:32];packet_beats=info[id][32+:32];before_results=results;
   expect_result=action!=2;want_commit=ok;want_reason=why;want_errors=err;want_write_fault=wf;
   want_source=id==0?0:(id==1||id==6||id==8?255:(id==5?1:0));want_seq=id==0?0:(id==6||id==7?14:(id==8?24:13));want_gen=generation;
   for(n=0;n<packet_beats;n=n+1)begin
    @(negedge clk);valid=1;{bad,last,keep,input_data}=beats[base_index+n];
    do @(posedge clk);while(!ready);
    if(n==4 && action==1)begin @(negedge clk);valid=0;tick=1000;end
    if(n==4 && action==2)install(8,12,14,3000,12);
   end
   @(negedge clk);valid=0;last=0;bad=0;
   if(action!=2)begin
    if(id==1 && before_results==1)begin
     result_ready=0;while(!result_valid)@(negedge clk);repeat(3)@(negedge clk);result_ready=1;
    end
    while(results==before_results)@(negedge clk);
   end else begin repeat(4)@(negedge clk);if(results!=before_results)$fatal(1,"flushed packet escaped");end
  end
 endtask
 task automatic begin_descriptor(input [63:0] seq,input [255:0] bitmap,input integer n);
  begin
   while(!dv)@(negedge clk);
   if(ds!==seq || mask!==bitmap || count!==n || dg!==generation)$fatal(1,"descriptor mismatch seq=%0d count=%0d expected=%0d",ds,count,n);
   descriptors=descriptors+1;@(negedge clk);dr=1;@(posedge clk);@(negedge clk);dr=0;
  end
 endtask
 task automatic read_one(input integer src,w,packet);
  begin
   @(negedge clk);read_valid=1;read_slot=slot;read_source=src;read_word=w;expected_gold_index=info[packet][64+:32]+w;
   do @(posedge clk);while(!read_ready);
   @(negedge clk);read_valid=0;
  end
 endtask
 task automatic deny_read(input integer src);
  begin
   @(negedge clk);read_valid=1;read_slot=slot;read_source=src;read_word=0;
   repeat(3)begin @(posedge clk);#1;if(read_ready)$fatal(1,"uncommitted source became readable");end
   @(negedge clk);read_valid=0;
  end
 endtask
 task automatic finish_descriptor(input bit check_fence);
  begin
   @(negedge clk);read_valid=0;done=1;done_seq=ds;done_gen=dg;
   if(check_fence)begin repeat(3)begin @(posedge clk);#1;if(done_ready)$fatal(1,"slot released before outstanding reads drained");end @(negedge clk);data_ready=1;end
   do @(posedge clk);while(!done_ready);
   @(negedge clk);done=0;if(qout!=qin)$fatal(1,"consumer done before scoreboard drained");
  end
 endtask
 initial begin
  $readmemh(`AF_CORE_BEATS,beats);$readmemh(`AF_CORE_INFO,info);$readmemh(`AF_CORE_GOLD,gold);
  repeat(35)@(negedge clk);rst_n=1;install(7,11,13,1000,3);resync_tail();
  send(0,0,0,16'h1000,0,0);send(1,1,0,0,0,0);
  send(1,0,5,16'h8000,0,0);if(written!=10)$fatal(1,"duplicate wrote data");
  send(2,0,0,16'h2000,0,0);if(written!=20 || committed!=1 || aborted!=1 || pending!=0)$fatal(1,"bad tail was not canceled after write");
  send(3,0,0,16'h0200,0,0);if(written!=20)$fatal(1,"bad network header wrote data");
  send(4,1,0,0,0,0);send(5,0,3,0,1,1);
  want_mask=0;want_mask[0]=1;want_mask[255]=1;begin_descriptor(13,want_mask,2);deny_read(1);
  for(j=0;j<10;j=j+1)read_one(0,j,4);for(j=0;j<8;j=j+1)read_one(255,j,1);
  while(qout<qin)@(negedge clk);
  // Fill both read stages with consecutive requests before applying the done fence.
  @(negedge clk);data_ready=0;read_valid=1;read_slot=slot;read_source=255;read_word=8;expected_gold_index=info[1][64+:32]+8;
  do @(posedge clk);while(!read_ready);
  @(negedge clk);read_word=9;expected_gold_index=info[1][64+:32]+9;
  do @(posedge clk);while(!read_ready);
  @(negedge clk);read_valid=0;finish_descriptor(1);
  send(6,0,0,0,0,2);if(generation!=2 || flushed!=1 || pending!=0)$fatal(1,"epoch did not cancel pending frame");
  @(negedge clk);done=1;done_seq=13;done_gen=1;@(posedge clk);@(negedge clk);done=0;if(bad_done!=1)$fatal(1,"stale done not rejected");
  send(7,1,0,0,0,0);@(negedge clk);tick=3000;want_mask=0;want_mask[0]=1;begin_descriptor(14,want_mask,1);deny_read(255);
  for(j=0;j<10;j=j+1)read_one(0,j,7);while(qout<qin)@(negedge clk);finish_descriptor(0);
  send(8,1,0,0,0,0);
  for(j=15;j<24;j=j+1)begin @(negedge clk);tick=3000+(j-14)*1000;begin_descriptor(j,0,0);finish_descriptor(0);end
  @(negedge clk);tick=13000;want_mask=0;want_mask[255]=1;begin_descriptor(24,want_mask,1);deny_read(0);
  for(j=0;j<10;j=j+1)read_one(255,j,8);while(qout<qin)@(negedge clk);finish_descriptor(0);
  @(negedge clk);tick=14000;begin_descriptor(25,0,0);finish_descriptor(0);
  if(active || fault || results!=9 || successes!=4 || failures!=5 || qout!=40 || descriptors!=13)$fatal(1,"terminal coverage mismatch");
  if(committed!=4 || consumed!=4 || discarded!=0 || canceled!=2 || resident!=0 || pending!=0 || aborted!=1 || reserved!=7 || rejected!=2)$fatal(1,"terminal ring counters mismatch");
  if(requests!=reserved+committed+aborted+rejected || reserved!=committed+aborted+canceled+pending || committed!=consumed+discarded+resident)$fatal(1,"ring conservation mismatch");
  if(written!=54 || denied!=8)$fatal(1,"RAM write accounting mismatch written=%0d denied=%0d",written,denied);
  fd=$fopen(`AF_CORE_PASS,"w");$fwrite(fd,"PASS slots=10 sources=256 words=25600 results=%0d committed=%0d rejected=%0d read_words=%0d written=%0d denied=%0d descriptors=%0d\n",results,successes,failures,qout,written,denied,descriptors);$fclose(fd);
  $display("AF_CORE_PASS results=%0d read_words=%0d",results,qout);$finish;
 end
endmodule
