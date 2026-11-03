# Internal register-to-register target only. No board I/O timing claim.
create_clock -name clk -period 4.000 [get_ports clk]
