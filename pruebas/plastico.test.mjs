import test from 'node:test';
import assert from 'node:assert/strict';
import { epsEff, erMuestra, medir, erFr4, parametrosPico, qSinCarga, medirStub, erFr4Stubs, resonanciasStub, elegirResonancia } from '../js/plastico.js';

// Los valores de referencia salen de antenas/plastico.py de Chirptenna (el mismo cálculo): si uno cambia, hay que cambiar el otro.
const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} frente a ${b}`);

test('plástico: la sección da el mismo εeff y fracciones de energía que Python', () => {
  let r = epsEff(3.01, 1.6, 4.5);
  cerca(r.eff, 3.3842008933, 2e-3, 'εeff sin muestra'); cerca(r.fr.sustrato, 0.8996657, 2e-3, 'fracción FR4'); assert.equal(r.fr.muestra, 0);
  r = epsEff(3.01, 1.6, 4.5, 2.8, 3.0);
  cerca(r.eff, 3.8891171640, 4e-3, 'εeff con PLA'); cerca(r.fr.muestra, 0.18290666, 2e-3, 'energía en la muestra');
  r = epsEff(3.01, 1.6, 4.5, 6.0, 2.0, 0.1);
  cerca(r.eff, 4.1388303109, 5e-3, 'εeff con rendija');
});

test('plástico: εr de la muestra y su incertidumbre como Python', () => {
  const r = medir({ fVacioMHz: 2397.1, fCargadoMHz: 2219.2, grosorMm: 3.0, wMm: 3.01, qVacio: 90, qCargado: 60 });
  assert.ok(r.ok);
  cerca(r.er, 3.033, 0.01, 'εr'); cerca(r.erIncertidumbre, 0.06, 0.02, 'incertidumbre');
  cerca(r.tand, 0.0402, 0.003, 'tanδ'); assert.ok(r.tandFiable);
  assert.equal(erMuestra(2400e6, 2500e6, 3.01, 1.6, 4.5, 3.0), null);               // una muestra no sube la frecuencia
  assert.equal(medir({ fVacioMHz: 2400, fCargadoMHz: 2500, grosorMm: 3 }).ok, false);
});

test('plástico: εr del FR4 desde el anillo de 2,4 GHz', () => {
  cerca(erFr4(2397.1).er, 4.5, 0.01, 'en la referencia');
  cerca(erFr4(2300).er, 4.932, 0.02, 'a 2300 MHz');
  assert.equal(erFr4(1000).ok, false); assert.equal(erFr4(2400, 'nada').ok, false);
});

test('plástico: pico de S21 y Q', () => {
  const f = Array.from({ length: 801 }, (_, k) => 2.0e9 + k * 0.5e6), q = 120, f0 = 2.2e9;
  const s = f.map(x => 10 * Math.log10(1e-8 + 1e-3 / (1 + (2 * q * (x - f0) / f0) ** 2)));
  const p = parametrosPico(f, s);
  cerca(p.fMHz, 2200, 0.6, 'f'); cerca(p.qCargado, q, 0.04 * q, 'Q'); assert.ok(p.qPropio > p.qCargado);
  assert.equal(parametrosPico(f, f.map(() => -60)), null);
  cerca(qSinCarga(100, -20), 100 / 0.9, 1e-9);
});


test('plástico: la corrección 3D recupera la εr de las simulaciones de openEMS (como Python)', () => {
  for (const [erReal, t, f1] of [[2.8, 3.0, 2219.2], [6.0, 2.0, 2042.9], [4.0, 3.0, 2130.3]]) {
    const con = medir({ fVacioMHz: 2397.1, fCargadoMHz: f1, grosorMm: t, wMm: 3.01, anillo: 'R2G4' });
    const sin = medir({ fVacioMHz: 2397.1, fCargadoMHz: f1, grosorMm: t, wMm: 3.01 });
    cerca(con.er, erReal, 0.02 * erReal, `εr ${erReal}`); assert.ok(con.calibrado3d && !con.fueraDeCalibracion);
    assert.ok(sin.er > con.er && !sin.calibrado3d);
  }
  assert.ok(medir({ fVacioMHz: 2397.1, fCargadoMHz: 2100, grosorMm: 0.8, wMm: 3.01, anillo: 'R2G4' }).fueraDeCalibracion);
});

test('plástico: la tira de 24 mm da el mismo εeff que Python y casi el de la muestra infinita', () => {
  const inf = epsEff(3.01, 1.6, 4.5, 2.8, 3).eff, tira = epsEff(3.01, 1.6, 4.5, 2.8, 3, 0, 24).eff;
  cerca(tira, 3.8888, 4e-3, 'tira de 24 mm'); assert.ok(Math.abs(tira / inf - 1) < 5e-4);
  assert.ok(epsEff(3.01, 1.6, 4.5, 2.8, 3, 0, 12).eff < tira);                           // más estrecha, menos efecto
});

test('plástico: stubs: εr de las simulaciones 3D como Python', () => {
  for (const [erReal, t, modo, f0, f1] of [[2.8, 3, 1, 869.678, 812.9], [6, 2, 1, 869.678, 756.1], [4, 4, 2, 2624.945, 2359.2], [10, 3, 1, 869.678, 688.8]]) {
    const r = medirStub({ fVacioMHz: f0, fCargadoMHz: f1, grosorMm: t, modo, conIncertidumbre: false });
    assert.ok(r.ok && r.calibrado3d && !r.fueraDeCalibracion); cerca(r.er, erReal, 0.04 * erReal, `εr ${erReal} modo ${modo}`);
  }
  const u = medirStub({ fVacioMHz: 869.678, fCargadoMHz: 812.9, grosorMm: 3 });
  assert.ok(u.erIncertidumbre > 0.02 && u.erIncertidumbre < 0.3);
});

test('plástico: FR4 con varios stubs (ordenada = conector) y tanδ desde R', () => {
  const r = erFr4Stubs({ S43: 869.678, S59: 646.167, S86: 450.3 }, 1);
  assert.ok(r.ok); cerca(r.er, 4.649, 0.05, 'εr FR4'); assert.ok(r.lanzamientoMm > 2 && r.lanzamientoMm < 4.5);
  assert.equal(erFr4Stubs({ S43: 869.678 }, 1).ok, false);
  const base = { fVacioMHz: 869.678, fCargadoMHz: 812.9, grosorMm: 3, modo: 1, rVacio: 1.3, alfaC1GHz: 0, conIncertidumbre: false };
  assert.ok(medirStub({ ...base, rCargado: 1.8 }).tand > medirStub({ ...base, rCargado: 1.35 }).tand);
});

test('plástico: resonancias de un stub en S11 complejo', () => {
  const f = Float64Array.from({ length: 4001 }, (_, k) => 100e6 + k * 0.675e6), L = 0.043, eps = 3.5;
  const re = new Float64Array(f.length), im = new Float64Array(f.length);
  f.forEach((x, i) => {
    const bl = 2 * Math.PI * x * Math.sqrt(eps) / 299792458 * L, zr = 1, zi = -50 / Math.tan(bl);       // −j·Z0·cot(βL) + 1 Ω
    const nr = zr - 50, ni = zi, dr = zr + 50, di = zi, d = dr * dr + di * di;
    re[i] = (nr * dr + ni * di) / d; im[i] = (ni * dr - nr * di) / d;
  });
  const r = resonanciasStub(f, re, im), esperada = 299792458 / (4 * L * Math.sqrt(eps)) / 1e6;
  assert.ok(r.length >= 2); cerca(r[0].fMHz, esperada, 0.002 * esperada, 'modo 1'); cerca(r[1].fMHz, 3 * esperada, 0.002 * 3 * esperada, 'modo 2'); cerca(r[0].rOhm, 1, 0.05, 'R');
  assert.equal(elegirResonancia(r, 5000), null); assert.equal(elegirResonancia(r, 3 * esperada).fMHz, r[1].fMHz);
});