// Idiomas de la interfaz. El castellano es el texto fuente y sirve de clave (como gettext): T('...{0}', x) devuelve la
// traduccion si el catalogo del idioma la tiene y, si no, el propio castellano con los {n} sustituidos. Un idioma es un archivo
// idiomas/<codigo>.json: { "_nombre": "English", "textos": { "<castellano>": "<traduccion>" } }.
//
// Reglas:
// - Todo texto nuevo de interfaz va con T(...). Los textos de datos estaticos (NIVELES_ROE, bandas.json...) se dejan en castellano,
//   se marcan con N_(...) (o salen del JSON) y se traducen al mostrarlos con T(...).
// - Cambiar de idioma recarga la pagina (index.html espera a iniciarIdioma() antes de cargar app.js), asi que T() puede usarse a
//   nivel de modulo sin que importe el orden de carga.
// - Las pruebas de Node no cargan ningun catalogo: T() devuelve el castellano.
// - Las claves {0}, {1}... se sustituyen en orden; los numeros se formatean antes de llamar a T().

export const IDIOMAS = [['es', 'Español'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch']];
const CLAVE_ALMACEN = 'chirptenna_vna_idioma';

let catalogo = {}, actual = 'es';

export const N_ = s => s; // solo marca un texto para el extractor
export const idiomaActual = () => actual;
export const T = (clave, ...a) => {
  const s = catalogo[clave] || clave;
  return a.length ? s.replace(/\{(\d+)\}/g, (m, i) => (a[+i] === undefined ? m : a[+i])) : s;
};
// Para las pruebas: instala un catalogo sin pasar por fetch
export function usarCatalogo(textos = {}, codigo = 'es') { catalogo = textos; actual = codigo; }

// ?idioma=en > preferencia guardada > idioma del navegador > castellano
export function idiomaElegido(busqueda = globalThis.location?.search ?? '', navegador = globalThis.navigator?.language ?? 'es') {
  const validos = IDIOMAS.map(i => i[0]);
  const q = new URLSearchParams(busqueda).get('idioma');
  if (validos.includes(q)) return q;
  let guardado = null;
  try { guardado = localStorage.getItem(CLAVE_ALMACEN); } catch { /* sin almacenamiento */ }
  if (validos.includes(guardado)) return guardado;
  const n = navegador.slice(0, 2).toLowerCase();
  return validos.includes(n) ? n : 'es';
}

export function guardarIdioma(codigo) {
  try { localStorage.setItem(CLAVE_ALMACEN, codigo); } catch { /* sin almacenamiento */ }
}

export async function iniciarIdioma() {
  actual = idiomaElegido();
  if (actual !== 'es') {
    try {
      const r = await fetch(new URL(`../idiomas/${actual}.json`, import.meta.url));
      if (!r.ok) throw new Error(r.status);
      catalogo = (await r.json()).textos ?? {};
    } catch { actual = 'es'; catalogo = {}; }
  }
  document.documentElement.lang = actual;
  traducirDOM();
}

const norm = s => s.replace(/\s+/g, ' ').trim();
// Traduce lo marcado en el HTML: data-t (la clave es su contenido, con marcas HTML) y data-t-attr="title aria-label" (la clave es el valor)
export function traducirDOM(raiz = document) {
  if (actual === 'es') return;
  for (const el of raiz.querySelectorAll('[data-t]')) {
    const k = norm(el.innerHTML), t = catalogo[k];
    if (t) el.innerHTML = t;
  }
  for (const el of raiz.querySelectorAll('[data-t-attr]')) {
    for (const a of el.dataset.tAttr.split(/\s+/)) {
      const v = el.getAttribute(a), t = v && catalogo[norm(v)];
      if (t) el.setAttribute(a, t);
    }
  }
}

// Selector de idioma: un <select> que guarda la preferencia y recarga
export function montarSelector(select) {
  for (const [c, n] of IDIOMAS) select.add(new Option(n, c));
  select.value = actual;
  select.onchange = () => { guardarIdioma(select.value); const u = new URL(location.href); u.searchParams.delete('idioma'); location.href = u; };
}
