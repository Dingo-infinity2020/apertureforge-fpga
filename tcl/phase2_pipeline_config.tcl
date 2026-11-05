set ::af_config_root [file normalize [file join [file dirname [info script]] ..]]
proc af_config_prepare {build_dir} {
 global af_config_build af_config_root
 if {[current_project -quiet] ne ""} {error "Close known owned project first"}
 set af_config_build [file normalize $build_dir]
 if {[file exists [file join $af_config_build project af_config.xpr]]} {error "Fresh config project required"}
 create_project af_config [file join $af_config_build project] -part xcku5p-ffvb676-1-i
 set_property XPM_LIBRARIES {XPM_CDC XPM_FIFO} [current_project]
 foreach name {af_afp1_header_check af_packet_parser af_ring_control af_ring_store af_receive_core af_rx_ingress af_receive_pipeline} {add_files [file join $af_config_root rtl $name.sv]}
 add_files -fileset sim_1 [file join $af_config_root sim tb_af_pipeline_config.sv]
 set_property include_dirs [list [file join $af_config_build vectors]] [get_filesets sim_1]
 set_property top af_receive_pipeline [get_filesets sources_1]
 set_property top tb_af_pipeline_config [get_filesets sim_1]
 set_property xsim.simulate.runtime all [get_filesets sim_1]
 update_compile_order -fileset sources_1
}
proc af_config_simulate {} {
 global af_config_build
 set marker [file join $af_config_build vectors config_pass.txt]
 if {[file exists $marker]} {error "Fresh config acceptance required"}
 launch_simulation -mode behavioral
 set pass [file exists $marker]
 close_sim
 if {!$pass} {error "No fresh config acceptance marker"}
 puts AF_CONFIG_SIM_ACCEPTED
}
