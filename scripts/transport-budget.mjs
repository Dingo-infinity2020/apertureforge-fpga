import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Packet arithmetic only. No packet queue simulation, RFSoC or Ethernet measurement.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c = JSON.parse(fs.readFileSync(path.join(root, 'config/scenarios.json'), 'utf8'));
const capacity = JSON.parse(fs.readFileSync(path.join(root, 'reports/capacity.json'), 'utf8'));
if (JSON.stringify(c) !== JSON.stringify(capacity.config)) {
  throw new Error('Capacity report is stale; run node scripts/capacity.mjs first');
}
const sources = c.antennas * c.polarizations / c.adc_inputs_per_rfsoc;
if (!Number.isInteger(sources)) throw new Error('This layout requires full RFSoC source groups');
const a = { profile_id: 'ku5p_1x100', source_line_bps: 100e9, receiver_line_bps: 100e9,
  local_inputs: c.adc_inputs_per_rfsoc, science_bytes_per_complex: 2*c.bits_per_i_or_q/8,
  application_header_bytes: 64, ethernet_header_bytes: 14, ipv4_header_bytes: 20,
  udp_header_bytes: 8, fcs_bytes: 4, preamble_sfd_bytes: 8, interpacket_gap_bytes: 12,
  ip_mtu: 9000, vlan_bytes: 0, spectra_per_packet: [1,2,4,8],
  differential_window_us_example: 100, guard_blocks_example: 2 };
const overhead = a.application_header_bytes + a.ethernet_header_bytes + a.ipv4_header_bytes +
  a.udp_header_bytes + a.fcs_bytes + a.preamble_sfd_bytes + a.interpacket_gap_bytes + a.vlan_bytes;
const rows = capacity.scenarios.map(s => {
  const p = s.profiles.find(x => x.id === a.profile_id);
  if (!p || p.channels_per_card_network < 1) throw new Error('No complete frequency channel fits');
  const groups = [];
  for (let left=c.channel_count; left>0;) {
    const width = Math.min(left, p.channels_per_card_network);
    groups.push(width); left -= width;
  }
  const fsChannel = s.complex_spectrum_rate_per_channel_s;
  const modes = a.spectra_per_packet.map(T => {
    const blocksPerSecond = fsChannel/T;
    const sciencePerPacket = groups.map(L => a.local_inputs*L*T*a.science_bytes_per_complex);
    const maxScience = Math.max(...sciencePerPacket);
    const sourceSciencePerBlock = sciencePerPacket.reduce((n,x)=>n+x,0);
    const sourceWirePerBlock = sourceSciencePerBlock + groups.length*overhead;
    const sourceWire = sourceWirePerBlock*blocksPerSecond*8;
    const hotScience = maxScience*sources*blocksPerSecond*8;
    const hotWire = (maxScience+overhead)*sources*blocksPerSecond*8;
    const blockPeriodUs = 1e6/blocksPerSecond;
    const ringSlots = Math.ceil(a.differential_window_us_example/blockPeriodUs)+a.guard_blocks_example;
    const ipBytes = a.ipv4_header_bytes+a.udp_header_bytes+a.application_header_bytes+maxScience;
    const sourcePackets = groups.length*blocksPerSecond;
    const destinationPackets = sources*blocksPerSecond;
    if (Math.abs(sourceSciencePerBlock*blocksPerSecond*8-s.rfsoc_science_bps_each)>1) {
      throw new Error('Science conservation failed');
    }
    if (Math.abs(sourceWire-s.rfsoc_science_bps_each-sourcePackets*overhead*8)>1) {
      throw new Error('Wire accounting failed');
    }
    return { spectra_per_packet:T, destination_count:groups.length,
      full_destination_channels:p.channels_per_card_network, last_destination_channels:groups.at(-1),
      full_packet_science_bytes:maxScience, full_packet_ip_bytes:ipBytes,
      block_period_us:blockPeriodUs, source_packets_s:sourcePackets,
      receiver_packets_s_full_destination:destinationPackets,
      source_science_bps:s.rfsoc_science_bps_each, source_wire_bps:sourceWire,
      full_receiver_science_bps:hotScience, full_receiver_wire_bps:hotWire,
      no_fragmentation_mtu_fit:ipBytes<=a.ip_mtu,
      source_line_fit:sourceWire<=a.source_line_bps,
      receiver_line_fit:hotWire<=a.receiver_line_bps,
      average_line_and_mtu_fit:sourceWire<=a.source_line_bps && hotWire<=a.receiver_line_bps && ipBytes<=a.ip_mtu,
      source_double_assembly_science_bytes:2*sourceSciencePerBlock,
      raw_ring_example_slots:ringSlots, raw_ring_example_science_bytes:ringSlots*maxScience*sources,
      raw_ring_example_source_bitmap_bytes:ringSlots*Math.ceil(sources/8),
      continuous_raw_window_bytes:hotScience/8*a.differential_window_us_example/1e6,
      one_synchronized_destination_burst_bytes:sources*(maxScience+overhead),
      nominal_burst_queue_bytes_if_all_arrive_together:(sources-1)*(maxScience+overhead),
      burst_serialize_us:sources*(maxScience+overhead)*8/a.receiver_line_bps*1e6 };
  });
  return { bandwidth_mhz:s.bandwidth_mhz, source_count:sources, modes };
});
const report = { evidence:'ANALYTICAL_PACKET_BUDGET_NOT_QUEUE_OR_HARDWARE_TEST', assumptions:a,
  total_overhead_bytes_per_packet:overhead,
  exclusions:['FEC/PHY are not subtracted again from the nominal Ethernet MAC rate',
    'No VLAN, IPv6, IP options, application padding or fragmentation',
    'An average-rate fit does not prove queue, CDC, packet-engine or DDR feasibility',
    'Synchronized burst queue is an idealized stress case, not a switch buffer requirement',
    'Ring slots are an illustrative differential-window budget plus two assumed guards; no proven release/service bound'],
  scenarios:rows };
const f=(x,d=3)=>Number(x.toFixed(d));
const md=['# RFSoC 分发与 KU5P 接收的包级预算','',
  '自动生成；仅解析计算，没有事件队列仿真、RFSoC 综合、真实发包或交换机实测。','',
  '每台 RFSoC 聚合其 8 路输入；每张 KU5P 接收负责频率上的全部 256 台 RFSoC。信道分片沿用平均载荷表的单口方案。',
  `每包假设 ${a.application_header_bytes} 字节应用头、IPv4/UDP、无 VLAN；含 FCS、前导和帧间隙的总额外占用为 ${overhead} 字节。IP MTU=${a.ip_mtu}。`,
  '100GbE 线占用按标称 MAC 服务速率核算，不重复扣除 PHY 编码/FEC。','',
  '| 带宽 MHz | 每源目的节点数 | 每包时刻数 | 主包科学字节 | 块周期 µs | 每 RFSoC Mpps | 每 RFSoC Gb/s | 每满载 KU5P Mpps | 每满载 KU5P Gb/s | 平均速率及 MTU |',
  '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'];
for(const s of rows) for(const m of s.modes) md.push(`| ${s.bandwidth_mhz} | ${m.destination_count} | ${m.spectra_per_packet} | ${m.full_packet_science_bytes} | ${f(m.block_period_us)} | ${f(m.source_packets_s/1e6)} | ${f(m.source_wire_bps/1e9)} | ${f(m.receiver_packets_s_full_destination/1e6)} | ${f(m.full_receiver_wire_bps/1e9)} | ${m.average_line_and_mtu_fit?'可容纳，仍需抖动/时序验证':'超载或 MTU 不容纳'} |`);
md.push('','## 200 MHz、100 µs 差分窗口的原始电压环形槽示例','',
  '按整时间块取整后另留两个 guard block；仅演示分块粒度成本，不是已证明的最小深度，未包含算法工作区和释放延迟。共同发包等待与差分乱序需分开。','',
  '| 每包时刻数 | RFSoC 双份组包数据 KiB | KU5P 槽数 | KU5P 原始电压 MiB | 同目的地同步突发序列化 µs |',
  '|---:|---:|---:|---:|---:|');
for(const m of rows[0].modes) md.push(`| ${m.spectra_per_packet} | ${f(m.source_double_assembly_science_bytes/1024)} | ${m.raw_ring_example_slots} | ${f(m.raw_ring_example_science_bytes/1048576)} | ${f(m.burst_serialize_us)} |`);
md.push('','接收环形槽按 epoch、绝对电场时刻和频率范围寻址，并保留源有效位；满/过期必须显式记账。对于线性波束合成，还需比较到包即累加，避免默认把全部原始电压写 DDR 后再读。','');
fs.writeFileSync(path.join(root,'reports/transport.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(root,'reports/transport.md'),md.join('\n'));
console.log(JSON.stringify({evidence:report.evidence, outputs:['reports/transport.json','reports/transport.md'],
  checks:'PASS: source science conservation and wire overhead accounting',
  usable_average_packet_modes:rows.map(s=>({mhz:s.bandwidth_mhz, spectra_per_packet:s.modes.filter(m=>m.average_line_and_mtu_fit).map(m=>m.spectra_per_packet)}))},null,2));
