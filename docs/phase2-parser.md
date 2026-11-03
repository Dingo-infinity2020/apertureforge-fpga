# Ethernet/IPv4/UDP/AFP1 解包接口

`af_packet_parser` 同一份RTL支持32/64/512bit输入与同宽科学数据输出。首版只接受Ethernet II、IPv4 IHL=5、UDP checksum=0、无VLAN/分片，输入不含FCS。目标MAC/IP/UDP端口和AFP1活动配置在第一拍握手时一起采样。IPv4 checksum、各层长度、目的地址和AFP1字段均检查；不支持的形式明确拒绝。

## 三个事件接口

| 接口 | 什么时候有效 | 下游职责 |
|---|---|---|
| h_valid/h_ready，h_header/h_errors/h_accept | 106B前缀捕获、网络与AFP1检查完成后 | 真实预留完成后才令h_accept=1；保存包含generation/slot/source的事务句柄 |
| p_valid/p_ready，p_data/p_keep/p_last | 准入后的、从106B起重新对齐的科学数据 | 每拍检查ring write_permit；内容仍是未提交数据 |
| f_valid/f_ready，f_reserved/f_commit/f_errors | 包尾状态、实际长度与科学数据排空均已确定后 | f_commit只是请求；还需ring接受真实commit，才可成为有效贡献 |

所有输出在反压时保持。短于完整前缀的帧可以直接产生f事件，不一定先有h事件；连接器必须处理“没有预留”的拒收。准入拒绝时继续排空输入，不输出科学数据。p_last可能在期望负载已输出时出现，之后仍要检查多余尾部；不能以p_last代替包尾提交。

**输入可以反压，是处理域接口，不可直接接没有tready的CMAC RX。** 必须在前面补非停顿包暂存和CDC。本次测试的理想准入和有限激励不证明P2-02已实现。

## 字节对齐与错误

Ethernet/IP/UDP共42B，AFP1共64B，科学数据从106B开始。512bit版本在最后一个前缀拍留下22B carry，随后与下一拍的42B拼成64B；32/64bit版本使用相同参数化逻辑。每个正常分量字节与独立软件参考比较，不靠计包数验收。

| f_errors位 | 类别 |
|---:|---|
| 0..7 | AFP1原有magic/format/session/source/route/length/sequence/ADC映射检查 |
| 8 | 不支持的Ethernet/IP/UDP形式，含非零UDP checksum |
| 9 | IPv4 checksum |
| 10 | IP/UDP/AFP1声明长度关系 |
| 11 | 网络目的MAC/IP/UDP端口 |
| 12 | keep/短前缀/缺失last超时 |
| 13 | 输入错误状态 |
| 14 | 实际长度、MTU/最大帧或已准入科学数据长度不符 |
| 15 | 语法有效但外部准入拒绝 |

末拍错误在f阶段取消，即使先前已有p写入；科学输出由后续committed mask隔离。额外尾部不会继续写超出声明负载的科学数据。超长帧在超过MAX_FRAME_BYTES时产生一次拒收，然后排到真实last恢复边界。

复位进入RESYNC，丢弃到下一个last；中途复位后不会把残余数据当新包头。外部必须一起清除/终结旧ring事务，入口还须记录复位排空造成的丢弃。默认IDLE_TIMEOUT=256，只有处于收帧状态、输入ready且没有valid时计数；自身输出反压不算缺尾。超时后报告拒收，再排到一个真实last恢复，不能立即把剩余字节当作新包。

## 当前验证与边界

32/64/512bit重放分别产生53/53/60个结果，均逐字比较科学字节、报头、错误分类及反压稳定性，含中途复位和有效重传。512bit另有相同stimulus的routed功能网表重放。

连续测试重复1024个相同mapped128包，理想准入且所有sink始终ready，测得24576周期、稳定24拍/包，RTL和网表一致。它包含本模块前缀、报头检查、重新对齐、包尾排空，但不包含真实ring、暂存、CDC、消费者停顿或全网络乱序。它不是可上线的相同sequence重复流；重复包检查属于外部ring。

主512bit实例OOC routed：4027 LUT、3081 FF、8 DSP，零BRAM/URAM；250MHz WNS +0.060ns/WHS +0.032ns。4027个LUT中72个为移位寄存器，不是数据槽RAM。外部IO与CMAC时钟树未约束，不能当板级通过。

在250MHz下24拍对应10.4167Mpps、53.3333Gb/s科学数据。mapped128需求10Mpps即25拍预算，仅剩1拍余量；真实准入与提交必须联测，不能直接沿用该吞吐。

## 复现

先用 `scripts/generate-phase2-network-vectors.mjs` 生成外部完整帧参考，再运行 `scripts/export-phase2-parser-vectors.mjs <network_vectors.json> <fresh-build>/vectors <32|64|512>`。导出器还添加网络/AFP1负向变异、超长帧与准入拒绝；提前last按物理帧拆分，缺失last按超时/恢复契约处理。

通过Vivado MCP source `tcl/phase2_parser.tcl`，依次prepare/simulate/start，收集synth_1后启动/收集impl_1。用 `tcl/phase2_netlist.tcl` 运行主重放的网表验证；用 `tcl/phase2_parser_perf.tcl` 分别运行behavioral与post-implementation连续测试。所有PASS标记必须新生成。

当前仍需连接真实ring预留/提交、数据RAM和消费读栅栏，核对epoch/deadline竞争、源mask与数据，再接非停顿入口/CDC；完整接收器仍未验收。
