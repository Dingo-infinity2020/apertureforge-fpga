# 第二阶段环境与依赖实查

日期：2026-11-03。下表保留最初实际Vivado MCP探针结果。**最新变化：用户已取得CMAC 100G授权，尚未重新执行checkout/IP综合**，不能把历史失败当作当前仍缺授权，也不能将新授权写成已实测通过。

| 项目 | 已验证事实 | 限制 |
|---|---|---|
| 工具 | Vivado 2026.1，使用已有安装，通过 MCP 启动及执行 Tcl | 未修改安装、驱动或硬件 |
| KU5P | `xcku5p-ffvb676-1-i` 存在；通用 RTL 综合许可成功取得 | 此处不证明板级接口 |
| KU11P / KU15P / ZU47DR | 历史探针中`get_parts`对应前缀均返回0 | KU11P/KU15P比较仍受器件库限制；ZU47DR不再属于本项目开发/综合要求 |
| CMAC | catalog 为 `cmac_usplus:3.1`，要求许可；实际生成目标并启动 IP 综合 | secure feature `cmac_usplus@2020.05` 许可失败，IP 综合终止；完整 shell **NOT VERIFIED** |
| FFT | catalog 为 `xfft:9.1`，`REQUIRES_LICENSE=0` | 本记录尚未执行 FFT 核构建，不能据此写成综合 PASS |
| FIFO | catalog 含 `fifo_generator:13.0/13.1/13.2`、`axi_data_fifo:2.1` | 同上，仅 catalog 证据 |
| 板级 | **NOT RUN** | 无 JTAG、光纤、DDR、PCIe、驱动操作 |

此前按用户指示先推进独立模块；现已完成处理域parser/ring/RAM组合的仿真、综合和布线，见[最新结果](../reports/phase2-core.zh-CN.md)。整体工作当前暂停。RFSoC只作为输入格式/速率/流量模型，不开发其前端。完整CMAC组合与替代器件比较仍需实际证据。

## CMAC 探针与接口边界

外部构建：`D:/work/build/apertureforge-fpga/p2_00_env_20261103_01`。新建独立项目，精确 KU5P part，`af_cmac_probe` 配为 `CMAC_CAUI4_MODE=1`、`USER_INTERFACE=AXIS`，重新生成目标后启动 `af_cmac_probe_synth_1`。实际状态为 `synth_design ERROR`，日志明确为 secure IP license checkout 失败；不是 LUT/时序失败。

第一次 catalog/默认参数导出时 IP 仍为 LBUS / CAUI10；其 `cmac_defaults.tsv` 只保留该初始快照。随后会话显式改成 AXIS / CAUI4，综合测试针对更改后的配置。复现脚本直接选择 AXIS / CAUI4，不将默认参数快照误作拟用网络接口。

探针自动选出的 CMAC/GT 位置仅用于许可测试。**尚未完成** FNIC-KU5P Rev1 两个 QSFP28 的 GT/参考时钟引脚逐项交叉核对，不能将探针的默认位置直接写入板级约束。现有板只按一个独立 100G 硬核接口预算；两个连接器不能当作两个独立 100G 接收口。KU15P 未选板，未宣称四口可用。

已核对生成的顶层包装：`rx_axis_tdata[511:0]`、`rx_axis_tkeep[63:0]`、`rx_axis_tvalid/tlast/tuser`，没有 RX `tready`。还需确认 `tuser` 错误语义、RX 时钟与复位时序。CMAC 不可反压的入口与处理域的可停顿接口之间需要包级暂存及 CDC；当前 AFP1 对齐报头测试不包含这些功能。

## DDR 与来源冻结

板级资料的已有摘要指向 72bit DDR4 布线（其中可含 8bit ECC），200MHz 参考时钟及 MT40A512M16 系列线索。具体装配颗粒、容量、MIG 数据率、可持续双向带宽仍未验证。本轮不实例化未经核实的 MIG，也不以 DDR 容量替代读写带宽证据。优先验证片内完整 raw ring 的真实 RAM 映射。

旧工程只读参考：`D:/work/KU5P_FX_Accelerator`，已检查提交 `956f84cea5569ef2c2d1910ce82e468f8bc4b6da`。新工程起点 `75b4bc6ea90015a96db94e1b18c2672802581d3e`。厂家材料与原 RFSoC 工程不复制进仓库。

复现入口：[环境 Tcl](../tcl/phase2_environment.tcl)、[报头试验 Tcl](../tcl/phase2_header.tcl)、[存储试验 Tcl](../tcl/phase2_store.tcl)。源文件与约束的 SHA256、运行状态和证据分级见后续 `reports/phase2-progress.json`。原始外部日志保留本机；公开摘要不含许可搜索路径、机器标识或授权内容。
