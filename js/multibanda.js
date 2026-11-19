// Antenas multibanda: veredicto por banda (dipolo en abanico, EFHW, G5RV, verticales con trampas) y aviso de
// arrastre cuando ajustar una banda mueve otra. Sin DOM (se prueba con Node).
import { T } from './i18n.js';
import { recomendacion } from './analisis.js';

// bandas = [{ nombre, f_min, f_max (MHz) }…]. Cada banda se juzga con su propia recomendación (con el criterio multibanda:
// cada banda la manda un tramo, no la longitud total).
export function veredictosPorBanda(medida, picos, bandas, umbralDb, unidad = 'rl') {
  return bandas.map(b => {
    const obj = { fMin: b.f_min * 1e6, fMax: b.f_max * 1e6 };
    const reco = recomendacion(medida, picos, obj, umbralDb, unidad, { multibanda: true });
    return { banda: b, obj, reco };
  });
}

// Lo que se guarda de una medida para compararla con la siguiente
export const resumenPorBanda = vs => ({
  clave: vs.map(v => v.banda.nombre).join('|'),
  bandas: vs.map(v => ({ nombre: v.banda.nombre, fRes: v.reco.fRes ?? null, roeMax: v.reco.est?.roeMax ?? null, accion: v.reco.accion })),
});

const UMBRAL_MOVIMIENTO = 0.005; // la resonancia se movió más de un 0,5 %
const UMBRAL_EMPEORA = 0.25;     // la ROE del peor punto subió más de un 25 %

// Compara dos medidas seguidas de las mismas bandas: si al ajustar una se movió o empeoró otra, lo dice.
export function avisosArrastre(previo, actual) {
  if (!previo || !actual || previo.clave !== actual.clave) return [];
  const movidas = [], empeoradas = [];
  actual.bandas.forEach((b, i) => {
    const p = previo.bandas[i];
    if (p.fRes && b.fRes && Math.abs(b.fRes / p.fRes - 1) > UMBRAL_MOVIMIENTO) movidas.push({ nombre: b.nombre, de: p.fRes, a: b.fRes });
    if (p.roeMax && b.roeMax && b.roeMax / p.roeMax - 1 > UMBRAL_EMPEORA) empeoradas.push(b.nombre);
  });
  const av = [];
  const mhz = f => +(f / 1e6).toFixed(3);
  if (movidas.length >= 2) {
    av.push({ id: 'arrastre', texto: T('Entre las dos últimas medidas se han movido a la vez la resonancia de {0}. En una antena multibanda los tramos se influyen: ajusta una banda cada vez y vuelve a medir todas.', movidas.map(m => `${m.nombre} (${mhz(m.de)} → ${mhz(m.a)} MHz)`).join(', ')) });
  } else if (movidas.length === 1 && empeoradas.some(n => n !== movidas[0].nombre)) {
    const otras = empeoradas.filter(n => n !== movidas[0].nombre);
    av.push({ id: 'arrastre', texto: T('Al mover la resonancia de {0} ha empeorado la adaptación de {1}. Ajustar una banda estropea la otra: busca un compromiso o toca solo el tramo que gobierna cada una.', movidas[0].nombre, otras.join(', ')) });
  }
  return av;
}
