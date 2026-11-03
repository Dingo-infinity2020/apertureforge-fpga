`timescale 1ns/1ps
`include "af_core_perf_config.svh"
module tb_af_receive_core_perf;
 localparam BLOCKS=`AF_CORE_PERF_BLOCKS,PACKETS=BLOCKS*256,WORDS=`AF_CORE_PERF_WORDS;
 reg clk=0;always #2 clk=~clk;reg rst_n=0,running=0,cfgv=0;
 integer cycles=0,origin=0,sent=0,results=0,finished=0,first_input=-1,last_result=0,final_cycle=0;
 wire [63:0] tick=running?cycles-origin:0;
 reg [511:0] data=0;reg [63:0] keep=0;reg valid=0,last=0,bad=0;wire ready,cfgr,active,fault;wire [63:0] generation;
 wire rv,rc,rwf;wire [15:0] re,rsrc;wire [3:0] reason;wire [63:0] rseq,rgen;
 wire dv;reg dr=0;wire [63:0] ds,dg;wire [3:0] slot;wire [255:0] mask;wire [8:0] count;
 reg rdv=0;wire rdr;reg [3:0] rslot=0,rword=0;reg [15:0] rsource=0;wire mdv;reg mdr=0;wire [511:0] md;
 reg done=0;wire done_ready;reg [63:0] done_seq=0,done_gen=0;
 wire [63:0] requests,reserved,committed,aborted,rejected,consumed,discarded,canceled,resident,pending,written,denied,successes,failures;
 af_receive_core dut(.clk(clk),.rst_n(rst_n),.now_tick(tick),.s_data(data),.s_keep(keep),.s_valid(valid),.s_last(last),.s_error(bad),.s_ready(ready),
 .cfg_valid(cfgv),.cfg_ready(cfgr),.cfg_epoch(32'd7),.cfg_config(32'd11),.cfg_period_ticks(32'd6400),.cfg_first_sequence(64'd0),.cfg_first_deadline(64'd69200),.cfg_blocks(64'(BLOCKS)),
 .cfg_first_frequency(32'd2540),.cfg_adc_stride(32'd49152),.cfg_epoch_adc(64'd9007199254740993),.cfg_destination(16'd127),.cfg_frequencies(16'd20),.cfg_t_log2(2'd1),
 .cfg_mac(48'h020000000001),.cfg_ip(32'h0a000001),.cfg_port(16'd7148),.cfg_mtu(16'd9000),.active(active),.cfg_fault(fault),.generation(generation),
 .result_valid(rv),.result_ready(1'b1),.result_commit(rc),.result_write_fault(rwf),.result_errors(re),.result_source(rsrc),.result_reason(reason),.result_sequence(rseq),.result_generation(rgen),
 .desc_valid(dv),.desc_ready(dr),.desc_sequence(ds),.desc_generation(dg),.desc_slot(slot),.desc_mask(mask),.desc_count(count),
 .read_valid(rdv),.read_ready(rdr),.read_slot(rslot),.read_source(rsource),.read_word(rword),.data_valid(mdv),.data_ready(mdr),.data_out(md),
 .done_valid(done),.done_ready(done_ready),.done_sequence(done_seq),.done_generation(done_gen),
 .ring_requests(requests),.ring_reserved(reserved),.ring_committed(committed),.ring_aborted(aborted),.ring_rejected(rejected),
 .ring_consumed(consumed),.ring_discarded(discarded),.ring_canceled(canceled),.ring_resident(resident),.ring_pending(pending),
 .words_written(written),.writes_denied(denied),.results_committed(successes),.results_rejected(failures));
 reg [577:0] load [0:`AF_CORE_PERF_BEATS-1];reg [511:0] gold [0:WORDS-1];integer queue [0:WORDS-1];
 integer qin=0,qout=0,cstate=0,source_index=0,word_index=0,expected_block,expected_source;
 integer service_start=0,trace_fd,pass_fd,pause_cycles=0,peak_resident=0;reg [63:0] consumer_seq,consumer_gen;reg [3:0] consumer_slot;
 wire paused=tick>=63700 && tick<68700;
 always @(negedge clk)if(running)begin
  valid=sent<`AF_CORE_PERF_BEATS;if(valid){bad,last,keep,data}=load[sent];
  dr=cstate==0 && !paused;rdv=cstate==1;rslot=consumer_slot;rsource=source_index;rword=word_index;
  mdr=!paused && tick%32<25;done=cstate==3;done_seq=consumer_seq;done_gen=consumer_gen;
 end
 always @(posedge clk)begin
  cycles=cycles+1;if(cycles>200000)$fatal(1,"full-load timeout");
  if(running)begin
   if(paused)pause_cycles=pause_cycles+1;
   if(resident>peak_resident)peak_resident=resident;
   if(valid&&ready)begin if(first_input<0)first_input=cycles;sent=sent+1;end
   if(rv)begin
    expected_block=results/256;expected_source=((results%256)*73+expected_block*19)%256;
    if(!rc || rwf || re!=0 || reason!=0 || rgen!=1 || rseq!=expected_block || rsrc!=expected_source)$fatal(1,"load transaction rejected result=%0d seq=%0d src=%0d reason=%0d errors=%h",results,rseq,rsrc,reason,re);
    results=results+1;last_result=cycles;
   end
   if(rdv&&rdr)begin queue[qin]=(consumer_seq*256+source_index)*10+word_index;qin=qin+1;
    if(word_index==9)begin word_index=0;if(source_index==255)cstate=2;else source_index=source_index+1;end else word_index=word_index+1;
   end
   if(mdv&&mdr)begin if(qout>=qin || md!==gold[queue[qout]])$fatal(1,"full-load RAM mismatch word=%0d",qout);qout=qout+1;end
   case(cstate)
    0:if(dv&&dr)begin
     if(ds!=finished || mask!=={256{1'b1}} || count!=256 || dg!=1)$fatal(1,"full source mask mismatch block=%0d",finished);
     consumer_seq=ds;consumer_gen=dg;consumer_slot=slot;source_index=0;word_index=0;service_start=cycles;cstate=1;
    end
    2:if(qout==qin)cstate=3;
    3:if(done&&done_ready)begin
     $fwrite(trace_fd,"%0d,%0d,%0d,%0d\n",consumer_seq,service_start-origin,cycles-origin,cycles-service_start);
     finished=finished+1;cstate=0;
    end
    default:begin end
   endcase
   if(finished==BLOCKS)begin
    final_cycle=cycles;
    // Observe registered counters after the final consumer done edge.
    #1;
    if(results!=PACKETS || sent!=`AF_CORE_PERF_BEATS || qout!=WORDS || written!=WORDS || consumed!=PACKETS || committed!=PACKETS ||
     resident!=0 || pending!=0 || denied!=0 || rejected!=0 || aborted!=0 || discarded!=0 || canceled!=0 || failures!=0 || active || fault || pause_cycles!=5000)$fatal(1,"full-load terminal/accounting mismatch results=%0d consumed=%0d words=%0d pause=%0d",results,consumed,qout,pause_cycles);
    if(requests!=reserved+committed+aborted+rejected || reserved!=committed+aborted+canceled+pending || committed!=consumed+discarded+resident)$fatal(1,"full-load conservation failed");
    $fclose(trace_fd);pass_fd=$fopen(`AF_CORE_PERF_PASS,"w");
    $fwrite(pass_fd,"PASS blocks=%0d packets=%0d read_words=%0d receive_cycles=%0d end_to_end_cycles=%0d pause_cycles=%0d peak_resident_sources=%0d\n",BLOCKS,results,qout,last_result-first_input+1,final_cycle-first_input+1,pause_cycles,peak_resident);$fclose(pass_fd);
    $display("AF_CORE_PERF_PASS packets=%0d read_words=%0d receive_cycles=%0d total_cycles=%0d",results,qout,last_result-first_input+1,final_cycle-first_input+1);$finish;
   end
  end
 end
 initial begin
  $readmemh(`AF_CORE_PERF_LOAD_FILE,load);$readmemh(`AF_CORE_PERF_GOLD_FILE,gold);
  trace_fd=$fopen(`AF_CORE_PERF_TRACE,"w");$fwrite(trace_fd,"sequence,start_tick,end_tick,service_cycles\n");
  repeat(35)@(negedge clk);rst_n=1;
  @(negedge clk);cfgv=1;do @(posedge clk);while(!cfgr);
  @(negedge clk);cfgv=0;repeat(12)@(negedge clk);if(!active || fault)$fatal(1,"load config failed");
  valid=1;last=1;keep=1;do @(posedge clk);while(!ready);
  @(negedge clk);valid=0;last=0;origin=cycles;running=1;
 end
endmodule
