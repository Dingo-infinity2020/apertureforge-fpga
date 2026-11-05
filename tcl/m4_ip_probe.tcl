# M4-00 Vivado 2025.1 xfft/cmpy dependency probe.
set ::m4_ip_root [file normalize [file join [file dirname [info script]] ..]]
set ::m4_ip_build ""

proc m4_ip_prepare {build_dir} {
 global m4_ip_root m4_ip_build
 if {[current_project -quiet] ne ""} {error "Close owned project first"}
 set m4_ip_build [file normalize $build_dir]
 set src [string tolower [string map {\\ /} $m4_ip_root]]
 set dst [string tolower [string map {\\ /} $m4_ip_build]]
 if {$src eq $dst || [string first "$src/" "$dst/"]==0} {error "Build must be outside repository"}
 if {[file exists [file join $m4_ip_build project m4_ip_probe.xpr]]} {error "Use a fresh build directory"}
 file mkdir [file join $m4_ip_build reports]
 file mkdir [file join $m4_ip_build config]
 create_project m4_ip_probe [file join $m4_ip_build project] -part xcku5p-ffvb676-1-i
 set f [open [file join $m4_ip_build reports m4_ip_environment.tsv] w]
 fconfigure $f -encoding utf-8
 puts $f "tool\t[version -short]"
 puts $f "part\t[get_property PART [current_project]]"
 puts $f "xfft\t[get_ipdefs -quiet -all xilinx.com:ip:xfft:*]"
 puts $f "cmpy\t[get_ipdefs -quiet -all xilinx.com:ip:cmpy:*]"
 close $f
 create_ip -name xfft -vendor xilinx.com -library ip -version 9.1 -module_name m4_fft_probe
 create_ip -name cmpy -vendor xilinx.com -library ip -version 6.0 -module_name m4_cmpy_probe
 set fft [get_ips m4_fft_probe]
 set cmpy [get_ips m4_cmpy_probe]
 set_property -dict [list \
  CONFIG.transform_length {64} \
  CONFIG.input_width {16} \
  CONFIG.output_ordering {natural_order} \
  CONFIG.throttle_scheme {nonrealtime} \
  CONFIG.implementation_options {automatically_select} \
  CONFIG.scaling_options {scaled} \
  CONFIG.rounding_modes {convergent_rounding} \
  CONFIG.ovflo {false}] $fft
 set_property -dict [list \
  CONFIG.APortWidth {16} \
  CONFIG.BPortWidth {16} \
  CONFIG.OutputWidth {33} \
  CONFIG.FlowControl {NonBlocking} \
  CONFIG.MultType {Use_Mults} \
  CONFIG.OptimizeGoal {Resources}] $cmpy
 generate_target all $fft
 generate_target all $cmpy
 create_ip_run $fft
 create_ip_run $cmpy
 set f [open [file join $m4_ip_build reports m4_ip_config.tsv] w]
 fconfigure $f -encoding utf-8
 foreach ip [list $fft $cmpy] {
  puts $f "ip\t[get_property IPDEF $ip]"
  foreach prop [lsort [list_property $ip]] {
   if {[string match CONFIG.* $prop]} {puts $f "[get_property NAME $ip]\t$prop\t[get_property $prop $ip]"}
  }
 }
 close $f
 set f [open [file join $m4_ip_build reports m4_ip_sim_targets.tsv] w]
 fconfigure $f -encoding utf-8
 foreach ip [list $fft $cmpy] {
  set dir [file join [get_property IP_OUTPUT_DIR $ip] sim]
  puts $f "[get_property NAME $ip]\t[file normalize $dir]\t[file exists $dir]"
 }
 close $f
 puts "M4_IP_PREPARE_READY=$m4_ip_build"
}

proc m4_ip_launch {} {
 global m4_ip_build
 if {$m4_ip_build eq "" || [get_property NAME [current_project]] ne "m4_ip_probe"} {error "Prepare first"}
 launch_runs {m4_fft_probe_synth_1 m4_cmpy_probe_synth_1} -jobs 2
 puts M4_IP_RUNS_LAUNCHED
}

proc m4_ip_status {} {
 foreach name {m4_fft_probe_synth_1 m4_cmpy_probe_synth_1} {
  set run [get_runs $name]
  puts "$name\t[get_property STATUS $run]\t[get_property PROGRESS $run]"
 }
}

proc m4_ip_collect {} {
 global m4_ip_build
 if {$m4_ip_build eq "" || [get_property NAME [current_project]] ne "m4_ip_probe"} {error "Prepare first"}
 set f [open [file join $m4_ip_build reports m4_ip_runs.tsv] w]
 fconfigure $f -encoding utf-8
 foreach name {m4_fft_probe_synth_1 m4_cmpy_probe_synth_1} {
  set run [get_runs $name]
  set status [get_property STATUS $run]
  set progress [get_property PROGRESS $run]
  puts $f "$name\t$status\t$progress"
  if {$progress ne "100%" || [string match *ERROR* $status]} {error "$name incomplete: $status $progress"}
  open_run $run
  report_utilization -file [file join $m4_ip_build reports ${name}_utilization.rpt]
  report_timing_summary -file [file join $m4_ip_build reports ${name}_timing.rpt]
 }
 close $f
 puts M4_IP_COLLECTED
}
