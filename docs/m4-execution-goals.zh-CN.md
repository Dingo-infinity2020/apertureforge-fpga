# M4 执行目标与当前批次

日期：2026-11-04。代理：opencode。分支：`opencode/m4-science`。用户已明确授权开始M4，并决定 **Vivado 2025.1 为主版本**。

## 0. 审阅结论

已逐节审阅[docs/m4-plan-vivado-2025.1.zh-CN.md](m4-plan-vivado-2025.1.zh-CN.md)。执行顺序、依赖和验收边界内部一致，本文件把它转成可执行目标，不改变原计划结论：

- M4先做科学契约、2025.1环境/IP、读适配器，再做完整波束、二维FFTT、EPIC和真实shell组合。
- 不默认三模式同时驻留；每个模式分别构建、分别报告。
- M2/M3的125MHz接收链和12bin/64 URAM是起点，不是M4科学核通过证明。
- 原250MHz/10Mpps未通过；M4不能继承旧WNS或旧吞吐。
- KU11P/KU15P不进入必测矩阵；DDR/上板/RFSoC开发不在M4。

## 1. 工作树与证据边界

开始本轮时工作树不是干净的：

- HEAD为`ae69ad0`；当前分支`codex/m2-m3-receiver`带有Codex未提交的M2/M3成果和新M4计划。
- opencode新建`opencode/m4-science`分支继续；不覆盖、不回退Codex未提交文件。
- 本轮只新增M4文件；对`AGENTS.md`只做2025.1主版本和交接所需的最小修改。
- 外部构建目录使用`D:/work/build/apertureforge-fpga/oc-m4-...`；不写入Codex的`cx-`目录。
- 所有M4结论必须引用新构建的源hash、报告和原始文件；分析预算不能写成实测。

## 2. 目标

| 工作包 | 目标 | 出口 | 当前状态 |
|---|---|---|---|
| M4-00 契约、2025环境和资源账本 | 固定科学定义/几何/时间/精度；验证2025.1 FFT/CMY IP、生成/综合/仿真库和checkout；资源与访存图；独立参考 | 科学契约、容差表、IP依赖/配置、1024输入需求计算、独立参考测试 | **已完成首轮：环境/IP/仿真库/契约/容差/参考；RTL/IP误差待复验** |
| M4-01 共用读口、校准和科学输出 | descriptor/read/data/done适配器、去包/映射/零填、极化配对、乘积/积分、有限输出FIFO | 逐字adapter测试、missing/generation/reset/反压回归、读效率/RAM/周期账本 | **首轮部分完成：reader SIM+SYNTH通过；未接真实core/零填/极化产品** |
| M4-02 完整波束核 | 1024天线双极化、运行时权重、1/4/16束；先1束低L完整组合 | 每束数/带宽/精度/输出SIM、SYNTH、ROUTED边界 | 未开始 |
| M4-03 完整二维FFTT | 32/64点一维验证，32²规则控制，32×32补零到64²；两极化/转置/配对/积分 | 直接DFT参考、完整二维SIM/SYNTH/ROUTED、吞吐 | 未开始 |
| M4-04 EPIC全链 | 频率相关位置/核系数、3×3真实冲突gridding、接FFT和极化积分；5×5对照 | gridding/完整EPIC SIM/SYNTH/ROUTED、误差/冲突报告 | 未开始 |
| M4-05 三模式完整组合与边界 | 各模式接真实单CMAC/RX/CDC/ring和输出，替代M3测试消费者 | 每模式最高通过点与邻接失败点、帧率/队列/损失账本 | 未开始 |
| M4-06 汇总与交接 | 同口径能力表、复现、限制、资源归属；更新文档和机器摘要 | M4逐项审计，供M5使用 | 未开始 |

## 3. 本轮执行切片：M4-00

本轮只做M4-00，不提前写科学核。M4-00必须回答：

1. 2025.1下`xfft:9.1`和`cmpy:6.0`的实际合法候选配置是什么？
2. IP生成、仿真目标、综合run和许可checkout是否真实可用？
3. 1024输入、L=1..12、双极化的需求下界和剩余资源/存储账本是什么？
4. 浮点独立参考和定点精确参考的入口、容差和未知项是什么？
5. 哪些结论仍是`NOT RUN`/`NOT VERIFIED`？

### M4-00出口检查

- [x] 科学契约结构冻结（阵列、编号、时间/频率、波束/FFTT/EPIC、输出、积分）。
- [x] 容差表有明确场景/阈值/统计长度/归一化；首轮值来自32-seed独立数值研究，RTL/IP复验仍待做。
- [x] 2025.1 IP配置和生成/综合/仿真库证据新鲜。
- [x] 资源/存储/访存账本与M3实际数字分开，估算标明估算。
- [x] 独立浮点参考和至少一组参考测试通过；定点参考入口明确（逐样本等价仍NOT RUN）。
- [x] 未知项和下一步写入报告与执行目标；AGENTS交接待本轮收尾更新。

## 4. 当前构建

- M4-00外部构建：`D:/work/build/apertureforge-fpga/oc-m4-00-20261104-03`。
- 源快照：`source_snapshot.json`，SHA256 `31d1524eccbcfc41f4347045501dc68aa1304d43c9183348c00ee0d80578d46e`。
- 工具：Vivado 2025.1，器件`xcku5p-ffvb676-1-i`。
- 候选IP：`xfft:9.1`（64点，16bit输入，natural order，nonrealtime，自动实现选择）OOC synth 1435 LUT/2689 FF/3.5 BRAM36/9 DSP，WNS +8.804ns；`cmpy:6.0`（16×16输入，33bit输出，NonBlocking，Use_Mults，Resources）OOC synth 2 LUT/114 FF/3 DSP，WNS +98.804ns。
- 仿真库：两个IP的`xvhdl`+`xelab`编译/elaborate通过，日志在外部构建`sim_check/`。
- 参考：`models/m4-science-reference.mjs` + `tests/m4-reference.test.mjs`，6项M4测试、28项Node测试全部通过。
- 容差首轮：`scripts/m4-tolerance-study.mjs` 运行32个确定性种子，结果在[reports/m4-00-tolerance.json](../reports/m4-00-tolerance.json)；波束RMS≤0.012、FFT L2≤0.008、EPIC L2≤0.008、Stokes Q≤0.02等。
- 原始报告、IP生成物和日志只留在上述外部目录；仓库只保留脚本、契约、独立参考和紧凑摘要。详见[reports/m4-00-environment.zh-CN.md](../reports/m4-00-environment.zh-CN.md)。

### M4-01 首轮读适配器

- 外部构建：`D:/work/build/apertureforge-fpga/oc-m4-01-20261104-01`；snapshot SHA256 `477585a700aa9e0b4ee31f7a35d62243cbb3831e3021c69dd4b2eefb15d599b7`。
- 新增`rtl/af_science_reader.sv`、`sim/tb_af_science_reader.sv`、`tcl/m4_reader.tcl`、`constraints/m4_reader_ooc.xdc`。
- SIM：全256源2560读/样本/2566周期；缺源40读/252扫描跳过；输出反压714周期；中途复位后20读/样本。PASS标记在外部构建`vectors/behavioral_simulation_pass.txt`。
- SYNTH：8ns OOC WNS +5.812ns，233 LUT、1620 FF、0 BRAM/URAM/DSP，内部无时钟/未约束端点0。
- 边界：只有单slot `af_ring_store` 模型；缺源只输出mask/count给下游零填；done等到下游样本排空；没有极化配对/产品/积分/输出FIFO，没有真实core/CMAC组合。
- 详见[reports/m4-01-reader.zh-CN.md](../reports/m4-01-reader.zh-CN.md)。

## 5. 下一步

1. 把reader接到真实`af_receive_core`的descriptor/read/data/done边界，补零填/极性映射/产品/积分/有限输出FIFO。
2. 在真实core+ring上重跑逐字/反压/配置切换/复位回归和读效率账本。
3. 上述完成后再进入M4-02低L波束闭环；不启动M4-03 FFTT或M4-04 EPIC。

当前不启动M4-02及以后，不开始波束/FFTT/EPIC实现，不提交/推送，除非用户明确要求。
