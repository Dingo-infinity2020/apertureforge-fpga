# ApertureForge

面向密布双极化射电阵列的 FPGA 后端架构与容量评估。[GitHub 仓库](https://github.com/Dingo-infinity2020/apertureforge-fpga)。

项目覆盖频率分片后的相干波束合成、规则 FFTT、非规则阵列 EPIC，以及它们共同依赖的网络接收、时间对齐、缓存和科学数据质量。名称不绑定 FPGA 型号，便于比较 KU5P、KU11P、KU15P 及其他平台。

## 当前范围

**最新验收（2026-11-04）：本轮 M2、M3 已完成，停在 M4 之前。** 2025.1完整真实CMAC＋GT串行测试4096包/98304字逐字通过，含20µs停顿；标准硬件配置125MHz ROUTED，WNS +0.030ns，17794 LUT/15926 FF/10 DSP/64 URAM/64.5 BRAM36，零黑盒、CDC unsafe/unknown及严重DRC。接收RTL长测与post-route功能网表证据已齐。已验证配置为12bin/T8/5槽，名义科学输入30.72Gb/s；13bin同缓存突发拒收3包。原250MHz/10Mpps未达到，板级/DDR/SDF/科学核未验证。逐项结论见[最终验收](reports/phase2-m2-m3-acceptance.zh-CN.md)和[机器摘要](reports/phase2-cx-m3.json)。

下面带时间的状态为开发过程历史记录，授权阻塞与RUNNING已由上述终态取代。

2026-11-04：**第一阶段验收完成；M2所测12bin接收配置验证证据已齐，M3数字组合验证推进中，完整GT串行验证仍受模拟器规模限制，未进入M4科学核。** 不可停顿入口、CDC和真实ring/RAM通过RTL长测、配置切换及4096包/98304字布线后功能网表比对。真实单CMAC/四GT组合125MHz ROUTED通过（WNS +0.105ns、WHS +0.014ns），15092 LUT、15701 FF、10 DSP、64 URAM、64.5 BRAM36，零黑盒/route errors/DRC Error或Critical；ring已用满URAM。13bin同缓存首burst空间拒收；原20bin/T2/250MHz/10Mpps目标仍未通过。

新鲜复核的真实CMAC串行peer为226930实例，当前XSim BASIC上限50000，仿真引擎拒绝启动；这与已可用的CMAC IP综合授权不同。IP内部2项CDC-10原始告警仍保留，M3不能写整体验证PASS。器件级GT/参考引脚已约束，板卡映射仍未验证；未上板、未开发RFSoC。源hash、构建目录与验收逐项审计见[Codex最新记录](reports/phase2-cx-m3.zh-CN.md)、[机器证据](reports/phase2-cx-m3.json)及[opencode历史交接](reports/phase2-oc-20261103.zh-CN.md)。

- 1024 个物理天线，双极化，共 2048 路电压。
- 可调谐范围 0.5–1.5 GHz；同时处理带宽优先 200 MHz，扩展 500 MHz，1 GHz 为对照。
- 新架构假设 RFSoC 完成 PFB/FFT，随后重新量化成 I/Q 各 8 bit，通过交换网络进行 corner turn。**本项目不开发RFSoC**，只用其数据格式、速率和到包节奏作为KU5P测试输入。
- 已有 FNIC-KU5P：`xcku5p-ffvb676-1-i`，两个 QSFP28，只有一个硬核 100G MAC/PCS。
- KU15P 尚未选板，主方案暂按 2×100G 假设预算；器件级四个硬核不等于板卡四个可用端口。KU5P 双口聚合、KU15P 四口均已移出默认容量表。
- **重点工作包 AF-000：输入频率分片/pacing合同、KU5P时间重排与有界ring buffer评估。** 输入端只建模，不实现RFSoC前端；先验证接收与缓存开销，再确定算法可持续带宽。

持续负荷补充：同12bin接收RTL在128块32768包/786432字RTL测试中通过，含每8块一次20µs停顿，共16次，入口峰值仍3833字。长测试台的32位ps调度溢出已复现/修复，错误激励记录保留并排除出容量结论；不把该RTL长测当完整CMAC或网表PASS。

最新网表补充：12bin的`pipeline-08/netlist_verification_04`已在正确unisims功能库下完成4096包/98304字比对，周期和缓存峰值与RTL相同；SDF未做。M3仍缺完整真实CMAC串行功能验证，当前在全新`serial_peer_verification_02`复核授权状态。

03:11授权复核已结束：全新真实CMAC串行测试仍因226930实例超过BASIC 50000上限而未能启动。**M3未完成、M4未开始**；接收链在所测12bin配置的独立验证证据已齐，原250MHz/10Mpps目标仍未通过。

2025.1迁移已开始：同一份RTL重新生成CMAC/IP，完整真实GT串行仿真引擎已经启动，标准硬件配置正在重建，M3尚未验收。2026.1下10/12bin数字边界测试均已完整PASS。当前进展以[2025.1迁移记录](reports/phase2-v2025-migration.zh-CN.md)及[对应机器摘要](reports/phase2-v2025-migration.json)为准。

按用户要求优先优化实例数量：FAST_SIM_MODE未减少完整串行计数；GT quad单独94889。改用真实CMAC的受支持并行SERDES接口做独立数字验证，两个CMAC加完整接收链实际降至**37121实例（−83.64%）**，当前授权可启动。4096包数字功能测试仍在运行，未报PASS；GT串行/PLL/物理复位不在此测试覆盖范围。详见[实例优化实测及边界](reports/phase2-cmac-instance-optimization.zh-CN.md)与[独立机器证据](reports/phase2-cmac-instance-optimization.json)。完整串行M3缺项保留，不把购买更高授权作为默认下一步。

## 阅读入口

- [M4科学核详细计划（Vivado 2025.1，仅规划，未启动）](docs/m4-plan-vivado-2025.1.zh-CN.md)：资源/缓存关口、完整波束/二维FFTT/EPIC、真实接收组合和逐项验收。

- [Codex当前M2/M3记录](reports/phase2-cx-m3.zh-CN.md)、[当前机器证据](reports/phase2-cx-m3.json)、[入口与CDC合同](docs/phase2-ingress-design.md)、[真实CMAC shell复现](docs/phase2-cmac-shell.md)
- [历史组合结果](reports/phase2-core.zh-CN.md)、[opencode 执行记录](reports/phase2-oc-20261103.zh-CN.md)、[第三批解包结果](reports/phase2-parser.zh-CN.md)、[第二批](reports/phase2-control.zh-CN.md)、[首批历史结果](reports/phase2-progress.zh-CN.md)、[历史机器证据](reports/phase2-progress.json)
- [组合接收核接口与复现](docs/phase2-receive-core.md)
- [完整帧解包接口与复现](docs/phase2-parser.md)、[ring事务控制](docs/phase2-ring-control.md)
- [环境与依赖实查](docs/phase2-environment.md)、[独立模块接口与复现](docs/phase2-independent-modules.md)
- [第二阶段详细计划：RTL、综合与布局布线](docs/phase-2-plan.zh-CN.md)（恢复执行）
- [第一阶段实施进度与证据](reports/phase1-progress.md)
- [第一阶段决策报告](reports/phase1-decision.zh-CN.md)、[逐项验收审计](docs/phase1-acceptance-audit.zh-CN.md)
- [事件模型语义](docs/event-model-contract.zh-CN.md)、[网络结果](reports/phase1-transport.md)、[环形槽扫描](reports/phase1-ring.md)
- [512块持续轨迹](reports/phase1-sustained.md)、[原始槽/到包累加/DDR比较](reports/phase1-buffer-comparison.md)
- [输入与硬件契约](docs/input-and-hardware-contract.zh-CN.md)、[AFP1包格式](docs/packet-contract-v1.zh-CN.md)
- [第一阶段任务目标与验收清单](docs/phase-1-objectives.zh-CN.md)
- [架构、器件选择与容量推导](docs/feasibility.zh-CN.md)
- [综合、实现和科学验证计划](docs/benchmark-plan.zh-CN.md)
- [RFSoC 频率分发与接收缓存重点方案](docs/corner-turn-and-buffer.zh-CN.md)
- [资料来源与证据边界](docs/sources.md)
- [可修改的场景参数](config/scenarios.json)
- [自动生成的容量表](reports/capacity.md)

## 重算

需要 Node.js，无额外依赖：

```powershell
node scripts/capacity.mjs
node scripts/transport-budget.mjs
```

第一阶段完整离线复现入口为 `node scripts/run-phase1.mjs`，包含测试、预算、事件矩阵、512块全目的地接收轨迹、包长对照和缓存比较，可能运行数分钟；决策/验收证据生成命令为 `node scripts/finalize-phase1.mjs`。本轮已完整运行核心流程，补入包长对照后又以 `--reuse-verified-sustained` 运行统一入口；该选项仅在模型/配置内容hash和全目的地覆盖检查均一致时复用刚完成的512块证据。记录见 `reports/phase1-reproduction.json`。

容量结果写入 `reports/capacity.json` 和 `reports/capacity.md`，包级预算写入 `reports/transport.json` 和 `reports/transport.md`。修改 `config/scenarios.json` 可调整带宽、位宽、PFB 过采样、频率通道数、波束数、网格和缓冲窗口。DSP 模型故意保留可审查的通用算术假设；后续应以对应 RTL 的实测资源与吞吐替换。包级模型还会检查报文开销造成的源端/接收端超载；平均科学载荷表不能代替该检查。

## 与已有项目的关系

已有 `D:/work/KU5P_FX_Accelerator` 继续维护现有 FX、PCIe 和板卡联调。ApertureForge 单独维护新架构的规划和容量评估；本轮只读取旧工程资料。原始 RFSoC 工程和厂家资料不复制进本项目。初始规划已同步至上述 GitHub 仓库 `main`；许可证待项目所有者选择。
