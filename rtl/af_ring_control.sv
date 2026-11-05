// Transactional metadata only; payload RAM is af_ring_store.
// Priority: session install > consumer done > seal head > one transaction.
// now_tick is monotonic within a session. Equality with a deadline is LATE.
// Statistics wrap modulo 2^64; protocol tags/deadlines never wrap silently.
module af_ring_control #(
 parameter integer SOURCES=256,SLOTS=10,SW=$clog2(SLOTS),PREVIEW=1
)(
 input wire clk,rst_n,input wire [63:0] now_tick,
 input wire cfg_valid,output wire cfg_ready,
 input wire [31:0] cfg_epoch,cfg_config,cfg_period_ticks,
 input wire [63:0] cfg_first_sequence,cfg_first_deadline,cfg_blocks,
 output reg active,output reg cfg_fault,output reg [63:0] generation,
 // op 0 reserve, 1 commit, 2 abort. Slot/generation are returned reservation handles.
 input wire cmd_valid,output wire cmd_ready,input wire [1:0] cmd_op,
 input wire [31:0] cmd_epoch,cmd_config,input wire [63:0] cmd_sequence,cmd_generation,
 input wire [15:0] cmd_source,input wire [SW-1:0] cmd_slot,
 input wire cmd_pre_valid,input wire [31:0] cmd_pre_epoch,cmd_pre_config,
 input wire [63:0] cmd_pre_sequence,input wire [15:0] cmd_pre_source,
 output reg rsp_valid,input wire rsp_ready,output reg rsp_accepted,output reg [3:0] rsp_reason,
 output reg [SW-1:0] rsp_slot,output reg [63:0] rsp_sequence,rsp_generation,
 // Every payload write must still possess the pending reservation.
 input wire [SW-1:0] write_slot,input wire [63:0] write_sequence,write_generation,
 input wire [15:0] write_source,output wire write_permit,
 output reg desc_valid,input wire desc_ready,output reg [63:0] desc_sequence,desc_generation,
 output reg [SW-1:0] desc_slot,output reg [SOURCES-1:0] desc_mask,
 output reg [$clog2(SOURCES+1)-1:0] desc_count,
 input wire done_valid,output wire done_ready,input wire [63:0] done_sequence,done_generation,
 output reg [63:0] requests,reserved,committed,aborted,rejected,consumed,discarded,canceled,
 output reg [63:0] resident,pending_total,bad_done
);
 localparam CW=$clog2(SOURCES+1);
 reg [SOURCES-1:0] pending [0:SLOTS-1],present [0:SLOTS-1];
 reg [CW-1:0] pending_count [0:SLOTS-1],present_count [0:SLOTS-1];
 reg [63:0] tag [0:SLOTS-1],deadline [0:SLOTS-1];
 reg [SLOTS-1:0] live,sealed;
 reg [31:0] epoch_q,config_q,period_q;
 reg [63:0] head_sequence,last_sequence,remaining;
 reg [SW-1:0] head,init_index;reg initializing,busy;
 reg [64:0] init_sequence,init_deadline;
 reg pre_a_valid,pre_b_valid;
 reg [SW-1:0] pre_a_slot,pre_b_slot;
 reg [15:0] pre_a_source,pre_b_source;
 reg [31:0] pre_a_epoch,pre_a_config,pre_b_epoch,pre_b_config;
 reg [63:0] pre_a_sequence,pre_a_head_sequence,pre_a_delta;
 reg [63:0] pre_b_sequence,pre_b_head_sequence,pre_b_delta,pre_b_tag,pre_b_deadline;
 reg [SOURCES-1:0] pre_a_pending,pre_a_present;
 reg pre_a_live,pre_a_sealed,pre_b_pending_bit,pre_b_present_bit,pre_b_live,pre_b_sealed;
 wire [64:0] cfg_last={1'b0,cfg_first_sequence}+{1'b0,cfg_blocks}-1;
 wire [63:0] delta=cmd_sequence-head_sequence;
 wire [SW:0] slot_sum={1'b0,head}+{1'b0,delta[SW-1:0]};
 wire [SW-1:0] reserve_slot=slot_sum>=SLOTS?slot_sum-SLOTS:slot_sum;
 wire seal_now=active && !busy && !desc_valid && (present_count[head]==SOURCES || now_tick>=deadline[head]);
 wire rsp_free=!rsp_valid || rsp_ready;
 wire [63:0] pre_delta=cmd_pre_sequence-head_sequence;
 wire [SW:0] pre_slot_sum={1'b0,head}+{1'b0,pre_delta[SW-1:0]};
 wire [SW-1:0] pre_reserve_slot=pre_slot_sum>=SLOTS?pre_slot_sum-SLOTS:pre_slot_sum;
 wire pre_invalidate=cfg_valid&&cfg_ready || initializing || (done_valid&&done_ready) || seal_now;
 wire pre_fresh=PREVIEW!=0 && pre_b_valid && !pre_invalidate && pre_b_head_sequence==head_sequence &&
  pre_b_sequence==cmd_sequence && pre_b_source==cmd_source && pre_b_epoch==cmd_epoch && pre_b_config==cmd_config;
 wire use_pre=PREVIEW!=0 && cmd_op==0 && pre_fresh;
 wire use_legacy_reserve=PREVIEW==0 && cmd_op==0;
 wire reserve_ready=cmd_op!=0 || use_pre || use_legacy_reserve;
 assign cfg_ready=rst_n && !initializing && generation!=64'hffffffffffffffff;
 assign done_ready=rst_n && !initializing && !cfg_valid;
 assign cmd_ready=rst_n && !initializing && !cfg_valid && !done_valid && !seal_now && rsp_free && reserve_ready;
 wire write_index_valid=write_slot<SLOTS && write_source<SOURCES;
 assign write_permit=rst_n && active && !cfg_valid && write_index_valid &&
  write_generation==generation && live[write_slot] && !sealed[write_slot] &&
  tag[write_slot]==write_sequence && now_tick<deadline[write_slot] && pending[write_slot][write_source[$clog2(SOURCES)-1:0]];
 reg [3:0] reason;
 always @* begin
  reason=0;
  // cmd_ready is the preview freshness gate. Keep evaluation/address selection
  // independent of that gate, so valid/header errors do not select RAM rows.
  if(PREVIEW!=0 && cmd_op==0)begin
   if(!active)reason=7;
   else if(pre_b_epoch!=epoch_q || pre_b_config!=config_q)reason=1;
   else if(pre_b_source>=SOURCES)reason=2;
   else if(pre_b_sequence<head_sequence)reason=3;
   else if(pre_b_delta>=SLOTS || pre_b_sequence>last_sequence)reason=4;
   else if(!pre_b_live || pre_b_tag!=pre_b_sequence)reason=6;
   else if(pre_b_sealed || now_tick>=pre_b_deadline)reason=3;
   else if(pre_b_pending_bit || pre_b_present_bit)reason=5;
  end else if(cmd_op!=0)begin
   if(!active)reason=7;
   else if(cmd_epoch!=epoch_q || cmd_config!=config_q || cmd_generation!=generation)reason=1;
   else if(cmd_source>=SOURCES || cmd_op==3 || cmd_slot>=SLOTS)reason=2;
   else if(cmd_sequence<head_sequence)reason=3;
   else if(delta>=SLOTS || cmd_sequence>last_sequence)reason=4;
   else if(!live[cmd_slot] || tag[cmd_slot]!=cmd_sequence)reason=6;
   else if(sealed[cmd_slot] || now_tick>=deadline[cmd_slot])reason=3;
   else if(!pending[cmd_slot][cmd_source[$clog2(SOURCES)-1:0]])reason=6;
  end else if(PREVIEW==0)begin
   if(!active)reason=7;
   else if(cmd_epoch!=epoch_q || cmd_config!=config_q)reason=1;
   else if(cmd_source>=SOURCES)reason=2;
   else if(cmd_sequence<head_sequence)reason=3;
   else if(delta>=SLOTS || cmd_sequence>last_sequence)reason=4;
   else if(!live[reserve_slot] || tag[reserve_slot]!=cmd_sequence)reason=6;
   else if(sealed[reserve_slot] || now_tick>=deadline[reserve_slot])reason=3;
   else if(pending[reserve_slot][cmd_source[$clog2(SOURCES)-1:0]] || present[reserve_slot][cmd_source[$clog2(SOURCES)-1:0]])reason=5;
  end else reason=7;
 end
 wire [SW-1:0] eff_slot=cmd_op==0?(PREVIEW!=0?pre_b_slot:reserve_slot):cmd_slot;
 // A fresh preview guarantees identity with cmd_source/cmd_sequence. Using
 // those fields directly removes a redundant high-fanout freshness mux.
 wire [$clog2(SOURCES)-1:0] eff_source=cmd_source[$clog2(SOURCES)-1:0];
 wire [63:0] eff_sequence=cmd_sequence;
 wire [64:0] next_tag={1'b0,tag[head]}+SLOTS;
 wire [63:0] recycle_delta=period_q*SLOTS;
 wire [64:0] next_deadline={1'b0,deadline[head]}+{1'b0,recycle_delta};
 integer i;
 always @(posedge clk)begin
  if(!rst_n)begin
   pre_a_valid<=0;pre_b_valid<=0;
   pre_a_slot<=0;pre_b_slot<=0;pre_a_source<=0;pre_b_source<=0;
   pre_a_epoch<=0;pre_a_config<=0;pre_b_epoch<=0;pre_b_config<=0;
   pre_a_sequence<=0;pre_a_head_sequence<=0;pre_a_delta<=0;
   pre_b_sequence<=0;pre_b_head_sequence<=0;pre_b_delta<=0;pre_b_tag<=0;pre_b_deadline<=0;
   pre_a_pending<=0;pre_a_present<=0;
   pre_a_live<=0;pre_a_sealed<=0;pre_b_pending_bit<=0;pre_b_present_bit<=0;pre_b_live<=0;pre_b_sealed<=0;
  end else begin
   if(cmd_pre_valid)begin
    pre_a_valid<=1;
    pre_a_slot<=pre_reserve_slot;
    pre_a_source<=cmd_pre_source;
    pre_a_epoch<=cmd_pre_epoch;pre_a_config<=cmd_pre_config;
    pre_a_sequence<=cmd_pre_sequence;pre_a_head_sequence<=head_sequence;pre_a_delta<=pre_delta;
    pre_a_pending<=pending[pre_reserve_slot];pre_a_present<=present[pre_reserve_slot];
    pre_a_live<=live[pre_reserve_slot];pre_a_sealed<=sealed[pre_reserve_slot];
   end else pre_a_valid<=0;
   if(pre_a_valid)begin
    pre_b_valid<=1;
    pre_b_slot<=pre_a_slot;pre_b_source<=pre_a_source;
    pre_b_epoch<=pre_a_epoch;pre_b_config<=pre_a_config;
    pre_b_sequence<=pre_a_sequence;pre_b_head_sequence<=pre_a_head_sequence;pre_b_delta<=pre_a_delta;
    pre_b_tag<=tag[pre_a_slot];pre_b_deadline<=deadline[pre_a_slot];
    pre_b_pending_bit<=pre_a_pending[pre_a_source[$clog2(SOURCES)-1:0]];
    pre_b_present_bit<=pre_a_present[pre_a_source[$clog2(SOURCES)-1:0]];
    pre_b_live<=pre_a_live;pre_b_sealed<=pre_a_sealed;
   end
   // Both stages can contain pre-transaction state. Flushing only B lets
   // stale A revalidate it one cycle later (e.g. an immediate duplicate).
   if(pre_invalidate || (cmd_valid && cmd_ready))begin pre_a_valid<=0;pre_b_valid<=0;end
  end
 end
 always @(posedge clk)begin
  if(!rst_n)begin
   active<=0;cfg_fault<=0;generation<=0;initializing<=0;busy<=0;
   rsp_valid<=0;desc_valid<=0;live<=0;sealed<=0;head<=0;
   requests<=0;reserved<=0;committed<=0;aborted<=0;rejected<=0;consumed<=0;discarded<=0;canceled<=0;
   resident<=0;pending_total<=0;bad_done<=0;
   for(i=0;i<SLOTS;i=i+1)begin pending[i]<=0;present[i]<=0;pending_count[i]<=0;present_count[i]<=0;tag[i]<=0;deadline[i]<=0;end
  end else begin
   if(rsp_valid && rsp_ready)rsp_valid<=0;
   if(desc_valid && desc_ready)begin desc_valid<=0;busy<=1;end
   if(cfg_valid && cfg_ready)begin
    generation<=generation+1;active<=0;busy<=0;desc_valid<=0;rsp_valid<=0;live<=0;sealed<=0;
    discarded<=discarded+resident;resident<=0;canceled<=canceled+pending_total;pending_total<=0;
    epoch_q<=cfg_epoch;config_q<=cfg_config;period_q<=cfg_period_ticks;
    head<=0;head_sequence<=cfg_first_sequence;last_sequence<=cfg_last[63:0];remaining<=cfg_blocks;
    init_index<=0;init_sequence<={1'b0,cfg_first_sequence};init_deadline<={1'b0,cfg_first_deadline};
    cfg_fault<=cfg_blocks==0 || cfg_period_ticks==0 || cfg_last[64];
    initializing<=cfg_blocks!=0 && cfg_period_ticks!=0 && !cfg_last[64];
   end else if(initializing)begin
    pending[init_index]<=0;present[init_index]<=0;pending_count[init_index]<=0;present_count[init_index]<=0;
    tag[init_index]<=init_sequence[63:0];deadline[init_index]<=init_deadline[63:0];
    live[init_index]<=init_index<remaining;
    if(init_index<remaining && (init_sequence[64] || init_deadline[64]))cfg_fault<=1;
    init_sequence<=init_sequence+1;init_deadline<=init_deadline+{33'd0,period_q};
    if(init_index==SLOTS-1)begin initializing<=0;active<=!cfg_fault && !(init_index<remaining && (init_sequence[64] || init_deadline[64]));end
    else init_index<=init_index+1;
   end else if(done_valid && done_ready)begin
    if(active && busy && done_generation==generation && done_sequence==head_sequence)begin
     busy<=0;consumed<=consumed+present_count[head];resident<=resident-present_count[head];
     pending[head]<=0;present[head]<=0;pending_count[head]<=0;present_count[head]<=0;sealed[head]<=0;
     live[head]<=remaining>SLOTS;
     if(remaining>SLOTS)begin
      tag[head]<=next_tag[63:0];deadline[head]<=next_deadline[63:0];
      if(next_tag[64] || next_deadline[64])begin active<=0;cfg_fault<=1;end
     end
     remaining<=remaining-1;
     if(remaining==1)active<=0;
     else begin head_sequence<=head_sequence+1;head<=head==SLOTS-1?0:head+1;end
    end else bad_done<=bad_done+1;
   end else if(seal_now)begin
    sealed[head]<=1;desc_valid<=1;desc_sequence<=head_sequence;desc_generation<=generation;
    desc_slot<=head;desc_mask<=present[head];desc_count<=present_count[head];
    canceled<=canceled+pending_count[head];pending_total<=pending_total-pending_count[head];
    pending[head]<=0;pending_count[head]<=0;
   end else if(cmd_valid && cmd_ready)begin
    requests<=requests+1;rsp_valid<=1;rsp_accepted<=reason==0;rsp_reason<=reason;
    rsp_slot<=eff_slot;rsp_sequence<=eff_sequence;rsp_generation<=generation;
    if(reason!=0)rejected<=rejected+1;
    else if(cmd_op==0)begin
     reserved<=reserved+1;pending_total<=pending_total+1;pending_count[eff_slot]<=pending_count[eff_slot]+1;
     pending[eff_slot][eff_source]<=1;
    end else begin
     pending[eff_slot][eff_source]<=0;pending_count[eff_slot]<=pending_count[eff_slot]-1;pending_total<=pending_total-1;
     if(cmd_op==1)begin
      committed<=committed+1;resident<=resident+1;present_count[eff_slot]<=present_count[eff_slot]+1;
      present[eff_slot][eff_source]<=1;
     end else aborted<=aborted+1;
    end
   end
  end
 end
endmodule
