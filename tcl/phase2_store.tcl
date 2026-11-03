# Full-size raw payload store experiment, independent of network IP and slot control.
set ::af_store_root [file normalize [file join [file dirname [info script]] ..]]
proc af_store_prepare {build_dir words} {
 global af_store_root af_store_build
 if {[current_project -quiet] ne ""} {error "Close owned project first"}
 if {$words ni {25600 28672}} {error "Use mapped128=25600 or candidate128=28672 words"}
 set af_store_build [file normalize $build_dir]
 set src [string tolower [string map {\\ /} $af_store_root]]
 set dst [string tolower [string map {\\ /} $af_store_build]]
 if {$dst eq $src || [string first "$src/" "$dst/"]==0} {error "External build required"}
 if {[file exists $af_store_build]} {error "Fresh build directory required"}
 file mkdir [file join $af_store_build reports]
 file mkdir [file join $af_store_build vectors]
 set f [open [file join $af_store_build vectors af_store_config.svh] w]
 puts $f "`define AF_STORE_WORDS $words"
 puts $f "`define AF_STORE_PASS \"[string map {\\ /} [file join $af_store_build vectors simulation_pass.txt]]\""
 close $f
 create_project af_store [file join $af_store_build project] -part xcku5p-ffvb676-1-i
 add_files [file join $af_store_root rtl af_ring_store.sv]
 add_files -fileset constrs_1 [file join $af_store_root constraints af_store_ooc.xdc]
 add_files -fileset sim_1 [file join $af_store_root sim tb_af_ring_store.sv]
 set_property generic "WORDS=$words" [get_filesets sources_1]
 set_property include_dirs [list [file join $af_store_build vectors]] [get_filesets sim_1]
 set_property top af_ring_store [get_filesets sources_1]
 set_property top tb_af_ring_store [get_filesets sim_1]
 set_property xsim.simulate.runtime all [get_filesets sim_1]
 set_property -dict [list {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} {-mode out_of_context}] [get_runs synth_1]
 if {[get_property {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} [get_runs synth_1]] ne "-mode out_of_context"} {error "OOC option missing"}
 update_compile_order -fileset sources_1
}
proc af_store_simulate {} {
 global af_store_build
 set marker [file join $af_store_build vectors simulation_pass.txt]
 if {[file exists $marker]} {file delete $marker}
 launch_simulation -mode behavioral
 if {![file exists $marker]} {error "No simulation acceptance marker"}
 file copy -force $marker [file join $af_store_build vectors behavioral_simulation_pass.txt]
 close_sim
 puts AF_STORE_SIM_ACCEPTED
}
proc af_store_netlist_simulate {} {
 global af_store_build
 set marker [file join $af_store_build vectors simulation_pass.txt]
 if {[get_property PROGRESS [get_runs impl_1]] ne "100%"} {error "Route first"}
 if {[file exists $marker]} {file delete $marker}
 launch_simulation -mode post-implementation -type functional
 if {![file exists $marker]} {error "No fresh netlist simulation acceptance marker"}
 file copy -force $marker [file join $af_store_build vectors post_implementation_simulation_pass.txt]
 close_sim
 puts AF_STORE_NETLIST_SIM_ACCEPTED
}
proc af_store_start_synthesis {} {
 global af_store_build
 if {![file exists [file join $af_store_build vectors simulation_pass.txt]]} {error "SIM first"}
 launch_runs synth_1 -jobs 2
}
proc af_store_collect {run} {
 global af_store_build
 if {$run ni {synth_1 impl_1}} {error "Unknown run"}
 set r [get_runs $run]
 if {[get_property PROGRESS $r] ne "100%" || [string match *ERROR* [get_property STATUS $r]]} {error "Run incomplete"}
 open_run $run
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1}]]} {error "Black boxes"}
 if {[llength [get_cells -hier -quiet -filter {REF_NAME =~ IBUF* || REF_NAME =~ OBUF*}]]} {error "Physical buffers found in OOC"}
 report_utilization -file [file join $af_store_build reports utilization_$run.rpt]
 report_timing_summary -report_unconstrained -file [file join $af_store_build reports timing_$run.rpt]
 if {$run eq "impl_1"} {
  report_route_status -file [file join $af_store_build reports route_status.rpt]
  report_drc -file [file join $af_store_build reports drc.rpt]
  report_cdc -file [file join $af_store_build reports cdc.rpt]
 }
 write_checkpoint [file join $af_store_build af_store_$run.dcp]
 puts AF_STORE_COLLECTED=$run
}
