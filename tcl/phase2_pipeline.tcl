set ::af_pipeline_root [file normalize [file join [file dirname [info script]] ..]]
proc af_pipeline_prepare {build_dir} {
 global af_pipeline_build af_pipeline_root af_pipeline_clock_ps
 if {[current_project -quiet] ne ""} {error "Close known owned project first"}
 set af_pipeline_build [file normalize $build_dir]
 if {[file exists [file join $af_pipeline_build project af_pipeline.xpr]]} {error "Fresh pipeline project required"}
 set f [open [file join $af_pipeline_build vectors af_pipeline_config.svh] r];set cfg [read $f];close $f
 foreach key {SLOTS WPP DESC_DEPTH CLOCK_PS} {
  if {![regexp "`define AF_PIPE_${key} (\[0-9\]+)" $cfg -> value]} {error "Missing $key"}
  set param($key) $value
 }
 set af_pipeline_clock_ps $param(CLOCK_PS)
 file mkdir [file join $af_pipeline_build reports]
 create_project af_pipeline [file join $af_pipeline_build project] -part xcku5p-ffvb676-1-i
 set_property XPM_LIBRARIES {XPM_CDC XPM_FIFO} [current_project]
 foreach name {af_afp1_header_check af_packet_parser af_ring_control af_ring_store af_receive_core af_rx_ingress af_receive_pipeline} {
  add_files [file join $af_pipeline_root rtl $name.sv]
 }
 add_files -fileset sim_1 [file join $af_pipeline_root sim tb_af_receive_pipeline.sv]
 add_files -fileset constrs_1 [file join $af_pipeline_root constraints af_pipeline_ooc.xdc]
 set_property generic "SLOTS=$param(SLOTS) WORDS_PER_PACKET=$param(WPP) DESC_DEPTH=$param(DESC_DEPTH)" [get_filesets sources_1]
 set_property include_dirs [list [file join $af_pipeline_build vectors]] [get_filesets sim_1]
 set_property top af_receive_pipeline [get_filesets sources_1]
 set_property top tb_af_receive_pipeline [get_filesets sim_1]
 set_property xsim.simulate.runtime all [get_filesets sim_1]
 set_property -dict [list {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} {-mode out_of_context} STEPS.SYNTH_DESIGN.ARGS.DIRECTIVE RuntimeOptimized] [get_runs synth_1]
 update_compile_order -fileset sources_1
}
proc af_pipeline_simulate {} {
 global af_pipeline_build
 set marker [file join $af_pipeline_build vectors pipeline_pass.txt]
 if {[file exists $marker]} {error "Fresh pipeline acceptance required"}
 launch_simulation -mode behavioral
 set pass [file exists $marker]
 close_sim
 if {!$pass} {error "No fresh pipeline acceptance marker"}
 puts AF_PIPELINE_SIM_ACCEPTED
}
proc af_pipeline_start {} {
 global af_pipeline_build af_pipeline_clock_ps
 if {$af_pipeline_clock_ps!=8000} {error "This XDC implementation point is 125MHz; other clocks are SIM only"}
 if {![file exists [file join $af_pipeline_build vectors pipeline_pass.txt]]} {error "SIM first"}
 launch_runs synth_1 -jobs 2
}
proc af_pipeline_collect {run} {
 global af_pipeline_build
 if {$run ni {synth_1 impl_1}} {error "Invalid run"}
 if {[get_property PROGRESS [get_runs $run]] ne "100%" || [string match *ERROR* [get_property STATUS [get_runs $run]]]} {error "Run incomplete"}
 open_run $run
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1 || REF_NAME =~ IBUF* || REF_NAME =~ OBUF*}]]} {error "Blackbox or physical I/O"}
 report_utilization -file [file join $af_pipeline_build reports utilization_$run.rpt]
 report_utilization -hierarchical -file [file join $af_pipeline_build reports utilization_hier_$run.rpt]
 report_timing_summary -report_unconstrained -file [file join $af_pipeline_build reports timing_$run.rpt]
 report_clocks -file [file join $af_pipeline_build reports clocks_$run.rpt]
 report_cdc -file [file join $af_pipeline_build reports cdc_$run.rpt]
 if {$run eq "impl_1"} {
  report_route_status -file [file join $af_pipeline_build reports route_status.rpt]
  report_drc -file [file join $af_pipeline_build reports drc.rpt]
  report_bus_skew -file [file join $af_pipeline_build reports bus_skew.rpt]
 }
 write_checkpoint [file join $af_pipeline_build af_pipeline_$run.dcp]
}
