// AFP1 aligned header validation ONLY. Ethernet deframing, payload, CRC and ring commit are separate.
module af_afp1_header_check (
 input wire clk, rst_n,
 input wire [511:0] s_header, input wire s_valid, output wire s_ready,
 input wire [31:0] cfg_epoch, cfg_config,
 input wire [15:0] cfg_destination, cfg_frequencies,
 input wire [31:0] cfg_first_frequency, cfg_adc_stride,
 input wire [63:0] cfg_epoch_adc,
 input wire [1:0] cfg_t_log2,
 output reg [511:0] m_header, output reg [7:0] m_errors,
 output reg m_valid, input wire m_ready
);
 reg [511:0] header_q;reg pipe_valid;
 reg [31:0] epoch_q,config_q,frequency_q,stride_q;
 reg [15:0] destination_q,frequencies_q;reg [63:0] epoch_adc_q;reg [1:0] tlog_q;
 wire [63:0] spectrum=header_q[224+:64];
 wire [63:0] adc=header_q[288+:64];
 wire [63:0] sequence_id=header_q[448+:64];
 wire [15:0] spectra=16'd1<<tlog_q;
 wire [31:0] payload_bytes={16'd0,frequencies_q}*32'd16*{16'd0,spectra};
 wire [95:0] adc_product={32'd0,spectrum}*{64'd0,stride_q};
 wire [95:0] adc_expected=adc_product+{32'd0,epoch_adc_q};
 wire [63:0] low_mask=(64'd1<<tlog_q)-64'd1;
 wire [7:0] errors;
 assign errors[0]=header_q[0+:32]!=32'h31504641 || header_q[32+:8]!=8'd1 || header_q[40+:8]!=8'd64;
 assign errors[1]=header_q[48+:16]!=16'd1 || header_q[352+:8]!=8'd1 || header_q[360+:8]!=8'd8 || header_q[368+:48]!=48'd0;
 assign errors[2]=header_q[64+:32]!=epoch_q || header_q[96+:32]!=config_q;
 assign errors[3]=header_q[128+:16]>=16'd256 || header_q[144+:16]!=destination_q;
 assign errors[4]=frequencies_q==0 || header_q[160+:32]!=frequency_q || header_q[192+:16]!=frequencies_q || header_q[208+:16]!=spectra;
 assign errors[5]=header_q[416+:32]!=payload_bytes;
 assign errors[6]=(spectrum&low_mask)!=0 || sequence_id!=(spectrum>>tlog_q);
 assign errors[7]=stride_q==0 || adc_expected[95:64]!=0 || adc_expected[63:0]!=adc;
 wire output_ready=!m_valid || m_ready;
 assign s_ready=!pipe_valid || output_ready;
 always @(posedge clk) begin
  if(!rst_n)begin m_valid<=0;pipe_valid<=0;m_header<=0;m_errors<=0;header_q<=0;
   epoch_q<=0;config_q<=0;frequency_q<=0;stride_q<=0;destination_q<=0;frequencies_q<=0;epoch_adc_q<=0;tlog_q<=0;
  end else begin
   if(output_ready)begin m_valid<=pipe_valid;if(pipe_valid)begin m_header<=header_q;m_errors<=errors;end end
   if(s_ready)begin
    pipe_valid<=s_valid;
    if(s_valid)begin header_q<=s_header;epoch_q<=cfg_epoch;config_q<=cfg_config;frequency_q<=cfg_first_frequency;
     stride_q<=cfg_adc_stride;destination_q<=cfg_destination;frequencies_q<=cfg_frequencies;epoch_adc_q<=cfg_epoch_adc;tlog_q<=cfg_t_log2;
    end
   end
  end
 end
endmodule
