// AFP1 aligned header only; no Ethernet parsing or payload commit.
// Eight globally stalled stages; exact runtime 64x32 time mapping including overflow.
module af_afp1_header_check (
 input wire clk,rst_n,
 input wire [511:0] s_header,input wire s_valid,output wire s_ready,
 input wire [31:0] cfg_epoch,cfg_config,
 input wire [15:0] cfg_destination,cfg_frequencies,
 input wire [31:0] cfg_first_frequency,cfg_adc_stride,
 input wire [63:0] cfg_epoch_adc,input wire [1:0] cfg_t_log2,
 output wire [511:0] m_header,output wire [7:0] m_errors,
 output wire m_valid,input wire m_ready
);
 reg [7:0] valid;reg [511:0] header [0:7];reg [7:0] err [0:7];
 reg [31:0] epoch_q,config_q,frequency_q,stride_q;
 reg [15:0] destination_q,frequencies_q;reg [1:0] tlog_q;
 reg [63:0] base [0:4];reg [31:0] mul_lo [0:3],mul_hi [0:3];
 reg [47:0] limb [0:3];reg [63:0] pair_lo,pair_hi;reg [95:0] product;
 reg [32:0] sum_lo,sum_mid,carry_mid;reg [31:0] high_q,high_r;
 reg low_bad,low_bad_r;reg [6:0] zero_stride;
 wire [63:0] spectrum=header[0][224+:64];
 wire [15:0] spectra=16'd1<<tlog_q;
 wire [31:0] payload_bytes={16'd0,frequencies_q}<<(4+tlog_q);
 wire [63:0] low_mask=(64'd1<<tlog_q)-64'd1;
 wire [6:0] errors;
 assign errors[0]=header[0][0+:32]!=32'h31504641 || header[0][32+:8]!=1 || header[0][40+:8]!=64;
 assign errors[1]=header[0][48+:16]!=1 || header[0][352+:8]!=1 || header[0][360+:8]!=8 || header[0][368+:48]!=0;
 assign errors[2]=header[0][64+:32]!=epoch_q || header[0][96+:32]!=config_q;
 assign errors[3]=header[0][128+:16]>=256 || header[0][144+:16]!=destination_q;
 assign errors[4]=frequencies_q==0 || header[0][160+:32]!=frequency_q || header[0][192+:16]!=frequencies_q || header[0][208+:16]!=spectra;
 assign errors[5]=header[0][416+:32]!=payload_bytes;
 assign errors[6]=(spectrum&low_mask)!=0 || header[0][448+:64]!=(spectrum>>tlog_q);
 wire advance=!valid[7] || m_ready;
 wire [32:0] next_low={1'b0,product[31:0]}+{1'b0,base[4][31:0]};
 wire [32:0] next_mid=sum_mid+sum_lo[32];
 wire [32:0] final_high={1'b0,high_r}+carry_mid[32];
 assign s_ready=rst_n && advance;
 assign m_valid=valid[7];assign m_header=header[7];assign m_errors=err[7];
 integer i;
 always @(posedge clk)begin
  if(!rst_n)valid<=0;
  else if(advance)begin
   valid<={valid[6:0],s_valid};header[0]<=s_header;
   epoch_q<=cfg_epoch;config_q<=cfg_config;frequency_q<=cfg_first_frequency;stride_q<=cfg_adc_stride;
   destination_q<=cfg_destination;frequencies_q<=cfg_frequencies;tlog_q<=cfg_t_log2;
   base[0]<=cfg_epoch_adc;zero_stride[0]<=cfg_adc_stride==0;
   for(i=1;i<8;i=i+1)begin header[i]<=header[i-1];err[i]<=err[i-1];end
   for(i=1;i<5;i=i+1)base[i]<=base[i-1];
   for(i=1;i<7;i=i+1)zero_stride[i]<=zero_stride[i-1];
   err[1]<={1'b0,errors};
   for(i=0;i<4;i=i+1)begin
    mul_lo[i]<=spectrum[16*i+:16]*stride_q[15:0];
    mul_hi[i]<=spectrum[16*i+:16]*stride_q[31:16];
    limb[i]<={16'd0,mul_lo[i]}+{mul_hi[i],16'd0};
   end
   pair_lo<={16'd0,limb[0]}+{limb[1],16'd0};
   pair_hi<={16'd0,limb[2]}+{limb[3],16'd0};
   product<={32'd0,pair_lo}+{pair_hi,32'd0};
   sum_lo<=next_low;sum_mid<={1'b0,product[63:32]}+{1'b0,base[4][63:32]};
   high_q<=product[95:64];low_bad<=next_low[31:0]!=header[4][288+:32];
   carry_mid<=next_mid;high_r<=high_q;low_bad_r<=low_bad;
   err[7][7]<=zero_stride[6] || final_high!=0 || low_bad_r || carry_mid[31:0]!=header[6][320+:32];
  end
 end
endmodule
