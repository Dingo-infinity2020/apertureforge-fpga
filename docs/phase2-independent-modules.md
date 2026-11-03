# 独立接收模块：接口与证据边界

这批模块不依赖 CMAC 许可。它们是完整接收器的组成部分，各自通过不能代替接收器通过。

## 对齐 AFP1 报头检查 `af_afp1_header_check`

输入为完整 64B AFP1 报头，`s_header[8*i+:8]` 对应字节 i，配置在 `s_valid && s_ready` 时一起采样。两级弹性寄存器；输出在 `m_valid && !m_ready` 时保持报头和错误位稳定。复位清除在途 valid。

错误位 0..7 分别对应：magic/version/header length；flags/format/input count/reserved；epoch/config；source/destination；frequency/T；payload length；spectrum alignment/sequence；ADC time mapping/overflow。64bit 时间运算不经过 JavaScript Number；参考向量包含大于 2^53 的 ADC 标签和乘积溢出。

限制：仅覆盖当前每源 8 输入、256 源与 `T=1/2/4/8` 的报头契约。未检查 Ethernet/IP/UDP、字节跨拍、keep/last、CRC、负载内容，也不分配 ring 槽或设置有效位。每拍一个报头的结构能力不能当作完整收包 10Mpps 的实测证据。

复现：先执行 `node scripts/generate-phase2-header-vectors.mjs <external-build>/vectors`，通过 Vivado MCP `source tcl/phase2_header.tcl`，依次调用 `af_header_prepare <external-build>`、`af_header_simulate`、`af_header_start_synthesis`。待 `synth_1` 完成后收集综合、启动路由，完成后收集路由；不因工具调用超时重启运行。所有 source 路径按本机绝对路径传入。

## 全尺寸 raw payload 存储 `af_ring_store`

512bit 字宽，单时钟，一路写和一路读。地址按以下公式生成：

```text
word = ((slot * 256) + source) * words_per_packet + packet_word
mapped128:    10 slots × 256 sources × 10 words = 25600 words = 1.5625 MiB
candidate128:  7 slots × 256 sources × 16 words = 28672 words = 1.7500 MiB
```

每个 word 为 64 字节科学负载；mapped 的包为 640B，candidate 为 1024B。网络包头不占本存储地址，但须由入口另行预留暂存。

RTL 请求 `ram_style="ultra"`，实际 URAM 映射以综合报告为准。宽度 512bit 与 URAM 原生端口、深度取整可能带来额外物理容量成本，不能用逻辑字节数直接当块数。当前是连续 source-major 存储；算法消费按 time/frequency/input 顺序所需的地址生成和转置尚未实现。

写在 `w_valid && w_ready` 时接受。读在 `r_valid && r_ready` 时接受，经过两级同步读出；输出停顿时整个读流水保持，写端仍可独立工作。同地址同时读写时写优先，读 ready 拉低；不依赖器件同地址读写的未定义返回值。越界地址不接受。复位清 valid，不清 RAM；槽控制必须依靠 generation 与 committed bitmap 防止读取旧贡献。

测试写遍完整地址空间后逐字比较全部 512bit，插入输出停顿、同地址读写冲突，并测试在途读复位后不输出旧 valid。该测试不包含真实网络突发、槽分配、包尾 abort、时间窗或 CDC；其人为停顿吞吐也不等同于完整接收器可持续带宽。

复现：通过 MCP `source tcl/phase2_store.tcl`；调用 `af_store_prepare <fresh-external-build> 25600`（或 28672）、`af_store_simulate`、`af_store_start_synthesis`；综合完成后 `af_store_collect synth_1`，再 `launch_runs impl_1 -to_step route_design -jobs 2`，完成后 `af_store_collect impl_1`，最后 `af_store_netlist_simulate` 对 routed 网表做功能比较。测试启动须等待默认100ns全局复位结束，本测试在140ns释放本地复位。MCP 返回成功只说明命令执行，应同时核对 run 状态、新鲜仿真 PASS 标记及实际报告。

## 后续连接顺序

补齐非停顿包暂存及跨拍 parser，接入 reserve/write/commit/abort 和 generation/source bitmap，再让本存储与真实消费者同时运行。首先验证坏尾包、pending 重复、deadline/epoch 与提交竞争，之后才能把这个存储称为可用 ring buffer。

OOC 只约束内部时钟，没有板级输入输出时延或实际 CMAC 时钟树。无外部 IO 约束与 `HD.CLK_SRC` 告警须保留在证据限制中；内部 routed 时序结果不能升级为板卡接口通过。
