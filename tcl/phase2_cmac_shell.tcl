set ::af_cmac_shell_root [file normalize [file join [file dirname [info script]] ..]]
proc af_cmac_shell_prepare {build_dir {words_per_packet 20} {fast_sim 0}} {
 global af_cmac_shell_build af_cmac_shell_root
 if {[current_project -quiet] ne ""} {error "Close known owned project first"}
 set af_cmac_shell_build [file normalize $build_dir]
 if {[file exists [file join $af_cmac_shell_build project af_cmac_shell.xpr]]} {error "Fresh CMAC shell project required"}
 file mkdir [file join $af_cmac_shell_build reports]
 create_project af_cmac_shell [file join $af_cmac_shell_build project] -part xcku5p-ffvb676-1-i
 if {$words_per_packet ni {20 24}} {error "Supported shell storage points: 20 or 24 words"}
 set_property generic "SLOTS=5 WORDS_PER_PACKET=$words_per_packet DESC_DEPTH=256" [get_filesets sources_1]
 set f [open [file join $af_cmac_shell_build reports shell_parameters.tsv] w]
 puts $f "slots\t5\nwords_per_packet\t$words_per_packet\ndescriptor_depth\t256\ndata_depth\t4096"
 close $f
 set_property XPM_LIBRARIES {XPM_CDC XPM_FIFO} [current_project]
 foreach name {af_afp1_header_check af_packet_parser af_ring_control af_ring_store af_receive_core af_rx_ingress af_receive_pipeline af_cmac_rx af_cmac_receive_shell} {
  add_files [file join $af_cmac_shell_root rtl $name.sv]
 }
 add_files -fileset constrs_1 [file join $af_cmac_shell_root constraints af_cmac_shell_ooc.xdc]
 set_property top af_cmac_receive_shell [get_filesets sources_1]
 set_property -dict [list {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} {-mode out_of_context} STEPS.SYNTH_DESIGN.ARGS.DIRECTIVE RuntimeOptimized] [get_runs synth_1]
 create_ip -name cmac_usplus -vendor xilinx.com -library ip -version 3.1 -module_name af_cmac
 if {$fast_sim ni {0 1}} {error "fast_sim must be 0 or 1"}
 set_property -dict [list CONFIG.CMAC_CAUI4_MODE 1 CONFIG.USER_INTERFACE AXIS CONFIG.CMAC_CORE_SELECT CMACE4_X0Y0 \
  CONFIG.GT_GROUP_SELECT {X0Y12~X0Y15} CONFIG.GT_REF_CLK_FREQ 161.1328125 CONFIG.INCLUDE_RS_FEC 0 \
  CONFIG.RX_FRAME_CRC_CHECKING {Enable FCS Stripping} CONFIG.TX_FRAME_CRC_CHECKING {Enable FCS Insertion} CONFIG.RX_MAX_PACKET_LEN 9600 CONFIG.FAST_SIM_MODE $fast_sim] [get_ips af_cmac]
 set f [open [file join $af_cmac_shell_build reports cmac_configuration.tsv] w]
 puts $f "tool\t[version -short]";puts $f "part\t[get_property PART [current_project]]"
 foreach p [lsort [list_property [get_ips af_cmac]]] {if {[string match CONFIG.* $p]} {puts $f "$p\t[get_property $p [get_ips af_cmac]]"}}
 close $f
 generate_target all [get_ips af_cmac]
 create_ip_run [get_ips af_cmac]
 update_compile_order -fileset sources_1
 puts AF_CMAC_SHELL_PREPARED
}
proc af_cmac_shell_start_ip {} {
 launch_runs af_cmac_synth_1 -jobs 2
}
proc af_cmac_shell_start {} {
 set r [get_runs af_cmac_synth_1]
 if {[get_property PROGRESS $r] ne "100%" || [string match *ERROR* [get_property STATUS $r]]} {error "Actual CMAC IP synthesis first"}
 launch_runs synth_1 -jobs 2
}
proc af_cmac_shell_collect {run} {
 global af_cmac_shell_build
 if {$run ni {synth_1 impl_1}} {error "Invalid run"}
 if {[get_property PROGRESS [get_runs $run]] ne "100%" || [string match *ERROR* [get_property STATUS [get_runs $run]]]} {error "Run incomplete"}
 open_run $run
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1}]]} {error "Unresolved blackbox"}
 foreach {ref required} {CMACE4 1 GTYE4_CHANNEL 4 GTYE4_COMMON 1} {
  set actual [llength [get_cells -hier -quiet -filter "REF_NAME==$ref"]]
  if {$actual!=$required} {error "Expected $required real $ref, got $actual"}
 }
 report_utilization -file [file join $af_cmac_shell_build reports utilization_$run.rpt]
 report_utilization -hierarchical -file [file join $af_cmac_shell_build reports utilization_hier_$run.rpt]
 report_timing_summary -report_unconstrained -file [file join $af_cmac_shell_build reports timing_$run.rpt]
 report_clocks -file [file join $af_cmac_shell_build reports clocks_$run.rpt]
 report_clock_interaction -file [file join $af_cmac_shell_build reports clock_interaction_$run.rpt]
 report_cdc -details -file [file join $af_cmac_shell_build reports cdc_details_$run.rpt]
 report_cdc -file [file join $af_cmac_shell_build reports cdc_$run.rpt]
 set f [open [file join $af_cmac_shell_build reports physical_cells_$run.tsv] w]
 foreach cell [get_cells -hier -filter {REF_NAME==CMACE4 || REF_NAME==GTYE4_CHANNEL || REF_NAME==GTYE4_COMMON || REF_NAME==IBUFDS_GTE4 || REF_NAME==BUFG_GT}] {
  puts $f "$cell\t[get_property REF_NAME $cell]\t[get_property LOC $cell]"
 }
 close $f
 if {$run eq "impl_1"} {
  report_route_status -file [file join $af_cmac_shell_build reports route_status.rpt]
  report_drc -file [file join $af_cmac_shell_build reports drc.rpt]
  report_bus_skew -file [file join $af_cmac_shell_build reports bus_skew.rpt]
 }
 write_checkpoint [file join $af_cmac_shell_build af_cmac_shell_$run.dcp]
}
