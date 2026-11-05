# Frozen supplemental regression for configuration after a long link startup.
proc af_pipeline_delayed_config_simulate {build_dir} {
 if {[file normalize [get_property DIRECTORY [current_project]]] ne [file join [file normalize $build_dir] project]} {error "Wrong owned pipeline project"}
 set_property -dict [list xsim.simulate.xsim.more_options {-testplusarg AF_DELAY_CONFIGURATION}] [get_filesets sim_1]
 set f [open [file join $build_dir reports delayed_config.tsv] w]
 puts $f "plusarg\tAF_DELAY_CONFIGURATION\nextra_processing_cycles_after_reset_release\t14000\nprocessing_clock_ns\t8"
 close $f
 af_pipeline_simulate
}
