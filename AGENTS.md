# AGENTS.md

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

- 日期：2026-11-03。
- 分支：`main`；本地与 `origin/main` 均为 `1cfad68`。
- 第一阶段验收完成；第二阶段恢复执行，尚未验收。
- 最新证据：[reports/phase2-oc-20261103.zh-CN.md](reports/phase2-oc-20261103.zh-CN.md)；上一轮组合结果见[reports/phase2-core.zh-CN.md](reports/phase2-core.zh-CN.md)。
- 已测：组合接收核功能通过；routed 资源 18415 LUT、13012 FF、8 DSP、56 URAM；250MHz 时序失败；同一布线 125MHz 重查通过；周期折算约 9.615Mpps，低于 10Mpps。
- 未完成：组合核布线后网表仿真、SDF、真实 CMAC 组合、不可停顿入口/CDC、科学波束/FFT/EPIC 核、上板。
- 阻塞/未知：CMAC IP OOC 综合/授权已重新验证，完整 shell 未验证；KU11P/KU15P 器件库仍缺；板级 GT/时钟/DDR 未验证。
- 旧工程只读基线：`956f84cea5569ef2c2d1910ce82e468f8bc4b6da`。

## 2. 环境与常用命令

- 平台：Windows PowerShell 5.1；Node.js `v24.19.0`；无 `package.json`、无 npm 依赖。
- 单元测试：

```powershell
node --test "tests/*.test.mjs"
```

当前应为 22 项全部通过。测试只读，不写报告。

- 第一阶段重算：`node scripts/run-phase1.mjs`；决策证据：`node scripts/finalize-phase1.mjs`。
- Vivado：`D:/AMDDesignTools/2026.1/Vivado/bin/vivado.bat`，器件 `xcku5p-ffvb676-1-i`。
- MCP venv：`D:/work/tools/vivado-mcp-native/.venv`。
- 第二阶段复现入口见 `docs/phase2-receive-core.md`、`docs/phase2-parser.md`、`docs/phase2-ring-control.md`。
- 冻结源 hash：`node scripts/phase2-snapshot.mjs <existing-external-build> <repo-relative-source> ...`。
- 生成紧凑证据：`node scripts/phase2-evidence.mjs`，不启动 Vivado。

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

更新规则：结束工作的代理替换或追加本表最后一行，不要删除历史行；新行写清实验目录和下一步，方便另一个代理直接接手。
