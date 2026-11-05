# M4-00 环境、IP 依赖与科学契约首轮

日期：2026-11-04。代理：opencode。分支：`opencode/m4-science`。状态：**M4-00 部分完成；M4 未验收**。

本页只记录M4-00已实际执行的2025.1环境/IP/参考测试。科学核、完整读适配器、ROUTED科学路径和真实shell组合均未开始。

## 1. 2025.1环境

- 工具：`D:/AMDDesignTools/2025.1/Vivado/bin/vivado.bat`，实际`version -short=2025.1`。
- 器件：`xcku5p-ffvb676-1-i`。
- 外部构建：`D:/work/build/apertureforge-fpga/oc-m4-00-20261104-03`。
- 源快照：`source_snapshot.json`，SHA256 `31d1524eccbcfc41f4347045501dc68aa1304d43c9183348c00ee0d80578d46e`。
- 2026.1安装保留，本页所有IP/仿真/综合结果均来自2025.1，未混用两版本产物。

## 2. IP候选与结果

| IP | 候选配置 | SYNTH | OOC资源 | OOC 10ns时序 |
|---|---|---|---|---|
| `xfft:9.1` | 64点、16bit输入、natural order、nonrealtime、自动实现、scaled、convergent rounding | Complete 100%，0 errors/0 critical | 1435 LUT、2689 FF、3.5 BRAM36、9 DSP、0 URAM | WNS +8.804ns、WHS +0.039ns |
| `cmpy:6.0` | A/B 16bit、输出33bit、NonBlocking、Use_Mults、Resources | Complete 100%，0 errors/0 critical | 2 LUT、114 FF、0 BRAM、3 DSP、0 URAM | WNS +98.804ns、WHS +0.039ns |

边界：

- 这是IP的OOC综合，不是完整科学核，也不是125MHz系统ROUTED。
- 两份时序报告的时钟要求是生成的10ns OOC约束，不能当作M4算法域125MHz通过。
- 资源不能直接线性相加到M3 shell；FFT/CMY的资源与共享twiddle、缓存和wrapper有关，必须由完整设计重新综合。
- 许可：两份run日志均实际取得`Synthesis`/`xcku5p`许可，未出现IP license checkout失败。

## 3. 仿真库

- 两个IP的`Simulation`目标均已生成：`m4_ip_sim_targets.tsv`两行均为存在。
- 实际用2025.1 `xvhdl` + `xelab`编译/elaborate通过：
  - `m4_fft_probe` → `fft_probe_sim`
  - `m4_cmpy_probe` → `cmpy_probe_sim`
- 日志在外部构建`sim_check/`：`fft_xvhdl.log`、`fft_xelab.log`、`cmpy_xvhdl.log`、`cmpy_xelab.log`，四项退出码均为0。
- 这证明IP仿真库可编译/elaborate，不等于完整科学TB或数值SCoreboard已跑。

## 4. 资源与存储账本

M3标准2025.1 shell实际值（历史证据）：17794 LUT、15926 FF、10 DSP、64 URAM、64.5 BRAM36，125MHz WNS +0.030ns。由此扣除后的账面余量：

| 资源 | 余量 | 说明 |
|---|---:|---|
| LUT | 198166 | 账面扣除，不是可用逻辑字节 |
| FF | 417994 | 同上 |
| DSP | 1814 | 含完整算法并行度前的上限 |
| BRAM36 | 415.5 | 约1.826MiB物理位数；未扣端口/银行/宽深取整 |
| URAM | 0 | **已被M3接收ring用满** |

M4的首要约束不是DSP，而是**URAM为0、BRAM和125MHz余量很小**。波束系数、EPIC 3×3/5×5系数、FFT转置、全Stokes积分状态都必须先做存活期/端口/银行账本；不能把“DSP还剩1814”当成可以任意扩束。

## 5. 1024输入需求下界

主合同：N=1024、P=2、I/Q8、Fs=320MS/s、时间FFT 4096、H=4096、78.125kHz/bin、12.8µs/谱。

| L | 单片频带MHz | 科学输入Gb/s | 一束复MAC G/s | 完整单极化空间变换百万次/s（两极化合计） |
|---:|---:|---:|---:|---:|
| 1 | 0.078125 | 2.56 | 0.160 | 0.15625 |
| 2 | 0.156250 | 5.12 | 0.320 | 0.31250 |
| 4 | 0.312500 | 10.24 | 0.640 | 0.62500 |
| 8 | 0.625000 | 20.48 | 1.280 | 1.25000 |
| 12 | 0.937500 | 30.72 | 1.920 | 1.87500 |

12bin时64×64行列每阶段约7.68G复网格点/s，理想下限约62 lane等效/阶段；EPIC 3×3约17.28G核点复更新/s。这些是需求下界，不是实际DSP/时序能力，也不是已通过配置。

## 6. 独立参考

- 新增`models/m4-science-reference.mjs`：浮点复加/复乘、直接波束、直接1D/2D DFT、Stokes极化产品、3×3 box gridding、积分和定点辅助。
- 新增`tests/m4-reference.test.mjs`：6项全部通过；含冲激DFT、在相位波束、缺源mask、圆极化Stokes符号、EPIC核守恒、积分/定点饱和。
- 当前Node测试总数28项，全部通过。
- 新增`scripts/m4-tolerance-study.mjs`：32个确定性种子，I/Q8输入+I/Q16权重量化，结果在[reports/m4-00-tolerance.json](m4-00-tolerance.json)。最大观测：波束RMS 0.00799、峰值幅度0.01504、相位0.0324rad；FFT L2 0.00438；EPIC L2 0.00499；Stokes Q 0.01101。
- 这些测试验证独立参考和数值容差入口，不是RTL逐样本等价，也不是1024输入RTL已通过。

## 7. 科学契约状态

- 结构契约候选已写入[config/m4-science.json](../config/m4-science.json)和[docs/m4-science-contract.zh-CN.md](../docs/m4-science-contract.zh-CN.md)。
- 已冻结：阵列/编号、时间频率、L候选、时间积分K候选、波束/FFTT/EPIC路径、输出元数据、精度候选。
- 首轮容差已冻结：波束电压RMS≤0.012、峰值幅度≤0.025、相位≤0.05rad；FFT L2≤0.008且峰值落格一致；EPIC L2≤0.008；Stokes I≤0.008、Q≤0.02、U/V≤0.015。它们来自独立数值研究，RTL/IP必须用同一参考复验，不能看到综合结果后放宽。
- M4-00环境/IP/契约/容差/参考出口已满足；M4-00不是科学核验收，M4-02及以后未启动。
- 未知：真实天线坐标/方向图、2025.1 FFT合法SSR吞吐、CMY精确延迟/舍入、K/输出带宽与有限FIFO策略。

## 8. 证据文件

外部构建`D:/work/build/apertureforge-fpga/oc-m4-00-20261104-03`：

- `reports/m4_ip_environment.tsv`
- `reports/m4_ip_config.tsv`
- `reports/m4_ip_sim_targets.tsv`
- `reports/m4_ip_runs.tsv`
- `reports/m4_fft_probe_synth_1_{utilization,timing}.rpt`
- `reports/m4_cmpy_probe_synth_1_{utilization,timing}.rpt`
- `sim_check/*_xvhdl.log`、`sim_check/*_xelab.log`
- `source_snapshot.json`

契约/容差最终快照：`D:/work/build/apertureforge-fpga/oc-m4-00-20261104-04/source_snapshot.json`，SHA256 `acd30ed45730497c56c26966353e4b06659890d0855a4ac6527986fe17cecaee`。

仓库紧凑机器摘要：[reports/m4-00-environment.json](m4-00-environment.json)；数值研究和冻结门槛：[reports/m4-00-tolerance.json](m4-00-tolerance.json)。

## 9. 未做/下一步

未做：

- IP ROUTED、完整科学核SIM/SYNTH/ROUTED。
- M4-01读适配器、M4-02波束、M4-03 FFTT、M4-04 EPIC、M4-05真实shell组合。
- 定点oracle与RTL逐样本等价。
- DDR、上板、JTAG/光纤/PCIe/驱动、RFSoC开发。

M4-00首轮已满足环境/IP/契约/容差/参考出口；下一步按计划进入M4-01：先做descriptor/read/data/done读适配器、去包/映射/零填、极化配对、乘积/积分和有限输出FIFO。M4-01读效率账本和逐字测试完成前，不启动完整波束/FFT/EPIC。
