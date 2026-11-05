`timescale 1ns/1ps
`include "af_ingress_config.svh"
module tb_af_rx_ingress;
 localparam DATA_DEPTH=`AF_INGRESS_LARGE?4096:64,DESC_DEPTH=`AF_INGRESS_LARGE?64:16;
 localparam MAX_FRAME_BYTES=`AF_INGRESS_LARGE?9014:512,MAX_BEATS=(MAX_FRAME_BYTES+63)/64;
 localparam MAX_TAIL=MAX_FRAME_BYTES-(MAX_BEATS-1)*64,OVERLOAD_PACKETS=DATA_DEPTH/MAX_BEATS+16;
 reg rx_clk=0;always #1.55 rx_clk=~rx_clk;
 reg clk=0;always #2.37 clk=~clk;
 reg rst_n=0,sv=0,sl=0,se=0;reg [511:0] sd=0;reg [63:0] sk=0;
 wire ro,mo,mv,ml,me,rf,mf;wire [511:0] md;wire [63:0] mk;reg mr=1,auto_ready=1;
 wire [63:0] started,queued,bad,no_space,resyncs,timeouts,oversize,error_frames,delivered,discarded;
 wire [$clog2(DATA_DEPTH):0] words,peak;
 af_rx_ingress #(.DATA_DEPTH(DATA_DEPTH),.DESC_DEPTH(DESC_DEPTH),.MAX_FRAME_BYTES(MAX_FRAME_BYTES),.IDLE_TIMEOUT(16)) dut(
  .rx_clk(rx_clk),.clk(clk),.rst_n(rst_n),.s_data(sd),.s_keep(sk),.s_valid(sv),.s_last(sl),.s_error(se),
  .rx_online(ro),.m_online(mo),.m_data(md),.m_keep(mk),.m_valid(mv),.m_last(ml),.m_error(me),.m_ready(mr),
  .rx_started(started),.rx_queued(queued),.rx_bad(bad),.rx_no_space(no_space),.rx_resync_tails(resyncs),.rx_timeouts(timeouts),
  .rx_oversize(oversize),.rx_error_frames(error_frames),.rx_fault(rf),.rx_data_words(words),.rx_peak_words(peak),
  .m_delivered(delivered),.m_discarded(discarded),.m_fault(mf));
 integer length[0:255],tail_bytes[0:255],seen[0:255];reg invalid[0:255];
 integer cycles=0,out_frames=0,out_words=0,in_word=0,current_packet=-1,p,w,i,fd,phase1_frames;
 reg [63:0] old_no_space,phase1_started,phase1_bad,phase1_space,phase1_peak;
 reg held=0;reg [576:0] held_word;
 function automatic [511:0] payload(input integer id,n);
  integer b;begin
   for(b=0;b<64;b=b+1)payload[8*b+:8]=(7*id+19*n+b)&255;
   payload[15:0]=id;payload[31:16]=n;
  end
 endfunction
 function automatic [63:0] tail_mask(input integer bytes);
  integer b;begin for(b=0;b<64;b=b+1)tail_mask[b]=b<bytes;end
 endfunction
 always @(negedge clk)if(auto_ready)mr=cycles%7!=0 && cycles%7!=1;
 always @(posedge clk)begin
  cycles=cycles+1;if(cycles>30000)$fatal(1,"ingress timeout");
  if(!rst_n || !mo)begin held=0;in_word=0;current_packet=-1;end
  else begin
   if(held && (!mv || {ml,mk,md}!==held_word))$fatal(1,"ingress output changed under stall");
   held=mv&&!mr;held_word={ml,mk,md};
   if(rf || mf)$fatal(1,"ingress FIFO/protocol fault");
   if(mv&&mr)begin
    p=md[15:0];w=md[31:16];
    if(p>=256 || invalid[p] || w!=in_word || md!==payload(p,w) || me)$fatal(1,"ingress data mismatch id=%0d word=%0d expected=%0d",p,w,in_word);
    if(in_word==0)begin current_packet=p;if(seen[p])$fatal(1,"duplicate output packet");end
    if(p!=current_packet || ml!==(w==length[p]-1) || mk!==(ml?tail_mask(tail_bytes[p]):{64{1'b1}}))$fatal(1,"ingress packet boundary/keep mismatch");
    out_words=out_words+1;
    if(ml)begin seen[p]=1;out_frames=out_frames+1;in_word=0;end else in_word=in_word+1;
   end
  end
 end
 task automatic ready_up;
  begin
   wait(ro&&mo);repeat(8)@(negedge rx_clk);
   // Initial reset can interrupt a frame: explicitly drain its tail.
   sv=1;sl=1;se=1;sk=1;sd=0;@(negedge rx_clk);sv=0;sl=0;se=0;
  end
 endtask
 // mode: 0 valid, 1 bad final status, 2 noncontiguous keep, 3 missing TLAST,
 // 4 early status error. The source never consults ready or FIFO occupancy.
 task automatic send(input integer id,n,bytes,mode,input bit gap=1);
  integer k;begin
   length[id]=n;tail_bytes[id]=bytes;invalid[id]=mode!=0 || n>MAX_BEATS || (n==MAX_BEATS && bytes>MAX_TAIL);
   for(k=0;k<n;k=k+1)begin
    @(negedge rx_clk);sv=1;sd=payload(id,k);sl=k==n-1 && mode!=3;
    sk=k==n-1?tail_mask(bytes):{64{1'b1}};
    se=(mode==1&&k==n-1)||(mode==4&&k==0);
    if(mode==2&&k==0)sk=64'hfffffffffffffff5;
   end
   if(gap)begin @(negedge rx_clk);sv=0;sl=0;se=0;end
  end
 endtask
 task automatic drain;
  integer k;begin
   for(k=0;k<DATA_DEPTH*4+2000;k=k+1)begin
    @(negedge clk);
    if(delivered==queued && discarded==bad && words==0)begin repeat(10)@(negedge clk);return;end
   end
   $fatal(1,"ingress failed to drain queued=%0d delivered=%0d bad=%0d discarded=%0d words=%0d",queued,delivered,bad,discarded,words);
  end
 endtask
 initial begin
  for(i=0;i<256;i=i+1)begin length[i]=0;tail_bytes[i]=0;seen[i]=0;invalid[i]=1;end
  repeat(24)@(negedge rx_clk);rst_n=1;ready_up();
  for(i=0;i<10;i=i+1)begin send(i,1+i%5,1+(i*13)%64,0);repeat(30)@(negedge rx_clk);end
  drain();if(queued!=10 || delivered!=10 || out_frames!=10 || no_space!=0)$fatal(1,"unloaded good frames lost");
  send(11,3,41,1);send(12,4,64,2);send(13,3,64,4);send(14,MAX_BEATS+3,64,0);
  send(15,3,64,3);repeat(24)@(negedge rx_clk);
  sv=1;sl=1;sk=1;sd=0;se=1;@(negedge rx_clk);sv=0;sl=0;se=0;
  send(16,2,47,0);drain();
  if(bad!=5 || oversize!=1 || timeouts!=1 || queued!=11 || out_frames!=11)$fatal(1,"ingress fault classification bad=%0d oversized=%0d timeouts=%0d",bad,oversize,timeouts);
  auto_ready=0;@(negedge clk);mr=0;
  for(i=32;i<32+OVERLOAD_PACKETS;i=i+1)send(i,MAX_BEATS,MAX_TAIL,0,i==31+OVERLOAD_PACKETS);
  repeat(10)@(negedge rx_clk);
  if(no_space==0)$fatal(1,"overload did not reject whole packets");
  @(negedge clk);auto_ready=1;drain();
  if(started!=queued+bad+no_space || delivered!=queued || discarded!=bad || in_word!=0)$fatal(1,"ingress accounting mismatch");
  // Descriptor pressure with little data: single-beat packets have no idle cycles.
  old_no_space=no_space;auto_ready=0;@(negedge clk);mr=0;
  for(i=128;i<128+DESC_DEPTH+16;i=i+1)send(i,1,31,0,i==127+DESC_DEPTH+16);
  repeat(10)@(negedge rx_clk);
  if(no_space<=old_no_space || words>=DATA_DEPTH-MAX_BEATS-4)$fatal(1,"descriptor-only overload not exercised");
  @(negedge clk);auto_ready=1;drain();
  if(started!=queued+bad+no_space || delivered!=queued || discarded!=bad)$fatal(1,"descriptor pressure accounting mismatch");
  phase1_frames=out_frames;phase1_started=started;phase1_bad=bad;phase1_space=no_space;phase1_peak=peak;
  // Reset with a published frame stalled and another frame interrupted.
  auto_ready=0;@(negedge clk);mr=0;send(110,6,64,0);
  send(111,2,64,3);@(negedge rx_clk);rst_n=0;
  repeat(24)@(negedge rx_clk);rst_n=1;ready_up();
  auto_ready=1;send(112,5,23,0);drain();
  if(queued!=1 || delivered!=1 || bad!=0 || no_space!=0 || out_frames!=phase1_frames+1 || !seen[112] || seen[110] || seen[111])$fatal(1,"reset leaked old frame");
  fd=$fopen(`AF_INGRESS_PASS,"w");
  $fwrite(fd,"PASS data_depth=%0d max_frame_bytes=%0d before_reset_started=%0d before_reset_frames=%0d before_reset_bad=%0d before_reset_no_space=%0d peak_words=%0d total_words=%0d after_reset_frames=%0d independent_rx_period_ps=3100 processing_period_ps=4740\n",DATA_DEPTH,MAX_FRAME_BYTES,phase1_started,phase1_frames,phase1_bad,phase1_space,phase1_peak,out_words,delivered);$fclose(fd);
  $display("AF_INGRESS_PASS frames_before_reset=%0d words=%0d",phase1_frames,out_words);$finish;
 end
endmodule
