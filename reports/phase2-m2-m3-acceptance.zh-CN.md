# M2/M3最终验收与交接

2026-11-04，Codex，`codex/m2-m3-receiver`，基线`ae69ad00cfe553b58391b4778283c4ba6776fc0f`。本轮目标完成，停止于M4之前；第二阶段整体仍未完成。未提交/推送，未上板。

大白话：接收电路已经能把真实100G接口模型送来的包接住、分类、存进片内ring，再正确取出。本次验证了这条路可以在KU5P里实现，并给出一个通过配置。还没有验证波束合成、FFTT、EPIC能算多快，也不能据此确定最终板卡数量。

## 逐项验收

外部构建根目录统一为`D:/work/build/apertureforge-fpga/`。以下缩写均为该根目录下目录；原始报告、日志、源副本及snapshot保留在外部。索引与文件SHA见[机器摘要](phase2-cx-m3.json)、[迁移证据](phase2-v2025-migration.json)和[实例优化证据](phase2-cmac-instance-optimization.json)。

| 原目标要求 | 已检查的证据与结论 |
|---|---|
| 接手、隔离和源码身份 | main/基线ae69ad0，Codex独立分支/MCP；未复用opencode构建。9个硬件RTL的冻结副本、snapshot及当前工作树hash一致；2025标准配置CONFIG.*与2026 shell-04一致 |
| 调查250MHz/10Mpps缺口 | core多轮SYNTH/ROUTED及关键路径；`cx-p2_06-20261104-02`接收102401周期/4096包，比原106498少4097；250MHz WNS −3.227ns，条件折算9.999902Mpps，仍未达到。后续保留125MHz通过配置，不称芯片极限 |
| 事务、异常、截止、epoch及预览失效 | 修复前连续预览重复准入可复现；修复后15命令通过。32/64/512bit parser共166结果通过；core异常9结果/40字与计数守恒通过，原始marker见机器摘要各run |
| 非停顿入口、CDC、过载及复位 | `cx-p2_02-20261104-05`默认FIFO4096字：104有效包、5坏包、32空间拒收、峰值4089，复位后只交付新包；小容量用例另覆盖缺尾/超长/两个队列满。RX没有ready，拒收按整包排空 |
| 额定持续流量、突发、乱序与停顿 | `cx-p2_06-pipeline-20261104-13`：32768包/786432字、128块、16次20µs停顿通过；来源乱序逐字golden与计数守恒。7个接收RTL与pipeline-08及真实shell相同 |
| 组合实现及post-route功能网表 | `cx-p2_06-pipeline-20261104-08` 125MHz ROUTED；`netlist_verification_04`真实unisims功能网表4096包/98304字PASS、222674周期；不是SDF仿真 |
| 配置切换跨域联测 | `cx-p2_06-config-20261104-02`两代配置通过，覆盖held response、旧partial/queued包、旧resident RAM、stale done；不能串代 |
| 缓存用途、容量和带宽 | FIFO用于入口跨域/瞬态排队；ring用于科学时间窗和源对齐。精确账本见下，DDR未用 |
| 小分片到相邻失败边界 | 10bin和12bin实现/功能通过；13bin同FIFO/突发首块空间拒收3包，原始stdout失败保留。此边界只适用当前结构/流量/消费者，不是KU5P所有架构上限 |
| 真单口CMAC＋4GT完整功能 | `cx-p2_11-shell-v2025-20261104-01/serial_peer_verification`于20:36:38自然COMPLETE，真实双CMAC/GT串行连接，无force/假RX/GT bypass；4096包/98304字逐字PASS，计数守恒、20µs停顿，222708周期；两端启动、对齐及运行稳定均被检查 |
| 真实CMAC复位/坏帧 | 2026数字边界`cx-p2_11-shell-20261104-06/digital_peer_verification_05`4096包/81920字PASS，resident复位重建和真实TX error导致坏帧整包丢弃探针通过；此项不冒充串行链路复位压力测试 |
| SYNTH/ROUTED、黑盒和真实资源 | `cx-p2_11-shell-v2025-20261104-02`实际综合/布线均100% Complete；17794 LUT、15926 FF、10 DSP、64 URAM、64.5 BRAM36；0黑盒，1 CMACE4/4 GTYE4_CHANNEL/1 GTYE4_COMMON |
| 时钟、CDC、DRC、route和GT依据 | 标准02：125MHz WNS +0.030ns、WHS +0.018ns、WPWS +0.003ns、TNS0；CDC unsafe/unknown0、DRC Error/Critical0（15 Warning保留）；51878/51878网络布线、0错误，内部no_clock/未约束0，bus-skew最小+2.385ns。物理报告列GT/ref输入及K7/K6 bank227映射；仅器件级OOC，非板级映射 |
| 可复现、交接和范围停止 | 自写准备器/Tcl/worker、snapshot、编译TB hash及fresh marker均保留；README/计划/报告/机器摘要/AGENTS更新；M4未启动，不commit/push/上板 |

## 通过配置和缓存账本

12bin/T8/5槽，256源（1024物理天线双极化），I/Q各8bit；每包24个512bit科学字，处理域125MHz，CMAC用户域约322.265625MHz。名义科学流30.72Gb/s、2.5Mpps，线占用约33.32Gb/s，包以100G突发到达。不是持续100Gb/s科学有效载荷测试。

- 入口FIFO：4096×512bit原始数据=256KiB，keep/last另32.5KiB；实际64.5 BRAM36等效。描述符256项，另用分布式存储。
- 科学ring：5×256×24×64B=1.875MiB payload；实际64 URAM=2.25MiB物理位数，payload利用率83.33%，用满KU5P URAM。
- 512bit×125MHz=每读/写端口64Gb/s只是端口理论上界；实际控制周期和消费者停顿另计，不能称实测吞吐。真实串行本次FIFO峰值3831/4096字、ring峰值385源贡献，消费者停顿2500周期=20µs。

## 复现和证据边界

先读`docs/phase2-cmac-shell.md`、`docs/phase2-ingress-design.md`及迁移报告。新运行必须新建外部cx目录并冻结源；不要重新启动已完成目录。只读重收证据：

```powershell
node scripts/phase2-cmac-instance-evidence.mjs
node scripts/phase2-v2025-evidence.mjs
node scripts/phase2-cx-evidence.mjs
node --test "tests/*.test.mjs"
```

2025实现snapshot SHA-256为`a9e77fcf713d9959f601a288281af4654443ed51dc4ab845c60654e1a0a7862b`；完整串行补充snapshot为`2ad66806643e3c86e1a263b318916d316b88f44a7063efa7c226c9e81767d21d`。collector再次检查冻结副本与当前RTL、编译TB hash、marker时间及内容，机器总摘要用各项门槛合取判定，不只看一个PASS字样。

串行SIM使用厂商FAST_SIM_MODE=1缩短AM对齐时间；标准FAST_SIM_MODE=0硬件另建02实现。两者不是完整门级等价证明。2026/2025 CMAC分别revision26/22，旧2026的两项CDC-10及授权拒绝仍属历史构建，未改写/豁免。SDF、串行链路运行中复位压力、标准AM间隔的完整长仿真、板卡引脚接线、光纤、DDR和上板均未验证，不在本轮完成声明内。

本轮达到的是可复现的接收与真实CMAC组合实现边界。没有得到科学计算容量、最终节点数或整阶段最终决策。下一阶段如获用户授权才开始M4；目前停止。
