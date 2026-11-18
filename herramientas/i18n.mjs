// Herramienta de idiomas (el castellano es la clave; ver js/i18n.js).
//   node herramientas/i18n.mjs claves              lista las claves que usa la aplicacion
//   node herramientas/i18n.mjs faltan [codigo]     claves sin traducir (codigo de salida 1 si faltan; lo pasa la CI)
//   node herramientas/i18n.mjs actualizar          anade a cada idioma las claves nuevas (valor vacio) y avisa de las que sobran
//   node herramientas/i18n.mjs limpiar             quita de los idiomas las claves que ya no existen
//   node herramientas/i18n.mjs nuevo it Italiano   crea idiomas/it.json (y hay que anadirlo a IDIOMAS en js/i18n.js)
//   node herramientas/i18n.mjs marcar a.html ...   anade data-t / data-t-attr a los textos del HTML que aun no los llevan
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(RAIZ, ...p);
const norm = s => s.replace(/\s+/g, ' ').trim();

// ---------- HTML minimo (solo lo que usan nuestras paginas) ----------
const VACIAS = new Set(['meta', 'link', 'input', 'img', 'br', 'hr']);
const INLINE = new Set(['b', 'i', 'em', 'strong', 'a', 'code', 'span', 'kbd', 'sup', 'sub', 'br', 'u']);
const SALTAR = new Set(['script', 'style', 'svg', 'title', 'head']);
const ATRIBUTOS = ['title', 'aria-label', 'placeholder', 'alt'];

export function parsearHTML(src) {
  const raiz = { tag: '#raiz', attrs: {}, hijos: [], start: 0, openEnd: 0, closeStart: src.length, end: src.length };
  const pila = [raiz];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const finTexto = lt < 0 ? src.length : lt;
    if (finTexto > i) pila.at(-1).hijos.push({ texto: src.slice(i, finTexto), start: i, end: finTexto });
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) { i = src.indexOf('-->', lt) + 3; continue; }
    if (src.startsWith('<!', lt)) { i = src.indexOf('>', lt) + 1; continue; }
    if (src[lt + 1] === '/') {
      const fin = src.indexOf('>', lt), tag = src.slice(lt + 2, fin).trim().toLowerCase();
      for (let k = pila.length - 1; k > 0; k--) if (pila[k].tag === tag) { pila[k].closeStart = lt; pila[k].end = fin + 1; pila.length = k; break; }
      i = fin + 1; continue;
    }
    const m = /^<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/.exec(src.slice(lt));
    const tag = m[1].toLowerCase(), attrs = {};
    for (const a of m[2].matchAll(/([\w:-]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) attrs[a[1].toLowerCase()] = a[2] === undefined ? '' : a[2].replace(/^["']|["']$/g, '');
    const el = { tag, attrs, hijos: [], start: lt, openEnd: lt + m[0].length, closeStart: -1, end: -1 };
    pila.at(-1).hijos.push(el);
    i = lt + m[0].length;
    if (VACIAS.has(tag) || m[0].endsWith('/>')) { el.closeStart = el.end = i; continue; }
    if (tag === 'script' || tag === 'style') { const c = src.indexOf(`</${tag}`, i); el.closeStart = c; el.end = src.indexOf('>', c) + 1; i = el.end; continue; }
    pila.push(el);
  }
  return raiz;
}

const textoPlano = (el, src) => src.slice(el.openEnd, el.closeStart).replace(/<[^>]*>/g, ' ');
const tieneLetras = s => /\p{L}{2,}/u.test(s);
function soloInline(el) {
  return el.hijos.every(h => h.texto !== undefined || (INLINE.has(h.tag) && Object.keys(h.attrs).every(a => ['href', 'target', 'rel'].includes(a)) && soloInline(h)));
}

// Recorre el HTML y devuelve { claves: [...], inserciones: [{pos, texto}] } (las inserciones marcan lo que aun no lleva data-t)
export function analizarHTML(src) {
  const claves = [], inserciones = [];
  const marcarAttr = el => {
    const attrs = ATRIBUTOS.filter(a => el.attrs[a] && tieneLetras(el.attrs[a]));
    for (const a of attrs) claves.push(norm(el.attrs[a]));
    if (attrs.length && el.attrs['data-t-attr'] === undefined) inserciones.push({ pos: el.start + 1 + el.tag.length, texto: ` data-t-attr="${attrs.join(' ')}"` });
  };
  const visitar = el => {
    if (el.tag !== '#raiz') {
      if (SALTAR.has(el.tag) || el.attrs['data-no-t'] !== undefined) return;
      marcarAttr(el);
      if (el.attrs['data-t'] !== undefined) { claves.push(norm(src.slice(el.openEnd, el.closeStart))); return; }
      if (soloInline(el) && tieneLetras(textoPlano(el, src))) {
        claves.push(norm(src.slice(el.openEnd, el.closeStart)));
        inserciones.push({ pos: el.start + 1 + el.tag.length, texto: ' data-t' });
        return;
      }
    }
    for (const h of el.hijos) {
      if (h.texto !== undefined) {
        if (el.tag === '#raiz' || !tieneLetras(h.texto)) continue;
        const ini = h.start + (h.texto.length - h.texto.trimStart().length), fin = h.end - (h.texto.length - h.texto.trimEnd().length);
        claves.push(norm(h.texto));
        inserciones.push({ pos: ini, texto: '<span data-t>' }, { pos: fin, texto: '</span>' });
      } else visitar(h);
    }
  };
  visitar(parsearHTML(src));
  return { claves, inserciones };
}

function marcar(archivos) {
  for (const f of archivos) {
    const p = path.resolve(f);
    let src = fs.readFileSync(p, 'utf8');
    const { inserciones } = analizarHTML(src);
    for (const ins of inserciones.sort((a, b) => b.pos - a.pos)) src = src.slice(0, ins.pos) + ins.texto + src.slice(ins.pos);
    fs.writeFileSync(p, src, 'utf8');
    console.log(`${f}: ${inserciones.length} inserciones`);
  }
}

// ---------- Claves de la aplicacion ----------
const PAGINAS = ['index.html', 'diagnostico.html'];
const desescapar = s => s.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
function clavesJS(src) {
  const out = [];
  for (const m of src.matchAll(/\b(?:T|N_)\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\$])*)`)/g)) out.push(desescapar(m[1] ?? m[2] ?? m[3]));
  return out;
}
// Textos que salen de los JSON de datos (se traducen al mostrarlos con T)
function clavesJSON() {
  const out = [];
  // (las notas de bandas.json no se muestran en la interfaz)
  const s = JSON.parse(fs.readFileSync(rel('segmentos_hf.json'), 'utf8'));
  for (const banda of Object.values(s.bandas ?? {})) for (const lista of Object.values(banda)) for (const seg of [].concat(lista)) { if (seg?.nombre) out.push(seg.nombre); if (seg?.nota) out.push(seg.nota); }
  for (const dig of Object.values(s.digitales ?? {})) for (const v of Object.values(dig)) if (v?.nota) out.push(v.nota);
  return out;
}
export function todasLasClaves() {
  const set = new Set();
  const dir = d => fs.readdirSync(rel(d)).filter(f => f.endsWith('.js') && f !== 'i18n.js').map(f => rel(d, f));
  for (const f of [...dir('js'), ...dir('js/drivers')]) for (const k of clavesJS(fs.readFileSync(f, 'utf8'))) set.add(k);
  for (const p of PAGINAS) if (fs.existsSync(rel(p))) for (const k of analizarHTML(fs.readFileSync(rel(p), 'utf8')).claves) set.add(k);
  for (const k of clavesJSON()) set.add(k);
  return [...set].filter(k => k.trim()).sort();
}

const idiomasDir = rel('idiomas');
const codigos = () => (fs.existsSync(idiomasDir) ? fs.readdirSync(idiomasDir).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)) : []);
const leer = c => JSON.parse(fs.readFileSync(path.join(idiomasDir, `${c}.json`), 'utf8'));
const guardar = (c, j) => fs.writeFileSync(path.join(idiomasDir, `${c}.json`), JSON.stringify(j, null, 1) + '\n', 'utf8');
// {n} de la clave y de la traduccion deben coincidir
const marcas = s => [...s.matchAll(/\{\d+\}/g)].map(m => m[0]).sort().join('');

function main([cmd, ...a]) {
  const claves = cmd === 'marcar' ? [] : todasLasClaves();
  switch (cmd) {
    case 'claves': console.log(claves.join('\n')); console.log(`\n${claves.length} claves`); break;
    case 'marcar': marcar(a); break;
    case 'faltan': {
      let mal = 0;
      for (const c of a.length ? a : codigos()) {
        const t = leer(c).textos ?? {};
        const faltan = claves.filter(k => !t[k]);
        const marcasMal = claves.filter(k => t[k] && marcas(k) !== marcas(t[k]));
        console.log(`${c}: ${claves.length - faltan.length}/${claves.length} traducidas` + (marcasMal.length ? `, ${marcasMal.length} con marcas {n} distintas` : ''));
        for (const k of faltan.slice(0, 200)) console.log('  falta:', JSON.stringify(k));
        for (const k of marcasMal) console.log('  marcas:', JSON.stringify(k));
        mal += faltan.length + marcasMal.length;
      }
      process.exit(mal ? 1 : 0);
      break;
    }
    case 'actualizar': case 'limpiar':
      for (const c of codigos()) {
        const j = leer(c), t = j.textos ?? {}, nuevas = claves.filter(k => !(k in t)), sobran = Object.keys(t).filter(k => !claves.includes(k));
        if (cmd === 'actualizar') for (const k of nuevas) t[k] = '';
        else for (const k of sobran) delete t[k];
        j.textos = Object.fromEntries(Object.entries(t).sort(([x], [y]) => x.localeCompare(y, 'es')));
        guardar(c, j);
        console.log(`${c}: ${cmd === 'actualizar' ? `${nuevas.length} nuevas` : `${sobran.length} quitadas`}${cmd === 'actualizar' && sobran.length ? `, ${sobran.length} sobran (usa limpiar)` : ''}`);
      }
      break;
    case 'nuevo': {
      const [c, nombre] = a;
      fs.mkdirSync(idiomasDir, { recursive: true });
      guardar(c, { _nombre: nombre, textos: Object.fromEntries(claves.map(k => [k, ''])) });
      console.log(`idiomas/${c}.json creado: traduce los valores y anade ['${c}', '${nombre}'] a IDIOMAS en js/i18n.js`);
      break;
    }
    default: console.log('Uso: claves | faltan [codigo] | actualizar | limpiar | nuevo <codigo> <Nombre> | marcar <html...>');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
