# CMAC 仿真实例数量优化

最新核对：2026.1下数字边界完整测试_04（12bin）和_05（10bin含控制探针）均已自然PASS，具体指标见文末；后续已在2025.1启动完整GT串行仿真，详见[迁移记录](phase2-v2025-migration.zh-CN.md)。前面过程记录保留原时间状态。

2026-11-04，Codex，`codex/m2-m3-receiver`，基线 `ae69ad0`，未提交。按用户要求优先减少仿真实例，不把升级模拟器授权作为默认下一步。机器证据见[独立摘要](phase2-cmac-instance-optimization.json)，重建命令：`node scripts/phase2-cmac-instance-evidence.mjs`。此文件中的“实例”是 XSim 展开的模型实例，不是 FPGA 的 LUT、GT 或 CMAC 硬核数量。

## 实际测了什么

所有新实验在 `D:/work/build/apertureforge-fpga/` 下，使用 Codex 自己的 Vivado 2026.1；不接管其他代理。历史原始结果未覆盖。下表是 xelab `--stats` 的实际展开计数，不是比例推算。

| 新构建/补充目录 | 内容 | 实例数 | 结果含义 |
|---|---|---:|---|
| `cx-p2_11-shell-20261104-05/serial_peer_verification` | FAST_SIM_MODE=1，两个真实 CMAC+GT 端点及接收链 | 226930 | 超过 BASIC 50000，功能仿真未开始 |
| 同构建 `instance_profile_endpoint_02` | 一个完整 CMAC+4GT 端点 | 113433 | 诊断；超过上限 |
| 同构建 `instance_profile_gt_quad_03` | 四通道 GT 子核 | 94889 | 诊断；GT 本身超过上限 |
| 同构建 `instance_profile_gt_common` | 一个 GT shared/common wrapper | 52779 | 诊断；共享 PLL 模型本身超过上限 |
| 同构建 `instance_profile_gt_channel_03` | 单 GT channel wrapper | 10521 | 仅完成 1ns 规模诊断，不是 GT 功能 PASS |
| 同构建 `instance_profile_axis_tx` / `instance_profile_axis_rx` | AXIS/LBUS 适配 | 4 / 23 | 仅完成规模诊断 |
| `cx-p2_11-shell-20261104-06/instance_profile_endpoint` | GT_LOCATION=0，真实 CMAC 数字端点 | 18529 | 仅完成规模诊断，低于上限 |
| 同构建 `digital_peer_verification` | 两个真实 CMAC 数字端点及完整接收链 | 37121 | 引擎已启动，4096 包功能检查执行中 |

模块在不同上下文展开，不能把各行直接相加作为某个完整设计的精确实例数。诊断测试刻意观察所有输出，部分信号为 X；其 marker 是 `PROFILE`，不是 `PASS`。早期 `instance_profile_*`、GT `_02` 的脚本生成/模块查找失败保留，不作为上述有效规模数据。

## 哪些优化有效

1. **FAST_SIM_MODE 没有降低本次完整测试的实例数。** 与原 shell-04 的完整串行 peer 相同，仍为 226930。它缩短对齐标记间隔；不能把“更快完成对齐”当成“更少模型实例”。GT 生成的顶层与 channel wrapper 在 shell-04/05 中 SHA 相同，GT 本来已用 FAST 模型及 SIM_RESET_SPEEDUP。
2. **debug off 已在用。** 少发包、少采波形可以减少时间/文件，无法解决当前 time 0 之前的实例上限。
3. **只删第二个端点或简化我们自己的 RTL 不够。** 单端及四通道 GT 的独立诊断都超过 50000。共享 PLL 模型占据主要开销；该模型为厂商库内部实现，本项目不修改/替换其内部逻辑来规避许可检查。
4. **有效方向是按真实接口拆开验证。** 使用 IP 支持的 `CONFIG.GT_LOCATION=0`，让 CMAC 暴露并行 SERDES 数据/控制/时钟/复位端口。单个真实 CMAC 数字模型实际为 18529 实例；这里没有用自写 AXIS 发包器假冒 CMAC。
5. 已检查安装的 UNIFAST 源：有 GTXE2/GTHE2 等模型，无 GTYE4/CMACE4 对应快速替代；未使用不适用的库覆盖当前模型。

AMD 的 [PG203 Slow Simulation](https://docs.amd.com/r/en-US/pg203-cmac-usplus/Slow-Simulation) 明确列出绕过收发器、编写相应测试台的方法；[Simulation Speed Up](https://docs.amd.com/r/en-US/pg203-cmac-usplus/Simulation-Speed-Up) 解释对齐间隔缩短。我们采用的是有明确数字接口的独立仿真配置，硬件实现 shell-04 仍保留真实 1 CMAC、4 GT、1 common，未改成无 GT 硬件。

## 数字链路验证边界

shell-06 的 `digital_peer_verification` 使用两个真实 `af_cmac` 模型，TX/RX 并行编码 lane 交叉连接，真实 CMAC 完成 FCS 插入/剥离及 AXIS 处理；接真实 `af_receive_pipeline`，沿用 12bin/T8/5槽/125MHz、4096 包/98304 个科学数据字、乱序源排列、20µs 消费停顿和逐字 golden/计数守恒检查。仅发送端 TX 使用 ready，接收端仍不可反压。复位来自测试台，SERDES/user clock 来自理想时钟，不声称验证 GT 提供的物理时钟和复位序列。

**实测数字组合为 37121 实例，比 226930 减少 83.64%，已低于 BASIC 50000 上限，引擎正常启动；功能尚未通过。** 原 `digital_peer_verification` 于09:52自然结束，6.438404ms仿真时间触发启动超时：queued/results/finished均为0，不能报硬件容量失败。其原始FAILED及日志保留，没有覆盖。

新增 `_02` 使用分段 `run`/`current_time` 和SV heartbeat，不采波形；确认真实CMAC约105.137µs时双端aligned/status均为1，TX ready为1，但接收链未启动。`_03` 加入配置/复位观察及对齐后启动看门狗，发现接收pipeline.state、generation、core_ready持续X；编译日志有VRFC 10-2938：rst_n已在声明前被隐式声明。数字/串行TB生成器把CMAC实例插在刺激reg声明之前；已将reg声明前移，并加default_nettype none防止以后静默产生隐式连线。`_04` 为修正后新鲜完整4096包测试，正在执行；只有新鲜marker才能确认修复及功能通过。没有修改7个接收RTL或厂商模型。

`_04` 已实际确认正常复位、generation=1、配置握手与跨域req/ack一致，随后进入真实MAC收包/事务提交和逐字读取；截至本轮观察已提交2048包，尚未最终PASS。`_03`在对齐后启动看门狗处自然失败；`_02`经用户单独明确授权，于10:11只终止其已核对worker祖先链的旧kernel，wrapper/worker自然退出，保留原FAILED，不改成测试PASS。该目录的user_termination_result/audit记录保留了核对方法和初次审计序列化受文件共享限制的错误说明；有效 `_04`未受影响。

`_05` 为10bin/T8/5槽/125MHz，新鲜完整4096包/81920字组合，额外做两项前置检查：先真实提交一个source并留在ring中，再复位两个CMAC和接收链、重新对齐/配置，确认旧resident/pending/写计数和队列均清空；再通过真实发送CMAC的TX error标志发送错误帧，确认真实接收CMAC输出1次error和1次bad-FCS脉冲，入口bad/error/整包丢弃各1，queued/committed/科学写入均为0。两项前置断言已通过，后续4096包逐字检查仍执行中；它们不是整个SIM的PASS。理想时钟保持运行，此处复位验证不包含GT复位控制器。

辅助回归 `cx-p2_06-pipeline-20261104-15` 在processing reset释放后延后14000个125MHz周期（112µs）下发配置，独立接收链4096包/98304字SIM通过：222673有效周期、FIFO峰值3833、ring峰值385、2500停顿周期。该回归排除“晚配置普遍导致接收核不能启动”的猜测，不代替CMAC组合检查。`pipeline-14`只因Tcl set_property参数格式失败，未运行SIM；保留原目录，不计通过。

运行目录均为 `D:/work/build/apertureforge-fpga/cx-p2_11-shell-20261104-06/` 下各独立label；后台worker不设终止超时，不因观察等待而重启。原完整GT串行TB也已修正同一声明顺序，新的自写源未进行完整串行SIM；历史226930计数只是规模证据。

即便数字测试通过，其覆盖范围仍不包含 GT 串行收发、CDR/QPLL、GT 复位控制器及 GT→CMAC 的物理时钟/复位启动。shell-04 的实际 SYNTH/ROUTED 证据可证明这些硬件实例存在及已实现，不能代替上述动态仿真。原完整串行 M3 验收保留缺项，M4 未开始。

本轮 shell-05/06 只生成仿真配置，**SYNTH：NOT RUN；ROUTED：NOT RUN；BOARD：NOT RUN**。不能给它们套用 shell-04 的资源/时序结果。所有 source_snapshot、编译源生成 hash、原始 stdout/status 与 marker 的绝对路径和 SHA-256 都记录在独立机器摘要中。

## 与真实硬件配置的对应关系

数字/物理CMAC的用户配置仅4项差异：FAST_SIM_MODE、GT_LOCATION、INCLUDE_SHARED_LOGIC和派生的ADD_GT_CNRL_STS_PORTS。实际CMAC核83项参数仅RX/TX对齐间隔不同（0x3FFF→0x03FF）；413项核内符号端口绑定一致。7个接收RTL与shell-04冻结源逐文件SHA相同。该检查仅为配置/源码身份审计，不是形式等价证明；GT时钟/复位驱动差异仍明确排除。

测试中的第二个CMAC充当对端发送机。实际KU5P综合仍只有一个CMACE4、四条GT通道；仿真对端不计入目标芯片资源。

## 现有真实shell布线的时钟复查

新实验 `D:/work/build/apertureforge-fpga/cx-p2_11-sta-20261104-02` 读取shell-04原routed DCP，仅改变processing clock约束，每点独立新子目录，不重新综合或布线。DCP SHA-256为 `f346d0e4b93a1cbaf6f53e4a7866f427b7f0129244b7a8e1c2820e472e512d8e`；其原source_snapshot SHA为 `8ae23837bbe02a1169c04ac6974ce3eb9580026a2c30bc3f4806ba4d4f855f37`。本轮冻结的9个硬件RTL均与该源相同。

| 同一布线的processing时钟约束 | WNS/ns | TNS/ns | WHS/ns | STA结果 |
|---|---:|---:|---:|---|
| 125MHz | +0.105 | 0 | +0.014 | setup/hold通过，与原报告相同 |
| 200MHz | −2.851 | −17038.484 | +0.014 | setup失败 |
| 250MHz | −3.851 | −31883.393 | +0.014 | setup失败 |

分类为 **SAME_ROUTE_STA_RECHECK**；SYNTH/ROUTED均NOT RUN。每点保留clock、交互、bus-skew及processing关键路径报告。不以该复查宣称重新布局布线的Fmax极限，也不把125MHz功能流量折算为200/250MHz吞吐。`sta-01`同125MHz报告写完后，在清理无工程状态时调用close_project报错；原目录保留，修正guard后在全新sta-02复现全部三点。


## 数字边界最终结果（2026-11-04补录）

- _04：COMPLETE/PASS，4096包、98304字、222708有效周期，FIFO峰值3832，ring峰值385，2500周期20µs停顿；10:38:44自然结束。
- _05：COMPLETE/PASS，4096包、81920字、220371有效周期，FIFO峰值3381，ring峰值333，2500周期停顿；reset_probe=1、bad_probe=1、mac_error_seen=1、mac_bad_fcs_seen=1；10:54:18自然结束。

以上范围均为CMAC_DIGITAL_BOUNDARY_ONLY，不能改写为完整GT串行PASS。完整worker status、marker及stdout路径/hash已收集进独立JSON。
