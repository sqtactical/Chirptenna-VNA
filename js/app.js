import { T, idiomaActual } from './i18n.js';
import { DriverNanoVNAH } from './drivers/nanovna-h.js';
import { DriverSimulado, ANTENAS_SIMULADAS } from './drivers/simulado.js';
import {
  calcular, resonancias, resonanciasDudosas, nivelROE, reactanciaCero, marcasReactancia, segmentosDeBanda, coberturaSegmentos, remuestrear, estadisticaBanda, DESV_REACTANCIA, bandasDeRegion, evaluarBandas, ventanasAfinado, fusionar,
  veredicto, recomendacion, indiceMasCercano, equivalenteReactivo, fmtROE, ROE_MAX_MOSTRADO, calculoMm,
} from './analisis.js';
import { dibujar, dibujarROE, dibujarSerie, dibujarSmith, xAFrecuencia } from './grafico.js';
import { generarPDF } from './informe.js';
import { corregir, faltante, juegoAJSON, juegoDeJSON, ErrorCalibracion } from './calibracion.js';
import { almacen, crearAsistente, barraCobertura } from './asistente.js';
import { crearGrillo, elegirMensaje } from './grillo.js';
import { REGIONES, PRESETS, calcularCanal } from './meshtastic.js';

const $ = id => document.getElementById(id);
const ETIQUETA = { ok: T('Cubre la banda'), parcial: T('Cubre parte'), no: T('No resuena aquí'), sin_datos: T('Sin puntos (ver resolución)'), fuera: T('Fuera del rango del equipo') };
const ICONO = { ok: '✔', parcial: '◐', no: '✘', sin_datos: '?', fuera: '–' };
const CANVAS_CLICK = ['grafico', 'g-z', 'g-fase', 'g-vswr', 'g-retardo'];
// Modo Simple: la adaptación se da en ROE (lo que conoce todo el mundo); Avanzado: pérdida de retorno y ROE.
const unidad = () => (modo === 'simple' ? 'roe' : 'rl');
// Criterio de "bien adaptada": Simple exige ROE 2 (pérdida de retorno de 9,54 dB: se refleja el 11 % de la potencia),
// que es el valor que todo el mundo conoce; Avanzado usa el mínimo en dB que fije el usuario (10 dB por defecto, ROE 1,92).
const UMBRAL_SIMPLE_DB = 20 * Math.log10(3);
const umbralActual = () => (modo === 'avanzado' ? +$('umbral').value : UMBRAL_SIMPLE_DB);

let bandasCfg = null, driver = null, ultimo = null, modo = 'simple', estudio = 'banda', listaObj = [];
// Cricky, el grillo asistente: comenta los eventos importantes (solo en el modo Simple)
let grillo = null;
const cricky = (evento, datos) => { if (modo === 'simple') grillo?.decir(elegirMensaje(evento, datos)); };

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
    if (driver instanceof DriverSimulado) driver.antena = $('antena-sim').value || 'predeterminada';
    if (!$('simulado').checked && !('serial' in navigator)) throw new Error(T('Este navegador no soporta Web Serial. Usa Chrome o Edge de escritorio.'));
    estado(T('Conectando…'));
    await driver.connect();
    driver.alPerder = m => perderConexion(m);
    $('medir').disabled = false;
    $('conectar').textContent = T('Desconectar');
    estado(`Conectado: ${driver.nombre}${driver.version ? ' · ' + driver.version : ''}${driver.aviso ? '. ' + driver.aviso : ''}`, !!driver.aviso);
    poblarObjetivo();
    cricky('conectado', { calibracionApp: !!calSeleccionada() });
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
  $('conectar').textContent = T('Conectar');
  estado(mensaje, true);
  cricky('perdida');
}

async function desconectar() {
  await driver?.disconnect();
  driver = null;
  $('medir').disabled = true;
  $('conectar').textContent = T('Conectar');
  estado(T('Desconectado'));
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
  sel.add(new Option(T('Mi nodo Meshtastic…'), 'meshtastic'));
  sel.add(new Option(T('Otra frecuencia…'), 'custom'));
  const igual = [...sel.options].find(o => o.textContent === previo);
  if (igual) sel.value = igual.value;
  else {
    const i = listaObj.findIndex(b => /868/.test(b.nombre));
    sel.value = String(i >= 0 ? i : 0);
  }
  $('campo-fobj').hidden = sel.value !== 'custom';
  $('campo-mesh').hidden = sel.value !== 'meshtastic';
  actualizarMesh();
  poblarSegmentos();
}

// ---------- Mi nodo Meshtastic: el canal se calcula como el firmware ----------
function canalMesh() {
  return calcularCanal({ region: $('mesh-region').value, preset: $('mesh-preset').value, nombre: $('mesh-nombre').value, slot: $('mesh-slot').value });
}

function actualizarMesh() {
  const c = canalMesh();
  $('mesh-info').textContent = c
    ? T('Frecuencia de tu canal: {0} MHz (canal {1} de {2}, ancho {3} kHz). Se juzga la antena en ese canal.', c.fMHz, c.slot, c.numCanales, c.anchoKHz)
    : '';
  try { localStorage.setItem('mesh', JSON.stringify({ r: $('mesh-region').value, p: $('mesh-preset').value, n: $('mesh-nombre').value, s: $('mesh-slot').value })); } catch {}
}

function iniciarMesh() {
  for (const [id, r] of Object.entries(REGIONES)) $('mesh-region').add(new Option(T(r.nombre), id));
  for (const id of Object.keys(PRESETS)) $('mesh-preset').add(new Option(id, id));
  try { const g = JSON.parse(localStorage.getItem('mesh') || 'null'); if (g) { $('mesh-region').value = g.r; $('mesh-preset').value = g.p; $('mesh-nombre').value = g.n ?? ''; $('mesh-slot').value = g.s ?? ''; } } catch {}
  if (!$('mesh-region').value) $('mesh-region').value = $('region').value === 'us' ? 'US' : 'EU_868';
  for (const id of ['mesh-region', 'mesh-preset', 'mesh-nombre', 'mesh-slot']) $(id).onchange = () => { actualizarMesh(); resumenCal(); reanalizar(); };
}

function objetivoActual() {
  const v = $('objetivo').value;
  if (v === '') return null;
  if (v === 'custom') {
    const f = +$('fobj').value * 1e6;
    if (!(f > 0)) return null;
    return { fMin: f, fMax: f, banda: { servicio: 'objetivo', nombre: `${(f / 1e6).toFixed(3)} MHz`, region: [], f_min: f / 1e6, f_max: f / 1e6 } };
  }
  if (v === 'meshtastic') {
    const c = canalMesh();
    if (!c) return null;
    const f0 = c.fMHz - c.anchoKHz / 2000, f1 = c.fMHz + c.anchoKHz / 2000;
    return { fMin: f0 * 1e6, fMax: f1 * 1e6, banda: { servicio: 'meshtastic', nombre: `${$('mesh-region').value} ${$('mesh-preset').value} ${c.fMHz} MHz`, region: [], f_min: f0, f_max: f1 } };
  }
  const b = listaObj[+v];
  if (!b) return null;
  // Segmento de una banda de HF (CW, fonía, FT8...): se juzga ese tramo, pero se mide la banda entera (+ margen) para ver los demás
  const seg = segmentoElegido(b);
  if (seg) {
    return {
      fMin: seg.f_min * 1e6, fMax: seg.f_max * 1e6, segmento: seg, bandaCompleta: b,
      rango: { min: b.f_min * 1e6, max: b.f_max * 1e6 },
      banda: { servicio: b.servicio, nombre: `${b.nombre} · ${T(seg.nombre)}`, region: b.region, f_min: seg.f_min, f_max: seg.f_max },
    };
  }
  return { fMin: b.f_min * 1e6, fMax: b.f_max * 1e6, banda: b, bandaCompleta: b };
}

// Segmentos por modo de la banda elegida (solo HF): lista para el selector «¿Para qué parte de la banda?»
let segCfg = null, segActuales = [];
function segmentoElegido(banda) {
  const v = $('segmento')?.value;
  if (!v || !segActuales.length) return null;
  return segActuales.find(s => s.id === v) ?? null;
}

function poblarSegmentos() {
  const sel = $('segmento'), v = $('objetivo').value;
  const b = v === 'custom' || v === 'meshtastic' || v === '' ? null : listaObj[+v];
  segActuales = b && segCfg ? segmentosDeBanda(segCfg, b, $('region').value) : [];
  const previo = sel.value;
  sel.innerHTML = '';
  $('campo-segmento').hidden = !segActuales.length;
  if (!segActuales.length) return;
  sel.add(new Option(T('Toda la banda ({0}–{1} MHz)', b.f_min, b.f_max), ''));
  for (const s of segActuales) {
    const rango = s.puntual ? `${+s.f_min.toFixed(4)} MHz` : `${s.f_min}–${s.f_max} MHz`;
    const corta = s.nota && !s.puntual && s.nota.length <= 70; // las notas largas van en el tooltip
    const op = new Option(`${T(s.nombre)} (${rango})${corta ? ' · ' + T(s.nota) : ''}`, s.id);
    if (s.nota) op.title = T(s.nota);
    sel.add(op);
  }
  sel.value = [...sel.options].some(o => o.value === previo) ? previo : '';
}

// ---------- Calibracion ----------
let asistente = null;
const calSeleccionada = () => almacen.lista.find(j => j.id === $('cal-fuente').value) ?? null;

function poblarCal(seleccionar) {
  const sel = $('cal-fuente'), previo = seleccionar ?? sel.value;
  sel.innerHTML = '';
  sel.add(new Option(T('La del equipo (la que tenga activa)'), 'equipo'));
  for (const j of almacen.lista) sel.add(new Option(j.segmentos.length === 1 ? T('App: {0} (1 tramo)', j.nombre) : T('App: {0} ({1} tramos)', j.nombre, j.segmentos.length), j.id));
  sel.value = [...sel.options].some(o => o.value === previo) ? previo : 'equipo';
  resumenCal();
}

function resumenCal() {
  const j = calSeleccionada();
  $('cal-exportar').hidden = $('cal-borrar').hidden = !j;
  if (!j) {
    $('cal-cobertura').replaceChildren();
    $('cal-resumen').textContent = T('Se usará la calibración que tenga guardada o activa el propio NanoVNA.');
    return;
  }
  const lim = [driver?.fMinHz ?? 50e3, driver?.fMaxHz ?? 2.7e9];
  barraCobertura($('cal-cobertura'), j.segmentos, ...lim);
  const rango = rangoPlan();
  const huecos = faltante(j.segmentos, rango.fIni, rango.fFin);
  $('cal-resumen').textContent = T('{0} tramo(s) · {1}. ', j.segmentos.length, new Date(j.fecha).toLocaleDateString(idiomaActual())) +
    (huecos.length ? T('Para la medida actual falta calibrar: {0}.', huecos.map(h => `${fmtF(h[0])} a ${fmtF(h[1])}`).join('; ')) : T('Cubre la medida actual.'));
}

// Rango que se va a medir (se usa para proponer el rango del asistente y comprobar la cobertura)
function rangoPlan() {
  const lim = [driver?.fMinHz ?? 50e3, driver?.fMaxHz ?? 2.7e9];
  if (estudio === 'banda') {
    const obj = objetivoActual();
    if (obj) {
      const m = Math.min(0.95, Math.max(0, +$('margen').value || 0) / 100);
      const base = obj.rango ?? { min: obj.fMin, max: obj.fMax };
      return { fIni: Math.max(lim[0], base.min * (1 - m)), fFin: Math.min(lim[1], base.max * (1 + m)), desc: T('la banda objetivo con su margen lateral') };
    }
  }
  if (modo === 'avanzado') return { fIni: Math.max(lim[0], +$('fini').value * 1e3), fFin: Math.min(lim[1], +$('ffin').value * 1e6), desc: T('el barrido general que has configurado') };
  return { fIni: lim[0], fFin: lim[1], desc: T('todo el rango del equipo') };
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
  const reco = obj ? recomendacion(medida, picos, obj, umbral, unidad(), { multibanda: $('multibanda').checked }) : null;
  // cobertura por modo (CW, fonía, FT8...) de la banda objetivo, si es de HF
  const segmentos = obj?.bandaCompleta ? segmentosDeBanda(segCfg, obj.bandaCompleta, $('region').value) : [];
  const cobertura = segmentos.length ? coberturaSegmentos(medida, segmentos, umbral) : [];
  return { evaluacion, picos, dudosos, reco, obj, cobertura };
}

async function medir() {
  const obj = estudio === 'banda' ? objetivoActual() : null;
  let umbral = umbralActual(), fIni, fFin, puntos, esp, afinar;
  if (estudio === 'banda') {
    // Una banda con margen lateral: borde inferior -X % y borde superior +X %, por si la antena no resuena justo en ella
    if (!obj) return estado(T('Elige una banda objetivo'), true);
    const margen = Math.min(0.95, Math.max(0, +$('margen').value || 0) / 100);
    const base = obj.rango ?? { min: obj.fMin, max: obj.fMax }; // con un segmento se mide la banda entera
    fIni = Math.max(driver.fMinHz, base.min * (1 - margen));
    fFin = Math.min(driver.fMaxHz, base.max * (1 + margen));
    if (fFin <= fIni * 1.05) return estado(T('La banda objetivo queda fuera del rango del equipo'), true);
    puntos = 601; esp = 'log'; afinar = modo === 'simple' ? true : $('afinar').checked;
  } else if (modo === 'simple') {
    fIni = driver.fMinHz; fFin = driver.fMaxHz; puntos = 3000; esp = 'log'; afinar = true;
  } else {
    puntos = Math.round(+$('puntos').value);
    fIni = Math.max(driver.fMinHz, +$('fini').value * 1e3);
    fFin = Math.min(driver.fMaxHz, +$('ffin').value * 1e6);
    esp = $('espaciado').value;
    afinar = $('afinar').checked;
    if (!(puntos >= 2 && fFin > fIni)) return estado(T('Parámetros de barrido no válidos'), true);
  }

  const juegoCal = calSeleccionada();
  if (juegoCal) {
    const huecos = faltante(juegoCal.segmentos, fIni, fFin);
    if (huecos.length) {
      resumenCal();
      cricky('falta-cal');
      return estado(T('La calibración «{0}» no cubre {1}. Calibra ese tramo con el asistente.', juegoCal.nombre, huecos.map(h => `${fmtF(h[0])} a ${fmtF(h[1])}`).join('; ')), true);
    }
  }

  $('medir').disabled = true;
  try {
    if (+$('retardo').value > 0) cricky('cuenta-atras');
    for (let s = +$('retardo').value; s > 0; s--) {
      estado(T('Aléjate de la antena… medición en {0} s', s));
      if (s <= 3) pitido(s === 1 ? 1320 : 880);
      await new Promise(r => setTimeout(r, 1000));
    }
    estado(T('Midiendo… no muevas el cable'));
    cricky('midiendo');
    const t0 = performance.now();
    let crudo = await escanear(fIni, fFin, puntos, p => estado(T('Midiendo… {0} %', (p * 100).toFixed(0))), esp);
    let medida = calcular(crudo), res = evaluarTodo(medida, umbral), afinado = false;
    if (afinar) {
      const ventanas = ventanasAfinado(res.picos, res.evaluacion, fIni, fFin);
      for (let k = 0; k < ventanas.length; k++) {
        const w = ventanas[k];
        estado(T('Afinando {0}/{1}: {2} ({3} a {4})…', k + 1, ventanas.length, w.motivo, fmtF(w.lo), fmtF(w.hi)));
        crudo = fusionar(crudo, await escanear(w.lo, w.hi, w.puntos, () => {}, 'lineal'));
        afinado = true;
      }
      if (afinado) { medida = calcular(crudo); res = evaluarTodo(medida, umbral); }
    }
    const centro = obj ? (obj.fMin + obj.fMax) / 2 : medida.freq[0];
    // Medida anterior del mismo objetivo y del mismo rango: se superpone en el gráfico y se compara en el texto (asistente de ajuste)
    const clave = obj ? `${(obj.bandaCompleta ?? obj.banda).nombre}|${fIni.toFixed(0)}|${fFin.toFixed(0)}|${driver.id}` : null;
    const previo = ultimo && clave && ultimo.clave === clave
      ? { freq: ultimo.medida.freq, vswr: ultimo.medida.vswr, fecha: ultimo.fecha, est: estadisticaBanda(ultimo.medida, obj.fMin, obj.fMax, umbral) }
      : null;
    ultimo = {
      crudo, medida, ...res, umbral, fecha: new Date(), afinado, calNombre: juegoCal ? `app «${juegoCal.nombre}»` : null,
      idx: res.picos[0]?.i ?? indiceMasCercano(medida.freq, centro), clave, previo,
    };
    pitido(1320, 250);
    estado(T('Listo: {0} puntos en {1} s{2}', crudo.freq.length, ((performance.now() - t0) / 1000).toFixed(1), afinado ? T(' (con afinado)') : ''));
    mostrar();
    if (ultimo.reco) cricky('resultado', { reco: ultimo.reco, cobertura: ultimo.cobertura, segmento: ultimo.obj?.segmento });
  } catch (e) {
    if (e instanceof ErrorCalibracion && e.faltan.length) cricky('falta-cal');
    if (e.codigo === 'desconectado') perderConexion(e.message);
    else estado(e instanceof ErrorCalibracion && e.faltan.length
      ? T('{0}. Falta calibrar: {1}.', e.message, e.faltan.map(h => `${fmtF(h[0])} a ${fmtF(h[1])}`).join('; '))
      : e.message, true);
  } finally {
    $('medir').disabled = !driver;
  }
}

// ---------- Presentacion ----------
// Qué ha cambiado desde la medida anterior de este mismo objetivo (el efecto de lo que acabas de cortar o alargar)
function comparacionPrevia() {
  const p = ultimo.previo, e = ultimo.reco?.est;
  if (!p || !e) return null;
  const hora = p.fecha.toLocaleTimeString(idiomaActual(), { hour: '2-digit', minute: '2-digit' });
  const d = e.roeMax - p.est.roeMax, rel = Math.abs(d) / p.est.roeMax;
  const tend = rel < 0.05 ? T('prácticamente igual') : d < 0 ? T('mejor') : T('peor');
  return T('Respecto a la medida anterior ({0}, línea gris del gráfico): ROE en el peor punto del objetivo {1} → {2} ({3}); en el mejor punto {4} → {5}.', hora, fmtROE(p.est.roeMax), fmtROE(e.roeMax), tend, fmtROE(p.est.roeMin), fmtROE(e.roeMin));
}

// Tabla «cómo va la antena en cada parte de la banda» (CW, fonía, digitales, FT8...) para las bandas de HF
function mostrarModos() {
  const filas = ultimo.cobertura ?? [];
  $('tarjeta-modos').hidden = !filas.length;
  if (!filas.length) return;
  const sel = ultimo.obj?.segmento?.id;
  const tb = $('modos');
  tb.innerHTML = `<tr><th>${T('Parte de la banda')}</th><th>${T('Rango')}</th><th>${T('ROE (mejor a peor)')}</th><th>${T('Resultado')}</th><th>${T('Qué hacer')}</th></tr>`;
  for (const f of filas) {
    const s = f.segmento, rango = s.puntual ? `${+s.f_min.toFixed(4)} MHz` : `${s.f_min} – ${s.f_max} MHz`;
    if (!f.medido) { tb.innerHTML += `<tr><td>${T(s.nombre)}</td><td>${rango}</td><td colspan="3">${T('fuera de lo medido')}</td></tr>`; continue; }
    const roe = f.est.sinPuntos || s.puntual || f.est.roeMin > ROE_MAX_MOSTRADO ? fmtROE(f.est.roeMin) : T('{0} a {1}', fmtROE(f.est.roeMin), fmtROE(f.est.roeMax));
    tb.innerHTML += `<tr class="${s.id === sel ? 'fila-elegida' : ''}"><td>${T(s.nombre)}${s.id === sel ? T(' ◀ ajustando') : ''}</td><td>${rango}</td><td>${roe}</td>` +
      `<td><span class="nivel" style="--c:${f.nivel.color}">${f.nivel.etiqueta}</span></td><td>${f.nivel.consejo}</td></tr>`;
  }
  const bien = filas.filter(f => f.medido && ['muy_bien', 'aceptable'].includes(f.nivel.id)).map(f => T(f.segmento.nombre));
  const mal = filas.filter(f => f.medido && ['mejorable', 'mal'].includes(f.nivel.id)).map(f => T(f.segmento.nombre));
  $('resumen-modos').innerHTML = `<p>${bien.length ? `<b>${T('Puedes usarla con normalidad en:')}</b> ${bien.join(', ')}.` : `<b>${T('Ahora mismo no está bien adaptada en ninguna parte de la banda.')}</b>`}` +
    `${mal.length ? ` <b>${T('Con cuidado o mejor no:')}</b> ${mal.join(', ')}.` : ''}</p>`;
}

// Calculadora de corte: el porcentaje de la recomendación pasado a milímetros del radiador (solo antenas de una banda)
function calculadoraMm() {
  const r = ultimo?.reco;
  const aplica = r && !r.multibanda && (r.accion === 'alargar' || r.accion === 'cortar') && Number.isFinite(r.pct);
  $('calc-mm').hidden = !aplica;
  if (!aplica) return;
  const c = calculoMm(+$('largo-mm').value, r.pct);
  $('res-mm').textContent = !c ? '' : c.accion === 'cortar'
    ? T('Corta {0} mm en total. Hazlo en pasos: corta primero {1} mm, vuelve a medir y repite: cortar no se puede deshacer.', c.mm.toFixed(1), c.primerPaso.toFixed(1))
    : T('Añade {0} mm al radiador. Después vuelve a medir para comprobarlo.', c.mm.toFixed(1));
  try { localStorage.setItem('largo-mm', $('largo-mm').value); } catch {}
}

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
    const lineas = [...ultimo.reco.lineas];
    // asistente de ajuste: qué ha cambiado desde la medida anterior de este mismo objetivo
    const cmp = comparacionPrevia();
    if (cmp) lineas.unshift(cmp);
    for (const l of lineas) ul.appendChild(Object.assign(document.createElement('li'), { textContent: l }));
    r.appendChild(ul);
  }
  mostrarModos();
  calculadoraMm();

  // Resumen (avanzado)
  const v = veredicto(ultimo.picos, ultimo.evaluacion, ultimo.umbral, unidad(), { medida: ultimo.medida, obj: ultimo.obj });
  $('titulo-grafico').textContent = unidad() === 'roe' ? T('ROE (relación de onda estacionaria)') : T('Pérdida de retorno');
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
  tp.innerHTML = `<tr><th>${T('Mínimo de ROE')}</th><th>${T('Pérdida de retorno')}</th><th>VSWR</th><th title="${T('Frecuencia donde la reactancia X cruza por cero: la resonancia eléctrica. No siempre coincide con el mínimo de ROE.')}">${T('Reactancia cero (X = 0)')}</th><th>${T('Ancho de banda')}</th></tr>`;
  if (!ultimo.picos.length) tp.innerHTML += `<tr><td colspan="5">${T('No se detectan resonancias claras en el rango medido.')}</td></tr>`;
  // X = 0 cerca de cada mínimo; ⚠ si se aleja más de un 2,5 % (el porcentaje de longitud puede no ser fiable)
  const celdaX = p => {
    const rx = reactanciaCero(ultimo.medida, p.f);
    if (!rx) return '—';
    const d = `${rx.desv > 0 ? '+' : ''}${(rx.desv * 100).toFixed(1)} %`;
    if (rx.tipo === 'paralelo') return T('{0} ({1}, en paralelo)', fmtF(rx.fX), d);
    return Math.abs(rx.desv) > DESV_REACTANCIA ? T('⚠ {0} ({1}): no coincide', fmtF(rx.fX), d) : `${fmtF(rx.fX)} (${d})`;
  };
  for (const p of ultimo.picos.slice(0, 8)) {
    const bw = p.fLo != null ? `${fmtF(p.fHi - p.fLo)} (${fmtF(p.fLo)} – ${fmtF(p.fHi)})` : T('no alcanza {0} dB', ultimo.umbral);
    tp.innerHTML += `<tr><td>${fmtF(p.f)}</td><td>${p.rl.toFixed(1)} dB</td><td>${fmtROE(p.vswr)}</td><td>${celdaX(p)}</td><td>${bw}</td></tr>`;
  }
  for (const p of ultimo.dudosos ?? []) {
    tp.innerHTML += `<tr class="dudosa"><td>${fmtF(p.f)} <span class="etiqueta-dudosa">${T('posiblemente falsa')}</span></td><td>${p.rl.toFixed(1)} dB</td><td>${fmtROE(p.vswr)}</td><td>—</td><td>${p.motivo}</td></tr>`;
  }
  const tb = $('bandas');
  tb.innerHTML = `<tr><th></th><th>${T('Banda')}</th><th>${T('Rango')}</th><th>${T('Resultado')}</th><th>${T('Mejor punto')}</th></tr>`;
  const orden = { ok: 0, parcial: 1, no: 2, sin_datos: 3, fuera: 4 };
  const filas = [...ultimo.evaluacion].sort((a, b) => orden[a.estado] - orden[b.estado] || a.banda.f_min - b.banda.f_min);
  for (const e of filas) {
    const b = e.banda;
    const mejor = e.fMejor ? `${unidad() === 'roe' ? T('ROE {0} a {1} (peor punto: {2})', fmtROE(e.vMejor), fmtROE(e.peorVswr), nivelROE(e.peorVswr).etiqueta.toLowerCase()) : T('{0} dB · VSWR {1}', e.mejorRl.toFixed(1), fmtROE(e.vMejor))} @ ${fmtF(e.fMejor)}` : '';
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
  const previo = unidad() === 'roe' && ultimo.previo ? remuestrear(ultimo.previo.freq, ultimo.previo.vswr, medida.freq) : undefined;
  (unidad() === 'roe' ? dibujarROE : dibujar)($('grafico'), medida, ultimo.evaluacion, ultimo.umbral, { marcadorF: fm, marcasX: marcasXActivas(), previo });
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
    ? T('bobina {0} nH', (eq.valor * 1e9).toFixed(2))
    : T('condensador {0} pF', (eq.valor * 1e12).toFixed(2));
  const filas = [
    [T('Frecuencia'), fmtF(f)],
    ['|S11|', `${m.mag[i].toFixed(2)} dB`],
    [T('Pérdida de retorno'), `${m.rl[i].toFixed(2)} dB`],
    ['VSWR', fmtROE(m.vswr[i])],
    [T('Fase de S11'), `${m.fase[i].toFixed(1)}°`],
    [T('Impedancia Z'), `${m.zr[i].toFixed(1)} ${m.zx[i] >= 0 ? '+' : '−'} j${Math.abs(m.zx[i]).toFixed(1)} Ω`],
    ['|Z|', `${Math.hypot(m.zr[i], m.zx[i]).toFixed(1)} Ω`],
    [T('Equivalente serie'), eqTxt],
    [T('Retardo de grupo'), `${m.retardo[i].toFixed(2)} ns`],
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
  iniciarMesh();
  try { $('largo-mm').value = localStorage.getItem('largo-mm') ?? ''; } catch {}
  $('largo-mm').oninput = calculadoraMm;
  grillo = crearGrillo({
    raiz: $('grillo'), img: $('grillo-img'), burbuja: $('grillo-burbuja'), texto: $('grillo-texto'), vale: $('grillo-vale'), no: $('grillo-no'),
    alCambiar: activo => { $('ver-grillo').checked = activo; },
  });
  $('ver-grillo').checked = grillo.estaActivo();
  $('ver-grillo').onchange = () => { grillo.silenciar(!$('ver-grillo').checked); if (grillo.estaActivo()) cricky('inicio'); };
  if (!('serial' in navigator)) $('aviso-nav').hidden = false;
  try {
    bandasCfg = await (await fetch('./bandas.json')).json();
    try { segCfg = await (await fetch('./segmentos_hf.json')).json(); } catch { segCfg = null; } // sin él no hay selector de segmentos
  } catch (e) {
    return estado(T('No se pudo cargar bandas.json (¿abierto sin servidor web?)'), true);
  }
  try { $('multibanda').checked = localStorage.getItem('multibanda') === '1'; } catch {}
  $('multibanda').onchange = () => {
    try { localStorage.setItem('multibanda', $('multibanda').checked ? '1' : '0'); } catch {}
    reanalizar();
  };
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
  cricky('inicio');

  let e0 = 'banda';
  try { e0 = localStorage.getItem('estudio') || 'banda'; } catch {}
  aplicarEstudio(e0 === 'general' ? 'general' : 'banda');
  $('estudio').onchange = () => aplicarEstudio($('estudio').value);
  $('margen').onchange = () => {};
  $('modo-simple').onclick = () => aplicarModo('simple');
  $('modo-avanzado').onclick = () => aplicarModo('avanzado');
  $('conectar').onclick = () => (driver ? desconectar() : conectar());
  // antenas de ejemplo del modo simulado (solo se ve el selector con el modo simulado activado)
  for (const [id, nombre] of Object.entries(ANTENAS_SIMULADAS)) $('antena-sim').add(new Option(nombre, id));
  $('simulado').addEventListener('change', () => { $('campo-antena-sim').hidden = !$('simulado').checked; });
  $('campo-antena-sim').hidden = !$('simulado').checked;
  $('medir').onclick = medir;
  $('region').onchange = () => { poblarObjetivo(); reanalizar(); };
  $('objetivo').onchange = () => { $('campo-fobj').hidden = $('objetivo').value !== 'custom'; $('campo-mesh').hidden = $('objetivo').value !== 'meshtastic'; actualizarMesh(); poblarSegmentos(); reanalizar(); };
  $('segmento').onchange = reanalizar; // se mide la banda entera, así que cambiar de segmento no obliga a medir otra vez
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
        equipo: driver ? `${driver.nombre}${driver.version ? ' (' + driver.version + ')' : ''}` : T('desconocido'),
        espaciado: modo === 'simple' || $('espaciado').value === 'log' ? T('logarítmico') : T('lineal'),
        region: $('region').selectedOptions[0].textContent,
        unidad: unidad(),
        marcasX: marcasXActivas(),
      });
      estado(T('Informe guardado: {0}', nombre));
    } catch (e) { estado(e.message, true); }
    $('pdf').disabled = false;
  };
  // Calibracion
  asistente = crearAsistente({
    contenedor: $('asistente'),
    getDriver: () => {
      if (driver?.perdido) perderConexion(T('Se perdió la conexión con el equipo. Vuelve a conectar.'));
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
    if (!j || !confirm(T('¿Borrar la calibración «{0}»? No se puede deshacer.', j.nombre))) return;
    almacen.lista = almacen.lista.filter(x => x.id !== j.id);
    almacen.guardar();
    poblarCal('equipo');
  };
  $('cal-importar-btn').onclick = () => $('cal-importar').click();
  $('cal-importar').onchange = async e => {
    try {
      const j = juegoDeJSON(JSON.parse(await e.target.files[0].text()));
      if (!j.segmentos?.length) throw new Error(T('El archivo no contiene tramos de calibración'));
      j.id = 'cal' + Date.now();
      almacen.lista.push(j);
      almacen.guardar();
      poblarCal(j.id);
      estado(T('Calibración «{0}» importada', j.nombre));
    } catch (err) { estado(T('No se pudo importar: ') + err.message, true); }
    e.target.value = '';
  };
  ['region', 'objetivo', 'margen', 'estudio', 'fini', 'ffin'].forEach(id => $(id).addEventListener('change', resumenCal));

  enlazarCursor();
  window.addEventListener('resize', redibujar);
}

iniciar();
