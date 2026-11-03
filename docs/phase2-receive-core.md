# 组合接收核接口与复现

当前整体任务暂停。本说明记录已有实现及重建方法，不表示本次同步重新运行了仿真或Vivado。结果见[第四批报告](../reports/phase2-core.zh-CN.md)。

## 接口边界

`rtl/af_receive_core.sv`在同一同步时钟域连接`af_packet_parser`、`af_ring_control`及`af_ring_store`，默认256源、10槽、每包10个512bit数据字。输入为已去FCS、可停顿的Ethernet帧接口；不直接连接不可反压的CMAC RX。

完整报头通过后发起reserve，登记返回的slot/generation；每个科学数据字都检查真实write_permit、完整keep及地址范围。parser包尾通过只产生提交请求，`result_commit`必须等ring确认提交后才成立。坏尾或非法/过期写走abort；未通过提交的数据即使留在RAM中，也不能作为有效贡献读出。

消费者先接受描述符，再按该描述符的slot和有效源mask读取。接口不携带任意外部读队列的generation：调用者必须在配置切换时清空外部读上下文。内部尚未返回的读响应排空后才允许正确generation/sequence的done释放槽。缺失源和非当前消费槽读请求不会被接受。

`cfg_valid`同时撤销旧parser/适配器/消费上下文及输出valid，不清零整片RAM；依赖新generation及有效mask隔离旧内容。统计为64bit模计数。详细握手以RTL端口和测试台为准。

## 重建入口

在新鲜的仓库外部构建目录生成向量（下例目录需自行选择，不能覆盖历史构建）：

```powershell
node scripts/generate-phase2-core-vectors.mjs D:/work/build/apertureforge-fpga/<new-run>/vectors
node scripts/generate-phase2-core-perf.mjs D:/work/build/apertureforge-fpga/<new-run>/vectors
```

在Vivado中`source tcl/phase2_core.tcl`后，调用`af_core_prepare <new-run>`、`af_core_simulate`。可再`source tcl/phase2_core_perf.tcl`并调用`af_core_perf_simulate <new-run>`运行完整负荷测试；它不是不可停顿入口测试。

综合前用`scripts/phase2-snapshot.mjs`冻结本次RTL、测试台、XDC、生成器、模型与Tcl的hash。调用`af_core_start`启动综合；完成后`af_core_collect synth_1`。随后在该独立项目启动`launch_runs impl_1 -to_step route_design -jobs 2`，完成后`af_core_collect impl_1`。观察辅助脚本为`tcl/phase2_core_observe.tcl`。脚本不自动执行组合网表仿真，当前也没有这项通过证据。

本次已收集的额外clocks报告和125/200MHz重查，在相同布线网表上执行，不属于重新实现。若要完全复核发布结果，应核对[机器证据](../reports/phase2-progress.json)内源快照、约束和原报告hash，不能只以当前HEAD名称替代历史构建源。`scripts/phase2-evidence.mjs`读取已有外部运行目录生成紧凑摘要，不启动Vivado。
