// Pruebas automaticas:  node --test pruebas/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EmuladorNanoVNA, instalarSerial, gammaCorregido, gammaBruto } from './emulador.mjs';
import { DriverNanoVNAH } from '../js/drivers/nanovna-h.js';
import { DriverSimulado } from '../js/drivers/simulado.js';
import * as A from '../js/analisis.js';
import * as C from '../js/calibracion.js';

const cfg = JSON.parse(fs.readFileSync(new URL('../bandas.json', import.meta.url), 'utf8'));
const cercano = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

async function conectado(opts) {
  const emu = new EmuladorNanoVNA(opts);
  instalarSerial(emu);
  const drv = new DriverNanoVNAH();
  await drv.connect();
  return { emu, drv };
}

// ---------- Controlador DiSlord con emulador ----------
test('connect: sincroniza con el prompt y lee la version', async () => {
  const { drv } = await conectado();
  assert.match(drv.version, /DiSlord/);
  await drv.disconnect();
});

test('scan lineal: frecuencias y S11 correctos, unido en bloques de 101', async () => {
  const { emu, drv } = await conectado();
  const r = await drv.scan(1e6, 100e6, 250, () => {}, 'lineal');
  assert.equal(r.freq.length, 250);
  assert.equal(emu.log.filter(c => c.startsWith('scan')).length, 3); // 101 + 101 + 48
  for (let i = 0; i < 250; i++) {
    cercano(r.freq[i], 1e6 + (i * 99e6) / 249, 70, `f[${i}]`); // cada bloque redondea a Hz
    const g = gammaCorregido(r.freq[i]);
    cercano(r.re[i], g.re, 2e-6); cercano(r.im[i], g.im, 2e-6);
  }
  await drv.disconnect();
});

test('scan log 3000 puntos: monotono, extremos exactos y 30 scans', async () => {
  const { emu, drv } = await conectado();
  const r = await drv.scan(50e3, 2.7e9, 3000, () => {}, 'log');
  assert.equal(emu.log.filter(c => c.startsWith('scan')).length, Math.ceil(3000 / 101));
  assert.equal(r.freq[0], 50e3);
  assert.equal(r.freq[2999], 2.7e9);
  for (let i = 1; i < 3000; i++) assert.ok(r.freq[i] > r.freq[i - 1], `no monotono en ${i}`);
  await drv.disconnect();
});

test('scan con un solo punto sobrante en el ultimo bloque (102 puntos)', async () => {
  const { drv } = await conectado();
  const r = await drv.scan(1e6, 10e6, 102, () => {}, 'lineal');
  assert.equal(r.freq.length, 102);
  for (let i = 1; i < 102; i++) assert.ok(r.freq[i] > r.freq[i - 1], `hueco o repeticion en ${i}`);
  assert.ok(r.freq.every(f => f > 0), 'queda algun punto sin rellenar');
  await drv.disconnect();
});

test('scan bruto: cal off durante el barrido y restaura cal on y el barrido', async () => {
  const { emu, drv } = await conectado();
  emu.barrido = [123456, 987654321, 401];
  const r = await drv.scan(1e6, 20e6, 150, () => {}, 'lineal', { bruto: true });
  const g = gammaBruto(r.freq[10]);
  cercano(r.re[10], g.re, 2e-6); cercano(r.im[10], g.im, 2e-6);
  assert.ok(emu.log.indexOf('cal off') < emu.log.findIndex(c => c.startsWith('scan')), 'cal off antes del primer scan');
  assert.equal(emu.calActiva, true, 'cal on restaurado');
  assert.deepEqual(emu.barrido, [123456, 987654321, 401], 'barrido restaurado');
  await drv.disconnect();
});

test('scan bruto: si la calibracion estaba apagada, no la enciende', async () => {
  const { emu, drv } = await conectado();
  emu.calActiva = false;
  await drv.scan(1e6, 20e6, 20, () => {}, 'lineal', { bruto: true });
  assert.equal(emu.calActiva, false);
  await drv.disconnect();
});

test('scan: si el equipo devuelve menos puntos de los pedidos, falla con un mensaje claro', async () => {
  const { drv } = await conectado({ devolverDeMenos: true });
  await assert.rejects(drv.scan(1e6, 10e6, 50, () => {}, 'lineal'), /se esperaban 50 puntos y llegaron 49/);
  await drv.disconnect();
});

// ---------- Analisis ----------
const barrido = async (a, b, n, esp = 'log') => A.calcular(await new DriverSimulado().scan(a, b, n, () => {}, esp));

test('analisis: resonancias detectadas con barridos densos y escasos', async () => {
  for (const [a, b, n, esp] of [[777e6, 957e6, 601, 'log'], [50e3, 2.7e9, 3000, 'log'], [50e3, 2.7e9, 1001, 'lineal']]) {
    const m = await barrido(a, b, n, esp);
    const p = A.resonancias(m, 10);
    assert.ok(p.some(x => Math.abs(x.f - 871e6) < 6e6 && x.rl > 15), `sin resonancia a 871 MHz con ${n} puntos ${esp}`);
  }
});

test('analisis: impedancia, VSWR y fase coherentes con S11', () => {
  const m = A.calcular({ freq: Float64Array.of(1e6, 2e6, 3e6), re: Float64Array.of(0, 0.5, -1), im: Float64Array.of(0, 0, 0) });
  cercano(m.zr[0], 50, 1e-9); cercano(m.zx[0], 0, 1e-9); cercano(m.vswr[0], 1, 1e-9);        // adaptada
  cercano(m.zr[1], 150, 1e-9); cercano(m.vswr[1], 3, 1e-9); cercano(m.fase[2], 180, 1e-9);   // G=0.5 -> 150 ohm, VSWR 3
  assert.ok(m.zr[2] < 1e-6);                                                                   // cortocircuito
});

test('analisis: recomendacion alargar / cortar / ok / sin resonancia', async () => {
  const m = await barrido(777e6, 957e6, 601);
  const p = A.resonancias(m, 10);
  assert.equal(A.recomendacion(m, p, { fMin: 863e6, fMax: 870e6 }, 10).accion, 'ok');
  const alto = A.recomendacion(m, p, { fMin: 800e6, fMax: 800e6 }, 10);     // objetivo mas bajo que la resonancia
  assert.equal(alto.accion, 'alargar'); assert.ok(alto.pct > 5 && alto.pct < 12, `pct ${alto.pct}`);
  const bajo = A.recomendacion(m, p, { fMin: 940e6, fMax: 940e6 }, 10);     // objetivo mas alto
  assert.equal(bajo.accion, 'cortar');
  const m2 = await barrido(129e6, 161e6, 601);
  assert.equal(A.recomendacion(m2, A.resonancias(m2, 10), { fMin: 144e6, fMax: 146e6 }, 10).accion, 'sin_resonancia');
});

test('analisis: el afinado fusiona sin duplicar ni desordenar', async () => {
  const d = new DriverSimulado();
  let crudo = await d.scan(5e7, 2.7e9, 500, () => {}, 'log');
  const m = A.calcular(crudo), ev = A.evaluarBandas(m, A.bandasDeRegion(cfg.bandas, 'eu'), 10, 2.7e9);
  const ventanas = A.ventanasAfinado(A.resonancias(m, 10), ev, 5e7, 2.7e9);
  assert.ok(ventanas.length > 0);
  for (const w of ventanas) crudo = A.fusionar(crudo, await d.scan(w.lo, w.hi, w.puntos, () => {}, 'lineal'));
  for (let i = 1; i < crudo.freq.length; i++) assert.ok(crudo.freq[i] >= crudo.freq[i - 1]);
  assert.ok(crudo.freq.length > 500);
});

test('bandas.json: bordes coherentes', () => {
  for (const b of cfg.bandas) {
    assert.ok(b.f_min > 0 && b.f_max > b.f_min, `${b.nombre}`);
    assert.ok(Array.isArray(b.region) && b.region.length, `${b.nombre} sin region`);
  }
});

// ---------- Calibracion ----------
async function calibrarTramo(d, a, b, n = 401) {
  const medir = async est => { d.setEstandar(est); return d.scan(a, b, n, () => {}, 'log', { bruto: true }); };
  const o = await medir('open'), s = await medir('short'), l = await medir('load');
  return { o, s, l, seg: C.calcularTramo(o.freq, o, s, l, { fecha: Date.now() }) };
}

test('calibracion: corrige la antena entre tramos y mejora mucho el error', async () => {
  const d = new DriverSimulado();
  const tramos = C.planificarTramos(5e7, 2.7e9, 3);
  const juego = { segmentos: [] };
  for (const [a, b] of tramos) juego.segmentos.push((await calibrarTramo(d, Math.round(a), Math.round(b))).seg);
  d.setEstandar('antena');
  const bruto = await d.scan(2e8, 2e9, 777, () => {}, 'log', { bruto: true });   // cruza dos tramos
  const ideal = await d.scan(2e8, 2e9, 777, () => {}, 'log');
  const cor = C.corregir(juego, bruto);
  let eCal = 0, eRaw = 0;
  for (let i = 0; i < cor.freq.length; i++) {
    eCal = Math.max(eCal, Math.hypot(cor.re[i] - ideal.re[i], cor.im[i] - ideal.im[i]));
    eRaw = Math.max(eRaw, Math.hypot(bruto.re[i] - ideal.re[i], bruto.im[i] - ideal.im[i]));
  }
  assert.ok(eRaw > 0.5, `el error sin calibrar deberia ser grande (${eRaw})`);
  assert.ok(eCal < 0.06, `error calibrado demasiado alto: ${eCal}`);   // la carga simulada no es perfecta (|G|=0.02)
});

test('calibracion: tramos por separado, huecos y error con los intervalos que faltan', async () => {
  const d = new DriverSimulado();
  const [t1] = C.planificarTramos(5e7, 2.7e9, 3);
  const juego = { segmentos: [(await calibrarTramo(d, Math.round(t1[0]), Math.round(t1[1]))).seg] };
  const huecos = C.faltante(juego.segmentos, 5e7, 2.7e9);
  assert.equal(huecos.length, 1);
  cercano(huecos[0][0], t1[1], 100); cercano(huecos[0][1], 2.7e9, 1);
  d.setEstandar('antena');
  const bruto = await d.scan(1e8, 1e9, 50, () => {}, 'log', { bruto: true });
  assert.throws(() => C.corregir(juego, bruto), e => e instanceof C.ErrorCalibracion && e.faltan.length === 1);
  assert.equal(C.faltante(juego.segmentos, t1[0] * 1.001, t1[1] * 0.999).length, 0);
});

test('calibracion: comprobaciones detectan patrones mal puestos', async () => {
  const d = new DriverSimulado();
  const medir = async est => { d.setEstandar(est); return d.scan(6e8, 1.3e9, 101, () => {}, 'log', { bruto: true }); };
  const o = await medir('open'), s = await medir('short'), l = await medir('load');
  assert.ok(C.comprobarPatron('open', o).ok);
  assert.ok(C.comprobarPatron('short', s, o).ok);
  assert.ok(C.comprobarPatron('load', l, o).ok);
  assert.ok(!C.comprobarPatron('open', l).ok, 'open con la carga puesta');
  assert.ok(!C.comprobarPatron('short', l, o).ok, 'short con la carga puesta');
  assert.ok(!C.comprobarPatron('short', o, o).ok, 'short con el open puesto');
  assert.ok(!C.comprobarPatron('load', o, o).ok, 'load con el open puesto');
});

test('calibracion: la repetibilidad con la carga reconectada es buena, y mala con un OPEN', async () => {
  const d = new DriverSimulado();
  const { seg } = await calibrarTramo(d, 6e8, 1.3e9, 201);
  d.setEstandar('load');
  assert.ok(C.repetibilidadDb(seg, await d.scan(6e8, 1.3e9, 201, () => {}, 'log', { bruto: true })) < -30);
  d.setEstandar('open');
  assert.ok(C.repetibilidadDb(seg, await d.scan(6e8, 1.3e9, 201, () => {}, 'log', { bruto: true })) > -3);
});

test('calibracion: ida y vuelta por JSON conserva el resultado', async () => {
  const d = new DriverSimulado();
  const { seg } = await calibrarTramo(d, 6e8, 1.3e9, 201);
  const juego = { id: 'x', nombre: 'n', fecha: 1, segmentos: [seg] };
  const copia = C.juegoDeJSON(JSON.parse(JSON.stringify(C.juegoAJSON(juego))));
  d.setEstandar('antena');
  const bruto = await d.scan(7e8, 1.2e9, 100, () => {}, 'log', { bruto: true });
  const a = C.corregir(juego, bruto), b = C.corregir(copia, bruto);
  for (let i = 0; i < a.freq.length; i++) cercano(a.re[i], b.re[i], 1e-6);
});

test('analisis: el rizado en la falda de una resonancia no cuenta como resonancia', () => {
  // Lorentziana de 21 dB a 871 MHz con ruido; la falda tiene baches de ~0.1 dB que antes daban "picos" falsos
  const n = 601, freq = new Float64Array(n), rl = new Float64Array(n), vswr = new Float64Array(n);
  let sem = 7; const ruido = () => ((sem = (sem * 16807) % 2147483647) / 2147483647 - 0.5);
  for (let i = 0; i < n; i++) {
    freq[i] = 776.7e6 * Math.pow(957e6 / 776.7e6, i / (n - 1));
    const x = (2 * 12 * (freq[i] - 871e6)) / 871e6;
    rl[i] = -10 * Math.log10(1 - 0.99 / (1 + x * x)) + ruido() * 0.2;
    vswr[i] = 1;
  }
  const p = A.resonancias({ freq, rl, vswr });
  assert.equal(p.length, 1, `picos: ${p.map(q => (q.f / 1e6).toFixed(1) + '@' + q.rl.toFixed(1)).join(', ')}`);
  assert.ok(Math.abs(p[0].f - 871e6) < 3e6);
});

test('analisis: con calibracion de la app y afinado solo aparece la resonancia real', async () => {
  const d = new DriverSimulado(), rangos = [[776.7e6, 862.15e6], [862.15e6, 957e6]], segs = [];
  for (const [a, b] of rangos) {
    const m = {};
    for (const t of ['open', 'short', 'load']) { d.setEstandar(t); m[t] = await d.scan(a, b, 401, () => {}, 'lineal', { bruto: true }); }
    segs.push(C.calcularTramo(m.open.freq, m.open, m.short, m.load, {}));
  }
  d.setEstandar('antena');
  const esc = async (a, b, n, esp) => C.corregir({ segmentos: segs }, await d.scan(a, b, n, () => {}, esp, { bruto: true }));
  for (let it = 0; it < 15; it++) {
    let crudo = await esc(776.7e6, 957e6, 601, 'log');
    for (const w of A.ventanasAfinado(A.resonancias(A.calcular(crudo)), [], 776.7e6, 957e6)) crudo = A.fusionar(crudo, await esc(w.lo, w.hi, w.puntos, 'lineal'));
    const p = A.resonancias(A.calcular(crudo));
    assert.equal(p.length, 1, `iteracion ${it}: ${p.map(q => (q.f / 1e6).toFixed(1) + '@' + q.rl.toFixed(1)).join(', ')}`);
  }
});

test('analisis: los rizados de la falda se listan como posiblemente falsos, aparte de las resonancias', async () => {
  const d = new DriverSimulado();
  const med = A.calcular(await d.scan(776.7e6, 957e6, 601, () => {}, 'log'));
  // inyecta un bache de 0.3 dB en la falda (a ~898 MHz) sin cambiar la resonancia principal
  const i0 = med.freq.findIndex(f => f > 898e6);
  med.rl[i0] += 0.3;
  const picos = A.resonancias(med);
  assert.equal(picos.length, 1);
  const dud = A.resonanciasDudosas(med, picos);
  assert.ok(dud.some(p => Math.abs(p.f - 898e6) < 3e6 && p.dudosa && /falda/.test(p.motivo)), JSON.stringify(dud.map(p => p.f)));
  assert.ok(dud.every(p => Math.abs(p.f - picos[0].f) / picos[0].f > 0.015));
});

// ---- Datos reales del NanoVNA-H (DiSlord 1.2.42) de vna/: contrastan el codigo con Python y con una antena medida ----
const leerS1p = ruta => {
  const f = [], re = [], im = [];
  for (const l of fs.readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    if (!l.trim() || /^[!#]/.test(l)) continue;
    const [a, b, c] = l.trim().split(/\s+/).map(Number); f.push(a); re.push(b); im.push(c);
  }
  return { freq: Float64Array.from(f), re: Float64Array.from(re), im: Float64Array.from(im) };
};
const datosReales = ruta => new URL(`./datos/${ruta}`, import.meta.url);

test('calibracion real: la correccion en JS coincide con la de vna/calibracion.py (OSL real de 50 kHz a 2,7 GHz)', () => {
  const d = JSON.parse(fs.readFileSync(datosReales('cal_real_dislord.json'), 'utf8'));
  const T = o => ({ freq: Float64Array.from(d.f), re: Float64Array.from(o.re), im: Float64Array.from(o.im) });
  const juego = { segmentos: [C.calcularTramo(T(d.open).freq, T(d.open), T(d.short), T(d.load), {})] };
  for (const [nombre, v] of Object.entries(d.pruebas)) {
    const js = C.corregir(juego, T(v.bruto));
    for (let i = 0; i < d.f.length; i++) {
      assert.ok(Math.hypot(js.re[i] - v.py.re[i], js.im[i] - v.py.im[i]) < 1e-9, `${nombre} @ ${d.f[i]} Hz`);
    }
  }
  // y los patrones reales, corregidos, caen en +1, -1 y 0
  for (const [k, ideal] of [['open', [1, 0]], ['short', [-1, 0]], ['load', [0, 0]]]) {
    const js = C.corregir(juego, T(d[k]));
    for (let i = 0; i < d.f.length; i++) assert.ok(Math.hypot(js.re[i] - ideal[0], js.im[i] - ideal[1]) < 1e-9, `${k} @ ${d.f[i]}`);
  }
});

test('analisis real: antena de 868 MHz medida (antena_868_cal.s1p) da lo mismo que vna/medir_antena.py', () => {
  const m = A.calcular(leerS1p(datosReales('antena_868_real.s1p')));
  const p = A.resonancias(m);
  assert.equal(p.length, 1, p.map(q => (q.f / 1e6).toFixed(1)).join(','));
  // medir_antena.py: minimo de S11 a 827,5 MHz (-23,1 dB), banda a -10 dB de 757,5 a 917,5 MHz
  assert.ok(Math.abs(p[0].f - 827.5e6) <= 2.5e6, `f ${p[0].f}`);
  assert.ok(Math.abs(p[0].rl - 23.1) < 0.2, `rl ${p[0].rl}`);
  assert.ok(Math.abs(p[0].fLo - 757.5e6) <= 2.5e6 && Math.abs(p[0].fHi - 917.5e6) <= 2.5e6, `${p[0].fLo} ${p[0].fHi}`);
  // objetivo ISM 868 (863-870): la banda a -10 dB la cubre entera
  const r = A.recomendacion(m, p, { fMin: 863e6, fMax: 870e6 }, 10);
  assert.equal(r.accion, 'ok');
  // y si el objetivo fuese 2,4 GHz no hay nada alli: no debe recomendar alargar/cortar por una resonancia lejana
  const r2 = A.recomendacion(m, p, { fMin: 2400e6, fMax: 2483.5e6 }, 10);
  assert.equal(r2.accion, 'sin_resonancia');
});

test('calibracion real: los patrones buenos del NanoVNA pasan las comprobaciones en cualquier tramo, y los mal puestos no', () => {
  const d = JSON.parse(fs.readFileSync(datosReales('cal_real_dislord.json'), 'utf8'));
  const sub = (o, a, b) => ({ re: Float64Array.from(o.re.slice(a, b)), im: Float64Array.from(o.im.slice(a, b)) });
  for (const [a, b] of [[0, 101], [0, 30], [30, 60], [60, 101], [75, 101]]) {
    const o = sub(d.open, a, b), s = sub(d.short, a, b), l = sub(d.load, a, b), tag = `${(d.f[a] / 1e6).toFixed(0)}-${(d.f[b - 1] / 1e6).toFixed(0)} MHz`;
    assert.ok(C.comprobarPatron('open', o, null).ok, `open ${tag}`);
    assert.ok(C.comprobarPatron('short', s, o).ok, `short ${tag}`);
    assert.ok(C.comprobarPatron('load', l, o).ok, `load ${tag}: ${C.comprobarPatron('load', l, o).mensaje}`);
    // errores de conexion: un OPEN puesto como carga, o un SHORT como carga
    assert.ok(!C.comprobarPatron('load', o, o).ok, `OPEN como carga ${tag}`);
    assert.ok(!C.comprobarPatron('load', s, o).ok, `SHORT como carga ${tag}`);
    assert.ok(!C.comprobarPatron('short', l, o).ok, `carga como SHORT ${tag}`);
  }
});

// ---------- Fallos de conexion (Fase 0) ----------
import { ErrorEquipo } from '../js/drivers/nanovna-h.js';

async function intentar(emuOpts = {}, serialOpts = {}) {
  const emu = new EmuladorNanoVNA(emuOpts);
  const puerto = instalarSerial(emu, serialOpts);
  const drv = new DriverNanoVNAH();
  drv.escalaTiempo = 0.02; // esperas 50 veces mas cortas
  return { emu, puerto, drv };
}
const conCodigo = codigo => e => e instanceof ErrorEquipo && e.codigo === codigo;

test('conexion: si el usuario cancela el selector de puerto, es un error "cancelado"', async () => {
  const { drv } = await intentar({}, { falloRequest: 'NotFoundError' });
  await assert.rejects(drv.connect(), conCodigo('cancelado'));
});

test('conexion: puerto ocupado por otro programa da un mensaje con pistas', async () => {
  const { drv } = await intentar({}, { falloAbrir: 'InvalidStateError' });
  await assert.rejects(drv.connect(), e => conCodigo('ocupado')(e) && /otro programa/.test(e.message) && /Arduino/.test(e.message));
});

test('conexion: un equipo que no responde falla pronto con "sin_respuesta" y deja el puerto cerrado', async () => {
  const { drv } = await intentar({ mudo: true });
  const t0 = Date.now();
  await assert.rejects(drv.connect(), conCodigo('sin_respuesta'));
  assert.ok(Date.now() - t0 < 1500, 'tardo demasiado');
  assert.equal(drv.port, null);
});

test('conexion: un dispositivo que no es NanoVNA conecta pero con aviso', async () => {
  const { drv } = await intentar({ version: 'Arduino Uno bootloader' });
  await drv.connect();
  assert.match(drv.aviso, /no se identifica como NanoVNA/);
  await drv.disconnect();
});

test('conexion: un NanoVNA reconocido no lleva aviso', async () => {
  const { drv } = await intentar();
  await drv.connect();
  assert.equal(drv.aviso, '');
  await drv.disconnect();
});

test('desenchufar el cable a mitad de un barrido falla enseguida con "desconectado" (sin esperar 20 s)', async () => {
  const { drv } = await intentar({ cortarEnScan: 2 });
  await drv.connect();
  const t0 = Date.now();
  await assert.rejects(drv.scan(1e6, 100e6, 500, () => {}, 'lineal'), conCodigo('desconectado'));
  assert.ok(Date.now() - t0 < 1500, 'espero al timeout en vez de detectar el corte');
  // y las ordenes siguientes tambien fallan claramente
  await assert.rejects(drv.scan(1e6, 2e6, 10, () => {}, 'lineal'), conCodigo('desconectado'));
  await drv.disconnect();
});

test('desenchufar durante una medida en bruto no deja la orden colgada al restaurar el equipo', async () => {
  const { drv } = await intentar({ cortarEnScan: 1 });
  await drv.connect();
  const t0 = Date.now();
  await assert.rejects(drv.scan(1e6, 20e6, 150, () => {}, 'lineal', { bruto: true }), conCodigo('desconectado'));
  assert.ok(Date.now() - t0 < 1500);
  await drv.disconnect();
});

test('el evento disconnect con el equipo en reposo avisa a la interfaz (alPerder)', async () => {
  const { drv, puerto } = await intentar();
  await drv.connect();
  let aviso = null;
  drv.alPerder = m => { aviso = m; };
  puerto.desenchufar();
  await new Promise(r => setTimeout(r, 20));
  assert.match(aviso ?? '', /desconect/i);
  await assert.rejects(drv._cmd('version'), conCodigo('desconectado'));
  await drv.disconnect();
});

test('dos ordenes a la vez: la segunda se rechaza claramente en vez de pisar a la primera', async () => {
  const { drv } = await intentar();
  await drv.connect();
  const a = drv._cmd('version', 3000);
  await assert.rejects(drv._cmd('sweep', 3000), conCodigo('ocupado_interno'));
  assert.match(await a, /DiSlord/);
  await drv.disconnect();
});

test('desconectar a propósito no se confunde con una perdida de conexion', async () => {
  const { drv } = await intentar();
  await drv.connect();
  let avisos = 0;
  drv.alPerder = () => avisos++;
  await drv.disconnect();
  await new Promise(r => setTimeout(r, 20));
  assert.equal(avisos, 0);
});

// ---------- Diagnostico para el equipo real ----------
import { ejecutarDiagnostico } from '../js/diagnostico.js';

test('diagnostico: con el emulador todos los pasos pasan, incluida la ida y vuelta en bruto', async () => {
  const { emu, drv } = await conectado();
  emu.barrido = [111111, 222222222, 303];
  const r = await ejecutarDiagnostico(drv, { bruto: true });
  const fallos = r.pasos.filter(p => p.ok === false).map(p => `${p.nombre}: ${p.texto}`);
  assert.deepEqual(fallos, []);
  assert.ok(r.pasos.some(p => /Ida y vuelta/.test(p.nombre)));
  assert.equal(emu.calActiva, true);
  assert.deepEqual(emu.barrido, [111111, 222222222, 303]);
  assert.ok(!emu.log.some(c => /^save/.test(c)), 'nunca debe enviar save');
  const lim = r.pasos.find(p => /Límite/.test(p.nombre));
  assert.equal(lim.datos.max, 101);
  assert.match(r.resumen, /todo correcto/);
  await drv.disconnect();
});

test('diagnostico: detecta un equipo que devuelve puntos de menos y lo cuenta en el informe', async () => {
  const { drv } = await conectado({ devolverDeMenos: true });
  const r = await ejecutarDiagnostico(drv);
  assert.ok(r.pasos.some(p => p.ok === false));
  assert.match(r.resumen, /con fallo/);
  await drv.disconnect();
});

test('diagnostico: sin la prueba en bruto no toca cal ni sweep del equipo', async () => {
  const { emu, drv } = await conectado();
  await ejecutarDiagnostico(drv, { bruto: false });
  assert.ok(!emu.log.includes('cal off') && !emu.log.includes('cal on'));
  assert.ok(!emu.log.some(c => /^sweep \d/.test(c)), 'no debe escribir sweep');
  await drv.disconnect();
});

test('diagnostico: con el controlador simulado se omite el shell y no falla', async () => {
  const r = await ejecutarDiagnostico(new DriverSimulado(), { bruto: true });
  assert.ok(!r.pasos.some(p => p.ok === false), JSON.stringify(r.pasos.filter(p => p.ok === false)));
  assert.ok(r.pasos.some(p => p.nombre === 'Shell del equipo'));
});

test('bandas.json: las regiones de Meshtastic caen dentro de la banda libre que les corresponde', () => {
  const m = cfg.bandas.filter(b => b.servicio === 'meshtastic');
  assert.ok(m.length >= 4);
  const eu868 = m.find(b => /EU_868/.test(b.nombre));
  assert.deepEqual([eu868.f_min, eu868.f_max], [869.4, 869.65]);
  const srd = cfg.bandas.find(b => /868 MHz SRD/.test(b.nombre));
  assert.ok(eu868.f_min >= srd.f_min && eu868.f_max <= srd.f_max, 'EU_868 fuera de 863-870');
  const eu433 = m.find(b => /EU_433/.test(b.nombre)), i433 = cfg.bandas.find(b => b.nombre === '433 MHz');
  assert.ok(eu433.f_min >= i433.f_min - 0.1 && eu433.f_max <= i433.f_max);
  // y salen en la lista de bandas de Europa pero no en la de EE.UU.
  const nombres = r => A.bandasDeRegion(cfg.bandas, r).filter(b => b.servicio === 'meshtastic').map(b => b.nombre);
  assert.ok(nombres('eu').length >= 3 && nombres('us').length === 0);
  // 9 cm de EE.UU.: 3300-3450 (el acceso a 3450-3500 terminó en 2022)
  assert.equal(cfg.bandas.find(b => b.nombre === '9 cm' && b.region.includes('R2')).f_max, 3450);
});

test('modo Simple: la recomendacion y el veredicto hablan en ROE, sin dB; el modo Avanzado mantiene dB y VSWR', async () => {
  const med = await barrido(776.7e6, 957e6, 601);
  const picos = A.resonancias(med);
  const obj = { fMin: 863e6, fMax: 870e6 };
  const reco = A.recomendacion(med, picos, obj, 10, 'roe'), vere = A.veredicto(picos, [], 10, 'roe');
  const txtSimple = [reco.titulo, ...reco.lineas, vere.titulo, ...vere.lineas].join('\n');
  assert.match(txtSimple, /ROE \d\.\d\d/);
  assert.ok(!/\bdB\b/.test(txtSimple), `aparece dB en modo simple:\n${txtSimple}`);
  assert.match(vere.lineas.join(' '), /ROE de 1\.92 o mejor/);
  const txtAvz = [...A.recomendacion(med, picos, obj, 10).lineas, ...A.veredicto(picos, [], 10).lineas].join('\n');
  assert.match(txtAvz, /dB/);
  assert.match(txtAvz, /VSWR/);
  // la conversion es la de siempre: 10 dB de perdida de retorno son ROE 1,92
  cercano(A.roeDeRl(10), 1.925, 0.005);
  cercano(A.roeDeRl(20), 1.222, 0.005);
});

test('modo Simple: una antena mal adaptada se explica en ROE', async () => {
  const med = await barrido(2000e6, 2900e6, 401); // la simulada resuena a 2440 con gmin 0,22 (RL ~13 dB): se exige 20 dB
  const picos = A.resonancias(med, 20);
  const v = A.veredicto(picos, [], 20, 'roe');
  assert.match(v.lineas.join(' ') + v.titulo, /ROE/);
  assert.ok(!/ dB\b/.test(v.titulo + v.lineas.join(' ')), v.titulo + v.lineas.join(' '));
});
