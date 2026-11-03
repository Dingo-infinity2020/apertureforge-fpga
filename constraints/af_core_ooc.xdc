# Unified processing clock experiment. No physical CMAC/board I/O or real ingress CDC.
create_clock -name clk -period 4.000 [get_ports clk]
