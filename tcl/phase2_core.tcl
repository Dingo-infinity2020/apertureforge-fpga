set ::af_core_root [file normalize [file join [file dirname [info script]] ..]]
proc af_core_prepare {build_dir} {
 global af_core_root af_core_build
 if {[current_project -quiet] ne ""} {error "Close owned project first"}
 set af_core_build [file normalize $build_dir]
 set src [string tolower [string map {\\ /} $af_core_root]]
 set dst [string tolower [string map {\\ /} $af_core_build]]
 if {$src eq $dst || [string first "$src/" "$dst/"]==0 || [file exists [file join $af_core_build project af_core.xpr]]} {error "Fresh external project required"}
 if {![file exists [file join $af_core_build vectors af_core_config.svh]]} {error "Generate vectors first"}
 file mkdir [file join $af_core_build reports]
 create_project af_core [file join $af_core_build project] -part xcku5p-ffvb676-1-i
 foreach n {af_afp1_header_check af_packet_parser af_ring_control af_ring_store af_receive_core} {add_files [file join $af_core_root rtl $n.sv]}
 add_files -fileset sim_1 [file join $af_core_root sim tb_af_receive_core.sv]
 add_files -fileset constrs_1 [file join $af_core_root constraints af_core_ooc.xdc]
 set_property include_dirs [list [file join $af_core_build vectors]] [get_filesets sim_1]
 set_property top af_receive_core [get_filesets sources_1]
 set_property top tb_af_receive_core [get_filesets sim_1]
 set_property xsim.simulate.runtime all [get_filesets sim_1]
 set_property -dict [list {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} {-mode out_of_context} STEPS.SYNTH_DESIGN.ARGS.DIRECTIVE RuntimeOptimized] [get_runs synth_1]
 update_compile_order -fileset sources_1
}
proc af_core_simulate {} {
 global af_core_build
 set marker [file join $af_core_build vectors simulation_pass.txt]
 if {[file exists $marker]} {file delete $marker}
 launch_simulation -mode behavioral
 if {![file exists $marker]} {error "No fresh receive core acceptance marker"}
 file copy -force $marker [file join $af_core_build vectors behavioral_simulation_pass.txt]
 close_sim
 puts AF_CORE_SIM_ACCEPTED
}
proc af_core_start {} {
 global af_core_build
 if {![file exists [file join $af_core_build vectors behavioral_simulation_pass.txt]]} {error "SIM first"}
 launch_runs synth_1 -jobs 2
}
proc af_core_collect {run} {
 global af_core_build
 if {$run ni {synth_1 impl_1}} {error "Invalid run"}
 set r [get_runs $run]
 if {[get_property PROGRESS $r] ne "100%" || [string match *ERROR* [get_property STATUS $r]]} {error "Run incomplete"}
 open_run $run
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1 || REF_NAME =~ IBUF* || REF_NAME =~ OBUF*}]]} {error "Blackbox or physical I/O in OOC"}
 report_utilization -file [file join $af_core_build reports utilization_$run.rpt]
 report_utilization -hierarchical -file [file join $af_core_build reports utilization_hier_$run.rpt]
 report_timing_summary -report_unconstrained -file [file join $af_core_build reports timing_$run.rpt]
 if {$run eq "impl_1"} {
  report_route_status -file [file join $af_core_build reports route_status.rpt]
  report_drc -file [file join $af_core_build reports drc.rpt]
  report_cdc -file [file join $af_core_build reports cdc.rpt]
 }
 write_checkpoint [file join $af_core_build af_core_$run.dcp]
}
