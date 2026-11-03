set ::af_control_time_root [file normalize [file join [file dirname [info script]] ..]]
proc af_control_time_simulate {build_dir} {
 set build_dir [file normalize $build_dir]
 set f [open [file join $build_dir vectors af_control_time_config.svh] w]
 set marker [file join $build_dir vectors time_edges_pass.txt]
 puts $f "`define AF_CONTROL_TIME_PASS \"[string map {\\ /} $marker]\"";close $f
 if {[file exists $marker]} {file delete $marker}
 add_files -fileset sim_1 [file join $::af_control_time_root sim tb_af_ring_control_time.sv]
 set_property top tb_af_ring_control_time [get_filesets sim_1]
 launch_simulation -mode behavioral
 set accepted [file exists $marker]
 close_sim
 set_property top tb_af_ring_control [get_filesets sim_1]
 if {!$accepted} {error "No time edge acceptance marker"}
 puts AF_CONTROL_TIME_ACCEPTED
}
