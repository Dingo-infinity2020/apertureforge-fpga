set ::af_profile_root [file normalize [file join [file dirname [info script]] ..]]
proc af_instance_profile_generate {build_dir kind} {
 set build_dir [file normalize $build_dir]
 if {[file normalize [get_property DIRECTORY [current_project]]] ne [file join $build_dir project]} {error "Wrong owned project"}
 if {$kind ni {gt_quad gt_channel gt_common endpoint axis_tx axis_rx}} {error "Unknown diagnostic kind"}
 set extra [file dirname $::af_profile_root]
 set simset [file tail $extra]
 if {![regexp "^instance_profile_${kind}(_\[0-9\]+)?$" $simset] || [llength [get_filesets -quiet $simset]]} {error "Fresh matching profile required"}
 create_fileset -simset $simset
 set_property source_set sources_1 [get_filesets $simset]
 add_files -fileset $simset [file join $extra generated tb_af_profile_$kind.sv]
 if {$kind in {gt_quad gt_channel gt_common}} {
  foreach f [glob [file join $build_dir project af_cmac_shell.gen sources_1 ip af_cmac ip_0 sim *.v]] {add_files -fileset $simset $f}
 }
 if {$kind in {axis_tx axis_rx}} {
  foreach f [glob [file join $build_dir project af_cmac_shell.gen sources_1 ip af_cmac af_cmac example_design *segmented_top.v]] {add_files -fileset $simset $f}
 }
 set_property top tb_af_profile_$kind [get_filesets $simset]
 foreach fs [list [get_filesets sim_1] [get_filesets $simset]] {
  set_property xsim.elaborate.debug_level off $fs
  set_property -dict [list xsim.elaborate.xelab.more_options {--stats -L gtwizard_ultrascale_v1_7_23 -L cmac_usplus_v3_1_26}] $fs
  set_property xsim.simulate.custom_tcl [file join $::af_profile_root tcl phase2_pipeline_run_quiet.tcl] $fs
 }
 launch_simulation -simset $simset -mode behavioral -scripts_only
 set scripts [file join $build_dir project af_cmac_shell.sim $simset behav xsim]
 set f [open [file join $extra job_spec.json] w]
 puts $f [format {{"script_dir":"%s","marker":"%s","vivado_bin":"D:/AMDDesignTools/2026.1/Vivado/bin","expected":{},"scope":"INSTANCE_PROFILE_ONLY"}} $scripts [file join $extra profile_done.txt]]
 close $f
 puts AF_INSTANCE_PROFILE_SCRIPTS_READY
}
