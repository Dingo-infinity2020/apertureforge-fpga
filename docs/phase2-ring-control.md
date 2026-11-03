# ring 事务控制接口（独立元数据模块）

`af_ring_control` 默认256源、10槽。它不接收以太网拍、不保存科学样本；控制应与 `af_ring_store` 连接后再做完整接收验收。当前使用同一个处理时钟，`now_tick` 由调用者提供，必须在session内单调、不回绕。

## 事务与写入

`cmd_valid && cmd_ready` 接受一个命令。op=0预留、1提交、2取消；其他值为格式错误。回复使用独立valid/ready握手，在反压时保持。只有 `rsp_accepted=1` 的预留才产生有效句柄：`rsp_generation/rsp_sequence/rsp_slot` 加该请求的source。reply清空是session切换的明确flush行为，切换前未消费的回复不再有效。

每次安装session递增64bit generation，即使控制面有意重复epoch/config/sequence，旧句柄也不会复活。generation达到最大值后不再接受安装，须在耗尽前重新建立控制上下文；复位必须同时清除外部在途队列，不能保留复位前句柄。

数据入口每拍都必须用句柄查询 `write_permit`，包括槽号、sequence、generation、source。pending有效、槽未封闭、标签一致且当前tick严格小于deadline时才能写。取消不清 RAM，提交只设置present位；消费时必须用输出mask屏蔽未提交源。

命令错误码：

| reason | 含义 |
|---:|---|
| 0 | 接受 |
| 1 | epoch/config/generation不匹配 |
| 2 | source/op/slot格式越界 |
| 3 | 已过去、已封闭或达到deadline |
| 4 | 超出当前槽窗或配置末块 |
| 5 | pending或present重复源 |
| 6 | 槽标签不符或没有对应pending事务 |
| 7 | 尚无活动session或已完成全部块 |

首次预留到包尾之前只能设置pending；校验尾状态通过后再发commit，坏尾发abort。**当前模块没有判断CRC的能力**，上游必须履行该合同。deadline在实际执行commit时检查，达到deadline的包尾不能加入mask；后续parser须计入处理与控制延迟，不能用较早的报头到达时间代替。

## 固定窗、消费与复用

安装参数包括首sequence、首deadline、每块period_ticks、块数，以及epoch/config。首deadline由上层按采样时钟映射预先算出；本模块不把ADC计数直接当处理时钟tick。初始化每拍一个槽，10槽要10拍，其间不接受事务。

只有当前head块可以输出。全部源已提交或达到deadline时封闭head，取消其所有pending，输出稳定的mask、count、sequence、generation和slot。空块也按固定计划输出。输出反压、消费中间停顿不改变mask，较晚块仍可在窗口内预留和提交。

描述符握手后进入消费中状态。消费者只有在所有该块读请求与结果完成后，才可发送带sequence/generation的done；当前控制模块不跟踪RAM读流水，连接时必须补这个栅栏。旧done只计入bad_done，不能释放新块。

有效done才释放槽并复用于 `旧sequence+SLOTS`。slot按当前head加有界sequence差寻址，不对完整64bit序号做一般除法。配置末块、初始化deadline以及复用后的deadline/sequence均不得静默回绕；发现溢出时停止活动并置cfg_fault。统计计数器定义为模2^64，不保证无限运行的无损累计。

同拍优先级：安装session → 消费done → head封闭 → 一个事务。事务和封闭串行，exact-deadline提交不会抢先进入mask。session切换丢弃未消费的present、取消pending、清除旧描述符和busy状态；数据RAM保持原值，generation/mask负责隔离旧数据。

## 计数与当前验证

正常无计数溢出时满足：

```text
requests = reserved + committed + aborted + rejected
reserved = committed + aborted + canceled + pending_total
committed = consumed + discarded + resident
```

完整尺寸测试实际通过541条事务、13个输出描述符，覆盖256源全到齐、缺失/空块、pending重复、abort重传、截止竞争、下游反压、槽复用、session切换及旧done。结束时259次提交=258次消费+1次切换丢弃，4个pending被取消，resident/pending归零。另一个边界测试通过4种非法配置、最大64bit sequence和高于2^63的deadline。

这不是逐帧ReceiveRing轨迹等价证明；测试tick由激励推进，不等于墙钟持续10Mpps。尚须补逐事件参考映射、连续周期吞吐、数据RAM联测、在途复位和完整接收器的竞争验证。资源和时序以真实Vivado运行报告为准，RTL仿真通过不代替综合通过。

复现：`source tcl/phase2_control.tcl` 后按 `af_control_prepare <fresh-external>`、`af_control_simulate`、`af_control_start` 执行；完成后 `af_control_collect synth_1`，再启动/收集impl_1。边界测试独立source `tcl/phase2_control_time.tcl` 并调用 `af_control_time_simulate <same-build>`。准备后、启动前用 `scripts/phase2-snapshot.mjs` 冻结源hash；已有运行不能因观察超时重启。
