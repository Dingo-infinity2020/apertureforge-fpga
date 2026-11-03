`timescale 1ns/1ps
`include "af_control_time_config.svh"
module tb_af_ring_control_time;
 reg clk=0;always #2 clk=~clk;
 reg rst_n=0,cfg_valid=0;wire cfg_ready,active,fault;wire [63:0] generation;
 reg [63:0] tick=64'h8000000000000100,first_seq,first_deadline,blocks;
 reg [31:0] period;reg cv=0;wire cr,rv,accepted;wire [3:0] reason;
 reg [1:0] op;reg [63:0] seq,gen;wire [63:0] rg;wire [3:0] slot;
 wire dv;reg dr=0,done=0;wire done_ready;wire [63:0] ds,dg;wire [255:0] mask;
 wire [8:0] count;wire [63:0] committed,consumed;integer fd,cycles=0;
 af_ring_control #(.PREVIEW(0)) dut(.clk(clk),.rst_n(rst_n),.now_tick(tick),.cfg_valid(cfg_valid),.cfg_ready(cfg_ready),
 .cfg_epoch(32'd1),.cfg_config(32'd2),.cfg_period_ticks(period),.cfg_first_sequence(first_seq),.cfg_first_deadline(first_deadline),.cfg_blocks(blocks),
 .active(active),.cfg_fault(fault),.generation(generation),
 .cmd_valid(cv),.cmd_ready(cr),.cmd_op(op),.cmd_epoch(32'd1),.cmd_config(32'd2),.cmd_sequence(seq),.cmd_generation(gen),.cmd_source(16'd0),.cmd_slot(4'd0),
 .cmd_pre_valid(1'b0),.cmd_pre_epoch(32'd0),.cmd_pre_config(32'd0),.cmd_pre_sequence(64'd0),.cmd_pre_source(16'd0),
 .rsp_valid(rv),.rsp_ready(1'b1),.rsp_accepted(accepted),.rsp_reason(reason),.rsp_slot(slot),.rsp_generation(rg),
 .write_slot(4'd0),.write_sequence(64'd0),.write_generation(64'd0),.write_source(16'd0),
 .desc_valid(dv),.desc_ready(dr),.desc_sequence(ds),.desc_generation(dg),.desc_mask(mask),.desc_count(count),
 .done_valid(done),.done_ready(done_ready),.done_sequence(ds),.done_generation(dg),.committed(committed),.consumed(consumed));
 always @(posedge clk)begin cycles=cycles+1;if(cycles>1000)$fatal(1,"time edge timeout");end
 task automatic configure(input [63:0] s,d,n,input [31:0] p,input bit bad);
  begin
   @(negedge clk);first_seq=s;first_deadline=d;blocks=n;period=p;cfg_valid=1;
   do @(posedge clk);while(!cfg_ready);
   @(negedge clk);cfg_valid=0;repeat(12)@(negedge clk);
   if(fault!==bad || active===bad)$fatal(1,"overflow configuration status mismatch");
  end
 endtask
 initial begin
  repeat(35)@(negedge clk);rst_n=1;
  configure(64'hffffffffffffffff,tick+100,2,10,1); // sequence range overflows
  configure(0,tick+100,0,10,1);configure(0,tick+100,1,0,1);
  configure(0,64'hfffffffffffffff5,2,20,1); // second initial deadline overflows
  configure(64'hffffffffffffffff,tick+100,1,10,0); // final protocol sequence itself is legal
  @(negedge clk);op=0;seq=64'hffffffffffffffff;gen=0;cv=1;
  do @(posedge clk);while(!cr);
  #1;if(!rv || !accepted || reason!=0 || slot!=0)$fatal(1,"maximum sequence reserve rejected");gen=rg;
  @(negedge clk);cv=0;@(posedge clk);@(negedge clk);op=1;cv=1;
  do @(posedge clk);while(!cr);
  #1;if(!rv || !accepted)$fatal(1,"maximum sequence commit rejected");
  @(negedge clk);cv=0;tick=first_deadline; // exact deadline ABOVE 2^63
  while(!dv)@(negedge clk);
  if(ds!==64'hffffffffffffffff || mask!==256'd1 || count!=1)$fatal(1,"64-bit deadline/mask mismatch");
  dr=1;@(posedge clk);@(negedge clk);dr=0;done=1;
  do @(posedge clk);while(!done_ready);
  @(negedge clk);done=0;
  if(active || committed!=1 || consumed!=1 || fault)$fatal(1,"end of sequence wrapped or accounting failed");
  fd=$fopen(`AF_CONTROL_TIME_PASS,"w");$fwrite(fd,"PASS invalid_configs=4 max_sequence=PASS deadline_above_2p63=PASS\n");$fclose(fd);
  $display("AF_CONTROL_TIME_PASS");$finish;
 end
endmodule
