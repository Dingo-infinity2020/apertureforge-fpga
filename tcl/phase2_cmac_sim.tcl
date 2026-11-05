set ::af_cmac_sim_root [file normalize [file join [file dirname [info script]] ..]]
proc af_cmac_sim_generate {build_dir} {
 set build_dir [file normalize $build_dir]
 if {[file normalize [get_property DIRECTORY [current_project]]] ne [file join $build_dir project]} {error "Wrong owned project"}
 set extra [file dirname $::af_cmac_sim_root]
 set simset [file tail $extra]
 if {[llength [get_filesets -quiet $simset]] || [file exists [file join $extra job_spec.json]]} {error "Fresh simulation fileset required"}
 create_fileset -simset $simset
 set_property source_set sources_1 [get_filesets $simset]
 add_files -fileset $simset [file join $::af_cmac_sim_root sim tb_af_cmac_receive_shell.sv]
 set_property top tb_af_cmac_receive_shell [get_filesets $simset]
 set_property xsim.simulate.runtime all [get_filesets $simset]
 foreach fs [list [get_filesets sim_1] [get_filesets $simset]] {
  set_property xsim.elaborate.debug_level off $fs
  set_property xsim.simulate.custom_tcl [file join $::af_cmac_sim_root tcl phase2_cmac_serial_run.tcl] $fs
 }
 launch_simulation -simset $simset -mode behavioral -scripts_only
 set f [open [file join $extra vectors af_pipeline_config.svh] r];set cfg [read $f];close $f
 if {![regexp {`define AF_PIPE_WORDS ([0-9]+)} $cfg -> words]} {error "Missing expected words"}
 set scripts [file join $build_dir project af_cmac_shell.sim $simset behav xsim]
 set f [open [file join $extra job_spec.json] w]
 set bin [file normalize [file join $::env(XILINX_VIVADO) bin]]
 set license [string map {\\ /} $::env(XILINXD_LICENSE_FILE)]
 puts $f [format {{"script_dir":"%s","marker":"%s","vivado_bin":"%s","license_file":"%s","scope":"CMAC_GT_SERIAL","expected":{"packets":4096,"read_words":%d}}} $scripts [file join $extra vectors pipeline_pass.txt] $bin $license $words]
 close $f
 puts AF_REAL_CMAC_SERIAL_PEER_SCRIPTS_READY
}
