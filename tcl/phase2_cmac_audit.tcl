# Supplemental audit of an already routed, owned real-CMAC experiment.
# This reports raw checks/cones. It creates no waiver or timing exception.
proc af_cmac_audit {build_dir} {
 set build_dir [file normalize $build_dir]
 if {[file normalize [get_property DIRECTORY [current_project]]] ne [file join $build_dir project]} {error "Wrong owned project"}
 if {[get_property PROGRESS [get_runs impl_1]] ne "100%" || ![string match *Complete* [get_property STATUS [get_runs impl_1]]]} {error "Complete implementation first"}
 set filename [file join $build_dir reports physical_checks_impl_1.tsv]
 if {[file exists $filename]} {error "Fresh supplemental audit required"}
 set f [open $filename w]
 puts $f "blackboxes\t[llength [get_cells -hier -quiet -filter {IS_BLACKBOX==1}]]"
 foreach ref {CMACE4 GTYE4_CHANNEL GTYE4_COMMON IBUFDS_GTE4} {puts $f "$ref\t[llength [get_cells -hier -filter REF_NAME==$ref]]"}
 foreach p {gt_ref_clk_p gt_ref_clk_n} {
  set pin [get_property PACKAGE_PIN [get_ports $p]]
  puts $f "$p\t$pin\t[get_property PIN_FUNC [get_package_pins $pin]]"
 }
 foreach c [get_clocks] {puts $f "clock\t$c\t[get_property PERIOD $c]"}
 close $f
 set f [open [file join $build_dir reports cdc_internal_reset_cones.tsv] w]
 puts $f "scope\tUnmodified vendor reset-status cones only; raw CDC-10 retained; no waiver"
 foreach side {rx tx} {
  set chain network/cmac/inst/i_af_cmac_cmac_cdc_sync_${side}_reset_done_init_clk
  set dest [get_pins ${chain}/s_out_d2_cdc_to_reg/D]
  puts $f "destination\t$dest"
  foreach src [lsort [all_fanin -flat -startpoints_only -only_cells -to $dest]] {
   set cpin [get_pins -quiet $src/C]
   puts $f "source\t$src\t[get_property REF_NAME $src]\t[get_clocks -quiet -of_objects $cpin]"
  }
  foreach suffix {s_out_d2_cdc_to_reg s_out_d3_reg s_out_d4_reg} {
   set cell [get_cells $chain/$suffix]
   puts $f "chain\t$cell\t[get_property ASYNC_REG $cell]\t[get_clocks -of_objects [get_pins $cell/C]]"
  }
 }
 close $f
 puts AF_CMAC_SUPPLEMENTAL_AUDIT_RECORDED
}
