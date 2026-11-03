# P1-03/04 事件与接收槽模型契约

2026-11-03，离散事件参考，非RTL与具体交换机实现。

## 网络

`models/corner-turn.mjs`按每个源构造完整发包日程。一个T谱块在`(block+1)×period`准备完毕；块填充从`block×period`开始。源端必须同时满足有限组包bank与有限待发送字节容量。数据bank保守保持至本块最后一个包完成发送，连同当前正在采集的块计入bank占用；bank不足则整块丢弃并计数。

所有100G链路以微秒进行逐包序列化。包科学字节外另占130字节（含应用头、IPv4/UDP、Ethernet头/FCS、前导/IFG）。源待发送队列与交换输出队列均计入正在服务的完整包，容量统计因而保守，不把完成包的历史审计记录算成硬件存储。

源策略：burst同序；rotated按source旋转目的顺序；phased在旋转基础上按source错开一个块周期内的相位；paced再将各目的包释放均匀分布在块周期内。晚于计划due的包仍须等源端口空闲，不能靠调度绕过链路速率。

源发送完成后加入固定传播延迟与有界hash延迟，再进入最终输出FIFO。每个目的地独立有限FIFO、100G服务；假设交换fabric不限制聚合吞吐、没有共享队列和其他业务，输入链路到不同目的地的延迟可不同。该模型仅适于比较调度/到达关系，不能用来验收未知型号交换机。hash延迟是确定性测试轨迹，不是任意对抗性抖动保证。

默认三组装配bank与两块等效待发字节队列、512KiB/输出FIFO。新增二bank负向对照发现：paced的源相位及跨周期发送可能使两份组包区不足，即使平均网口负载很低。不能将早期的双缓冲容量公式直接当作paced源端的充分配置。P1-05须按实际最大bank数预算RFSoC内存。

完整256源和全部频率目的地参与仿真；只将目的地0的逐包完成事件保留给ring，其他目的地仍参与源串行化和各自输出队列统计。生成、源丢弃、交换丢弃、交付四种计数严格守恒。

## 接收槽

`models/receive-ring.mjs`是单个逻辑频率目的地通过解析后的时间槽模型；上线前必须先用AFP1 decode/validate和活动destination检查拦截错误报文。网络脚本传入source/block元数据，未生成全阵列科学payload；逐字节布局由packet测试独立覆盖。

每槽保留绝对block generation及source集合。单实例只含一个活动epoch/config；物理槽号为block mod depth。头部block必须按顺序输出，到齐可提前提交，否则在绝对deadline提交。deadline相对源块ready时刻，包含源端调度与传输，不应解释为仅差分乱序窗口。

`advance(time)`推进内部服务结束、超时和释放；同一时刻先处理到期，再处理到包，因此恰在deadline到达的包为late。数据提交后不可继续加入贡献。下游按每块所需服务时间工作，pause区间中不做有效工作，槽保留至读取完成。没有“完成后立即丢到无限输出队列”的隐藏空间。

外部ahead包、已释放/已到截止的late包、duplicate、非法source及session不符分别拒绝；窗口被已释放的数据时间范围追上时计window_full。等待缺失源的窗口到期输出，时间边界不伸长。输出source集合与缺失数可供后续权重处理；这里尚未实现科学归一化。

切换session时，先推进到切换时间，旧槽中已接收未消费数据计discarded，未输出块数计epoch_aborted_blocks；清除服务和槽，新epoch时间原点设为切换时刻。新session可重新从block0开始。旧session包拒收，跨epoch不共享贡献。

核心记账：`arrived=accepted+rejected`，`accepted=consumed+discarded+resident`。输出审计数组是仿真记录，不计入FPGA缓存；硬件需要流式读出并保留等价计数。

## 已执行与尚待验证

运行：`node --test tests/packet.test.mjs tests/transport.test.mjs`，随后`node scripts/simulate-corner-turn.mjs`。报告为`reports/phase1-transport.*`和`reports/phase1-ring.*`。

测试含独立小网络列表调度真值、超载/有限源队列/二bank失败对照、缺失与重复、乱序及generation回绕、epoch切换后新session、deadline相等、超前/窗口满和下游停顿。40个种子的故障轨迹还与独立按block分组/截止过滤的oracle核对，oracle配置为非约束深度以隔离时间和有效源语义。

原矩阵每配置32块；新增stream模型以堆维护在途事件并压缩已服务队列的历史记录，完成8条512块全网络轨迹，配置与代码hash见phase1-sustained.json。流式与批量模型在小规模有限队列下逐包对照，新增到包整数累加与独立raw参考也已通过。持续轨迹ring仍仅回放目的地0；阶段决策前须补逐目的地接收联合复核。当前不宣称整个第一阶段通过。
