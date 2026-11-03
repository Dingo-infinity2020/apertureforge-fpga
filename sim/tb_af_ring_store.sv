`timescale 1ns/1ps
`include "af_store_config.svh"
module tb_af_ring_store;
 localparam integer WORDS=`AF_STORE_WORDS, AW=$clog2(WORDS);
 reg clk=0;always #2 clk=~clk;
 reg rst_n=0,wv=0,rv=0,mr=0;reg [AW-1:0] wa=0,ra=0;reg [511:0] wd=0;
 wire wr,rr,mv,collision;wire [511:0] md;
 af_ring_store #(.WORDS(WORDS)) dut(.clk(clk),.rst_n(rst_n),.w_valid(wv),.w_address(wa),.w_data(wd),.w_ready(wr),
 .r_valid(rv),.r_address(ra),.r_ready(rr),.m_valid(mv),.m_ready(mr),.m_data(md),.collision(collision));
 function automatic [511:0] pattern(input integer a);
  integer lane;begin for(lane=0;lane<16;lane=lane+1)pattern[32*lane+:32]=(a*32'h1f123bb5)^(32'hdeadbeef+lane*32'h01020305);end
 endfunction
 integer i,cycle=0,sent=0,received=0,stalls=0,collisions=0,fd;
 reg held=0;reg [511:0] old_data;reg streaming=0;
 initial begin
  // glbl.GSR remains active for 100ns in Xilinx netlist simulation.
  // Do not initialize memory while its primitive is still in startup reset.
  repeat(35)@(negedge clk);rst_n=1;
  // Initialize EVERY address in the full-size memory with independently checkable data.
  for(i=0;i<WORDS;i=i+1)begin
   @(negedge clk);wv=1;wa=i;wd=pattern(i);
   @(posedge clk);if(!wr)$fatal(1,"unexpected write refusal");
  end
  @(negedge clk);wv=0;rv=1;ra=0;mr=0;
  repeat(3)@(negedge clk);
  // Reset with unread pipeline data; stale valid must not escape afterwards.
  rst_n=0;rv=0;repeat(2)@(negedge clk);
  if(mv)$fatal(1,"reset did not clear valid");
  rst_n=1;streaming=1;
 end
 always @(negedge clk)if(streaming)begin
  mr=(cycle%11>=3);rv=sent<WORDS;ra=sent;
  // Same-address collision must refuse ONLY the read; write the identical value.
  wv=rv && (cycle%17==0);wa=ra;wd=pattern(sent);
 end
 always @(posedge clk)if(streaming)begin
  cycle=cycle+1;
  if(held && (!mv || md!==old_data))$fatal(1,"output unstable under stall");
  if(collision)begin collisions=collisions+1;if(rr)$fatal(1,"collision read accepted");end
  if(rv&&rr)sent=sent+1;
  if(mv&&mr)begin
   if(received>=sent || md!==pattern(received))$fatal(1,"data mismatch at %0d",received);
   received=received+1;
  end
  held=mv&&!mr;old_data=md;if(held)stalls=stalls+1;
  if(received==WORDS)begin
   if(!stalls || !collisions)$fatal(1,"missing conflict/stall coverage");
   fd=$fopen(`AF_STORE_PASS,"w");
   $fwrite(fd,"PASS words=%0d read_cycles=%0d stalls=%0d collisions=%0d\n",WORDS,cycle,stalls,collisions);$fclose(fd);
   $display("AF_STORE_PASS words=%0d read_cycles=%0d stalls=%0d collisions=%0d",WORDS,cycle,stalls,collisions);$finish;
  end
  if(cycle>WORDS*3)$fatal(1,"timeout");
 end
endmodule
