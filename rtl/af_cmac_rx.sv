// Real cmac_usplus 3.1, CAUI4/AXIS, no RS-FEC. Generate af_cmac with
// tcl/phase2_cmac_shell.tcl; no vendor implementation is stored in this repo.
// The vendor example connects CMAC rx_clk to GT TXUSRCLK2; use the same
// supported user-clock arrangement here. RX is not backpressurable.
module af_cmac_rx(
 input wire init_clk,rst_n,gt_ref_clk_p,gt_ref_clk_n,
 input wire [3:0] gt_rxp,gt_rxn,input wire [11:0] gt_loopback,
 input wire [511:0] tx_data,input wire [63:0] tx_keep,input wire tx_valid,tx_last,tx_error,output wire tx_ready,
 output wire [3:0] gt_txp,gt_txn,output wire rx_clk,
 output wire [511:0] m_data,output wire [63:0] m_keep,output wire m_valid,m_last,m_error,
 output wire usr_rx_reset,usr_tx_reset,rx_aligned,rx_status,output wire [2:0] rx_bad_fcs
);
 af_cmac cmac(
  .gt_txp_out(gt_txp),.gt_txn_out(gt_txn),.gt_rxp_in(gt_rxp),.gt_rxn_in(gt_rxn),
  .gt_txusrclk2(rx_clk),.gt_loopback_in(gt_loopback),.gtwiz_reset_tx_datapath(1'b0),.gtwiz_reset_rx_datapath(1'b0),
  .sys_reset(!rst_n),.gt_ref_clk_p(gt_ref_clk_p),.gt_ref_clk_n(gt_ref_clk_n),.init_clk(init_clk),
  .rx_clk(rx_clk),.core_rx_reset(1'b0),.core_tx_reset(1'b0),
  .rx_axis_tdata(m_data),.rx_axis_tkeep(m_keep),.rx_axis_tvalid(m_valid),.rx_axis_tlast(m_last),.rx_axis_tuser(m_error),
  .usr_rx_reset(usr_rx_reset),.usr_tx_reset(usr_tx_reset),.stat_rx_aligned(rx_aligned),.stat_rx_status(rx_status),.stat_rx_bad_fcs(rx_bad_fcs),
  .ctl_rx_enable(1'b1),.ctl_rx_force_resync(1'b0),.ctl_rx_test_pattern(1'b0),
  .ctl_rx_check_etype_gcp(1'b0),.ctl_rx_check_etype_gpp(1'b0),.ctl_rx_check_etype_pcp(1'b0),.ctl_rx_check_etype_ppp(1'b0),
  .ctl_rx_check_mcast_gcp(1'b0),.ctl_rx_check_mcast_gpp(1'b0),.ctl_rx_check_mcast_pcp(1'b0),.ctl_rx_check_mcast_ppp(1'b0),
  .ctl_rx_check_opcode_gcp(1'b0),.ctl_rx_check_opcode_gpp(1'b0),.ctl_rx_check_opcode_pcp(1'b0),.ctl_rx_check_opcode_ppp(1'b0),
  .ctl_rx_check_sa_gcp(1'b0),.ctl_rx_check_sa_gpp(1'b0),.ctl_rx_check_sa_pcp(1'b0),.ctl_rx_check_sa_ppp(1'b0),
  .ctl_rx_check_ucast_gcp(1'b0),.ctl_rx_check_ucast_gpp(1'b0),.ctl_rx_check_ucast_pcp(1'b0),.ctl_rx_check_ucast_ppp(1'b0),
  .ctl_rx_enable_gcp(1'b0),.ctl_rx_enable_gpp(1'b0),.ctl_rx_enable_pcp(1'b0),.ctl_rx_enable_ppp(1'b0),
  .ctl_rx_pause_ack(9'd0),.ctl_rx_pause_enable(9'd0),
  .ctl_tx_enable(1'b1),.ctl_tx_test_pattern(1'b0),.ctl_tx_send_idle(1'b0),.ctl_tx_send_rfi(1'b0),.ctl_tx_send_lfi(1'b0),
  .ctl_tx_pause_enable(9'd0),.ctl_tx_pause_quanta0(16'd0),.ctl_tx_pause_quanta1(16'd0),.ctl_tx_pause_quanta2(16'd0),
  .ctl_tx_pause_quanta3(16'd0),.ctl_tx_pause_quanta4(16'd0),.ctl_tx_pause_quanta5(16'd0),.ctl_tx_pause_quanta6(16'd0),
  .ctl_tx_pause_quanta7(16'd0),.ctl_tx_pause_quanta8(16'd0),
  .ctl_tx_pause_refresh_timer0(16'd0),.ctl_tx_pause_refresh_timer1(16'd0),.ctl_tx_pause_refresh_timer2(16'd0),
  .ctl_tx_pause_refresh_timer3(16'd0),.ctl_tx_pause_refresh_timer4(16'd0),.ctl_tx_pause_refresh_timer5(16'd0),
  .ctl_tx_pause_refresh_timer6(16'd0),.ctl_tx_pause_refresh_timer7(16'd0),.ctl_tx_pause_refresh_timer8(16'd0),
  .ctl_tx_pause_req(9'd0),.ctl_tx_resend_pause(1'b0),
  .tx_axis_tready(tx_ready),.tx_axis_tvalid(tx_valid),.tx_axis_tdata(tx_data),.tx_axis_tkeep(tx_keep),.tx_axis_tlast(tx_last),.tx_axis_tuser(tx_error),.tx_preamblein(56'd0),
  // No DRP transactions: follow the generated example's constant DRP reset.
  .core_drp_reset(1'b0),.drp_clk(init_clk),.drp_addr(10'd0),.drp_di(16'd0),.drp_en(1'b0),.drp_we(1'b0)
 );
endmodule
