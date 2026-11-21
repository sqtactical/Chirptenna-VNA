import test from 'node:test';
import assert from 'node:assert/strict';
import { parametrosIncertidumbre, margenGamma, rangoAdaptacion, D_DEFECTO, D_EQUIPO } from '../js/incertidumbre.js';
import { tramoAJSON, tramoDeJSON } from '../js/calibracion.js';

const tramo = (repetDb) => ({ fecha: 1, freq: Float64Array.of(1, 2), ed: { re: Float64Array.of(0, 0), im: Float64Array.of(0, 0) }, es: { re: Float64Array.of(0, 0), im: Float64Array.of(0, 0) }, er: { re: Float64Array.of(1, 1), im: Float64Array.of(0, 0) }, ...(repetDb === undefined ? {} : { repetDb }) });

test('incertidumbre: parametros segun el origen de la calibracion', () => {
  assert.equal(parametrosIncertidumbre(null).d, D_EQUIPO);
  assert.deepEqual(parametrosIncertidumbre({ segmentos: [tramo()] }), { d: D_DEFECTO, verificada: false, fuente: 'app' });
  const p = parametrosIncertidumbre({ segmentos: [tramo(-40), tramo(-26)] });
  assert.ok(p.verificada && Math.abs(p.d - 10 ** (-26 / 20)) < 1e-12, 'manda el peor tramo');
});

test('incertidumbre: el margen crece con |Γ| y el rango contiene el valor medido', () => {
  const p = { d: 0.03 };
  assert.ok(margenGamma(0.5, p) > margenGamma(0.1, p));
  const r = rangoAdaptacion(0.1, p), rl = 20;
  assert.ok(r.rlMin < rl && r.rlMax > rl && r.roeMin < 1.222 && r.roeMax > 1.222);
  const nulo = rangoAdaptacion(0.02, p);
  assert.ok(nulo.indistinguible && nulo.rlMax === Infinity && nulo.roeMin === 1);
});

test('incertidumbre: la verificacion (repetDb) se guarda en el tramo y vuelve del JSON', () => {
  assert.equal(tramoDeJSON(JSON.parse(JSON.stringify(tramoAJSON(tramo(-31))))).repetDb, -31);
  assert.equal('repetDb' in tramoDeJSON(JSON.parse(JSON.stringify(tramoAJSON(tramo())))), false);
});
