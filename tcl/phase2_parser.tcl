set ::af_parser_root [file normalize [file join [file dirname [info script]] ..]]
proc af_parser_prepare {build_dir width} {
 global af_parser_root af_parser_build
 if {[current_project -quiet] ne "" || $width ni {32 64 512}} {error "Close owned project and select 32/64/512"}
 set af_parser_build [file normalize $build_dir]
 set src [string tolower [string map {\\ /} $af_parser_root]]
 set dst [string tolower [string map {\\ /} $af_parser_build]]
 if {$src eq $dst || [string first "$src/" "$dst/"]==0} {error "External build required"}
 if {[file exists [file join $af_parser_build project af_parser.xpr]]} {error "Fresh project required"}
 set inc [file join $af_parser_build vectors af_parser_config.svh]
 set f [open $inc r];set cfg [read $f];close $f
 if {![regexp {`define AF_PARSER_WIDTH ([0-9]+)} $cfg -> actual] || $actual!=$width} {error "Vector width mismatch"}
 file mkdir [file join $af_parser_build reports]
 create_project af_parser [file join $af_parser_build project] -part xcku5p-ffvb676-1-i
 foreach name {af_afp1_header_check af_packet_parser} {add_files [file join $af_parser_root rtl $name.sv]}
 add_files -fileset sim_1 [file join $af_parser_root sim tb_af_packet_parser.sv]
 add_files -fileset constrs_1 [file join $af_parser_root constraints af_parser_ooc.xdc]
 set_property generic "WIDTH=$width" [get_filesets sources_1]
 set_property include_dirs [list [file join $af_parser_build vectors]] [get_filesets sim_1]
 set_property top af_packet_parser [get_filesets sources_1]
 set_property top tb_af_packet_parser [get_filesets sim_1]
 set_property xsim.simulate.runtime all [get_filesets sim_1]
 set_property -dict [list {STEPS.SYNTH_DESIGN.ARGS.MORE OPTIONS} {-mode out_of_context}] [get_runs synth_1]
 update_compile_order -fileset sources_1
}
proc af_parser_simulate {} {
 global af_parser_build
 set marker [file join $af_parser_build vectors simulation_pass.txt]
 if {[file exists $marker]} {file delete $marker}
 launch_simulation -mode behavioral
 if {![file exists $marker]} {error "No fresh parser acceptance marker"}
 file copy -force $marker [file join $af_parser_build vectors behavioral_simulation_pass.txt]
 close_sim
 puts AF_PARSER_SIM_ACCEPTED
}
proc af_parser_start {} {
 global af_parser_build
 if {![file exists [file join $af_parser_build vectors behavioral_simulation_pass.txt]]} {error "SIM first"}
 launch_runs synth_1 -jobs 2
}
proc af_parser_collect {run} {
 global af_parser_build
 if {$run ni {synth_1 impl_1}} {error "Invalid run"}
 set r [get_runs $run]
 if {[get_property PROGRESS $r] ne "100%" || [string match *ERROR* [get_property STATUS $r]]} {error "Run incomplete"}
 open_run $run
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1 || REF_NAME =~ IBUF* || REF_NAME =~ OBUF*}]]} {error "Blackbox or physical I/O"}
 report_utilization -file [file join $af_parser_build reports utilization_$run.rpt]
 report_timing_summary -report_unconstrained -file [file join $af_parser_build reports timing_$run.rpt]
 if {$run eq "impl_1"} {
  report_route_status -file [file join $af_parser_build reports route_status.rpt]
  report_drc -file [file join $af_parser_build reports drc.rpt]
  report_cdc -file [file join $af_parser_build reports cdc.rpt]
 }
 write_checkpoint [file join $af_parser_build af_parser_$run.dcp]
}
