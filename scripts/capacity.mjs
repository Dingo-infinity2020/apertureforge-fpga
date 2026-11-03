import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Analytical planning model. No RTL synthesis, timing, Ethernet or DDR measurement.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.resolve(process.argv[2] ?? path.join(root, 'config/scenarios.json'));
const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const positive = (v, name) => {
  if (!Number.isFinite(v) || v <= 0) throw new Error(`${name} must be positive`);
};
for (const k of ['antennas', 'polarizations', 'adc_inputs_per_rfsoc', 'bits_per_i_or_q',
  'channel_count', 'sample_rate_factor', 'science_payload_efficiency', 'clock_mhz_assumed',
  'dsp_fraction_assumed', 'dsp_per_complex_multiply_assumed', 'image_integration_ms',
  'image_product_bits', 'weight_bits_per_i_or_q', 'beam_voltage_bits_per_i_or_q',
  'ddr_science_data_bits_with_ecc', 'ddr_efficiency_assumed']) positive(c[k], k);
if (![1, 2].includes(c.polarizations)) throw new Error('Model supports one or two polarizations');
for (const k of ['antennas', 'adc_inputs_per_rfsoc', 'channel_count', 'bits_per_i_or_q']) {
  if (!Number.isInteger(c[k])) throw new Error(`${k} must be an integer`);
}
for (const k of ['science_payload_efficiency', 'dsp_fraction_assumed', 'ddr_efficiency_assumed']) {
  if (c[k] > 1) throw new Error(`${k} must not exceed one`);
}
if (c.sample_rate_factor < 1) throw new Error('sample_rate_factor must be >= 1');
if (c.image_products !== (c.polarizations === 2 ? 4 : 1)) {
  throw new Error('Use four coherency/Stokes products for dual pol or one power product for single pol');
}
for (const a of ['bandwidths_mhz', 'beam_counts', 'reorder_windows_us', 'ddr_rates_mtps_hypothetical']) {
  if (!Array.isArray(c[a]) || !c[a].length) throw new Error(`${a} must be a nonempty array`);
  for (const v of c[a]) positive(v, a);
}
for (const b of c.profiles) { positive(b.dsp, 'dsp'); positive(b.ports_100g, 'ports_100g'); }
for (const i of c.imagers) {
  if (!Number.isInteger(Math.log2(i.grid_side))) throw new Error('Grid side must be a power of two');
  if (!Number.isInteger(i.kernel_points) || i.kernel_points < 0) throw new Error('Invalid kernel_points');
}

const N = c.antennas, P = c.polarizations, C = c.channel_count;
const alpha = c.sample_rate_factor, q = 2 * c.bits_per_i_or_q;
const dspRate = b => b.dsp * c.dsp_fraction_assumed * c.clock_mhz_assumed * 1e6;
const cmulRate = b => dspRate(b) / c.dsp_per_complex_multiply_assumed;
const channelsFit = (capacity, perChannel) => Math.floor(capacity / perChannel + 1e-10);
const cardsForChannels = n => n > 0 ? Math.ceil(C / n) : null;
const f = (n, d = 3) => Number(n.toFixed(d));
const rows = c.bandwidths_mhz.map(mhz => {
  const B = mhz * 1e6, fsChannel = alpha * B / C;
  const input = N * P * q * alpha * B;
  const channelInput = input / C;
  const frontRate = c.adc_inputs_per_rfsoc * q * alpha * B;
  const profiles = c.profiles.map(b => {
    const scienceCapacity = b.ports_100g * 100e9 * c.science_payload_efficiency;
    const networkChannels = Math.min(C, channelsFit(scienceCapacity, channelInput));
    const continuousNetworkCards = Math.ceil(input / scienceCapacity);
    const bf = c.beam_counts.map(beams => {
      const totalCmac = N * P * beams * alpha * B;
      const computeChannels = channelsFit(cmulRate(b), totalCmac / C);
      const acceptedChannels = Math.min(networkChannels, computeChannels);
      return { beams, total_cmac_s: totalCmac,
        continuous_dsp_model_cards: Math.ceil(totalCmac / cmulRate(b)),
        channels_per_card_model: acceptedChannels,
        network_and_dsp_model_cards: cardsForChannels(acceptedChannels),
        voltage_output_bps_total: beams * P * 2 * c.beam_voltage_bits_per_i_or_q * alpha * B,
        coefficient_bytes_single_bank_per_full_card: N * P * beams * acceptedChannels * 2 * c.weight_bits_per_i_or_q / 8 };
    });
    const imaging = c.imagers.map(i => {
      const G = i.grid_side ** 2;
      const butterflies = P * alpha * B * G * Math.log2(G) / 2;
      const calibration = N * P * alpha * B;
      const gridding = calibration * i.kernel_points;
      // One generic complex multiplier per butterfly; diagonal calibration separate.
      // Two-pol XX,YY,Re(XY*),Im(XY*) use eight real multiplications per pixel.
      const productRealMults = (P === 2 ? 8 : 2) * G * alpha * B;
      const dspOps = (butterflies + calibration + gridding) * c.dsp_per_complex_multiply_assumed + productRealMults;
      const computeChannels = channelsFit(dspRate(b), dspOps / C);
      const acceptedChannels = Math.min(networkChannels, computeChannels);
      return { id: i.id, note: i.note, grid_points: G,
        butterflies_s_total: butterflies, generic_complex_multiplies_s_total: butterflies + calibration + gridding,
        real_product_multiplications_s_total: productRealMults,
        continuous_dsp_placeholder_cards: Math.ceil(dspOps / dspRate(b)),
        channels_per_card_placeholder: acceptedChannels,
        network_and_dsp_placeholder_cards: cardsForChannels(acceptedChannels),
        output_bps_total: C * G * c.image_products * c.image_product_bits / (c.image_integration_ms / 1e3) };
    });
    return { ...b, science_capacity_bps: scienceCapacity,
      continuous_network_min_cards: continuousNetworkCards,
      integer_channel_network_min_cards: cardsForChannels(networkChannels),
      channels_per_card_network: networkChannels,
      bandwidth_mhz_per_full_card_network: networkChannels * B / C / 1e6,
      generic_cmac_s_assumed: cmulRate(b),
      reorder: c.reorder_windows_us.map(us => ({ window_us: us,
        single_copy_bytes_at_capacity: scienceCapacity / 8 * us / 1e6 })),
      ddr_write_plus_read_bytes_s_at_capacity: 2 * scienceCapacity / 8,
      beamforming: bf, imaging };
  });
  return { bandwidth_mhz: mhz, complex_spectrum_rate_per_channel_s: fsChannel,
    spectrum_period_us: 1e6 / fsChannel, channel_width_khz: B / C / 1e3,
    input_science_bps: input, science_bps_per_frequency_channel: channelInput,
    rfsoc_count: Math.ceil(N * P / c.adc_inputs_per_rfsoc), rfsoc_science_bps_each: frontRate,
    rfsoc_100g_ports_each_at_assumed_efficiency: Math.ceil(frontRate / (100e9 * c.science_payload_efficiency)), profiles };
});

const report = { evidence: 'ANALYTICAL_ONLY_NOT_SYNTHESIZED', config: c,
  limitations: ['All profiles require implemented timing, packet and output checks',
    'Generic DSP model omits LUT, FF, RAM ports, buffers, additions, CDC, routing, DDR and output constraints',
    'Generic FFT placeholder does not exploit trivial twiddles, pruning, low-bit packing or calibration folding',
    'Channel assignment can span ingress ports; whole equal-width channels are assigned per board',
    'No redundancy, spare boards, power, cooling, switch sizing or measured performance included'],
  ddr_hypotheses: c.ddr_rates_mtps_hypothetical.map(rate => ({ mtps: rate,
    raw_science_data_bytes_s: rate * 1e6 * c.ddr_science_data_bits_with_ecc / 8,
    assumed_effective_science_data_bytes_s: rate * 1e6 * c.ddr_science_data_bits_with_ecc / 8 * c.ddr_efficiency_assumed })),
  scenarios: rows };

const md = ['# ApertureForge 解析容量表', '',
  '自动生成；ANALYTICAL ONLY。没有执行 Vivado 综合/实现或硬件实测。', '',
  `N=${N}，P=${P}，I/Q 各 ${q/2} bit，C=${C}，采样倍率=${alpha}，科学载荷效率=${c.science_payload_efficiency}。`,
  `算术占位模型：${c.clock_mhz_assumed} MHz、${c.dsp_fraction_assumed*100}% DSP、每通用复乘 ${c.dsp_per_complex_multiply_assumed} DSP。它不是算法资源下界或器件性能保证。`, '',
  '## 入口网络下限', '', '| 带宽 MHz | 总科学数据 Tb/s | RFSoC 每台 Gb/s | 配置 | 连续带宽下限/片 | 整信道下限/片 | 每满载片信道数 | 每片带宽 MHz |',
  '|---:|---:|---:|---|---:|---:|---:|---:|'];
for (const r of rows) for (const b of r.profiles) md.push(`| ${r.bandwidth_mhz} | ${f(r.input_science_bps/1e12)} | ${f(r.rfsoc_science_bps_each/1e9)} | ${b.id} | ${b.continuous_network_min_cards} | ${b.integer_channel_network_min_cards ?? '不容纳一个信道'} | ${b.channels_per_card_network} | ${f(b.bandwidth_mhz_per_full_card_network)} |`);
for (const r of rows) {
  md.push('', `## ${r.bandwidth_mhz} MHz 波束合成占位模型`, '',
    '| 配置 | 波束数 | 全系统 Tcomplex-MAC/s | 仅 DSP 连续估计/片 | 网络+DSP+整信道估计/片 |', '|---|---:|---:|---:|---:|');
  for (const b of r.profiles) for (const v of b.beamforming) md.push(`| ${b.id} | ${v.beams} | ${f(v.total_cmac_s/1e12)} | ${v.continuous_dsp_model_cards} | ${v.network_and_dsp_model_cards ?? '需进一步拆分'} |`);
  md.push('', `## ${r.bandwidth_mhz} MHz 成像通用算术占位模型`, '',
    '仅用于发现应优先综合的瓶颈；通用蝶形可能高估乘法，忽略其他资源又可能低估系统。不能作为采购数量。', '',
    '| 配置 | 算法 | Tbutterflies/s | 网络+DSP+整信道占位/片 | 全系统输出 Tb/s |', '|---|---|---:|---:|---:|');
  for (const b of r.profiles) for (const v of b.imaging) md.push(`| ${b.id} | ${v.id} | ${f(v.butterflies_s_total/1e12)} | ${v.network_and_dsp_placeholder_cards ?? '需跨板拆分单信道'} | ${f(v.output_bps_total/1e12)} |`);
}
md.push('', '## 重排缓存与 DDR', '', '| 配置 | 窗口 µs | 单份科学数据 MB（十进制） |', '|---|---:|---:|');
for (const b of rows[0].profiles) for (const v of b.reorder) md.push(`| ${b.id} | ${v.window_us} | ${f(v.single_copy_bytes_at_capacity/1e6)} |`);
md.push('', '缓存按端口科学载荷容量计算；双缓冲、标签、有效位、对齐和 ECC 需另加。持续全量落 DDR 再读，科学数据读写之和是入口字节速率的两倍。', '',
  '## 接口档位的证据状态', '');
for (const b of c.profiles) md.push(`- ${b.id}: ${b.status}`);
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/capacity.json'), JSON.stringify(report, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'reports/capacity.md'), md.join('\n') + '\n');
console.log(JSON.stringify({ evidence: report.evidence, outputs: ['reports/capacity.json', 'reports/capacity.md'],
  input_tbps: rows.map(r => ({ mhz: r.bandwidth_mhz, tbps: r.input_science_bps/1e12 })),
  baseline_network_cards: rows.map(r => ({ mhz: r.bandwidth_mhz, cards: r.profiles[0].integer_channel_network_min_cards })) }, null, 2));
