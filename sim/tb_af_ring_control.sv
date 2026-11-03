`timescale 1ns/1ps
`include "af_control_config.svh"
module tb_af_ring_control;
 localparam integer N=256,D=10,SW=$clog2(D);
 localparam [63:0] BASE=64'd9007199254741000,NEW_BASE=BASE+1000,PERIOD=100000;
 reg clk=0;always #2 clk=~clk;
 reg rst_n=0;reg [63:0] now_tick=100;
 reg cfg_valid=0;wire cfg_ready;reg [31:0] cfg_epoch=7,cfg_config=11,cfg_period=PERIOD;
 reg [63:0] first_sequence=BASE,first_deadline=PERIOD,blocks=30;
 wire active,cfg_fault;wire [63:0] generation;
 reg cv=0;wire cr;reg [1:0] op;reg [31:0] ce=7,cc=11;
 reg [63:0] seq,gen;reg [15:0] src;reg [SW-1:0] slot;
 wire rv,accepted;reg rr=1;wire [3:0] reason;wire [SW-1:0] rs;wire [63:0] rseq,rgen;
 reg [SW-1:0] ws;reg [63:0] wseq,wgen;reg [15:0] wsrc;wire wp;
 wire dv;reg dr=0;wire [63:0] ds,dg;wire [SW-1:0] dslot;wire [N-1:0] mask;wire [8:0] count;
 reg done=0;wire done_ready;reg [63:0] done_seq,done_gen;
 wire [63:0] requests,reserved,committed,aborted,rejected,consumed,discarded,canceled,resident,pending_total,bad_done;
 af_ring_control #(.PREVIEW(0)) dut(.clk(clk),.rst_n(rst_n),.now_tick(now_tick),.cfg_valid(cfg_valid),.cfg_ready(cfg_ready),
 .cfg_epoch(cfg_epoch),.cfg_config(cfg_config),.cfg_period_ticks(cfg_period),.cfg_first_sequence(first_sequence),
 .cfg_first_deadline(first_deadline),.cfg_blocks(blocks),.active(active),.cfg_fault(cfg_fault),.generation(generation),
 .cmd_valid(cv),.cmd_ready(cr),.cmd_op(op),.cmd_epoch(ce),.cmd_config(cc),.cmd_sequence(seq),.cmd_generation(gen),.cmd_source(src),.cmd_slot(slot),
 .cmd_pre_valid(1'b0),.cmd_pre_epoch(32'd0),.cmd_pre_config(32'd0),.cmd_pre_sequence(64'd0),.cmd_pre_source(16'd0),
 .rsp_valid(rv),.rsp_ready(rr),.rsp_accepted(accepted),.rsp_reason(reason),.rsp_slot(rs),.rsp_sequence(rseq),.rsp_generation(rgen),
 .write_slot(ws),.write_sequence(wseq),.write_generation(wgen),.write_source(wsrc),.write_permit(wp),
 .desc_valid(dv),.desc_ready(dr),.desc_sequence(ds),.desc_generation(dg),.desc_slot(dslot),.desc_mask(mask),.desc_count(count),
 .done_valid(done),.done_ready(done_ready),.done_sequence(done_seq),.done_generation(done_gen),
 .requests(requests),.reserved(reserved),.committed(committed),.aborted(aborted),.rejected(rejected),.consumed(consumed),
 .discarded(discarded),.canceled(canceled),.resident(resident),.pending_total(pending_total),.bad_done(bad_done));
 integer commands=0,descriptors=0,cycle=0,j,k,fd;reg [SW-1:0] last_slot;
 reg [63:0] last_gen,old_gen,old_seq,new_deadline;reg [N-1:0] expected_mask;
 reg [63:0] expected_reserved=0,expected_committed=0,expected_aborted=0,expected_rejected=0;
 reg held=0;reg [N+63+64+SW+9:0] held_descriptor;
 always @(posedge clk)begin
  cycle=cycle+1;if(cycle>30000)$fatal(1,"timeout");
  if(rst_n && !cfg_valid && held && (!dv || {ds,dg,dslot,mask,count}!==held_descriptor))$fatal(1,"descriptor changed under backpressure");
  held=dv&&!dr;held_descriptor={ds,dg,dslot,mask,count};
 end
 task automatic install(input [31:0] e,c,input [63:0] b,dl,n,input [31:0] p);
  begin
   @(negedge clk);cfg_epoch=e;cfg_config=c;first_sequence=b;first_deadline=dl;blocks=n;cfg_period=p;cfg_valid=1;
   do @(posedge clk);while(!cfg_ready);
   @(negedge clk);cfg_valid=0;ce=e;cc=c;held=0;
   repeat(D+2)@(negedge clk);
   if(cfg_fault || !active)$fatal(1,"configuration rejected");
  end
 endtask
 task automatic command(input [1:0] operation,input [63:0] b,input integer source,
  input [SW-1:0] s,input [63:0] g,input [3:0] expected,input bit stall_reply);
  reg [132+SW:0] saved;begin
   @(negedge clk);op=operation;seq=b;src=source;slot=s;gen=g;cv=1;rr=!stall_reply;
   do @(posedge clk);while(!cr);
   #1;if(!rv || reason!==expected || accepted!==(expected==0) || rseq!==b)$fatal(1,"cmd %0d op=%0d source=%0d got=%0d expected=%0d",commands,operation,source,reason,expected);
   commands=commands+1;last_slot=rs;last_gen=rgen;saved={accepted,reason,rs,rseq,rgen};
   if(expected!=0)expected_rejected=expected_rejected+1;
   else case(operation)0:expected_reserved=expected_reserved+1;1:expected_committed=expected_committed+1;2:expected_aborted=expected_aborted+1;endcase
   @(negedge clk);cv=0;
   if(stall_reply)begin
    repeat(3)begin @(posedge clk);#1;if(!rv || {accepted,reason,rs,rseq,rgen}!==saved)$fatal(1,"reply unstable");end
    @(negedge clk);rr=1;
   end
   @(posedge clk);#1;
  end
 endtask
 task automatic check_write(input [63:0] b,input integer source,input [SW-1:0] s,input [63:0] g,input bit allowed);
  begin @(negedge clk);wseq=b;wsrc=source;ws=s;wgen=g;#1;if(wp!==allowed)$fatal(1,"write permission mismatch");end
 endtask
 task automatic consume_descriptor(input [63:0] b,input [N-1:0] bitmap,input integer n);
  reg [63:0] saved_gen;begin
   while(!dv)@(negedge clk);
   if(ds!==b || mask!==bitmap || count!==n)$fatal(1,"descriptor mismatch seq=%h expected=%h count=%0d expected=%0d",ds,b,count,n);
   saved_gen=dg;descriptors=descriptors+1;
   @(negedge clk);dr=1;@(posedge clk);@(negedge clk);dr=0;
   repeat(2)@(negedge clk);done=1;done_seq=b;done_gen=saved_gen;
   do @(posedge clk);while(!done_ready);
   @(negedge clk);done=0;
  end
 endtask
 initial begin
  repeat(35)@(negedge clk);rst_n=1;
  install(7,11,BASE,PERIOD,30,PERIOD);
  command(0,BASE,0,0,0,0,1);old_gen=last_gen;
  check_write(BASE,0,0,old_gen,1);
  command(0,BASE,0,0,0,5,0); // pending duplicate
  command(1,BASE,0,0,old_gen,0,0);check_write(BASE,0,0,old_gen,0);
  command(1,BASE,0,0,old_gen,6,0);command(0,BASE,0,0,0,5,0);
  command(0,BASE,1,0,0,0,0);command(2,BASE,1,0,old_gen,0,0);
  command(0,BASE,1,0,0,0,0);command(1,BASE,1,0,old_gen,0,0);
  for(j=2;j<N;j=j+1)begin command(0,BASE,j,0,0,0,0);command(1,BASE,j,0,old_gen,0,0);end
  // Head is complete but consumer blocked: future arrivals must not alter its mask.
  command(0,BASE+1,5,0,0,0,0);command(1,BASE+1,5,1,old_gen+1,1,0);
  command(2,BASE+1,5,1,old_gen,0,0);command(0,BASE+1,5,0,0,0,0);command(1,BASE+1,5,1,old_gen,0,0);
  command(0,BASE+1,6,0,0,0,0);
  consume_descriptor(BASE,{N{1'b1}},N);
  @(negedge clk);now_tick=2*PERIOD;
  command(0,BASE+1,9,0,0,3,0);check_write(BASE+1,6,1,old_gen,0);
  expected_mask=0;expected_mask[5]=1;consume_descriptor(BASE+1,expected_mask,1);
  command(0,BASE+12,0,0,0,4,0);command(0,BASE,0,0,0,3,0);command(0,BASE+2,256,0,0,2,0);
  // Physical slot zero has been recycled for sequence BASE+10.
  command(0,BASE+10,0,0,0,0,0);check_write(BASE,0,0,old_gen,0);
  command(1,BASE,0,0,old_gen,3,0);command(1,BASE+10,0,0,old_gen,0,0);
  for(j=2;j<=10;j=j+1)begin
   @(negedge clk);now_tick=(j+1)*PERIOD;expected_mask=0;if(j==10)expected_mask[0]=1;
   consume_descriptor(BASE+j,expected_mask,j==10?1:0);
  end
  command(0,BASE+11,7,0,0,0,0);command(0,BASE+12,8,0,0,0,0);command(1,BASE+12,8,2,old_gen,0,0);
  new_deadline=now_tick+1000;install(8,12,NEW_BASE,new_deadline,2,1000);
  command(1,BASE+11,7,1,old_gen,1,0);
  @(negedge clk);done=1;done_seq=BASE+10;done_gen=old_gen;
  @(posedge clk);@(negedge clk);done=0;if(bad_done!=1)$fatal(1,"stale consumer done not counted");
  command(0,NEW_BASE,3,0,0,0,0);old_gen=last_gen;check_write(NEW_BASE,3,0,old_gen,1);
  // Even deliberately repeated epoch/config/sequence cannot revalidate an old handle.
  install(8,12,NEW_BASE,new_deadline,2,1000);check_write(NEW_BASE,3,0,old_gen,0);
  command(1,NEW_BASE,3,0,old_gen,1,0);old_gen=generation;
  command(0,NEW_BASE,4,0,0,0,0);
  @(negedge clk);now_tick=new_deadline;
  command(1,NEW_BASE,4,0,old_gen,3,0); // exact-deadline commit must fail
  command(0,NEW_BASE+1,5,0,0,0,0);command(2,NEW_BASE+1,5,1,old_gen,0,0);
  consume_descriptor(NEW_BASE,0,0);
  @(negedge clk);now_tick=new_deadline+1000;consume_descriptor(NEW_BASE+1,0,0);
  command(0,NEW_BASE+2,0,0,0,7,0);
  if(reserved!==expected_reserved || committed!==expected_committed || aborted!==expected_aborted || rejected!==expected_rejected)$fatal(1,"counter/oracle mismatch");
  if(requests!==reserved+committed+aborted+rejected || reserved!==committed+aborted+canceled+pending_total || committed!==consumed+discarded+resident)$fatal(1,"accounting failed");
  if(committed!=259 || consumed!=258 || discarded!=1 || canceled!=4 || pending_total!=0 || resident!=0 || descriptors!=13)$fatal(1,"end state mismatch");
  fd=$fopen(`AF_CONTROL_PASS,"w");$fwrite(fd,"PASS sources=%0d slots=%0d commands=%0d descriptors=%0d committed=%0d consumed=%0d discarded=%0d canceled=%0d\n",N,D,commands,descriptors,committed,consumed,discarded,canceled);$fclose(fd);
  $display("AF_CONTROL_PASS commands=%0d descriptors=%0d",commands,descriptors);$finish;
 end
endmodule
