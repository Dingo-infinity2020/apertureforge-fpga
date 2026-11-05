create_clock -name rx_clk -period 3.103030 [get_ports rx_clk]
create_clock -name clk -period 4.000 [get_ports clk]
# XPM supplies scoped CDC constraints. Do not blanket-false-path both domains.
