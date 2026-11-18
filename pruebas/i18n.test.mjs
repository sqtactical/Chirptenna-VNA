// Idiomas: los catalogos estan completos y coherentes con el codigo, y T() sustituye las marcas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { todasLasClaves } from '../herramientas/i18n.mjs';
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
