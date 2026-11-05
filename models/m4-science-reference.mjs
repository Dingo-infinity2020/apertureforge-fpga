export const cx = (re = 0, im = 0) => [re, im];
export const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const cconj = a => [a[0], -a[1]];
export const cscale = (a, s) => [a[0] * s, a[1] * s];
export const cabs2 = a => a[0] * a[0] + a[1] * a[1];
export const cexp = theta => [Math.cos(theta), Math.sin(theta)];

export function directBeam(inputs, weights, mask = null) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw Error('inputs required');
  if (!Array.isArray(weights)) throw Error('weights required');
  return weights.map(w => {
    if (w.length !== inputs.length) throw Error('weight/input length mismatch');
    let sum = cx();
    for (let i = 0; i < inputs.length; i++) {
      if (mask && !mask[i]) continue;
      const term = cmul(w[i], inputs[i]);
      sum = cadd(sum, term);
    }
    return sum;
  });
}

export function directDft1d(values, sign = -1) {
  const n = values.length;
  const out = new Array(n);
  for (let k = 0; k < n; k++) {
    let sum = cx();
    for (let i = 0; i < n; i++) {
      sum = cadd(sum, cmul(values[i], cexp(sign * 2 * Math.PI * i * k / n)));
    }
    out[k] = sum;
  }
  return out;
}

export function directDft2d(grid, sign = -1) {
  const rows = grid.length;
  if (!rows) throw Error('grid required');
  const cols = grid[0].length;
  const out = Array.from({ length: rows }, () => new Array(cols));
  for (let ky = 0; ky < rows; ky++) {
    for (let kx = 0; kx < cols; kx++) {
      let sum = cx();
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const theta = sign * 2 * Math.PI * ((x * kx / cols) + (y * ky / rows));
          sum = cadd(sum, cmul(grid[y][x], cexp(theta)));
        }
      }
      out[ky][kx] = sum;
    }
  }
  return out;
}

export function stokesFromPol(x, y) {
  const rows = x.length;
  const cols = x[0].length;
  const out = {
    I: Array.from({ length: rows }, () => new Array(cols)),
    Q: Array.from({ length: rows }, () => new Array(cols)),
    U: Array.from({ length: rows }, () => new Array(cols)),
    V: Array.from({ length: rows }, () => new Array(cols)),
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const xx = cmul(x[r][c], cconj(x[r][c]));
      const yy = cmul(y[r][c], cconj(y[r][c]));
      const xy = cmul(x[r][c], cconj(y[r][c]));
      out.I[r][c] = xx[0] + yy[0];
      out.Q[r][c] = xx[0] - yy[0];
      out.U[r][c] = 2 * xy[0];
      out.V[r][c] = -2 * xy[1];
    }
  }
  return out;
}

export function boxKernel(size = 3) {
  if (!(size > 0 && size % 2 === 1)) throw Error('odd kernel size required');
  return Array.from({ length: size }, () => new Array(size).fill(1 / (size * size)));
}

export function epicGrid(points, gridSize, kernel = boxKernel(3)) {
  const half = (kernel.length - 1) / 2;
  const grid = Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => cx()));
  for (const point of points) {
    const { gx, gy, value } = point;
    for (let ky = 0; ky < kernel.length; ky++) {
      for (let kx = 0; kx < kernel.length; kx++) {
        const x = gx + kx - half;
        const y = gy + ky - half;
        if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) continue;
        grid[y][x] = cadd(grid[y][x], cscale(value, kernel[ky][kx]));
      }
    }
  }
  return grid;
}

export function epicImage(points, gridSize, kernel = boxKernel(3), sign = -1) {
  return directDft2d(epicGrid(points, gridSize, kernel), sign);
}

export function integrateProducts(products, spectra) {
  if (!Array.isArray(spectra) || spectra.length === 0) throw Error('spectra required');
  const rows = spectra[0].length;
  const cols = spectra[0][0].length;
  const out = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (const spectrum of spectra) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) out[r][c] += products(spectrum, r, c);
    }
  }
  return out;
}

export function quantize(value, fractionBits) {
  return Math.round(value * 2 ** fractionBits);
}

export function dequantize(value, fractionBits) {
  return value / 2 ** fractionBits;
}

export function satSigned(value, bits) {
  const lo = -(2 ** (bits - 1));
  const hi = 2 ** (bits - 1) - 1;
  return Math.max(lo, Math.min(hi, value));
}
