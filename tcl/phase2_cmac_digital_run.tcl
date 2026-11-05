# Observe time advance without waveform/debug retention or early acceptance.
# Testbench timeout and all original end-to-end checks remain authoritative.
set marker [file join [file dirname [file dirname [file dirname [info script]]]] vectors pipeline_pass.txt]
puts "AF_DIGITAL_RUN_START time=[current_time]";flush stdout
foreach ns {1 9 90 900 9000} {
 run $ns ns
 puts "AF_DIGITAL_TIME time=[current_time]";flush stdout
}
for {set slice 0} {$slice<1000 && ![file exists $marker]} {incr slice} {
 set before [current_time]
 run 10 us
 puts "AF_DIGITAL_TIME time=[current_time]";flush stdout
 if {[current_time] eq $before && ![file exists $marker]} {error "Simulation stopped advancing before functional marker"}
}
if {![file exists $marker]} {error "No functional marker within diagnostic simulation horizon"}
quit
