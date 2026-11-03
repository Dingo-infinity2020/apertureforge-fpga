// One synchronous processing-side receiver: real parser + transaction control + full raw RAM.
// Input IS stallable; non-stallable CMAC ingress/CDC and science consumers remain separate.
module af_receive_core #(
 parameter integer SLOTS=10,WORDS_PER_PACKET=10,SW=$clog2(SLOTS),WW=$clog2(WORDS_PER_PACKET+1),
 parameter integer WORDS=SLOTS*256*WORDS_PER_PACKET,AW=$clog2(WORDS)
)(
 input wire clk,rst_n,input wire [63:0] now_tick,
 input wire [511:0] s_data,input wire [63:0] s_keep,input wire s_valid,s_last,s_error,output wire s_ready,
 input wire cfg_valid,output wire cfg_ready,
 input wire [31:0] cfg_epoch,cfg_config,cfg_period_ticks,cfg_first_frequency,cfg_adc_stride,
 input wire [63:0] cfg_first_sequence,cfg_first_deadline,cfg_blocks,cfg_epoch_adc,
 input wire [15:0] cfg_destination,cfg_frequencies,input wire [1:0] cfg_t_log2,
 input wire [47:0] cfg_mac,input wire [31:0] cfg_ip,input wire [15:0] cfg_port,cfg_mtu,
 output wire active,cfg_fault,output wire [63:0] generation,
 output wire result_valid,input wire result_ready,output reg result_commit,result_write_fault,
 output reg [15:0] result_errors,result_source,output reg [3:0] result_reason,
 output reg [63:0] result_sequence,result_generation,
 output wire desc_valid,input wire desc_ready,output wire [63:0] desc_sequence,desc_generation,
 output wire [SW-1:0] desc_slot,output wire [255:0] desc_mask,output wire [8:0] desc_count,
 input wire read_valid,output wire read_ready,input wire [SW-1:0] read_slot,
 input wire [15:0] read_source,input wire [WW-1:0] read_word,
 output wire data_valid,input wire data_ready,output wire [511:0] data_out,
 input wire done_valid,output wire done_ready,input wire [63:0] done_sequence,done_generation,
 output wire [63:0] ring_requests,ring_reserved,ring_committed,ring_aborted,ring_rejected,
 output wire [63:0] ring_consumed,ring_discarded,ring_canceled,ring_resident,ring_pending,bad_done,
 output reg [63:0] words_written,writes_denied,results_committed,results_rejected,contexts_flushed
);
 localparam WAIT_HEADER=0,WAIT_RESERVE=1,PAYLOAD=2,REJECTED=3,WAIT_FINISH=4,RESULT=5;
 reg [2:0] state;reg result_pending;wire pipe_rst_n=rst_n && !cfg_valid;
 wire control_desc_valid,store_valid;
 assign result_valid=pipe_rst_n && result_pending;
 assign desc_valid=pipe_rst_n && control_desc_valid;
 assign data_valid=pipe_rst_n && store_valid;
 wire hv,pv,pl,fv,frsv,fc;wire [511:0] hh,pd,fh;wire [15:0] he,fe,fb,sb;wire [63:0] pk;
 reg hr,ha,pr,fr;reg cv,rr;wire cr,rv,ra;wire [3:0] reason;
 reg [1:0] op;reg [31:0] ce,cc;reg [63:0] cs,cg;reg [15:0] source;reg [SW-1:0] slot;
 wire [SW-1:0] reply_slot;wire [63:0] reply_seq,reply_gen;
 reg [31:0] tx_epoch,tx_config;reg [63:0] tx_seq,tx_gen;reg [15:0] tx_source;
 reg [SW-1:0] tx_slot;reg [WW-1:0] word_index;reg write_fault,finish_commit;reg [3:0] admission_reason;
 wire write_permit,store_wr,store_rr,collision,control_done_ready;
 wire [AW-1:0] write_address=((tx_slot*256)+tx_source)*WORDS_PER_PACKET+word_index;
 wire write_ok=state==PAYLOAD && write_permit && word_index<WORDS_PER_PACKET && (&pk) && store_wr;
 wire write_fire=pipe_rst_n && pv && pr && write_ok;
 reg consumer_live;reg [SW-1:0] consumer_slot;reg [63:0] consumer_seq,consumer_gen;reg [255:0] consumer_mask;
 reg [2:0] outstanding;
 wire read_allowed=consumer_live && read_slot==consumer_slot && read_source<256 && read_word<WORDS_PER_PACKET && consumer_mask[read_source];
 wire [AW-1:0] read_address=((read_slot*256)+read_source)*WORDS_PER_PACKET+read_word;
 assign read_ready=pipe_rst_n && read_allowed && store_rr;
 wire read_fire=read_valid && read_ready;
 wire drain_done=pipe_rst_n && outstanding==0 && !read_fire;
 assign done_ready=control_done_ready && drain_done;
 af_packet_parser parser(.clk(clk),.rst_n(pipe_rst_n),.s_data(s_data),.s_keep(s_keep),.s_valid(s_valid),.s_last(s_last),.s_error(s_error),.s_ready(s_ready),
  .cfg_epoch(cfg_epoch),.cfg_config(cfg_config),.cfg_first_frequency(cfg_first_frequency),.cfg_adc_stride(cfg_adc_stride),
  .cfg_destination(cfg_destination),.cfg_frequencies(cfg_frequencies),.cfg_t_log2(cfg_t_log2),.cfg_epoch_adc(cfg_epoch_adc),
  .cfg_mac(cfg_mac),.cfg_ip(cfg_ip),.cfg_port(cfg_port),.cfg_mtu(cfg_mtu),
  .h_valid(hv),.h_ready(hr),.h_accept(ha),.h_header(hh),.h_errors(he),
  .p_valid(pv),.p_ready(pr),.p_data(pd),.p_keep(pk),.p_last(pl),
  .f_valid(fv),.f_ready(fr),.f_reserved(frsv),.f_commit(fc),.f_errors(fe),.f_header(fh),.f_frame_bytes(fb),.f_science_bytes(sb));
 af_ring_control #(.SLOTS(SLOTS)) control(.clk(clk),.rst_n(rst_n),.now_tick(now_tick),.cfg_valid(cfg_valid),.cfg_ready(cfg_ready),
  .cfg_epoch(cfg_epoch),.cfg_config(cfg_config),.cfg_period_ticks(cfg_period_ticks),.cfg_first_sequence(cfg_first_sequence),
  .cfg_first_deadline(cfg_first_deadline),.cfg_blocks(cfg_blocks),.active(active),.cfg_fault(cfg_fault),.generation(generation),
  .cmd_valid(cv),.cmd_ready(cr),.cmd_op(op),.cmd_epoch(ce),.cmd_config(cc),.cmd_sequence(cs),.cmd_generation(cg),.cmd_source(source),.cmd_slot(slot),
  .rsp_valid(rv),.rsp_ready(rr),.rsp_accepted(ra),.rsp_reason(reason),.rsp_slot(reply_slot),.rsp_sequence(reply_seq),.rsp_generation(reply_gen),
  .write_slot(tx_slot),.write_sequence(tx_seq),.write_generation(tx_gen),.write_source(tx_source),.write_permit(write_permit),
  .desc_valid(control_desc_valid),.desc_ready(desc_ready && pipe_rst_n),.desc_sequence(desc_sequence),.desc_generation(desc_generation),.desc_slot(desc_slot),.desc_mask(desc_mask),.desc_count(desc_count),
  .done_valid(done_valid && drain_done),.done_ready(control_done_ready),.done_sequence(done_sequence),.done_generation(done_generation),
  .requests(ring_requests),.reserved(ring_reserved),.committed(ring_committed),.aborted(ring_aborted),.rejected(ring_rejected),
  .consumed(ring_consumed),.discarded(ring_discarded),.canceled(ring_canceled),.resident(ring_resident),.pending_total(ring_pending),.bad_done(bad_done));
 af_ring_store #(.WORDS(WORDS)) store(.clk(clk),.rst_n(pipe_rst_n),.w_valid(write_fire),.w_address(write_address),.w_data(pd),.w_ready(store_wr),
  .r_valid(read_valid && read_allowed),.r_address(read_address),.r_ready(store_rr),.m_valid(store_valid),.m_ready(data_ready),.m_data(data_out),.collision(collision));
 always @*begin
  hr=0;ha=0;pr=state==PAYLOAD && pipe_rst_n;fr=0;cv=0;rr=0;op=0;
  ce=tx_epoch;cc=tx_config;cs=tx_seq;cg=tx_gen;source=tx_source;slot=tx_slot;
  if(pipe_rst_n)case(state)
   WAIT_HEADER:begin
    if(hv)begin
     if(he!=0 || hh[416+:32]!=WORDS_PER_PACKET*64)hr=1;
     else begin cv=1;ce=hh[64+:32];cc=hh[96+:32];cs=hh[448+:64];source=hh[128+:16];cg=0;slot=0;end
    end
    if(fv)fr=1;
   end
   WAIT_RESERVE:begin rr=hv;hr=rv;ha=rv && ra;end
   PAYLOAD:if(fv)begin cv=1;op=fc && !write_fault && word_index==WORDS_PER_PACKET?1:2;end
   REJECTED:fr=1;
   WAIT_FINISH:begin rr=1;fr=rv;end
   default:begin end
  endcase
 end
 always @(posedge clk)begin
  if(!pipe_rst_n)begin
   state<=WAIT_HEADER;result_pending<=0;word_index<=0;write_fault<=0;consumer_live<=0;outstanding<=0;
  end else begin
   case({read_fire,data_valid&&data_ready})2'b10:outstanding<=outstanding+1;2'b01:outstanding<=outstanding-1;default:begin end endcase
   if(desc_valid&&desc_ready)begin consumer_live<=1;consumer_slot<=desc_slot;consumer_seq<=desc_sequence;consumer_gen<=desc_generation;consumer_mask<=desc_mask;end
   if(done_valid&&done_ready&&consumer_live&&done_sequence==consumer_seq&&done_generation==consumer_gen)consumer_live<=0;
   case(state)
    WAIT_HEADER:begin
     if(hv&&hr)begin admission_reason<=he==0?2:0;state<=REJECTED;end
     else if(cv&&cr)begin tx_epoch<=ce;tx_config<=cc;tx_seq<=cs;tx_source<=source;state<=WAIT_RESERVE;end
     if(fv&&fr)begin
      result_pending<=1;result_commit<=0;result_write_fault<=0;result_errors<=fe;result_reason<=0;
      result_source<=fh[128+:16];result_sequence<=fh[448+:64];result_generation<=generation;state<=RESULT;
     end
    end
    WAIT_RESERVE:if(rv&&rr)begin
     tx_slot<=reply_slot;tx_gen<=reply_gen;admission_reason<=reason;word_index<=0;write_fault<=0;state<=ra?PAYLOAD:REJECTED;
    end
    PAYLOAD:begin
     if(pv&&pr)begin if(word_index<WORDS_PER_PACKET)word_index<=word_index+1;if(!write_ok)write_fault<=1;end
     if(cv&&cr)begin finish_commit<=op==1;state<=WAIT_FINISH;end
    end
    REJECTED:if(fv&&fr)begin
     result_pending<=1;result_commit<=0;result_write_fault<=0;result_errors<=fe;result_reason<=admission_reason;
     result_source<=fh[128+:16];result_sequence<=fh[448+:64];result_generation<=generation;state<=RESULT;
    end
    WAIT_FINISH:if(rv&&rr)begin
     result_pending<=1;result_commit<=finish_commit&&ra;result_write_fault<=write_fault;result_errors<=fe;result_reason<=reason;
     result_source<=tx_source;result_sequence<=tx_seq;result_generation<=tx_gen;state<=RESULT;
    end
    RESULT:if(result_valid&&result_ready)begin result_pending<=0;state<=WAIT_HEADER;end
    default:state<=WAIT_HEADER;
   endcase
  end
 end
 always @(posedge clk)begin
  if(!rst_n)begin words_written<=0;writes_denied<=0;results_committed<=0;results_rejected<=0;contexts_flushed<=0;end
  else begin
   if(cfg_valid&&cfg_ready&&state!=WAIT_HEADER)contexts_flushed<=contexts_flushed+1;
   if(pipe_rst_n && pv&&pr)begin if(write_ok)words_written<=words_written+1;else writes_denied<=writes_denied+1;end
   if(pipe_rst_n && result_valid&&result_ready)begin
    if(result_commit)results_committed<=results_committed+1;else results_rejected<=results_rejected+1;
   end
  end
 end
endmodule
