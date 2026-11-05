`timescale 1ns/1ps
`include "af_pipeline_config_test.svh"
module tb_af_pipeline_config;
 reg clk=0;always #4 clk=~clk;reg rx_clk=0;always #1.551515 rx_clk=~rx_clk;
 reg rst_n=0,cfgv=0;wire cfgr,online,active,fault;reg [63:0] tick=100,first=13,deadline=1000;
 reg [31:0] epoch=7,config_id=11;
 reg [511:0] sd=0;reg [63:0] sk=0;reg sv=0,sl=0,se=0;
 wire rv,rc,rwf;reg rr=0;wire [15:0] re,rsrc;wire [3:0] reason;wire [63:0] rseq,rgen,generation;
 wire dv,mdv,rdr,done_ready;reg dr=0,rdv=0,mdr=1,done=0;
 wire [2:0] dslt;reg [2:0] rslot=0;reg [15:0] rsource=0;reg [4:0] rword=0;wire [511:0] md;
 wire [63:0] ds,dg;wire [255:0] mask;wire [8:0] count;reg [63:0] done_seq=14,done_gen=2;
 wire [63:0] committed,consumed,discarded,canceled,resident,pending,bad_done,written,denied,flushed;
 wire [63:0] started,queued,bad,no_space,idelivered;wire ro,mo,rf,mf;
 af_receive_pipeline #(.SLOTS(5),.WORDS_PER_PACKET(20),.DESC_DEPTH(256)) dut(
 .rx_clk(rx_clk),.clk(clk),.rst_n(rst_n),.now_tick(tick),.s_data(sd),.s_keep(sk),.s_valid(sv),.s_last(sl),.s_error(se),
 .cfg_valid(cfgv),.cfg_ready(cfgr),.ready_for_data(online),.cfg_epoch(epoch),.cfg_config(config_id),.cfg_period_ticks(32'd1000),
 .cfg_first_sequence(first),.cfg_first_deadline(deadline),.cfg_blocks(64'd1),.cfg_first_frequency(32'd2540),.cfg_adc_stride(32'd49152),
 .cfg_epoch_adc(64'd9007199254740993),.cfg_destination(16'd127),.cfg_frequencies(16'd10),.cfg_t_log2(2'd3),
 .cfg_mac(48'h020000000001),.cfg_ip(32'h0a000001),.cfg_port(16'd7148),.cfg_mtu(16'd9000),.active(active),.cfg_fault(fault),.generation(generation),
 .result_valid(rv),.result_ready(rr),.result_commit(rc),.result_write_fault(rwf),.result_errors(re),.result_source(rsrc),.result_reason(reason),.result_sequence(rseq),.result_generation(rgen),
 .desc_valid(dv),.desc_ready(dr),.desc_sequence(ds),.desc_generation(dg),.desc_slot(dslt),.desc_mask(mask),.desc_count(count),
 .read_valid(rdv),.read_ready(rdr),.read_slot(rslot),.read_source(rsource),.read_word(rword),.data_valid(mdv),.data_ready(mdr),.data_out(md),
 .done_valid(done),.done_ready(done_ready),.done_sequence(done_seq),.done_generation(done_gen),.ring_committed(committed),.ring_consumed(consumed),
 .ring_discarded(discarded),.ring_canceled(canceled),.ring_resident(resident),.ring_pending(pending),.bad_done(bad_done),
 .words_written(written),.writes_denied(denied),.contexts_flushed(flushed),.rx_online(ro),.ingress_m_online(mo),.rx_fault(rf),.ingress_m_fault(mf),
 .rx_started(started),.rx_queued(queued),.rx_bad(bad),.rx_no_space(no_space),.ingress_delivered(idelivered));
 reg [577:0] load[0:`AF_CFG_BEATS-1];reg [127:0] info[0:2];reg [511:0] gold[0:`AF_CFG_WORDS-1];
 integer cycles=0,results=0,reads=0,requests=0,j,fd;reg [165:0] held;reg check_held=0;
 always @(posedge clk)begin
  cycles=cycles+1;if(cycles>5000)$fatal(1,"config/flush test timeout");
  if(rst_n && online && (rf || mf || fault))$fatal(1,"config/flush fault");
  if(check_held && !cfgv && (!rv || {rc,rwf,re,reason,rsrc,rseq,rgen}!==held))$fatal(1,"held result changed");
  if(rv&&rr)begin
   if(results==0)begin
    if(rc || rwf || (re&16'h0004)==0 || reason!=1 || rsrc!=255 || rseq!=13 || rgen!=2)$fatal(1,"old session result mismatch reason=%0d err=%h",reason,re);
   end else if(results==1)begin
    if(!rc || rwf || re!=0 || reason!=0 || rsrc!=0 || rseq!=14 || rgen!=2)$fatal(1,"new session result mismatch");
   end else $fatal(1,"stale result escaped flush");
   results=results+1;
  end
  if(rdv&&rdr)requests=requests+1;
  if(mdv&&mdr)begin if(reads>=requests || md!==gold[40+reads])$fatal(1,"new generation data mismatch word=%0d",reads);reads=reads+1;end
 end
 task automatic raw_range(input integer id,begin_word,end_word);
  integer k,start;begin
   start=info[id][0+:32];
   for(k=begin_word;k<end_word;k=k+1)begin @(negedge rx_clk);sv=1;{se,sl,sk,sd}=load[start+k];end
   @(negedge rx_clk);sv=0;sl=0;se=0;
  end
 endtask
 task automatic resync_tail;
  begin @(negedge rx_clk);sv=1;sl=1;sk=1;sd=0;se=1;@(negedge rx_clk);sv=0;sl=0;se=0;end
 endtask
 task automatic configure;
  begin
   @(negedge clk);cfgv=1;
   #1;if(rv || dv || mdv || rdr || done_ready)$fatal(1,"old interface handshook during config");
   do @(posedge clk);while(!cfgr);
   @(negedge clk);cfgv=0;
  end
 endtask
 initial begin
  $readmemh(`AF_CFG_LOAD,load);$readmemh(`AF_CFG_INFO,info);$readmemh(`AF_CFG_GOLD,gold);
  repeat(35)@(negedge clk);rst_n=1;configure();wait(online);resync_tail();
  raw_range(0,0,22);while(!rv)@(negedge clk);
  if(!rc || rsrc!=255 || rseq!=13 || rgen!=1 || committed!=1)$fatal(1,"first session commit missing");
  held={rc,rwf,re,reason,rsrc,rseq,rgen};check_held=1;repeat(4)@(negedge clk);
  raw_range(0,0,22); // duplicate queued behind the held result
  raw_range(1,0,8); // uncommitted RX partial frame
  epoch=8;config_id=12;first=14;deadline=3000;configure();check_held=0;
  raw_range(1,8,22); // old tail crosses the flush/reset interval
  while(!online)begin @(negedge clk);if(!online && (rv || dv || mdv || rdr || done_ready))$fatal(1,"old output visible while flushing");end
  if(generation!=2 || !active || fault || rv || committed!=1 || discarded!=1 || resident!=0 || pending!=0 || flushed!=1)$fatal(1,"flush state/accounting mismatch gen=%0d discarded=%0d flushed=%0d",generation,discarded,flushed);
  resync_tail();rr=1;raw_range(0,0,22);while(results<1)@(negedge clk);
  raw_range(2,0,22);while(results<2)@(negedge clk);
  @(negedge clk);tick=3000;while(!dv)@(negedge clk);
  if(ds!=14 || dg!=2 || count!=1 || mask!==256'd1)$fatal(1,"new session descriptor contains old source");
  dr=1;@(posedge clk);@(negedge clk);dr=0;rslot=dslt;rsource=255;rdv=1;
  repeat(3)begin @(posedge clk);#1;if(rdr)$fatal(1,"old source became readable");end
  @(negedge clk);rdv=0;rsource=0;
  for(j=0;j<20;j=j+1)begin
   @(negedge clk);rdv=1;rword=j;do @(posedge clk);while(!rdr);
  end
  @(negedge clk);rdv=0;while(reads<20)@(negedge clk);
  done=1;done_gen=1;do @(posedge clk);while(!done_ready);
  @(negedge clk);done=0;if(bad_done!=1 || consumed!=0)$fatal(1,"stale done released current slot");
  done=1;done_gen=2;do @(posedge clk);while(!done_ready);
  @(negedge clk);done=0;
  if(active || committed!=2 || discarded!=1 || consumed!=1 || resident!=0 || pending!=0 || canceled!=0 || denied!=0 || written!=40 ||
   results!=2 || requests!=20 || reads!=20 || started!=2 || queued!=2 || idelivered!=2 || bad!=0 || no_space!=0)$fatal(1,"config terminal conservation mismatch");
  fd=$fopen(`AF_CFG_PASS,"w");$fwrite(fd,"PASS generations=2 held_result_canceled=1 old_partial_flushed=1 old_session_rejected=1 new_words=20 committed=2 discarded=1 consumed=1 stale_done=1\n");$fclose(fd);
  $display("AF_CONFIG_FLUSH_PASS generations=2 new_words=%0d",reads);$finish;
 end
endmodule
