# ApertureForge

面向密布双极化射电阵列的 FPGA 后端架构与容量评估。[GitHub 仓库](https://github.com/Dingo-infinity2020/apertureforge-fpga)。

项目覆盖频率分片后的相干波束合成、规则 FFTT、非规则阵列 EPIC，以及它们共同依赖的网络接收、时间对齐、缓存和科学数据质量。名称不绑定 FPGA 型号，便于比较 KU5P、KU11P、KU15P 及其他平台。

## 当前范围

2026-11-03：**第一阶段验收完成，第二阶段正在执行**。报头八级流水已通过250MHz内部routed时序及功能网表仿真；两档完整容量raw存储也有实际证据。ring事务控制已通过541条事务及64bit边界仿真，默认综合完成但250MHz时序失败，正在布局布线。完整接收器和科学算法核未完成，未上板；CMAC缺授权，先推进独立模块。详见[最新中间结果](reports/phase2-control.zh-CN.md)。

- 1024 个物理天线，双极化，共 2048 路电压。
- 可调谐范围 0.5–1.5 GHz；同时处理带宽优先 200 MHz，扩展 500 MHz，1 GHz 为对照。
- 新架构假设 RFSoC 完成 PFB/FFT，随后重新量化成 I/Q 各 8 bit，通过交换网络进行 corner turn。
- 已有 FNIC-KU5P：`xcku5p-ffvb676-1-i`，两个 QSFP28，只有一个硬核 100G MAC/PCS。
- KU15P 尚未选板，主方案暂按 2×100G 假设预算；器件级四个硬核不等于板卡四个可用端口。KU5P 双口聚合、KU15P 四口均已移出默认容量表。
- **当前首要工作包 AF-000：RFSoC 频率分发、源端 pacing、KU5P 时间重排与有界 ring buffer 的联合设计。** 先确定接收契约和 DDR 吞吐约束，再宣称算法可持续带宽。

## 阅读入口

- [第二阶段最新中间结果](reports/phase2-control.zh-CN.md)、[首批历史结果](reports/phase2-progress.zh-CN.md)、[机器可读证据](reports/phase2-progress.json)
- [环境与依赖实查](docs/phase2-environment.md)、[独立模块接口与复现](docs/phase2-independent-modules.md)
- [第二阶段详细计划：RTL、综合与布局布线](docs/phase-2-plan.zh-CN.md)（执行中）
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
