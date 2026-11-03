// Ethernet II / IPv4 IHL=5 / UDP checksum ZERO / AFP1. MAC strips FCS.
// Stallable processing-side stream: an independent non-stallable ingress/CDC is REQUIRED.
// h_accept reserves an external transaction; payload remains uncommitted until f_commit.
module af_packet_parser #(
 parameter integer WIDTH=512,IDLE_TIMEOUT=256,MAX_FRAME_BYTES=9014,
 parameter integer BYTES=WIDTH/8,HEADER_BEATS=(106+BYTES-1)/BYTES,
 parameter integer PREFIX_BYTES=106-(HEADER_BEATS-1)*BYTES,CARRY_BYTES=BYTES-PREFIX_BYTES
)(
 input wire clk,rst_n,
 input wire [WIDTH-1:0] s_data,input wire [BYTES-1:0] s_keep,
 input wire s_valid,s_last,s_error,output wire s_ready,
 input wire [31:0] cfg_epoch,cfg_config,cfg_first_frequency,cfg_adc_stride,
 input wire [15:0] cfg_destination,cfg_frequencies,input wire [1:0] cfg_t_log2,
 input wire [63:0] cfg_epoch_adc,
 input wire [47:0] cfg_mac,input wire [31:0] cfg_ip,input wire [15:0] cfg_port,cfg_mtu,
 output wire h_valid,input wire h_ready,h_accept,output wire [511:0] h_header,output wire [15:0] h_errors,
 output reg p_valid,input wire p_ready,output reg [WIDTH-1:0] p_data,
 output reg [BYTES-1:0] p_keep,output reg p_last,
 output wire f_valid,input wire f_ready,output wire f_reserved,f_commit,
 output wire [15:0] f_errors,output wire [511:0] f_header,
 output wire [15:0] f_frame_bytes,f_science_bytes
);
 localparam CAPTURE=0,SEND_HEADER=1,WAIT_HEADER=2,DECIDE=3,STREAM=4,FLUSH=5,DRAIN=6,REPORT=7,RESYNC=8;
 reg [3:0] state;reg [$clog2(HEADER_BEATS+1)-1:0] prefix_index;
 reg [HEADER_BEATS*WIDTH-1:0] prefix;
 reg [WIDTH-1:0] carry;reg [$clog2(BYTES+1)-1:0] carry_count;
 reg [15:0] errors,frame_bytes,generated;reg [31:0] expected_body;
 reg end_seen,reserved_q,resync_after;
 reg [$clog2(IDLE_TIMEOUT+1)-1:0] idle_count;
 reg [31:0] epoch_q,config_q,frequency_q,stride_q,ip_q;
 reg [15:0] destination_q,frequencies_q,port_q,mtu_q;
 reg [63:0] base_q;reg [1:0] tlog_q;reg [47:0] mac_q;
 wire header_ready,checked_valid;wire [511:0] checked_header;wire [7:0] checked_errors;
 af_afp1_header_check check_header(.clk(clk),.rst_n(rst_n),.s_header(prefix[336+:512]),
  .s_valid(state==SEND_HEADER),.s_ready(header_ready),.cfg_epoch(epoch_q),.cfg_config(config_q),
  .cfg_destination(destination_q),.cfg_frequencies(frequencies_q),.cfg_first_frequency(frequency_q),
  .cfg_adc_stride(stride_q),.cfg_epoch_adc(base_q),.cfg_t_log2(tlog_q),
  .m_header(checked_header),.m_errors(checked_errors),.m_valid(checked_valid),.m_ready(state==WAIT_HEADER));
 function automatic [15:0] be16(input [HEADER_BEATS*WIDTH-1:0] packet,input integer byte_index);
  be16={packet[byte_index*8+:8],packet[(byte_index+1)*8+:8]};
 endfunction
 function automatic integer keep_count(input [BYTES-1:0] value);
  integer i;begin keep_count=0;for(i=0;i<BYTES;i=i+1)keep_count=keep_count+value[i];end
 endfunction
 function automatic [BYTES-1:0] mask_bytes(input integer n);
  integer i;begin for(i=0;i<BYTES;i=i+1)mask_bytes[i]=i<n;end
 endfunction
 wire [BYTES:0] keep_wide={1'b0,s_keep};
 wire keep_bad=s_keep==0 || (keep_wide&(keep_wide+1))!=0 || (!s_last && !(&s_keep));
 wire p_space=!p_valid || p_ready;
 assign s_ready=rst_n && (state==CAPTURE || state==DRAIN || state==RESYNC || (state==STREAM && p_space));
 wire fire=s_valid && s_ready;
 wire [16:0] next_bytes={1'b0,frame_bytes}+keep_count(s_keep);
 wire [31:0] remaining_body=expected_body-generated;
 wire [WIDTH-1:0] assembled={s_data[0+:PREFIX_BYTES*8],carry[0+:CARRY_BYTES*8]};
 wire [15:0] ip_length=be16(prefix,16),udp_length=be16(prefix,38);
 reg [19:0] ip_sum;reg [16:0] ip_fold;reg [15:0] net_errors;
 integer i,n,total,emit_n;
 always @*begin
  ip_sum=0;for(i=14;i<34;i=i+2)ip_sum=ip_sum+be16(prefix,i);
  ip_fold={1'b0,ip_sum[15:0]}+ip_sum[19:16];
  ip_fold={1'b0,ip_fold[15:0]}+ip_fold[16];
  net_errors=0;
  net_errors[8]=be16(prefix,12)!=16'h0800 || prefix[112+:8]!=8'h45 || prefix[184+:8]!=8'd17 ||
   (be16(prefix,20)&16'hbfff)!=0 || be16(prefix,40)!=0;
  net_errors[9]=ip_fold!=17'h0ffff;
  net_errors[10]=ip_length<92 || udp_length<72 || {1'b0,ip_length}!={1'b0,udp_length}+17'd20 ||
   {17'd0,udp_length}!={1'b0,prefix[752+:32]}+33'd72;
  net_errors[11]={prefix[0+:8],prefix[8+:8],prefix[16+:8],prefix[24+:8],prefix[32+:8],prefix[40+:8]}!=mac_q ||
   {prefix[240+:8],prefix[248+:8],prefix[256+:8],prefix[264+:8]}!=ip_q || be16(prefix,36)!=port_q;
  net_errors[14]=ip_length>mtu_q || {1'b0,ip_length}+17'd14>MAX_FRAME_BYTES || prefix[752+:32]>MAX_FRAME_BYTES-106;
 end
 wire [15:0] final_errors=errors | (({1'b0,frame_bytes}!=33'd106+{1'b0,expected_body} || (reserved_q && generated!=expected_body))?16'h4000:16'd0);
 assign h_valid=rst_n && state==DECIDE;assign h_header=prefix[336+:512];assign h_errors=errors;
 assign f_valid=rst_n && state==REPORT && !p_valid;
 assign f_reserved=reserved_q;assign f_commit=reserved_q && final_errors==0;
 assign f_errors=final_errors;assign f_header=prefix[336+:512];
 assign f_frame_bytes=frame_bytes;assign f_science_bytes=generated;
 always @(posedge clk)begin
  if(!rst_n)begin
   state<=RESYNC;p_valid<=0;prefix_index<=0;prefix<=0;errors<=0;frame_bytes<=0;generated<=0;
   expected_body<=0;reserved_q<=0;end_seen<=0;resync_after<=0;idle_count<=0;carry<=0;carry_count<=0;
  end else begin
   if(p_valid && p_ready)p_valid<=0;
   if(fire)idle_count<=0;
   else if(s_ready && !s_valid && ((state==CAPTURE && prefix_index!=0) || state==STREAM || state==DRAIN))begin
    if(idle_count==IDLE_TIMEOUT-1)begin state<=REPORT;errors[12]<=1;resync_after<=1;idle_count<=0;end
    else idle_count<=idle_count+1;
   end
   case(state)
    RESYNC:if(fire && s_last)begin
     state<=CAPTURE;prefix_index<=0;prefix<=0;errors<=0;frame_bytes<=0;generated<=0;
     expected_body<=0;reserved_q<=0;resync_after<=0;
    end
    CAPTURE:if(fire)begin
     prefix[prefix_index*WIDTH+:WIDTH]<=s_data;frame_bytes<=next_bytes[15:0];
     if(prefix_index==0)begin
      epoch_q<=cfg_epoch;config_q<=cfg_config;frequency_q<=cfg_first_frequency;stride_q<=cfg_adc_stride;
      destination_q<=cfg_destination;frequencies_q<=cfg_frequencies;tlog_q<=cfg_t_log2;base_q<=cfg_epoch_adc;
      mac_q<=cfg_mac;ip_q<=cfg_ip;port_q<=cfg_port;mtu_q<=cfg_mtu;
     end
     if(keep_bad)errors[12]<=1;if(s_error)errors[13]<=1;
     if(s_last && prefix_index!=HEADER_BEATS-1)begin errors[12]<=1;state<=REPORT;end
     else if(prefix_index==HEADER_BEATS-1)begin
      carry<=s_data>>(PREFIX_BYTES*8);n=keep_count(s_keep)-PREFIX_BYTES;
      carry_count<=n<0?0:n;if(n<0)errors[12]<=1;end_seen<=s_last;state<=SEND_HEADER;
     end else prefix_index<=prefix_index+1;
    end
    SEND_HEADER:if(header_ready)begin errors<=errors|net_errors;expected_body<=prefix[752+:32];state<=WAIT_HEADER;end
    WAIT_HEADER:if(checked_valid)begin errors[7:0]<=checked_errors;state<=DECIDE;end
    DECIDE:if(h_ready)begin
     reserved_q<=h_accept && errors==0;
     if(!h_accept && errors==0)errors[15]<=1;
     if(!h_accept || errors!=0)state<=end_seen?REPORT:DRAIN;
     else state<=end_seen?FLUSH:STREAM;
    end
    STREAM:if(fire)begin
     frame_bytes<=next_bytes[15:0];if(s_error)errors[13]<=1;
     if(keep_bad)begin errors[12]<=1;state<=s_last?REPORT:DRAIN;end
     else begin
      total=CARRY_BYTES+keep_count(s_keep);n=total>BYTES?BYTES:total;
      emit_n=remaining_body<n?remaining_body:n;
      if(emit_n>0)begin
       p_valid<=1;p_data<=assembled;p_keep<=mask_bytes(emit_n);
       p_last<=remaining_body<=emit_n || (s_last && total<=BYTES);generated<=generated+emit_n;
      end
      carry<=s_data>>(PREFIX_BYTES*8);carry_count<=total>BYTES?total-BYTES:0;
      if(s_last)state<=total>BYTES && remaining_body>emit_n?FLUSH:REPORT;
      else if(remaining_body<=emit_n)state<=DRAIN;
     end
    end
    FLUSH:if(p_space)begin
     emit_n=remaining_body<carry_count?remaining_body:carry_count;
     if(emit_n>0)begin p_valid<=1;p_data<=carry;p_keep<=mask_bytes(emit_n);p_last<=1;generated<=generated+emit_n;end
     state<=REPORT;
    end
    DRAIN:if(fire)begin frame_bytes<=next_bytes[15:0];if(keep_bad)errors[12]<=1;if(s_error)errors[13]<=1;if(s_last)state<=REPORT;end
    REPORT:if(f_valid && f_ready)begin
     state<=resync_after?RESYNC:CAPTURE;prefix_index<=0;prefix<=0;errors<=0;frame_bytes<=0;generated<=0;
     reserved_q<=0;expected_body<=0;end_seen<=0;idle_count<=0;resync_after<=0;
    end
    default:begin end
   endcase
   if(fire && state!=RESYNC && next_bytes>MAX_FRAME_BYTES)begin errors[14]<=1;state<=REPORT;resync_after<=!s_last;end
  end
 end
endmodule
