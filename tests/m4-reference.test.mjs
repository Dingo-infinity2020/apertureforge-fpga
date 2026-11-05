import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cx, cadd, cmul, directBeam, directDft1d, directDft2d,
  stokesFromPol, epicGrid, boxKernel, integrateProducts, quantize, satSigned,
} from '../models/m4-science-reference.mjs';

const near = (a, b, eps = 1e-10) => Math.abs(a - b) <= eps;

test('direct DFT of an impulse is flat', () => {
  const n = 8;
  const input = Array.from({ length: n }, (_, i) => (i === 0 ? cx(1, 0) : cx()));
  const out = directDft1d(input);
  for (const value of out) {
    assert.ok(near(value[0], 1));
    assert.ok(near(value[1], 0));
  }
});

test('direct 2D DFT of a corner impulse is flat', () => {
  const grid = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => cx()));
  grid[0][0] = cx(1, 0);
  const out = directDft2d(grid);
  for (const row of out) for (const value of row) {
    assert.ok(near(value[0], 1));
    assert.ok(near(value[1], 0));
  }
});

test('direct beam sums in-phase inputs and respects missing mask', () => {
  const inputs = Array.from({ length: 8 }, () => cx(1, 0));
  const weights = [Array.from({ length: 8 }, () => cx(1, 0))];
  assert.deepEqual(directBeam(inputs, weights)[0], cx(8, 0));
  const mask = [1, 1, 1, 0, 0, 0, 0, 0];
  assert.deepEqual(directBeam(inputs, weights, mask)[0], cx(3, 0));
});

test('complex Stokes sign convention for circular polarization', () => {
  const s = 1 / Math.sqrt(2);
  const x = [[cx(s, 0)]];
  const yPlus = [[cx(0, s)]];
  const yMinus = [[cx(0, -s)]];
  const plus = stokesFromPol(x, yPlus);
  const minus = stokesFromPol(x, yMinus);
  assert.ok(near(plus.I[0][0], 1));
  assert.ok(near(plus.V[0][0], 1));
  assert.ok(near(minus.I[0][0], 1));
  assert.ok(near(minus.V[0][0], -1));
});

test('EPIC box gridding preserves a constant total', () => {
  const points = [{ gx: 2, gy: 2, value: cx(1, 0) }];
  const grid = epicGrid(points, 8, boxKernel(3));
  let total = cx();
  for (const row of grid) for (const value of row) total = cadd(total, value);
  assert.ok(near(total[0], 1));
  assert.ok(near(total[1], 0));
});

test('integration and fixed-point helpers are exact for simple inputs', () => {
  const products = (spectrum, r, c) => spectrum[r][c][0];
  const spectra = [
    [[cx(1, 0)]],
    [[cx(2, 0)]],
    [[cx(3, 0)]],
  ];
  assert.deepEqual(integrateProducts(products, spectra), [[6]]);
  assert.equal(quantize(0.5, 4), 8);
  assert.equal(satSigned(200, 8), 127);
  assert.equal(satSigned(-200, 8), -128);
});
