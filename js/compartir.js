// Compartir una medida: se guarda en la propia URL (después de #m=), comprimida, sin servidor. Quien abre el enlace ve la
// curva de ROE y el veredicto, pero no los datos crudos (fase, impedancia): solo se guardan ~160 puntos de ROE.
// El contenido de un enlace es una entrada NO fiable (cualquiera puede fabricar uno): se valida y se limpian los textos.
import { remuestrear } from './analisis.js';

const aBase64Url = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const deBase64Url = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export async function codificar(obj) {
  const json = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream === 'undefined') return 'j' + aBase64Url(json);
  const z = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return 'z' + aBase64Url(new Uint8Array(z));
}

export async function decodificar(texto) {
  const bytes = deBase64Url(texto.slice(1));
  let json;
  if (texto[0] === 'z') json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  else if (texto[0] === 'j') json = bytes;
  else throw new Error('formato');
  return JSON.parse(new TextDecoder().decode(json));
}

// Registro compacto de una medida ({ freq, vswr } de calcular()) para el enlace
export function registroParaEnlace({ medida, obj, umbral, n = 160 }) {
  const f0 = medida.freq[0], f1 = medida.freq[medida.freq.length - 1];
  const rejilla = Float64Array.from({ length: n }, (_, i) => f0 * Math.pow(f1 / f0, i / (n - 1)));
  const v = remuestrear(medida.freq, medida.vswr, rejilla);
  return {
    v: 1, t: Date.now(), o: obj.banda.nombre, a: obj.fMin, b: obj.fMax, u: +umbral.toFixed(3),
    f: Array.from(rejilla, x => Math.round(x)), s: Array.from(v, x => +Math.min(Number.isFinite(x) ? x : 99, 99).toFixed(2)),
  };
}

const limpio = (s, max) => String(s ?? '').replace(/[<>&"'`\\]/g, '').slice(0, max);

// Valida lo que viene de la URL; devuelve null si no es una medida creíble
export function validarRegistro(r) {
  if (!r || r.v !== 1 || !Array.isArray(r.f) || !Array.isArray(r.s) || r.f.length !== r.s.length || r.f.length < 20 || r.f.length > 1000) return null;
  const num = x => typeof x === 'number' && Number.isFinite(x);
  if (!r.f.every(num) || !r.s.every(x => num(x) && x >= 1)) return null;
  if (!r.f.every((x, i) => x > 0 && (i === 0 || x > r.f[i - 1]))) return null;
  if (![r.a, r.b, r.u, r.t].every(num) || !(r.a > 0 && r.b >= r.a) || r.u < 0.5 || r.u > 60) return null;
  return { v: 1, t: r.t, o: limpio(r.o, 60), a: r.a, b: r.b, u: r.u, f: r.f, s: r.s };
}

// Medida reconstruida para la app: del ROE se saca |Γ| (la fase no se conserva)
export function medidaDeRegistro(r) {
  const gamma = r.s.map(v => (v - 1) / (v + 1));
  return { freq: Float64Array.from(r.f), re: Float64Array.from(gamma), im: new Float64Array(gamma.length) };
}

export const enlaceDe = (codigo, base = globalThis.location?.href.split('#')[0] ?? '') => `${base}#m=${codigo}`;
export const codigoDeHash = (hash = globalThis.location?.hash ?? '') => hash.match(/^#m=([zj][A-Za-z0-9_-]+)$/)?.[1] ?? null;
