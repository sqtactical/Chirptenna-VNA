import { DriverNanoVNAH } from './drivers/nanovna-h.js';
import { DriverSimulado } from './drivers/simulado.js';
import {
  calcular, resonancias, resonanciasDudosas, nivelROE, reactanciaCero, marcasReactancia, DESV_REACTANCIA, bandasDeRegion, evaluarBandas, ventanasAfinado, fusionar,
  veredicto, recomendacion, indiceMasCercano, equivalenteReactivo,
} from './analisis.js';
import { dibujar, dibujarROE, dibujarSerie, dibujarSmith, xAFrecuencia } from './grafico.js';
import { generarPDF } from './informe.js';
import { corregir, faltante, juegoAJSON, juegoDeJSON, ErrorCalibracion } from './calibracion.js';
import { almacen, crearAsistente, barraCobertura } from './asistente.js';

const $ = id => document.getElementById(id);
const ETIQUETA = { ok: 'Cubre la banda', parcial: 'Cubre parte', no: 'No resuena aquí', sin_datos: 'Sin puntos (ver resolución)', fuera: 'Fuera del rango del equipo' };
const ICONO = { ok: '✔', parcial: '◐', no: '✘', sin_datos: '?', fuera: '–' };
const CANVAS_CLICK = ['grafico', 'g-z', 'g-fase', 'g-vswr', 'g-retardo'];
// Modo Simple: la adaptación se da en ROE (lo que conoce todo el mundo); Avanzado: pérdida de retorno y ROE.
const unidad = () => (modo === 'simple' ? 'roe' : 'rl');
// Criterio de "bien adaptada": Simple exige ROE 2 (pérdida de retorno de 9,54 dB: se refleja el 11 % de la potencia),
// que es el valor que todo el mundo conoce; Avanzado usa el mínimo en dB que fije el usuario (10 dB por defecto, ROE 1,92).
const UMBRAL_SIMPLE_DB = 20 * Math.log10(3);
const umbralActual = () => (modo === 'avanzado' ? +$('umbral').value : UMBRAL_SIMPLE_DB);

let bandasCfg = null, driver = null, ultimo = null, modo = 'simple', estudio = 'banda', listaObj = [];

const fmtF = hz => hz >= 1e9 ? `${(hz / 1e9).toFixed(3)} GHz` : hz >= 1e6 ? `${(hz / 1e6).toFixed(3)} MHz` : `${(hz / 1e3).toFixed(1)} kHz`;
const fMaxActual = () => driver?.fMaxHz ?? 2.7e9;

function estado(msg, error = false) {
  $('estado').textContent = msg;
  $('estado').classList.toggle('error', error);
}

function pitido(freq = 880, ms = 120) {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)();
    const o = a.createOscillator(); o.frequency.value = freq; o.connect(a.destination);
    o.start(); setTimeout(() => { o.stop(); a.close(); }, ms);
  } catch {}
}

function descargar(nombre, contenido, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Conexion ----------
async function conectar() {
  try {
    driver = $('simulado').checked ? new DriverSimulado() : new DriverNanoVNAH();
    if (!$('simulado').checked && !('serial' in navigator)) throw new Error('Este navegador no soporta Web Serial. Usa Chrome o Edge de escritorio.');
    estado('Conectando…');
    await driver.connect();
    driver.alPerder = m => perderConexion(m);
    $('medir').disabled = false;
    $('conectar').textContent = 'Desconectar';
    estado(`Conectado: ${driver.nombre}${driver.version ? ' · ' + driver.version : ''}${driver.aviso ? '. ' + driver.aviso : ''}`, !!driver.aviso);
    poblarObjetivo();
  } catch (e) {
    driver = null;
    estado(e.message, e.codigo !== 'cancelado'); // cancelar el selector no es un error
  }
}

// El cable se desenchufo o el equipo dejo de responder: la interfaz vuelve a "sin conectar" con un mensaje claro.
function perderConexion(mensaje) {
  const d = driver;
  driver = null;
  d?.disconnect?.();
  $('medir').disabled = true;
  $('conectar').textContent = 'Conectar';
  estado(mensaje, true);
}

async function desconectar() {
  await driver?.disconnect();
  driver = null;
  $('medir').disabled = true;
  $('conectar').textContent = 'Conectar';
  estado('Desconectado');
}

// ---------- Banda objetivo ----------
function poblarObjetivo() {
  const sel = $('objetivo');
  const previo = sel.selectedOptions[0]?.textContent;
  listaObj = bandasDeRegion(bandasCfg.bandas, $('region').value)
    .filter(b => b.f_min * 1e6 <= fMaxActual())
    .sort((a, b) => a.f_min - b.f_min);
  sel.innerHTML = '';
  listaObj.forEach((b, i) => sel.add(new Option(`${b.servicio.toUpperCase()} ${b.nombre} (${b.f_min}-${b.f_max} MHz)`, String(i))));
  sel.add(new Option('Otra frecuencia…', 'custom'));
  const igual = [...sel.options].find(o => o.textContent === previo);
  if (igual) sel.value = igual.value;
  else {
    const i = listaObj.findIndex(b => /868/.test(b.nombre));
    sel.value = String(i >= 0 ? i : 0);
  }
  $('campo-fobj').hidden = sel.value !== 'custom';
}

function objetivoActual() {
  const v = $('objetivo').value;
  if (v === '') return null;
  if (v === 'custom') {
    const f = +$('fobj').value * 1e6;
    if (!(f > 0)) return null;
    return { fMin: f, fMax: f, banda: { servicio: 'objetivo', nombre: `${(f / 1e6).toFixed(3)} MHz`, region: [], f_min: f / 1e6, f_max: f / 1e6 } };
  }
  const b = listaObj[+v];
  return b ? { fMin: b.f_min * 1e6, fMax: b.f_max * 1e6, banda: b } : null;
}

// ---------- Calibracion ----------
let asistente = null;
const calSeleccionada = () => almacen.lista.find(j => j.id === $('cal-fuente').value) ?? null;

function poblarCal(seleccionar) {
  const sel = $('cal-fuente'), previo = seleccionar ?? sel.value;
  sel.innerHTML = '';
  sel.add(new Option('La del equipo (la que tenga activa)', 'equipo'));
  for (const j of almacen.lista) sel.add(new Option(`App: ${j.nombre} (${j.segmentos.length} tramo${j.segmentos.length === 1 ? '' : 's'})`, j.id));
  sel.value = [...sel.options].some(o => o.value === previo) ? previo : 'equipo';
  resumenCal();
}

function resumenCal() {
  const j = calSeleccionada();
  $('cal-exportar').hidden = $('cal-borrar').hidden = !j;
  if (!j) {
    $('cal-cobertura').replaceChildren();
    $('cal-resumen').textContent = 'Se usará la calibración que tenga guardada o activa el propio NanoVNA.';
    return;
  }
  const lim = [driver?.fMinHz ?? 50e3, driver?.fMaxHz ?? 2.7e9];
  barraCobertura($('cal-cobertura'), j.segmentos, ...lim);
  const rango = rangoPlan();
  const huecos = faltante(j.segmentos, rango.fIni, rango.fFin);
  $('cal-resumen').textContent = `${j.segmentos.length} tramo(s) · ${new Date(j.fecha).toLocaleDateString('es-ES')}. ` +
    (huecos.length ? `Para la medida actual falta calibrar: ${huecos.map(h => `${fmtF(h[0])} a ${fmtF(h[1])}`).join('; ')}.` : 'Cubre la medida actual.');
}

// Rango que se va a medir (se usa para proponer el rango del asistente y comprobar la cobertura)
function rangoPlan() {
  const lim = [driver?.fMinHz ?? 50e3, driver?.fMaxHz ?? 2.7e9];
  if (estudio === 'banda') {
    const obj = objetivoActual();
    if (obj) {
      const m = Math.min(0.95, Math.max(0, +$('margen').value || 0) / 100);
      return { fIni: Math.max(lim[0], obj.fMin * (1 - m)), fFin: Math.min(lim[1], obj.fMax * (1 + m)), desc: 'la banda objetivo con su margen lateral' };
    }
  }
  if (modo === 'avanzado') return { fIni: Math.max(lim[0], +$('fini').value * 1e3), fFin: Math.min(lim[1], +$('ffin').value * 1e6), desc: 'el barrido general que has configurado' };
  return { fIni: lim[0], fFin: lim[1], desc: 'todo el rango del equipo' };
}

// Escaneo con la calibracion elegida: la del equipo, o datos sin corregir + calibracion de la app
async function escanear(a, b, n, prog, esp) {
  const j = calSeleccionada();
  if (!j) return driver.scan(a, b, n, prog, esp);
  driver.setEstandar?.('antena');
  return corregir(j, await driver.scan(a, b, n, prog, esp, { bruto: true }));
}

// ---------- Analisis segun el modo ----------
function evaluarTodo(medida, umbral) {
  const obj = estudio === 'banda' ? objetivoActual() : null;
  const bandas = estudio === 'banda' ? (obj ? [obj.banda] : []) : bandasDeRegion(bandasCfg.bandas, $('region').value);
  const evaluacion = evaluarBandas(medida, bandas, umbral, fMaxActual());
  const picos = resonancias(medida, umbral);
  const dudosos = resonanciasDudosas(medida, picos);
  const reco = obj ? recomendacion(medida, picos, obj, umbral, unidad()) : null;
  return { evaluacion, picos, dudosos, reco, obj };
}

async function medir() {
  const obj = estudio === 'banda' ? objetivoActual() : null;
  let umbral = umbralActual(), fIni, fFin, puntos, esp, afinar;
  if (estudio === 'banda') {
    // Una banda con margen lateral: borde inferior -X % y borde superior +X %, por si la antena no resuena justo en ella
    if (!obj) return estado('Elige una banda objetivo', true);
    const margen = Math.min(0.95, Math.max(0, +$('margen').value || 0) / 100);
    fIni = Math.max(driver.fMinHz, obj.fMin * (1 - margen));
    fFin = Math.min(driver.fMaxHz, obj.fMax * (1 + margen));
    if (fFin <= fIni * 1.05) return estado('La banda objetivo queda fuera del rango del equipo', true);
    puntos = 601; esp = 'log'; afinar = modo === 'simple' ? true : $('afinar').checked;
  } else if (modo === 'simple') {
    fIni = driver.fMinHz; fFin = driver.fMaxHz; puntos = 3000; esp = 'log'; afinar = true;
  } else {
    puntos = Math.round(+$('puntos').value);
    fIni = Math.max(driver.fMinHz, +$('fini').value * 1e3);
    fFin = Math.min(driver.fMaxHz, +$('ffin').value * 1e6);
    esp = $('espaciado').value;
    afinar = $('afinar').checked;
    if (!(puntos >= 2 && fFin > fIni)) return estado('Parámetros de barrido no válidos', true);
  }

  const juegoCal = calSeleccionada();
  if (juegoCal) {
    const huecos = faltante(juegoCal.segmentos, fIni, fFin);
    if (huecos.length) {
      resumenCal();
      return estado(`La calibración «${juegoCal.nombre}» no cubre ${huecos.map(h => `${fmtF(h[0])} a ${fmtF(h[1])}`).join('; ')}. Calibra ese tramo con el asistente.`, true);
    }
  }

  $('medir').disabled = true;
  try {
    for (let s = +$('retardo').value; s > 0; s--) {
      estado(`Aléjate de la antena… medición en ${s} s`);
      if (s <= 3) pitido(s === 1 ? 1320 : 880);
      await new Promise(r => setTimeout(r, 1000));
    }
    estado('Midiendo… no muevas el cable');
    const t0 = performance.now();
    let crudo = await escanear(fIni, fFin, puntos, p => estado(`Midiendo… ${(p * 100).toFixed(0)} %`), esp);
    let medida = calcular(crudo), res = evaluarTodo(medida, umbral), afinado = false;
    if (afinar) {
      const ventanas = ventanasAfinado(res.picos, res.evaluacion, fIni, fFin);
      for (let k = 0; k < ventanas.length; k++) {
        const w = ventanas[k];
        estado(`Afinando ${k + 1}/${ventanas.length}: ${w.motivo} (${fmtF(w.lo)} a ${fmtF(w.hi)})…`);
        crudo = fusionar(crudo, await escanear(w.lo, w.hi, w.puntos, () => {}, 'lineal'));
        afinado = true;
      }
      if (afinado) { medida = calcular(crudo); res = evaluarTodo(medida, umbral); }
    }
    const centro = obj ? (obj.fMin + obj.fMax) / 2 : medida.freq[0];
    ultimo = {
      crudo, medida, ...res, umbral, fecha: new Date(), afinado, calNombre: juegoCal ? `app «${juegoCal.nombre}»` : null,
      idx: res.picos[0]?.i ?? indiceMasCercano(medida.freq, centro),
    };
    pitido(1320, 250);
    estado(`Listo: ${crudo.freq.length} puntos en ${((performance.now() - t0) / 1000).toFixed(1)} s${afinado ? ' (con afinado)' : ''}`);
    mostrar();
  } catch (e) {
    if (e.codigo === 'desconectado') perderConexion(e.message);
    else estado(e instanceof ErrorCalibracion && e.faltan.length
      ? `${e.message}. Falta calibrar: ${e.faltan.map(h => `${fmtF(h[0])} a ${fmtF(h[1])}`).join('; ')}.`
      : e.message, true);
  } finally {
    $('medir').disabled = !driver;
  }
}

// ---------- Presentacion ----------
function mostrar() {
  if (!ultimo) return;
  $('resultados').hidden = false;

  // Recomendacion (alargar / cortar)
  const tr = $('tarjeta-reco');
  tr.hidden = !ultimo.reco;
  if (ultimo.reco) {
    tr.className = `tarjeta reco ${ultimo.reco.accion}`;
    const r = $('reco');
    r.replaceChildren();
    r.appendChild(Object.assign(document.createElement('p'), { className: 'gran', textContent: ultimo.reco.titulo }));
    const ul = document.createElement('ul');
    for (const l of ultimo.reco.lineas) ul.appendChild(Object.assign(document.createElement('li'), { textContent: l }));
    r.appendChild(ul);
  }

  // Resumen (avanzado)
  const v = veredicto(ultimo.picos, ultimo.evaluacion, ultimo.umbral, unidad(), { medida: ultimo.medida, obj: ultimo.obj });
  $('titulo-grafico').textContent = unidad() === 'roe' ? 'ROE (relación de onda estacionaria)' : 'Pérdida de retorno';
  const ve = $('veredicto');
  ve.replaceChildren(Object.assign(document.createElement('b'), { textContent: v.titulo }));
  const ulv = document.createElement('ul');
  for (const l of v.lineas) ulv.appendChild(Object.assign(document.createElement('li'), { textContent: l }));
  ve.appendChild(ulv);

  tablas();
  const s = $('cursor');
  s.max = ultimo.medida.freq.length - 1;
  s.value = ultimo.idx;
  redibujar();
}

function tablas() {
  const tp = $('picos');
  tp.innerHTML = '<tr><th>Mínimo de ROE</th><th>Pérdida de retorno</th><th>VSWR</th><th title="Frecuencia donde la reactancia X cruza por cero: la resonancia eléctrica. No siempre coincide con el mínimo de ROE.">Reactancia cero (X = 0)</th><th>Ancho de banda</th></tr>';
  if (!ultimo.picos.length) tp.innerHTML += '<tr><td colspan="5">No se detectan resonancias claras en el rango medido.</td></tr>';
  // X = 0 cerca de cada mínimo; ⚠ si se aleja más de un 2,5 % (el porcentaje de longitud puede no ser fiable)
  const celdaX = p => {
    const rx = reactanciaCero(ultimo.medida, p.f);
    if (!rx) return '—';
    const d = `${rx.desv > 0 ? '+' : ''}${(rx.desv * 100).toFixed(1)} %`;
    if (rx.tipo === 'paralelo') return `${fmtF(rx.fX)} (${d}, en paralelo)`;
    return Math.abs(rx.desv) > DESV_REACTANCIA ? `⚠ ${fmtF(rx.fX)} (${d}): no coincide` : `${fmtF(rx.fX)} (${d})`;
  };
  for (const p of ultimo.picos.slice(0, 8)) {
    const bw = p.fLo != null ? `${fmtF(p.fHi - p.fLo)} (${fmtF(p.fLo)} – ${fmtF(p.fHi)})` : `no alcanza ${ultimo.umbral} dB`;
    tp.innerHTML += `<tr><td>${fmtF(p.f)}</td><td>${p.rl.toFixed(1)} dB</td><td>${p.vswr.toFixed(2)}</td><td>${celdaX(p)}</td><td>${bw}</td></tr>`;
  }
  for (const p of ultimo.dudosos ?? []) {
    tp.innerHTML += `<tr class="dudosa"><td>${fmtF(p.f)} <span class="etiqueta-dudosa">posiblemente falsa</span></td><td>${p.rl.toFixed(1)} dB</td><td>${p.vswr.toFixed(2)}</td><td>—</td><td>${p.motivo}</td></tr>`;
  }
  const tb = $('bandas');
  tb.innerHTML = '<tr><th></th><th>Banda</th><th>Rango</th><th>Resultado</th><th>Mejor punto</th></tr>';
  const orden = { ok: 0, parcial: 1, no: 2, sin_datos: 3, fuera: 4 };
  const filas = [...ultimo.evaluacion].sort((a, b) => orden[a.estado] - orden[b.estado] || a.banda.f_min - b.banda.f_min);
  for (const e of filas) {
    const b = e.banda;
    const mejor = e.fMejor ? `${unidad() === 'roe' ? `ROE ${e.vMejor.toFixed(2)} a ${e.peorVswr.toFixed(2)} (peor punto: ${nivelROE(e.peorVswr).etiqueta.toLowerCase()})` : `${e.mejorRl.toFixed(1)} dB · VSWR ${e.vMejor.toFixed(2)}`} @ ${fmtF(e.fMejor)}` : '';
    tb.innerHTML += `<tr class="${e.estado}"><td>${ICONO[e.estado]}</td><td>${b.servicio.toUpperCase()} ${b.nombre} <small>[${b.region.join('/')}]</small></td><td>${b.f_min} – ${b.f_max} MHz</td><td>${ETIQUETA[e.estado]}</td><td>${mejor}</td></tr>`;
  }
}

// Resonancia eléctrica (X = 0) en el gráfico de ROE del modo Simple, si el usuario lo ha activado.
function marcasXActivas() {
  if (unidad() !== 'roe' || !$('ver-x').checked || !ultimo) return [];
  return marcasReactancia(ultimo.medida, ultimo.picos).map(r => ({ f: r.fX, etiqueta: `X = 0 · ${fmtF(r.fX)}` }));
}

function redibujar() {
  if (!ultimo) return;
  const { medida, idx } = ultimo, fm = medida.freq[idx];
  (unidad() === 'roe' ? dibujarROE : dibujar)($('grafico'), medida, ultimo.evaluacion, ultimo.umbral, { marcadorF: fm, marcasX: marcasXActivas() });
  if (modo !== 'avanzado') return;
  dibujarSmith($('smith'), medida, { marcadorIdx: idx });
  dibujarSerie($('g-z'), medida.freq, [{ y: medida.zr, nombre: 'R' }, { y: medida.zx, nombre: 'X', color: '#ef6c00' }], { unidad: 'Ω', marcadorF: fm });
  dibujarSerie($('g-fase'), medida.freq, [{ y: medida.fase }], { yMin: -180, yMax: 180, unidad: '°', marcadorF: fm });
  dibujarSerie($('g-vswr'), medida.freq, [{ y: medida.vswr }], { yMin: 1, yMax: 10, marcadorF: fm, umbral: 2 });
  dibujarSerie($('g-retardo'), medida.freq, [{ y: medida.retardo }], { unidad: 'ns', marcadorF: fm });
  tablaCursor();
}

function tablaCursor() {
  const m = ultimo.medida, i = ultimo.idx, f = m.freq[i];
  const eq = equivalenteReactivo(f, m.zx[i]);
  const eqTxt = !eq ? '—' : eq.tipo === 'L'
    ? `bobina ${(eq.valor * 1e9).toFixed(2)} nH`
    : `condensador ${(eq.valor * 1e12).toFixed(2)} pF`;
  const filas = [
    ['Frecuencia', fmtF(f)],
    ['|S11|', `${m.mag[i].toFixed(2)} dB`],
    ['Pérdida de retorno', `${m.rl[i].toFixed(2)} dB`],
    ['VSWR', m.vswr[i].toFixed(2)],
    ['Fase de S11', `${m.fase[i].toFixed(1)}°`],
    ['Impedancia Z', `${m.zr[i].toFixed(1)} ${m.zx[i] >= 0 ? '+' : '−'} j${Math.abs(m.zx[i]).toFixed(1)} Ω`],
    ['|Z|', `${Math.hypot(m.zr[i], m.zx[i]).toFixed(1)} Ω`],
    ['Equivalente serie', eqTxt],
    ['Retardo de grupo', `${m.retardo[i].toFixed(2)} ns`],
  ];
  $('tabla-cursor').innerHTML = filas.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
}

// ---------- Modos, tema y eventos ----------
function aplicarModo(m) {
  modo = m;
  document.body.dataset.modo = m;
  $('modo-simple').classList.toggle('activo', m === 'simple');
  $('modo-avanzado').classList.toggle('activo', m === 'avanzado');
  try { localStorage.setItem('modo', m); } catch {}
  if (bandasCfg) poblarObjetivo();
  if (ultimo) {
    ultimo.umbral = umbralActual(); // cada modo tiene su criterio
    Object.assign(ultimo, evaluarTodo(ultimo.medida, ultimo.umbral));
    mostrar();
  }
}

function aplicarEstudio(e) {
  estudio = e;
  document.body.dataset.estudio = e;
  $('estudio').value = e;
  try { localStorage.setItem('estudio', e); } catch {}
  if (ultimo) { Object.assign(ultimo, evaluarTodo(ultimo.medida, ultimo.umbral)); mostrar(); }
}

function iniciarTema() {
  try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.theme = t; } catch {}
  $('btn-tema').onclick = () => {
    const raiz = document.documentElement;
    const oscuro = raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    raiz.dataset.theme = oscuro ? 'light' : 'dark';
    try { localStorage.setItem('tema', raiz.dataset.theme); } catch {}
    redibujar();
  };
}

function reanalizar() {
  if (!ultimo) return;
  Object.assign(ultimo, evaluarTodo(ultimo.medida, ultimo.umbral));
  mostrar();
}

function enlazarCursor() {
  const mover = idx => { ultimo.idx = idx; $('cursor').value = idx; redibujar(); };
  $('cursor').oninput = e => ultimo && mover(+e.target.value);
  for (const id of CANVAS_CLICK) {
    $(id).addEventListener('click', e => {
      if (!ultimo) return;
      mover(indiceMasCercano(ultimo.medida.freq, xAFrecuencia($(id), ultimo.medida.freq, e.offsetX)));
    });
  }
}

async function iniciar() {
  iniciarTema();
  if (!('serial' in navigator)) $('aviso-nav').hidden = false;
  try {
    bandasCfg = await (await fetch('./bandas.json')).json();
  } catch (e) {
    return estado('No se pudo cargar bandas.json (¿abierto sin servidor web?)', true);
  }
  try { $('ver-x').checked = localStorage.getItem('ver-x') === '1'; } catch {}
  $('ayuda-x').hidden = !$('ver-x').checked;
  $('ver-x').onchange = () => {
    try { localStorage.setItem('ver-x', $('ver-x').checked ? '1' : '0'); } catch {}
    $('ayuda-x').hidden = !$('ver-x').checked;
    redibujar();
  };
  let guardado = 'simple';
  try { guardado = localStorage.getItem('modo') || 'simple'; } catch {}
  aplicarModo(guardado === 'avanzado' ? 'avanzado' : 'simple');

  let e0 = 'banda';
  try { e0 = localStorage.getItem('estudio') || 'banda'; } catch {}
  aplicarEstudio(e0 === 'general' ? 'general' : 'banda');
  $('estudio').onchange = () => aplicarEstudio($('estudio').value);
  $('margen').onchange = () => {};
  $('modo-simple').onclick = () => aplicarModo('simple');
  $('modo-avanzado').onclick = () => aplicarModo('avanzado');
  $('conectar').onclick = () => (driver ? desconectar() : conectar());
  $('medir').onclick = medir;
  $('region').onchange = () => { poblarObjetivo(); reanalizar(); };
  $('objetivo').onchange = () => { $('campo-fobj').hidden = $('objetivo').value !== 'custom'; reanalizar(); };
  $('fobj').onchange = reanalizar;
  $('umbral').onchange = () => { if (ultimo) ultimo.umbral = +$('umbral').value; reanalizar(); };
  $('csv').onclick = () => {
    if (!ultimo) return;
    const m = ultimo.medida;
    let s = 'frecuencia_Hz,pérdida_retorno_dB,vswr,fase_deg,R_ohm,X_ohm,retardo_ns\n';
    for (let i = 0; i < m.freq.length; i++) s += `${m.freq[i]},${m.rl[i].toFixed(3)},${m.vswr[i].toFixed(3)},${m.fase[i].toFixed(2)},${m.zr[i].toFixed(3)},${m.zx[i].toFixed(3)},${m.retardo[i].toFixed(3)}\n`;
    descargar('medida_s11.csv', s, 'text/csv');
  };
  $('s1p').onclick = () => {
    if (!ultimo) return;
    const c = ultimo.crudo;
    let s = `! Chirptenna VNA ${ultimo.fecha.toISOString()}\n# HZ S RI R 50\n`;
    for (let i = 0; i < c.freq.length; i++) s += `${Math.round(c.freq[i])} ${c.re[i].toExponential(8)} ${c.im[i].toExponential(8)}\n`;
    descargar('medida.s1p', s, 'text/plain');
  };
  $('pdf').onclick = async () => {
    if (!ultimo) return;
    $('pdf').disabled = true;
    try {
      const nombre = await generarPDF(ultimo, {
        equipo: driver ? `${driver.nombre}${driver.version ? ' (' + driver.version + ')' : ''}` : 'desconocido',
        espaciado: modo === 'simple' || $('espaciado').value === 'log' ? 'logaritmico' : 'lineal',
        region: $('region').selectedOptions[0].textContent,
        unidad: unidad(),
        marcasX: marcasXActivas(),
      });
      estado(`Informe guardado: ${nombre}`);
    } catch (e) { estado(e.message, true); }
    $('pdf').disabled = false;
  };
  // Calibracion
  asistente = crearAsistente({
    contenedor: $('asistente'),
    getDriver: () => {
      if (driver?.perdido) perderConexion('Se perdió la conexión con el equipo. Vuelve a conectar.');
      return driver;
    },
    getRangoPlan: rangoPlan,
    estado,
    onCambio: id => poblarCal(id),
  });
  poblarCal();
  $('cal-fuente').onchange = resumenCal;
  $('cal-abrir').onclick = () => asistente.abrir(calSeleccionada()?.id ?? null);
  $('cal-exportar').onclick = () => {
    const j = calSeleccionada();
    if (j) descargar(`calibracion_${j.nombre.replace(/\W+/g, '_')}.json`, JSON.stringify(juegoAJSON(j)), 'application/json');
  };
  $('cal-borrar').onclick = () => {
    const j = calSeleccionada();
    if (!j || !confirm(`¿Borrar la calibración «${j.nombre}»? No se puede deshacer.`)) return;
    almacen.lista = almacen.lista.filter(x => x.id !== j.id);
    almacen.guardar();
    poblarCal('equipo');
  };
  $('cal-importar-btn').onclick = () => $('cal-importar').click();
  $('cal-importar').onchange = async e => {
    try {
      const j = juegoDeJSON(JSON.parse(await e.target.files[0].text()));
      if (!j.segmentos?.length) throw new Error('El archivo no contiene tramos de calibración');
      j.id = 'cal' + Date.now();
      almacen.lista.push(j);
      almacen.guardar();
      poblarCal(j.id);
      estado(`Calibración «${j.nombre}» importada`);
    } catch (err) { estado('No se pudo importar: ' + err.message, true); }
    e.target.value = '';
  };
  ['region', 'objetivo', 'margen', 'estudio', 'fini', 'ffin'].forEach(id => $(id).addEventListener('change', resumenCal));

  enlazarCursor();
  window.addEventListener('resize', redibujar);
}

iniciar();
