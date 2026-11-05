// M4-01 shared descriptor/read/data/done adapter for the committed raw ring.
// Present-source samples only; block_mask/block_count tell downstream which sources are zero.
module af_science_reader #(
 parameter integer SOURCES=256,WORDS=10,SLOT_W=4,
 parameter integer WW=$clog2(WORDS),CW=$clog2(SOURCES+1),
 parameter integer TAG_DEPTH=8,TW=$clog2(TAG_DEPTH)
)(
 input wire clk,rst_n,
 input wire desc_valid,output wire desc_ready,
 input wire [63:0] desc_sequence,desc_generation,
 input wire [SLOT_W-1:0] desc_slot,input wire [SOURCES-1:0] desc_mask,input wire [CW-1:0] desc_count,
 output reg block_valid,input wire block_ready,
 output reg [63:0] block_sequence,block_generation,
 output reg [SLOT_W-1:0] block_slot,output reg [SOURCES-1:0] block_mask,output reg [CW-1:0] block_count,
 output reg read_valid,input wire read_ready,
 output reg [SLOT_W-1:0] read_slot,output reg [15:0] read_source,output reg [WW-1:0] read_word,
 input wire data_valid,output wire data_ready,input wire [511:0] data_in,
 output reg sample_valid,input wire sample_ready,
 output reg [511:0] sample_data,output reg [15:0] sample_source,output reg [WW-1:0] sample_word,
 output reg [63:0] sample_sequence,sample_generation,output reg [SLOT_W-1:0] sample_slot,
 output reg done_valid,input wire done_ready,output reg [63:0] done_sequence,done_generation,
 output reg [63:0] read_requests,data_beats,sample_beats,skipped_sources,busy_cycles,backpressure_cycles
);
 localparam IDLE=0,HEADER=1,RUN=2,DRAIN=3,DONE=4;
 reg [2:0] state;
 reg [15:0] source_index;
 reg [WW-1:0] word_index;
 reg [CW-1:0] remaining_sources;
 reg [SOURCES-1:0] mask_q;
 reg [SLOT_W-1:0] slot_q;
 reg [63:0] sequence_q,generation_q;
 reg [15:0] tag_source [0:TAG_DEPTH-1];
 reg [WW-1:0] tag_word [0:TAG_DEPTH-1];
 reg [63:0] tag_sequence [0:TAG_DEPTH-1],tag_generation [0:TAG_DEPTH-1];
 reg [SLOT_W-1:0] tag_slot [0:TAG_DEPTH-1];
 reg [TW-1:0] tag_wr,tag_rd;
 reg [TW:0] tag_count;
 wire tag_push=read_valid && read_ready;
 wire tag_pop=data_valid && data_ready;
 assign desc_ready=(state==IDLE) && block_ready;
 assign data_ready=(tag_count!=0) && (!sample_valid || sample_ready);
 always @* begin
  read_valid=(state==RUN) && (remaining_sources!=0) && mask_q[source_index] && (tag_count<TAG_DEPTH);
  read_slot=slot_q;read_source=source_index;read_word=word_index;
 end
 always @(posedge clk)begin
  if(!rst_n)begin
   state<=IDLE;source_index<=0;word_index<=0;remaining_sources<=0;mask_q<=0;slot_q<=0;sequence_q<=0;generation_q<=0;
   block_valid<=0;block_sequence<=0;block_generation<=0;block_slot<=0;block_mask<=0;block_count<=0;
   sample_valid<=0;sample_data<=0;sample_source<=0;sample_word<=0;sample_sequence<=0;sample_generation<=0;sample_slot<=0;
   done_valid<=0;done_sequence<=0;done_generation<=0;
   tag_wr<=0;tag_rd<=0;tag_count<=0;
   read_requests<=0;data_beats<=0;sample_beats<=0;skipped_sources<=0;busy_cycles<=0;backpressure_cycles<=0;
  end else begin
   if(state!=IDLE)busy_cycles<=busy_cycles+1;
   if(sample_valid && !sample_ready)backpressure_cycles<=backpressure_cycles+1;
   case({tag_push,tag_pop})2'b10:tag_count<=tag_count+1;2'b01:tag_count<=tag_count-1;default:begin end endcase
   if(sample_valid && sample_ready)sample_beats<=sample_beats+1;
   if(sample_valid && sample_ready)sample_valid<=0;
   if(data_valid && data_ready)begin
    sample_valid<=1;
    sample_data<=data_in;
    sample_source<=tag_source[tag_rd];sample_word<=tag_word[tag_rd];
    sample_sequence<=tag_sequence[tag_rd];sample_generation<=tag_generation[tag_rd];sample_slot<=tag_slot[tag_rd];
    tag_rd<=tag_rd+1;data_beats<=data_beats+1;
   end
   case(state)
    IDLE:if(desc_valid && desc_ready)begin
     mask_q<=desc_mask;slot_q<=desc_slot;sequence_q<=desc_sequence;generation_q<=desc_generation;
     block_mask<=desc_mask;block_slot<=desc_slot;block_sequence<=desc_sequence;block_generation<=desc_generation;block_count<=desc_count;
     block_valid<=1;source_index<=0;word_index<=0;remaining_sources<=desc_count;state<=HEADER;
    end
    HEADER:if(block_valid && block_ready)begin block_valid<=0;state<=RUN;end
    RUN:begin
     if(remaining_sources==0)state<=DRAIN;
     else if(!mask_q[source_index])begin
      skipped_sources<=skipped_sources+1;
      if(source_index==SOURCES-1)state<=DRAIN;else source_index<=source_index+1;
     end else if(tag_push)begin
      tag_source[tag_wr]<=source_index;tag_word[tag_wr]<=word_index;
      tag_sequence[tag_wr]<=sequence_q;tag_generation[tag_wr]<=generation_q;tag_slot[tag_wr]<=slot_q;
      tag_wr<=tag_wr+1;read_requests<=read_requests+1;
      if(word_index==WORDS-1)begin
       word_index<=0;
       if(remaining_sources==1)begin remaining_sources<=0;state<=DRAIN;end
       else begin remaining_sources<=remaining_sources-1;source_index<=source_index+1;end
      end else word_index<=word_index+1;
     end
    end
    DRAIN:if(tag_count==0 && !sample_valid && !data_valid)begin
     done_valid<=1;done_sequence<=sequence_q;done_generation<=generation_q;state<=DONE;
    end
    DONE:if(done_ready)begin done_valid<=0;state<=IDLE;end
    default:state<=IDLE;
   endcase
  end
 end
endmodule
