# M4-01 共用读适配器首轮

日期：2026-11-04。代理：opencode。状态：**M4-01 首轮部分完成；尚未接真实接收核/CMAC**。

本轮按M4计划先做共用读口，不启动波束/FFTT/EPIC实现。

## 1. 实现

新增：

- `rtl/af_science_reader.sv`：持有descriptor，遍历source/word，按`desc_mask`跳过缺源，为每个已接受读请求排队source/word/sequence/generation/slot标签；输出present-source样本；block header携带mask/count。
- `sim/tb_af_science_reader.sv`：使用单slot `af_ring_store`（2560字）做逐字数据检查，覆盖全源、缺源、输出反压和中途复位。
- `tcl/m4_reader.tcl`：2025.1准备/仿真/OOC综合/收集入口。
- `constraints/m4_reader_ooc.xdc`：8ns（125MHz）算法域OOC时钟。

接口边界：

- 读请求只对`desc_mask[source]=1`的source发起；缺源不等待永远不会来的ready。
- 下游必须用`block_mask`/`block_count`做零填/缺源语义；本轮没有在reader内部输出整块零填样本。
- `done`只在所有读完成且所有样本被下游接受后返回；因此ring槽会一直占用到下游排空。这个策略被明确记录，后续可比较“先转入自有FIFO再done”的替代策略。

## 2. 仿真

外部构建：`D:/work/build/apertureforge-fpga/oc-m4-01-20261104-01`。

| 场景 | 结果 |
|---|---|
| 全256源 | 2560读、2560样本、2566周期 |
| 缺源（4源） | 40读、40样本、扫描跳过252源、298周期 |
| 输出反压 | 2560样本、714反压周期、3280周期 |
| 中途复位后小测 | 2源、20读/样本、跳过5源、31周期 |

- 逐字检查：`sample_data[31:0] == source*10+word`。
- 读地址检查：没有对缺源发起读。
- 元数据检查：sequence/generation/slot一致；done元数据一致。
- 总仿真周期8780；PASS标记`vectors/behavioral_simulation_pass.txt`。

读效率：全源块2560字用2566周期，约1.002字/周期；这是单slot、无真实core/CMAC条件下的reader上限，不是最终系统吞吐。

## 3. 综合

| 项目 | 结果 |
|---|---|
| 综合 | `synth_design Complete!`，0 errors、0 critical warnings |
| 资源 | 233 LUT、1620 FF、0 BRAM、0 URAM、0 DSP |
| 8ns WNS | +5.812ns |
| 内部无时钟/未约束端点 | 0 / 0 |

边界：只有OOC SYNTH，没有ROUTED、DRC、CDC、post-route网表或真实接收核组合。不能写成M4-01整体完成。

## 4. 证据

- 源快照：`source_snapshot.json`，SHA256 `477585a700aa9e0b4ee31f7a35d62243cbb3831e3021c69dd4b2eefb15d599b7`。
- 原始报告：`reports/utilization_synth_1.rpt`、`reports/timing_synth_1.rpt`。
- 原始仿真：`project/m4_reader.sim/sim_1/behav/xsim/`。
- 紧凑机器摘要：[reports/m4-01-reader.json](m4-01-reader.json)。

## 5. 未做/下一步

- 接真实`af_receive_core`的descriptor/read/data/done边界，而不是单slot store模型。
- 零填/天线-极化映射、极化配对、XX/YY/XY*/YX*、积分和有限输出FIFO。
- 持续/停顿/超载账本；routed时序、CDC和post-route网表。
- 上述完成前不启动M4-02完整波束、M4-03 FFTT或M4-04 EPIC。
