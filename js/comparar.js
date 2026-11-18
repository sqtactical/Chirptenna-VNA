// Comparar antenas («shootout»): guarda medidas con nombre en el navegador y las ordena por ROE en el objetivo.
// Cada medida guarda solo lo necesario (resumen + curva de ROE de ~240 puntos en rejilla logarítmica), no los datos crudos.
import { estadisticaBanda, remuestrear } from './analisis.js';

const CLAVE = 'chirptenna_vna_medidas';
export const MAXIMO_GUARDADAS = 20;
export const MAXIMO_EN_GRAFICO = 6;
export const PALETA = ['#1565c0', '#e65100', '#2e7d32', '#8e24aa', '#c62828', '#00838f'];

const redondear = (x, d) => +x.toFixed(d);

// medida = { freq, vswr } de calcular(); obj = objetivo de la app ({ fMin, fMax, banda }); devuelve el registro a guardar
export function resumirMedida({ nombre, medida, obj, umbral, n = 240 }) {
  const f0 = medida.freq[0], f1 = medida.freq[medida.freq.length - 1];
  const rejilla = Float64Array.from({ length: n }, (_, i) => f0 * Math.pow(f1 / f0, i / (n - 1)));
  const v = remuestrear(medida.freq, medida.vswr, rejilla);
  const est = estadisticaBanda(medida, obj.fMin, obj.fMax, umbral);
  return {
    id: `m${Date.now()}${Math.floor(Math.random() * 1000)}`,
    nombre, fecha: Date.now(), objetivo: obj.banda.nombre,
    fMin: obj.fMin, fMax: obj.fMax,
    est: { roeMin: redondear(est.roeMin, 3), roeMax: redondear(est.roeMax, 3), fMejor: Math.round(est.fMejor ?? 0), fracBuena: redondear(est.fracBuena ?? 0, 3), sinPuntos: !!est.sinPuntos },
    freq: Array.from(rejilla, x => Math.round(x)),
    vswr: Array.from(v, x => (Number.isFinite(x) ? redondear(Math.min(x, 99), 3) : null)),
  };
}

export function cargarMedidas() {
  try {
    const j = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    return Array.isArray(j) ? j.filter(m => m?.id && Array.isArray(m.freq) && m.est) : [];
  } catch { return []; }
}
export function guardarMedidas(lista) {
  try { localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, MAXIMO_GUARDADAS))); return true; } catch { return false; }
}

// Mejor primero: gana la que tenga el peor punto del objetivo más bajo (en un objetivo puntual, su único valor)
export const valorOrden = m => (m.est.sinPuntos || (m.fMax - m.fMin) / ((m.fMin + m.fMax) / 2) < 0.001 ? m.est.roeMin : m.est.roeMax);
export const ordenarMedidas = lista => [...lista].sort((a, b) => valorOrden(a) - valorOrden(b) || b.fecha - a.fecha);

// Rejilla logarítmica común a las medidas guardadas, para poder superponerlas
export function rejillaComun(lista, n = 300) {
  const f0 = Math.min(...lista.map(m => m.freq[0])), f1 = Math.max(...lista.map(m => m.freq[m.freq.length - 1]));
  return Float64Array.from({ length: n }, (_, i) => f0 * Math.pow(f1 / f0, i / (n - 1)));
}
export const curvaEnRejilla = (m, rejilla) => remuestrear(Float64Array.from(m.freq), Float64Array.from(m.vswr, x => (x == null ? NaN : x)), rejilla);
