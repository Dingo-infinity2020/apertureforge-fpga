set ::af_control_root [file normalize [file join [file dirname [info script]] ..]]
proc af_control_prepare {build_dir} {
 global af_control_root af_control_build
 if {[current_project -quiet] ne ""} {error "Close owned project first"}
 set af_control_build [file normalize $build_dir]
 set src [string tolower [string map {\\ /} $af_control_root]]
 set dst [string tolower [string map {\\ /} $af_control_build]]
 if {$src eq $dst || [string first "$src/" "$dst/"]==0 || [file exists $af_control_build]} {error "Fresh external directory required"}
 file mkdir [file join $af_control_build vectors]
 file mkdir [file join $af_control_build reports]
 set f [open [file join $af_control_build vectors af_control_config.svh] w]
 puts $f "`define AF_CONTROL_PASS \"[string map {\\ /} [file join $af_control_build vectors simulation_pass.txt]]\"";close $f
 create_project af_control [file join $af_control_build project] -part xcku5p-ffvb676-1-i
 add_files [file join $af_control_root rtl af_ring_control.sv]
 add_files -fileset sim_1 [file join $af_control_root sim tb_af_ring_control.sv]
 add_files -fileset constrs_1 [file join $af_control_root constraints af_control_ooc.xdc]
 set_property include_dirs [list [file join $af_control_build vectors]] [get_filesets sim_1]
 set_property top af_ring_control [get_filesets sources_1]
 set_property top tb_af_ring_control [get_filesets sim_1]
 set_property xsim.simulate.runtime all [get_filesets sim_1]
 set_property -dict [list {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} {-mode out_of_context}] [get_runs synth_1]
 update_compile_order -fileset sources_1
}
proc af_control_simulate {} {
 global af_control_build
 set marker [file join $af_control_build vectors simulation_pass.txt]
 if {[file exists $marker]} {file delete $marker}
 launch_simulation -mode behavioral
 if {![file exists $marker]} {error "No fresh control acceptance marker"}
 close_sim
 puts AF_CONTROL_SIM_ACCEPTED
}
proc af_control_start {} {
 global af_control_build
 if {![file exists [file join $af_control_build vectors simulation_pass.txt]]} {error "SIM first"}
 launch_runs synth_1 -jobs 2
}
proc af_control_collect {run} {
 global af_control_build
 if {$run ni {synth_1 impl_1}} {error "Invalid run"}
 set r [get_runs $run]
 if {[get_property PROGRESS $r] ne "100%" || [string match *ERROR* [get_property STATUS $r]]} {error "Run incomplete"}
 open_run $run
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1 || REF_NAME =~ IBUF* || REF_NAME =~ OBUF*}]]} {error "Blackbox or physical I/O in OOC"}
 report_utilization -file [file join $af_control_build reports utilization_$run.rpt]
 report_timing_summary -report_unconstrained -file [file join $af_control_build reports timing_$run.rpt]
 if {$run eq "impl_1"} {
  report_route_status -file [file join $af_control_build reports route_status.rpt]
  report_drc -file [file join $af_control_build reports drc.rpt]
  report_cdc -file [file join $af_control_build reports cdc.rpt]
 }
 write_checkpoint [file join $af_control_build af_control_$run.dcp]
}
