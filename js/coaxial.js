// Medidas de un tramo de coaxial con el extremo abierto o en corto: longitud eléctrica, factor de velocidad,
// pérdida y largo de un stub. Sin DOM (se prueba con Node).

import { N_ } from './i18n.js';

export const C0 = 299792458;

const mediana = a => { const b = [...a].sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

// medida = salida de calcular(). El retardo de grupo del S11 de una línea con el extremo reflejando todo es 2·τ.
// largoM = largo físico en metros (opcional). f = frecuencia para dar la pérdida (Hz).
export function medirLinea(medida, largoM, f) {
  const n = medida.freq.length;
  if (n < 8) return null;
  const ret = Array.from(medida.retardo.slice(2, n - 2));
  const tau = mediana(ret) / 2e9; // s, una sola ida
  const paso = (medida.freq[n - 1] - medida.freq[0]) / (n - 1);
  // la fase entre dos puntos no puede girar media vuelta o más (ambigüedad): paso·4τ < 1
  // (si el paso es grande, el τ medido ya sale falso: con el largo físico se comprueba con el VF más bajo habitual, 0,66)
  const ambigua = paso * 4 * tau >= 1 || (largoM > 0 && paso * 4 * largoM / (0.66 * C0) >= 1);
  if (!(tau > 0)) return { tau, valido: false, ambigua };
  let i = 0;
  for (let k = 1; k < n; k++) if (Math.abs(medida.freq[k] - f) < Math.abs(medida.freq[i] - f)) i = k;
  const perdidaIda = Math.max(0, -medida.mag[i]) / 2; // dB de ida en f si el extremo refleja todo
  const res = { valido: true, tau, ambigua, perdidaIdaDb: perdidaIda, fPerdida: medida.freq[i], largoElectricoM: C0 * tau };
  if (largoM > 0) {
    res.vf = (largoM / (C0 * tau));
    res.perdidaPor100m = perdidaIda / largoM * 100;
  }
  return res;
}

// Resultado de `medirLinea` en el formato que lee Chirptenna Wire (`--cable-medido`): solo el VF y la pérdida, con su origen.
// Devuelve null si no hay largo físico (sin él no hay VF) o la medida no es válida.
export function paraWire(r, { largoM, extremo = 'abierto', nombre = '', fecha = new Date() } = {}) {
  if (!r || !r.valido || r.ambigua || !(largoM > 0) || !(r.vf > 0.3 && r.vf <= 1)) return null;
  return {
    formato: 'chirptenna-cable', version: 1, nombre,
    vf: +r.vf.toFixed(4), largo_m: +largoM.toFixed(4), extremo,
    perdida_db_100m: +r.perdidaPor100m.toFixed(2), f_perdida_MHz: +(r.fPerdida / 1e6).toFixed(3),
    fecha: fecha.toISOString().slice(0, 10), origen: 'Chirptenna VNA, retardo de grupo de S11',
  };
}

// Largo físico de un stub de λ/4 o λ/2 a la frecuencia f con ese factor de velocidad (m)
export function largoStub(fraccion, f, vf) { return fraccion * vf * C0 / f; }

// Un stub abierto de λ/4 se comporta como un cortocircuito (y uno en corto, como un abierto)
export function descripcionStub(extremo, fraccion) {
  if (fraccion === 0.25) return extremo === 'abierto' ? N_('cortocircuito') : N_('circuito abierto');
  return extremo === 'abierto' ? N_('circuito abierto') : N_('cortocircuito');
}
