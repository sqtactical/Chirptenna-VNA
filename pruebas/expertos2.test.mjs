import test from 'node:test';
import assert from 'node:assert/strict';
import { leerResultadoChirptenna, deducirEr, leerObjetivoUrl } from '../js/puente.js';
import { leerTouchstone } from '../js/touchstone.js';

test('puente: objetivo por URL (f, banda, nombre) y entradas no fiables', () => {
  const o = leerObjetivoUrl('?f=2441.75&banda=2400-2483.5&nombre=mi_antena');
  assert.deepEqual(o, { fMinMHz: 2400, fMaxMHz: 2483.5, nombre: 'mi_antena' });
  assert.deepEqual(leerObjetivoUrl('?f=868'), { fMinMHz: 868, fMaxMHz: 868, nombre: '' });
  assert.equal(leerObjetivoUrl(''), null);
  assert.equal(leerObjetivoUrl('?f=abc'), null);
  assert.equal(leerObjetivoUrl('?f=-5'), null);
  assert.equal(leerObjetivoUrl('?f=2400&banda=2500-2400').fMaxMHz, 2400); // banda invertida: solo la frecuencia
  assert.equal(leerObjetivoUrl('?f=2400&nombre=<img src=x onerror=1>').nombre, 'img srcx onerror1'); // sin < > = ni comillas
});

test('contrato con Chirptenna: el .s1p simulado (RI, Hz, 50 Ω, comentarios con !) se lee', () => {
  const texto = '! Chirptenna · simulación dipolo · openems · 2441.5 MHz\n# HZ S RI R 50\n2400000000 -3.2e-01 1.1e-01\n2441750000 -8.0e-02 5.0e-02\n';
  const t = leerTouchstone(texto, 's11_simulado.s1p');
  assert.equal(t.freq.length, 2);
  assert.equal(t.freq[1], 2441750000);
});

test('puente: lee el resultado.json de Chirptenna y rechaza lo que no lo es', () => {
  const r = leerResultadoChirptenna(JSON.stringify({ clave: 'parche_rectangular', f_resonancia_MHz: 2440, s11_min_dB: -18, verificacion_malla: { veredicto: 'robusta' } }));
  assert.equal(r.fRes, 2.44e9); assert.equal(r.tipo, 'parche_rectangular'); assert.ok(r.fiable);
  assert.equal(leerResultadoChirptenna('{"f_resonancia_MHz":900,"verificacion_malla":{"veredicto":"sensible"}}').fiable, false);
  assert.throws(() => leerResultadoChirptenna('no json'), /resultado\.json/);
  assert.throws(() => leerResultadoChirptenna('{"x":1}'), /frecuencia de resonancia/);
});

test('puente: misma frecuencia da la misma εr y una resonancia más baja, una εr mayor', () => {
  const igual = deducirEr(2.44e9, 2.44e9, 4.5);
  assert.ok(Math.abs(igual.erMedida - 4.5) < 1e-9 && Math.abs(igual.desplazamiento) < 1e-12);
  const baja = deducirEr(2.44e9, 2.44e9 * 0.97, 4.5);
  assert.ok(baja.erMedida > 4.5 && baja.erMedida < 5.5, `er ${baja.erMedida}`);
  assert.ok(baja.desplazamiento < 0);
});
