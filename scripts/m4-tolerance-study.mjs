import {
  cx, cadd, cmul, cscale, cabs2, directDft2d, epicImage, boxKernel,
  stokesFromPol,
} from '../models/m4-science-reference.mjs';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const q8 = v => clamp(Math.round(v * 127), -128, 127) / 127;
const q16 = v => clamp(Math.round(v * 32767), -32768, 32767) / 32767;

function relL2(a, b) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) {
    const dr = a[i][0] - b[i][0];
    const di = a[i][1] - b[i][1];
    num += dr * dr + di * di;
    den += a[i][0] * a[i][0] + a[i][1] * a[i][1];
  }
  return den === 0 ? 0 : Math.sqrt(num / den);
}

function relPower(a, b) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - b[i]) ** 2;
    den += a[i] ** 2;
  }
  return den === 0 ? 0 : Math.sqrt(num / den);
}

function beamStudy() {
  const n = 1024;
  const beams = 4;
  const worst = { rms: 0, maxAmp: 0, phase: 0 };
  for (let seed = 1; seed <= 32; seed++) {
    const r = rng(seed);
    const inputs = Array.from({ length: n }, () => cx(r() * 2 - 1, r() * 2 - 1));
    const weights = Array.from({ length: beams }, () =>
      Array.from({ length: n }, () => cx(r() * 2 - 1, r() * 2 - 1)));
    const qInputs = inputs.map(v => cx(q8(v[0]), q8(v[1])));
    const qWeights = weights.map(row => row.map(v => cx(q16(v[0]), q16(v[1]))));
    const exact = weights.map(w => {
      let sum = cx();
      for (let i = 0; i < n; i++) sum = cadd(sum, cmul(w[i], inputs[i]));
      return sum;
    });
    const fixed = qWeights.map(w => {
      let sum = cx();
      for (let i = 0; i < n; i++) sum = cadd(sum, cmul(w[i], qInputs[i]));
      return sum;
    });
    worst.rms = Math.max(worst.rms, relL2(exact, fixed));
    for (let b = 0; b < beams; b++) {
      const refAmp = Math.hypot(exact[b][0], exact[b][1]);
      const fixedAmp = Math.hypot(fixed[b][0], fixed[b][1]);
      if (refAmp > 1e-12) {
        worst.maxAmp = Math.max(worst.maxAmp, Math.abs(fixedAmp - refAmp) / refAmp);
        let phase = Math.abs(Math.atan2(fixed[b][1], fixed[b][0]) - Math.atan2(exact[b][1], exact[b][0]));
        if (phase > Math.PI) phase = 2 * Math.PI - phase;
        worst.phase = Math.max(worst.phase, phase);
      }
    }
  }
  return worst;
}

function fftStudy() {
  const size = 8;
  let worstL2 = 0;
  let worstPeak = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const r = rng(seed + 100);
    const grid = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => cx(r() * 2 - 1, r() * 2 - 1)));
    const qGrid = grid.map(row => row.map(v => cx(q8(v[0]), q8(v[1]))));
    const ref = directDft2d(grid);
    const got = directDft2d(qGrid);
    const flatRef = ref.flat();
    const flatGot = got.flat();
    worstL2 = Math.max(worstL2, relL2(flatRef, flatGot));
    let refPeak = 0;
    let gotPeak = 0;
    for (let i = 1; i < flatRef.length; i++) {
      if (cabs2(flatRef[i]) > cabs2(flatRef[refPeak])) refPeak = i;
      if (cabs2(flatGot[i]) > cabs2(flatGot[gotPeak])) gotPeak = i;
    }
    if (refPeak !== gotPeak) worstPeak = 1;
  }
  return { l2: worstL2, peakMismatch: worstPeak };
}

function epicStudy() {
  const size = 16;
  let worstL2 = 0;
  for (let seed = 1; seed <= 32; seed++) {
    const r = rng(seed + 200);
    const points = Array.from({ length: 24 }, () => ({
      gx: Math.floor(r() * size),
      gy: Math.floor(r() * size),
      value: cx(r() * 2 - 1, r() * 2 - 1),
    }));
    const qPoints = points.map(p => ({
      gx: p.gx,
      gy: p.gy,
      value: cx(q8(p.value[0]), q8(p.value[1])),
    }));
    const ref = epicImage(points, size, boxKernel(3)).flat();
    const got = epicImage(qPoints, size, boxKernel(3)).flat();
    worstL2 = Math.max(worstL2, relL2(ref, got));
  }
  return { l2: worstL2 };
}

function polarizationStudy() {
  const size = 8;
  let worst = { I: 0, Q: 0, U: 0, V: 0 };
  for (let seed = 1; seed <= 32; seed++) {
    const r = rng(seed + 300);
    const x = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => cx(r() * 2 - 1, r() * 2 - 1)));
    const y = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => cx(r() * 2 - 1, r() * 2 - 1)));
    const qx = x.map(row => row.map(v => cx(q8(v[0]), q8(v[1]))));
    const qy = y.map(row => row.map(v => cx(q8(v[0]), q8(v[1]))));
    const ref = stokesFromPol(x, y);
    const got = stokesFromPol(qx, qy);
    for (const k of ['I', 'Q', 'U', 'V']) {
      const a = ref[k].flat().map(v => [v, 0]);
      const b = got[k].flat().map(v => [v, 0]);
      worst[k] = Math.max(worst[k], relL2(a, b));
    }
  }
  return worst;
}

const result = {
  date: new Date().toISOString(),
  scope: 'Independent numerical quantization study; not RTL or IP equivalence',
  beam: beamStudy(),
  fft2d: fftStudy(),
  epic: epicStudy(),
  polarization: polarizationStudy(),
  suggested_tolerances: {
    beam_voltage_relative_rms: 0.012,
    beam_peak_amplitude_relative: 0.025,
    beam_phase_rad: 0.05,
    fft2d_relative_l2: 0.008,
    fft2d_peak_position_mismatch: 0,
    epic_image_relative_l2: 0.008,
    stokes_I_relative_l2: 0.008,
    stokes_Q_relative_l2: 0.02,
    stokes_U_relative_l2: 0.015,
    stokes_V_relative_l2: 0.015,
    note: 'Candidate thresholds derived from 32-seed I/Q8 + I/Q16 independent numerical study; actual RTL/IP error must be measured separately. Thresholds are not relaxed after synthesis.',
  },
};
console.log(JSON.stringify(result, null, 2));
