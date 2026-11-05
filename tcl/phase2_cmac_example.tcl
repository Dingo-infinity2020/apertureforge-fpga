# Generate the vendor's actual CMAC simulation example in a fresh owned build.
# This is an offline device-level reference; it does not establish board wiring.
proc af_cmac_example_prepare {build_dir} {
 if {[current_project -quiet] ne ""} {error "Close known owned project first"}
 set build_dir [file normalize $build_dir]
 if {[file exists [file join $build_dir project af_cmac_example_probe.xpr]] || [file exists [file join $build_dir example]]} {error "Fresh CMAC example build required"}
 file mkdir [file join $build_dir reports]
 create_project af_cmac_example_probe [file join $build_dir project] -part xcku5p-ffvb676-1-i
 create_ip -name cmac_usplus -vendor xilinx.com -library ip -version 3.1 -module_name af_cmac
 set_property -dict [list CONFIG.CMAC_CAUI4_MODE 1 CONFIG.USER_INTERFACE AXIS CONFIG.CMAC_CORE_SELECT CMACE4_X0Y0 \
  CONFIG.GT_GROUP_SELECT {X0Y12~X0Y15} CONFIG.GT_REF_CLK_FREQ 161.1328125 CONFIG.INCLUDE_RS_FEC 0] [get_ips af_cmac]
 set f [open [file join $build_dir reports cmac_configuration.tsv] w]
 puts $f "tool\t[version -short]"
 puts $f "part\t[get_property PART [current_project]]"
 foreach p [lsort [list_property [get_ips af_cmac]]] {if {[string match CONFIG.* $p]} {puts $f "$p\t[get_property $p [get_ips af_cmac]]"}}
 close $f
 generate_target all [get_ips af_cmac]
 open_example_project -in_process -dir [file join $build_dir example] [get_ips af_cmac]
 puts "AF_CMAC_EXAMPLE_PROJECT [get_property DIRECTORY [current_project]]"
}
