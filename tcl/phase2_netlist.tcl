# Functional netlist replay for a prepared phase2 project. Never accepts a stale marker.
proc af_netlist_simulate {build_dir} {
 set build_dir [file normalize $build_dir]
 set actual [file normalize [get_property DIRECTORY [current_project]]]
 if {$actual ne [file join $build_dir project]} {error "Wrong owned project"}
 if {[get_property PROGRESS [get_runs impl_1]] ne "100%" || [string match *ERROR* [get_property STATUS [get_runs impl_1]]]} {error "Route first"}
 set marker [file join $build_dir vectors simulation_pass.txt]
 set behavioral [file join $build_dir vectors behavioral_simulation_pass.txt]
 if {![file exists $behavioral] && [file exists $marker]} {file copy $marker $behavioral}
 if {[file exists $marker]} {file delete $marker}
 launch_simulation -mode post-implementation -type functional
 set pass [file exists $marker]
 if {$pass} {
  set f [open $marker r];set result [read $f];close $f
  set pass [string match {PASS *} $result]
 }
 close_sim
 if {!$pass} {error "No fresh netlist acceptance marker"}
 file copy -force $marker [file join $build_dir vectors post_implementation_simulation_pass.txt]
 puts AF_NETLIST_SIM_ACCEPTED
}
