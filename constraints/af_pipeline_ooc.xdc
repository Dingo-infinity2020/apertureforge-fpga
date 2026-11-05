create_clock -name rx_clk -period 3.103030 [get_ports rx_clk]
create_clock -name clk -period 8.000 [get_ports clk]
# This implementation point uses a 125MHz processing clock. XPM owns CDC exceptions.
