`timescale 1ns/1ps
`include "m4_reader_config.svh"
module tb_af_science_reader;
 localparam integer SOURCES=256,WORDS=10,TOTAL=SOURCES*WORDS,SW=4,WW=$clog2(WORDS),CW=$clog2(SOURCES+1),AW=$clog2(TOTAL);
 reg clk=0;always #2 clk=~clk;
 reg rst_n=0;
 reg desc_valid=0;wire desc_ready;reg [63:0] desc_sequence=0,desc_generation=0;reg [SW-1:0] desc_slot=0;
 reg [SOURCES-1:0] desc_mask=0;reg [CW-1:0] desc_count=0;
 wire block_valid;reg block_ready=1;wire [63:0] block_sequence,block_generation;wire [SW-1:0] block_slot;
 wire [SOURCES-1:0] block_mask;wire [CW-1:0] block_count;
 wire read_valid,read_ready;wire [SW-1:0] read_slot;wire [15:0] read_source;wire [WW-1:0] read_word;
 wire data_valid,data_ready;wire [511:0] data_in;
 wire sample_valid;reg sample_ready=1;wire [511:0] sample_data;wire [15:0] sample_source;wire [WW-1:0] sample_word;
 wire [63:0] sample_sequence,sample_generation;wire [SW-1:0] sample_slot;
 wire done_valid;reg done_ready=1;wire [63:0] done_sequence,done_generation;
 wire [63:0] read_requests,data_beats,sample_beats,skipped_sources,busy_cycles,backpressure_cycles;
 reg w_valid=0;reg [AW-1:0] w_address=0;reg [511:0] w_data=0;wire w_ready;
 wire r_valid;wire r_ready;wire [AW-1:0] r_address=((read_slot*SOURCES)+read_source)*WORDS+read_word;
 wire collision;
 af_ring_store #(.WORDS(TOTAL)) store(.clk(clk),.rst_n(rst_n),.w_valid(w_valid),.w_address(w_address),.w_data(w_data),.w_ready(w_ready),
  .r_valid(r_valid),.r_address(r_address),.r_ready(r_ready),.m_valid(data_valid),.m_ready(data_ready),.m_data(data_in),.collision(collision));
 af_science_reader #(.SOURCES(SOURCES),.WORDS(WORDS),.SLOT_W(SW)) dut(.clk(clk),.rst_n(rst_n),
  .desc_valid(desc_valid),.desc_ready(desc_ready),.desc_sequence(desc_sequence),.desc_generation(desc_generation),.desc_slot(desc_slot),.desc_mask(desc_mask),.desc_count(desc_count),
  .block_valid(block_valid),.block_ready(block_ready),.block_sequence(block_sequence),.block_generation(block_generation),.block_slot(block_slot),.block_mask(block_mask),.block_count(block_count),
  .read_valid(read_valid),.read_ready(read_ready),.read_slot(read_slot),.read_source(read_source),.read_word(read_word),
  .data_valid(data_valid),.data_ready(data_ready),.data_in(data_in),
  .sample_valid(sample_valid),.sample_ready(sample_ready),.sample_data(sample_data),.sample_source(sample_source),.sample_word(sample_word),.sample_sequence(sample_sequence),.sample_generation(sample_generation),.sample_slot(sample_slot),
  .done_valid(done_valid),.done_ready(done_ready),.done_sequence(done_sequence),.done_generation(done_generation),
  .read_requests(read_requests),.data_beats(data_beats),.sample_beats(sample_beats),.skipped_sources(skipped_sources),.busy_cycles(busy_cycles),.backpressure_cycles(backpressure_cycles));
 assign r_valid=read_valid;assign read_ready=r_ready;
 integer cycles=0,got_samples=0,got_reads=0,start_cycle=0,block_cycles=0;
 reg [SOURCES-1:0] exp_mask=0;reg [63:0] exp_seq=0,exp_gen=0;integer exp_count=0;
 reg bp_mode=0;integer bp_phase=0;
 always @(negedge clk)begin
  bp_phase=bp_phase+1;
  sample_ready=bp_mode?((bp_phase%32)<25):1'b1;
 end
 always @(posedge clk)begin
  cycles=cycles+1;
  if(r_valid&&r_ready)begin
   got_reads=got_reads+1;
   if(read_source>=SOURCES || read_word>=WORDS || !exp_mask[read_source])$fatal(1,"invalid read src=%0d word=%0d",read_source,read_word);
  end
  if(sample_valid&&sample_ready)begin
   got_samples=got_samples+1;
   if(!exp_mask[sample_source])$fatal(1,"sample from missing source %0d",sample_source);
   if(sample_data[31:0]!==(sample_source*WORDS+sample_word))$fatal(1,"data mismatch src=%0d word=%0d got=%h",sample_source,sample_word,sample_data[31:0]);
   if(sample_sequence!==exp_seq || sample_generation!==exp_gen || sample_slot!==0)$fatal(1,"metadata mismatch");
  end
  if(done_valid&&done_ready)begin
   block_cycles=cycles-start_cycle;
   if(done_sequence!==exp_seq || done_generation!==exp_gen)$fatal(1,"done metadata mismatch");
  end
 end
 task automatic preload;
  integer i;
  begin
   for(i=0;i<TOTAL;i=i+1)begin
    @(negedge clk);w_valid=1;w_address=i[AW-1:0];w_data={480'd0,i[31:0]};
    @(posedge clk);while(!w_ready)@(posedge clk);
   end
   @(negedge clk);w_valid=0;
  end
 endtask
 task automatic run_block(input [SOURCES-1:0] mask,input integer count,input [63:0] seq,gen,input bit bp);
  integer read_before,sample_before,skip_before;
  begin
   exp_mask=mask;exp_count=count;exp_seq=seq;exp_gen=gen;got_samples=0;got_reads=0;bp_mode=bp;
   read_before=read_requests;sample_before=sample_beats;skip_before=skipped_sources;
   @(negedge clk);desc_valid=1;desc_sequence=seq;desc_generation=gen;desc_slot=0;desc_mask=mask;desc_count=count;
   do @(posedge clk);while(!desc_ready);
   @(negedge clk);desc_valid=0;start_cycle=cycles;
   do @(posedge clk);while(!(done_valid&&done_ready));
   @(negedge clk);bp_mode=0;
   if(got_samples!=count*WORDS || got_reads!=count*WORDS)$fatal(1,"count mismatch samples=%0d reads=%0d expected=%0d",got_samples,got_reads,count*WORDS);
   if(read_requests-read_before!=count*WORDS || sample_beats-sample_before!=count*WORDS)$fatal(1,"adapter count mismatch");
   if(block_mask!==mask || block_count!==count)$fatal(1,"block header mismatch");
   if(bp && backpressure_cycles==0)$fatal(1,"backpressure mode did not stall");
   $display("AF_READER_BLOCK seq=%0d count=%0d cycles=%0d reads=%0d samples=%0d skipped_total=%0d bp=%0d",seq,count,block_cycles,got_reads,got_samples,skipped_sources,backpressure_cycles);
  end
 endtask
 task automatic reset_mid_block;
  reg [SOURCES-1:0] tiny;
  begin
   exp_mask={SOURCES{1'b1}};exp_count=SOURCES;exp_seq=64'd77;exp_gen=64'd6;got_samples=0;got_reads=0;
   @(negedge clk);desc_valid=1;desc_sequence=64'd77;desc_generation=64'd6;desc_slot=0;desc_mask={SOURCES{1'b1}};desc_count=SOURCES;
   do @(posedge clk);while(!desc_ready);
   @(negedge clk);desc_valid=0;
   while(got_samples<12)@(posedge clk);
   rst_n=0;repeat(5)@(negedge clk);rst_n=1;repeat(5)@(negedge clk);
   if(done_valid)$fatal(1,"done asserted after reset");
   tiny=0;tiny[5]=1;tiny[6]=1;
   run_block(tiny,2,64'd78,64'd7,0);
   if(skipped_sources!=5)$fatal(1,"post-reset skip expected 5 got %0d",skipped_sources);
  end
 endtask
 initial begin
  repeat(5)@(negedge clk);rst_n=1;preload;repeat(3)@(negedge clk);
  run_block({SOURCES{1'b1}},SOURCES,64'd42,64'd5,0);
  begin
   reg [SOURCES-1:0] missing;missing=0;missing[3]=1;missing[7]=1;missing[200]=1;missing[255]=1;
   run_block(missing,4,64'd43,64'd5,0);
   if(skipped_sources!=252)$fatal(1,"missing skip expected 252 got %0d",skipped_sources);
  end
  run_block({SOURCES{1'b1}},SOURCES,64'd44,64'd5,1);
  reset_mid_block;
  begin
   integer fd;fd=$fopen(`M4_READER_PASS,"w");
   $fwrite(fd,"PASS full_samples=%0d missing_samples=%0d backpressure_samples=%0d reset_samples=%0d cycles=%0d\n",2560,40,2560,20,cycles);
   $fclose(fd);
  end
  $finish;
 end
endmodule
