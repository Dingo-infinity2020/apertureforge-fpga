// Raw 512-bit payload storage only. Slot ownership/commit/generation live in ring_control.
// Full-size defaults: mapped128, 10 slots * 256 sources * 10 words/packet.
// No memory clear: consumers must use committed source masks. One synchronous clock.
module af_ring_store #(
 parameter integer WORDS=25600,
 parameter integer ADDR_W=$clog2(WORDS)
)(
 input wire clk,rst_n,
 input wire w_valid,input wire [ADDR_W-1:0] w_address,input wire [511:0] w_data,
 output wire w_ready,
 input wire r_valid,input wire [ADDR_W-1:0] r_address,output wire r_ready,
 output reg m_valid,input wire m_ready,output reg [511:0] m_data,
 output wire collision
);
 (* ram_style="ultra" *) reg [511:0] memory [0:WORDS-1];
 reg [511:0] read_q;reg read_valid;
 wire advance=!m_valid || m_ready;
 assign w_ready=rst_n && (w_address<WORDS);
 assign collision=w_valid && w_ready && r_valid && (r_address==w_address);
 assign r_ready=rst_n && advance && (r_address<WORDS) && !collision;
 // Same-address simultaneous read/write is explicitly serialized, never device-dependent.
 always @(posedge clk) begin
  if(w_valid && w_ready) memory[w_address]<=w_data;
  if(advance && r_valid && r_ready) read_q<=memory[r_address];
  if(advance) m_data<=read_q;
  if(!rst_n)begin read_valid<=0;m_valid<=0;end
  else if(advance)begin read_valid<=r_valid && r_ready;m_valid<=read_valid;end
 end
endmodule
