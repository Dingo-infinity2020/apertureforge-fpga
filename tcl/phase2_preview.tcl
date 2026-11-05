set ::af_preview_root [file normalize [file join [file dirname [info script]] ..]]
proc af_preview_simulate {build_dir} {
 set build_dir [file normalize $build_dir]
 if {[file normalize [get_property DIRECTORY [current_project]]] ne [file join $build_dir project]} {error "Wrong owned project"}
 set marker [file join $build_dir vectors preview_pass.txt]
 if {[file exists $marker]} {error "Use a fresh preview test build"}
 add_files -fileset sim_1 [file join $::af_preview_root sim tb_af_ring_preview.sv]
 set_property top tb_af_ring_preview [get_filesets sim_1]
 launch_simulation -mode behavioral
 set accepted [file exists $marker]
 close_sim
 set_property top tb_af_receive_core [get_filesets sim_1]
 if {!$accepted} {error "No fresh preview acceptance marker"}
 puts AF_PREVIEW_SIM_ACCEPTED
}
