# M4-01 shared reader adapter: 2025.1 simulation / OOC synthesis entry.
set ::m4_reader_root [file normalize [file join [file dirname [info script]] ..]]
set ::m4_reader_build ""

proc m4_reader_prepare {build_dir} {
 global m4_reader_root m4_reader_build
 if {[current_project -quiet] ne ""} {error "Close owned project first"}
 set m4_reader_build [file normalize $build_dir]
 set src [string tolower [string map {\\ /} $m4_reader_root]]
 set dst [string tolower [string map {\\ /} $m4_reader_build]]
 if {$src eq $dst || [string first "$src/" "$dst/"]==0} {error "Build must be outside repository"}
 if {[file exists [file join $m4_reader_build project m4_reader.xpr]]} {error "Use a fresh build directory"}
 file mkdir [file join $m4_reader_build vectors]
 file mkdir [file join $m4_reader_build reports]
 set f [open [file join $m4_reader_build vectors m4_reader_config.svh] w]
 puts $f "`define M4_READER_PASS \"[string map {\\ /} [file join $m4_reader_build vectors reader_pass.txt]]\""
 close $f
 create_project m4_reader [file join $m4_reader_build project] -part xcku5p-ffvb676-1-i
 foreach n {af_ring_store af_science_reader} {add_files [file join $m4_reader_root rtl $n.sv]}
 add_files -fileset sim_1 [file join $m4_reader_root sim tb_af_science_reader.sv]
 add_files -fileset constrs_1 [file join $m4_reader_root constraints m4_reader_ooc.xdc]
 set_property include_dirs [list [file join $m4_reader_build vectors]] [get_filesets sim_1]
 set_property top af_science_reader [get_filesets sources_1]
 set_property top tb_af_science_reader [get_filesets sim_1]
 set_property xsim.simulate.runtime all [get_filesets sim_1]
 set_property -dict [list {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} {-mode out_of_context} STEPS.SYNTH_DESIGN.ARGS.DIRECTIVE RuntimeOptimized] [get_runs synth_1]
 update_compile_order -fileset sources_1
 puts "M4_READER_PREPARE_READY=$m4_reader_build"
}

proc m4_reader_simulate {} {
 global m4_reader_build
 set marker [file join $m4_reader_build vectors reader_pass.txt]
 if {[file exists $marker]} {file delete $marker}
 launch_simulation -mode behavioral
 if {![file exists $marker]} {error "No fresh science reader acceptance marker"}
 file copy -force $marker [file join $m4_reader_build vectors behavioral_simulation_pass.txt]
 close_sim
 puts M4_READER_SIM_ACCEPTED
}

proc m4_reader_start {} {
 global m4_reader_build
 if {![file exists [file join $m4_reader_build vectors behavioral_simulation_pass.txt]]} {error "SIM first"}
 launch_runs synth_1 -jobs 2
}

proc m4_reader_collect {run} {
 global m4_reader_build
 if {$run ni {synth_1 impl_1}} {error "Invalid run"}
 set r [get_runs $run]
 if {[get_property PROGRESS $r] ne "100%" || [string match *ERROR* [get_property STATUS $r]]} {error "Run incomplete"}
 open_run $run
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1 || REF_NAME =~ IBUF* || REF_NAME =~ OBUF*}]]} {error "Blackbox or physical I/O in OOC"}
 report_utilization -file [file join $m4_reader_build reports utilization_$run.rpt]
 report_timing_summary -report_unconstrained -file [file join $m4_reader_build reports timing_$run.rpt]
 if {$run eq "impl_1"} {
  report_route_status -file [file join $m4_reader_build reports route_status.rpt]
  report_drc -file [file join $m4_reader_build reports drc.rpt]
  report_cdc -file [file join $m4_reader_build reports cdc.rpt]
 }
 write_checkpoint [file join $m4_reader_build af_science_reader_$run.dcp]
}
