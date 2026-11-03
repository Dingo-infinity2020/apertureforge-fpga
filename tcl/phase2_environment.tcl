# Source through Vivado MCP. Offline only; no hardware commands.
set ::af_phase2_source_root [file normalize [file join [file dirname [info script]] ..]]
proc af_phase2_environment {build_dir} {
    set build_dir [file normalize $build_dir]
    set source_root $::af_phase2_source_root
    set src [string tolower [string map {\\ /} $source_root]]
    set dst [string tolower [string map {\\ /} $build_dir]]
    if {$dst eq $src || [string first "$src/" "$dst/"] == 0} {error "Build must be outside repository"}
    if {[current_project -quiet] ne ""} {error "Close only the known owned project before preparing this run"}
    if {[file exists [file join $build_dir project af_phase2_probe.xpr]]} {error "Use a fresh build directory"}
    file mkdir [file join $build_dir reports]
    create_project af_phase2_probe [file join $build_dir project] -part xcku5p-ffvb676-1-i
    set f [open [file join $build_dir reports environment.tsv] w]
    fconfigure $f -encoding utf-8
    puts $f "tool\t[version -short]"
    puts $f "part\t[get_property PART [current_project]]"
    foreach prefix {xcku5p xcku11p xcku15p xczu47dr} {
        puts $f "parts_$prefix\t[join [get_parts -quiet $prefix*] ,]"
    }
    foreach name {cmac_usplus xfft fifo_generator axi_data_fifo} {
        foreach ip [get_ipdefs -quiet -all xilinx.com:ip:$name:*] {
            puts $f "ip\t[get_property VLNV $ip]\trequires_license=[get_property REQUIRES_LICENSE $ip]"
        }
    }
    puts $f "hardware_access\tNOT_RUN"
    close $f
    create_ip -name cmac_usplus -vendor xilinx.com -library ip -version 3.1 -module_name af_cmac_probe
    set_property -dict [list CONFIG.CMAC_CAUI4_MODE 1 CONFIG.USER_INTERFACE AXIS] [get_ips af_cmac_probe]
    set f [open [file join $build_dir reports cmac_defaults.tsv] w]
    foreach prop [lsort [list_property [get_ips af_cmac_probe]]] {
        if {[string match CONFIG.* $prop]} {puts $f "$prop\t[get_property $prop [get_ips af_cmac_probe]]"}
    }
    close $f
    puts "AF_ENVIRONMENT_READY=$build_dir"
}
proc af_phase2_cmac_license_probe {} {
    # This ACTUALLY checks secure-IP synthesis authorization, not just catalog presence.
    if {[get_property NAME [current_project]] ne "af_phase2_probe"} {error "Wrong project"}
    generate_target all [get_ips af_cmac_probe]
    create_ip_run [get_ips af_cmac_probe]
    launch_runs af_cmac_probe_synth_1 -jobs 2
    puts AF_CMAC_PROBE_LAUNCHED
}
