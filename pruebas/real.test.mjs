// El controlador contra lo que respondio de verdad un NanoVNA-H (DiSlord 1.2.42): la sesion grabada en datos/sesion_real_h.json.
// Un puerto falso reproduce esas respuestas en trozos de 64 bytes, como un USB, para comprobar el formato real (lineas en blanco,
// eco, espacios finales, version sin nombre...) que un emulador escrito a mano puede no reflejar.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DriverNanoVNAH } from '../js/drivers/nanovna-h.js';
import * as A from '../js/analisis.js';

const sesion = JSON.parse(fs.readFileSync(new URL('./datos/sesion_real_h.json', import.meta.url), 'utf8'));

function puertoReal() {
  let cola = [], cerrado = false;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const log = [];
  const port = {
    async open() {}, async close() {},
    readable: { getReader: () => ({
      async read() {
        while (!cola.length) { if (cerrado) return { done: true }; await new Promise(r => setTimeout(r, 1)); }
        return { value: cola.shift(), done: false };
      },
      async cancel() { cerrado = true; }, releaseLock() {},
    }) },
    writable: { getWriter: () => ({
      async write(b) {
        const c = dec.decode(b).replace(/\r$/, ''); log.push(c);
        let r = c === '' ? '\r\nch> ' : sesion[c.startsWith('scan 8') ? 'scan 800000000 950000000 101 7' : c];
        r ??= `${c}\r\nch> `;
        const bytes = enc.encode(r); cola = [];
        for (let i = 0; i < bytes.length; i += 64) cola.push(bytes.slice(i, i + 64));
      }, releaseLock() {},
    }) },
  };
  return { port, log };
}

test('equipo real: conecta, se identifica sin aviso y mide 101 puntos con la antena de 868 MHz', async () => {
  const { port, log } = puertoReal();
  const previo = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { serial: { requestPort: async () => port, addEventListener() {}, removeEventListener() {} } }, configurable: true });
  try {
    const d = new DriverNanoVNAH();
    await d.connect();
    assert.equal(d.version, '1.2.42');
    assert.match(d.info, /NanoVNA/);
    assert.equal(d.aviso, '', 'un NanoVNA-H real no debe llevar el aviso de equipo desconocido');
    const m = await d.scan(8e8, 9.5e8, 101, () => {}, 'lineal');
    assert.equal(m.freq.length, 101);
    assert.equal(m.freq[0], 8e8); assert.equal(m.freq[100], 9.5e8);
    const g = Array.from(m.re, (x, i) => Math.hypot(x, m.im[i]));
    assert.ok(Math.max(...g) < 1, '|S11| debe ser < 1 en una antena pasiva');
    const med = A.calcular(m);
    const i = med.vswr.indexOf(Math.min(...med.vswr));
    assert.ok(med.vswr[i] < 1.2 && Math.abs(med.freq[i] - 863e6) < 5e6, `minimo de ROE ${med.vswr[i]} a ${med.freq[i]}`);
    assert.ok(!log.includes('save'), 'nunca se envia save');
    await d.disconnect();
  } finally {
    await port.close();
    if (previo) Object.defineProperty(globalThis, 'navigator', previo); else delete globalThis.navigator;
  }
});

test('equipo real: lo grabado respeta el formato que espera el controlador', () => {
  assert.match(sesion.cal, /cal'ed/);
  assert.match(sesion.sweep, /^\s*sweep\s*\r?\n\s*50000 2700000000 101/m);
  const filas = sesion['scan 800000000 950000000 101 7'].split(/\r?\n/).filter(l => /^\d+\s/.test(l.trim()));
  assert.equal(filas.length, 101);
  assert.equal(filas[0].trim().split(/\s+/).length, 5, 'mascara 7: freq + S11 (2) + S21 (2)');
});
