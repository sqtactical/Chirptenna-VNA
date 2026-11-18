// Frecuencia real del canal de un nodo Meshtastic, con la misma cuenta que el firmware (RadioInterface::applyModemConfig):
//   numCanales = round((fin - inicio) / (separacion + ancho))      (en MHz)
//   slot       = (slot indicado - 1) si lo hay, si no hash(nombre del canal) mod numCanales   (0..numCanales-1)
//   frecuencia = inicio + ancho / 2 + slot * ancho
// El hash es djb2 de 32 bits sobre el nombre del canal; el nombre por defecto es el del preset («LongFast»...).
// ESCRITO DE MEMORIA: las regiones y anchos de abajo coinciden con las frecuencias por defecto publicadas
// (EE. UU. LongFast 906,875 MHz, EU_433 433,875 MHz, EU_868 869,525 MHz), pero comprueba la región y el preset de tu firmware.
import { N_ } from './i18n.js';

// Regiones con los límites de la tabla de la documentación de Meshtastic (MHz; contrastada el 18-11). Las demás se miden con «Otra frecuencia».
export const REGIONES = {
  US: { nombre: N_('EE. UU. (US, 902–928 MHz)'), inicio: 902, fin: 928 },
  EU_433: { nombre: N_('Europa 433 (EU_433, 433–434 MHz)'), inicio: 433, fin: 434 },
  EU_868: { nombre: N_('Europa 868 (EU_868, 869,4–869,65 MHz)'), inicio: 869.4, fin: 869.65 },
  ANZ: { nombre: N_('Australia y Nueva Zelanda (ANZ, 915–928 MHz)'), inicio: 915, fin: 928 },
  CN: { nombre: N_('China (CN, 470–510 MHz)'), inicio: 470, fin: 510 },
  JP: { nombre: N_('Japón (JP, 920,5–923,5 MHz)'), inicio: 920.5, fin: 923.5 },
  KR: { nombre: N_('Corea (KR, 920–923 MHz)'), inicio: 920, fin: 923 },
  TW: { nombre: N_('Taiwán (TW, 920–925 MHz)'), inicio: 920, fin: 925 },
  IN: { nombre: N_('India (IN, 865–867 MHz)'), inicio: 865, fin: 867 },
  NZ_865: { nombre: N_('Nueva Zelanda 865 (NZ_865, 864–868 MHz)'), inicio: 864, fin: 868 },
  TH: { nombre: N_('Tailandia (TH, 920–925 MHz)'), inicio: 920, fin: 925 },
  MY_919: { nombre: N_('Malasia 919 (MY_919, 919–924 MHz)'), inicio: 919, fin: 924 },
  SG_923: { nombre: N_('Singapur (SG_923, 917–925 MHz)'), inicio: 917, fin: 925 },
};

// Ancho de banda de cada preset (kHz) y nombre de canal por defecto
export const PRESETS = {
  LongFast: { ancho: 250 }, LongModerate: { ancho: 125 }, LongSlow: { ancho: 125 },
  MediumFast: { ancho: 250 }, MediumSlow: { ancho: 250 },
  ShortFast: { ancho: 250 }, ShortSlow: { ancho: 250 }, ShortTurbo: { ancho: 500 },
};

export function hashCanal(nombre) {
  let h = 5381;
  for (const c of new TextEncoder().encode(nombre)) h = (Math.imul(h, 33) + c) >>> 0; // djb2: h * 33 + c, módulo 2^32
  return h;
}

// { region, preset, nombre?, slot? } -> { fMHz, anchoKHz, numCanales, slot (1..n), nombre } o null si algo no es válido
export function calcularCanal({ region, preset, nombre, slot }) {
  const r = REGIONES[region], p = PRESETS[preset];
  if (!r || !p) return null;
  const ancho = p.ancho / 1000; // MHz
  const numCanales = Math.round((r.fin - r.inicio) / ancho);
  if (numCanales < 1) return null;
  const nom = (nombre ?? '').trim() || preset;
  const s = Number.isInteger(+slot) && +slot >= 1 && +slot <= numCanales ? +slot - 1 : hashCanal(nom) % numCanales;
  const fMHz = +(r.inicio + ancho / 2 + s * ancho).toFixed(6);
  return { fMHz, anchoKHz: p.ancho, numCanales, slot: s + 1, nombre: nom };
}
