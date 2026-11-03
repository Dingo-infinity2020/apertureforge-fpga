# P1-02 AFP1 数据包契约 v1

2026-11-03。用于ApertureForge离线参考和后续RTL接口设计；**不是当前RFSoC固件已使用的协议**。无IP分片，IPv4/UDP、IP MTU 9000，无VLAN；物理地址与UDP端口由部署控制面分配，路由文件只给出逻辑destination ID，不虚构MAC/IP。

## 64字节应用头

多字节整数均小端；u64由BigInt处理，禁止转换成JS Number。应用头后紧接科学数据；多余尾部填充不属于AFP1，解析层须先根据IP/UDP长度去除以太网填充。

| 字节偏移 | 类型 | 字段 |
|---:|---|---|
| 0 | 4字节ASCII | AFP1 |
| 4 | u8 | version=1 |
| 5 | u8 | header_bytes=64 |
| 6 | u16 | flags=1，整个包科学数据有效；其他值拒绝 |
| 8 | u32 | epoch |
| 12 | u32 | config_id |
| 16 | u16 | source_id，0..255 |
| 18 | u16 | destination_id |
| 20 | u32 | first_frequency，保留通带内逻辑索引 |
| 24 | u16 | frequency_count |
| 26 | u16 | spectrum_count=T |
| 28 | u64 | first_spectrum，epoch内绝对谱序号 |
| 36 | u64 | first_adc_sample，名义PFB窗口起始采样计数 |
| 44 | u8 | format=1，signed I8/Q8 |
| 45 | u8 | local_input_count=8 |
| 46 | 6字节 | reserved=0 |
| 52 | u32 | science_payload_bytes |
| 56 | u64 | sequence，每source/destination独立，等于first_spectrum/T |

`first_spectrum mod T=0`。第一阶段不支持包内部分输入有效；若一个包无效，整体拒收，接收器在截止时记录对应源缺失。细粒度输入失效应由另一个版本/配置契约引入，不能偷偷改变flags含义。链路CRC/MAC错误由接收shell拦截并计数；应用头无额外CRC，不宣称能检出所有静默位翻转。

## 科学数据与路由

顺序为`time → frequency → local_input → I,Q`，每个分量为有符号8bit、二补码。分量I字节偏移为`2×((t×frequency_count+f)×8+local_input)`，Q紧随。source/local转换见输入契约。

路由按连续保留bin均分，末节点允许不足整组；生成器`node scripts/generate-routes.mjs`输出`reports/phase1-routes.json`。示例ideal200前73组56bin、末组8bin；mapped320前73组35bin、末组5bin。每个源使用同一分频路由，禁止将整带复制给每个目的地。

一包科学数据字节数必须等于`T×frequency_count×8×2`，UDP应用长度必须等于64加科学字节；IP长度不得超过MTU。首谱时间标签按输入契约映射，任何头/路由/长度/源号/时间映射不符都拒收，不允许“尽可能解析”后继续贡献科学数据。

## 配置、时间与错误处理

控制面先发布不可变配置（版本、采样率、ADC计数参考、FFT长度/推进、保留bin、source映射、T、路由、有效起点、群延迟信息），再在所有源共同的包块边界切换epoch/config。接收器必须明确终结旧epoch未完成窗口并记录缺失后激活新session；旧包拒收，新配置未安装的超前包也拒收。不同session不共享累加状态。

同epoch配置不许原地修改。u64谱号/采样计数/sequence到上限前结束epoch，v1不使用模数回绕继续计算；u32 epoch/config ID重复使用前须重新建立不混淆session的控制契约。本阶段ring取模地址回绕与协议计数器溢出是不同事件。

语法解析由`decode`完成；活动配置验证由`validate`完成；到齐、重复、迟到、超前、窗口满和下游反压由P1-04有界时间槽状态机完成，不能将编解码测试当作这些状态行为已经实现。

## 可复现验证

```powershell
node scripts/generate-routes.mjs
node --test tests/packet.test.mjs
```

包含独立字面十六进制向量`vectors/packet-v1.json`（诊断尺寸，不是生产session）、256源首/末频率组的逐字节I/Q检查、全通带路由覆盖与数据率守恒、超2^53时间标签，以及错误版本/保留位/长度/路由/时间/session的负向测试。固定向量与运行时生产包明确分离。
