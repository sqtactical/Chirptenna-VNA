// Graficos en canvas: series vs frecuencia (eje X logaritmico), perdida de retorno y carta de Smith.
import { NIVELES_ROE } from './analisis.js';
import { T, idiomaActual } from './i18n.js';

const COLOR_ESTADO = { ok: '#2e9e5b', parcial: '#d6a21a', no: '#c8453b', sin_datos: '#888888', fuera: '#888888' };
export const MARGEN = { l: 52, r: 12, t: 30, b: 34 }; // el margen superior aloja el nombre y el marcador de la banda

function tema(opts) {
  if (opts.claro) return { texto: '#1f2a30', rejilla: '#e1e6e9', linea: '#1565c0', fondo: '#ffffff', alerta: '#c62828' };
  const css = getComputedStyle(document.documentElement);
  const g = (n, f) => css.getPropertyValue(n).trim() || f;
  return { texto: g('--texto', '#222'), rejilla: g('--rejilla', '#ccc'), linea: g('--linea', '#1565c0'), fondo: null, alerta: g('--error', '#c62828') };
}

function preparar(canvas, opts) {
  const dpr = opts.dpr ?? (window.devicePixelRatio || 1);
  const w = opts.ancho ?? canvas.clientWidth, h = opts.alto ?? canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  const t = tema(opts);
  if (t.fondo) { c.fillStyle = t.fondo; c.fillRect(0, 0, w, h); } else c.clearRect(0, 0, w, h);
  c.font = '11px system-ui, sans-serif';
  return { c, w, h, t };
}

function pasoBonito(rango, objetivo = 5) {
  const crudo = rango / objetivo, mag = 10 ** Math.floor(Math.log10(crudo)), r = crudo / mag;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * mag;
}

function rangoAuto(series) {
  const v = [];
  for (const s of series) for (const y of s.y) if (Number.isFinite(y)) v.push(y);
  v.sort((a, b) => a - b);
  if (!v.length) return [0, 1];
  let lo = v[Math.floor(v.length * 0.02)], hi = v[Math.ceil(v.length * 0.98) - 1];
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

// Frecuencia (Hz) correspondiente a una coordenada X (en px CSS) de un canvas dibujado con dibujarSerie.
export function xAFrecuencia(canvas, freq, px) {
  const w = canvas.clientWidth, fmin = freq[0], fmax = freq[freq.length - 1];
  const u = Math.min(1, Math.max(0, (px - MARGEN.l) / (w - MARGEN.l - MARGEN.r)));
  return 10 ** (Math.log10(fmin) + u * (Math.log10(fmax) - Math.log10(fmin)));
}

// series: [{ y: ArrayLike<number>, color?: string, nombre?: string }]
// opts: { yMin, yMax, unidad, titulo, umbral, evaluacion, marcadorF, claro, ancho, alto, dpr }
export function dibujarSerie(canvas, freq, series, opts = {}) {
  const { c, w, h, t } = preparar(canvas, opts);
  const m = MARGEN;
  const fmin = freq[0], fmax = freq[freq.length - 1];
  let [yMin, yMax] = opts.yMin != null && opts.yMax != null ? [opts.yMin, opts.yMax] : rangoAuto(series);
  const X = f => m.l + ((Math.log10(f) - Math.log10(fmin)) / (Math.log10(fmax) - Math.log10(fmin))) * (w - m.l - m.r);
  const Y = v => m.t + (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin)) * (h - m.t - m.b);

  // regiones horizontales (p. ej. los niveles de ROE), con su etiqueta a la derecha
  for (const r of opts.regionesY ?? []) {
    const y0 = Y(Math.min(r.hasta, yMax)), y1 = Y(Math.max(r.desde, yMin));
    if (y1 - y0 < 1) continue;
    c.globalAlpha = 0.17; c.fillStyle = r.color; c.fillRect(m.l, y0, w - m.l - m.r, y1 - y0);
    c.globalAlpha = 1;
    if (r.etiqueta) {
      c.fillStyle = t.texto; c.globalAlpha = 0.85; c.textAlign = 'right';
      c.fillText(r.etiqueta, w - m.r - 6, (y0 + y1) / 2 + 4);
      c.textAlign = 'left'; c.globalAlpha = 1;
    }
  }
  // Bandas medidas: relleno suave, bordes sólidos del color del resultado, marcador ▼ y, si son pocas, su nombre en el margen
  // superior. Así se distinguen bien aunque haya zonas de color debajo (niveles de ROE) y aunque la banda sea muy estrecha.
  const bandas = (opts.evaluacion ?? []).filter(e => e.estado !== 'fuera');
  for (const e of bandas) {
    const color = COLOR_ESTADO[e.estado];
    const x0 = X(Math.max(e.banda.f_min * 1e6, fmin)), x1 = X(Math.min(e.banda.f_max * 1e6, fmax));
    const ancho = Math.max(6, x1 - x0), xc = (x0 + x1) / 2, xa = xc - ancho / 2;
    c.globalAlpha = 0.2; c.fillStyle = color; c.fillRect(xa, m.t, ancho, h - m.t - m.b);
    // con muchas bandas (barrido general) solo se dibujan bordes y marcador en las que cubren algo; las rojas, solo el relleno
    if (bandas.length > 3 && e.estado === 'no') continue;
    c.globalAlpha = 1; c.strokeStyle = color; c.lineWidth = 1.6; c.setLineDash([]);
    c.beginPath(); c.moveTo(xa, m.t - 2); c.lineTo(xa, h - m.b); c.moveTo(xa + ancho, m.t - 2); c.lineTo(xa + ancho, h - m.b); c.stroke();
    c.fillStyle = color; c.beginPath(); c.moveTo(xc - 5, m.t - 8); c.lineTo(xc + 5, m.t - 8); c.lineTo(xc, m.t - 1); c.closePath(); c.fill();
    if (bandas.length <= 3) {
      const nombre = `${e.banda.servicio.toUpperCase()} ${e.banda.nombre}`.slice(0, 40);
      c.font = 'bold 11px system-ui, sans-serif';
      const tw = c.measureText(nombre).width, tx = Math.min(Math.max(xc, m.l + tw / 2), w - m.r - tw / 2);
      c.textAlign = 'center'; c.fillStyle = color; c.fillText(nombre, tx, m.t - 12); c.textAlign = 'left';
      c.font = '11px system-ui, sans-serif';
    }
  }
  c.globalAlpha = 1; c.lineWidth = 1;

  c.strokeStyle = t.rejilla; c.lineWidth = 1; c.fillStyle = t.texto;
  const paso = pasoBonito(yMax - yMin);
  for (let v = Math.ceil(yMin / paso) * paso; v <= yMax + 1e-9; v += paso) {
    c.beginPath(); c.moveTo(m.l, Y(v)); c.lineTo(w - m.r, Y(v)); c.stroke();
    c.fillText(`${+v.toPrecision(4)}${opts.unidad ? ' ' + opts.unidad : ''}`, 4, Y(v) + 4);
  }
  for (let d = Math.floor(Math.log10(fmin)); d <= Math.ceil(Math.log10(fmax)); d++) {
    for (const k of [1, 2, 5]) {
      const f = k * 10 ** d;
      if (f < fmin || f > fmax) continue;
      c.beginPath(); c.moveTo(X(f), m.t); c.lineTo(X(f), h - m.b); c.stroke();
      c.fillText(f >= 1e9 ? `${f / 1e9}G` : f >= 1e6 ? `${f / 1e6}M` : `${f / 1e3}k`, X(f) - 8, h - m.b + 14);
    }
  }
  if (opts.umbral != null) {
    c.strokeStyle = t.alerta; c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(m.l, Y(opts.umbral)); c.lineTo(w - m.r, Y(opts.umbral)); c.stroke();
    c.setLineDash([]);
  }
  // curvas
  series.forEach((s, k) => {
    c.strokeStyle = s.color ?? t.linea; c.lineWidth = s.discontinua ? 1.3 : 1.6; c.beginPath();
    if (s.discontinua) c.setLineDash([5, 4]);
    let pluma = false; // levantada con los NaN (parte no medida de una curva remuestreada)
    for (let i = 0; i < freq.length; i++) {
      if (!Number.isFinite(s.y[i])) { pluma = false; continue; }
      const x = X(freq[i]), y = Y(s.y[i]);
      pluma ? c.lineTo(x, y) : c.moveTo(x, y);
      pluma = true;
    }
    c.stroke(); c.setLineDash([]);
    if (series.length > 1 && s.nombre) {
      c.fillStyle = s.color ?? t.linea; c.fillText('— ' + s.nombre, m.l + 8 + k * 125, m.t + 24);
    }
  });
  // resonancia eléctrica (X = 0): línea violeta discontinua con su etiqueta abajo
  for (const mk of opts.marcasX ?? []) {
    if (mk.f < fmin || mk.f > fmax) continue;
    const x = X(mk.f), derecha = x > w * 0.7;
    c.strokeStyle = '#9b5de5'; c.lineWidth = 1.6; c.setLineDash([6, 4]);
    c.beginPath(); c.moveTo(x, m.t); c.lineTo(x, h - m.b); c.stroke(); c.setLineDash([]);
    c.fillStyle = '#9b5de5'; c.font = 'bold 11px system-ui, sans-serif'; c.textAlign = derecha ? 'right' : 'left';
    c.fillText(mk.etiqueta, x + (derecha ? -5 : 5), h - m.b - 6);
    c.textAlign = 'left'; c.font = '11px system-ui, sans-serif'; c.lineWidth = 1;
  }
  // cursor
  if (opts.marcadorF != null && opts.marcadorF >= fmin && opts.marcadorF <= fmax) {
    c.strokeStyle = t.texto; c.lineWidth = 1; c.globalAlpha = 0.6;
    c.beginPath(); c.moveTo(X(opts.marcadorF), m.t); c.lineTo(X(opts.marcadorF), h - m.b); c.stroke();
    c.globalAlpha = 1;
  }
  c.fillStyle = t.texto;
  if (opts.titulo) c.fillText(opts.titulo, m.l + 8, m.t + 12);
}

// Compatibilidad: grafico de perdida de retorno con bandas y umbral.
export function dibujar(canvas, medida, evaluacion, umbralDb, opts = {}) {
  dibujarSerie(canvas, medida.freq, [{ y: medida.rl }], {
    yMin: 0, yMax: 40, unidad: 'dB', umbral: umbralDb, evaluacion,
    titulo: T('Pérdida de retorno (más alto = mejor adaptada)'), ...opts,
  });
}

// Gráfico de ROE (VSWR) con bandas y umbral: el modo Simple lo usa en lugar de la pérdida de retorno.
// El criterio de «bien adaptada» (ROE 2) lo marca el límite entre las zonas «Aceptable» y «Mejorable»; umbralDb no se usa aquí.
// Las zonas de color de los niveles de ROE, con su etiqueta
function regionesROE() {
  let desde = 1;
  return NIVELES_ROE.map(n => { const r = { desde, hasta: n.max, color: n.color, etiqueta: `${n.etiqueta} (${n.max === Infinity ? T('más de {0}', desde) : `${desde}–${n.max}`})`.replace(/\./g, idiomaActual() === 'en' ? '.' : ',') }; desde = n.max; return r; });
}

// Varias curvas de ROE (p. ej. antenas guardadas para compararlas) sobre las zonas de nivel; series: [{ y, nombre, color }]
export function dibujarROEvarias(canvas, freq, series, opts = {}) {
  dibujarSerie(canvas, freq, series, { yMin: 1, yMax: 5, regionesY: regionesROE(), titulo: T('ROE (más bajo = mejor adaptada)'), ...opts });
}

export function dibujarROE(canvas, medida, evaluacion, umbralDb, opts = {}) {
  const regionesY = regionesROE();
  // opts.previo: ROE de la medida anterior ya remuestreada a medida.freq (línea gris discontinua) para ver el efecto de un ajuste
  const series = [{ y: medida.vswr, nombre: T('Ahora') }];
  if (opts.previo) series.unshift({ y: opts.previo, color: '#9aa0a6', discontinua: true, nombre: T('Medida anterior') });
  dibujarSerie(canvas, medida.freq, series.length > 1 ? series : [{ y: medida.vswr }], {
    yMin: 1, yMax: 5, evaluacion, regionesY, // sin línea de umbral: el límite de «aceptable» (ROE 2) ya lo marcan las zonas
    titulo: T('ROE (más bajo = mejor adaptada)'), ...opts,
  });
}

// Carta de Smith (Z0 normalizada). Traza del coeficiente de reflexion; marcador opcional.
export function dibujarSmith(canvas, medida, opts = {}) {
  const { c, w, h, t } = preparar(canvas, opts);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 16;
  const P = (re, im) => [cx + re * R, cy - im * R];

  c.strokeStyle = t.rejilla; c.lineWidth = 1; c.fillStyle = t.texto;
  c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.stroke();
  c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.stroke();
  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, 2 * Math.PI); c.clip();
  for (const r of [0.2, 0.5, 1, 2, 5]) { // circulos de resistencia constante
    const [x, y] = P(r / (1 + r), 0);
    c.beginPath(); c.arc(x, y, R / (1 + r), 0, 2 * Math.PI); c.stroke();
  }
  for (const x0 of [0.2, 0.5, 1, 2, 5]) { // arcos de reactancia constante
    for (const s of [1, -1]) {
      const [x, y] = P(1, s / x0);
      c.beginPath(); c.arc(x, y, R / x0, 0, 2 * Math.PI); c.stroke();
    }
  }
  c.restore();
  c.font = '10px system-ui, sans-serif';
  for (const r of [0.2, 0.5, 1, 2, 5]) { const [x, y] = P((r - 1) / (r + 1), 0); c.fillText(String(r), x + 2, y - 3); }
  c.fillText('Z₀ = 50 Ω', 6, 14);

  // traza
  c.strokeStyle = t.linea; c.lineWidth = 1.8; c.beginPath();
  for (let i = 0; i < medida.freq.length; i++) {
    const [x, y] = P(medida.re[i], medida.im[i]);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
  const n = medida.freq.length - 1;
  for (const [i, col] of [[0, '#2e7d32'], [n, '#c62828']]) {
    const [x, y] = P(medida.re[i], medida.im[i]);
    c.fillStyle = col; c.beginPath(); c.arc(x, y, 3.5, 0, 2 * Math.PI); c.fill();
  }
  c.fillStyle = '#2e7d32'; c.fillText(T('● inicio'), w - 90, 14);
  c.fillStyle = '#c62828'; c.fillText(T('● fin'), w - 90, 28);
  if (opts.marcadorIdx != null) {
    const [x, y] = P(medida.re[opts.marcadorIdx], medida.im[opts.marcadorIdx]);
    c.strokeStyle = t.texto; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 6, 0, 2 * Math.PI); c.stroke();
  }
}
