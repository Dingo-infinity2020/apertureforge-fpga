create_clock -name processing_clk -period 8.000 [get_ports clk]
create_clock -name init_clk -period 10.000 [get_ports init_clk]
# CMAC's scoped IP XDC defines the real GT reference clock and physical sites.
# GT generated user clocks must appear in report_clocks; no synthetic RX clock
# or blanket false path is supplied here. Logical external data/control ports
# remain OOC boundaries; board GT/refclock/QSFP wiring is NOT established.
# Device-only candidate for GT quad X0Y12..15, verified against the KU5P
# package database: K7/K6 = MGTREFCLK0P/N_227. This is NOT a board pinout.
set_property PACKAGE_PIN K7 [get_ports gt_ref_clk_p]
set_property PACKAGE_PIN K6 [get_ports gt_ref_clk_n]
set_property LOC GTYE4_COMMON_X0Y3 [get_cells network/cmac/inst/IBUFDS_GTE4_GTREFCLK_INST]
set_property BEL IBUFDS0_GTYE4 [get_cells network/cmac/inst/IBUFDS_GTE4_GTREFCLK_INST]
