// Modelo de los patrones de calibración (OPEN, SHORT, LOAD) no ideales, como los kits de Keysight/NanoVNA:
//   OPEN : capacidad de borde C(f) = C0 + C1·f + C2·f² + C3·f³            (fF, 1e-27 F/Hz, 1e-36 F/Hz², 1e-45 F/Hz³)
//   SHORT: inductancia  L(f) = L0 + L1·f + L2·f² + L3·f³                  (pH, 1e-24 H/Hz, 1e-33, 1e-42)
//   LOAD : R + jωL en serie respecto a Z0 (R en Ω, L en pH)
//   Todos: retardo del offset (ps) y pérdida del offset (dB a 1 GHz, crece con √f; ida, no ida y vuelta).
// Con esto se resuelve el modelo de 3 términos con los Γ reales de cada patrón en vez de +1, −1 y 0.
// Sin dependencias del DOM (se prueba con Node).

export const Z0 = 50;
export const PATRONES_IDEALES = {
  open: { c: [0, 0, 0, 0], retardo: 0, perdida: 0 },
  short: { l: [0, 0, 0, 0], retardo: 0, perdida: 0 },
  load: { r: 50, l: 0, retardo: 0, perdida: 0 },
};

const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1] || 1e-30; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];

// Γ de una impedancia Z (compleja) respecto a Z0
const gamma = z => cdiv(csub(z, [Z0, 0]), cadd(z, [Z0, 0]));

// Campos del formulario (ids pat-*) <-> modelo. `v` lee un id y devuelve un numero finito (o el valor por defecto).
const CAMPOS = {
  'pat-oc0': ['open', 'c', 0], 'pat-oc1': ['open', 'c', 1], 'pat-oc2': ['open', 'c', 2], 'pat-oc3': ['open', 'c', 3],
  'pat-or': ['open', 'retardo'], 'pat-op': ['open', 'perdida'],
  'pat-sl0': ['short', 'l', 0], 'pat-sl1': ['short', 'l', 1], 'pat-sl2': ['short', 'l', 2], 'pat-sl3': ['short', 'l', 3],
  'pat-sr': ['short', 'retardo'], 'pat-sp': ['short', 'perdida'],
  'pat-lr': ['load', 'r'], 'pat-ll': ['load', 'l'], 'pat-lt': ['load', 'retardo'], 'pat-lp': ['load', 'perdida'],
};
export const IDS_PATRONES = Object.keys(CAMPOS);
const copia = () => JSON.parse(JSON.stringify(PATRONES_IDEALES));
export function patronesDeCampos(v) {
  const p = copia();
  for (const [id, [t, k, i]] of Object.entries(CAMPOS)) {
    let x = +v(id);
    if (!Number.isFinite(x) || (id === 'pat-lr' && x <= 0)) x = i === undefined ? PATRONES_IDEALES[t][k] : PATRONES_IDEALES[t][k][i];
    if (i === undefined) p[t][k] = x; else p[t][k][i] = x;
  }
  return p;
}
export function camposDePatrones(p) {
  const m = { ...copia(), ...p }, r = {};
  for (const [id, [t, k, i]] of Object.entries(CAMPOS)) r[id] = i === undefined ? m[t][k] : m[t][k][i];
  return r;
}
const CLAVE = 'chirptenna_vna_patrones';
export function cargarPatrones() {
  try { const j = JSON.parse(localStorage.getItem(CLAVE) || 'null'); return j ? patronesDeCampos(id => camposDePatrones(j)[id]) : copia(); } catch { return copia(); }
}
export function guardarPatrones(p) { try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento */ } }

// Hay modelo no ideal si algún parámetro se aparta del patrón ideal
export function esIdeal(p) {
  if (!p) return true;
  const o = p.open ?? PATRONES_IDEALES.open, s = p.short ?? PATRONES_IDEALES.short, l = p.load ?? PATRONES_IDEALES.load;
  const cero = a => a.every(x => !x);
  return cero(o.c) && !o.retardo && !o.perdida && cero(s.l) && !s.retardo && !s.perdida && l.r === 50 && !l.l && !l.retardo && !l.perdida;
}

// Γ visto en el plano de calibración (tras el offset) de cada patrón a la frecuencia f (Hz)
export function gammaPatron(tipo, p, f) {
  const w = 2 * Math.PI * f;
  let g;
  if (tipo === 'open') {
    const wc = w * (p.c[0] * 1e-15 + p.c[1] * 1e-27 * f + p.c[2] * 1e-36 * f * f + p.c[3] * 1e-45 * f ** 3);
    g = wc === 0 ? [1, 0] : cdiv([1, -wc * Z0], [1, wc * Z0]);          // (1 − jωCZ0)/(1 + jωCZ0)
  } else if (tipo === 'short') {
    const wl = w * (p.l[0] * 1e-12 + p.l[1] * 1e-24 * f + p.l[2] * 1e-33 * f * f + p.l[3] * 1e-42 * f ** 3);
    g = gamma([0, wl]);
  } else {
    g = gamma([p.r, w * (p.l ?? 0) * 1e-12]);
  }
  const tau = (p.retardo ?? 0) * 1e-12;
  const aten = Math.exp(-2 * (p.perdida ?? 0) * Math.sqrt(f / 1e9) * Math.LN10 / 20);   // ida y vuelta
  const fase = -2 * w * tau;
  return cmul(g, [aten * Math.cos(fase), aten * Math.sin(fase)]);
}

// Resuelve (Ed, Es, Er) con la forma lineal m = a + b·Γ + c·Γ·m  (a = Ed, c = Es, b = Er − Ed·Es), 3 patrones.
// mo, ms, ml: [re, im] medidos; go, gs, gl: Γ reales.
export function resolverTerminos(mo, ms, ml, go, gs, gl) {
  const f = (m, g) => [[1, 0], g, cmul(g, m)];
  const A = [f(mo, go), f(ms, gs), f(ml, gl)], y = [mo, ms, ml];
  const det3 = M => {
    const t = (a, b, c) => cmul(M[0][a], csub(cmul(M[1][b], M[2][c]), cmul(M[1][c], M[2][b])));
    return cadd(csub(t(0, 1, 2), cmul(M[0][1], csub(cmul(M[1][0], M[2][2]), cmul(M[1][2], M[2][0])))), cmul(M[0][2], csub(cmul(M[1][0], M[2][1]), cmul(M[1][1], M[2][0]))));
  };
  const D = det3(A), x = [];
  for (let k = 0; k < 3; k++) { const B = A.map((fila, i) => fila.map((v, j) => (j === k ? y[i] : v))); x.push(cdiv(det3(B), D)); }
  const [a, b, c] = x;
  return { ed: a, es: c, er: cadd(b, cmul(a, c)) };
}
