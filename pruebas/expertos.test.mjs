// Herramientas de experto: Touchstone, promediado y comparación con una referencia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leerTouchstone } from '../js/touchstone.js';
import { promediar, ruidoSistema, umbralProminencia } from '../js/estadistica.js';
import { compararConReferencia } from '../js/diferencia.js';

test('touchstone: RI en Hz, MA en MHz y DB en GHz dan el mismo S11', () => {
  const g = 0.5, fase = 30 * Math.PI / 180, re = g * Math.cos(fase), im = g * Math.sin(fase);
  const ri = leerTouchstone(`! x\n# HZ S RI R 50\n100000000 ${re} ${im}\n200000000 ${re} ${im}\n`, 'a.s1p');
  const ma = leerTouchstone(`# MHz S MA R 50\n100 0.5 30\n200 0.5 30\n`, 'b.s1p');
  const db = leerTouchstone(`# GHz S DB R 50\n0.1 ${20 * Math.log10(0.5)} 30\n0.2 ${20 * Math.log10(0.5)} 30\n`, 'c.s1p');
  for (const t of [ri, ma, db]) {
    assert.equal(t.puertos, 1);
    assert.ok(Math.abs(t.freq[1] - 2e8) < 1e-3);
    assert.ok(Math.abs(t.re[0] - re) < 1e-9 && Math.abs(t.im[0] - im) < 1e-9);
  }
});

test('touchstone: s2p devuelve S11 y S21; errores claros', () => {
  const t = leerTouchstone('# MHz S RI R 50\n10 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8\n', 'x.s2p');
  assert.equal(t.puertos, 2);
  assert.equal(t.re[0], 0.1); assert.equal(t.s21.re[0], 0.3);
  assert.throws(() => leerTouchstone('# MHz Y RI R 50\n1 0 0\n', 'y.s1p'), /parámetros S/);
  assert.throws(() => leerTouchstone('# MHz S RI R 50\n2 0 0\n1 0 0\n', 'z.s1p'), /orden creciente/);
});

test('promediar: la media sale limpia y la desviación mide el ruido', () => {
  const N = 20, n = 50, base = 0.3;
  let semilla = 7; const rnd = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const barridos = Array.from({ length: N }, () => {
    const freq = Float64Array.from({ length: n }, (_, i) => 1e6 * (i + 1)), re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) { re[i] = base + 0.01 * rnd(); im[i] = 0.01 * rnd(); }
    return { freq, re, im };
  });
  const p = promediar(barridos);
  assert.equal(p.n, N);
  const errMedia = Math.max(...p.re.map(x => Math.abs(x - base)));
  const errUno = Math.max(...barridos[0].re.map(x => Math.abs(x - base)));
  assert.ok(errMedia < errUno);
  const { sigma } = ruidoSistema(p.desv);
  assert.ok(sigma > 0.003 && sigma < 0.03, `sigma ${sigma}`);
  assert.equal(umbralProminencia(new Float64Array(n)), 3);
  assert.ok(umbralProminencia(Float64Array.from({ length: n }, () => 0.2)) > 3);
});

test('comparar con referencia: medida idéntica da 0 y un desplazamiento se detecta', () => {
  const n = 201;
  const mk = f0 => {
    const freq = Float64Array.from({ length: n }, (_, i) => 100e6 + i * 1e6), re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) { re[i] = 0.9 - 0.8 * Math.exp(-(((freq[i] - f0) / 5e6) ** 2)); }
    return { freq, re, im };
  };
  const a = mk(200e6), b = mk(200e6), c = mk(210e6);
  const igual = compararConReferencia(a, b);
  assert.ok(igual.rmsGamma < 1e-12 && igual.maxGamma < 1e-12 && Math.abs(igual.desplazamiento) < 1e-12);
  const dif = compararConReferencia(c, a);
  assert.ok(dif.desplazamiento > 0.04 && dif.desplazamiento < 0.06, `desp ${dif.desplazamiento}`);
  assert.ok(dif.maxGamma > 0.3);
  const fuera = compararConReferencia(a, { freq: Float64Array.of(1e9, 2e9), re: Float64Array.of(0, 0), im: Float64Array.of(0, 0) });
  assert.equal(fuera, null);
});
