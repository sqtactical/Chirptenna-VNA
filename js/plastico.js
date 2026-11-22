// Medir la εr y la tanδ de un plástico (y la εr del FR4) con los anillos del cupón C de Chirptenna. Sin DOM: se prueba con Node.
// Es el mismo cálculo que `antenas/plastico.py` de Chirptenna (las pruebas comparan los números): un solver cuasiestático 2D de la
// sección de la microstrip (masa, FR4, rendija de aire, muestra y aire) da la permitividad efectiva εeff y la fracción de energía de cada
// material; con el cociente de frecuencias del anillo en vacío y con la muestra se saca la εr, y con los Q, la tanδ.
import { T } from './i18n.js';

const X_CAJA = 24.0, Y_CAJA = 28.0, DX_MIN = 0.1, DY_MIN = 0.08;
const cache = new Map();

const redondea = (v, d) => { const k = 10 ** d; return Math.round(v * k) / k; };

function malla1D(puntos, nMin) {
  const pts = [...new Set(puntos.map(p => redondea(p, 6)))].sort((a, b) => a - b);
  const out = [pts[0]];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], n = Math.max(nMin, Math.ceil((b - a) / DY_MIN - 1e-12));
    for (let i = 1; i <= n; i++) out.push(a + (b - a) * i / n);
  }
  return out;
}

function mallaX(w, borde = null) {
  const a = [];
  for (let v = 0; v <= w / 2 + 1e-9; v += DX_MIN * 1.2) a.push(v);
  if (Math.abs(a[a.length - 1] - w / 2) > 1e-9) a.push(w / 2);
  let paso = DX_MIN * 1.2;
  const x = [a[a.length - 1]];
  while (x[x.length - 1] < X_CAJA - 1e-9) { paso = Math.min(paso * 1.12, 1.6); x.push(Math.min(x[x.length - 1] + paso, X_CAJA)); }
  let xs = [...a.slice(0, -1), ...x];
  if (borde !== null && w / 2 < borde && borde < X_CAJA) {                          // línea extra: el canto de una muestra estrecha
    xs = [...new Set([...xs, ...[0, 1, 2, 3, 4].map(k => borde - 0.4 + 0.2 * k), borde].map(v => redondea(v, 6)))].sort((p, q) => p - q);
  }
  return xs;
}

function mallaY(h, gap, t) {
  const cortes = [0, h];
  if (gap > 0) cortes.push(h + gap);
  cortes.push(t > 0 ? h + gap + t : h + gap);
  const y = malla1D(cortes, 4);
  let paso = DY_MIN * 2;
  while (y[y.length - 1] < Y_CAJA - 1e-9) { paso = Math.min(paso * 1.12, 1.6); y.push(Math.min(y[y.length - 1] + paso, Y_CAJA)); }
  return [...new Set(y.map(v => redondea(v, 6)))].sort((a, b) => a - b);
}

// Energía total (∝ capacidad) y fracciones de energía {sustrato, muestra}
function energia(w, h, erSub, erM, t, gap, ancho = null) {
  const clave = [w, h, erSub, erM, t, gap, ancho ?? 0].map(v => redondea(v, 5)).join('|');
  if (cache.has(clave)) return cache.get(clave);
  const x = mallaX(w, ancho ? ancho / 2 : null), y = mallaY(h, gap, t), nx = x.length, ny = y.length;
  const dx = new Float64Array(nx - 1), dy = new Float64Array(ny - 1);
  for (let i = 0; i < nx - 1; i++) dx[i] = x[i + 1] - x[i];
  for (let j = 0; j < ny - 1; j++) dy[j] = y[j + 1] - y[j];
  const epsY = new Float64Array(ny - 1).fill(1), capa = new Uint8Array(ny - 1);
  for (let j = 0; j < ny - 1; j++) {
    const yc = (y[j] + y[j + 1]) / 2;
    if (yc < h) { epsY[j] = erSub; capa[j] = 1; }
    else if (t > 0 && yc > h + gap && yc < h + gap + t) { epsY[j] = erM; capa[j] = 2; }
  }
  // ε y material de cada celda [i * (ny - 1) + j]; una muestra estrecha (una tira) solo cubre |x| < ancho / 2, fuera hay aire
  const E = new Float64Array((nx - 1) * (ny - 1)), cap = new Uint8Array((nx - 1) * (ny - 1));
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
    const fuera = ancho && capa[j] === 2 && (x[i] + x[i + 1]) / 2 > ancho / 2;
    E[i * (ny - 1) + j] = fuera ? 1 : epsY[j]; cap[i * (ny - 1) + j] = fuera ? 0 : capa[j];
  }
  // conductancias de las aristas (volúmenes finitos sobre los nodos); índice [i * ny + j] y [i * (ny - 1) + j]
  const gx = new Float64Array((nx - 1) * ny), gy = new Float64Array(nx * (ny - 1));
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny; j++) {
    let s = 0;
    if (j >= 1) s += E[i * (ny - 1) + j - 1] * dy[j - 1] / 2;
    if (j < ny - 1) s += E[i * (ny - 1) + j] * dy[j] / 2;
    gx[i * ny + j] = s / dx[i];
  }
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny - 1; j++) {
    let s = 0;
    if (i >= 1) s += E[(i - 1) * (ny - 1) + j] * dx[i - 1] / 2;
    if (i < nx - 1) s += E[i * (ny - 1) + j] * dx[i] / 2;
    gy[i * (ny - 1) + j] = s / dy[j];
  }
  const fi = new Float64Array(nx * ny), fija = new Uint8Array(nx * ny);
  for (let i = 0; i < nx; i++) { fija[i * ny] = 1; fija[i * ny + ny - 1] = 1; }
  for (let j = 0; j < ny; j++) fija[(nx - 1) * ny + j] = 1;
  const argmin = (arr, v) => { let m = 0; for (let k = 1; k < arr.length; k++) if (Math.abs(arr[k] - v) < Math.abs(arr[m] - v)) m = k; return m; };
  const jH = argmin(y, h), iW = argmin(x, w / 2);
  for (let i = 0; i <= iW; i++) { fija[i * ny + jH] = 1; fi[i * ny + jH] = 1; }
  const omega = 1.9;
  for (let it = 0; it < 8000; it++) {
    let cambio = 0;
    for (let color = 0; color < 2; color++) {
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        if (fija[i * ny + j] || ((i + j) & 1) !== color) continue;
        let s = 0, d = 0;
        if (i > 0) { const g = gx[(i - 1) * ny + j]; s += g * fi[(i - 1) * ny + j]; d += g; }
        if (i < nx - 1) { const g = gx[i * ny + j]; s += g * fi[(i + 1) * ny + j]; d += g; }
        if (i === 0) { const g = gx[j]; s += g * fi[ny + j]; d += g; }                    // espejo en x = 0 (Neumann)
        if (j > 0) { const g = gy[i * (ny - 1) + j - 1]; s += g * fi[i * ny + j - 1]; d += g; }
        if (j < ny - 1) { const g = gy[i * (ny - 1) + j]; s += g * fi[i * ny + j + 1]; d += g; }
        if (d <= 0) continue;
        const dif = omega * (s / d - fi[i * ny + j]);
        fi[i * ny + j] += dif;
        if (Math.abs(dif) > cambio) cambio = Math.abs(dif);
      }
    }
    if (cambio < 1e-6) break;
  }
  let total = 0, eSub = 0, eMue = 0;
  for (let i = 0; i < nx - 1; i++) for (let j = 0; j < ny - 1; j++) {
    const ex = ((fi[(i + 1) * ny + j] - fi[i * ny + j]) + (fi[(i + 1) * ny + j + 1] - fi[i * ny + j + 1])) / (2 * dx[i]);
    const ey = ((fi[i * ny + j + 1] - fi[i * ny + j]) + (fi[(i + 1) * ny + j + 1] - fi[(i + 1) * ny + j])) / (2 * dy[j]);
    const e = E[i * (ny - 1) + j] * (ex * ex + ey * ey) * dx[i] * dy[j];
    total += e;
    if (cap[i * (ny - 1) + j] === 1) eSub += e; else if (cap[i * (ny - 1) + j] === 2) eMue += e;
  }
  const r = { total, fr: { sustrato: eSub / total, muestra: eMue / total } };
  cache.set(clave, r);
  return r;
}

// (εeff, {sustrato, muestra}) de la microstrip de ancho w sobre un sustrato de grosor h y εr, con una muestra (εr, grosor t) encima
// separada por una rendija de aire `gap` (todo en mm)
export function epsEff(w, h, erSub, erM = 1, t = 0, gap = 0, ancho = null) {
  const e = energia(w, h, erSub, erM, t, gap, ancho);
  return { eff: e.total / energia(w, h, 1, 1, t, gap, ancho).total, fr: e.fr };
}

// Mínimos cuadrados polinómicos (grado g) por las ecuaciones normales: pocos puntos y bien repartidos
function polyfit(xs, ys, g) {
  const n = g + 1, A = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let k = 0; k < xs.length; k++) for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] += xs[k] ** (i + j);
    A[i][n] += ys[k] * xs[k] ** i;
  }
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let j = c; j <= n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((fila, i) => fila[n] / fila[i]);                 // coeficientes de menor a mayor grado
}
const polyval = (c, x) => c.reduceRight((acc, v) => acc * x + v, 0);

const NODOS = [1, 2, 3, 4.5, 7, 11, 18], ER_MAX = 18;
const curvas = new Map();
function curva(w, h, erSub, t, gap, ancho = null) {
  const clave = [w, h, erSub, t, gap, ancho ?? 0].map(v => redondea(v, 5)).join('|');
  if (!curvas.has(clave)) curvas.set(clave, polyfit(NODOS.map(Math.log), NODOS.map(er => epsEff(w, h, erSub, er, t, gap, ancho).eff), 5));
  return curvas.get(clave);
}

// El modelo 2D no ve los huecos de acoplo ni la curvatura del anillo: la muestra desplaza la resonancia algo MÁS de lo que predice (8–16 %).
// Δ(f₀/f)² medido en openEMS 3D (cupon/simular_anillo.py R2G4 --muestra, 7 casos con εr 2,2–10 y grosor 2–4 mm) = Δmodelo·(c0 + c1·t + c2·Δmodelo).
// Mismos coeficientes que CORR_3D de antenas/plastico.py. Solo vale para ese anillo y dentro de ese rango.
// Stubs del cupón C (cupon/simular_stub.py, 42 casos): κ ≈ 0,95 (el modelo 2D va mucho mejor que con el anillo); el cuarto término es el modo (0 = λ/4, 1 = 3λ/4…).
export const CORR_3D = { R2G4: [1.2047, -0.0317, 0.0398], STUB: [0.947, 0.0001, 0.0845, -0.017] };
export const RANGO_CORR = { er: [2, 10], t: [1.5, 4.5] };
const TOL_MODELO_DELTA = 0.002, TOL_LANZAMIENTO = 0.04;
export const ANCHO_MUESTRA = 24;

// εr de la muestra que explica el cociente de frecuencias del anillo (bisección sobre εeff(εr), de 1 a 18); null si no hay solución.
// Con un anillo calibrado en CORR_3D se corrige el desplazamiento con lo simulado en 3D.
export function erMuestra(fVacio, fCargado, w, h, erSub, t, gap = 0, anillo = null, ancho = null, modo = 1, dk = 0) {
  const objetivo = (fVacio / fCargado) ** 2, e0 = epsEff(w, h, erSub).eff, c = curva(w, h, erSub, t, gap, ancho);
  const [c0, c1, c2, c3 = 0] = CORR_3D[anillo] ?? [1, 0, 0];
  const razon = er => { const d = polyval(c, Math.log(er)) / e0 - 1; return 1 + (c0 + dk + c1 * t + c2 * d + c3 * (modo - 1)) * d; };
  let lo = 1, hi = ER_MAX;
  if (!(razon(lo) <= objetivo && objetivo <= razon(hi))) return null;
  for (let k = 0; k < 50; k++) { const med = (lo + hi) / 2; if (razon(med) < objetivo) lo = med; else hi = med; }
  return (lo + hi) / 2;
}

// Q propio de un resonador de dos puertos acoplado débil y simétrico: Q_u = Q_L / (1 − |S21|) con |S21| en el pico (ilDb negativo)
export const qSinCarga = (qCargado, ilDb) => qCargado / (1 - 10 ** (ilDb / 20));

export function tandMuestra(erM, qVacio, qCargado, w, h, erSub, t, tandSub = 0.02, gap = 0) {
  const f0 = epsEff(w, h, erSub).fr, f1 = epsEff(w, h, erSub, erM, t, gap).fr;
  if (f1.muestra <= 1e-6) return null;
  return ((1 / qCargado - 1 / qVacio) - (f1.sustrato - f0.sustrato) * tandSub) / f1.muestra;
}

// εr y tanδ de la muestra con su incertidumbre. f en MHz, medidas del cupón C: pico de S21 del anillo en vacío y con la muestra.
export function medir({ fVacioMHz, fCargadoMHz, grosorMm, wMm = 3.0, hMm = 1.6, erSustrato = 4.5, gapMm = 0, qVacio = null, qCargado = null,
  tandSustrato = 0.02, tolFMHz = 0.5, tolGrosorMm = 0.1, tolErSustrato = 0.15, anillo = null, ancho = null, modo = 1, conIncertidumbre = true }) {
  const f0 = fVacioMHz * 1e6, f1 = fCargadoMHz * 1e6, t = grosorMm;
  const er = erMuestra(f0, f1, wMm, hMm, erSustrato, t, gapMm, anillo, ancho, modo);
  if (er === null) return { ok: false, motivo: T('El cociente de frecuencias no tiene solución con ese grosor (¿resonancia mal identificada?).') };
  const em = (fa, tt = t, es = erSustrato, dk = 0) => erMuestra(f0, fa, wMm, hMm, es, tt, gapMm, anillo, ancho, modo, dk), km = f1 * TOL_MODELO_DELTA / 2;
  if (!conIncertidumbre) return { ok: true, er, erIncertidumbre: null, calibrado3d: anillo in CORR_3D,
    fueraDeCalibracion: anillo in CORR_3D && !(er >= RANGO_CORR.er[0] && er <= RANGO_CORR.er[1] && t >= RANGO_CORR.t[0] && t <= RANGO_CORR.t[1]) };
  const pares = [
    [em(f1 + tolFMHz * 1e6), em(f1 - tolFMHz * 1e6)],
    [em(f1, t + tolGrosorMm), em(f1, Math.max(t - tolGrosorMm, 0.05))],
    [em(f1, t, erSustrato + tolErSustrato), em(f1, t, erSustrato - tolErSustrato)],
  ];
  if (anillo in CORR_3D) pares.push([em(f1 + km), em(f1 - km)]);
  if (anillo === 'STUB') pares.push([em(f1, t, erSustrato, TOL_LANZAMIENTO), em(f1, t, erSustrato, -TOL_LANZAMIENTO)]);   // el conector real suma o resta unos mm de línea sin muestra
  const err = Math.sqrt(pares.reduce((s, [a, b]) => s + Math.max(Math.abs((a ?? er) - er), Math.abs((b ?? er) - er)) ** 2, 0));
  const cargado = epsEff(wMm, hMm, erSustrato, er, t, gapMm, ancho);
  const out = { ok: true, er, erIncertidumbre: err, desplazamientoPct: 100 * (f1 / f0 - 1), epsEffVacio: epsEff(wMm, hMm, erSustrato).eff,
    epsEffCargado: cargado.eff, fraccionEnergiaMuestra: cargado.fr.muestra, calibrado3d: anillo in CORR_3D };
  if (anillo in CORR_3D) out.fueraDeCalibracion = !(er >= RANGO_CORR.er[0] && er <= RANGO_CORR.er[1] && t >= RANGO_CORR.t[0] && t <= RANGO_CORR.t[1]);
  if (qVacio && qCargado) {
    const td = tandMuestra(er, qVacio, qCargado, wMm, hMm, erSustrato, t, tandSustrato, gapMm);
    out.tand = td;
    const tds = [1, -1].map(s => tandMuestra(er, qVacio * (1.05 ** s), qCargado * (1.05 ** -s), wMm, hMm, erSustrato, t, tandSustrato, gapMm)).filter(v => v !== null);
    if (td !== null && tds.length) { out.tandIncertidumbre = Math.max(...tds.map(v => Math.abs(v - td))); out.tandFiable = td > out.tandIncertidumbre; }
  }
  return out;
}

// Resonancia de un anillo simulada en openEMS 3D (εr 4,5): la geometría del anillo se queda en esta constante y solo cambia εeff
export const REF_ANILLOS = { R2G4: { fMHz: 2397.1, er: 4.5, wMm: 3.01, hMm: 1.6, rMm: 10.036 } };
const NODOS_SUSTRATO = [2.5, 3.5, 4.5, 5.5, 7];

// εr del FR4 del cupón a partir del pico del anillo medido SIN muestra
export function erFr4(fMHz, anillo = 'R2G4', { tolFMHz = 0.5, tolAnchoMm = 0.05, tolRadioMm = 0.05 } = {}) {
  const ref = REF_ANILLOS[anillo];
  if (!ref) return { ok: false, motivo: T('No hay referencia simulada para este anillo (de momento solo R2G4).') };
  const { wMm: w, hMm: h } = ref, eRef = epsEff(w, h, ref.er).eff;
  const resolver = (f, w2) => {
    const objetivo = eRef * (ref.fMHz / f) ** 2, c = polyfit(NODOS_SUSTRATO, NODOS_SUSTRATO.map(er => epsEff(w2, h, er).eff), 3);
    let lo = NODOS_SUSTRATO[0], hi = NODOS_SUSTRATO[NODOS_SUSTRATO.length - 1];
    if (!(polyval(c, lo) <= objetivo && objetivo <= polyval(c, hi))) return null;
    for (let k = 0; k < 50; k++) { const med = (lo + hi) / 2; if (polyval(c, med) < objetivo) lo = med; else hi = med; }
    return (lo + hi) / 2;
  };
  const er = resolver(fMHz, w);
  if (er === null) return { ok: false, motivo: T('La frecuencia queda fuera de lo esperable para un FR4 (εr de 2,5 a 7): ¿pico equivocado?') };
  const pares = [[resolver(fMHz + tolFMHz, w), resolver(fMHz - tolFMHz, w)], [resolver(fMHz, w + tolAnchoMm), resolver(fMHz, w - tolAnchoMm)],
    [resolver(fMHz * (1 + tolRadioMm / ref.rMm), w), resolver(fMHz * (1 - tolRadioMm / ref.rMm), w)]];
  const err = Math.sqrt(pares.reduce((s, [a, b]) => s + Math.max(Math.abs((a ?? er) - er), Math.abs((b ?? er) - er)) ** 2, 0));
  return { ok: true, er, erIncertidumbre: err, fRefMHz: ref.fMHz, erRef: ref.er };
}

// Pico de una curva de S21 en dB: {fMHz, ilDb, anchoMHz, qCargado, qPropio} (null si no hay un pico claro de ≥ 6 dB con cruces de −3 dB)
export function parametrosPico(freq, s21Db, fCentroHz = null, ventana = 0.15) {
  const n = freq.length, idx = [];
  for (let k = 0; k < n; k++) if (fCentroHz === null || Math.abs(freq[k] / fCentroHz - 1) <= ventana) idx.push(k);
  if (idx.length < 5) return null;
  let i0 = idx[0];
  for (const k of idx) if (s21Db[k] > s21Db[i0]) i0 = k;
  const orden = idx.map(k => s21Db[k]).sort((a, b) => a - b), mediana = orden[Math.floor(orden.length / 2)];
  if (s21Db[i0] - mediana < 6) return null;
  const umbral = s21Db[i0] - 3;
  let i1 = i0; while (i1 > 0 && s21Db[i1] > umbral) i1--;
  let i2 = i0; while (i2 < n - 1 && s21Db[i2] > umbral) i2++;
  if (s21Db[i1] > umbral || s21Db[i2] > umbral) return null;
  const fa = freq[i1] + (umbral - s21Db[i1]) / (s21Db[i1 + 1] - s21Db[i1]) * (freq[i1 + 1] - freq[i1]);
  const fb = freq[i2 - 1] + (umbral - s21Db[i2 - 1]) / (s21Db[i2] - s21Db[i2 - 1]) * (freq[i2] - freq[i2 - 1]);
  const ql = freq[i0] / (fb - fa);
  return { fMHz: freq[i0] / 1e6, ilDb: s21Db[i0], anchoMHz: (fb - fa) / 1e6, qCargado: ql, qPropio: qSinCarga(ql, s21Db[i0]) };
}

// ----------------------------------------------------------------------------- stubs abiertos del cupón C medidos en S11
// Mismos datos que STUBS y REF_STUBS de antenas/plastico.py (largo desde el borde de la placa; resonancias de la simulación 3D con εr 4,5)
export const STUBS = { S43: { x: 85, L: 43 }, S59: { x: 50, L: 59 }, S86: { x: 15, L: 86 } };
export const REF_STUBS = { S43: [869.678, 2624.945], S59: [646.167, 1942.56], S86: [450.3, 1353.565, 2253.05] };
const C0_MM_S = 299792458.0, Z0 = 50, ALFA_C_1GHZ = 0.06;      // ALFA_C: pérdida del cobre a 1 GHz (Np/m, ∝ √f); con PEC (simulación 3D) es 0

// Resonancias serie de un stub abierto en un S11 complejo (re, im): cruces de X por cero con pendiente positiva. [{fMHz, rOhm, dXdf}]
// Cerca de |Γ| = 1 un error pequeño de S11 mueve mucho X (≈ 26 Ω por unidad de Γ): el cruce sale de una recta ajustada por mínimos cuadrados a X(f) en ±nAjuste puntos
// (y R con otra recta evaluada en el cruce), no de dos puntos. Igual que resonancias_stub de antenas/plastico.py.
function recta(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0), a = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx;
  return [a, my - a * mx];                                      // pendiente y ordenada
}
export function resonanciasStub(freq, re, im, nAjuste = 3) {
  const z = Array.from(freq, (_, i) => {
    const nr = 1 - re[i], ni = -im[i], den = nr * nr + ni * ni;                        // 1 − s
    const pr = 1 + re[i], pi = im[i];                                                  // 1 + s
    return [Z0 * (pr * nr + pi * ni) / den, Z0 * (pi * nr - pr * ni) / den];
  });
  const out = [];
  for (let i = 0; i < z.length - 1; i++) {
    const x0 = z[i][1], x1 = z[i + 1][1];
    if (x0 < 0 && x1 >= 0 && Number.isFinite(x0) && Number.isFinite(x1)) {
      const lo = Math.max(i - nAjuste + 1, 0), hi = Math.min(i + nAjuste, z.length - 1);
      const fs = [], xs = [], rs = [];
      for (let k = lo; k <= hi; k++) { fs.push(freq[k] - freq[i]); xs.push(z[k][1]); rs.push(z[k][0]); }
      if (fs.length >= 3 && xs.every(Number.isFinite)) {
        const [ax, bx] = recta(fs, xs);
        if (ax > 0) {
          const fr = -bx / ax, [ar, br] = recta(fs, rs);
          out.push({ fMHz: (freq[i] + fr) / 1e6, rOhm: ar * fr + br, dXdf: ax * 1e6 });
          continue;
        }
      }
      const u = -x0 / (x1 - x0);
      out.push({ fMHz: (freq[i] + u * (freq[i + 1] - freq[i])) / 1e6, rOhm: z[i][0] + u * (z[i + 1][0] - z[i][0]), dXdf: (x1 - x0) / (freq[i + 1] - freq[i]) * 1e6 });
    }
  }
  return out;
}
export function elegirResonancia(resonancias, fEsperadaMHz, ventana = 0.25) {
  const c = resonancias.filter(r => Math.abs(r.fMHz / fEsperadaMHz - 1) <= ventana);
  return c.length ? c.reduce((a, b) => Math.abs(a.fMHz - fEsperadaMHz) <= Math.abs(b.fMHz - fEsperadaMHz) ? a : b) : null;
}

// tanδ de la muestra a partir de la resistencia del stub en su resonancia (r0 a f0 en vacío, r1 a f1 con la muestra); modo = 1, 2, 3 (λ/4, 3λ/4, 5λ/4)
export function tandStub(erM, f0MHz, r0, f1MHz, r1, w, h, erSub, t, modo = 1, tandSub = 0.02, gap = 0, alfaC1GHz = ALFA_C_1GHZ) {
  const a0 = epsEff(w, h, erSub), a1 = epsEff(w, h, erSub, erM, t, gap, ANCHO_MUESTRA);
  if (a1.fr.muestra <= 1e-6) return null;
  const f0 = f0MHz * 1e6, f1 = f1MHz * 1e6, largoE = (2 * modo - 1) * C0_MM_S / (4 * f0 * Math.sqrt(a0.eff));
  const ac0 = alfaC1GHz * Math.sqrt(f0 / 1e9), ad0 = Math.PI * f0 * Math.sqrt(a0.eff) / C0_MM_S * a0.fr.sustrato * tandSub;
  const ad1 = ad0 + (r1 - r0) / (Z0 * largoE) - ac0 * (Math.sqrt(f1 / f0) - 1);
  return (ad1 / (Math.PI * f1 * Math.sqrt(a1.eff) / C0_MM_S) - a1.fr.sustrato * tandSub) / a1.fr.muestra;
}

// εr (y tanδ con las resistencias) de una muestra con un stub del cupón C medido en S11: frecuencia y R de la resonancia sin muestra y con ella
export function medirStub({ fVacioMHz, fCargadoMHz, grosorMm, rVacio = null, rCargado = null, modo = 1, wMm = 3.01, hMm = 1.6, erSustrato = 4.5, gapMm = 0,
  tandSustrato = 0.02, tolFMHz = 1.0, tolGrosorMm = 0.1, tolErSustrato = 0.15, tolROhm = 0.25, conIncertidumbre = true, alfaC1GHz = ALFA_C_1GHZ }) {
  const r = medir({ fVacioMHz, fCargadoMHz, grosorMm, wMm, hMm, erSustrato, gapMm, tandSustrato, tolFMHz, tolGrosorMm, tolErSustrato, anillo: 'STUB',
    ancho: ANCHO_MUESTRA, modo, conIncertidumbre });
  if (!r.ok) return r;
  r.modo = modo;
  if (rVacio !== null && rCargado !== null) {
    const td = tandStub(r.er, fVacioMHz, rVacio, fCargadoMHz, rCargado, wMm, hMm, erSustrato, grosorMm, modo, tandSustrato, gapMm, alfaC1GHz);
    r.tand = td;
    if (td !== null) {
      const ts = [1, -1].map(s => tandStub(r.er, fVacioMHz, rVacio + s * tolROhm, fCargadoMHz, rCargado - s * tolROhm, wMm, hMm, erSustrato, grosorMm, modo, tandSustrato, gapMm, alfaC1GHz)).filter(v => v !== null);
      r.tandIncertidumbre = Math.max(...ts.map(v => Math.abs(v - td)));
      r.tandFiable = td > r.tandIncertidumbre;
    }
  }
  return r;
}

// εr del FR4 del cupón con la resonancia del mismo modo de varios stubs ({S43: MHz, …}, al menos dos): la recta c/(4f)·(2·modo−1) frente al largo tiene
// por pendiente √εeff y por ordenada la longitud eléctrica del conector, que se elimina. Devuelve {ok, er, erIncertidumbre, lanzamientoMm, epsEff}.
export function erFr4Stubs(frecuenciasMHz, modo = 1, { wMm = 3.01, hMm = 1.6, tolFMHz = 1.0, tolLargoMm = 0.1 } = {}) {
  const pts = Object.entries(frecuenciasMHz).filter(([k, f]) => STUBS[k] && f);
  if (pts.length < 2) return { ok: false, motivo: T('Hacen falta las resonancias de al menos dos stubs distintos.') };
  const ajustar = (df = 0, dl = 0) => {
    const L = pts.map(([k], i) => STUBS[k].L + (i === 0 ? dl : 0)), y = pts.map(([, f], i) => (2 * modo - 1) * C0_MM_S / (4 * (f + (i === 0 ? df : 0)) * 1e6) * 1e3);
    const n = L.length, mx = L.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
    const a = L.reduce((s, l, i) => s + (l - mx) * (y[i] - my), 0) / L.reduce((s, l) => s + (l - mx) ** 2, 0);
    return { a, b: my - a * mx };
  };
  const nodos = [2.5, 3.5, 4.5, 5.5, 7], c = polyfit(nodos, nodos.map(er => epsEff(wMm, hMm, er).eff), 3);
  const aEr = e => {
    if (!(polyval(c, nodos[0]) <= e && e <= polyval(c, nodos[nodos.length - 1]))) return null;
    let lo = nodos[0], hi = nodos[nodos.length - 1];
    for (let k = 0; k < 50; k++) { const med = (lo + hi) / 2; if (polyval(c, med) < e) lo = med; else hi = med; }
    return (lo + hi) / 2;
  };
  const { a, b } = ajustar(), er = aEr(a * a);
  if (er === null) return { ok: false, motivo: T('La frecuencia queda fuera de lo esperable para un FR4 (εr de 2,5 a 7): ¿pico equivocado?') };
  const v = [aEr(ajustar(tolFMHz).a ** 2), aEr(ajustar(-tolFMHz).a ** 2), aEr(ajustar(0, tolLargoMm).a ** 2), aEr(ajustar(0, -tolLargoMm).a ** 2)];
  const err = Math.sqrt(Math.max(Math.abs((v[0] ?? er) - er), Math.abs((v[1] ?? er) - er)) ** 2 + Math.max(Math.abs((v[2] ?? er) - er), Math.abs((v[3] ?? er) - er)) ** 2);
  return { ok: true, er, erIncertidumbre: err, lanzamientoMm: b / a, epsEff: a * a };
}