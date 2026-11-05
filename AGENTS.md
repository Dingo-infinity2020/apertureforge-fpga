# AGENTS.md

**最新交接优先（2026-11-04，M2/M3最终验收）：本轮目标已完成，M4前停止。** 2025.1真实CMAC/GT完整串行4096包/98304字SIM PASS；标准硬件125MHz ROUTED WNS +0.030ns、CDC unsafe/unknown0、严重DRC0、0黑盒。最终证据见`reports/phase2-m2-m3-acceptance.zh-CN.md`及`reports/phase2-cx-m3.json`。下文运行/授权阻塞条目均保留历史；不得据其重启已完成实验。2026.1安装保留，Codex当前自己的MCP为2025.1，标准02实现已终态，无有效SIM进行中。用户已于2026-11-04授权M4；opencode已在`opencode/m4-science`分支完成M4-00环境/IP/契约首轮，M4未验收。2025.1为M4主版本。

本文件同时供 Codex 和 opencode 读取。目标是两个代理可以在不同阶段接手，但工具、构建目录、证据和 Git 状态互不污染。

## 0. 硬约束

- `D:/work/KU5P_FX_Accelerator` 只读参考。不得修改、覆盖、删除其中文件，不得启动其工程、硬件脚本或旧 Vivado 会话。
- 不得停止、重启、复用另一个代理的 Vivado、MCP server 或 build session。两个代理各自启动自己的 MCP 和 Vivado。
- 不得覆盖、删除或复用已有外部构建目录。每次新实验必须新建目录。
- 不得把 DCP、bit、ltx、jou、log、rpt、IP 生成物、许可证或厂商资料提交进 Git。
- 不得把 `NOT RUN`、`NOT VERIFIED`、分析估算或周期折算写成 `PASS` 或实测硬件结果。
- 未得到用户明确要求，不 commit、不 push、不建 PR，不上板，不操作 JTAG、光纤、DDR、PCIe 或驱动。
- 本项目不开发 RFSoC。RFSoC 只作为输入格式、速率和到包节奏的测试条件。

## 1. 当前基线

- 日期：2026-11-04。
- 接手基线：本地 `main` 与远端均为 `ae69ad0`；Codex 当前工作分支 `codex/m2-m3-receiver`，未提交修改不能当成该基线的已提交内容。
- 第一阶段验收完成；第二阶段恢复执行，尚未验收。
- 最新证据：[reports/phase2-cx-m3.zh-CN.md](reports/phase2-cx-m3.zh-CN.md)、`reports/phase2-cx-m3.json`；opencode历史见[reports/phase2-oc-20261103.zh-CN.md](reports/phase2-oc-20261103.zh-CN.md)。当前较高负荷候选为`cx-p2_06-pipeline-20261104-08`及真实CMAC `cx-p2_11-shell-20261104-04`，历史数字不可混作当前结果。
- 已测：opencode 实验三组合核功能通过；routed 19972 LUT、14350 FF、8 DSP、56 URAM，250MHz WNS −3.406ns；106498接收周期/4096包，按250MHz条件折算约9.615Mpps，仍不达标。旧18415 LUT与125MHz重查结果只属于早期构建，不是当前源码的时序证据。
- 已补：12bin/T8/125MHz接收RTL长测128块/32768包/786432字、16次20µs停顿通过；pipeline-08/netlist_verification_04实际unisims功能库4096包/98304字网表fresh PASS，222674周期与RTL相同；配置中途切换通过。12bin真实CMAC ROUTED 15092 LUT/15701 FF/10 DSP/64 URAM/64.5 BRAM36，WNS +0.105ns/WHS +0.014ns，零黑盒/route errors/DRC Error或Critical；13bin同缓存首burst空间拒收3包。M2证据限所测配置，原250MHz/10Mpps仍未通过，SDF未做。
- 阻塞/未知：真实CMAC完整SIM未启动、IP内部2项CDC-10保留，M3不能称整体验收；KU11P/KU15P器件库仍缺；器件级GT/参考引脚已实现，但板级映射/时钟/DDR未验证；M4科学核和上板不在本轮范围。
- 新仿真依赖：真实CMAC官方串行回环113437实例、真实shell串行peer 226930实例；当前XSim BASIC上限50000，elaborate完成但仿真引擎未启动。已向用户询问适用仿真授权；其余工作继续，不能把替代/force模型写成完整CMAC仿真PASS。
- 旧工程只读基线：`956f84cea5569ef2c2d1910ce82e468f8bc4b6da`。
- 当前写者为Codex，接续M2至M3；opencode下次接手前先读最新交接。按计划顶部恢复编号：M1环境、M2接收、M3真实CMAC组合、M4科学核、M5决策。用户要求M3完成后停止，不进入M4。

## 2. 环境与常用命令

- 平台：Windows PowerShell 5.1；Node.js `v24.19.0`；无 `package.json`、无 npm 依赖。
- 单元测试：

```powershell
node --test "tests/*.test.mjs"
```

当前应为 28 项全部通过（含 M4 参考测试）。测试只读，不写报告。

- 第一阶段重算：`node scripts/run-phase1.mjs`；决策证据：`node scripts/finalize-phase1.mjs`。
- Vivado 主版本：`D:/AMDDesignTools/2025.1/Vivado/bin/vivado.bat`（M4 起固定使用；2026.1 安装保留但不混用 IP/DCP/仿真库），器件 `xcku5p-ffvb676-1-i`。
- MCP venv：`D:/work/tools/vivado-mcp-native/.venv`。
- 第二阶段复现入口见 `docs/phase2-receive-core.md`、`docs/phase2-parser.md`、`docs/phase2-ring-control.md`。
- 冻结源 hash：`node scripts/phase2-snapshot.mjs <existing-external-build> <repo-relative-source> ...`。
- 生成紧凑证据：`node scripts/phase2-evidence.mjs`，不启动 Vivado。
- Codex本轮紧凑证据：`node scripts/phase2-cx-evidence.mjs`，仅收集冻结cx构建；CMAC及后台网表复现见`docs/phase2-cmac-shell.md`。长仿真必须先生成scripts，再运行冻结`run-vivado-sim-job.mjs`并轮询；同步MCP run_tcl硬超时会自动结束它的Vivado进程，不要用同步调用承载长仿真。

## 3. Vivado MCP 隔离

| 代理 | MCP 名称 | 注册位置 | 会话工作目录 | 新 run 前缀 |
|---|---|---|---|---|
| Codex | `vivado` | `~/.codex/config.toml` | `D:/work/build/KU5P_FX_Accelerator/vivado_mcp_session` | `cx-` |
| opencode | `vivado_apertureforge` | 本项目 `opencode.json` | `D:/work/build/apertureforge-fpga/_agent_sessions/opencode` | `oc-` |

规则：

- opencode 使用 `tools/vivado_mcp_server.py`，复用外部 venv 中的 `vivado-mcp-native 0.2.1`，只做本地 stdio，不联网。
- Codex 继续使用自己的 `vivado` MCP；opencode 不调用、不接管、不终止它。
- 每个 MCP server 在 `start_session` 时启动自己的 Vivado。不要试图连接另一个代理已经运行的 Vivado。
- 使用前先查自己的 `session_status`。只允许停止自己的 session；另一个代理的 session 即使空闲也保留。
- MCP 返回成功只表示 Tcl 命令执行完成。必须继续核对 run 的 `STATUS`/`PROGRESS`、新鲜 PASS 标记、报告内容、DRC、route status、黑盒和时钟/未约束端点。
- 综合和布局布线可能持续很久。启动后轮询，不要因为工具调用超时或等待时间长就重启；确需终止时先问用户。
- 如果自己的 MCP 启动失败，先做只读分析和 Node 测试，并明确报告工具不可用；不要临时借用 Codex 的 MCP。
- 修改 `opencode.json` 后必须重启 opencode；运行中的会话不会热加载配置。

## 4. 构建目录与证据

- 新实验目录：`D:/work/build/apertureforge-fpga/<agent>-<work-package>-<yyyymmdd>-<seq>`。
  - 示例：`oc-p2_07-20261104-01`、`cx-p2_11-20261104-01`。
- 现有 `D:/work/build/apertureforge-fpga/p2_*` 是 Codex 历史证据，只读；不要删除、覆盖或在其内部继续写入新结果。
- MCP 会话目录与实验构建目录是两件事。会话目录只承载 Vivado 进程；具体项目仍由 Tcl 参数指向新的实验目录。
- 每个实验必须用 `scripts/phase2-snapshot.mjs` 冻结 RTL、testbench、XDC、生成器、模型和 Tcl 的 hash。
- 仓库只保留自写源、脚本、文档和紧凑摘要；原始报告、DCP、日志留在外部构建目录。
- 报告必须分开写 `SIM`、`SYNTH`、`ROUTED`、`NOT RUN`。仿真通过不能代替综合或时序通过。
- 引用历史数字时同时给出源 hash、构建目录和报告文件，避免用当前 HEAD 代替历史构建源。

## 5. 协作与交接

- 开始工作前依次检查：`git status --short`、`git branch -vv`、`git log -1`，再读本文件、`README.md` 和最新一期 `reports/phase2-*.zh-CN.md`。
- 同一工作包同一时间只保留一个写者。两个代理需要改同一批文件时，由用户决定顺序，或按文件/分支拆分，不得静默覆盖对方未提交修改。
- 分支建议：opencode 用 `opencode/<topic>`，Codex 用 `codex/<topic>`；除非用户要求，不直接在 `main` 上积累未审查改动。
- commit 只在用户明确要求时执行；提交信息沿用现有 `feat:`、`docs:`、`fix:` 风格，并在提交前检查 `git diff` 和生成物。
- 结束一轮工作前，更新本文件末尾的“当前交接状态”：日期、代理、分支/提交、完成的实验目录、未完成项、阻塞项、下一步。仓库应保持干净；若有未提交文件，必须逐项列出。
- 接手代理先验证上一轮留下的状态，不要仅凭聊天记录继续。

## 6. 接手检查清单

1. `git status --short` 干净；本地 `main` 与远端一致，或明确知道当前分支/未推送提交。
2. 已读 `README.md`、最新 `reports/phase2-*.zh-CN.md` 和相关 `docs/phase2-*.md`。
3. `node --test "tests/*.test.mjs"` 通过。
4. 自己的 Vivado MCP 可用；没有碰另一个代理的进程。
5. 新实验目录位于仓库外，且没有被历史构建占用。
6. 需要 CMAC 时，先实际验证授权 checkout；未验证就继续标注 `NOT VERIFIED`。
7. 任何资源/时序结论都能指向新生成或已冻结的外部报告；没有新鲜证据就不写 `PASS`。
8. 没有上板、没有改旧工程、没有把生成物加入 Git。

## 7. 当前交接状态

| 日期 | 代理 | 分支/提交 | 已完成 | 进行中 | 下一步 | 风险/未提交 |
|---|---|---|---|---|---|---|
| 2026-11-03 | Codex | `main` / `1cfad68` | 第一阶段验收；第二阶段接收核、parser、ring、store、组合核及外部证据 | 无（第二阶段暂停） | 验证 CMAC 授权；补不可停顿入口/CDC；改善 250MHz 时序与周期吞吐；补组合网表仿真 | 250MHz 失败；9.615Mpps 未达标；CMAC 未重新验证；科学核未完成；无上板 |
| 2026-11-03 | opencode | `main` / `1cfad68`（配置未提交） | 新增 `opencode.json`、`tools/vivado_mcp_server.py`、`AGENTS.md`；验证专用 MCP 可启动/停止且未打开项目 | 无 | 重启 opencode 使配置生效；由用户决定下一阶段 | `AGENTS.md`、`opencode.json`、`tools/` 尚未提交；未开始新 Vivado 实验 |
| 2026-11-03 | opencode | `main` / `1cfad68`（未提交） | M1：`oc-p2_00-20261103-01` 验证 CMAC IP 综合/授权；M2：`oc-p2_06-20261103-01`、`...-02` 完成 SIM/SYNTH/ROUTED 时序实验 | 命令预览/流水设计 | 实现 `cmd_pre_valid` 预览，争取不增加每包周期地切断 parser→ring control 原因链；随后补非停顿入口/CDC 和组合网表仿真 | 250MHz 仍失败（最好 −3.706ns）；10Mpps 未达标；RTL/报告/计划未提交；未做非停顿入口/CDC、未上板 |
| 2026-11-03 | opencode | `main` / `68daeda` | `cmd_pre_valid` 两级预览实现并验证：`oc-p2_06-20261103-04` SIM/SYNTH/ROUTED 通过功能；routed WNS −3.406ns、TNS −31466.639ns、19972 LUT/14350 FF/56 URAM；独立 ring 和 time 测试通过 | 剩余 command valid/source 高 fanout 路径 | 降低 `tx_source`/`present_count` fanout 与 route；补 post-route 网表仿真；然后非停顿入口/CDC | 250MHz 仍失败；10Mpps 未达标（106498 周期）；实验四 `-05` 已回退；本轮改动已提交；未上板 |

| 2026-11-03 | Codex | `codex/m2-m3-receiver` / 基线 `ae69ad0` | 接手：22项Node测试通过，opencode实验三14项源hash与工作树一致；`cx-p2_06-20261103-01` 完成组合异常SIM及4096包SIM | `cx-p2_06-20261103-01` 综合中；去除冗余预览地址mux及收窄受检索引，不改事务周期 | 收集SYNTH/ROUTED；补组合网表、非停顿入口/CDC，继续M3；M4前停止 | 未提交：`rtl/af_ring_control.sv`、`scripts/prepare-phase2-core-run.mjs`、`AGENTS.md`、`docs/phase-2-plan.zh-CN.md`、`reports/phase2-cx-m3.zh-CN.md`；原始构建在仓库外；不提交/推送、不上板 |

更新规则：结束工作的代理替换或追加本表最后一行，不要删除历史行；新行写清实验目录和下一步，方便另一个代理直接接手。

2026-11-04 Codex继续交接（目标仍active，未转交写权）：`codex/m2-m3-receiver` / 基线`ae69ad0`。

- 完成：`cx-p2_06-20261103-01` SIM/SYNTH/ROUTED，最终WNS −2.748ns；提前报头检查32/64/512回归166结果PASS；连续命令测试复现预览旧状态误准入，双级失效修复后15命令PASS；当前候选`cx-p2_06-20261104-02`组合异常和4096包SIM PASS，102401接收周期，SYNTH 20427 LUT/14352 FF/8 DSP/56 URAM，WNS −1.652ns。
- 进行中：自己的Vivado MCP当前打开`cx-p2_06-20261104-02/project/af_core.xpr`；impl_1已经启动，最近观察phys_opt_design 60%（2026-11-04 00:12:34 CST），不得因为观察陈旧重启。`cx-p2_06-20261104-01`中间综合已启动但没有收集摘要，源码含已确认的旧预览缺陷，不作为保留版本。
- 下一步：先查自己session_status和当前impl_1 STATUS/PROGRESS，收集最终ROUTED/DRC/CDC/时钟/路径；补同源组合网表仿真，然后非停顿入口/CDC及真实CMAC shell。M3完成前不进入M4。
- 风险：250MHz仍未证明通过；有限周期折算9.999902Mpps仍略低于10Mpps，不可当硬件速率；入口/CDC/CMAC组合、SDF和上板未做。
- 未提交完整清单：`AGENTS.md`、`docs/phase-2-plan.zh-CN.md`、`docs/phase2-ingress-design.md`、`rtl/af_ring_control.sv`、`rtl/af_packet_parser.sv`、`scripts/generate-phase2-core-vectors.mjs`、`scripts/prepare-phase2-core-run.mjs`、`scripts/prepare-phase2-parser-matrix.mjs`、`scripts/phase2-cx-evidence.mjs`、`sim/tb_af_ring_preview.sv`、`tcl/phase2_preview.tcl`、`reports/phase2-cx-m3.zh-CN.md`、`reports/phase2-cx-m3.json`。用户未要求提交/推送，全部保留本地。

2026-11-04 01:06后续交接，Codex仍为写者，目标active；分支`codex/m2-m3-receiver` / 基线`ae69ad0`。

- 已完成：默认core `cx-p2_06-20261104-02` ROUTED收集（20683 LUT/14366 FF/8 DSP/56 URAM，250MHz WNS −3.227ns；同一布线125MHz +0.773ns），组合异常post-route功能网表PASS；有URAM未用级联B输入模型告警，未做SDF。
- 入口：`cx-p2_02-20261104-01..05`。`-04`独立ROUTED WNS +0.059ns/WHS +0.046ns，RX322.265625MHz、处理250MHz，604 LUT/1194 FF/64.5 BRAM36、0 DSP/URAM；`-05`含后续本地复位门控修正并完成默认4096字/9014B最大帧SIM，104有效包、5坏包、32空间拒收、峰值4089字，reset后只有新包。`-04`数字不能直接代替`-05`实现结果。
- 组合：`cx-p2_06-pipeline-20261104-01..06`。`-01`发现139 unsafe/2191 unknown CDC；`-02`还剩1个计数器译码复位CDC-10；`-03`改注册复位后SIM/SYNTH通过，CDC unsafe/unknown=0。`-04/05`的64描述符在100Gbps集中到包测试失败，`-05`明确no_space=92、queued=164、started=256。当前`-06`用256描述符，10bin/T8、5槽、125MHz：4096包/81920字SIM PASS，20us停顿，入口峰值3384字，SYNTH 13994 LUT/13007 FF/10 DSP/56 URAM/64.5 BRAM36，WNS +0.479ns/WHS +0.031ns、CDC unsafe/unknown=0、内部未约束/无时钟=0。
- 当前运行：自己的MCP打开`D:/work/build/apertureforge-fpga/cx-p2_06-pipeline-20261104-06/project/af_pipeline.xpr`；该项目impl_1在2026-11-04 01:06:30 CST启动。下轮先session_status及STATUS/PROGRESS，不重启。`-01/-02`旧组合impl也曾启动，均为自己的后台子进程；需观察其终态，不能终止或将其CDC失败版本当保留版本。
- M3依赖：`cx-p2_11-example-20261104-02`已生成真实CMAC/GT官方串行回环示例并elaborate；XSim BASIC限50000实例、示例113437，仿真引擎未启动，**NOT RUN_SIMULATOR_TIER_LIMIT**。已询问用户是否有适用仿真授权，尚待回复。不要force CMAC输出、伪造PASS或接管opencode工具。`-01`示例构建Tcl命令错误已由新目录`-02`修正。
- 下一步：收集`pipeline-06`的ROUTED/CDC/DRC/时钟/route/bus-skew；补配置中途切换的跨域联测及完整流水线post-route网表。随后建立真实CMAC shell实际SYNTH/ROUTED（当前尚未编写完整shell），验证GT/时钟位置，继续寻求合法可用的完整CMAC仿真；M3全部必要证据未完成前不得标完成，M4前停。
- 复现/证据：`scripts/phase2-cx-evidence.mjs`只读已有构建并写当前机器摘要；新准备入口分别为`prepare-phase2-ingress-run.mjs`、`prepare-phase2-pipeline-run.mjs`、`prepare-phase2-cmac-example-run.mjs`。流水线125MHz XDC只支持125MHz实现，其他配置只做SIM；新实验一律新鲜cx目录和冻结source树。
- 本轮未提交27项完整清单：`AGENTS.md`、`README.md`、`docs/phase-2-plan.zh-CN.md`、`rtl/af_packet_parser.sv`、`rtl/af_ring_control.sv`、`scripts/generate-phase2-core-vectors.mjs`、`constraints/af_ingress_ooc.xdc`、`constraints/af_pipeline_ooc.xdc`、`docs/phase2-ingress-design.md`、`reports/phase2-cx-m3.json`、`reports/phase2-cx-m3.zh-CN.md`、`rtl/af_receive_pipeline.sv`、`rtl/af_rx_ingress.sv`、`scripts/generate-phase2-pipeline-vectors.mjs`、`scripts/phase2-cx-evidence.mjs`、`scripts/prepare-phase2-cmac-example-run.mjs`、`scripts/prepare-phase2-core-run.mjs`、`scripts/prepare-phase2-ingress-run.mjs`、`scripts/prepare-phase2-parser-matrix.mjs`、`scripts/prepare-phase2-pipeline-run.mjs`、`sim/tb_af_receive_pipeline.sv`、`sim/tb_af_ring_preview.sv`、`sim/tb_af_rx_ingress.sv`、`tcl/phase2_cmac_example.tcl`、`tcl/phase2_ingress.tcl`、`tcl/phase2_pipeline.tcl`、`tcl/phase2_preview.tcl`。全部留本地，不commit/push/PR、不上板。

### 2026-11-04 02:24 Codex后续状态（写者仍为Codex，目标active）

02:43增补：本目标上一轮有实际实现/报告进展，本轮有持续负荷新证据，不是仅重复状态。新增`cx-p2_06-pipeline-20261104-10/11`长测揭示测试台32位ps乘法溢出，`-12`在packet5376/块21精确复现时间倒退；修复乘法前实数转换后`-13` 128块/32768包/786432字PASS，16个完整20µs停顿窗、入口峰值3833字，零异常且计数守恒。7个接收RTL hash与ROUTED pipeline-08/shell-04完全相同，未重新综合；原错误激励不用于容量结论。snapshot `15bea56244fba6893e292fc527a7f4f998ad2ef00d1ddf89f32601bf6896b079`，原日志/marker在该外部构建。修改仅测试台/生成器/报告，未提交文件清单仍为下列47项。两个既有网表XSim进程本轮确认仍live，未终止/重启；先轮询其终态再采取动作。

02:50增补：在pipeline-08 netlist_verification/_02原始elaborate.bat发现simprims_ver/--maxdelay，主sim_1的隐藏NL.MODE仍timesim，备用simset虽funcsim，导出脚本部分读取主属性；不把两轮当预期功能库验收，未终止进程。_03新鲜脚本守卫准确拒绝该模式，未启动worker。_04同时显式设置主/备用SIM_MODE/NL.MODE功能模式及SDF=false，实际生成unisims_ver、无maxdelay，采用debug off/quiet Tcl保留全scoreboard，worker29728已经compile/elaborate（实际进程下次重新确认）。MCP当前仍打开pipeline-08，功能流程源码与每轮源hash分开冻结。新增`tcl/phase2_pipeline_run_quiet.tcl`，**当前未提交48项**，是下列47项加此文件；全部未commit/push/PR，M4未开始。

| 日期 | 代理 | 分支/提交 | 已完成 | 进行中 | 下一步 | 风险/未提交 |
|---|---|---|---|---|---|---|
| 2026-11-04 | Codex | `codex/m2-m3-receiver` / 基线`ae69ad0`，未提交 | `pipeline-06` ROUTED及4096包网表审计；`config-02`配置切换SIM；`pipeline-07/08`新RX寄存器10/12bin SIM，`pipeline-08` ROUTED；`shell-03/04`真实单CMAC的10/12bin ROUTED与补充物理审计，均零黑盒/route errors/DRC Error或Critical | `pipeline-08/netlist_verification`及`netlist_verification_02`后台功能网表均运行；后者显式绑定宏/include，已compile/elaborate并进入simulate | 完成12bin同源逐字网表验证并更新报告；获得适用仿真授权后跑真实CMAC serial peer；保留/审查IP内部CDC；M4前停止 | 完整CMAC实例226930>BASIC 50000，仿真未启动；CMAC内部2 CDC-10；12bin用满64 URAM；未上板，未开发RFSoC，未提交/推送 |

- 最新物理数值：`cx-p2_11-shell-20261104-04` ROUTED 15092 LUT/15701 FF/10 DSP/64 URAM/64.5 BRAM36，125MHz WNS +0.105ns/WHS +0.014ns；内部no_clock/未约束0，bus-skew最小+2.547ns。对应snapshot hash `8ae23837bbe02a1169c04ac6974ce3eb9580026a2c30bc3f4806ba4d4f855f37`，原始报告在该目录`reports/`。10bin `shell-03` WNS +0.048ns、56 URAM；只代表器件级OOC，K7/K6参考引脚与GT位置不是板卡映射证据。
- `cx-p2_06-pipeline-20261104-08`（snapshot `773a04908120794066b272205a08237826fcf56d987ca230e75f4af15ded4d19`）ROUTED 13566 LUT/13464 FF/10 DSP/64 URAM/64.5 BRAM36，WNS +0.059ns/WHS +0.038ns；CDC unsafe/unknown 0。4096包/98304字RTL通过；`pipeline-09`同缓存13bin发生3包空间拒收，未通过无损测试，没有SYNTH。
- 自己MCP当前打开`cx-p2_06-pipeline-20261104-08/project/af_pipeline.xpr`，所有已启动SYNTH/ROUTED为终态；第一次后台worker PID18448/XSim PID4816，第二次worker PID5292/XSim PID6760（02:30左右观察，仅为定位，不得以旧PID直接操作进程）。两次均未见终态，不能提前判PASS或因等待长而终止。先检查job_status与实际进程。此前MCP长仿真300秒自动终止事故及网表marker路径审计详见报告，原始失败状态保留。
- `pipeline-08`第一轮生成compile脚本忽略备用simset的verilog_define，导致验证配置include位于未选中的宏分支；虽然刺激/golden参数仍与该实现一致，独立PASS目标路径未正确绑定，不作为新流程验收。第二轮在冻结测试台开头显式定义AF_PIPE_NETLIST，绑定验证config绝对路径，变换前/后hash另记generated_config，原实现RTL/XDC不变。原RTL marker已在第一轮仿真结束前另存`vectors/pipeline_behavioral_pass.txt`。不要改写任何旧job_status或伪造marker。
- 02:30再次只读查询GitHub `refs/heads/main`仍为`ae69ad00cfe553b58391b4778283c4ba6776fc0f`，没有新的远端提交需要合入。
- 完整CMAC serial peer：`cx-p2_11-shell-20261104-04/serial_peer_verification`编译/elaborate完成，日志明确许可拒绝；原worker显示FAILED/ENOENT是XSim返回0后缺marker，机器摘要另标NOT RUN_SIMULATOR_TIER_LIMIT。下一次必须新补充目录和源hash，不能覆盖该状态。用户授权问题已提出，未收到回复。
- 复现新增`docs/phase2-cmac-shell.md`，读证据用`scripts/phase2-cx-evidence.mjs`；22项Node测试通过、16个新JS脚本语法检查通过、git diff --check无空白错误。后续改动后才按需重测。

当前未提交47个文件（逐项；全部保留本地，未获本轮提交/推送授权）：

- `AGENTS.md`
- `README.md`
- `docs/phase-2-plan.zh-CN.md`
- `rtl/af_packet_parser.sv`
- `rtl/af_ring_control.sv`
- `scripts/generate-phase2-core-vectors.mjs`
- `constraints/af_cmac_shell_ooc.xdc`
- `constraints/af_ingress_ooc.xdc`
- `constraints/af_pipeline_ooc.xdc`
- `docs/phase2-cmac-shell.md`
- `docs/phase2-ingress-design.md`
- `reports/phase2-cx-m3.json`
- `reports/phase2-cx-m3.zh-CN.md`
- `rtl/af_cmac_receive_shell.sv`
- `rtl/af_cmac_rx.sv`
- `rtl/af_receive_pipeline.sv`
- `rtl/af_rx_ingress.sv`
- `scripts/audit-phase2-netlist-result.mjs`
- `scripts/generate-cmac-shell.mjs`
- `scripts/generate-phase2-cmac-testbench.mjs`
- `scripts/generate-phase2-config-vectors.mjs`
- `scripts/generate-phase2-pipeline-vectors.mjs`
- `scripts/phase2-cx-evidence.mjs`
- `scripts/prepare-phase2-cmac-example-run.mjs`
- `scripts/prepare-phase2-cmac-shell-run.mjs`
- `scripts/prepare-phase2-cmac-sim.mjs`
- `scripts/prepare-phase2-config-run.mjs`
- `scripts/prepare-phase2-core-run.mjs`
- `scripts/prepare-phase2-ingress-run.mjs`
- `scripts/prepare-phase2-parser-matrix.mjs`
- `scripts/prepare-phase2-pipeline-netlist.mjs`
- `scripts/prepare-phase2-pipeline-run.mjs`
- `scripts/run-vivado-sim-job.mjs`
- `sim/tb_af_cmac_receive_shell.sv`
- `sim/tb_af_pipeline_config.sv`
- `sim/tb_af_receive_pipeline.sv`
- `sim/tb_af_ring_preview.sv`
- `sim/tb_af_rx_ingress.sv`
- `tcl/phase2_cmac_audit.tcl`
- `tcl/phase2_cmac_example.tcl`
- `tcl/phase2_cmac_shell.tcl`
- `tcl/phase2_cmac_sim.tcl`
- `tcl/phase2_ingress.tcl`
- `tcl/phase2_pipeline.tcl`
- `tcl/phase2_pipeline_config.tcl`
- `tcl/phase2_pipeline_netlist.tcl`
- `tcl/phase2_preview.tcl`

### 2026-11-04 03:15最终交接状态

| 日期 | 代理 | 分支/提交 | 已完成 | 进行中/阻塞 | 下一步 | 风险/未提交 |
|---|---|---|---|---|---|---|
| 2026-11-04 | Codex | `codex/m2-m3-receiver` / `ae69ad0`基线，未提交 | M2所测NF12/T8/S5/125MHz的RTL持续负荷、配置切换、ROUTED及post-route功能网表证据；M3真实单CMAC/4GT的实际SYNTH/ROUTED和物理审计；完整缓存账本和逐项验收机器摘要 | 目标BLOCKED：全新shell-04/serial_peer_verification_02再次确认BASIC限50000、实际226930；无完整CMAC SIM PASS。IP内部2 CDC-10保留。有效netlist_04已自然结束；两轮旧XSim仍live、待用户终止确认 | 获得适用模拟器授权/环境后，在新补充目录验证真实CMAC全链及复位/CDC；M3完成后止步，不进入M4 | 未上板/DDR/JTAG/PCIe/驱动/RFSoC开发。48个未提交文件，完整清单为前述47项加`tcl/phase2_pipeline_run_quiet.tcl`；未commit/push/PR |

- 已完成的网表补充：`D:/work/build/apertureforge-fpga/cx-p2_06-pipeline-20261104-08/netlist_verification_04`，source_snapshot SHA-256 `91afed126246a2ffe4d33e4a4b717868dab786b2c604427f100b1ea876ba9164`。job_status COMPLETE；fresh marker4096包/98304字、222674周期、入口峰值3833、ring峰值385、2500停顿周期。实际DCP/netlist/编译TB/脚本/marker及collector自身hash均入机器证据；功能库unisims，非SDF。
- 新鲜授权复核：`D:/work/build/apertureforge-fpga/cx-p2_11-shell-20261104-04/serial_peer_verification_02`，snapshot SHA-256 `03c6dce68c86e3430040546bfd35ce5ccb384026c1529bdeaf6a2373db45b5ae`；03:11 worker自然结束FAILED/SIMULATOR_TIER_LIMIT，compile/elaborate完成，engine未启动。不能把CMAC综合授权当XSIM工具tier。
- 该授权条件已跨连续三轮目标推进保留，本轮完成最后可独立运行的接收网表，并再次实际复核许可拒绝；不能在没有完整CMAC功能证据时标目标complete。现转入外部条件阻塞，M4未开始。
- 当前自己的MCP打开`cx-p2_11-shell-20261104-04/project/af_cmac_shell.xpr`，SYNTH/ROUTED都终态，没有新的有效验证在运行；不要接管其他代理会话。旧pipeline-08 netlist_verification与_02的XSim仅用于保留原错误库流程，当前仍live（上次观测PID4816/6760，不得以旧PID直接终止）；已异步询问用户终止许可，未收到回复，不自行停止。
- 缓存：输入FIFO256KiB原始总线数据＋32.5KiB keep/last，实际64.5 BRAM36等效；科学ring1.875MiB payload占64 URAM＝2.25MiB物理位数，效率83.33%。端口宽×时钟64Gb/s只是理论每读/写端口上界，不是实测吞吐；当前科学输入合同30.72Gb/s、线占用33.32Gb/s。DDR未使用/未验证。
- 前述48项均为本轮代码/脚本/文档/紧凑证据，未引入新生成物。交接者先核实status、源hash和原始报告；下一写者按用户安排串行接手，不静默覆盖这些未提交文件。

### 2026-11-04 用户授权后的旧仿真清理

| 日期 | 代理 | 分支/提交 | 已完成 | 进行中/阻塞 | 下一步 | 风险/未提交 |
|---|---|---|---|---|---|---|
| 2026-11-04 | Codex | `codex/m2-m3-receiver` / `ae69ad0`基线，未提交 | 用户明确批准终止两轮旧XSim后重新核对：第一轮已于04:45自然结束；仅对第二轮尚存、路径及worker祖先链均匹配的xsimk执行终止，随后核实XSim及其worker/wrapper均退出；原日志/status保留 | M3仍因XSim BASIC规模限制BLOCKED；无旧XSim继续占用CPU；自己的Vivado MCP仍在运行，有效netlist_04已完成 | 适用模拟器授权/环境可用后恢复M3，不进入M4 | 未触及opencode会话、有效_04结果或RTL；48项未提交文件清单不变，未commit/push |

清理记录在`cx-p2_06-pipeline-20261104-08/netlist_verification_02/user_termination_request.json`及`user_termination_result.json`。第一轮原worker为FAILED/ENOENT（写入目标marker路径不符），第二轮终止后原worker同样记录FAILED/ENOENT；不改写原终态，也不把清理标成仿真PASS。当前两轮均无活动XSim进程，旧的“待确认/仍live”条目仅保留为历史观察。

### 2026-11-04 实例数量优化交接

| 日期 | 代理 | 分支/提交 | 已完成 | 进行中/未完成 | 下一步 | 风险/未提交 |
|---|---|---|---|---|---|---|
| 2026-11-04 | Codex | `codex/m2-m3-receiver` / `ae69ad0`基线，未提交 | 新shell-05实际FAST_SIM_MODE诊断；真实GT quad94889、common52779，完整串行仍226930；shell-06受支持GT_LOCATION=0数字端点18529、双真实CMAC加接收链37121，现有BASIC可启动引擎 | `shell-06/digital_peer_verification` 4096包/98304字数字功能检查RUNNING；无fresh PASS，不是完整GT串行M3通过 | 核对该job原始status、stdout、marker；完成数字检查及必要异常/复位用例；GT串行/PLL/物理复位继续单列未验证；M4前停 | 不要求升级授权作为默认路线；未上板；55项未提交，逐项见下；未commit/push/PR |

- 完整记录：`reports/phase2-cmac-instance-optimization.zh-CN.md`、独立JSON；收集器 `node scripts/phase2-cmac-instance-evidence.mjs` 只读已有实验。shell-05/06均没有新SYNTH/ROUTED，不能沿用shell-04物理数字作为这两个实验的新实测。
- 新实验父目录：`D:/work/build/apertureforge-fpga/cx-p2_11-shell-20261104-05`、`...-06`。全部历史失败及冻结源保留；GT `_02`模块查找失败后新建 `_03`，没有改写原结果。诊断PROFILE不是功能PASS，observed=x不能作为功能正确证据。
- shell-06父snapshot SHA-256 `aa313ca47006ad4b1b1f8e2a7293a75a9bcc3293f704cbfb29989e8f181dcf2a`；数字补充snapshot `282282673de4bf934e6c592b22f96ebad93f4ec157585c2c0f62c65ea2a5ce79`；实际编译TB hash `5056cd9a40c7b09735dc856a7e94b35d676fa4bf1b5b96f676d309b311bb62aa`。数字端点仍为真实cmac_usplus，两个并行编码lane相连，完整golden/计数守恒/20µs停顿保留；不含GT/QPLL/CDR/GT复位控制器，理想时钟/测试台复位不是GT启动验证。
- 当前自己的Vivado工程：`.../cx-p2_11-shell-20261104-06/project/af_cmac_shell.xpr`。数字worker最后观测PID24168、XSim kernel4544（08:40:27启动），状态RUNNING/simulate；PID仅供核对，不能凭旧PID终止。独立endpoint规模探针已自然COMPLETE。后台作业没有终止超时，不能因观察等待而重启/停止。当前无新SIM PASS；接手者先检查是否自然结束再更新报告，不重复启动同一job。

本轮结束前核对的55项未提交文件（含上一轮48项；同一写者，未覆盖opencode改动）：

- `AGENTS.md`
- `README.md`
- `docs/phase-2-plan.zh-CN.md`
- `rtl/af_packet_parser.sv`
- `rtl/af_ring_control.sv`
- `scripts/generate-phase2-core-vectors.mjs`
- `constraints/af_cmac_shell_ooc.xdc`
- `constraints/af_ingress_ooc.xdc`
- `constraints/af_pipeline_ooc.xdc`
- `docs/phase2-cmac-shell.md`
- `docs/phase2-ingress-design.md`
- `reports/phase2-cmac-instance-optimization.json`
- `reports/phase2-cmac-instance-optimization.zh-CN.md`
- `reports/phase2-cx-m3.json`
- `reports/phase2-cx-m3.zh-CN.md`
- `rtl/af_cmac_receive_shell.sv`
- `rtl/af_cmac_rx.sv`
- `rtl/af_receive_pipeline.sv`
- `rtl/af_rx_ingress.sv`
- `scripts/audit-phase2-netlist-result.mjs`
- `scripts/generate-cmac-shell.mjs`
- `scripts/generate-phase2-cmac-testbench.mjs`
- `scripts/generate-phase2-config-vectors.mjs`
- `scripts/generate-phase2-pipeline-vectors.mjs`
- `scripts/phase2-cmac-instance-evidence.mjs`
- `scripts/phase2-cx-evidence.mjs`
- `scripts/prepare-phase2-cmac-digital-sim.mjs`
- `scripts/prepare-phase2-cmac-example-run.mjs`
- `scripts/prepare-phase2-cmac-shell-run.mjs`
- `scripts/prepare-phase2-cmac-sim.mjs`
- `scripts/prepare-phase2-config-run.mjs`
- `scripts/prepare-phase2-core-run.mjs`
- `scripts/prepare-phase2-ingress-run.mjs`
- `scripts/prepare-phase2-instance-profile.mjs`
- `scripts/prepare-phase2-parser-matrix.mjs`
- `scripts/prepare-phase2-pipeline-netlist.mjs`
- `scripts/prepare-phase2-pipeline-run.mjs`
- `scripts/run-vivado-sim-job.mjs`
- `sim/tb_af_cmac_receive_shell.sv`
- `sim/tb_af_pipeline_config.sv`
- `sim/tb_af_receive_pipeline.sv`
- `sim/tb_af_ring_preview.sv`
- `sim/tb_af_rx_ingress.sv`
- `tcl/phase2_cmac_audit.tcl`
- `tcl/phase2_cmac_digital.tcl`
- `tcl/phase2_cmac_example.tcl`
- `tcl/phase2_cmac_shell.tcl`
- `tcl/phase2_cmac_sim.tcl`
- `tcl/phase2_ingress.tcl`
- `tcl/phase2_instance_profile.tcl`
- `tcl/phase2_pipeline.tcl`
- `tcl/phase2_pipeline_config.tcl`
- `tcl/phase2_pipeline_netlist.tcl`
- `tcl/phase2_pipeline_run_quiet.tcl`
- `tcl/phase2_preview.tcl`

### 2026-11-04 10:24 数字组合启动修复与验证推进

| 日期 | 代理 | 分支/提交 | 已完成 | 进行中/未完成 | 下一步 | 风险/未提交 |
|---|---|---|---|---|---|---|
| 2026-11-04 | Codex | `codex/m2-m3-receiver` / `ae69ad0`基线，未提交 | 定位并修复自写数字/串行TB的隐式rst_n：刺激reg移到实例前，default_nettype none；late-config独立4096包通过；真实shell同布线125/200/250MHz STA复查；10bin真实CMAC resident复位重建及错误帧整包丢弃前置断言通过 | 数字 `_04` 12bin完整4096包/98304字及 `_05` 10bin含控制探针的4096包/81920字仍RUNNING；前者提交已过半，尚无最终PASS。完整GT串行缺项仍保留，M3未完成 | 继续轮询这两个具体活进程和job，收齐新鲜marker/计数/逐字结果；保持目标active，M4不启动 | 旧 `_02` 经本轮用户明确授权只终止其kernel；原FAILED及审计保留。58项未提交：前述55项完整清单加下面3项；未commit/push/PR |

- 本轮是实质进展：旧数字首轮于09:52自然启动超时，不是规模限制或硬件容量失败；`_03`详细状态发现state/generation/core_ready持续X及VRFC隐式rst_n告警，最终在新 `_04`确认正常复位、req/ack、generation=1和数据处理。无7个接收RTL修改。`pipeline-15`延后112µs配置仍4096包/98304字PASS；`pipeline-14`Tcl参数错误保留，未运行SIM。
- 用户明确回复结束旧 `_02` 后，重新核对CIM worker命令行与唯一kernel祖先链，10:11仅终止kernel4768（worker33868），两者及wrapper随后退出。原stdout/status不改写；初次PowerShell审计哈希因共享打开文件失败，`user_termination_request.json`原状保留，完整补充说明在`user_termination_audit.json`，不能伪造未保存的原始祖先dump。新 `_04`保留继续运行，未触碰opencode/其他session。
- 当前自己的Vivado工程仍为`cx-p2_11-shell-20261104-06/project/af_cmac_shell.xpr`，无synth/route进行中。10:24核对：`digital_peer_verification_04` worker33100/kernel33432（10:06:08启动）；`..._05` worker31668/kernel32796（10:17:30启动），均live且仿真时间/结果在推进。PID只是定位线索，下一次先查当前归属，勿凭旧PID操作。两者均37121实例，当前授权足以运行。
- `_04` source_snapshot SHA-256 `99ca7ae399eabb32e9103665a4d160733679dac4426d3bc43d6541adf6f14455`；`_05` `9021b45344beef9dd1ace3f1eaab7a68547a8c0e9b27bd931f9e58c60674ff5d`。`_05`已打印RESET_PROBE_COMPLETE及BAD_FRAME_PROBE_COMPLETE（mac_error=1、bad_fcs_pulses=1）；这只是前置断言通过，不是完整SIM PASS。
- `cx-p2_06-pipeline-20261104-15` snapshot `1bc000ef6118229b16e4a7176291634d3129c6575f16853b5426225546589ce2`：延后配置RTL PASS，222673有效周期、FIFO3833、ring385、2500停顿周期；SYNTH/ROUTED未运行。
- `cx-p2_11-sta-20261104-02` snapshot `808a995d8b5956e772b7c4c5b15936e2a7cfcfb772c882fa13e41dda32440391`：输入shell-04原DCP hash `f346d0e4b93a1cbaf6f53e4a7866f427b7f0129244b7a8e1c2820e472e512d8e`，9个冻结RTL一致。同一布局125MHz WNS+0.105/WHS+0.014；200MHz WNS−2.851；250MHz−3.851。分类SAME_ROUTE_STA_RECHECK，不是新ROUTED/Fmax。`sta-01`报告后close_project清理错误保留；新sta-02三点Tcl完整结束。
- 数字/物理配置比较：4个wrapper配置差异；83个CMAC核参数仅2个对齐间隔不同，413个核内符号端口映射相同；7个接收RTL SHA相同。仅配置/源码身份审计，不是形式等价或GT动态验证。
- 新鲜22项Node测试通过；更改后的准备器/生成器/收集器Node语法检查和git diff --check通过。先运行`node scripts/phase2-cmac-instance-evidence.mjs`，再`node scripts/phase2-cx-evidence.mjs`；总摘要当前IN_PROGRESS_DIGITAL_SIM_WITH_FULL_SERIAL_LIMIT，completion仍NOT_ACHIEVED。完整报告在`reports/phase2-cmac-instance-optimization.zh-CN.md`；M4科学核未开始。

本轮新增未提交文件（其余55项沿用上方逐项清单）：

- `tcl/phase2_cmac_digital_run.tcl`
- `tcl/phase2_pipeline_delayed_config.tcl`
- `tcl/phase2_shell_clock_recheck.tcl`

### 2026-11-04 18:30 Vivado 2025.1迁移交接

用户授权独立迁移重建并继续M3，M4前停止。Codex，`codex/m2-m3-receiver`，基线`ae69ad0`，未commit/push/PR。

- 已完成：同9个硬件RTL在2025.1重新生成CMAC revision22并综合；标准硬件FAST_SIM_MODE=0的`cx-p2_11-shell-v2025-20261104-02`实际ROUTED，125MHz WNS +0.030ns/WHS +0.018ns/WPWS +0.003ns，17794 LUT/15926 FF/10 DSP/64 URAM/64.5 BRAM36；0黑盒、1CMAC/4GT/1common；CDC unsafe/unknown=0，DRC Error/Critical=0，51878网络全部布线、route errors=0，内部无时钟/未约束=0，bus-skew最低+2.385ns。标准CONFIG.*与2026 shell-04一致；只代表器件级OOC，不代表板卡验证。
- 进行中：`cx-p2_11-shell-v2025-20261104-01/serial_peer_verification`真实双CMAC/GT串行联测，FAST_SIM_MODE=1加速对齐，非GT bypass。2025引擎实际启动，双端对齐，300us时247个事务结果/256排队，尚无fresh PASS。worker2328/kernel12428（18:10:33启动）本轮核实仍live；PID仅供定位，后续重新核对归属，不终止/重复启动。4096包/98304字逐字golden、停顿及计数最终结果待收集。
- 源snapshot：01/02实现均a9e77fcf713d9959f601a288281af4654443ed51dc4ab845c60654e1a0a7862b；01串行补充2ad66806643e3c86e1a263b318916d316b88f44a7063efa7c226c9e81767d21d。原始报告/日志/IP/许可证不入Git。
- 自己的vivado MCP已使用2025.1，当前02 routed设计打开，SYNTH/ROUTED均终态；2026安装保留，未触及其他代理会话。许可证仅对自己的进程显式指定，未修改全局设置。
- 原2026数字_04/_05现已自然COMPLETE且fresh PASS，分别4096包/98304字及4096包/81920字；后者含resident复位和坏帧整包丢弃探针。仍只属数字边界范围，不能替代完整GT串行SIM。
- 下一步：先读01原始job_status和simulate.stdout，等待完整串行自然终态，核对fresh marker、golden/守恒；运行新收集器后再运行phase2-cx-evidence。M3尚未验收，不启动M4。原250MHz/10Mpps未通过，DDR/上板/板级映射未验证。
- 检查：22项Node测试通过；更改脚本语法与git diff --check通过。报告见reports/phase2-v2025-migration.zh-CN.md及JSON。
- 共62项未提交：此前58项逐项清单保持，新增下面4项；没有生成物入仓库，未提交/推送。

新增未提交文件：

- `tcl/phase2_cmac_serial_run.tcl`
- `scripts/phase2-v2025-evidence.mjs`
- `reports/phase2-v2025-migration.json`
- `reports/phase2-v2025-migration.zh-CN.md`

### 2026-11-04 完整串行仿真自然完成补充

已核对v2025-01/serial_peer_verification原job_status、stdout及独立marker，20:36:38自然COMPLETE/PASS：4096包/98304字、222708周期、FIFO峰值3831、ring峰值385、2500周期停顿。该job不再运行，无需终止或重复启动。新鲜机器摘要已重收；迁移报告追加终态，原RUNNING保留历史。下一步只做M3最终逐项验收与证据对照，M4未启动；尚未将整个M3标为完成。未commit/push，62项未提交文件清单沿用上一交接。

### 2026-11-04 最终交接：M2/M3完成，M4前停止

Codex；`codex/m2-m3-receiver` / 基线`ae69ad00cfe553b58391b4778283c4ba6776fc0f`。前一轮为实质进展（完整串行fresh PASS），本轮完成逐项验收、冻结副本/编译TB/marker新鲜度复查及报告收尾。最终验收：`reports/phase2-m2-m3-acceptance.zh-CN.md`；机器总摘要`M2_M3_COMPLETE_STOP_BEFORE_M4`，各必要门槛均true。

- M2：12bin/T8/5槽/125MHz接收闭环，RTL持续负荷32768包、16次20µs停顿，配置切换、异常/预览失效/守恒及4096包正确unisims post-route功能网表已验证。
- M3：2025.1标准`cx-p2_11-shell-v2025-20261104-02` SYNTH/ROUTED实际Complete100%；17794 LUT/15926 FF/10 DSP/64 URAM/64.5 BRAM36，WNS +0.030ns/WHS +0.018ns/WPWS +0.003ns，零黑盒、CDC unsafe/unknown0、DRC Error/Critical0、routing errors0，内部无时钟/未约束0。2025完整串行01于20:36:38自然COMPLETE，4096包/98304字逐字PASS，含20µs停顿。FAST_SIM_MODE=1功能与标准FAST_SIM_MODE=0实现分别记录；旧2026历史失败/CDC告警不改写。
- 当前运行：具体串行worker/kernel均已自然退出；本轮CIM无xsimk。自己的2025.1 MCP保持打开标准02 routed设计，查询所有run确认顶层synth/impl与CMAC OOC synth终态100%；CMAC独立impl未启动且不需要重复实现。未操作opencode。
- 风险/限制：原250MHz/10Mpps未通过；NF13同缓存突发空间拒收3包是局部边界，不是芯片极限。125MHz时序余量很小，URAM用满；DDR/板级映射/光纤/上板/SDF未验证，未开发RFSoC。完整串行覆盖初始GT启动及稳定运行，运行中reset/坏帧探针只在真实数字边界测过，不混同范围。
- 下一步：本轮到此停止，不启动M4/M5；用户另行授权后由下一写者先核对Git/本文/最终验收及原始证据。不要按历史RUNNING/BLOCKED条目重跑或终止任务。
- 校验：22项Node测试全通过，两个更新collector语法及git diff --check通过。未commit/push/PR。README/计划/报告顶部已加终态，旧时间条目保留为历史。全部未提交文件逐项列在下方（共63项，含此前62项及新增最终验收报告），没有厂商资料/许可证/日志/报告原件/DCP/IP产物入Git。
- `AGENTS.md`
- `README.md`
- `docs/phase-2-plan.zh-CN.md`
- `rtl/af_packet_parser.sv`
- `rtl/af_ring_control.sv`
- `scripts/generate-phase2-core-vectors.mjs`
- `constraints/af_cmac_shell_ooc.xdc`
- `constraints/af_ingress_ooc.xdc`
- `constraints/af_pipeline_ooc.xdc`
- `docs/phase2-cmac-shell.md`
- `docs/phase2-ingress-design.md`
- `reports/phase2-cmac-instance-optimization.json`
- `reports/phase2-cmac-instance-optimization.zh-CN.md`
- `reports/phase2-cx-m3.json`
- `reports/phase2-cx-m3.zh-CN.md`
- `reports/phase2-m2-m3-acceptance.zh-CN.md`
- `reports/phase2-v2025-migration.json`
- `reports/phase2-v2025-migration.zh-CN.md`
- `rtl/af_cmac_receive_shell.sv`
- `rtl/af_cmac_rx.sv`
- `rtl/af_receive_pipeline.sv`
- `rtl/af_rx_ingress.sv`
- `scripts/audit-phase2-netlist-result.mjs`
- `scripts/generate-cmac-shell.mjs`
- `scripts/generate-phase2-cmac-testbench.mjs`
- `scripts/generate-phase2-config-vectors.mjs`
- `scripts/generate-phase2-pipeline-vectors.mjs`
- `scripts/phase2-cmac-instance-evidence.mjs`
- `scripts/phase2-cx-evidence.mjs`
- `scripts/phase2-v2025-evidence.mjs`
- `scripts/prepare-phase2-cmac-digital-sim.mjs`
- `scripts/prepare-phase2-cmac-example-run.mjs`
- `scripts/prepare-phase2-cmac-shell-run.mjs`
- `scripts/prepare-phase2-cmac-sim.mjs`
- `scripts/prepare-phase2-config-run.mjs`
- `scripts/prepare-phase2-core-run.mjs`
- `scripts/prepare-phase2-ingress-run.mjs`
- `scripts/prepare-phase2-instance-profile.mjs`
- `scripts/prepare-phase2-parser-matrix.mjs`
- `scripts/prepare-phase2-pipeline-netlist.mjs`
- `scripts/prepare-phase2-pipeline-run.mjs`
- `scripts/run-vivado-sim-job.mjs`
- `sim/tb_af_cmac_receive_shell.sv`
- `sim/tb_af_pipeline_config.sv`
- `sim/tb_af_receive_pipeline.sv`
- `sim/tb_af_ring_preview.sv`
- `sim/tb_af_rx_ingress.sv`
- `tcl/phase2_cmac_audit.tcl`
- `tcl/phase2_cmac_digital.tcl`
- `tcl/phase2_cmac_digital_run.tcl`
- `tcl/phase2_cmac_example.tcl`
- `tcl/phase2_cmac_serial_run.tcl`
- `tcl/phase2_cmac_shell.tcl`
- `tcl/phase2_cmac_sim.tcl`
- `tcl/phase2_ingress.tcl`
- `tcl/phase2_instance_profile.tcl`
- `tcl/phase2_pipeline.tcl`
- `tcl/phase2_pipeline_config.tcl`
- `tcl/phase2_pipeline_delayed_config.tcl`
- `tcl/phase2_pipeline_netlist.tcl`
- `tcl/phase2_pipeline_run_quiet.tcl`
- `tcl/phase2_preview.tcl`
- `tcl/phase2_shell_clock_recheck.tcl`

### 2026-11-04 M4仅规划交接（用户未授权启动开发）

Codex，`codex/m2-m3-receiver` / 基线`ae69ad0`。用户要求“请规划M4，只做规划。基于2025.1”。已只读核对Git、M2/M3验收、原计划、接收/科学接口与参考模型，查看2025.1本地FFT/复乘IP元数据，并查阅AMD与FFTT/EPIC原论文；未启动Vivado/MCP命令、IP生成、仿真、综合、布局布线或科学核开发。

- 新增`docs/m4-plan-vivado-2025.1.zh-CN.md`：2025.1工具约束、M4-00至06、科学定义/独立真值、raw-ring读适配、系数/RAM/积分/输出预算、完整1024天线双极化波束/二维FFTT/EPIC、真实shell集成与能力边界、完成门槛。M4各执行任务全部NOT STARTED。
- 关键规划判断：M3标准12bin原方案URAM64/64、125MHz WNS仅+0.030ns；先解决科学核数据消费和存储共享。三模式分别构建，不要求同时驻留。先N1024/P2/一频率bin/一束闭环，再扫描L1/2/4/8/12及束数/网格。降低L要新构建重验，不能继承旧实现。预算数均为分析，不标实测。
- README和原第二阶段计划加入新文档入口；不改M2/M3历史证据或实现源。未创建M4实验目录，无新运行作业。未测试代码（本轮只改文档），git diff --check通过；没有新硬件测试结果。
- 下一步仅在用户另行授权开发后，按新计划先做M4-00契约/2025配置与M4-01读适配；当前停在规划交付。不触及M5，不commit/push/PR，不上板/RFSoC/DDR开发。
- 工作树原63项未提交完整保留，本轮仅新增计划文件，现64项；本轮修改已有AGENTS.md、README.md、docs/phase-2-plan.zh-CN.md。全部未提交文件逐项如下，其他项为此前M2/M3成果，不能误认为本轮开发。
- `AGENTS.md`
- `README.md`
- `docs/phase-2-plan.zh-CN.md`
- `rtl/af_packet_parser.sv`
- `rtl/af_ring_control.sv`
- `scripts/generate-phase2-core-vectors.mjs`
- `constraints/af_cmac_shell_ooc.xdc`
- `constraints/af_ingress_ooc.xdc`
- `constraints/af_pipeline_ooc.xdc`
- `docs/m4-plan-vivado-2025.1.zh-CN.md`
- `docs/phase2-cmac-shell.md`
- `docs/phase2-ingress-design.md`
- `reports/phase2-cmac-instance-optimization.json`
- `reports/phase2-cmac-instance-optimization.zh-CN.md`
- `reports/phase2-cx-m3.json`
- `reports/phase2-cx-m3.zh-CN.md`
- `reports/phase2-m2-m3-acceptance.zh-CN.md`
- `reports/phase2-v2025-migration.json`
- `reports/phase2-v2025-migration.zh-CN.md`
- `rtl/af_cmac_receive_shell.sv`
- `rtl/af_cmac_rx.sv`
- `rtl/af_receive_pipeline.sv`
- `rtl/af_rx_ingress.sv`
- `scripts/audit-phase2-netlist-result.mjs`
- `scripts/generate-cmac-shell.mjs`
- `scripts/generate-phase2-cmac-testbench.mjs`
- `scripts/generate-phase2-config-vectors.mjs`
- `scripts/generate-phase2-pipeline-vectors.mjs`
- `scripts/phase2-cmac-instance-evidence.mjs`
- `scripts/phase2-cx-evidence.mjs`
- `scripts/phase2-v2025-evidence.mjs`
- `scripts/prepare-phase2-cmac-digital-sim.mjs`
- `scripts/prepare-phase2-cmac-example-run.mjs`
- `scripts/prepare-phase2-cmac-shell-run.mjs`
- `scripts/prepare-phase2-cmac-sim.mjs`
- `scripts/prepare-phase2-config-run.mjs`
- `scripts/prepare-phase2-core-run.mjs`
- `scripts/prepare-phase2-ingress-run.mjs`
- `scripts/prepare-phase2-instance-profile.mjs`
- `scripts/prepare-phase2-parser-matrix.mjs`
- `scripts/prepare-phase2-pipeline-netlist.mjs`
- `scripts/prepare-phase2-pipeline-run.mjs`
- `scripts/run-vivado-sim-job.mjs`
- `sim/tb_af_cmac_receive_shell.sv`
- `sim/tb_af_pipeline_config.sv`
- `sim/tb_af_receive_pipeline.sv`
- `sim/tb_af_ring_preview.sv`
- `sim/tb_af_rx_ingress.sv`
- `tcl/phase2_cmac_audit.tcl`
- `tcl/phase2_cmac_digital.tcl`
- `tcl/phase2_cmac_digital_run.tcl`
- `tcl/phase2_cmac_example.tcl`
- `tcl/phase2_cmac_serial_run.tcl`
- `tcl/phase2_cmac_shell.tcl`
- `tcl/phase2_cmac_sim.tcl`
- `tcl/phase2_ingress.tcl`
- `tcl/phase2_instance_profile.tcl`
- `tcl/phase2_pipeline.tcl`
- `tcl/phase2_pipeline_config.tcl`
- `tcl/phase2_pipeline_delayed_config.tcl`
- `tcl/phase2_pipeline_netlist.tcl`
- `tcl/phase2_pipeline_run_quiet.tcl`
- `tcl/phase2_preview.tcl`
- `tcl/phase2_shell_clock_recheck.tcl`

### 2026-11-04 M4-00 环境/IP/契约首轮（opencode）

- 用户授权M4，并决定Vivado 2025.1为主版本；2026.1安装保留，不混用IP/DCP/仿真库。
- 分支：`opencode/m4-science`，基于`ae69ad0`；工作树仍含Codex未提交的M2/M3成果，本轮不覆盖、不回退这些文件。
- 新增：`docs/m4-execution-goals.zh-CN.md`、`docs/m4-science-contract.zh-CN.md`、`config/m4-science.json`、`models/m4-science-reference.mjs`、`tests/m4-reference.test.mjs`、`tcl/m4_ip_probe.tcl`、`reports/m4-00-environment.zh-CN.md`、`reports/m4-00-environment.json`。
- 2025.1 IP：`xfft:9.1` 64点/16bit OOC SYNTH 1435 LUT、2689 FF、3.5 BRAM36、9 DSP，WNS +8.804ns；`cmpy:6.0` 16×16/33bit OOC SYNTH 2 LUT、114 FF、3 DSP，WNS +98.804ns。两者0 errors/0 critical，仿真目标生成且`xvhdl`+`xelab`编译/elaborate通过。
- 外部构建：`D:/work/build/apertureforge-fpga/oc-m4-00-20261104-03`；snapshot SHA256 `31d1524eccbcfc41f4347045501dc68aa1304d43c9183348c00ee0d80578d46e`。
- 参考/容差：6项M4测试、28项Node测试全部通过；`scripts/m4-tolerance-study.mjs` 32-seed研究已冻结首轮门槛（波束RMS≤0.012、FFT L2≤0.008、EPIC L2≤0.008、Stokes Q≤0.02），结果`reports/m4-00-tolerance.json`。M4-00环境/IP/契约/容差/参考首轮完成，M4未验收。
- M4-01首轮：`oc-m4-01-20261104-01` 的`af_science_reader`全源2560读/样本/2566周期、缺源40读/252跳过、反压714周期、复位通过；8ns OOC SYNTH WNS +5.812ns、233 LUT/1620 FF/0 BRAM/URAM/DSP。仅单slot store模型，缺源只交mask/count给下游零填，未接真实core/极化产品/积分/FIFO。
- 下一步：把reader接真实`af_receive_core`并补零填/极性映射/产品/积分/输出FIFO；之后才进入M4-02低L波束闭环。不把IP OOC资源或8ns OOC时序写成完整科学核或125MHz系统通过。
- 本轮未提交/未推送；Codex接手前先核对其未提交M2/M3清单与本M4文件，不要静默覆盖。