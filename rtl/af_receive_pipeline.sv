// Non-stallable RX, packet-atomic XPM CDC ingress, real ring and raw store.
// Config valid/ready captures a complete configuration, flushes both ingress
// domains, installs it, primes the parser, and then asserts ready_for_data.
// Both clocks must run during reset. No RFSoC or science kernel is included.
module af_receive_pipeline #(
 parameter integer SLOTS=10,WORDS_PER_PACKET=10,DATA_DEPTH=4096,DESC_DEPTH=64,
 parameter integer SW=$clog2(SLOTS),WW=$clog2(WORDS_PER_PACKET+1),DC=$clog2(DATA_DEPTH)+1
)(
 input wire rx_clk,clk,rst_n,input wire [63:0] now_tick,
 input wire [511:0] s_data,input wire [63:0] s_keep,input wire s_valid,s_last,s_error,
 input wire cfg_valid,output wire cfg_ready,output wire ready_for_data,
 input wire [31:0] cfg_epoch,cfg_config,cfg_period_ticks,cfg_first_frequency,cfg_adc_stride,
 input wire [63:0] cfg_first_sequence,cfg_first_deadline,cfg_blocks,cfg_epoch_adc,
 input wire [15:0] cfg_destination,cfg_frequencies,input wire [1:0] cfg_t_log2,
 input wire [47:0] cfg_mac,input wire [31:0] cfg_ip,input wire [15:0] cfg_port,cfg_mtu,
 output wire active,cfg_fault,output wire [63:0] generation,
 output wire result_valid,input wire result_ready,output wire result_commit,result_write_fault,
 output wire [15:0] result_errors,result_source,output wire [3:0] result_reason,
 output wire [63:0] result_sequence,result_generation,
 output wire desc_valid,input wire desc_ready,output wire [63:0] desc_sequence,desc_generation,
 output wire [SW-1:0] desc_slot,output wire [255:0] desc_mask,output wire [8:0] desc_count,
 input wire read_valid,output wire read_ready,input wire [SW-1:0] read_slot,
 input wire [15:0] read_source,input wire [WW-1:0] read_word,
 output wire data_valid,input wire data_ready,output wire [511:0] data_out,
 input wire done_valid,output wire done_ready,input wire [63:0] done_sequence,done_generation,
 output wire [63:0] ring_requests,ring_reserved,ring_committed,ring_aborted,ring_rejected,
 output wire [63:0] ring_consumed,ring_discarded,ring_canceled,ring_resident,ring_pending,bad_done,
 output wire [63:0] words_written,writes_denied,results_committed,results_rejected,contexts_flushed,
 // Domain-specific ingress observations; RX statistics are not synchronized to clk.
 output wire rx_online,ingress_m_online,rx_fault,ingress_m_fault,
 output wire [63:0] rx_started,rx_queued,rx_bad,rx_no_space,rx_resync_tails,rx_timeouts,rx_oversize,rx_error_frames,
 output wire [DC-1:0] rx_data_words,rx_peak_words,
 output wire [63:0] ingress_delivered,ingress_discarded
);
 localparam IDLE=0,FLUSH=1,INSTALL=2,PRIME=3,WAIT_ACTIVE=4,RUN=5;
 reg [2:0] state;reg req_toggle;reg [561:0] config_q;
 wire run_enable=rst_n && state==RUN && !cfg_valid;
 assign cfg_ready=rst_n && (state==IDLE || state==RUN);
 assign ready_for_data=run_enable;
 wire [31:0] ce,cc,cp,cf,ca,ci;wire [63:0] cs,cd,cb,ceadc;
 wire [15:0] cde,cn,cport,cmtu;wire [1:0] ct;wire [47:0] cmac;
 assign {ce,cc,cp,cf,ca,cs,cd,cb,ceadc,cde,cn,ct,cmac,ci,cport,cmtu}=config_q;
 // RX-owned reset stretch and toggle acknowledgement. The reset exported
 // across domains is a single registered level, not a binary-counter decode.
 wire rx_control_reset,req_rx,ack_clk,rx_online_clk;
 reg seen_req,rx_ack,rx_flush_active;reg [5:0] hold_reset;
 xpm_cdc_sync_rst #(.DEST_SYNC_FF(3),.INIT(1),.INIT_SYNC_FF(1)) control_reset_sync(
  .src_rst(!rst_n),.dest_clk(rx_clk),.dest_rst(rx_control_reset));
 xpm_cdc_single #(.DEST_SYNC_FF(3),.SRC_INPUT_REG(0),.INIT_SYNC_FF(0),.SIM_ASSERT_CHK(1)) request_sync(
  .src_clk(clk),.src_in(req_toggle),.dest_clk(rx_clk),.dest_out(req_rx));
 xpm_cdc_single #(.DEST_SYNC_FF(3),.SRC_INPUT_REG(0),.INIT_SYNC_FF(0),.SIM_ASSERT_CHK(1)) ack_sync(
  .src_clk(rx_clk),.src_in(rx_ack),.dest_clk(clk),.dest_out(ack_clk));
 xpm_cdc_single #(.DEST_SYNC_FF(3),.SRC_INPUT_REG(1),.INIT_SYNC_FF(0),.SIM_ASSERT_CHK(1)) online_sync(
  .src_clk(rx_clk),.src_in(rx_online),.dest_clk(clk),.dest_out(rx_online_clk));
 always @(posedge rx_clk or negedge rst_n)begin
  if(!rst_n)begin seen_req<=0;rx_ack<=0;hold_reset<=32;rx_flush_active<=1;end
  else if(rx_control_reset)begin seen_req<=0;rx_ack<=0;hold_reset<=32;rx_flush_active<=1;end
  else if(req_rx!=seen_req)begin seen_req<=req_rx;hold_reset<=32;rx_flush_active<=1;end
  else if(hold_reset!=0)begin
   hold_reset<=hold_reset-1;if(hold_reset==1)begin rx_ack<=seen_req;rx_flush_active<=0;end
  end
 end
 wire ingress_rst_n=!rx_flush_active;
 wire iv,il,ie,ir;wire [511:0] idata;wire [63:0] ik;
 af_rx_ingress #(.DATA_DEPTH(DATA_DEPTH),.DESC_DEPTH(DESC_DEPTH)) ingress(
  .rx_clk(rx_clk),.clk(clk),.rst_n(ingress_rst_n),.s_data(s_data),.s_keep(s_keep),.s_valid(s_valid),.s_last(s_last),.s_error(s_error),
  .rx_online(rx_online),.m_online(ingress_m_online),.m_data(idata),.m_keep(ik),.m_valid(iv),.m_last(il),.m_error(ie),.m_ready(ir),
  .rx_started(rx_started),.rx_queued(rx_queued),.rx_bad(rx_bad),.rx_no_space(rx_no_space),.rx_resync_tails(rx_resync_tails),.rx_timeouts(rx_timeouts),
  .rx_oversize(rx_oversize),.rx_error_frames(rx_error_frames),.rx_fault(rx_fault),.rx_data_words(rx_data_words),.rx_peak_words(rx_peak_words),
  .m_delivered(ingress_delivered),.m_discarded(ingress_discarded),.m_fault(ingress_m_fault));
 wire core_cfg_ready,core_active,core_s_ready,core_result_valid,core_desc_valid,core_data_valid,core_read_ready,core_done_ready;
 assign ir=run_enable && core_s_ready;
 assign active=core_active && run_enable;
 assign result_valid=core_result_valid && run_enable;assign desc_valid=core_desc_valid && run_enable;
 assign data_valid=core_data_valid && run_enable;assign read_ready=core_read_ready && run_enable;assign done_ready=core_done_ready && run_enable;
 af_receive_core #(.SLOTS(SLOTS),.WORDS_PER_PACKET(WORDS_PER_PACKET)) core(
  .clk(clk),.rst_n(rst_n),.now_tick(now_tick),.s_data(state==PRIME?512'd0:idata),.s_keep(state==PRIME?64'd1:ik),
  .s_valid(state==PRIME || (run_enable && iv)),.s_last(state==PRIME || il),.s_error(state==PRIME?1'b0:ie),.s_ready(core_s_ready),
  .cfg_valid(state==INSTALL),.cfg_ready(core_cfg_ready),.cfg_epoch(ce),.cfg_config(cc),.cfg_period_ticks(cp),.cfg_first_frequency(cf),.cfg_adc_stride(ca),
  .cfg_first_sequence(cs),.cfg_first_deadline(cd),.cfg_blocks(cb),.cfg_epoch_adc(ceadc),.cfg_destination(cde),.cfg_frequencies(cn),.cfg_t_log2(ct),
  .cfg_mac(cmac),.cfg_ip(ci),.cfg_port(cport),.cfg_mtu(cmtu),.active(core_active),.cfg_fault(cfg_fault),.generation(generation),
  .result_valid(core_result_valid),.result_ready(result_ready && run_enable),.result_commit(result_commit),.result_write_fault(result_write_fault),
  .result_errors(result_errors),.result_source(result_source),.result_reason(result_reason),.result_sequence(result_sequence),.result_generation(result_generation),
  .desc_valid(core_desc_valid),.desc_ready(desc_ready && run_enable),.desc_sequence(desc_sequence),.desc_generation(desc_generation),.desc_slot(desc_slot),.desc_mask(desc_mask),.desc_count(desc_count),
  .read_valid(read_valid && run_enable),.read_ready(core_read_ready),.read_slot(read_slot),.read_source(read_source),.read_word(read_word),
  .data_valid(core_data_valid),.data_ready(data_ready && run_enable),.data_out(data_out),
  .done_valid(done_valid && run_enable),.done_ready(core_done_ready),.done_sequence(done_sequence),.done_generation(done_generation),
  .ring_requests(ring_requests),.ring_reserved(ring_reserved),.ring_committed(ring_committed),.ring_aborted(ring_aborted),.ring_rejected(ring_rejected),
  .ring_consumed(ring_consumed),.ring_discarded(ring_discarded),.ring_canceled(ring_canceled),.ring_resident(ring_resident),.ring_pending(ring_pending),.bad_done(bad_done),
  .words_written(words_written),.writes_denied(writes_denied),.results_committed(results_committed),.results_rejected(results_rejected),.contexts_flushed(contexts_flushed));
 always @(posedge clk)begin
  if(!rst_n)begin state<=IDLE;req_toggle<=0;config_q<=0;end
  else if(cfg_valid && cfg_ready)begin
   config_q<={cfg_epoch,cfg_config,cfg_period_ticks,cfg_first_frequency,cfg_adc_stride,cfg_first_sequence,cfg_first_deadline,cfg_blocks,cfg_epoch_adc,
    cfg_destination,cfg_frequencies,cfg_t_log2,cfg_mac,cfg_ip,cfg_port,cfg_mtu};
   req_toggle<=!req_toggle;state<=FLUSH;
  end else case(state)
   FLUSH:if(ack_clk==req_toggle && rx_online_clk && ingress_m_online)state<=INSTALL;
   INSTALL:if(core_cfg_ready)state<=PRIME;
   PRIME:if(core_s_ready)state<=WAIT_ACTIVE;
   WAIT_ACTIVE:if(core_active || cfg_fault)state<=RUN;
   default:begin end
  endcase
 end
endmodule
