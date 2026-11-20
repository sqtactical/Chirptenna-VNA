import test from 'node:test';
import assert from 'node:assert/strict';
import { leerResultadoChirptenna, deducirEr } from '../js/puente.js';

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
