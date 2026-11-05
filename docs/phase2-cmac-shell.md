# M3真实CMAC接收shell与复现

范围是离线评估KU5P：真实单CMAC、四GT、不可停顿AXIS RX、包级入口/CDC、AFP1 parser、时间ring及raw URAM。消费者仍是逐字核对的测试台，科学核属于M4。本项目不实现RFSoC，不生成板级bitstream或上板。

当前实际结果、源hash及失败边界见[执行报告](../reports/phase2-cx-m3.zh-CN.md)和[机器证据](../reports/phase2-cx-m3.json)。完整CMAC串行仿真被XSim BASIC实例上限拒绝启动；不得把以下准备步骤写为运行通过。

## 实际连接

`af_cmac_receive_shell`由自写生成器从`af_receive_pipeline`接口生成；`af_cmac_rx`实例化Vivado生成的`af_cmac`，79个输入逐项明确连接。TX空闲；RX没有ready。RX/TX reset、aligned/status以及坏FCS状态保留在shell接口，入口统计属于各自时钟域，外部不得直接当作跨域控制。

IP：`cmac_usplus:3.1`，CAUI4/AXIS，无RS-FEC，RX剥除FCS、TX插入FCS，最大接收9600B。遵循生成示例的RX时钟接GT TXUSRCLK2，实际约322.265625MHz；init为100MHz、处理为125MHz。参考时钟由IP约束产生，未人工构造RX时钟或添加全局跨域false_path。

器件候选：`xcku5p-ffvb676-1-i`、CMACE4_X0Y0、GTYE4_CHANNEL_X0Y12..15、GTYE4_COMMON_X0Y3。器件数据库确认参考脚K7/K6为MGTREFCLK0P/N_227，IBUFDS0_GTYE4位置显式固定。这些值用于器件级OOC实现，**不是厂家板卡QSFP/振荡器映射的证明**。其余逻辑接口是OOC边界，未加板级输入/输出延迟。

## 分步重建真实实现

使用全新仓库外`cx-`目录，检查自己的session_status，不接管opencode。以下`<new-build>`必须由操作者替换成未占用的新目录。

```powershell
node scripts/generate-cmac-shell.mjs
node scripts/prepare-phase2-cmac-shell-run.mjs <new-build>
```

在自己的Vivado MCP中，关闭已核对归属且已收集的工程后，source **冻结副本**：

```tcl
source <new-build>/source/tcl/phase2_cmac_shell.tcl
af_cmac_shell_prepare <new-build> 24
af_cmac_shell_start_ip
```

24字/包是12bin×T8×8路复电压，对应5槽；参数20是10bin配置。IP综合完成后核对真实STATUS/PROGRESS，才能执行`af_cmac_shell_start`。顶层synth完成后收集`af_cmac_shell_collect synth_1`，再启动：

```tcl
launch_runs impl_1 -to_step route_design -jobs 2
```

轮询到终态后执行`af_cmac_shell_collect impl_1`。收集器必须核对零黑盒、1 CMACE4、4 GTYE4_CHANNEL、1 GTYE4_COMMON；再分别检查时序、所有时钟、未约束内部端点、CDC、bus-skew、DRC和route status。命令返回success不代表各项检查通过；不要覆盖既有DCP或报告。

`tcl/phase2_cmac_audit.tcl`是补充只读设计检查器，须先冻结到新补充目录，再对已打开的routed设计执行`af_cmac_audit <build>`。它写新鲜`physical_checks_impl_1.tsv`和`cdc_internal_reset_cones.tsv`，不创建waiver、不修改设计。两项IP内部CDC-10原始告警保留，不能因为发生在IP内部就改成0 unsafe。

## 真实CMAC串行peer仿真

测试台由`scripts/generate-phase2-cmac-testbench.mjs`从自写pipeline测试台生成，共用逐字golden、配置、20µs停顿及计数守恒检查。DUT是真实shell，第二个真实`af_cmac_rx`发送端通过GT串行线交叉连接；只对发送端TX使用ready，没有给接收端施加ready，也没有force内部输出。启动时先等待真实link/reset状态稳定，发送一帧供入口恢复帧边界。该完整测试台目前仅compile/elaborate完成，运行行为未验证。

```powershell
node scripts/generate-phase2-cmac-testbench.mjs
node scripts/prepare-phase2-cmac-sim.mjs <frozen-shell-build> 12
```

必须使用此前没有`serial_peer_verification`的构建；参数10/12须匹配存储几何。源文件、golden生成器、worker及Tcl在补充目录冻结，测试台只把include路径显式绑定到该目录，变换前后hash记入`generated_config.json`，原实现RTL/XDC不变。

目录已占用时，可在准备命令最后指定新标签，如`serial_peer_verification_02`；Tcl从冻结补充目录取得相同simset名。新运行使用同标签的source/Tcl、job_spec和worker，不复用旧job_status、marker或日志。当前脚本显式采用debug off及quiet run-all Tcl，保留所有数据检查。

在打开该shell工程的自己的MCP中：

```tcl
source <build>/serial_peer_verification/source/tcl/phase2_cmac_sim.tcl
af_cmac_sim_generate <build>
```

这里只生成脚本，不阻塞运行XSim。然后启动冻结worker：

```powershell
node <build>/serial_peer_verification/source/scripts/run-vivado-sim-job.mjs --start <build>/serial_peer_verification
```

轮询`job_status.json`及各阶段stdout/stderr；worker不设置终止超时。适用仿真授权缺失时，保留明确许可错误并标NOT RUN，不能重写为PASS。XSim可能在拒绝启动后仍返回0，当前worker已额外检查日志错误和实例限制，不仅检查退出码。

## 布线后接收链功能网表

完整CMAC模型不能运行时，可以独立验证接收链，但两者证据分开。使用已完成ROUTED的`cx-p2_06-pipeline-*`构建：

```powershell
node scripts/prepare-phase2-pipeline-netlist.mjs <pipeline-build>
```

在打开该工程的自己的MCP中source补充冻结`phase2_pipeline_netlist.tcl`并执行`af_pipeline_netlist_generate <pipeline-build>`，然后运行该补充目录的worker。该流程使用实际post-implementation功能网表、无SDF。`netlist_verification`已占用时只允许新编号补充目录，不覆盖历史；原始失败状态与人工审计文件分别保留。

准备器在冻结验证TB中显式定义`AF_PIPE_NETLIST`并绑定验证config绝对路径，避免Vivado脚本忽略另一个simset的include_dirs/verilog_define。`source_snapshot.json`是仓库输入源hash，`generated_config.json`另记录只进行上述绑定后的实际编译TB hash。首先保留原RTL PASS，网表结果写独立路径，不互相覆盖。

功能模式还要显式设置主sim_1与验证simset的`SIM_MODE=post-implementation`、`NL.MODE=funcsim`和`NL.SDF_ANNO=false`；只传launch_simulation的-type functional不足以防止主simset残留timesim。生成器核对elaborate.bat必须为unisims_ver，不允许simprims_ver或--maxdelay。`phase2_pipeline_run_quiet.tcl`仅run all/quit，不采波形，完整scoreboard保留。debug off不改变电路或参考向量。历史错误配置留原目录，不能改写脚本假装原来正确。

128块连续RTL测试可按以下参数生成，最后两个参数是块数和停顿模式：

```powershell
node scripts/prepare-phase2-pipeline-run.mjs <new-pipeline-build> 12 3 5 125 burst 256 128 periodic
```

周期停顿每8块20µs，另保留25/32数据ready占空比。发包时间先换ns并转real再乘块号，避免32位ps乘法在第22块溢出；测试台检查计划单调和完整停顿窗，报告逐字比较、计数守恒及源节奏。历史错误激励不用于硬件容量边界。

复现详情及入口容量/配置切换合同见[入口设计](phase2-ingress-design.md)。当前M3仍未整体验收，M4未开始。

## 不升级授权的实例优化（2026-11-04）

最新实测及边界见[实例优化记录](../reports/phase2-cmac-instance-optimization.zh-CN.md)。FAST_SIM_MODE=1 的真实串行组合仍为226930实例，GT quad 单独94889。GT_LOCATION=0 的真实 CMAC 数字端点为18529；这种配置用于数字接口独立验证，不替代真实GT硬件shell。

`tcl/phase2_cmac_shell.tcl` 的第三个参数可选 `fast_sim`，默认0；只在新构建中启用1，不能修改旧冻结配置。实例诊断命令如下，每次新label，不复用原目录：

```powershell
node scripts/prepare-phase2-instance-profile.mjs <frozen-build> endpoint
```

在自己的对应工程 source 补充目录的 `source/tcl/phase2_instance_profile.tcl`，执行 `af_instance_profile_generate <build> endpoint`，再运行补充目录冻结worker。`gt_quad`、`gt_channel`、`gt_common`、`axis_tx`、`axis_rx` 同理。这些 marker 为 PROFILE，1ns 诊断绝不能称功能验证。

数字 peer 流程：在新的仓库外目录冻结7个接收RTL及 `tcl/phase2_cmac_digital.tcl`，source冻结Tcl并 `af_cmac_digital_prepare <new-build>`；该流程只生成真实无GT数字接口IP，不启动综合。先进行上述endpoint接口/规模诊断，再：

```powershell
node scripts/prepare-phase2-cmac-digital-sim.mjs <digital-build>
```

source该新补充目录冻结的 `source/tcl/phase2_cmac_digital.tcl`，执行 `af_cmac_digital_generate <digital-build>`，再启动该补充目录冻结worker。可追加 `digital_peer_verification_02` 等新标签。生成器核对GT_LOCATION=0，明确连接每个输入，不修改厂商实现；自写adapter/TB的实际hash另记generated_config。完整4096包/98304字检查保留，scope为CMAC_DIGITAL_BOUNDARY_ONLY；不计入原完整GT串行M3通过。`node scripts/phase2-cmac-instance-evidence.mjs`仅收集独立证据，不启动工具。

准备器追加NF与测试模式参数可运行10bin的真实CMAC复位/坏帧检查：

```powershell
node scripts/prepare-phase2-cmac-digital-sim.mjs <digital-build> digital_peer_verification_05 10 controls
```

NF支持10/12，默认12；模式basic/controls，默认basic。controls在完整4096包前真实建立一个resident后复位/重建链路，并通过CMAC TX error发送错误帧，要求入口整包丢弃且科学RAM未写入。完整PASS还须匹配reset_probe=1、bad_probe=1。不能用这两项前置断言代替完整SIM PASS。生成器已把所有刺激reg放在实例前并用default_nettype none禁止隐式复位连线；历史错误TB源及失败记录保留。

数字仿真使用冻结`phase2_cmac_digital_run.tcl`分段run并打印current_time，不保留波形/debug。状态heartbeat使“正在推进”和“等待启动”可以区分；startup看门狗是仿真时间约束，不是墙钟超时重启。原有数据/计数/20µs停顿断言保留。先运行实例优化收集器，再运行`node scripts/phase2-cx-evidence.mjs`以更新总摘要的独立引用；M3未完成时completion保持NOT_ACHIEVED。2025.1迁移后完整串行已通过，最新验收见`reports/phase2-m2-m3-acceptance.zh-CN.md`。

2025.1复现采用同RTL重新建工程，不向旧版导入2026的XPR/DCP。先`prepare-phase2-cmac-shell-run.mjs`冻结新外部目录，然后用自己的2025.1 MCP source冻结`phase2_cmac_shell.tcl`，`af_cmac_shell_prepare <build> 24 0`生成标准硬件，逐步IP综合、完整综合、ROUTED与收集。完整串行加速配置另建目录，prepare末参数1，再用`prepare-phase2-cmac-sim.mjs`生成新补充目录，source冻结`phase2_cmac_sim.tcl`并`af_cmac_sim_generate <build>`，启动补充目录冻结worker。串行使用`phase2_cmac_serial_run.tcl`，明确job_scope=CMAC_GT_SERIAL、2025.1工具路径；许可证只在自身进程指定，不写进仓库。具体启动参数沿用本页已有完整流程，不复用已完成目录。

对原routed DCP做同一布局的其他时钟STA时，先在新外部目录冻结9个硬件RTL、XDC及`tcl/phase2_shell_clock_recheck.tcl`，记录输入DCP/source_snapshot hash；关闭自己已核实的工程，source冻结Tcl，执行`af_shell_clock_recheck <input-dcp> <new-build> 125`（或200/250）。每点写新子目录，不修改DCP、不启动synth/route。报告必须写SAME_ROUTE_STA_RECHECK，不能写新ROUTED或芯片Fmax。
