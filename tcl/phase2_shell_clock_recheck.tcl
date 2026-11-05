# Read an existing owned routed DCP, change only the processing clock constraint,
# and report STA in a new directory. This is NOT a new placement/route run.
proc af_shell_clock_recheck {input_dcp build_dir mhz} {
 if {[current_project -quiet] ne ""} {error "Close known owned project first"}
 if {$mhz ni {125 200 250}} {error "Known clock points only"}
 set build_dir [file normalize $build_dir]
 if {![file exists [file join $build_dir source_snapshot.json]]} {error "Frozen fresh experiment required"}
 set out [file join $build_dir sta_${mhz}MHz]
 if {[file exists $out]} {error "Do not overwrite prior STA"}
 file mkdir $out
 open_checkpoint $input_dcp
 if {[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1}]]} {error "Unresolved blackbox"}
 foreach {ref count} {CMACE4 1 GTYE4_CHANNEL 4 GTYE4_COMMON 1} {
  if {[llength [get_cells -hier -filter REF_NAME==$ref]]!=$count} {error "Wrong physical shell: $ref"}
 }
 create_clock -name processing_clk -period [expr {1000.0/$mhz}] [get_ports clk]
 set f [open [file join $out scope.tsv] w]
 puts $f "scope\tSAME_ROUTE_STA_RECHECK\nprocessing_mhz\t$mhz\ninput_dcp\t[file normalize $input_dcp]\nSYNTH\tNOT RUN\nROUTED\tNOT RUN\nBOARD\tNOT RUN"
 foreach c [get_clocks] {puts $f "clock\t$c\t[get_property PERIOD $c]"}
 close $f
 report_timing_summary -report_unconstrained -file [file join $out timing.rpt]
 report_timing -from [get_clocks processing_clk] -to [get_clocks processing_clk] -max_paths 5 -file [file join $out processing_paths.rpt]
 report_clocks -file [file join $out clocks.rpt]
 report_clock_interaction -file [file join $out clock_interaction.rpt]
 report_bus_skew -file [file join $out bus_skew.rpt]
 close_design
 if {[current_project -quiet] ne ""} {close_project}
 puts AF_SAME_ROUTE_STA_RECHECK_COMPLETE_${mhz}MHz
}
