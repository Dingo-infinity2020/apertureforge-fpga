# 2025.1 重建与完整串行验证

2026-11-04，Codex，分支`codex/m2-m3-receiver`，基线`ae69ad0`，未提交。用户授权在独立2025.1环境重建2026工程，并在可行后继续M3主线，M4前停止。

**最新终态：迁移完成，完整串行SIM通过，M2/M3逐项验收完成，停止于M4之前。** 4096包/98304字逐字PASS；标准硬件125MHz ROUTED WNS +0.030ns，零黑盒/CDC unsafe或unknown/严重DRC。验收边界及交接见[最终验收](phase2-m2-m3-acceptance.zh-CN.md)；以下按时间保留历史推进记录。

迁移采用同一份自写RTL重新建立工程、生成2025.1自身的CMAC及仿真库。没有向旧版导入2026的DCP、复用旧构建目录或修改2026.1安装。9个硬件RTL逐文件SHA均与原shell-04一致；对应配置为12bin/T8/5槽/125MHz、4096数据FIFO/256描述符。

- 新构建：`D:/work/build/apertureforge-fpga/cx-p2_11-shell-v2025-20261104-01`。
- 实现源snapshot SHA-256：`a9e77fcf713d9959f601a288281af4654443ed51dc4ab845c60654e1a0a7862b`。
- 完整串行测试源snapshot：`2ad66806643e3c86e1a263b318916d316b88f44a7063efa7c226c9e81767d21d`，位于`serial_peer_verification`补充目录。
- 工具：`D:/AMDDesignTools/2025.1/Vivado/bin/vivado.bat`，自己的vivado MCP；开始前确认自己的旧MCP未运行，没有终止/接管其他代理。
- 重新生成的IP为CMAC 3.1 revision22，2026.1原版为revision26。FAST_SIM_MODE=1缩短对齐间隔；实际GT/时钟/复位模型仍保留，不能把此项称GT bypass。
- 仅在自己的2025进程和生成worker中指定新许可证；不修改全局环境。日志实际出现Synthesis/KU5P许可检出，CMAC IP OOC综合已完成，完整shell综合已启动。
- 完整功能测试包含两个真实CMAC/GT端点、四路串行线交叉连接、真实接收shell、逐字golden、乱序源、20µs消费者停顿及计数守恒；接收端没有ready或force输出。当前编译完成，elaborate/运行状态以新鲜worker结果为准，未写SIM PASS。

此前2026.1下两个数字边界测试已自然完成：12bin4096包/98304字、222708周期、FIFO峰值3832；10bin4096包/81920字、220371周期、FIFO3381，resident复位重建及错误帧整包丢弃均通过。它们的SIM范围仍为CMAC_DIGITAL_BOUNDARY_ONLY，不当作本次完整GT串行验证。

只读收集：先`node scripts/phase2-v2025-evidence.mjs`生成[机器摘要](phase2-v2025-migration.json)。新实现SIM/SYNTH/ROUTED分别记录；没有新鲜报告和marker不得沿用2026数值。完整串行SIM、2025 shell ROUTED、CDC/DRC/时钟/route质量和最终验收仍待完成，M3尚未验收。

18:11增补：完整串行XSim已经实际启动并推进到20µs以上，真实两端GT/CMAC reset释放；旧2026.1 BASIC的实例限制没有再阻止引擎启动。SIM仍RUNNING，未标PASS。`AF_SERIAL_PROGRESS ns=...`的首轮标签沿用了原测试台格式，`%t`在当前全局精度下输出为格式化时间，不能当作数值ns；实际时间以独立`AF_SERIAL_TIME time=...`的Tcl current_time为准。后续生成器已将标签改为time，不修改本轮冻结源。

`shell-v2025-01`的FAST_SIM_MODE=1完整shell SYNTH已完成并核对1CMACE4/4GTYE4_CHANNEL/1GTYE4_COMMON、零黑盒，但该配置强制缩短AM间隔，单独作为仿真配置的综合证据。另建`cx-p2_11-shell-v2025-20261104-02`，FAST_SIM_MODE=0，保留标准0x3FFF对齐间隔，作为正式硬件SYNTH/ROUTED候选；不把01加速配置当标准100G硬件实现。02的CMAC IP综合已启动，后续各报告单列。此拆分只涉及IP仿真加速属性，9个自写硬件RTL仍保持相同。

18:18增补：标准硬件02的IP及完整shell SYNTH均完成，已收集真实IP/黑盒/资源/时钟/CDC报告并启动impl_1至route_design。完整串行SIM已在约120µs前完成双端GT/CMAC复位释放与对齐、接收配置generation=1、ready_for_data，并进入等待首批科学数据的计划窗口；当前未报完整PASS。GT模型保留，不能混同于早先数字边界测试。原始状态以对应reports/、job_status和stdout为准。

18:25增补：标准硬件02 ROUTED完成并已收集原始报告，125MHz WNS +0.030ns、WHS +0.018ns、WPWS +0.003ns、TNS 0；17794 LUT、15926 FF、10 DSP、64 URAM、64.5 BRAM36；零黑盒，1CMACE4/4GTYE4_CHANNEL/1GTYE4_COMMON，51878/51878可布线网络全部布线、0route errors，DRC 0Error/0Critical/15Warning，no_clock/内部未约束均0，bus-skew最小slack +2.385ns。2025原始CDC unsafe/unknown均0，没有创建waiver；旧2026的2项CDC-10仍归属于旧构建。补充物理审计Tcl的header沿用旧版“raw CDC-10 retained”字样，只是静态说明，不能把它当作2025告警计数，计数以实际cdc_impl_1.rpt为准。

标准硬件02全部CONFIG.*用户参数与原2026 shell-04一致，9个RTL未变。其器件级K7/K6参考输入及GT位置已实现，仍不是板级接线/光纤验证。完整串行01在约230µs开始接收并提交科学包，后续4096包/98304字SIM仍RUNNING，M3最终验收尚未完成。下一步是等待该完整测试终态、核对golden和计数，再做M3逐项最终验收；不进入M4。

### 20:36完整串行SIM终态（已核实）

2025.1完整CMAC＋GT串行仿真于2026-11-04 20:36:38自然结束。job_status为COMPLETE，原始stdout有AF_CMAC_PIPELINE_PASS，独立fresh marker一致：4096包、98304字，222708端到端周期，入口峰值3831字、ring峰值385源、2500周期（20µs）停顿。逐字golden及计数检查通过。本次SIM范围为CMAC_GT_SERIAL；使用FAST_SIM_MODE=1加速对齐，标准硬件FAST_SIM_MODE=0的ROUTED证据单列，不混用。迁移与本次完整串行功能用例已验证通过；M3最终逐项验收尚待整理，不能直接称全部M3完成，M4未开始。此前RUNNING段落为历史观察。机器摘要已重新收集。
