# Codex 接手：M2接收闭环至M3真实CMAC组合

**最终状态：M2/M3本轮范围验收完成，M4未开始。** 2025.1完整CMAC/GT串行SIM 4096包/98304字PASS；标准FAST_SIM_MODE=0的真实单CMAC shell 125MHz ROUTED通过，WNS +0.030ns/WHS +0.018ns、CDC unsafe/unknown=0。逐项证据和适用边界见[最终验收](phase2-m2-m3-acceptance.zh-CN.md)。本文以下为历史过程，旧BASIC限制、运行中和NOT_ACHIEVED描述已由此终态取代；旧原始失败记录未改写。

最新迁移工作见[2025.1重建与完整串行验证](phase2-v2025-migration.zh-CN.md)。旧2026.1的实例限制已在2025.1新会话中越过引擎启动关口，完整串行SIM仍在运行，不能提前验收M3。

**2026-11-04 实例优化补充：** 用户要求先减少实例。新鲜FAST_SIM_MODE完整串行测试仍226930；GT quad自身94889。采用真实CMAC支持的无GT数字接口配置，双端真实CMAC＋完整接收链实际37121实例，当前BASIC授权已启动引擎；4096包功能检查执行中，尚无PASS。详见[独立实例优化记录](phase2-cmac-instance-optimization.zh-CN.md)及[独立机器证据](phase2-cmac-instance-optimization.json)。以下完整串行验收缺项仍成立；新数字测试不替代GT串行/PLL/复位验证，M4未开始。

2026-11-03开始，2026-11-04更新；分支`codex/m2-m3-receiver`，接手提交`ae69ad0`。**M3数字组合验证推进中，完整GT串行验证仍受模拟器规模限制，目标未完成**；本轮没有进入M4科学核。当前不commit/push、不上板、不开发RFSoC。最新结构化证据见[机器摘要](phase2-cx-m3.json)，重建入口为`node scripts/phase2-cx-evidence.mjs`（只读取已有证据）。

**最新结论（2026-11-04）：** 12bin/T8/125MHz接收链的RTL、ROUTED和布线后功能网表证据已齐：网表4096包/98304字逐字通过，另有128块RTL长测32768包/786432字、16次20µs停顿通过；13bin同缓存首burst空间拒收。原250MHz/10Mpps目标仍未通过。真实单CMAC组合已完成SYNTH/ROUTED，实际1 CMAC/4 GT/1 common、0黑盒；12bin为15092 LUT/15701 FF/10 DSP/64 URAM/64.5 BRAM36，WNS +0.105ns、WHS +0.014ns、零route errors/DRC Error或Critical。完整CMAC串行peer仍受XSim BASIC实例限制，正在全新目录再次核验授权状态；内部2项CDC-10原始告警保留，**M3尚未整体验收**。新证据及逐项审计见文末，前面保留历史步骤。

## 接手核对

- 接手时工作区干净，本地与远端SHA一致，22项Node测试通过。
- 当前14项RTL/测试台/脚本源hash与`oc-p2_06-20261103-04/source_snapshot.json`一致。
- opencode实际CMAC IP综合及许可已通过；组合核250MHz WNS为−3.406ns，4096包接收106498周期。以上是历史构建证据，详见[opencode报告](phase2-oc-20261103.zh-CN.md)。
- Codex使用自己的`vivado`MCP；没有操作opencode的会话或已有外部构建。

## 实验CX-01：去除命令地址的冗余预览选择

构建`D:/work/build/apertureforge-fpga/cx-p2_06-20261103-01`；源hash见该目录`source_snapshot.json`，完整自写源码副本在`source/`。新入口`scripts/prepare-phase2-core-run.mjs`先冻结源码，再从冻结副本建项目，避免后续工作树改动污染正在运行的综合。

改动：ready仍检查预览新鲜度；命令评估/行地址选择不再由新鲜度多路器驱动。新鲜预览本就保证source/sequence与命令相同，直接使用命令字段；已受范围检查的bitmap索引取实际所需位宽。事务握手和每包周期不变。

| 证据 | 当前状态 |
|---|---|
| SIM，组合异常用例 | PASS：9个结果、40个读回字、4提交/5拒收、54写入/8拒绝写、13描述符 |
| SIM，完整负荷 | PASS：4096包、40960读回字；106498接收周期、109775排空周期；一次5000周期停顿 |
| SYNTH | COLLECTED：20016 LUT、14339 FF、8 DSP、56 URAM；250MHz WNS −1.346ns |
| ROUTED | COLLECTED：19972 LUT、14347 FF、8 DSP、56 URAM；250MHz WNS −2.748ns、TNS −26704.525ns、WHS +0.027ns；setup失败 |
| 组合post-route功能网表 | NOT RUN |
| 不可反压入口/CDC、完整CMAC组合 | NOT RUN |

新鲜标记位于`vectors/behavioral_simulation_pass.txt`、`vectors/core_perf_pass.txt`。SIM源可反压，仍不证明不可反压入口吞吐；250MHz条件折算约9.615Mpps，未达到10Mpps，250MHz时序也失败。

router过程估算曾为−2.792ns，最终`timing_impl_1.rpt`为−2.748ns，以最终报告为准。最终最差路径转为`control/pending → write_permit → store URAM CAS_IN_EN_A`（18级），下一组仍有`h_errors_q → control/pending`路径。内部no_clock/未约束端点为0；DRC/route内容与hash见机器摘要。本构建只验证已有异常/负荷场景，没有覆盖下述新发现的连续命令预览缺陷，不能作为当前保留源码。

## 报头提前一拍及宽度回归

在最终prefix拍到来时，报头已可拼接为完整值，提前送入原8级检查器；保留SEND_HEADER等待/后备，不改网络检查或包尾提交语义。

首次尝试`cx-p2_06-20261103-02`有`fire`隐式声明告警，仿真超时，没有PASS，不作为有效结果。将`fire`明确声明并独立assign后，`cx-p2_06-20261104-01`的异常/4096包SIM通过。该中间构建仍含旧预览失效缺陷，不保留为最终版本。

独立矩阵`D:/work/build/apertureforge-fpga/cx-p2_03-20261104-01`，冻结源码及102组网络参考重新生成，32/64/512bit分别53/53/60个结果PASS，总166个。包含AFP1负向字段、坏长度、跨拍、短尾、配置变化、复位、反压等原有检查，不只检查包数。矩阵没有运行SYNTH/ROUTED。

## 连续命令发现的真实预览失效缺陷

新测试`sim/tb_af_ring_preview.sv`持续提供预览，在一个reserve后立即重复请求；旧逻辑只清pre_b_valid，pre_a中更新前的pending位下一拍又恢复pre_b_valid，第二次reserve被错误接受。该错误在`cx-p2_04-preview-20261104-01`稳定复现：命令1返回reason=0，预期5；无PASS。它不意味着此前有间隔的4096包测试失败，而是此前测试没有覆盖此接口组合。

修复同时清除A/B两级有效位，应用于事务、head/封闭、配置与初始化失效。专门测试覆盖pending/present重复、source预览不匹配、越界source 256/65535、exact deadline、head前移、epoch切换和回复反压。修复后15条命令PASS，pending/resident最终均为0，计数守恒。

## 当前保留候选：`cx-p2_06-20261104-02`

构建目录`D:/work/build/apertureforge-fpga/cx-p2_06-20261104-02`，源码/脚本已冻结，使用`source/`副本运行，不从后续工作树取文件。包含地址简化、报头提前检查和双级预览失效修复。

| 证据 | 结果 |
|---|---|
| SIM，专门预览协议 | PASS，15条命令；已确认同一个测试能使修复前版本失败 |
| SIM，组合异常 | PASS，原9结果/40读回字及计数守恒 |
| SIM，4096包完整负荷 | PASS，40960数据字比较；接收102401周期，排空105678周期，5000周期停顿；峰值575个源贡献 |
| SYNTH | COLLECTED，20427 LUT、14352 FF、8 DSP、56 URAM、0 BRAM；250MHz WNS −1.652ns |
| ROUTED | COLLECTED，20683 LUT、14366 FF、8 DSP、56 URAM；250MHz WNS −3.227ns、TNS −32994.664ns、WHS +0.042ns；setup失败 |
| post-route功能网表 / SDF | 功能网表PASS（同一异常/40字比较） / SDF NOT RUN |
| 非停顿入口/CDC / 真实CMAC组合 | 后续已实现入口/CDC，见下文；真实CMAC组合未完成 |

与106498周期基线相比少4097周期，稳定约25拍/包。但整个有限测试为`4096×25+1`周期，按250MHz折算约9.999902Mpps、51.1995Gb/s科学数据，平均仍略低于10Mpps；目标时钟也尚未闭合，不能写成硬件51.2Gb/s通过。更快注入后峰值驻留由464变为575个源贡献，说明缓存峰值也要随真实服务重新测量。

下一步收集当前候选ROUTED和关键路径，完成同源组合post-route功能网表仿真；再实现[入口/CDC设计合同](../docs/phase2-ingress-design.md)，最终接真实CMAC。接收目标依然是M3，科学核留给M4。

以上为接收core历史步骤，已补齐其ROUTED及功能网表；下面是后续入口/CDC组合进展。`cx-p2_06-20261104-02`同一布线重查125MHz WNS +0.773ns，200MHz仍失败；不是这两个频率分别重新实现。网表仿真观察到URAM未使用B端级联输入相关模型告警，40字比较通过；未因此宣称板级通过或SDF通过。

## 不可反压入口：独立SIM与真实布线

`af_rx_ingress`使用数据/描述符两个XPM异步FIFO。第一拍按最大帧预留，完整包尾后发布；坏包回收、空间不足排空、不向后端暴露半包。处理域不向RX施加ready。统计分别属于RX与处理域。

- `cx-p2_02-20261104-01/02`完成小容量独立SIM；覆盖不同频率/相位、部分keep、坏尾/早期error、缺尾超时、超长、两类队列满、输出反压和复位中断。
- `...-03`扩大到默认4096字、9014B最大帧并通过SIM。
- 初始`...-02`独立ROUTED：589 LUT、1187 FF、64.5 BRAM36、0 DSP/URAM；RX322.265625MHz/处理250MHz WNS −0.912ns，失败。不是FIFO容量问题，而是包尾长度判断到描述符FIFO的组合路径。
- 平衡keep计数并寄存描述符后，`...-04`独立SIM/SYNTH/ROUTED完成：**604 LUT、1194 FF、64.5 BRAM36、0 DSP/URAM，WNS +0.059ns、WHS +0.046ns，TNS/THS=0**；内部无时钟/未约束端点均为0。CDC与bus-skew报告保留在外部目录。
- `...-05`补处理域本地复位门控修正，默认容量SIM通过；完整包队列守恒、坏包5、空间拒收32、峰值4089/4096字、reset后仅新包交付。其最终时序由后续完整组合验证，不能直接沿用`-04`数字。

## 入口＋CDC＋真实接收核：当前组合

`af_receive_pipeline`负责配置快照、跨域flush握手、入口复位保持32个RX周期、解析器prime，再连接真实core。FIFO占BRAM，科学时间窗ring占URAM；当前5槽×256源×20字=1.5625MiB raw ring。

当前测试为**每片10个频率bin、每包8个电场时刻、125MHz处理域**，即全阵列0.78125MHz分片、25.6Gb/s名义科学负荷、2.5Mpps。它是原mapped128每片负荷的一半，不能代替原20bin/T=2/10Mpps目标。输入是独立322MHz接口时钟的确定性源，完全不等待ready；尚未包含CMAC IP。

| 构建（外部目录同名前缀） | 证据与结论 |
|---|---|
| `cx-p2_06-pipeline-20261104-01` | 4096包/81920数据字SIM PASS；SYNTH发现139 unsafe、2191 unknown CDC端点。原始RX复位组合门控处理域使能，拒绝作为已验证组合；其ROUTED仅保留历史证据 |
| `...-02` | 修正处理域使能后，SIM PASS；SYNTH还剩1个CDC-10：二进制计数器译码驱动跨域异步复位。尚不能验收 |
| `...-03` | 将复位改为单个RX寄存器输出，SIM PASS；SYNTH 13917 LUT、12924 FF、56 URAM、64.5 BRAM36，CDC unsafe=0、unknown=0。此时描述符只有64项，尚未覆盖集中到包 |
| `...-04/05` | 256源每块按100Gbps线占用集中发送；64项描述符导致无损测试失败。诊断`-05`记录 started=256、queued=164、no_space=92，首个缺包引起结果源编号不连续；不作为PASS |
| `...-06`（当前候选） | 描述符扩为256项；相同100Gbps burst的16块共4096包全部提交/消费，81920字比较PASS，计数守恒且无空间丢弃；20µs停顿通过。入口峰值3384/4096字，ring峰值333个源贡献。SYNTH：13994 LUT、13007 FF、10 DSP、56 URAM、64.5 BRAM36；WNS +0.479ns、WHS +0.031ns、TNS/THS=0，CDC unsafe/unknown=0，内部no_clock/未约束端点=0。通过CDC检查后已启动ROUTED，最终实现待收集 |

`-06`源端首块在一个T=8块周期后开始发送，每块256包以100Gbps含帧开销预算集中到达，块间保持102.4µs无线电谱节奏。消费者25/32占空比，停顿2500个125MHz周期。有限端到端排空220337周期，不将名义25.6Gb/s等同于含首块组包等待/末块排空的平均速率，更不称硬件实测。

## 真实CMAC官方示例与新增仿真依赖

`cx-p2_11-example-20261104-02`由自写Tcl新建实际`cmac_usplus:3.1` CAUI4/AXIS、无RS-FEC，CMACE4_X0Y0、GTY X0Y12~15、ref161.1328125MHz；这是由IP参数生成的器件候选，仍须完整place/route验证，不代表板级QSFP/GT布线已确认。IP及官方串行回环示例生成完成，GT与CMAC真实仿真模型成功编译/elaborate。

**仿真引擎没有启动：XSim BASIC上限50000实例，官方示例113437实例。** 这是仿真器tier限制，与已验证的CMAC综合授权不同；没有把IP或GT替换成假模型，也没有force CMAC输出。状态`NOT RUN_SIMULATOR_TIER_LIMIT`，已询问用户是否有其他适用仿真授权；继续推进独立综合/布线。第一次`...-01`用错示例工程命令，修正为当前工具的`open_example_project -in_process`后在全新`-02`运行，原失败构建不覆盖。

M3仍未完成。下一步验证当前256描述符组合的ROUTED/CDC与bus-skew、补配置切换与完整组合网表测试，并建立真实CMAC shell实际综合/布线。完整CMAC仿真取决于适用的仿真授权。全程无上板，M4科学核未开始。

## 后续闭环：组合ROUTED及完整负荷功能网表

以下目录均位于`D:/work/build/apertureforge-fpga/`，不在Git内。每个构建的`source_snapshot.json`记录全部源SHA-256；表内给出该文件的SHA-256前16位，完整源及报告hash见机器摘要。数字不以当前分支HEAD替代历史冻结源。

| 构建 | snapshot文件hash前16位 | 新证据 |
|---|---|---|
| `cx-p2_06-pipeline-20261104-06` | `e6faea5570860daf` | ROUTED：13718 LUT/12875 FF/10 DSP/56 URAM/64.5 BRAM36；WNS +0.105ns、WHS +0.042ns、TNS/THS 0；内部无时钟/未约束端点0、route errors 0、DRC 0 Error/0 Critical/15 Warning；CDC unsafe/unknown 0，bus-skew最小余量+2.479ns |
| 同构建`netlist_verification_02` | 补充snapshot `eb4c153ff611e992` | post-route功能网表4096包/81920字比较通过，计数守恒，20µs消费者停顿通过。未做SDF，未包含CMAC IP |
| `cx-p2_06-config-20261104-02` | `3826cd2ed105df7a` | 配置切换SIM：两代次；取消旧反压结果/旧半包及排队数据、拒绝旧epoch、读回新20字；stale done不释放新槽；committed=2、discarded=1、consumed=1 |

物理报告分别为`reports/utilization_impl_1.rpt`、`timing_impl_1.rpt`、`cdc_impl_1.rpt`、`bus_skew.rpt`、`route_status.rpt`、`drc.rpt`。功能网表原始结果位于`netlist_verification_02/simulate.stdout.txt`与`acceptance_audit.json`。

此网表测试有两项工具问题，保留原始失败记录：第一次同步`launch_simulation`超过MCP自身300秒硬超时，工具自动停止了Codex自己的进程，未出现PASS；核实进程已退出后才新建自己的会话。之后改成`scripts_only`生成BAT，由独立隐藏Node worker执行并轮询，不设终止超时。第二次仿真实际运行约10分钟并逐字通过，但Vivado脚本沿用了原vectors include路径，只把PASS写到原路径；worker因找不到预期新路径记录FAILED。审计脚本检查新鲜时间戳、完整PASS日志、实际编译include/测试台绑定、冻结源hash、DCP/netlist hash及两份配置仅PASS路径不同，生成单独`acceptance_audit.json`；**没有改写原FAILED状态或补造PASS文件**。审计脚本另冻结在`netlist_result_audit/`。后续准备工具已改成显式验证include绝对路径；该修复尚未以第二轮长网表仿真重跑。

配置切换首次`...-01`是测试台在online变高同一拍误查旧阶段接口的检查问题，无PASS；`...-02`只修正阶段判断后通过。配置测试使用手动时间标签，不能用于吞吐结论。

## 新RX寄存器与局部负荷边界

首次真实CMAC综合发现其`rx_axis_tkeep`输出到入口包长/坏包计数路径过长，SYNTH WNS −0.678ns。新增RX输入一级预计算寄存器，data/keep/valid/last/error、字节数、keep检查一起延迟，后续状态机使用寄存结果。RX始终没有ready。新入口默认容量SIM为`cx-p2_02-20261104-06`，新10bin组合为`cx-p2_06-pipeline-20261104-07`；两者通过，不沿用旧版入口单核时序。

| 配置/构建 | snapshot文件hash前16位 | SIM与资源 |
|---|---|---|
| 10bin/T8/5槽/125MHz，`pipeline-07` | 完整源见机器摘要 | 4096包/81920字PASS；入口峰值3384字；物理实现由真实CMAC shell继续验证 |
| 12bin/T8/5槽/125MHz，`cx-p2_06-pipeline-20261104-08` | `773a049081207940` | 4096包/98304字PASS；入口峰值3833字，ring峰值385源贡献，排空222674周期；SYNTH 13904 LUT/13598 FF/10 DSP/**64 URAM**/64.5 BRAM36；ROUTED 13566 LUT/13464 FF/10 DSP/64 URAM/64.5 BRAM36，WNS +0.059ns、WHS +0.038ns、CDC unsafe/unknown 0，route errors 0、DRC 0 Error/0 Critical/15 Warning，bus-skew最小余量+2.515ns；新网表复测后台运行中 |
| 13bin，同其他参数，`cx-p2_06-pipeline-20261104-09` | `773a049081207940`，参数见其vectors配置 | 第一组256源burst：started=256、queued=253、no_space=3；结果251发现缺源，无损测试失败，无PASS；未综合 |

共同条件是256源每块按100Gbps线占用集中到达、块间102.4µs、20µs消费者停顿、4096数据项和256描述符。名义科学负荷从25.6增至30.72/33.28Gb/s，包率仍2.5Mpps；这是相同架构/合同的相邻测试，不是任意输入都成立的带宽上限。12bin raw ring占满KU5P全部64个URAM，尚未放入科学核。13bin按现有5槽存储还会需要33280个512bit字、72个URAM（由现有银行结构推算，非综合结果）。减槽、调度、提前累加或外部内存属于其他架构选择，当前结论不能宣称它们也失败。

## 真实单口CMAC shell：实际实现与剩余项

`af_cmac_rx`实际实例化生成的`cmac_usplus:3.1`，CAUI4/AXIS、无RS-FEC、RX FCS剥除、TX FCS插入；原生RX直接接不可停顿入口。`af_cmac_receive_shell`连接真实parser/ring/URAM并保留测试消费者接口，TX空闲。79个生成IP输入逐项连接，未使用fake CMAC；IP生成物留在外部目录。

| 构建 | snapshot文件hash前16位 | 证据 |
|---|---|---|
| `cx-p2_11-shell-20261104-01` | 完整源见机器摘要 | RX预计算前，真实组合SYNTH通过生成但setup失败；不是时序PASS |
| `cx-p2_11-shell-20261104-02` | `2979833aa7958efb` | RX预计算后ROUTED：15018 LUT/15702 FF/10 DSP/56 URAM/64.5 BRAM36，WNS +0.085ns、WHS +0.015ns，内部无时钟/未约束0，route errors 0；真实1 CMAC/4 GT channel/1 GT common、零黑盒；DRC 2 Critical（未固定refclk引脚/IBUF位置）/15 Warning；CDC 2 unsafe、0 unknown；bus-skew最小余量+2.355ns |
| `cx-p2_11-shell-20261104-03` | `e8520cd68b3ceb5c` | 同10bin存储，明确器件候选参考引脚K7/K6及GTYE4_COMMON_X0Y3/IBUFDS0；ROUTED 15025 LUT/15701 FF/10 DSP/56 URAM/64.5 BRAM36，WNS +0.048ns、WHS +0.014ns、route errors 0、DRC 0 Error/0 Critical/15 Warning，bus-skew最小余量+2.407ns |
| `cx-p2_11-shell-20261104-04` | `8ae23837bbe02a11` | 同物理候选，存储改24字/包（12bin/T8）；SYNTH 15518 LUT/16635 FF/10 DSP/64 URAM/64.5 BRAM36；ROUTED 15092 LUT/15701 FF/10 DSP/64 URAM/64.5 BRAM36，WNS +0.105ns、WHS +0.014ns、route errors 0、DRC 0 Error/0 Critical/15 Warning，bus-skew最小余量+2.547ns；完整串行peer仿真见下 |

候选GT为X0Y12~15、CMACE4_X0Y0。Vivado器件数据库确认K7/K6为MGTREFCLK0P/N_227、IBUFDS0位于GTYE4_COMMON_X0Y3。这只是器件级可实现位置，**没有验证厂家板卡的QSFP/参考时钟布线**。约束不是从板卡映射推定，也没有写bitstream或上板。CMAC scoped XDC建立refclk 6.206ns，GT派生RX/TX用户时钟3.103ns，处理8ns、init10ns；不存在手工伪造RX时钟。

原始2项CDC-10都在未改动CMAC IP内部：RX/TX reset-status组合逻辑到init_clk同步链，链有3级，前两级ASYNC_REG。生成IP XDC含相关CDC-10 waiver示例但处于注释状态；没有擅自启用或补宽泛false_path。结构归属已定位，不能据此声称风险已经消失。AMD将同步器前组合逻辑归为CDC-10，须按具体路径审查。[AMD UG906规则](https://docs.amd.com/r/2021.2-English/ug906-vivado-design-analysis/Understanding-the-Clock-Domain-Crossings-Report-Rules)。

人工复核生成wrapper：每条status的OR输入都先在TX用户时钟域寄存，同步后的init_clk status仅用于750ms链路watchdog的重载条件，没有直接连接本项目科学数据的valid、commit或slot控制。这帮助限定了审查范围，但不是消除组合逻辑毛刺/亚稳风险的证明，也未获得独立的完整CMAC运行验证。生成wrapper和XDC仅发布SHA-256，原文留在外部构建，不复制厂商源码进Git。

完整串行peer测试位于`cx-p2_11-shell-20261104-04/serial_peer_verification`：真实shell为DUT，第二个真实CMAC/GT作为发送端，串行交叉连接，使用相同逐字golden/消费者；没有force内部信号。compile/elaborate完成，226930实例；XSim BASIC只允许50000，仿真引擎未启动，状态**NOT RUN_SIMULATOR_TIER_LIMIT**。原worker虽因XSim返回0随后缺marker而报ENOENT，日志明确记录许可拒绝，机器摘要保留两个原始事实；worker后续版本已加入逐阶段错误/许可诊断。该测试台只编译/elaborate过，运行行为尚未验证。AMD说明仿真能力受工具tier限制，CMAC IP授权与工具tier不同。[AMD许可FAQ](https://www.amd.com/en/products/software/adaptive-socs-and-fpgas/licensing-faq.html)。

明确位置后的两项DRC Critical已在新构建消除，没有降级DRC。两构建内部no_clock/未约束端点均为0；补充`reports/physical_checks_impl_1.tsv`记录实际黑盒/硬核数量、引脚功能及全部时钟，`cdc_internal_reset_cones.tsv`逐项列出两条IP内部reset-status路径源和三级同步链。补充审计源码冻结在各自`supplemental_audit/source_snapshot.json`。原始CDC unsafe=2/unknown=0仍保留，没有waiver。

当前M3尚未验收：等待12bin接收链新鲜网表比对，保留/进一步审查IP内部CDC告警；完整CMAC仿真需适用授权。SDF、板级链路、科学核仍为NOT RUN，M4未开始。

12bin网表验证补充：`pipeline-08/netlist_verification`生成脚本仍忽略备用simset的verilog_define，使绝对include位于未启用分支；新目录`netlist_verification_02`将AF_PIPE_NETLIST直接定义在冻结验证TB开头，变换前后hash均保留，已编译/elaborate并进入后台simulate。两次截至02:30均未有终态，不提前写PASS，不终止进程。原RTL结果已在第一次网表结束前单独保存`vectors/pipeline_behavioral_pass.txt`，避免后续marker写入混淆RTL/网表来源。

## 128块连续输入与重复停顿：补足持续负荷证据

此前16块测试只放置一次20µs消费者停顿，未覆盖长期每8块停一次。本次扩为128块、按固定无线电谱周期连续到包、消费者每8块停20µs。**只改测试台/向量生成器，未修改接收RTL。** 已逐项核对7份接收RTL hash，在`pipeline-08`实际ROUTED、`shell-04`真实CMAC组合与本次`pipeline-13`之间完全相同，且均为12bin/T8、5槽、24字/包、4096数据项、256描述符、125MHz。

初次长测`cx-p2_06-pipeline-20261104-10`（12bin）和`...-11`（11bin）在序号21附近出现入口空间拒收，**不作为硬件容量失败**。诊断`...-12`增加发包时间单调检查，在packet5376/块21精确复现：下一发包时间从2185069.280ns倒退到−2041484.416ns。原表达式先用32位整数计算`21 × 102400000ps`，溢出后才转实数，剩余帧因错误时间被连续注入。原失败日志保留，不能用它把12bin结论降为硬件失败，也不能把失败测试改成PASS。

修复在乘法前转换实数并先将ps换ns，保留时间单调检查。新鲜`cx-p2_06-pipeline-20261104-13`（snapshot SHA-256 `15bea56244fba6893e292fc527a7f4f998ad2ef00d1ddf89f32601bf6896b079`；结果`vectors/pipeline_pass.txt`、原始`project/af_pipeline.sim/sim_1/behav/xsim/simulate.log`）**SIM PASS**：

- 128块、32768包、786432个512bit字逐字比对，全部提交/消费，状态及事务计数守恒，零坏包/空间拒收/超时/写拒绝。
- 16个完整20µs停顿窗，共40000个125MHz周期（320µs）；消费者25/32的数据ready占空比仍保留。
- 入口峰值3833字、ring峰值385源贡献，与16块测试相同；没有观察到峰值随128块增长。
- 从运行起点到排空1656274周期；源0..127块的发包计划逐块相隔102400ns。机器收集器检查128条源节奏日志、保存向量/golden SHA-256。名义30.72Gb/s和2.5Mpps仍是输入合同，有限端到端周期折算不等于板级持续速率。

本次不重复综合未改变的RTL，也不把RTL长测当网表或CMAC串行SIM。13bin短测在第一组即空间拒收的历史边界仍有效（发生在上述溢出之前）。12bin post-route网表两轮仍需检查终态，完整CMAC模拟器授权和IP内部CDC审查仍是M3未完成项。

## 功能网表生成模式的补充审计

继续检查12bin两轮长仿真发现：网表文件注明write_verilog funcsim，但其elaborate.bat意外链接simprims_ver、带--maxdelay/transport选项。备用simset虽为NL.MODE=funcsim，主sim_1仍是timesim；Vivado导出脚本读取了主sim_1的部分设置。**这两轮不作为所需功能库流程的验收证据**，没有SDF通过结论；进程仍保留，不因运行长而终止。

新补充目录`netlist_verification_03`增加功能库脚本检查后，准确拒绝了该不一致，未启动worker。`netlist_verification_04`对主/备用simset都显式设置SIM_MODE/NL.MODE功能模式、关闭SDF，生成脚本已确认使用unisims_ver且没有--maxdelay；采用debug off和自写quiet run-all Tcl，完整数据scoreboard不变，已启动新的后台compile/elaborate。所有源及原始脚本分别冻结，未修改前两轮日志或RTL/DCP；机器摘要对各轮记录实际库选择，仅正确功能库且完整fresh PASS才可成为功能网表通过证据。

## M2/M3逐项验收核对

机器摘要新增`milestone_audit`，每次收集都从当前原始marker、报告、硬核数量和源hash重新计算，不把文字计划当证据。下表将不同证据范围分开；完成M3须补齐剩余项。

| 要求 | 当前证据 | 状态/限制 |
|---|---|---|
| 分支、旧源保护、串行交接 | `codex/m2-m3-receiver`，基线ae69ad0；逐轮cx目录/snapshot；AGENTS当前状态 | 已落实；本轮不commit/push/PR，不操作opencode会话 |
| 准入/预览及异常语义 | 15条专门预览命令；parser 32/64/512共166结果；core异常9结果/40字 | 对所列测试通过；保留修复前失败及冻结源，不称任意输入均已穷尽 |
| 包级过载、坏包/丢弃及计数 | 新入口默认容量独立SIM：141 started，104 delivered，5 bad，32 no_space；坏包回收、完整帧字/keep/last核对，数据/描述符压力排空守恒及复位测试 | 已验证入口合同；不把丢弃描述符回收当科学ring容量 |
| 不可停顿入口＋CDC＋真实ring持续输入 | `pipeline-13`：128块32768包/786432字，16次20µs停顿，零异常/计数守恒；七份接收RTL hash与实际实现相同 | RTL SIM通过，非板级/真实CMAC串行SIM |
| 中途配置切换与代次隔离 | `config-02`：旧半包/队列/反压结果清理，旧epoch拒收，新20字读回，stale done不释放 | SIM通过；该测试不用于速率结论 |
| 接收组合实际实现 | `pipeline-08`125MHz ROUTED，WNS +0.059ns/WHS +0.038ns，CDC unsafe/unknown 0；clock/DRC/route/bus-skew报告 | 已收集；逻辑外部接口仍是OOC边界 |
| 同源组合post-route功能网表 | `pipeline-08/netlist_verification_04`实际unisims功能库，完整4096包/98304字scoreboard | 已完成fresh PASS，222674周期、入口峰值3833字/ring峰值385贡献，与RTL相同；不使用前两轮库模式不符结果 |
| 250MHz/10Mpps原目标与负荷边界 | core02 routed250MHz失败；新架构125MHz、NF12输入合同通过；NF13当前同缓存首burst拒收3包 | 原目标NOT MET；局部架构边界，不是KU5P通用极限 |
| 真实单CMAC硬核、资源、物理时钟 | shell04：1 CMAC/4 GT/1 common、0黑盒、125MHz ROUTED、0 route error/DRC Error/Critical；明确器件参考引脚、实际GT派生时钟 | 实现证据通过，板卡映射和板级链路NOT VERIFIED |
| 真实CMAC组合功能 | shell04串行peer226930实例，compile/elaborate完成，XSim BASIC 50000限制拒绝启动 | NOT RUN_SIMULATOR_TIER_LIMIT；需要适用仿真授权/环境 |
| CMAC内部CDC闭环 | 两条reset-status OR→init_clk三级同步链，原始CDC-10 2 unsafe/0 unknown；已定位watchdog用途 | 尚未关闭；没有开启注释waiver或添加笼统false_path |
| M4前停止 | 新增RTL均为接收/入口/CMAC；无科学核、无上板/RFSoC开发 | 持续遵守；M3尚未完成，不能提前进入M4 |

03:06已收集`pipeline-08/netlist_verification_04`终态COMPLETE及新鲜独立marker，全部4096包提交/消费、98304字正确，所有原终态/计数守恒断言通过。真实primitive功能库为unisims_ver、无SDF、无timing库maxdelay选项；运行约16分27秒。原URAM未用级联B输入模型告警保留，未当成板级或SDF通过。机器摘要核对了实际编译TB hash、功能库脚本及marker与worker acceptance一致，未人工复制PASS。

随后新建`shell-04/serial_peer_verification_02`，保留第一轮实例许可失败记录；第二轮使用当前自写测试台和真实生成CMAC/GT模型，debug off/quiet Tcl并完整scoreboard，compile/elaborate中。准备脚本支持新编号补充目录，每次仍冻结源码，不覆盖旧证据。此复核用于确认当前授权状态，未改IP或缩小真实CMAC功能范围。

03:11终态：`serial_peer_verification_02` compile/elaborate完成，再次被XSim BASIC 50000实例限制拒绝（设计226930实例），worker明确记录`FAILED/failure_kind=SIMULATOR_TIER_LIMIT`；引擎未启动、无PASS文件。此为本轮新鲜授权证据，不只沿用早期失败日志。原CMAC IP综合授权可用；当前缺的是能够运行该规模设计的模拟器授权/已授权替代环境。

连续三轮目标推进都存在同一授权条件；前两轮继续完成了独立接收RTL、真实实现、配置切换、持续负荷及网表工作。本轮这些可独立完成的验收证据已收齐，当前无法继续证明完整真实CMAC功能，故目标应标**blocked，不能标complete**。两项IP内部CDC原始告警保持未关闭。M4科学核、SDF、板级验证均未开始。

旧的`pipeline-08/netlist_verification`与`_02`仍为Codex自己的后台XSim，库设置不符，不用于验收；已询问用户是否允许终止这两轮，未收到确认，未擅自停止。有效`_04`已自然结束并通过。下一步是用户提供适用模拟器授权/环境后，在新的serial_peer补充目录重跑真实CMAC，继续复位/链路/数据及CDC审查；不覆盖本轮失败或进入M4。

2026-11-04用户批准终止后已清理：第一轮已于04:45自然结束，第二轮仅在核对实际xsimk路径、创建时间及Codex worker祖先链后终止；后续确认两轮XSim与worker均退出，自己的Vivado MCP仍运行。原始日志/FAILED状态保留，新增清理审计JSON的hash纳入机器摘要。有效`_04`已通过的结果不变，M3授权阻塞也未因此解除。
