# Offline RTL proof; source using Vivado MCP. Builds remain outside repository.
set ::af_header_root [file normalize [file join [file dirname [info script]] ..]]
proc af_header_prepare {build_dir} {
 global af_header_build af_header_root
 if {[current_project -quiet] ne ""} {error "An existing project is open"}
 set af_header_build [file normalize $build_dir]
 set root [string tolower [string map {\\ /} $af_header_root]]
 set out [string tolower [string map {\\ /} $af_header_build]]
 if {$out eq $root || [string first "$root/" "$out/"]==0} {error "Build must be outside source"}
 if {[file exists [file join $af_header_build project af_header.xpr]]} {error "Use fresh build directory"}
 if {![file exists [file join $af_header_build vectors af_header_config.svh]]} {error "Generate vectors first"}
 if {[file exists [file join $af_header_build vectors simulation_pass.txt]]} {error "Stale simulation marker"}
 file mkdir [file join $af_header_build reports]
 create_project af_header [file join $af_header_build project] -part xcku5p-ffvb676-1-i
 add_files [file join $af_header_root rtl af_afp1_header_check.sv]
 add_files -fileset constrs_1 [file join $af_header_root constraints af_header_ooc.xdc]
 add_files -fileset sim_1 [file join $af_header_root sim tb_af_afp1_header_check.sv]
 set_property include_dirs [list [file join $af_header_build vectors]] [get_filesets sim_1]
 set_property top tb_af_afp1_header_check [get_filesets sim_1]
 set_property top af_afp1_header_check [get_filesets sources_1]
 set_property xsim.simulate.runtime all [get_filesets sim_1]
 set_property -dict [list {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} {-mode out_of_context}] [get_runs synth_1]
 if {[get_property {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} [get_runs synth_1]] ne "-mode out_of_context"} {error "OOC option missing"}
 update_compile_order -fileset sources_1
}
proc af_header_simulate {} {
 global af_header_build
 set marker [file join $af_header_build vectors simulation_pass.txt]
 if {[file exists $marker]} {file delete $marker}
 launch_simulation -mode behavioral
 if {![file exists $marker]} {error "Simulation did not produce acceptance marker"}
 close_sim
 puts AF_HEADER_SIM_ACCEPTED
}
proc af_header_start_synthesis {} {
 global af_header_build
 if {![file exists [file join $af_header_build vectors simulation_pass.txt]]} {error "SIM first"}
 launch_runs synth_1 -jobs 2
}
proc af_header_collect_synthesis {} {
 global af_header_build
 set r [get_runs synth_1]
 if {[get_property PROGRESS $r] ne "100%" || [string match *ERROR* [get_property STATUS $r]]} {error "Synthesis not accepted"}
 open_run synth_1
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1}]]} {error "Black boxes"}
 if {[llength [get_cells -hier -quiet -filter {REF_NAME =~ IBUF* || REF_NAME =~ OBUF*}]]} {error "Unexpected physical I/O buffers: OOC did not apply"}
 report_utilization -file [file join $af_header_build reports utilization_synth.rpt]
 report_utilization -hierarchical -file [file join $af_header_build reports utilization_hier_synth.rpt]
 report_timing_summary -file [file join $af_header_build reports timing_synth.rpt]
 write_checkpoint [file join $af_header_build af_header_synth.dcp]
 puts AF_HEADER_SYNTH_COLLECTED
}
proc af_header_start_route {} {
 launch_runs impl_1 -to_step route_design -jobs 2
}
proc af_header_collect_route {} {
 global af_header_build
 set r [get_runs impl_1]
 if {[get_property PROGRESS $r] ne "100%" || [string match *ERROR* [get_property STATUS $r]]} {error "Routing not complete"}
 open_run impl_1
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1}]]} {error "Black boxes"}
 report_utilization -file [file join $af_header_build reports utilization_route.rpt]
 report_timing_summary -report_unconstrained -file [file join $af_header_build reports timing_route.rpt]
 report_route_status -file [file join $af_header_build reports route_status.rpt]
 report_drc -file [file join $af_header_build reports drc.rpt]
 report_cdc -file [file join $af_header_build reports cdc.rpt]
 write_checkpoint [file join $af_header_build af_header_route.dcp]
 puts AF_HEADER_ROUTE_COLLECTED
}
proc af_header_recheck_routed_clocks {} {
 global af_header_build
 # Timing re-analysis of the SAME placed/routed netlist, not fresh implementation runs.
 open_run impl_1
 foreach {mhz period} {200 5.000 125 8.000} {
  create_clock -name clk -period $period [get_ports clk]
  report_timing_summary -report_unconstrained -file [file join $af_header_build reports timing_route_recheck_${mhz}mhz.rpt]
 }
 # Restore the experiment's original constraint in the open design.
 create_clock -name clk -period 4.000 [get_ports clk]
 puts AF_HEADER_CLOCK_RECHECKED
}
