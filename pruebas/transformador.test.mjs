import test from 'node:test';
import assert from 'node:assert/strict';
import { analizarTransformador, consejoTransformador, cargaNominal } from '../js/transformador.js';

const medida = fz => {
  const freq = [], zr = [], zx = [];
  for (let f = 1.5; f <= 30; f += 0.05) { freq.push(f * 1e6); zr.push(fz(f)); zx.push(0); }
  return { freq, zr, zx };
};

test('50 Ω puros dan ROE 1 y todo bien', () => {
  const filas = analizarTransformador(medida(() => 50));
  assert.equal(filas.length, 9);
  assert.ok(filas.every(f => f.veredicto === 'bien' && Math.abs(f.roeMax - 1) < 1e-9));
  assert.equal(consejoTransformador(filas), 'bien');
});

test('ROE de una resistencia de 100 Ω es 2', () => {
  const filas = analizarTransformador(medida(() => 100));
  assert.ok(Math.abs(filas[0].roeMax - 2) < 1e-9 && filas[0].veredicto === 'justo');
  assert.equal(consejoTransformador(filas), 'justo');
});

test('mal en las bajas pide más vueltas y en las altas menos fugas', () => {
  assert.equal(consejoTransformador(analizarTransformador(medida(f => (f < 10 ? 20 : 50)))), 'faltan_vueltas');
  assert.equal(consejoTransformador(analizarTransformador(medida(f => (f > 13 ? 10 : 50)))), 'menos_fugas');
  assert.equal(consejoTransformador([]), 'sin_bandas');
});

test('la carga de prueba sale de la relación', () => {
  assert.equal(cargaNominal(49).ideal, 2450);
  assert.equal(cargaNominal(49).comercial, 2400);
  assert.equal(cargaNominal(9).ideal, 450);
  assert.equal(cargaNominal(64).ideal, 3200);
});
