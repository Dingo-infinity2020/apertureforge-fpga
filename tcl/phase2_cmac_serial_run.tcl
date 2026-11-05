# Full serial CMAC/GT functional test, bounded by the SV watchdog.
# Progress observation only; no waveform/debug retention or substituted PHY.
set marker [file join [file dirname [file dirname [file dirname [info script]]]] vectors pipeline_pass.txt]
puts "AF_SERIAL_RUN_START time=[current_time]";flush stdout
for {set slice 0} {$slice<10000 && ![file exists $marker]} {incr slice} {
 set before [current_time]
 run 10 us
 puts "AF_SERIAL_TIME time=[current_time]";flush stdout
 if {[current_time] eq $before && ![file exists $marker]} {error "Serial simulation stopped before functional marker"}
}
if {![file exists $marker]} {error "No serial functional marker within simulation horizon"}
quit
