// Packet-atomic, non-stallable 512-bit RX to a stallable independent clock.
// Input has NO ready. Data is published only with a complete descriptor.
// rst_n must be held low for >=16 RX clocks; both clocks must run through reset.
// After reset, drain to a real TLAST before admitting frames. Counters are per reset.
module af_rx_ingress #(
 parameter integer DATA_DEPTH=4096,DESC_DEPTH=64,MAX_FRAME_BYTES=9014,IDLE_TIMEOUT=256,
 parameter integer MAX_BEATS=(MAX_FRAME_BYTES+63)/64,WC=$clog2(MAX_BEATS+1),
 parameter integer DC=$clog2(DATA_DEPTH)+1,PC=$clog2(DESC_DEPTH)+1
)(
 input wire rx_clk,clk,rst_n,
 input wire [511:0] s_data,input wire [63:0] s_keep,input wire s_valid,s_last,s_error,
 output wire rx_online,m_online,
 output wire [511:0] m_data,output wire [63:0] m_keep,output wire m_valid,m_last,m_error,input wire m_ready,
 // RX-domain counters and fault. Do not sample directly in another domain.
 output reg [63:0] rx_started,rx_queued,rx_bad,rx_no_space,rx_resync_tails,rx_timeouts,
 output reg [63:0] rx_oversize,rx_error_frames,output reg rx_fault,
 output wire [DC-1:0] rx_data_words,output reg [DC-1:0] rx_peak_words,
 // Processing-domain counters and fault.
 output reg [63:0] m_delivered,m_discarded,output reg m_fault
);
 localparam IDLE=0,CAPTURE=1,DROP=2,RESYNC=3;
 reg [1:0] state;
 reg [WC-1:0] words;reg [16:0] bytes_seen;reg bad_seen;
 reg [511:0] beat_data;reg [63:0] beat_keep;
 reg beat_valid,beat_last,beat_error,beat_keep_bad;reg [6:0] beat_bytes;
 reg [$clog2(IDLE_TIMEOUT+1)-1:0] idle_count;
 wire rx_reset,m_reset;
 // FIFO reset is synchronous to its write clock. External reset immediately
 // gates traffic, then this synchronized reset clears both FIFO domains.
 xpm_cdc_sync_rst #(.DEST_SYNC_FF(3),.INIT(1),.INIT_SYNC_FF(1),.SIM_ASSERT_CHK(1)) rx_reset_sync(
  .src_rst(!rst_n),.dest_clk(rx_clk),.dest_rst(rx_reset));
 xpm_cdc_async_rst #(.DEST_SYNC_FF(3),.RST_ACTIVE_HIGH(1),.INIT_SYNC_FF(1)) m_reset_sync(
  .src_arst(!rst_n),.dest_clk(clk),.dest_arst(m_reset));
 wire dw_busy,dr_busy,pw_busy,pr_busy,dfull,dempty,pfull,pempty;
 wire dw_over,dr_under,pw_over,pr_under;
 wire [PC-1:0] desc_words;
 wire [576:0] data_out;wire [WC:0] desc_out;
 wire reserve_ok=rx_data_words<=DATA_DEPTH-MAX_BEATS-4 && desc_words<=DESC_DEPTH-4 && !dfull && !pfull;
 assign rx_online=rst_n && !rx_reset && !dw_busy && !pw_busy;
 // Only destination-domain reset/busy signals gate processing-side traffic.
 // In the integrated design rst_n is RX-owned; using it directly here would
 // create an unsynchronized RX->processing enable across the entire parser.
 assign m_online=!m_reset && !dr_busy && !pr_busy;
 wire admitted=state==CAPTURE || (state==IDLE && reserve_ok);
 wire data_write=rx_online && !rx_fault && beat_valid && admitted && !dfull && (state==IDLE || words<MAX_BEATS);
 function automatic [6:0] count_bytes(input [63:0] k);
  reg [3:0] octet[0:7];reg [4:0] pair[0:3];reg [5:0] half[0:1];integer i,j;
  begin
   for(i=0;i<8;i=i+1)begin octet[i]=0;for(j=0;j<8;j=j+1)octet[i]=octet[i]+k[8*i+j];end
   for(i=0;i<4;i=i+1)pair[i]={1'b0,octet[2*i]}+{1'b0,octet[2*i+1]};
   for(i=0;i<2;i=i+1)half[i]={1'b0,pair[2*i]}+{1'b0,pair[2*i+1]};
   count_bytes={1'b0,half[0]}+{1'b0,half[1]};
  end
 endfunction
 wire [64:0] kwide={1'b0,s_keep};
 wire bad_keep=s_keep==0 || (kwide&(kwide+65'd1))!=0 || (!s_last && !(&s_keep));
 // Cut the real CMAC TKEEP -> byte/length/error -> admission/counter path.
 // This is a fixed one-beat pipeline; the RX source still never waits.
 always @(posedge rx_clk)begin
  if(rx_reset)begin beat_valid<=0;beat_last<=0;beat_error<=0;beat_keep_bad<=0;beat_bytes<=0;end
  else begin
   beat_valid<=rx_online && !rx_fault && s_valid;
   if(s_valid)begin beat_data<=s_data;beat_keep<=s_keep;beat_last<=s_last;beat_error<=s_error;beat_keep_bad<=bad_keep;beat_bytes<=count_bytes(s_keep);end
  end
 end
 wire [16:0] next_bytes=(state==IDLE?17'd0:bytes_seen)+beat_bytes;
 wire too_long=next_bytes>MAX_FRAME_BYTES || (state==CAPTURE && words==MAX_BEATS);
 wire beat_bad=beat_error || beat_keep_bad || too_long || dfull;
 wire [WC:0] next_words={1'b0,(state==IDLE?{WC{1'b0}}:words)}+data_write;
 wire timed_out=rx_online && state==CAPTURE && !beat_valid && idle_count==IDLE_TIMEOUT-1;
 wire finish=rx_online && !rx_fault && ((beat_valid && admitted && (beat_last || too_long)) || timed_out);
 wire descriptor_bad=timed_out || bad_seen && state==CAPTURE || (beat_valid && beat_bad);
 wire [WC-1:0] descriptor_words=timed_out?words:next_words[WC-1:0];
 // Reserve four descriptor entries in reserve_ok, including this pipeline
 // stage and conservative XPM count latency; back-to-back frames remain legal.
 reg descriptor_pending;reg [WC:0] descriptor_data;
 wire descriptor_write=rx_online && descriptor_pending && !pfull;
 always @(posedge rx_clk)begin
  if(rx_reset)begin descriptor_pending<=0;descriptor_data<=0;end
  else begin descriptor_pending<=finish;if(finish)descriptor_data<={descriptor_bad,descriptor_words};end
 end
 wire descriptor_read,data_read;
 xpm_fifo_async #(.FIFO_MEMORY_TYPE("block"),.FIFO_WRITE_DEPTH(DATA_DEPTH),.WRITE_DATA_WIDTH(577),.READ_DATA_WIDTH(577),
  .WR_DATA_COUNT_WIDTH(DC),.RD_DATA_COUNT_WIDTH(DC),.READ_MODE("fwft"),.FIFO_READ_LATENCY(0),
  .USE_ADV_FEATURES("1707"),.CDC_SYNC_STAGES(3),.SIM_ASSERT_CHK(1)) data_fifo(
  .rst(rx_reset),.wr_clk(rx_clk),.rd_clk(clk),.sleep(1'b0),.wr_en(data_write),.din({beat_last,beat_keep,beat_data}),
  .full(dfull),.wr_rst_busy(dw_busy),.wr_data_count(rx_data_words),.overflow(dw_over),
  .rd_en(data_read),.dout(data_out),.empty(dempty),.rd_rst_busy(dr_busy),.underflow(dr_under),
  .injectsbiterr(1'b0),.injectdbiterr(1'b0));
 xpm_fifo_async #(.FIFO_MEMORY_TYPE("distributed"),.FIFO_WRITE_DEPTH(DESC_DEPTH),.WRITE_DATA_WIDTH(WC+1),.READ_DATA_WIDTH(WC+1),
  .WR_DATA_COUNT_WIDTH(PC),.RD_DATA_COUNT_WIDTH(PC),.READ_MODE("fwft"),.FIFO_READ_LATENCY(0),
  .USE_ADV_FEATURES("1707"),.CDC_SYNC_STAGES(3),.SIM_ASSERT_CHK(1)) descriptor_fifo(
  .rst(rx_reset),.wr_clk(rx_clk),.rd_clk(clk),.sleep(1'b0),.wr_en(descriptor_write),.din(descriptor_data),
  .full(pfull),.wr_rst_busy(pw_busy),.wr_data_count(desc_words),.overflow(pw_over),
  .rd_en(descriptor_read),.dout(desc_out),.empty(pempty),.rd_rst_busy(pr_busy),.underflow(pr_under),
  .injectsbiterr(1'b0),.injectdbiterr(1'b0));
 always @(posedge rx_clk)begin
  if(rx_reset)begin
   state<=RESYNC;words<=0;bytes_seen<=0;bad_seen<=0;idle_count<=0;
   rx_started<=0;rx_queued<=0;rx_bad<=0;rx_no_space<=0;rx_resync_tails<=0;rx_timeouts<=0;
   rx_oversize<=0;rx_error_frames<=0;rx_fault<=0;rx_peak_words<=0;
  end else if(rx_online)begin
   if(rx_data_words>rx_peak_words)rx_peak_words<=rx_data_words;
   if(dw_over || pw_over || ((finish || descriptor_pending) && pfull) || (beat_valid && admitted && dfull))rx_fault<=1;
   if(beat_valid)idle_count<=0;
   else if(state==CAPTURE)idle_count<=idle_count+1;
   if(timed_out)begin
    state<=RESYNC;rx_bad<=rx_bad+1;rx_timeouts<=rx_timeouts+1;idle_count<=0;
   end else if(beat_valid && !rx_fault)case(state)
    RESYNC:if(beat_last)begin state<=IDLE;rx_resync_tails<=rx_resync_tails+1;end
    DROP:if(beat_last)state<=IDLE;
    IDLE:begin
     rx_started<=rx_started+1;bad_seen<=beat_bad;bytes_seen<=next_bytes;words<=next_words[WC-1:0];
     if(!reserve_ok)begin rx_no_space<=rx_no_space+1;state<=beat_last?IDLE:DROP;end
     else if(beat_last || too_long)begin
      state<=beat_last?IDLE:RESYNC;
      if(beat_bad)rx_bad<=rx_bad+1;else rx_queued<=rx_queued+1;
      if(too_long)rx_oversize<=rx_oversize+1;
      if(beat_error || beat_keep_bad)rx_error_frames<=rx_error_frames+1;
     end else state<=CAPTURE;
    end
    CAPTURE:begin
     bad_seen<=bad_seen||beat_bad;bytes_seen<=next_bytes;words<=next_words[WC-1:0];
     if(beat_last || too_long)begin
      state<=beat_last?IDLE:RESYNC;
      if(bad_seen || beat_bad)rx_bad<=rx_bad+1;else rx_queued<=rx_queued+1;
      if(too_long)rx_oversize<=rx_oversize+1;
      if((bad_seen || beat_error || beat_keep_bad) && !too_long)rx_error_frames<=rx_error_frames+1;
     end
    end
   endcase
  end
 end
 reg reading,discard;
 reg [WC-1:0] remaining;
 assign descriptor_read=m_online && !m_fault && !reading && !pempty;
 assign m_valid=m_online && !m_fault && reading && !discard && !dempty;
 assign m_data=data_out[511:0];assign m_keep=data_out[575:512];assign m_last=data_out[576];assign m_error=1'b0;
 assign data_read=m_online && !m_fault && reading && !dempty && (discard || m_ready);
 always @(posedge clk)begin
  if(m_reset || dr_busy || pr_busy)begin reading<=0;discard<=0;remaining<=0;m_delivered<=0;m_discarded<=0;m_fault<=0;end
  else if(m_online)begin
   if(dr_under || pr_under)m_fault<=1;
   if(descriptor_read)begin
    reading<=1;discard<=desc_out[WC];remaining<=desc_out[WC-1:0];
    if(desc_out[WC-1:0]==0)m_fault<=1;
   end
   if(data_read)begin
    if(!discard && m_last!=(remaining==1))m_fault<=1;
    remaining<=remaining-1;
    if(remaining==1)begin reading<=0;if(discard)m_discarded<=m_discarded+1;else m_delivered<=m_delivered+1;end
   end
  end
 end
 initial begin
  if(DATA_DEPTH<MAX_BEATS+8 || DESC_DEPTH<16 || IDLE_TIMEOUT<2)$error("Invalid ingress reservation geometry");
 end
endmodule
