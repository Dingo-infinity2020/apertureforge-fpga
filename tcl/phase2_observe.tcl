# Observe only the owned phase2 control projects; keep all long-running jobs intact.
proc af_control_observe {} {
 if {[get_property NAME [current_project]] ne "af_control"} {error "Not a control experiment"}
 set project_dir [file normalize [get_property DIRECTORY [current_project]]]
 if {[file tail $project_dir] ne "project"} {error "Unexpected project directory"}
 set build_dir [file dirname $project_dir]
 if {![file exists [file join $build_dir source_snapshot.json]]} {error "Source snapshot required"}
 set f [open [file join $build_dir reports run_state.json] w]
 puts $f [format {{"observed_utc":"%s","synthesis_status":"%s","synthesis_progress":"%s","synthesis_directive":"%s","implementation_status":"%s"}} \
  [clock format [clock seconds] -gmt 1 -format {%Y-%m-%dT%H:%M:%SZ}] \
  [get_property STATUS [get_runs synth_1]] [get_property PROGRESS [get_runs synth_1]] \
  [get_property STEPS.SYNTH_DESIGN.ARGS.DIRECTIVE [get_runs synth_1]] [get_property STATUS [get_runs impl_1]]]
 close $f
 puts "AF_OBSERVE=[file tail $build_dir] [get_property STATUS [get_runs synth_1]] [get_property PROGRESS [get_runs synth_1]]"
}
