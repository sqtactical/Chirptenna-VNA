// Comprobación de un transformador de impedancia de una EFHW (9:1, 49:1 o 64:1) para Chirptenna Wire y cualquier antena de HF.
// Se pone una resistencia de relación × 50 Ω en el lado del hilo, se mide en el lado del coaxial y lo que se ve es la ROE que
// presentaría la antena si fuera esa resistencia pura. Sin DOM: se prueba con Node.
import { BANDAS_CHOKE } from './choke.js';

export const RELACIONES = [9, 49, 64];
export const ROE_BUENA = 1.5;       // hasta aquí, bien
export const ROE_JUSTA = 2.0;       // hasta aquí, aceptable

// Resistencia de carga (Ω) y un valor de la serie E24 cercano que sirve para la prueba.
export function cargaNominal(relacion) {
  const ideal = 50 * relacion;
  const e24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];
  let mejor = null;
  for (const dec of [100, 1000, 10000]) for (const v of e24) {
    const r = v * dec / 10;
    if (mejor === null || Math.abs(r - ideal) < Math.abs(mejor - ideal)) mejor = r;
  }
  return { ideal, comercial: mejor };
}

const roeDe = (zr, zx) => {
  const nr = zr - 50, dr = zr + 50, a = Math.hypot(nr, zx), b = Math.hypot(dr, zx);
  const g = b > 0 ? a / b : 1;
  return g >= 1 ? Infinity : (1 + g) / (1 - g);
};

// medida = { freq (Hz), zr, zx (Ω) }. Una fila por banda de HF que la medida cubre: ROE mínima y máxima y veredicto.
export function analizarTransformador(medida, bandas = BANDAS_CHOKE) {
  const filas = [];
  for (const [nombre, a, b] of bandas) {
    let roeMin = Infinity, roeMax = 0, n = 0;
    for (let i = 0; i < medida.freq.length; i++) {
      const f = medida.freq[i] / 1e6;
      if (f < a || f > b) continue;
      const r = roeDe(medida.zr[i], medida.zx[i]);
      if (Number.isNaN(r)) continue;
      roeMin = Math.min(roeMin, r); roeMax = Math.max(roeMax, r); n++;
    }
    if (!n) continue;
    const veredicto = roeMax <= ROE_BUENA ? 'bien' : roeMax <= ROE_JUSTA ? 'justo' : 'mal';
    filas.push({ nombre, fMin: a, fMax: b, roeMin, roeMax, puntos: n, veredicto });
  }
  return filas;
}

// Qué retocar: mal en las bandas bajas (inductancia magnetizante corta) o en las altas (fugas y capacidad).
export function consejoTransformador(filas) {
  if (!filas.length) return 'sin_bandas';
  const malas = filas.filter(f => f.veredicto === 'mal');
  if (!malas.length) return filas.some(f => f.veredicto === 'justo') ? 'justo' : 'bien';
  const bajas = malas.filter(f => f.fMax < 10), altas = malas.filter(f => f.fMin >= 14);
  if (bajas.length && !altas.length) return 'faltan_vueltas';
  if (altas.length && !bajas.length) return 'menos_fugas';
  return 'general';
}
