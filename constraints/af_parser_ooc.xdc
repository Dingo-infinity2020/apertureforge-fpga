# Internal paths only. Physical ingress/CDC and board I/O timing are separate proofs.
create_clock -name clk -period 4.000 [get_ports clk]
