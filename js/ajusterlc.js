// Circuito RLC equivalente de una resonancia, ajustado por mínimos cuadrados a la impedancia medida cerca de ella.
//   serie    (X sube de − a + por la resonancia): Z = R + j(ωL − 1/(ωC))      Q = ω0·L/R
//   paralelo (X baja de + a −)                  : Y = G + j(ωC − 1/(ωL))      Q = ω0·C/G
// Indicativo: una antena real no es un RLC (R y X varían con f, el cable añade un retardo), así que la Q sale de la pendiente de la
// reactancia en la resonancia y sirve para comparar antenas o ver si una trampa/bobina está bien, no como medida exacta.
// Sin DOM (se prueba con Node). medida = salida de calcular() (usa freq, zr, zx).

const Z0 = 50;

// Resuelve el sistema 2x2 [[a, b], [b, c]]·[x, y] = [d, e]
function resolver2(a, b, c, d, e) {
  const det = a * c - b * b;
  if (!(Math.abs(det) > 1e-300)) return null;
  return [(d * c - b * e) / det, (a * e - b * d) / det];
}

// f: frecuencia (Hz) de la resonancia (cruce de X = 0 o mínimo de ROE). ventana: fracción a cada lado (por defecto ±5 %).
export function ajustarRLC(medida, f, { ventana = 0.05, tipo = null } = {}) {
  const { freq, zr, zx } = medida;
  const idx = [];
  for (let i = 0; i < freq.length; i++) if (Math.abs(freq[i] / f - 1) <= ventana) idx.push(i);
  if (idx.length < 5) return null;
  // Tipo: por el signo de la pendiente de X en la ventana (X sube con f → serie)
  const pend = (zx[idx[idx.length - 1]] - zx[idx[0]]) / (freq[idx[idx.length - 1]] - freq[idx[0]]);
  const serie = tipo ? tipo === 'serie' : pend > 0;
  // magnitud reactiva: serie → X(ω) = L·ω − (1/C)·(1/ω); paralelo → B(ω) = C·ω − (1/L)·(1/ω) con B = Im(1/Z)
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0, real = 0;
  const ruido = [];
  for (const i of idx) {
    const w = 2 * Math.PI * freq[i], zrr = zr[i], zxx = zx[i];
    let y, r;
    if (serie) { y = zxx; r = zrr; } else { const d = zrr * zrr + zxx * zxx || 1e-30; y = -zxx / d; r = zrr / d; }
    const u = w, v = -1 / w;
    s11 += u * u; s12 += u * v; s22 += v * v; t1 += u * y; t2 += v * y; real += r; ruido.push([w, y, r]);
  }
  const sol = resolver2(s11, s12, s22, t1, t2);
  if (!sol) return null;
  const [a, b] = sol; // a = L (serie) o C (paralelo); b = 1/C (serie) o 1/L (paralelo)
  if (!(a > 0) || !(b > 0)) return null;
  const prom = real / idx.length;
  if (!(prom > 0)) return null;
  const L = serie ? a : 1 / b, C = serie ? 1 / b : a;
  const w0 = 1 / Math.sqrt(L * C), f0 = w0 / (2 * Math.PI);
  const R = serie ? prom : 1 / prom;                               // R serie o R en paralelo
  const q = serie ? (w0 * L) / R : (R / (w0 * L));
  // error del ajuste de la parte reactiva, relativo a su amplitud
  let e2 = 0, a2 = 0;
  for (const [w, y] of ruido) { const m = a * w - b / w; e2 += (m - y) ** 2; a2 += y * y; }
  const error = Math.sqrt(e2 / (a2 || 1));
  return { tipo: serie ? 'serie' : 'paralelo', f0, R, L, C, q, bw: f0 / q, error, n: idx.length, ventana };
}

// Z de un RLC serie o paralelo a la frecuencia f, para pruebas y para dibujar el modelo
export function zRLC(m, f) {
  const w = 2 * Math.PI * f;
  if (m.tipo === 'serie') return [m.R, w * m.L - 1 / (w * m.C)];
  const g = 1 / m.R, b = w * m.C - 1 / (w * m.L), d = g * g + b * b;
  return [g / d, -b / d];
}
export { Z0 };
