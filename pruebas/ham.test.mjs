// Herramientas de radioaficionado: adaptación (red en L), coaxial y stubs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcular } from '../js/analisis.js';
import { redesL, gammaConRed, e24, roePrevista } from '../js/adaptacion.js';
import { medirLinea, largoStub, C0 } from '../js/coaxial.js';

test('e24: elige el valor normalizado más cercano', () => {
  assert.equal(e24(4.6e-12), 4.7e-12);
  assert.ok(Math.abs(e24(103e-9) - 100e-9) < 1e-15);
  assert.ok(Math.abs(e24(9.7) - 10) < 1e-9);
});

test('red en L: con valores exactos la carga queda a 50 Ω y con E24 la pérdida de retorno es buena', () => {
  const casos = [[10, 5], [25, -30], [200, 80], [500, -150], [50, 40], [8, -2], [120, 0]];
  for (const [r, x] of casos) {
    for (const f of [7.1e6, 145e6, 868e6]) {
      const redes = redesL(r, x, f);
      assert.ok(redes.length > 0, `sin soluciones para ${r}+j${x}`);
      for (const red of redes) {
        const exacta = { ...red, serie: { tipo: red.serie.tipo, valor: red.serie.ideal }, derivacion: { tipo: red.derivacion.tipo, valor: red.derivacion.ideal } };
        assert.ok(gammaConRed(exacta, f, r, x) < 1e-6, `valores ideales no adaptan ${r}+j${x} a ${f}`);
      }
      assert.ok(redes[0].rl > 14, `E24 demasiado lejos: ${redes[0].rl} dB para ${r}+j${x} a ${f}`);
    }
  }
});

test('red en L: ya adaptada (50 Ω) no sale ninguna con R mayor y la curva prevista sigue la red', () => {
  const f = 868e6, N = 5;
  const zr = new Float64Array(N).fill(20), zx = new Float64Array(N).fill(10), freq = Float64Array.from({ length: N }, (_, i) => 860e6 + i * 4e6);
  const [red] = redesL(20, 10, f);
  const roe = roePrevista(red, { freq, zr, zx });
  assert.equal(roe.length, N);
  assert.ok(roe[2] < 1.5 || freq[2] !== f);
  assert.ok(Math.min(...roe) < 2);
});

// línea de coaxial con el extremo abierto: S11 = exp(-j·2βl)·exp(-2αl)
function lineaAbierta(largo, vf, perdidaDbPorM, f0, f1, n) {
  const freq = new Float64Array(n), re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = f0 + (f1 - f0) * i / (n - 1);
    const ph = -2 * 2 * Math.PI * f * largo / (vf * C0), a = 10 ** (-2 * perdidaDbPorM * largo / 20);
    freq[i] = f; re[i] = a * Math.cos(ph); im[i] = a * Math.sin(ph);
  }
  return calcular({ freq, re, im });
}

test('coaxial: factor de velocidad y pérdida de una línea abierta', () => {
  const m = lineaAbierta(2.0, 0.66, 0.5, 10e6, 60e6, 401);
  const r = medirLinea(m, 2.0, 30e6);
  assert.ok(r.valido && !r.ambigua);
  assert.ok(Math.abs(r.vf - 0.66) < 0.01, `vf ${r.vf}`);
  assert.ok(Math.abs(r.perdidaIdaDb - 1.0) < 0.05, `pérdida ${r.perdidaIdaDb}`);
});

test('coaxial: avisa si el paso de frecuencia es demasiado grande para el largo', () => {
  const m = lineaAbierta(10, 0.66, 0.1, 1e6, 600e6, 101);
  assert.ok(medirLinea(m, 10, 100e6).ambigua);
});

import { quitarCable, perdidaIdaDb } from '../js/cable.js';
import { analizarResonador } from '../js/resonador.js';

test('cable: quitarCable devuelve el S11 de la antena a partir del medido a través del cable', () => {
  const n = 50, freq = new Float64Array(n), re = new Float64Array(n), im = new Float64Array(n), ra = new Float64Array(n), ia = new Float64Array(n);
  const l = 5, vf = 0.66, db = 5;
  for (let i = 0; i < n; i++) {
    const f = 100e6 + i * 3e6, ga = 0.3, fa = 0.7 + i * 0.01;
    const ph = -2 * 2 * Math.PI * f * l / (vf * C0), a = ga * 10 ** (-2 * perdidaIdaDb(f, l, db) / 20);
    freq[i] = f; re[i] = a * Math.cos(fa + ph); im[i] = a * Math.sin(fa + ph);
    ra[i] = ga * Math.cos(fa); ia[i] = ga * Math.sin(fa);
  }
  const r = quitarCable({ freq, re, im }, { largoM: l, vf, dbPor100m: db });
  for (let i = 0; i < n; i++) { assert.ok(Math.abs(r.re[i] - ra[i]) < 1e-9 && Math.abs(r.im[i] - ia[i]) < 1e-9); }
  assert.equal(quitarCable({ freq, re, im }, { largoM: 0, vf }).re, re); // sin cable no cambia nada
});

test('resonador: Q cargada y propia de una trampa con acoplo débil', () => {
  const f0 = 7e6, Q0 = 200, beta = 0.1, n = 801, freq = new Float64Array(n), re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = f0 * (0.9 + 0.2 * i / (n - 1)), d = (f - f0) / f0, x = 2 * Q0 * d;
    // Γ = ((1−β) + jx) / ((1+β) + jx)
    const nr = 1 - beta, dr = 1 + beta, den = dr * dr + x * x;
    freq[i] = f; re[i] = (nr * dr + x * x) / den; im[i] = (x * dr - nr * x) / den;
  }
  const r = analizarResonador(calcular({ freq, re, im }));
  assert.ok(Math.abs(r.f0 / f0 - 1) < 1e-3);
  assert.ok(Math.abs(r.qc / (Q0 / (1 + beta)) - 1) < 0.1, `Qc ${r.qc}`);
  assert.ok(Math.abs(r.q0 / Q0 - 1) < 0.1, `Q0 ${r.q0}`);
});

test('stub: λ/4 con VF 0,66 a 145 MHz son 34,2 cm', () => {
  assert.ok(Math.abs(largoStub(0.25, 145e6, 0.66) - 0.3411) < 0.001);
});
