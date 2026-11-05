`timescale 1ns/1ps
`include "af_core_config.svh"
module tb_af_ring_preview;
 reg clk=0;always #2 clk=~clk;
 reg rst_n=0,cfg=0;wire cfg_ready,active,fault;wire [63:0] generation;
 reg [31:0] epoch=7,config_id=11;reg [63:0] first=100,deadline=1000,tick=100;
 reg cv=0,pv=0,rr=1;wire cr,rv,accepted;reg [1:0] op=0;
 reg [31:0] ce=7,cc=11,pe=7,pc=11;reg [63:0] seq=100,pseq=100,gen=0;
 reg [15:0] src=255,psrc=255;reg [3:0] slot=0;wire [3:0] reason,rs;
 wire [63:0] rseq,rgen,requests,reserved,committed,aborted,rejected,consumed,discarded,canceled,resident,pending;
 wire dv;reg dr=0,done=0;wire done_ready;wire [63:0] ds,dg;wire [255:0] mask;wire [8:0] count;
 integer cycles=0,commands=0,fd;reg [132+4:0] held;
 af_ring_control dut(.clk(clk),.rst_n(rst_n),.now_tick(tick),.cfg_valid(cfg),.cfg_ready(cfg_ready),
 .cfg_epoch(epoch),.cfg_config(config_id),.cfg_period_ticks(32'd1000),.cfg_first_sequence(first),
 .cfg_first_deadline(deadline),.cfg_blocks(64'd20),.active(active),.cfg_fault(fault),.generation(generation),
 .cmd_valid(cv),.cmd_ready(cr),.cmd_op(op),.cmd_epoch(ce),.cmd_config(cc),.cmd_sequence(seq),.cmd_generation(gen),.cmd_source(src),.cmd_slot(slot),
 .cmd_pre_valid(pv),.cmd_pre_epoch(pe),.cmd_pre_config(pc),.cmd_pre_sequence(pseq),.cmd_pre_source(psrc),
 .rsp_valid(rv),.rsp_ready(rr),.rsp_accepted(accepted),.rsp_reason(reason),.rsp_slot(rs),.rsp_sequence(rseq),.rsp_generation(rgen),
 .write_slot(4'd0),.write_sequence(64'd0),.write_generation(64'd0),.write_source(16'd0),
 .desc_valid(dv),.desc_ready(dr),.desc_sequence(ds),.desc_generation(dg),.desc_mask(mask),.desc_count(count),
 .done_valid(done),.done_ready(done_ready),.done_sequence(ds),.done_generation(dg),
 .requests(requests),.reserved(reserved),.committed(committed),.aborted(aborted),.rejected(rejected),
 .consumed(consumed),.discarded(discarded),.canceled(canceled),.resident(resident),.pending_total(pending));
 always @(posedge clk)begin cycles=cycles+1;if(cycles>2000)$fatal(1,"preview protocol timeout");end
 task automatic install;
  begin
   @(negedge clk);cfg=1;do @(posedge clk);while(!cfg_ready);
   @(negedge clk);cfg=0;repeat(12)@(negedge clk);
   if(!active || fault)$fatal(1,"preview configuration failed");
  end
 endtask
 task automatic command(input [1:0] operation,input [3:0] expected,input [3:0] expected_slot);
  begin
   @(negedge clk);op=operation;cv=1;
   do @(posedge clk);while(!cr);
   #1;
   if(!rv || reason!==expected || accepted!==(expected==0) || rseq!==seq || (expected==0 && rs!==expected_slot))
    $fatal(1,"preview command %0d op=%0d src=%0d reason=%0d expected=%0d slot=%0d",commands,operation,src,reason,expected,rs);
   commands=commands+1;
   // Release at the next negative edge: no extra idle cycle between requests.
   @(negedge clk);cv=0;
  end
 endtask
 initial begin
  repeat(35)@(negedge clk);rst_n=1;install();pv=1;
  command(0,0,0);gen=rgen;
  command(0,5,0); // immediate duplicate must see the previous pending update
  command(1,0,0);command(0,5,0); // immediate duplicate must see present
  @(negedge clk);src=0;op=0;cv=1; // keep preview at 255, so source identity is stale
  repeat(3)begin @(posedge clk);#1;if(cr)$fatal(1,"mismatched preview admitted");end
  @(negedge clk);cv=0;psrc=0;
  command(0,0,0);command(2,0,0);
  src=256;psrc=256;command(0,2,0);
  src=65535;psrc=65535;command(0,2,0);
  src=1;psrc=1;repeat(4)@(negedge clk);tick=1000;
  command(0,3,0); // warm preview crossing the exact deadline
  if(!dv || count!=1 || mask!==({256{1'b0}} | (256'b1<<255)))$fatal(1,"preview deadline mask");
  @(negedge clk);dr=1;@(posedge clk);@(negedge clk);dr=0;done=1;
  do @(posedge clk);while(!done_ready);
  @(negedge clk);done=0;seq=101;pseq=101;
  command(0,0,1);slot=1;command(2,0,1);
  // Config switch with both preview stages populated must invalidate both.
  epoch=8;config_id=12;first=200;deadline=4000;install();
  command(0,1,0); // old epoch/config remain on both request/preview
  ce=8;cc=12;seq=200;src=1;op=0;cv=1;
  repeat(3)begin @(posedge clk);#1;if(cr)$fatal(1,"old session preview admitted new command");end
  @(negedge clk);cv=0;pe=8;pc=12;pseq=200;psrc=1;rr=0;
  command(0,0,0);gen=rgen;slot=0;held={accepted,reason,rs,rseq,rgen};
  repeat(3)begin @(posedge clk);#1;if(!rv || {accepted,reason,rs,rseq,rgen}!==held)$fatal(1,"preview response unstable");end
  @(negedge clk);rr=1;command(0,5,0);command(2,0,0);
  @(negedge clk);
  if(requests!=reserved+committed+aborted+rejected || reserved!=committed+aborted+canceled+pending || committed!=consumed+discarded+resident)
   $fatal(1,"preview conservation failed");
  fd=$fopen(`AF_CORE_PREVIEW_PASS,"w");$fwrite(fd,"PASS commands=%0d pending=%0d resident=%0d\n",commands,pending,resident);$fclose(fd);
  $display("AF_PREVIEW_PASS commands=%0d",commands);$finish;
 end
endmodule
