import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {routes} from '../models/packet.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const c=JSON.parse(fs.readFileSync(root+'config/phase1.json','utf8'));
const result={version:1,source_count:c.antennas*c.polarizations/c.inputs_per_source,
 scenarios:c.scenarios.map(s=>({id:s.id,fft_bin_convention:'fftshift ascending RF',
  bin_width_hz:s.complex_hz/s.fft_size,
  science_hz:s.retained_bins*s.complex_hz/s.fft_size,
  first_rf_bin_center_hz:s.rf_center_hz+(s.retained_shifted_bin_start-s.fft_size/2)*s.complex_hz/s.fft_size,
  routes:routes(s)}))};
fs.writeFileSync(root+'reports/phase1-routes.json',JSON.stringify(result,null,2)+'\n');
console.log(result.scenarios.map(s=>({scenario:s.id,destinations:s.routes.length,last:s.routes.at(-1)})));
