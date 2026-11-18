// Cricky, el grillo asistente (guiño a Clippy): un grillo pequeño con una burbuja que comenta lo que pasa en la app.
// Reglas de convivencia: habla solo ante eventos (nunca por intervalos), no bloquea nada, se cierra de un clic, se puede
// silenciar para siempre y solo se ve en el modo Simple. Los textos salen de lo que ya calcula la app (nivel de ROE, curva
// irregular, multibanda...); no duplica el detalle de la tarjeta de recomendación, solo lo resume en una frase.
import { nivelROE } from './analisis.js';

export const NOMBRE = 'Cricky'; // un solo sitio: aquí se cambia el nombre del grillo

const fmtROE = x => x.toFixed(2);

// Evento -> { id, img (variantes/<img>.svg), texto } o null. Función pura: se prueba sin DOM.
export function elegirMensaje(evento, d = {}) {
  switch (evento) {
    case 'inicio':
      return { id: 'inicio', img: 'estado-conecta', texto: `Soy ${NOMBRE}. Parece que quieres medir una antena. ¿Conectamos el NanoVNA? Si solo quieres probar, marca «Modo simulado».` };
    case 'conectado':
      return d.calibracionApp
        ? { id: 'conectado-cal', img: 'roe-aceptable', texto: 'Conectado y con calibración propia. Elige la banda y pulsa Medir.' }
        : { id: 'conectado', img: 'osl-tramos', texto: 'Conectado. ¿Has calibrado? Si no, el asistente de calibración te guía (open, short, load) y puedes hacerlo por tramos.' };
    case 'cuenta-atras':
      return { id: 'cuenta-atras', img: 'estado-alejate', texto: 'Aléjate de la antena y no toques el cable: tu mano cambia la medida.' };
    case 'midiendo':
      return { id: 'midiendo', img: 'estado-midiendo', texto: 'Midiendo… quieto, que yo también me quedo quieto.' };
    case 'perdida':
      return { id: 'perdida', img: 'estado-desconectado', texto: 'Se ha soltado el cable o el equipo. Vuelve a conectar y repite la medida.' };
    case 'falta-cal':
      return { id: 'falta-cal', img: 'osl-tramos', texto: 'Falta calibrar parte del rango medido. El asistente te guía tramo a tramo y puedes dejarlo para otro día.' };
    case 'resultado': return mensajeResultado(d);
    default: return null;
  }
}

// d = { reco, nombre }: reco es lo que devuelve recomendacion() en modo 'roe'
// Frase sobre los modos de HF (CW, SSB, FT8...) a partir de coberturaSegmentos(); '' si no hay segmentos medidos.
// segmento: el tramo elegido por el usuario (si lo hay) se comenta aparte.
export function resumenHF(cobertura, segmento) {
  const filas = (cobertura ?? []).filter(f => f.medido);
  if (!filas.length) return '';
  const ok = f => ['muy_bien', 'aceptable'].includes(f.nivel.id);
  const lista = fs => fs.map(f => f.segmento.nombre).join(', ');
  const partes = [];
  const sel = segmento && filas.find(f => f.segmento.id === segmento.id);
  if (sel) {
    partes.push(ok(sel)
      ? `Para ${sel.segmento.nombre} (el tramo que has elegido) va bien: ${sel.nivel.consejo.toLowerCase()}.`
      : `Para ${sel.segmento.nombre} (el tramo que has elegido) no llega: ${sel.nivel.consejo.toLowerCase()}.`);
  }
  const otros = filas.filter(f => f !== sel);
  const bien = otros.filter(ok), mal = otros.filter(f => !ok(f));
  if (!otros.length) return partes.join(' ');
  if (!mal.length) partes.push(`En HF sirve para todos los modos medidos (${lista(bien)}).`);
  else if (!bien.length) partes.push(`En HF no queda bien en ningún modo medido (${lista(mal)}): mira la tabla por modos.`);
  else partes.push(`En HF va bien en ${lista(bien)}, pero no en ${lista(mal)}.`);
  return partes.join(' ');
}

export function mensajeResultado({ reco, cobertura, segmento }) {
  if (!reco) return null;
  if (reco.accion === 'sin_resonancia') {
    return { id: 'sin-resonancia', img: 'estado-sin-resonancia', texto: 'No veo ninguna resonancia en lo medido. Sube el margen lateral o mide en barrido general, y revisa el cable y la calibración.' };
  }
  if (reco.accion === 'irregular') {
    return { id: 'irregular', img: 'tec-curva-real', texto: 'La curva sube y baja mucho, así que no te doy un porcentaje de corte. Mide la frecuencia exacta que vas a usar.' };
  }
  const e = reco.est;
  if (!e) return null;
  const puntual = e.n <= 3 || e.roeMax - e.roeMin < 1e-9;
  const nivel = nivelROE(puntual ? e.roeMin : e.roeMax);
  const rango = puntual ? `ROE ${fmtROE(e.roeMin)}` : `ROE entre ${fmtROE(e.roeMin)} y ${fmtROE(e.roeMax)}`;
  const extra = [];
  if (reco.multibanda) extra.push('Parece una multibanda: ajusta una banda cada vez y vuelve a medir las demás.');
  else if (reco.accion === 'cortar' || reco.accion === 'alargar') extra.push(`${reco.titulo}.`);
  const rx = reco.rx;
  const xFuera = rx && rx.tipo === 'serie' && Math.abs(rx.desv) > 0.025;
  if (xFuera) {
    extra.push(`Ojo: la resonancia eléctrica (X = 0) cae un ${(Math.abs(rx.desv) * 100).toFixed(1)} % ${rx.desv > 0 ? 'por encima' : 'por debajo'} del mínimo de ROE. Activa «Mostrar la resonancia eléctrica» para verla; el porcentaje de longitud puede fallar, así que ajusta poco a poco.`);
  }
  const hf = resumenHF(cobertura, segmento);
  if (hf) extra.push(hf);
  const cabecera = {
    muy_bien: '¡Música para mis antenas!',
    aceptable: 'Aceptable.',
    mejorable: 'Mejorable.',
    mal: 'Mal acoplada.',
  }[nivel.id];
  const img = reco.multibanda ? 'tipo-multibanda' : `roe-${nivel.id.replace('_', '-')}`;
  return { id: `resultado-${nivel.id}${reco.multibanda ? '-mb' : ''}${hf ? '-hf' : ''}${xFuera ? '-x' : ''}`, img, texto: [`${cabecera} ${rango}: ${nivel.consejo.toLowerCase()}.`, ...extra].join(' '), nivel: nivel.id };
}

// ---------- DOM ----------
// contenedor: { raiz, img, burbuja, texto, vale, no }; opciones: { base: 'img/variantes/', activo: () => bool }
export function crearGrillo(el, { base = 'img/variantes/', clave = 'grillo' } = {}) {
  let ultimo = null, silenciado = false, idPrevio = null;
  try { silenciado = localStorage.getItem(clave) === 'off'; } catch { /* sin almacenamiento */ }
  const pintar = () => { el.raiz.dataset.activo = silenciado ? '0' : '1'; };
  pintar();

  const cerrar = () => { el.burbuja.hidden = true; };
  const abrir = () => { if (ultimo) { el.burbuja.hidden = false; } };
  el.vale.onclick = cerrar;
  el.no.onclick = () => { silenciar(true); };
  el.img.onclick = () => (el.burbuja.hidden ? abrir() : cerrar());
  el.img.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.img.onclick(); } };

  function silenciar(si) {
    silenciado = si;
    try { localStorage.setItem(clave, si ? 'off' : 'on'); } catch { /* sin almacenamiento */ }
    pintar();
    if (si) cerrar();
    el.alCambiar?.(!si);
  }

  // Muestra un mensaje (de elegirMensaje). No repite el mismo mensaje dos veces seguidas.
  function decir(msg) {
    if (!msg || silenciado) return;
    ultimo = msg;
    el.img.src = `${base}${msg.img}.svg`;
    el.img.alt = `${NOMBRE}: ${msg.texto}`;
    if (msg.id === idPrevio && !el.burbuja.hidden) return;
    idPrevio = msg.id;
    el.texto.textContent = msg.texto;
    el.burbuja.hidden = false;
  }

  return { decir, silenciar, estaActivo: () => !silenciado, cerrar };
}
