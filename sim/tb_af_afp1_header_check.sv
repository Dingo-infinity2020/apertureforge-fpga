`timescale 1ns/1ps
`include "af_header_config.svh"
module tb_af_afp1_header_check;
 reg clk=0;always #2 clk=~clk;
 reg rst_n=0;reg [511:0] input_header;reg valid=0;wire ready;
 reg out_ready=0;wire [511:0] output_header;wire [7:0] errors;wire out_valid;
 wire [31:0] epoch=ready?32'd7:32'd999; // config changes under stall must not change captured result
 af_afp1_header_check dut(.clk(clk),.rst_n(rst_n),.s_header(input_header),.s_valid(valid),.s_ready(ready),
 .cfg_epoch(epoch),.cfg_config(32'd11),.cfg_destination(16'd3),.cfg_frequencies(16'd32),.cfg_first_frequency(32'd96),
 .cfg_adc_stride(32'd65536),.cfg_epoch_adc(64'd9007199254740993),.cfg_t_log2(2'd1),
 .m_header(output_header),.m_errors(errors),.m_valid(out_valid),.m_ready(out_ready));
 reg [511:0] headers [0:`AF_HEADER_COUNT-1];reg [7:0] expected [0:`AF_HEADER_COUNT-1];
 integer sent=0,received=0,cycles=0,stalls=0,file_handle;reg input_fired=0;
 reg held=0;reg [519:0] held_value;
 initial begin
  $readmemh(`AF_HEADERS,headers);$readmemh(`AF_ERRORS,expected);
  repeat(35)@(negedge clk);rst_n=1;
 end
 always @(negedge clk)begin
  if(rst_n)begin
   out_ready=(cycles%7>=3);
   if(!valid || input_fired)begin
    valid=(sent<`AF_HEADER_COUNT)&&(cycles%5!=1);
    input_header=sent<`AF_HEADER_COUNT?headers[sent]:512'd0;
   end
  end
 end
 always @(posedge clk)begin
  if(rst_n)begin
   cycles=cycles+1;
   if(held && (!out_valid || {errors,output_header}!==held_value))$fatal(1,"output changed under stall");
   if(out_valid&&out_ready)begin
    if(received>=sent)$fatal(1,"unexpected output");
    if(errors!==expected[received]||output_header!==headers[received])$fatal(1,"case %0d got %h expected %h",received,errors,expected[received]);
    received=received+1;
   end
   input_fired=valid&&ready;if(input_fired)sent=sent+1;
   held=out_valid&&!out_ready;held_value={errors,output_header};if(held)stalls=stalls+1;
   if(received==`AF_HEADER_COUNT)begin
    if(stalls==0)$fatal(1,"stall coverage missing");
    file_handle=$fopen(`AF_PASS_FILE,"w");$fwrite(file_handle,"PASS cases=%0d cycles=%0d stalls=%0d\n",received,cycles,stalls);$fclose(file_handle);
    $display("AF_HEADER_PASS cases=%0d cycles=%0d stalls=%0d",received,cycles,stalls);$finish;
   end
   if(cycles>2000)$fatal(1,"timeout");
  end
 end
endmodule
