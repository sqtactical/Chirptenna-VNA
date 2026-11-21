import { T } from './i18n.js';
import { esIdeal, gammaPatron, resolverTerminos, PATRONES_IDEALES } from './patrones.js';
// Calibracion de un puerto (SOL, 3 terminos) con patrones ideales: OPEN = +1, SHORT = -1, LOAD = 0.
// Mismo modelo y formulas que vna/calibracion.py de Chirptenna:
//   Ed = L;  Es = (a + b) / (a - b);  Er = -2ab / (a - b)   con a = O - L, b = S - L
//   corregido = (m - Ed) / (Er + Es (m - Ed))
// Una calibracion ("juego") se compone de TRAMOS de frecuencia que se pueden medir por separado y en
// momentos distintos. Sin dependencias del DOM (se puede probar con Node).

const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1] || 1e-30; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const par = (x, i) => [x.re[i], x.im[i]];
const nuevo = n => ({ re: new Float64Array(n), im: new Float64Array(n) });
const media = a => { let s = 0; for (const x of a) s += x; return a.length ? s / a.length : 0; };

export class ErrorCalibracion extends Error {
  constructor(msg, faltan = []) { super(msg); this.faltan = faltan; }
}

// o, s, l: { re, im } medidos SIN corregir sobre la rejilla `freq`. Devuelve un tramo listo para guardar.
// meta.patrones (opcional): modelo de los patrones (js/patrones.js); sin él (o ideal) se usa la formula cerrada.
export function calcularTramo(freq, o, s, l, meta = {}) {
  const n = freq.length, ed = nuevo(n), es = nuevo(n), er = nuevo(n);
  const modelo = meta.patrones && !esIdeal(meta.patrones) ? { ...PATRONES_IDEALES, ...meta.patrones } : null;
  for (let i = 0; i < n; i++) {
    if (modelo) {
      const t = resolverTerminos(par(o, i), par(s, i), par(l, i),
        gammaPatron('open', modelo.open, freq[i]), gammaPatron('short', modelo.short, freq[i]), gammaPatron('load', modelo.load, freq[i]));
      [ed.re[i], ed.im[i]] = t.ed; [es.re[i], es.im[i]] = t.es; [er.re[i], er.im[i]] = t.er;
      continue;
    }
    const L = par(l, i), a = csub(par(o, i), L), b = csub(par(s, i), L), den = csub(a, b);
    const ES = cdiv(cadd(a, b), den);
    const ER = cmul(cdiv(cmul(a, b), den), [-2, 0]);
    [ed.re[i], ed.im[i]] = L;
    [es.re[i], es.im[i]] = ES;
    [er.re[i], er.im[i]] = ER;
  }
  return { fecha: Date.now(), freq: Float64Array.from(freq), ed, es, er, ...meta };
}

// Prepara (una sola vez) modulo y fase desenvuelta de Er para interpolar sin saltos de fase.
function preparar(seg) {
  if (seg._p) return seg._p;
  const n = seg.freq.length, mag = new Float64Array(n), fase = new Float64Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    mag[i] = Math.hypot(seg.er.re[i], seg.er.im[i]);
    const f = Math.atan2(seg.er.im[i], seg.er.re[i]);
    fase[i] = i === 0 ? f : fase[i - 1] + (f - prev - 2 * Math.PI * Math.round((f - prev) / (2 * Math.PI)));
    prev = f;
  }
  return (seg._p = { mag, fase });
}

function terminosEn(seg, f) {
  const fr = seg.freq, n = fr.length, p = preparar(seg);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; fr[m] <= f ? (lo = m) : (hi = m); }
  const t = hi === lo || fr[hi] === fr[lo] ? 0 : Math.min(1, Math.max(0, (f - fr[lo]) / (fr[hi] - fr[lo])));
  const lerp = (a, i, j) => a[i] + (a[j] - a[i]) * t;
  const mag = lerp(p.mag, lo, hi), fase = lerp(p.fase, lo, hi);
  return {
    ed: [lerp(seg.ed.re, lo, hi), lerp(seg.ed.im, lo, hi)],
    es: [lerp(seg.es.re, lo, hi), lerp(seg.es.im, lo, hi)],
    er: [mag * Math.cos(fase), mag * Math.sin(fase)],
  };
}

export function corregirPunto(seg, f, re, im) {
  const t = terminosEn(seg, f), d = csub([re, im], t.ed);
  return cdiv(d, cadd(t.er, cmul(t.es, d)));
}

const tol = f => 2 + f * 1e-4;
const cubre = (seg, f) => f >= seg.freq[0] - tol(f) && f <= seg.freq[seg.freq.length - 1] + tol(f);

// Intervalos [a, b] de [fIni, fFin] que ningun tramo del juego cubre.
export function faltante(segmentos, fIni, fFin) {
  const cub = segmentos
    .map(s => [s.freq[0], s.freq[s.freq.length - 1]])
    .sort((x, y) => x[0] - y[0]);
  const huecos = [];
  let cursor = fIni;
  for (const [a, b] of cub) {
    if (b < cursor - tol(cursor)) continue;
    if (a > cursor + tol(cursor)) huecos.push([cursor, Math.min(a, fFin)]);
    cursor = Math.max(cursor, b);
    if (cursor >= fFin - tol(fFin)) break;
  }
  if (cursor < fFin - tol(fFin)) huecos.push([cursor, fFin]);
  return huecos.filter(([a, b]) => b - a > tol(a));
}

// Corrige una medida sin calibrar usando el tramo mas reciente que cubra cada punto.
export function corregir(juego, { freq, re, im }) {
  const segs = [...juego.segmentos].sort((a, b) => b.fecha - a.fecha);
  const n = freq.length, ore = new Float64Array(n), oim = new Float64Array(n), sinCal = [];
  for (let i = 0; i < n; i++) {
    const seg = segs.find(s => cubre(s, freq[i]));
    if (!seg) { sinCal.push(freq[i]); continue; }
    [ore[i], oim[i]] = corregirPunto(seg, freq[i], re[i], im[i]);
  }
  if (sinCal.length) {
    throw new ErrorCalibracion(T('Hay frecuencias sin calibrar en esa medida'), faltante(juego.segmentos, freq[0], freq[n - 1]));
  }
  return { freq, re: ore, im: oim };
}

// Reparte [fIni, fFin] en n tramos con progresion geometrica.
export function planificarTramos(fIni, fFin, n) {
  const t = [];
  for (let k = 0; k < n; k++) t.push([fIni * (fFin / fIni) ** (k / n), fIni * (fFin / fIni) ** ((k + 1) / n)]);
  return t;
}

// Comprobaciones de cada patron (umbrales de vna/calibrar.py, salvo el de la carga: ver abajo). m, open: { re, im }.
export function comprobarPatron(tipo, m, open) {
  const mag = x => Array.from(x.re, (r, i) => Math.hypot(r, x.im[i]));
  const mm = media(mag(m));
  if (tipo === 'open') {
    return mm < 0.05
      ? { ok: false, mensaje: T('Casi no hay reflexión (|Γ| medio {0}). ¿Está conectado el OPEN y el cable bien apretado?', mm.toFixed(3)) }
      : { ok: true, mensaje: T('Reflexión media |Γ| = {0}.', mm.toFixed(2)) };
  }
  if (!open) return { ok: true, mensaje: '' };
  const mo = media(mag(open)), ratio = mo ? mm / mo : 0;
  if (tipo === 'short') {
    if (ratio < 0.5) return { ok: false, mensaje: T('Refleja mucho menos que el OPEN ({0} %). Parece que está puesta la carga: conecta el SHORT (cortocircuito).', (ratio * 100).toFixed(0)) };
    let fase = 0;
    for (let i = 0; i < m.re.length; i++) {
      const p = cmul(par(m, i), [open.re[i], -open.im[i]]); // s * conj(o)
      fase += Math.abs(Math.atan2(p[1], p[0]));
    }
    fase = (fase / m.re.length) * 180 / Math.PI;
    if (fase < 90) return { ok: false, mensaje: T('Casi no cambia la fase respecto al OPEN ({0}°, debería rondar 180°). Parece que sigue puesto el OPEN.', fase.toFixed(0)) };
    return { ok: true, mensaje: T('Diferencia de fase con el OPEN: {0}°.', fase.toFixed(0)) };
  }
  if (tipo === 'load') {
    // 0,5 y no 0,3 (el de vna/calibrar.py, pensado para todo el rango): con el NanoVNA-H real, en tramos por encima
    // de ~1,6 GHz la carga buena llega al 31-36 % del OPEN en bruto (directividad y pérdidas del cable). Un OPEN o un
    // SHORT puestos por error dan ~100 %.
    return ratio > 0.5
      ?{ ok: false, mensaje: T('Refleja demasiado ({0} % del OPEN). Conecta la carga de 50 Ω (LOAD).', (ratio * 100).toFixed(0)) }
      : { ok: true, mensaje: T('Reflexión {0} % de la del OPEN.', (ratio * 100).toFixed(0)) };
  }
  return { ok: true, mensaje: '' };
}

// Resumen del tramo para mostrar al usuario: directividad y adaptacion de fuente medias.
export function resumenTramo(seg) {
  const n = seg.freq.length;
  const ed = media(Array.from({ length: n }, (_, i) => Math.hypot(seg.ed.re[i], seg.ed.im[i])));
  const es = media(Array.from({ length: n }, (_, i) => Math.hypot(seg.es.re[i], seg.es.im[i])));
  return { ed, es };
}

// Repetibilidad: tras calibrar, se vuelve a conectar la carga y se mide. Devuelve |Γ| medio en dB (más negativo = mejor).
export function repetibilidadDb(seg, carga) {
  const g = [];
  for (let i = 0; i < carga.re.length; i++) {
    const [r, im] = corregirPunto(seg, seg.freq[i], carga.re[i], carga.im[i]);
    g.push(Math.hypot(r, im));
  }
  return 20 * Math.log10(Math.max(media(g), 1e-6));
}

// ---- Persistencia (localStorage) y exportacion ----
const CLAVE = 'chirptenna_vna_calibraciones';
const redondear = a => Array.from(a, x => Number(x.toPrecision(9)));

export function tramoAJSON(s) {
  return {
    fecha: s.fecha, equipo: s.equipo ?? '', ...(Number.isFinite(s.repetDb) ? { repetDb: s.repetDb } : {}), freq: Array.from(s.freq),...(s.patrones && !esIdeal(s.patrones) ? { patrones: s.patrones } : {}),
    ed: { re: redondear(s.ed.re), im: redondear(s.ed.im) },
    es: { re: redondear(s.es.re), im: redondear(s.es.im) },
    er: { re: redondear(s.er.re), im: redondear(s.er.im) },
  };
}

export function tramoDeJSON(j) {
  const f = a => Float64Array.from(a);
  return { fecha: j.fecha, equipo: j.equipo ?? '', ...(Number.isFinite(j.repetDb) ? { repetDb: j.repetDb } : {}), ...(j.patrones ? { patrones: j.patrones } : {}), freq: f(j.freq), ed: { re: f(j.ed.re), im: f(j.ed.im) }, es: { re: f(j.es.re), im: f(j.es.im) }, er: { re: f(j.er.re), im: f(j.er.im) } };
}

export function juegoAJSON(j) { return { id: j.id, nombre: j.nombre, fecha: j.fecha, segmentos: j.segmentos.map(tramoAJSON) }; }
export function juegoDeJSON(j) { return { id: j.id, nombre: j.nombre, fecha: j.fecha, segmentos: j.segmentos.map(tramoDeJSON) }; }

export function cargarJuegos() {
  try { return (JSON.parse(localStorage.getItem(CLAVE) || '[]')).map(juegoDeJSON); } catch { return []; }
}

export function guardarJuegos(lista) {
  try { localStorage.setItem(CLAVE, JSON.stringify(lista.map(juegoAJSON))); return true; } catch { return false; }
}
