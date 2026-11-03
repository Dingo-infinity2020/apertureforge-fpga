set ::af_core_perf_root [file normalize [file join [file dirname [info script]] ..]]
proc af_core_perf_simulate {build_dir} {
 set build_dir [file normalize $build_dir]
 set marker [file join $build_dir vectors core_perf_pass.txt]
 if {[file exists $marker]} {file delete $marker}
 add_files -fileset sim_1 [file join $::af_core_perf_root sim tb_af_receive_core_perf.sv]
 set_property top tb_af_receive_core_perf [get_filesets sim_1]
 launch_simulation -mode behavioral
 set accepted [file exists $marker]
 close_sim
 set_property top tb_af_receive_core [get_filesets sim_1]
 if {!$accepted} {error "No full-load core acceptance marker"}
 puts AF_CORE_PERF_ACCEPTED
}
