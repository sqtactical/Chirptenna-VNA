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

test('modo Simple: el criterio es ROE 2 (9,54 dB) y se explica con el porcentaje de potencia reflejada', async () => {
  const u = 20 * Math.log10(3);
  cercano(A.roeDeRl(u), 2, 1e-9);
  const med = await barrido(776.7e6, 957e6, 601);
  const v = A.veredicto(A.resonancias(med, u), [], u, 'roe');
  const t = [v.titulo, ...v.lineas].join('\n');
  assert.match(t, /ROE de 2 o mejor: \d/);          // con espacio tras los dos puntos
  assert.match(t, /Criterio: ROE de 2 o mejor\. Con ese valor se refleja como máximo un 11 % de la potencia/);
  assert.ok(!/\bdB\b/.test(t), t);
  // ROE 2 es un criterio algo mas laxo que 10 dB: el ancho de banda sale igual o mayor
  const a2 = A.resonancias(med, u)[0], a10 = A.resonancias(med, 10)[0];
  assert.ok(a2.fHi - a2.fLo >= a10.fHi - a10.fLo);
});



// ---------- Modo Simple con curvas complejas: se juzga la BANDA objetivo, no la mejor resonancia del rango ----------
const U_SIMPLE = 20 * Math.log10(3);
const BANDA_868 = { servicio: 'ism', nombre: '868 MHz SRD', region: ['EU'], f_min: 863, f_max: 870 };
const OBJ_868 = { fMin: 863e6, fMax: 870e6, banda: BANDA_868 };
const curva = g => {
  const n = 601, f0 = 776.7e6, f1 = 957e6;
  const freq = Float64Array.from({ length: n }, (_, i) => f0 * (f1 / f0) ** (i / (n - 1)));
  const re = new Float64Array(n), im = new Float64Array(n);
  freq.forEach((f, i) => { const [a, b] = g(f / 1e6); re[i] = a; im[i] = b; });
  return A.calcular({ freq, re, im });
};
const dipo = (f, f0, q, gmin) => 1 - (1 - gmin ** 2) / (1 + (2 * q * (f - f0) / f0) ** 2);
const polar = (m, f) => [m * Math.cos(f / 9), m * Math.sin(f / 9)];
const analizar = med => {
  const picos = A.resonancias(med, U_SIMPLE), ev = A.evaluarBandas(med, [BANDA_868], U_SIMPLE, 2.7e9);
  return { picos, ev, reco: A.recomendacion(med, picos, OBJ_868, U_SIMPLE, 'roe'), ver: A.veredicto(picos, ev, U_SIMPLE, 'roe', { medida: med, obj: OBJ_868 }) };
};
const texto = r => [r.reco.titulo, ...r.reco.lineas, r.ver.titulo, ...r.ver.lineas].join('\n');

test('modo Simple, curva ondulada: el consejo sale de la banda (mal acoplada), no de un valle bueno en otro sitio', () => {
  const r = analizar(curva(f => polar(0.45 + 0.25 * Math.cos(2 * Math.PI * f / 28), f)));
  assert.equal(r.reco.accion, 'irregular');
  assert.match(r.ver.titulo, /mal acoplada en el peor punto/);
  assert.ok(r.ver.lineas.includes('No transmitir salvo emergencias.'), r.ver.lineas.join('\n'));
  assert.ok(!texto(r).includes('Se puede usar con normalidad'), texto(r));
  assert.ok(!/Acorta|Alarga/.test(r.reco.titulo));
  assert.match(r.ver.lineas.join('\n'), /fuera de esta banda/);
});

test('modo Simple, dos valles hondos a cada lado del objetivo: curva irregular y banda mala', () => {
  const r = analizar(curva(f => polar(Math.sqrt(Math.min(dipo(f, 850, 40, 0.05), dipo(f, 885, 40, 0.05))), f)));
  assert.equal(r.reco.accion, 'irregular');
  assert.match(r.reco.lineas.join('\n'), /2 mínimos de ROE a ambos lados/);
  assert.match(r.ver.titulo, /mal acoplada/);
  assert.ok(!texto(r).includes('Se puede usar con normalidad'));
});

test('modo Simple, rizado alrededor de ROE 2 dentro de la banda: mejorable, con la parte buena indicada', () => {
  const r = analizar(curva(f => polar(0.33 + 0.07 * Math.cos(2 * Math.PI * f / 5), f)));
  assert.equal(r.reco.accion, 'irregular');
  assert.match(r.ver.titulo, /mejorable en el peor punto/);
  assert.ok(r.ver.lineas.includes('Transmitir poco y a potencia reducida.'));
  assert.match(r.ver.lineas.join('\n'), /Solo el \d+ % de la banda llega a ROE de 2 o mejor/);
});

test('modo Simple, antena normal bien centrada: no se marca como irregular y el consejo es de uso normal', async () => {
  const med = await barrido(776.7e6, 957e6, 601);
  const r = analizar(med);
  assert.notEqual(r.reco.accion, 'irregular');
  assert.match(r.ver.titulo, /ISM 868 MHz SRD: ROE entre 1\.\d\d y 1\.\d\d/);
  assert.ok(r.ver.lineas.includes('Se puede usar con normalidad.'), r.ver.lineas.join('\n'));
  assert.match(r.reco.lineas[0], /^En la banda \(863\.00 MHz a 870\.00 MHz\): ROE entre/);
});

test('modo Simple: el ruido sobre un unico valle no se toma por curva irregular', async () => {
  for (let it = 0; it < 12; it++) {
    const med = await barrido(776.7e6, 957e6, 601); // el simulador pone ruido aleatorio en cada barrido
    const picos = A.resonancias(med, U_SIMPLE);
    assert.equal(A.curvaIrregular(med, picos, OBJ_868, U_SIMPLE), null, `iteracion ${it}`);
  }
});

test('modo Simple: una unica resonancia mal centrada sigue dando alargar/acortar, con el nivel de la banda', () => {
  // un valle ancho a 905 MHz (la banda objetivo esta a 866 MHz): hay que acortar, y la banda no es utilizable
  const r = analizar(curva(f => polar(Math.sqrt(dipo(f, 905, 12, 0.1)), f)));
  assert.ok(['alargar', 'cortar'].includes(r.reco.accion), r.reco.accion);
  assert.match(r.ver.titulo, /acoplada|mejorable|aceptable/);
  assert.ok(r.reco.est.roeMax > 1);
});

test('modo Simple, frecuencia exacta: se juzga ese punto', async () => {
  const med = await barrido(776.7e6, 957e6, 601);
  const f = 871e6, obj = { fMin: f, fMax: f, banda: { servicio: 'objetivo', nombre: '871.000 MHz', region: [], f_min: 871, f_max: 871 } };
  const picos = A.resonancias(med, U_SIMPLE);
  const v = A.veredicto(picos, A.evaluarBandas(med, [obj.banda], U_SIMPLE, 2.7e9), U_SIMPLE, 'roe', { medida: med, obj });
  assert.match(v.titulo, /^871\.00\d? MHz: ROE 1\.\d\d \(muy bien acoplada\)\.$/);
  assert.equal(v.lineas[0], 'Se puede usar con normalidad.');
});

test('modo Simple, barrido general: sin consejo global, remite a la tabla de bandas (que da el rango de ROE de cada una)', async () => {
  const med = await barrido(776.7e6, 957e6, 601);
  const ev = A.evaluarBandas(med, [BANDA_868], U_SIMPLE, 2.7e9);
  const picos = A.resonancias(med, U_SIMPLE);
  const v = A.veredicto(picos, ev, U_SIMPLE, 'roe');
  assert.ok(!v.lineas.some(l => /Se puede usar|Transmitir poco|No transmitir/.test(l)));
  assert.ok(v.lineas.some(l => /tabla de bandas/.test(l)));
  assert.ok(ev[0].peorVswr >= ev[0].vMejor);
});

test('modo Simple: niveles de ROE y consejos (1-1,5 muy bien, 1,5-2 aceptable, 2-3 mejorable, mas de 3 mal)', () => {
  const n = r => A.nivelROE(r).id;
  assert.equal(n(1), 'muy_bien'); assert.equal(n(1.5), 'muy_bien');
  assert.equal(n(1.51), 'aceptable'); assert.equal(n(2), 'aceptable');
  assert.equal(n(2.01), 'mejorable'); assert.equal(n(3), 'mejorable');
  assert.equal(n(3.01), 'mal'); assert.equal(n(50), 'mal');
  assert.deepEqual(A.NIVELES_ROE.map(x => x.etiqueta), ['Muy bien acoplada', 'Aceptable', 'Mejorable', 'Mal acoplada']);
  assert.equal(A.nivelROE(2.5).consejo, 'Transmitir poco y a potencia reducida');
  assert.equal(A.nivelROE(4).consejo, 'No transmitir salvo emergencias');
  cercano(A.NIVELES_ROE[1].max, A.roeDeRl(U_SIMPLE), 1e-9); // el limite de "Aceptable" es el criterio del modo Simple (ROE 2)
});

// ---------- Minimo de ROE frente a resonancia electrica (X = 0) ----------
const zModelo = (f, f0, rDe) => {
  // Z = R(f) + jX(f): resonancia serie en f0 (X = 0) y una resistencia que crece con f, asi que el mejor ajuste a 50 ohm queda por encima
  const R = rDe(f), X = 60 * (f / f0 - f0 / f);
  const den = (R + 50) ** 2 + X * X;
  return [(R * R + X * X - 2500) / den, (100 * X) / den]; // Gamma = (Z - 50) / (Z + 50)
};
const curvaZ = (f0, rDe, a = 0.8, b = 1.3) => {
  const n = 801, freq = Float64Array.from({ length: n }, (_, i) => f0 * a * (b / a) ** (i / (n - 1)));
  const re = new Float64Array(n), im = new Float64Array(n);
  freq.forEach((f, i) => { [re[i], im[i]] = zModelo(f, f0, rDe); });
  return A.calcular({ freq, re, im });
};

test('X = 0: se encuentra el cruce de reactancia y su desviacion respecto al minimo de ROE', () => {
  const f0 = 866e6, med = curvaZ(f0, f => 20 * (f / f0) ** 8);
  const picos = A.resonancias(med, 5, 0.5);
  assert.ok(picos.length >= 1);
  const p = picos[0];
  assert.ok(p.f > f0 * 1.05, `el minimo de ROE deberia quedar por encima de la resonancia: ${p.f / f0}`);
  const rx = A.reactanciaCero(med, p.f);
  assert.equal(rx.tipo, 'serie');
  cercano(rx.fX, f0, f0 * 0.002, 'X = 0 en f0');
  assert.ok(rx.desv < -A.DESV_REACTANCIA, `desv ${rx.desv}`);
});

test('X = 0: si coincide con el minimo de ROE no se avisa (resistencia constante)', () => {
  const f0 = 866e6, med = curvaZ(f0, () => 50, 0.9, 1.1); // R = 50: el minimo es justo X = 0
  const picos = A.resonancias(med, 10, 3);
  const rx = A.reactanciaCero(med, picos[0].f);
  assert.ok(Math.abs(rx.desv) < 0.005, `desv ${rx.desv}`);
  const r = A.recomendacion(med, picos, { fMin: 863e6, fMax: 870e6 }, U_SIMPLE, 'roe');
  assert.ok(!r.lineas.some(l => /resuena eléctricamente/.test(l)));
});

test('X = 0: la recomendacion avisa cuando minimo de ROE y reactancia cero no coinciden, en Simple y en Avanzado', () => {
  const f0 = 866e6, med = curvaZ(f0, f => 20 * (f / f0) ** 8);
  const obj = { fMin: 863e6, fMax: 870e6 };
  for (const unidad of ['roe', 'rl']) {
    const u = unidad === 'roe' ? U_SIMPLE : 10, picos = A.resonancias(med, u, 0.5);
    const r = A.recomendacion(med, picos, obj, u, unidad);
    const aviso = r.lineas.find(l => /resuena eléctricamente/.test(l));
    assert.ok(aviso, `${unidad}: ${r.accion}\n${r.lineas.join('\n')}`);
    assert.match(aviso, /por debajo de donde mejor se adapta/);
    assert.match(aviso, /el porcentaje de longitud puede no ser fiable/);
    if (unidad === 'roe') assert.ok(!/\bdB\b/.test(aviso));
  }
});

test('X = 0: sin cruce de reactancia cerca no hay aviso ni error', () => {
  const med = curvaZ(866e6, () => 50, 1.5, 1.8); // lejos de la resonancia: X nunca cruza cerca
  assert.equal(A.reactanciaCero(med, 1.6 * 866e6, 0.03), null);
});

test('marcasReactancia: devuelve los cruces X = 0 junto a los minimos de ROE, sin duplicados ni resonancias en paralelo', () => {
  const f0 = 866e6, med = curvaZ(f0, f => 20 * (f / f0) ** 8);
  const picos = A.resonancias(med, 5, 0.5);
  const marcas = A.marcasReactancia(med, picos);
  assert.equal(marcas.length, 1);
  cercano(marcas[0].fX, f0, f0 * 0.002);
  assert.ok(marcas[0].fMin > f0 * 1.05);
  assert.deepEqual(A.marcasReactancia(med, []), []);
  // dos picos que apuntan al mismo cruce dan una sola marca
  const doble = [picos[0], { ...picos[0], f: picos[0].f * 1.01 }];
  assert.equal(A.marcasReactancia(med, doble).length, 1);
});

test('antena simulada con trampas y bobina de carga (HF): minimos a ~6,9 / ~14,3 / ~18,5 MHz y consejos distintos por banda', async () => {
  const d = new DriverSimulado(); d.antena = 'trampas';
  const med = async (a, b) => A.calcular(await d.scan(a * 0.9e6, b * 1.1e6, 601, () => {}, 'log'));
  const juzgar = async (nombre, a, b) => {
    const m = await med(a, b), banda = { servicio: 'ham', nombre, region: ['R1'], f_min: a, f_max: b }, obj = { fMin: a * 1e6, fMax: b * 1e6, banda };
    const picos = A.resonancias(m, U_SIMPLE);
    return { picos, reco: A.recomendacion(m, picos, obj, U_SIMPLE, 'roe'), ver: A.veredicto(picos, A.evaluarBandas(m, [banda], U_SIMPLE, 2.7e9), U_SIMPLE, 'roe', { medida: m, obj }) };
  };
  const b40 = await juzgar('40 m', 7.0, 7.2), b20 = await juzgar('20 m', 14.0, 14.35), b17 = await juzgar('17 m', 18.068, 18.168);
  cercano(b40.picos[0].f, 6.95e6, 0.1e6, 'minimo 40 m');
  cercano(b20.picos[0].f, 14.33e6, 0.1e6, 'minimo 20 m');
  cercano(b17.picos[0].f, 18.52e6, 0.15e6, 'armonico cerca de 17 m');
  // 40 m: resuena por debajo -> acortar; 20 m: resuena por encima -> alargar (consejos opuestos en una misma antena)
  assert.equal(b40.reco.accion, 'cortar');
  assert.equal(b20.reco.accion, 'alargar');
  // en ninguna de las tres la banda completa es utilizable (resonancias estrechas por la carga): nunca "se puede usar con normalidad" sin motivo
  for (const b of [b40, b20, b17]) assert.ok(b.ver.lineas.some(l => /No transmitir|Transmitir poco/.test(l)), b.ver.lineas.join('\n'));
  // 17 m: el minimo de ROE esta fuera de la banda y lo dice
  assert.match(b17.ver.lineas.join('\n'), /fuera de esta banda/);
  // la antena predeterminada no cambia
  const d2 = new DriverSimulado();
  const m2 = A.calcular(await d2.scan(776.7e6, 957e6, 601, () => {}, 'log'));
  cercano(A.resonancias(m2, U_SIMPLE)[0].f, 871e6, 3e6);
});

test('multibanda: con otras resonancias a la vista, el consejo es por tramo y no un factor global (40 m = tramo exterior, 20 m = interior)', async () => {
  const d = new DriverSimulado(); d.antena = 'trampas';
  const m = A.calcular(await d.scan(3e6, 32e6, 1500, () => {}, 'log'));   // rango ancho: se ven 6,95, 14,33 y 18,5 MHz
  const picos = A.resonancias(m, U_SIMPLE);
  const juzgar = (a, b) => A.recomendacion(m, picos, { fMin: a * 1e6, fMax: b * 1e6 }, U_SIMPLE, 'roe');
  const r40 = juzgar(7.0, 7.2), r20 = juzgar(14.0, 14.35);
  assert.equal(r40.accion, 'cortar'); assert.equal(r20.accion, 'alargar');
  for (const r of [r40, r20]) {
    assert.ok(r.multibanda, r.titulo);
    assert.ok(!r.lineas.some(l => /Multiplica sus dimensiones/.test(l)), r.lineas.join('\n'));
    assert.match(r.titulo, /el tramo que gobierna esta banda/);
    assert.ok(r.lineas.some(l => /parece multibanda/.test(l)));
    assert.ok(r.lineas.some(l => /una banda cada vez/.test(l)));
  }
  assert.equal(r40.multibanda.posicion, 'baja');
  assert.ok(r40.lineas.some(l => /tramo exterior/.test(l) && /acortar/.test(l)));
  assert.equal(r20.multibanda.posicion, 'alta'); // por debajo esta el 40 m; el armonico de 18,5 MHz queda a menos de un 40 % por encima
  assert.ok(r20.lineas.some(l => /tramo interior/.test(l)));
  assert.ok(r20.lineas.some(l => /alargar/.test(l)));
});

test('multibanda: si el usuario lo indica y no hay otras resonancias a la vista, da el consejo generico por tramo', async () => {
  const d = new DriverSimulado(); d.antena = 'trampas';
  const m = A.calcular(await d.scan(6.3e6, 7.9e6, 601, () => {}, 'log'));  // solo se ve el 40 m
  const picos = A.resonancias(m, U_SIMPLE), obj = { fMin: 7.0e6, fMax: 7.2e6 };
  const normal = A.recomendacion(m, picos, obj, U_SIMPLE, 'roe');
  assert.equal(normal.multibanda, null);
  assert.ok(normal.lineas.some(l => /Multiplica sus dimensiones por 0\.9/.test(l)), 'sin indicarlo, el consejo sigue siendo global');
  const r = A.recomendacion(m, picos, obj, U_SIMPLE, 'roe', { multibanda: true });
  assert.equal(r.multibanda.indicado, true);
  assert.equal(r.multibanda.posicion, null);
  assert.match(r.titulo, /^Acorta un \d\.\d % el tramo que gobierna esta banda$/);
  assert.ok(r.lineas.some(l => /Has indicado que la antena es multibanda/.test(l)));
  assert.ok(!r.lineas.some(l => /Multiplica sus dimensiones/.test(l)));
});

test('multibanda: una antena de una banda no se marca como multibanda', async () => {
  const m = await barrido(776.7e6, 957e6, 601);
  const picos = A.resonancias(m, U_SIMPLE);
  assert.equal(A.infoMultibanda(picos, 866.5e6), null);
  const r = A.recomendacion(m, picos, { fMin: 863e6, fMax: 870e6 }, 10, 'rl');
  assert.equal(r.multibanda ?? null, null);
});

// ---------- Segmentos por modo en HF ----------
const segCfg = JSON.parse(fs.readFileSync(new URL('../segmentos_hf.json', import.meta.url), 'utf8'));
const bandaHF = (nombre, region) => cfg.bandas.find(b => b.nombre === nombre && (b.region.includes(region) || b.region.includes('global')));

test('segmentos_hf.json: cada segmento cae dentro de su banda (R1 y EE. UU.), no se solapan y los digitales de WSJT-X estan dentro', () => {
  for (const [nombre, regiones] of Object.entries(segCfg.bandas)) {
    for (const [reg, lista] of Object.entries(regiones)) {
      const banda = bandaHF(nombre, reg === 'US' ? 'R2' : 'R1');
      assert.ok(banda, `${nombre} ${reg}: no esta en bandas.json`);
      const orden = [...lista].sort((a, b) => a.f_min - b.f_min);
      orden.forEach((s, i) => {
        assert.ok(s.f_min < s.f_max, `${nombre} ${reg} ${s.id}`);
        assert.ok(s.f_min >= banda.f_min - 1e-9 && s.f_max <= banda.f_max + 1e-9, `${nombre} ${reg} ${s.id} fuera de la banda ${banda.f_min}-${banda.f_max}`);
        if (i) assert.ok(s.f_min >= orden[i - 1].f_max - 1e-9, `${nombre} ${reg}: ${s.id} se solapa con ${orden[i - 1].id}`);
      });
    }
    for (const [modo, dial] of Object.entries(segCfg.digitales[nombre] ?? {})) {
      const banda = bandaHF(nombre, 'R1');
      assert.ok(dial >= banda.f_min && dial + segCfg.ancho_senal_digital_MHz <= banda.f_max, `${nombre} ${modo} ${dial}`);
    }
  }
  // los dial de FT8 verificados en el codigo de WSJT-X
  assert.deepEqual(['160 m', '80 m', '40 m', '30 m', '20 m', '17 m', '15 m', '12 m', '10 m'].map(b => segCfg.digitales[b].ft8), [1.840, 3.573, 7.074, 10.136, 14.074, 18.100, 21.074, 24.915, 28.074]);
});

test('segmentosDeBanda: por region, con FT8/FT4/WSPR como segmentos puntuales de 3 kHz', () => {
  const b40 = bandaHF('40 m', 'R1');
  const eu = A.segmentosDeBanda(segCfg, b40, 'eu'), us = A.segmentosDeBanda(segCfg, bandaHF('40 m', 'R2'), 'us');
  assert.deepEqual(eu.filter(s => !s.puntual).map(s => s.id), ['cw', 'digital', 'fonia']);
  assert.deepEqual(us.filter(s => !s.puntual).map(s => s.id), ['cw_digital', 'fonia']);
  const ft8 = eu.find(s => s.id === 'ft8');
  assert.equal(ft8.puntual, true); cercano(ft8.f_min, 7.074, 1e-9); cercano(ft8.f_max - ft8.f_min, 0.003, 1e-9);
  assert.ok(eu.some(s => s.id === 'ft4') && eu.some(s => s.id === 'wspr'));
  assert.ok(!A.segmentosDeBanda(segCfg, bandaHF('30 m', 'R1'), 'eu').some(s => s.id === 'fonia'), 'en 30 m no hay fonia');
  assert.deepEqual(A.segmentosDeBanda(segCfg, bandaHF('2 m', 'R1'), 'eu'), []);          // no es HF
  assert.deepEqual(A.segmentosDeBanda(null, b40, 'eu'), []);                               // sin fichero
  // region "todas": 80 m de R2 usa los segmentos de EE. UU.
  assert.ok(A.segmentosDeBanda(segCfg, bandaHF('80 m', 'R2'), 'todas').some(s => s.id === 'cw_digital'));
});

test('coberturaSegmentos: la antena de trampas (40 m) va bien en CW, peor en fonia, y se resume por modo', async () => {
  const d = new DriverSimulado(); d.antena = 'trampas';
  const m = A.calcular(await d.scan(6.3e6, 7.9e6, 801, () => {}, 'log'));
  const segs = A.segmentosDeBanda(segCfg, bandaHF('40 m', 'R1'), 'eu');
  const cob = A.coberturaSegmentos(m, segs, U_SIMPLE), por = id => cob.find(f => f.segmento.id === id);
  assert.ok(cob.every(f => f.medido));
  assert.ok(['muy_bien', 'aceptable'].includes(por('cw').nivel.id), `CW: ${por('cw').nivel.id} ${por('cw').est.roeMax}`);
  assert.ok(['mejorable', 'mal'].includes(por('fonia').nivel.id), `fonia: ${por('fonia').nivel.id}`);
  assert.ok(por('cw').est.roeMax < por('fonia').est.roeMax);
  assert.equal(por('ft8').est.sinPuntos, false);
  // fuera de lo medido
  const corto = A.calcular(await d.scan(6.9e6, 7.05e6, 201, () => {}, 'lineal'));
  assert.equal(A.coberturaSegmentos(corto, segs, U_SIMPLE).find(f => f.segmento.id === 'fonia').medido, false);
});

test('remuestrear: interpola en log f y deja NaN fuera de lo medido', () => {
  const fo = Float64Array.from([1e6, 2e6, 4e6]), vo = Float64Array.from([1, 3, 3]);
  const r = A.remuestrear(fo, vo, Float64Array.from([0.5e6, 1e6, Math.sqrt(2) * 1e6, 2e6, 3e6, 8e6]));
  assert.ok(Number.isNaN(r[0]) && Number.isNaN(r[5]));
  cercano(r[1], 1, 1e-9); cercano(r[2], 2, 1e-9); cercano(r[3], 3, 1e-9); cercano(r[4], 3, 1e-9);
});

test('recomendacion: una banda ancha (80 m) avisa de que no se cubre entera y sugiere elegir un segmento', () => {
  // dipolo de 80 m centrado en 3,65 MHz y de Q alta: en los bordes de la banda la ROE sube a ~4
  const f0 = 3.65e6, n = 801, freq = Float64Array.from({ length: n }, (_, i) => 2.8e6 * (4.8 / 2.8) ** (i / (n - 1)));
  const re = new Float64Array(n), im = new Float64Array(n);
  freq.forEach((f, i) => { const R = 40, X = 800 * (f / f0 - f0 / f), den = (R + 50) ** 2 + X * X; re[i] = (R * R + X * X - 2500) / den; im[i] = (100 * X) / den; });
  const m = A.calcular({ freq, re, im }), picos = A.resonancias(m, U_SIMPLE);
  const r = A.recomendacion(m, picos, { fMin: 3.5e6, fMax: 3.8e6 }, U_SIMPLE, 'roe');
  assert.ok(r.lineas.some(l => /Esta banda es ancha \(8 %/.test(l) && /elige el segmento/.test(l)), r.lineas.join('\n'));
  // un segmento estrecho (FT8) no lleva el aviso de banda ancha
  const ft8 = A.recomendacion(m, picos, { fMin: 3.573e6, fMax: 3.576e6 }, U_SIMPLE, 'roe');
  assert.ok(!ft8.lineas.some(l => /Esta banda es ancha/.test(l)));
  assert.ok(A.coberturaSegmentos(m, [{ id: 'ft8', nombre: 'FT8', f_min: 3.573, f_max: 3.576, puntual: true }], U_SIMPLE)[0].nivel.id === 'mejorable'); // ROE ~2,1 a 3,575 MHz: el segmento de FT8 queda un poco fuera
});