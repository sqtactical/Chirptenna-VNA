import test from 'node:test';
import assert from 'node:assert/strict';
import { analizarChoke, consejoChoke, BUENO_OHM, JUSTO_OHM } from '../js/choke.js';

// medida sintética de 1 a 30 MHz con |Z| = f(MHz) en Ω, toda resistiva
const medida = fz => {
  const freq = [], zr = [], zx = [];
  for (let f = 1.5; f <= 30; f += 0.05) { freq.push(f * 1e6); zr.push(fz(f)); zx.push(0); }
  return { freq, zr, zx };
};

test('un choke bueno en todas las bandas', () => {
  const filas = analizarChoke(medida(() => 2500));
  assert.equal(filas.length, 9);
  assert.ok(filas.every(f => f.veredicto === 'bien' && !f.dudoso));
  assert.equal(consejoChoke(filas), 'bien');
});

test('corto en las bandas bajas pide más vueltas', () => {
  const filas = analizarChoke(medida(f => (f < 10 ? 200 : 2000)));
  const por = Object.fromEntries(filas.map(f => [f.nombre, f.veredicto]));
  assert.equal(por['40 m'], 'corto');
  assert.equal(por['20 m'], 'bien');
  assert.equal(consejoChoke(filas), 'faltan_vueltas');
});

test('corto en las altas pide menos capacidad', () => {
  const filas = analizarChoke(medida(f => (f > 13 ? 150 : 3000)));
  assert.equal(consejoChoke(filas), 'menos_capacidad');
});

test('los umbrales y lo dudoso', () => {
  assert.equal(analizarChoke(medida(() => JUSTO_OHM + 1))[0].veredicto, 'justo');
  assert.equal(analizarChoke(medida(() => BUENO_OHM))[0].veredicto, 'bien');
  assert.equal(analizarChoke(medida(() => 5000))[0].dudoso, true);        // más allá de lo que mide un NanoVNA
});

test('solo salen las bandas que cubre la medida', () => {
  const filas = analizarChoke({ freq: [14.0e6, 14.1e6, 14.2e6], zr: [900, 900, 900], zx: [600, 600, 600] });
  assert.deepEqual(filas.map(f => f.nombre), ['20 m']);
  assert.ok(Math.abs(filas[0].zMin - Math.hypot(900, 600)) < 1e-9);
  assert.equal(consejoChoke([]), 'sin_bandas');
});
