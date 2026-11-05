set ::af_ingress_root [file normalize [file join [file dirname [info script]] ..]]
proc af_ingress_prepare {build_dir} {
 global af_ingress_build af_ingress_root
 if {[current_project -quiet] ne ""} {error "Close only the known owned project first"}
 set af_ingress_build [file normalize $build_dir]
 if {[file exists [file join $af_ingress_build project af_ingress.xpr]]} {error "Fresh ingress project required"}
 file mkdir [file join $af_ingress_build reports]
 create_project af_ingress [file join $af_ingress_build project] -part xcku5p-ffvb676-1-i
 set_property XPM_LIBRARIES {XPM_CDC XPM_FIFO} [current_project]
 add_files [file join $af_ingress_root rtl af_rx_ingress.sv]
 add_files -fileset sim_1 [file join $af_ingress_root sim tb_af_rx_ingress.sv]
 add_files -fileset constrs_1 [file join $af_ingress_root constraints af_ingress_ooc.xdc]
 set_property include_dirs [list [file join $af_ingress_build vectors]] [get_filesets sim_1]
 set_property top af_rx_ingress [get_filesets sources_1]
 set_property top tb_af_rx_ingress [get_filesets sim_1]
 set_property xsim.simulate.runtime all [get_filesets sim_1]
 set_property -dict [list {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} {-mode out_of_context}] [get_runs synth_1]
 update_compile_order -fileset sources_1
}
proc af_ingress_simulate {} {
 global af_ingress_build
 set marker [file join $af_ingress_build vectors ingress_pass.txt]
 if {[file exists $marker]} {error "Fresh ingress acceptance required"}
 launch_simulation -mode behavioral
 set pass [file exists $marker]
 close_sim
 if {!$pass} {error "No fresh ingress acceptance marker"}
 puts AF_INGRESS_SIM_ACCEPTED
}
proc af_ingress_collect {run} {
 global af_ingress_build
 if {$run ni {synth_1 impl_1}} {error "Invalid run"}
 if {[get_property PROGRESS [get_runs $run]] ne "100%" || [string match *ERROR* [get_property STATUS [get_runs $run]]]} {error "Run incomplete"}
 open_run $run
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1 || REF_NAME =~ IBUF* || REF_NAME =~ OBUF*}]]} {error "Blackbox or physical I/O in OOC"}
 report_utilization -file [file join $af_ingress_build reports utilization_$run.rpt]
 report_utilization -hierarchical -file [file join $af_ingress_build reports utilization_hier_$run.rpt]
 report_timing_summary -report_unconstrained -file [file join $af_ingress_build reports timing_$run.rpt]
 report_clocks -file [file join $af_ingress_build reports clocks_$run.rpt]
 report_cdc -file [file join $af_ingress_build reports cdc_$run.rpt]
 if {$run eq "impl_1"} {
  report_route_status -file [file join $af_ingress_build reports route_status.rpt]
  report_drc -file [file join $af_ingress_build reports drc.rpt]
 }
 write_checkpoint [file join $af_ingress_build af_ingress_$run.dcp]
}
