// Puente con Chirptenna (el generador de antenas): lee el resultado.json de una simulación y compara la resonancia
// simulada con la medida; de ahí deduce la εr efectiva real del sustrato. Sin DOM: se prueba con Node.
import { T } from './i18n.js';

export function leerResultadoChirptenna(texto) {
  let j;
  try { j = JSON.parse(String(texto).replace(/^﻿/, '')); } catch { throw new Error(T('El archivo no es un resultado.json válido de Chirptenna.')); }
  const f = +j.f_resonancia_MHz;
  if (!Number.isFinite(f) || f <= 0) throw new Error(T('El resultado.json no trae la frecuencia de resonancia simulada (f_resonancia_MHz).'));
  return {
    tipo: j.clave ?? '', fRes: f * 1e6, s11MinDb: Number.isFinite(+j.s11_min_dB) ? +j.s11_min_dB : null,
    eficiencia: Number.isFinite(+j['eficiencia_total_%']) ? +j['eficiencia_total_%'] : null, fiable: j.verificacion_malla?.veredicto !== 'sensible',
  };
}

// La frecuencia de una antena impresa escala con 1/√εeff, con εeff ≈ (εr+1)/2 para una pista sobre el sustrato.
// Dada la resonancia simulada con εr_sim y la medida, devuelve la εeff y la εr que explicarían el desplazamiento.
export function deducirEr(fSim, fMed, erSim) {
  const effSim = (erSim + 1) / 2, effMed = effSim * (fSim / fMed) ** 2;
  return { desplazamiento: fMed / fSim - 1, erEfectivaMedida: effMed, erMedida: 2 * effMed - 1 };
}
