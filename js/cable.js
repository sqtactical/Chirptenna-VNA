// Desincrustar el cable: lleva el plano de medida del conector del equipo al de la antena (extensión de puerto + pérdida).
// Sin DOM (se prueba con Node). S11 de la antena = S11 medido · e^{+j2βl} · 10^{+2·pérdida/20}.
import { C0 } from './coaxial.js';

// Pérdida de ida (dB) de un tramo a la frecuencia f: la del cable a 100 MHz por 100 m, creciendo con √f
export const perdidaIdaDb = (f, largoM, dbPor100mA100MHz) => dbPor100mA100MHz * Math.sqrt(f / 1e8) * largoM / 100;

export function quitarCable(crudo, { largoM, vf, dbPor100m = 0 }) {
  if (!(largoM > 0) || !(vf > 0 && vf <= 1)) return crudo;
  const n = crudo.freq.length, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = crudo.freq[i], fase = 2 * (2 * Math.PI * f * largoM) / (vf * C0);
    const ganancia = 10 ** (2 * perdidaIdaDb(f, largoM, dbPor100m) / 20);
    const c = Math.cos(fase), s = Math.sin(fase);
    re[i] = ganancia * (crudo.re[i] * c - crudo.im[i] * s);
    im[i] = ganancia * (crudo.re[i] * s + crudo.im[i] * c);
  }
  return { ...crudo, re, im };
}
