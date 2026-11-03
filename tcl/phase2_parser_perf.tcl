set ::af_parser_perf_root [file normalize [file join [file dirname [info script]] ..]]
proc af_parser_perf_simulate {build_dir {mode behavioral}} {
 if {$mode ni {behavioral post-implementation}} {error "Invalid simulation mode"}
 set build_dir [file normalize $build_dir]
 set f [open [file join $build_dir vectors af_parser_perf_config.svh] w]
 set marker [file join $build_dir vectors [expr {$mode eq "behavioral"?"parser_perf_pass.txt":"parser_perf_netlist_pass.txt"}]]
 puts $f "`define AF_PARSER_PERF_PASS \"[string map {\\ /} $marker]\"";close $f
 if {[file exists $marker]} {file delete $marker}
 add_files -fileset sim_1 [file join $::af_parser_perf_root sim tb_af_packet_parser_perf.sv]
 set_property top tb_af_packet_parser_perf [get_filesets sim_1]
 if {$mode eq "behavioral"} {launch_simulation -mode behavioral} else {launch_simulation -mode post-implementation -type functional}
 set accepted [file exists $marker]
 close_sim
 set_property top tb_af_packet_parser [get_filesets sim_1]
 if {!$accepted} {error "No parser perf acceptance marker"}
 puts AF_PARSER_PERF_ACCEPTED
}
