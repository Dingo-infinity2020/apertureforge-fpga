# 第一阶段要求与证据审计

范围保持原始P1-01至P1-06：离线数据契约、256源分频发包/交换/接收参考、缓存比较和条件决策。不将阶段改成只完成codec或单一目的节点。最终判定以`reports/phase1-audit.json`和本表所列具体证据共同为准，不能仅看某一个PASS字段。

## 逐项证据

| 原始要求 | 证据与验证范围 |
|---|---|
| P1-01 物理天线/双极化/源数量 | config/phase1.json；packet测试穷举2048输入身份与极化，256源互不重叠 |
| P1-01 料号、单口、GT路径、片内RAM | input-and-hardware-contract中的资料/TBD表：旧项目料号、CMAC数量、QSFP/PCIe lane摘要；精确GT/时钟对应列为RX-01后续入口，未伪造已实测 |
| P1-01 DDR/ECC/MIG线索 | 同一表明确72bit与64+8ECC的静态依据、200MHz参考与兼容器件；速率/容量/效率为null，MEM-01测量入口；没有把颗粒额定速率当板上性能 |
| P1-01 ADC/DDC/PFB/保留bin/科学带宽 | ideal200、mapped320、ideal500三个独立基准；320MS/s FFT4096保留2560bin的200MHz映射，参考ADC/谱推进精确整数关系 |
| P1-01 前端/全阵列/分片守恒与吞吐 | packet.test.mjs覆盖全部场景；source×256=全频率分片；输入契约给PFB、FFT、lane、组包及网络预算，旧I/Q16固件与新I/Q8契约分开 |
| P1-02 源/天线/极化及频率目的映射 | packet.mjs inputIdentity/routes、generate-routes.mjs、phase1-routes.json；完整保留bin覆盖数组，首/末不足组逐字节向量，逻辑地址不伪装物理MAC/IP |
| P1-02 包头全部字段与布局 | AFP1 v1文档64B逐字段表，packet.mjs encode/decode/validate；I/Q二补码、小端、多维顺序、首谱/ADC tick关系 |
| P1-02 epoch/config与错误/回绕 | 文档规定块边界切换、旧窗终结、禁止u64溢出后继续；codec大于2^53和溢出负向测试；receive-ring实测切换清槽与新session，generation取模回绕不混窗 |
| P1-02 不遗漏/重复/错误极化与MTU | 全输入/全bin覆盖；1536个生产布局包的每个分量真值；独立固定hex向量；各配置各频率组包长与MTU断言；坏版本/长度/路由/目的地/session/时间拒绝 |
| P1-03 源组包等待/有限缓存/100G | batch与stream两模型按块ready、三bank、有限待发字节与每包序列化；二bank与有限源队列失败对照，队列/装配峰值有记录 |
| P1-03 四类调度 | 21条32块矩阵含同序、旋转、相位错开、paced；100µs/1000µs等hash轨迹；队列、带宽、pps、源间差、传播/服务假设均记录 |
| P1-03 抽象交换而非虚构设备 | 有界每输出512KiB、100G、无阻塞fabric、输出前注入包延迟；语义文档与决策报告明确不代表真实交换机或任意抖动分布 |
| P1-03 小规模独立真值→256源 | transport独立列表调度oracle；stream逐包与batch比较；完整256源全部目的地512块×2seed，各目的地排队窗口漂移/丢包检查 |
| P1-03 不能用无限队列隐藏超载 | T=1/64KiB交换FIFO对照丢包；source有限队列/二bank对照；原始/科学字节及生成-拒收-交付守恒；50Gb/s下游对照缺失 |
| P1-04 时间/频率/generation/source mask | 每逻辑目的地独立ReceiveRing；epoch/config/block键，block mod depth且保留generation；source集合/bitmap、有效数和固定计划块 |
| P1-04 到齐/截止/重复/迟到/超前/满窗 | transport负向测试覆盖deadline相等、缺失/全丢、重复、ahead、window_full、旧包、session、非法source、下游pause；40seed故障轨迹与独立分组过滤oracle |
| P1-04 服务释放与槽深 | 100Gb/s科学服务、每8块暂停20µs；槽保持到服务完成，不先搬到无限输出队列；32块深度扫描与512块固定深度联合验证，元数据历史不当作FPGA空间 |
| P1-04 全目的节点一致性 | onDelivered为每个节点驱动独立ring，末组按真实频率数缩放服务；在线/离线逐目的地回放小规模一致；最终JSON逐节点记录输出数、完整bitmap、守恒、最大槽数与时延 |
| P1-04 无意外丢失且异常可追溯 | finalize逐行检查网络生成=交付、逐目的地arrived=accepted=consumed=512×256、rejected/missing/resident=0、各输出完整；负向场景不要求零丢失，而验证拒收原因与计数 |
| P1-05 三种缓存架构 | phase1-buffer-comparison.*含raw、arrival、两槽+DDR的12档容量/带宽/条件；hybrid明确ddr_verified=false，不以未实施DDR路径充当已通过的仿真 |
| P1-05 到包线性累加真值 | ArrivalBeam宽位整数复乘加，频率相关I/Q16权重；独立raw输入总和比较，乱序/重复/缺失源mask和有效权重功率，epoch/系数切换不串贡献 |
| P1-05 非线性检查与数据链路 | 中间饱和顺序反例，要求最后统一舍入；AFP1编码→网络→解码/目的校验→有界加和槽，独立raw参考一致；不将小规模数学测试说成已综合吞吐 |
| P1-05 分项存储与未知条件 | 数据区、96B/槽bitmap/标签、系数双份、256KiB FIFO、1MiB工作预留、三bank源装配分别列出；85%原始RAM为规划上限，非实际bank布局 |
| P1-05 DDR带宽与访问形态 | write+read=两倍科学字节率，22.4/12.8GB/s等；64bit/ECC及效率假设分开；大块突发+片内转置，刷新/仲裁/尾延迟留给MEM-01；容量不修补吞吐 |
| P1-05 推荐与淘汰理由 | 74节点raw内存超预算，降低每片频带至128节点保留全部天线和200MHz；arrival省空间但系数/算术受限；DDR不作主基准依赖，长科学触发ring另列 |
| P1-06 200MHz包/调度/槽/错误选择 | phase1-decision.zh-CN.md选择candidate128/mapped128与对应T/depth/deadline；AFP1+source pacing，明确拒收/缺失、有效掩码与固定时间窗 |
| P1-06 每片与全阵列/500MHz扩展 | 51.2Gb/s科学流、1.5625MHz/片、128节点；500MHz采用12bin/342节点，约48Gb/s/片；以模型资源条件与原74下限对比，不当作算法或采购结果 |
| P1-06 瓶颈与后续验证入口 | FE-01/RX-01至04/MEM-01/ALG-01/NET-01分别处理RFSoC、解析/pps、ring银行/CDC、服务、DDR、算法与交换机；UTC/MTS/NCO/群延迟/精度均有入口 |
| P1-06 命令/配置/种子/版本/结果 | run-phase1.mjs单命令测试和全部模型；finalize-phase1.mjs核对与生成决策；TAP、test_hashes、sustained模型/config hash、audit报告hash与基线git SHA |

## 六个阶段完成门槛

1. 输入/时间/频率/配置/包格式均为v1契约，旧固件与新协议明确区分。
2. 一个命令运行测试、预算、256源全网络/全接收、缓存比较；小规模独立真值不依赖绿灯自述。
3. 推荐200MHz配置在所声明512块、双seed、hash延迟和服务停顿条件内，各目的地无意外丢失，排队漂移未超过预设阈值。
4. 故障行为不串窗、不重复贡献，记账守恒，固定时间窗可过期释放。
5. 有限槽容量、带宽与释放期限明确；DDR条件和物理实现未知项未隐藏。
6. 决策报告能直接导出下一阶段RTL与测量任务；不将离线完成扩张为实际板级能力通过。

## 结论的范围

本表不宣称任意对抗性抖动下的数学稳定性、无限运行证明、全FPGA可布线或真实RFSoC/交换机/DDR通过。本阶段目标是参数明确、可复现且经独立参考检查的离线架构和接收契约；以上后续项是原目标明示的阶段边界，不能以其未实测为由伪造PASS，也不要求本阶段越界操作硬件。
