// Idiomas: los catalogos estan completos y coherentes con el codigo, y T() sustituye las marcas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { todasLasClaves } from '../herramientas/i18n.mjs';
import * as A from '../js/analisis.js';
import { T, usarCatalogo, IDIOMAS, idiomaElegido } from '../js/i18n.js';

const idiomas = IDIOMAS.map(i => i[0]).filter(c => c !== 'es');
const marcas = s => [...s.matchAll(/\{\d+\}/g)].map(m => m[0]).sort().join('');
const claves = todasLasClaves();

test('i18n: cada idioma del selector tiene su catalogo, con todas las claves traducidas y las mismas marcas {n}', () => {
  for (const c of idiomas) {
    const j = JSON.parse(fs.readFileSync(new URL(`../idiomas/${c}.json`, import.meta.url), 'utf8'));
    assert.ok(j._nombre, `${c}: falta _nombre`);
    const faltan = claves.filter(k => !j.textos[k]);
    assert.deepEqual(faltan, [], `${c}: faltan ${faltan.length} claves (node herramientas/i18n.mjs faltan ${c})`);
    const mal = claves.filter(k => marcas(k) !== marcas(j.textos[k]));
    assert.deepEqual(mal, [], `${c}: marcas {n} distintas`);
  }
});

test('i18n: T() sustituye las marcas, cae al castellano sin traduccion y respeta los 0', () => {
  usarCatalogo({});
  assert.equal(T('Hola {0} y {1}', 'a', 2), 'Hola a y 2');
  assert.equal(T('Valor {0}', 0), 'Valor 0');
  assert.equal(T('Sin marcas'), 'Sin marcas');
  usarCatalogo({ 'Hola {0} y {1}': 'Hi {1} and {0}', 'Vacia': '' }, 'en');
  assert.equal(T('Hola {0} y {1}', 'a', 2), 'Hi 2 and a');
  assert.equal(T('Vacia'), 'Vacia', 'una traduccion vacia cuenta como falta');
  assert.equal(T('Otra {0}', 'x'), 'Otra x');
  usarCatalogo({});
});

test('i18n: el idioma sale de ?idioma=, luego del navegador, y solo entre los disponibles', () => {
  assert.equal(idiomaElegido('?idioma=en', 'es-ES'), 'en');
  assert.equal(idiomaElegido('', 'en-GB'), 'en');
  assert.equal(idiomaElegido('?idioma=xx', 'pt-BR'), 'es');
  assert.equal(idiomaElegido('', 'es'), 'es');
});

test('i18n: las claves extraidas incluyen textos del HTML, del JS y de los JSON de datos', () => {
  for (const k of ['Pasos', 'Conectar', 'Cubre la banda', 'Fonía (SSB)', 'Mal acoplada']) assert.ok(claves.includes(k), `falta la clave «${k}»`);
});

// ---------- Mi nodo Meshtastic ----------
import { calcularCanal, hashCanal, REGIONES, PRESETS } from '../js/meshtastic.js';

test('Meshtastic: el canal por defecto de LongFast sale como en el firmware (EE. UU. 906,875; EU_433 433,875; EU_868 869,525)', () => {
  const f = r => calcularCanal({ region: r, preset: 'LongFast' });
  assert.equal(f('US').fMHz, 906.875);
  assert.equal(f('US').numCanales, 104);
  assert.equal(f('EU_433').fMHz, 433.875);
  assert.equal(f('EU_868').fMHz, 869.525);
  assert.equal(f('EU_868').numCanales, 1, 'EU_868 solo tiene un canal de 250 kHz');
  assert.equal(f('ANZ').fMHz, 919.875);
});

test('Meshtastic: slot manual, nombre de canal propio, anchos de preset y entradas no válidas', () => {
  assert.equal(calcularCanal({ region: 'US', preset: 'LongFast', slot: 1 }).fMHz, 902.125);
  assert.equal(calcularCanal({ region: 'US', preset: 'LongFast', slot: 104 }).fMHz, 927.875);
  assert.equal(calcularCanal({ region: 'US', preset: 'LongFast', slot: 999 }).slot, 20, 'slot fuera de rango: vuelve al calculado');
  const otro = calcularCanal({ region: 'US', preset: 'LongFast', nombre: 'MiRed' });
  assert.equal(otro.nombre, 'MiRed');
  assert.equal(otro.slot, (hashCanal('MiRed') % 104) + 1);
  assert.equal(calcularCanal({ region: 'US', preset: 'ShortTurbo' }).numCanales, 52, 'ancho de 500 kHz: la mitad de canales');
  assert.equal(calcularCanal({ region: 'XX', preset: 'LongFast' }), null);
  assert.equal(calcularCanal({ region: 'US', preset: 'Nada' }), null);
  for (const r of Object.values(REGIONES)) assert.ok(r.inicio < r.fin);
  for (const p of Object.values(PRESETS)) assert.ok([62.5, 125, 250, 500].includes(p.ancho));
});

import { calculoMm } from '../js/analisis.js';
test('calculadora de corte: porcentaje a milimetros, cortar en pasos y datos no validos', () => {
  const c = calculoMm(160, -2.5);
  assert.equal(c.accion, 'cortar'); assert.equal(c.mm, 4); assert.ok(Math.abs(c.primerPaso - 2.8) < 1e-9, 'primer paso = 70 %');
  const a = calculoMm(160, 1.25);
  assert.equal(a.accion, 'alargar'); assert.equal(a.mm, 2); assert.equal(a.primerPaso, null);
  assert.equal(calculoMm(0, 3), null); assert.equal(calculoMm(100, 0), null); assert.equal(calculoMm(NaN, 3), null); assert.equal(calculoMm(100, NaN), null);
});

test('Region 3 de la IARU: bandas de HF, VHF y UHF, Meshtastic de Asia-Pacifico y solo FT8/FT4/WSPR por modos', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../bandas.json', import.meta.url), 'utf8'));
  const ap = A.bandasDeRegion(cfg.bandas, 'ap');
  const nombres = ap.map(b => `${b.servicio} ${b.nombre}`);
  for (const n of ['ham 80 m', 'ham 40 m', 'ham 20 m', 'ham 6 m', 'ham 2 m', 'ham 70 cm', 'meshtastic ANZ (915-928)', 'meshtastic JP (920.5-923.5)']) assert.ok(nombres.includes(n), `falta ${n}`);
  assert.ok(!nombres.includes('ham 4 m'), 'la banda de 4 m no es de R3');
  assert.ok(!nombres.some(n => n.includes('EU_868')), 'EU_868 no es de Asia-Pacifico');
  const m = (n, r) => ap.find(b => b.nombre === n && b.region.includes(r));
  assert.deepEqual([m('2 m', 'R3').f_min, m('2 m', 'R3').f_max], [144, 148]);
  assert.deepEqual([m('40 m', 'R3').f_min, m('40 m', 'R3').f_max], [7, 7.2]);
  // por modos: R3 no tiene segmentos propios, solo los digitales de WSJT-X (iguales en todo el mundo)
  const seg = JSON.parse(fs.readFileSync(new URL('../segmentos_hf.json', import.meta.url), 'utf8'));
  const s40 = A.segmentosDeBanda(seg, m('40 m', 'R3'), 'ap');
  assert.deepEqual(s40.map(s => s.id).sort(), ['ft4', 'ft8', 'wspr']);
  assert.ok(A.segmentosDeBanda(seg, m('40 m', 'R3'), 'eu').length > 3, 'con R1 sigue habiendo segmentos de CW, fonía...');
});

import { resumirMedida, ordenarMedidas, rejillaComun, curvaEnRejilla, valorOrden } from '../js/comparar.js';
test('comparar antenas: resumen compacto, orden por el peor punto del objetivo y curvas en una rejilla comun', async () => {
  const med = f => A.calcular({ freq: Float64Array.from({ length: 200 }, (_, i) => 8.4e8 * Math.pow(9e8 / 8.4e8, i / 199)), re: new Float64Array(200).fill(f), im: new Float64Array(200) });
  const obj = { fMin: 863e6, fMax: 870e6, banda: { nombre: 'ISM 868' } };
  const buena = resumirMedida({ nombre: 'Buena', medida: med(0.05), obj, umbral: 9.54 });
  const mala = resumirMedida({ nombre: 'Mala', medida: med(0.6), obj, umbral: 9.54 });
  assert.equal(buena.freq.length, 240); assert.equal(buena.vswr.length, 240);
  assert.equal(buena.objetivo, 'ISM 868');
  assert.ok(buena.est.roeMax < 1.2 && mala.est.roeMax > 3, `${buena.est.roeMax} ${mala.est.roeMax}`);
  assert.ok(JSON.stringify(buena).length < 12000, 'cada medida ocupa poco en localStorage');
  assert.deepEqual(ordenarMedidas([mala, buena]).map(m => m.nombre), ['Buena', 'Mala']);
  assert.equal(valorOrden(buena), buena.est.roeMax);
  const rej = rejillaComun([buena, mala], 100), c = curvaEnRejilla(mala, rej);
  assert.equal(rej.length, 100); assert.equal(c.length, 100);
  assert.ok(Math.abs(c[50] - mala.est.roeMax) < 0.2, 'la curva remuestreada conserva el valor');
});

import { avisosMedida } from '../js/analisis.js';
test('avisos de medida mal hecha: sin conectar, carga de 50 ohm, ruido, y la antena real no avisa', () => {
  const rejilla = (a, b, n) => Float64Array.from({ length: n }, (_, i) => a * Math.pow(b / a, i / (n - 1)));
  const crear = (f, re, im) => A.calcular({ freq: f, re, im });
  const f = rejilla(7.5e8, 9.5e8, 101);
  // antena real grabada
  const L = fs.readFileSync(new URL('./datos/antena_868_real.s1p', import.meta.url), 'utf8').split(/\r?\n/).filter(l => l && !/^[!#]/.test(l)).map(l => l.trim().split(/\s+/).map(Number));
  const real = crear(Float64Array.from(L.map(x => x[0])), Float64Array.from(L.map(x => x[1])), Float64Array.from(L.map(x => x[2])));
  assert.deepEqual(avisosMedida(real), [], 'la antena real no debe dar avisos');
  // circuito abierto: Γ ≈ 1 en todo el rango
  const abierta = crear(f, new Float64Array(101).fill(0.999), new Float64Array(101).fill(0.01));
  assert.deepEqual(avisosMedida(abierta).map(a => a.id), ['sin_conectar']);
  // carga de 50 Ω: Γ ≈ 0
  const carga = crear(f, new Float64Array(101).fill(0.02), new Float64Array(101).fill(0.01));
  assert.deepEqual(avisosMedida(carga).map(a => a.id), ['carga']);
  // la misma carga en un rango estrecho no se toma por carga (podria ser una antena muy buena en su banda)
  const estrecha = crear(rejilla(8.6e8, 8.7e8, 101), new Float64Array(101).fill(0.02), new Float64Array(101).fill(0.01));
  assert.deepEqual(avisosMedida(estrecha), []);
  // ruido fuerte sobre la antena real
  let s = 12345; const alea = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 - 0.5; };
  const ruidosa = crear(real.freq, Float64Array.from(L.map(x => x[1] + alea() * 0.06)), Float64Array.from(L.map(x => x[2] + alea() * 0.06)));
  assert.ok(avisosMedida(ruidosa).some(a => a.id === 'ruido'));
  assert.deepEqual(avisosMedida(crear(f.slice(0, 5), new Float64Array(5), new Float64Array(5))), [], 'con pocos puntos no se opina');
});
