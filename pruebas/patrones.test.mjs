import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/calibracion.js';
import { esIdeal, gammaPatron, PATRONES_IDEALES } from '../js/patrones.js';

const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
// Equipo con errores conocidos: m = Ed + Er·Γ/(1 − Es·Γ)
const ED = [0.03, -0.02], ES = [0.08, 0.05], ER = [0.9, -0.1];
const mide = g => { const q = cdiv(cmul(ER, g), [1 - (ES[0] * g[0] - ES[1] * g[1]), -(ES[0] * g[1] + ES[1] * g[0])]); return [ED[0] + q[0], ED[1] + q[1]]; };
const freq = Float64Array.from({ length: 21 }, (_, i) => 1.5e9 + i * 5e7);
const serie = fn => ({ re: Float64Array.from(freq, (f, i) => fn(f, i)[0]), im: Float64Array.from(freq, (f, i) => fn(f, i)[1]) });

const KIT = { // kit con parásitos apreciables a 1,5–2,5 GHz
  open: { c: [60, 0, 0, 0], retardo: 20, perdida: 0.02 },
  short: { l: [30, 0, 0, 0], retardo: 20, perdida: 0.02 },
  load: { r: 50, l: 15, retardo: 20, perdida: 0.02 },
};
const medidas = kit => ({
  o: serie(f => mide(gammaPatron('open', kit.open, f))),
  s: serie(f => mide(gammaPatron('short', kit.short, f))),
  l: serie(f => mide(gammaPatron('load', kit.load, f))),
});
const dut = f => [0.35 * Math.cos(f / 3e8), 0.35 * Math.sin(f / 3e8)];
const errorMax = seg => {
  let e = 0;
  freq.forEach(f => { const [r, i] = C.corregirPunto(seg, f, ...mide(dut(f))); e = Math.max(e, Math.hypot(r - dut(f)[0], i - dut(f)[1])); });
  return e;
};

test('patrones ideales: Γ = +1, −1 y 0, y el modelo ideal no cambia la formula cerrada', () => {
  assert.deepEqual(gammaPatron('open', PATRONES_IDEALES.open, 1e9), [1, 0]);
  assert.ok(esIdeal(PATRONES_IDEALES) && esIdeal(null));
  const g = gammaPatron('short', PATRONES_IDEALES.short, 1e9);
  assert.ok(Math.abs(g[0] + 1) < 1e-12 && Math.abs(g[1]) < 1e-12);
  const m = medidas(PATRONES_IDEALES);
  const a = C.calcularTramo(freq, m.o, m.s, m.l), b = C.calcularTramo(freq, m.o, m.s, m.l, { patrones: PATRONES_IDEALES });
  assert.deepEqual(Array.from(a.er.re), Array.from(b.er.re));
  assert.ok(errorMax(a) < 1e-9);
});

test('modelo de patrones: el kit no ideal se corrige y el ideal deja error', () => {
  const m = medidas(KIT);
  const ideal = C.calcularTramo(freq, m.o, m.s, m.l), real = C.calcularTramo(freq, m.o, m.s, m.l, { patrones: KIT });
  assert.ok(errorMax(ideal) > 0.05, `ideal ${errorMax(ideal)}`);
  assert.ok(errorMax(real) < 1e-9, `con modelo ${errorMax(real)}`);
});

test('modelo de patrones: ida y vuelta por JSON y matematica de la capacidad del OPEN', () => {
  const m = medidas(KIT), seg = C.calcularTramo(freq, m.o, m.s, m.l, { patrones: KIT });
  const j = C.tramoDeJSON(JSON.parse(JSON.stringify(C.tramoAJSON(seg))));
  assert.deepEqual(j.patrones, KIT);
  const [re, im] = gammaPatron('open', { c: [100, 0, 0, 0], retardo: 0, perdida: 0 }, 1e9); // C = 100 fF a 1 GHz: ωCZ0 = 0,314
  assert.ok(Math.abs(Math.hypot(re, im) - 1) < 1e-12 && im < 0);
});
