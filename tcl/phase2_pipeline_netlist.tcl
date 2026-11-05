# Generate scripts only. Long XSim jobs run independently with a pollable status,
# so a synchronous MCP timeout cannot terminate a valid long-running simulation.
set ::af_pipeline_verify_root [file normalize [file join [file dirname [info script]] ..]]
proc af_pipeline_netlist_generate {build_dir} {
 set build_dir [file normalize $build_dir]
 if {[file normalize [get_property DIRECTORY [current_project]]] ne [file join $build_dir project]} {error "Wrong owned project"}
 if {[get_property PROGRESS [get_runs impl_1]] ne "100%" || [string match *ERROR* [get_property STATUS [get_runs impl_1]]]} {error "Complete route first"}
 set extra [file dirname $::af_pipeline_verify_root]
 set simset [file tail $extra]
 if {[llength [get_filesets -quiet $simset]]} {error "Fresh verification fileset required"}
 if {[file exists [file join $extra job_spec.json]]} {error "Fresh job specification required"}
 create_fileset -simset $simset
 set_property source_set sources_1 [get_filesets $simset]
 add_files -fileset $simset [file join $::af_pipeline_verify_root sim tb_af_receive_pipeline.sv]
 set_property top tb_af_receive_pipeline [get_filesets $simset]
 set_property include_dirs [list [file join $extra vectors]] [get_filesets $simset]
 set_property verilog_define AF_PIPE_NETLIST [get_filesets $simset]
 set_property xsim.simulate.runtime all [get_filesets $simset]
 # Vivado's alternate-simset flow can inherit sim_1 properties. Set and record
 # the functional-only mode on both; do not link timing primitive models.
 foreach fs [list [get_filesets sim_1] [get_filesets $simset]] {
  set_property SIM_MODE post-implementation $fs
  set_property NL.MODE funcsim $fs
  set_property NL.SDF_ANNO false $fs
  set_property xsim.elaborate.debug_level off $fs
  set_property xsim.simulate.custom_tcl [file join $::af_pipeline_verify_root tcl phase2_pipeline_run_quiet.tcl] $fs
 }
 launch_simulation -simset $simset -mode post-implementation -type functional -scripts_only
 set scripts [file join $build_dir project af_pipeline.sim $simset impl func xsim]
 set f [open [file join $scripts elaborate.bat] r];set elab [read $f];close $f
 if {[string match *simprims_ver* $elab] || [string match *--maxdelay* $elab] || ![string match *unisims_ver* $elab]} {error "Generated scripts do not use functional primitive models"}
 set f [open [file join $extra vectors af_pipeline_verify_config.svh] r];set cfg [read $f];close $f
 if {![regexp {`define AF_PIPE_BLOCKS ([0-9]+)} $cfg -> blocks] || ![regexp {`define AF_PIPE_WORDS ([0-9]+)} $cfg -> words]} {error "Missing acceptance shape"}
 set marker [file join $extra pipeline_post_impl_pass.txt]
 set f [open [file join $extra job_spec.json] w]
 puts $f [format {{"script_dir":"%s","marker":"%s","vivado_bin":"D:/AMDDesignTools/2026.1/Vivado/bin","expected":{"packets":%d,"read_words":%d}}} $scripts $marker [expr {$blocks*256}] $words]
 close $f
 puts "AF_PIPELINE_NETLIST_SCRIPTS_READY $extra"
}
