import test from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../js/analisis.js';
import { ajustarRLC, zRLC } from '../js/ajusterlc.js';

// S11 a partir de un Z conocido
const medidaDe = (modelo, f0, n = 81, ancho = 0.2) => {
  const freq = Float64Array.from({ length: n }, (_, i) => f0 * (1 - ancho / 2 + ancho * i / (n - 1)));
  const re = new Float64Array(n), im = new Float64Array(n);
  freq.forEach((f, i) => {
    const [zr, zx] = zRLC(modelo, f), den = (zr + 50) ** 2 + zx ** 2;
    re[i] = ((zr * zr + zx * zx) - 2500) / den; im[i] = 100 * zx / den;
  });
  return calcular({ freq, re, im });
};
const rel = (a, b) => Math.abs(a / b - 1);

test('RLC serie: recupera R, L, C, f0 y Q de una resonancia sintetica', () => {
  const L = 50e-9, f0 = 433e6, C = 1 / ((2 * Math.PI * f0) ** 2 * L);
  const modelo = { tipo: 'serie', R: 12, L, C };
  const r = ajustarRLC(medidaDe(modelo, f0), f0);
  assert.equal(r.tipo, 'serie');
  assert.ok(rel(r.f0, f0) < 1e-6 && rel(r.L, L) < 1e-6 && rel(r.C, C) < 1e-6 && rel(r.R, 12) < 1e-9, JSON.stringify(r));
  assert.ok(rel(r.q, 2 * Math.PI * f0 * L / 12) < 1e-6);
  assert.ok(r.error < 1e-9);
});

test('RLC paralelo: tanque con perdidas', () => {
  const L = 200e-9, f0 = 145e6, C = 1 / ((2 * Math.PI * f0) ** 2 * L);
  const modelo = { tipo: 'paralelo', R: 4000, L, C };
  const r = ajustarRLC(medidaDe(modelo, f0, 201, 0.08), f0, { ventana: 0.03 });
  assert.equal(r.tipo, 'paralelo');
  assert.ok(rel(r.f0, f0) < 1e-4 && rel(r.R, 4000) < 0.02, JSON.stringify(r));
  assert.ok(rel(r.q, 4000 / (2 * Math.PI * f0 * L)) < 0.02);
});

test('RLC: pocos puntos o sin reactancia coherente devuelve null', () => {
  const m = medidaDe({ tipo: 'serie', R: 10, L: 50e-9, C: 2.7e-12 }, 433e6, 4, 0.2);
  assert.equal(ajustarRLC(m, 433e6), null);
});
