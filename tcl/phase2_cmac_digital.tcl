# Supplemental CMAC digital-boundary simulation, not the physical shell.
# Supported GT_LOCATION=0 exposes the actual CMAC parallel SERDES interface.
set ::af_digital_root [file normalize [file join [file dirname [info script]] ..]]
proc af_cmac_digital_prepare {build_dir} {
 global af_digital_root
 if {[current_project -quiet] ne ""} {error "Close known owned project first"}
 set build_dir [file normalize $build_dir]
 if {[file exists [file join $build_dir project]]} {error "Fresh digital project required"}
 create_project af_cmac_shell [file join $build_dir project] -part xcku5p-ffvb676-1-i
 set_property XPM_LIBRARIES {XPM_CDC XPM_FIFO} [current_project]
 foreach name {af_afp1_header_check af_packet_parser af_ring_control af_ring_store af_receive_core af_rx_ingress af_receive_pipeline} {
  add_files [file join $af_digital_root rtl $name.sv]
 }
 create_ip -name cmac_usplus -vendor xilinx.com -library ip -version 3.1 -module_name af_cmac
 set_property -dict [list CONFIG.CMAC_CAUI4_MODE 1 CONFIG.USER_INTERFACE AXIS CONFIG.CMAC_CORE_SELECT CMACE4_X0Y0 \
  CONFIG.GT_GROUP_SELECT {X0Y12~X0Y15} CONFIG.GT_REF_CLK_FREQ 161.1328125 CONFIG.INCLUDE_RS_FEC 0 \
  CONFIG.RX_FRAME_CRC_CHECKING {Enable FCS Stripping} CONFIG.TX_FRAME_CRC_CHECKING {Enable FCS Insertion} \
  CONFIG.RX_MAX_PACKET_LEN 9600 CONFIG.FAST_SIM_MODE 1 CONFIG.GT_LOCATION 0] [get_ips af_cmac]
 file mkdir [file join $build_dir reports]
 set f [open [file join $build_dir reports cmac_configuration.tsv] w]
 puts $f "scope\tCMAC_DIGITAL_BOUNDARY_ONLY\ntool\t[version -short]\npart\t[get_property PART [current_project]]"
 foreach p [lsort [list_property [get_ips af_cmac]]] {if {[string match CONFIG.* $p]} {puts $f "$p\t[get_property $p [get_ips af_cmac]]"}}
 close $f
 generate_target all [get_ips af_cmac]
 update_compile_order -fileset sources_1
 puts AF_CMAC_DIGITAL_PREPARED_NOT_PHYSICAL_SHELL
}
proc af_cmac_digital_generate {build_dir} {
 set build_dir [file normalize $build_dir]
 if {[file normalize [get_property DIRECTORY [current_project]]] ne [file join $build_dir project]} {error "Wrong owned project"}
 if {[get_property CONFIG.GT_LOCATION [get_ips af_cmac]] != 0} {error "Digital-boundary IP required"}
 set extra [file dirname $::af_digital_root]
 set simset [file tail $extra]
 if {![regexp {^digital_peer_verification(_[0-9]+)?$} $simset] || [llength [get_filesets -quiet $simset]]} {error "Fresh matching digital simset required"}
 create_fileset -simset $simset
 set_property source_set sources_1 [get_filesets $simset]
 foreach f {af_cmac_digital_endpoint.sv tb_af_cmac_digital.sv} {add_files -fileset $simset [file join $extra generated $f]}
 set_property top tb_af_cmac_digital [get_filesets $simset]
 foreach fs [list [get_filesets sim_1] [get_filesets $simset]] {
  set_property xsim.elaborate.debug_level off $fs
  set_property -dict [list xsim.elaborate.xelab.more_options {--stats}] $fs
  set_property xsim.simulate.custom_tcl [file join $::af_digital_root tcl phase2_cmac_digital_run.tcl] $fs
 }
 launch_simulation -simset $simset -mode behavioral -scripts_only
 set f [open [file join $extra vectors af_pipeline_config.svh] r];set cfg [read $f];close $f
 if {![regexp {`define AF_PIPE_WORDS ([0-9]+)} $cfg -> words]} {error "Expected words required"}
 set f [open [file join $extra generated_config.json] r];set generated [read $f];close $f
 set probes [expr {[regexp {"control_probes":\s*true} $generated] ? 1 : 0}]
 set scripts [file join $build_dir project af_cmac_shell.sim $simset behav xsim]
 set f [open [file join $extra job_spec.json] w]
 puts $f [format {{"script_dir":"%s","marker":"%s","vivado_bin":"D:/AMDDesignTools/2026.1/Vivado/bin","expected":{"packets":4096,"read_words":%d,"reset_probe":%d,"bad_probe":%d},"scope":"CMAC_DIGITAL_BOUNDARY_ONLY"}} $scripts [file join $extra vectors pipeline_pass.txt] $words $probes $probes]
 close $f
 puts AF_CMAC_DIGITAL_PEER_SCRIPTS_READY_NOT_SERIAL
}
