// Asistente de calibracion guiado (OPEN, SHORT, LOAD) por tramos de frecuencia.
// Cada tramo se calibra por separado y se guarda en el navegador, asi se puede completar mas tarde.
import { T, idiomaActual } from './i18n.js';
import { cargarPatrones } from './patrones.js';
import {
  calcularTramo, comprobarPatron, resumenTramo, repetibilidadDb, planificarTramos, faltante,
  cargarJuegos, guardarJuegos,
} from './calibracion.js';

const PASOS = [
  { id: 'open', titulo: T('OPEN (abierto)'), instr: T('Conecta el patrón OPEN en el extremo del cable, justo donde luego irá la antena. Si tu kit no trae OPEN, deja el conector al aire, sin nada conectado.') },
  { id: 'short', titulo: T('SHORT (cortocircuito)'), instr: T('Quita el OPEN y conecta el patrón SHORT (cortocircuito) en el mismo punto.') },
  { id: 'load', titulo: T('LOAD (carga de 50 Ω)'), instr: T('Quita el SHORT y conecta la carga de 50 Ω (LOAD) en el mismo punto.') },
  { id: 'verif', titulo: T('Verificación (opcional)'), instr: T('Desconecta la carga y vuelve a conectarla. Así se comprueba que la calibración se repite bien al reconectar.') },
];

// Juegos de calibracion: en memoria y en localStorage
export const almacen = {
  lista: cargarJuegos(),
  guardar() { return guardarJuegos(this.lista); },
  recargar() { this.lista = cargarJuegos(); },
};

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmtF = hz => hz >= 1e9 ? `${(hz / 1e9).toFixed(3)} GHz` : hz >= 1e6 ? `${(hz / 1e6).toFixed(3)} MHz` : `${(hz / 1e3).toFixed(1)} kHz`;

// Barra con los tramos calibrados sobre el rango [fMin, fMax] (escala logaritmica).
export function barraCobertura(el, segs, fMin, fMax) {
  const L = Math.log10, pos = f => Math.min(100, Math.max(0, ((L(f) - L(fMin)) / (L(fMax) - L(fMin))) * 100));
  const trozos = segs.map(s => {
    const a = s.freq[0], b = s.freq[s.freq.length - 1];
    return `<span style="left:${pos(a)}%;width:${Math.max(0.6, pos(b) - pos(a))}%" title="${T('{0} a {1}', fmtF(a), fmtF(b))}"></span>`;
  }).join('');
  el.innerHTML = `<div class="cobertura">${trozos}</div><div class="cob-eje"><span>${fmtF(fMin)}</span><span>${fmtF(fMax)}</span></div>`;
}

export function crearAsistente({ contenedor, getDriver, getRangoPlan, onCambio, estado }) {
  let S = null; // estado del asistente
  const cerrar = () => { S = null; contenedor.hidden = true; contenedor.innerHTML = ''; };

  function abrir(juegoId = null) {
    const r = getRangoPlan();
    S = { fase: 'plan', rango: r, juegoId, tramos: [], i: 0, paso: 0, m: {}, seg: null, msg: '', ocupado: false, prog: 0 };
    contenedor.hidden = false;
    render();
    contenedor.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------- Plan ----------
  function leerPlan() {
    const q = id => contenedor.querySelector(id);
    const a = +q('#pl-ini').value * 1e6, b = +q('#pl-fin').value * 1e6;
    const n = Math.max(1, Math.min(8, Math.round(+q('#pl-n').value) || 1));
    const puntos = Math.max(21, Math.min(1001, Math.round(+q('#pl-pts').value) || 401));
    const id = q('#pl-juego').value;
    const solo = q('#pl-huecos')?.checked && id !== 'nuevo';
    return { a, b, n, puntos, id, solo, nombre: q('#pl-nombre')?.value.trim() };
  }

  function tramosDePlan(p) {
    if (!(p.b > p.a && p.a > 0)) return [];
    let partes;
    if (p.solo) {
      const j = almacen.lista.find(x => x.id === p.id);
      const huecos = faltante(j.segmentos, p.a, p.b);
      partes = huecos.length === 1 ? planificarTramos(huecos[0][0], huecos[0][1], p.n) : huecos;
    } else partes = planificarTramos(p.a, p.b, p.n);
    return partes.map(([fIni, fFin]) => ({ fIni: Math.round(fIni), fFin: Math.round(fFin), puntos: p.puntos }));
  }

  function pantallaPlan() {
    const r = S.rango;
    const ratio = r.fFin / r.fIni;
    const nSug = Math.max(1, Math.min(6, Math.ceil(Math.log10(ratio))));
    const opts = almacen.lista.map(j => `<option value="${esc(j.id)}" ${j.id === S.juegoId ? 'selected' : ''}>${esc(j.nombre)} (${T('{0} tramos', j.segmentos.length)})</option>`).join('');
    contenedor.innerHTML = `
      <h3>${T('Calibración guiada')}</h3>
      <p>${T('Se calibra el equipo con tres patrones (OPEN, SHORT y LOAD) <b>en el extremo del cable, donde irá la antena</b>. Puedes hacerlo en <b>uno o varios tramos de frecuencia</b>: cada tramo se guarda al terminarlo, así que puedes parar y seguir otro día. Usa siempre el mismo cable y los mismos adaptadores para todos los tramos.')}</p>
      <p class="leyenda">${nSug > 1 ? T('Rango propuesto: {0}. Para esa medida conviene {1} tramos.', esc(r.desc), nSug) : T('Rango propuesto: {0}. Para esa medida conviene 1 tramo.', esc(r.desc))}</p>
      <div class="campos">
        <label>${T('Desde (MHz)')}<input id="pl-ini" type="number" step="any" value="${+(r.fIni / 1e6).toPrecision(6)}"></label>
        <label>${T('Hasta (MHz)')}<input id="pl-fin" type="number" step="any" value="${+(r.fFin / 1e6).toPrecision(6)}"></label>
        <label>${T('Número de tramos')}<input id="pl-n" type="number" min="1" max="8" value="${nSug}"></label>
        <label>${T('Puntos por tramo')}<input id="pl-pts" type="number" min="21" max="1001" value="401"></label>
        <label>${T('Guardar en')}
          <select id="pl-juego"><option value="nuevo">${T('Un juego nuevo')}</option>${opts}</select>
        </label>
        <label id="pl-lnombre">${T('Nombre del juego')}<input id="pl-nombre" type="text" maxlength="40" value="${esc(T('Calibración {0}', new Date().toLocaleDateString(idiomaActual())))}"></label>
        <label class="chk" id="pl-lhuecos" hidden><input id="pl-huecos" type="checkbox" checked> ${T('Calibrar solo lo que falta')}</label>
      </div>
      <div id="pl-previa"></div>
      <div class="botones"><button id="pl-ir" class="primario">${T('Empezar')}</button><button id="pl-x">${T('Cancelar')}</button></div>`;
    const actualizar = () => {
      const p = leerPlan();
      const hayJuego = p.id !== 'nuevo';
      contenedor.querySelector('#pl-lnombre').hidden = hayJuego;
      contenedor.querySelector('#pl-lhuecos').hidden = !hayJuego;
      const t = tramosDePlan(p);
      contenedor.querySelector('#pl-previa').innerHTML = t.length
        ? `<table><tr><th>${T('Tramo')}</th><th>${T('Rango')}</th><th>${T('Puntos')}</th></tr>${t.map((x, k) => `<tr><td>${k + 1}</td><td>${T('{0} a {1}', fmtF(x.fIni), fmtF(x.fFin))}</td><td>${x.puntos}</td></tr>`).join('')}</table>`
        : `<p class="leyenda">${T('Todo ese rango ya está calibrado en el juego elegido.')}</p>`;
      contenedor.querySelector('#pl-ir').disabled = !t.length;
    };
    contenedor.querySelectorAll('input,select').forEach(e => (e.oninput = actualizar));
    contenedor.querySelector('#pl-x').onclick = cerrar;
    contenedor.querySelector('#pl-ir').onclick = () => {
      const p = leerPlan();
      S.tramos = tramosDePlan(p);
      if (p.id === 'nuevo') {
        const j = { id: 'cal' + Date.now(), nombre: p.nombre || T('Calibración'), fecha: Date.now(), segmentos: [] };
        almacen.lista.push(j);
        S.juegoId = j.id;
      } else S.juegoId = p.id;
      S.rango = { ...S.rango, fIni: p.a, fFin: p.b };
      S.fase = 'medir'; S.i = 0; S.paso = 0; S.m = {}; S.seg = null; S.msg = '';
      render();
    };
    actualizar();
  }

  // ---------- Medida por tramos ----------
  const juegoActual = () => almacen.lista.find(j => j.id === S.juegoId);

  function pantallaMedir() {
    const t = S.tramos[S.i], paso = PASOS[S.paso];
    const lista = PASOS.map((p, k) => {
      const hecho = k < S.paso;
      return `<li class="${hecho ? 'hecho' : k === S.paso ? 'actual' : ''}">${hecho ? '✔' : k === S.paso ? '▶' : '○'} ${p.titulo}</li>`;
    }).join('');
    contenedor.innerHTML = `
      <h3>${T('Tramo {0} de {1}: {2} a {3}', S.i + 1, S.tramos.length, fmtF(t.fIni), fmtF(t.fFin))}</h3>
      <ul class="pasos-cal">${lista}</ul>
      <div class="instr"><b>${paso.titulo}</b><p>${esc(paso.instr)}</p><img class="fig-paso" src="img/montaje/${paso.id === 'verif' ? 'load' : paso.id}.svg" alt="" width="260" height="87"></div>
      ${S.ocupado ? `<progress max="1" value="${S.prog}"></progress><p class="leyenda">${T('Midiendo… no toques el cable.')}</p>` : ''}
      ${S.msg ? `<p class="${S.msgError ? 'msg-error' : 'msg-ok'}">${esc(S.msg)}</p>` : ''}
      <div class="botones">
        <button id="m-medir" class="primario" ${S.ocupado ? 'disabled' : ''}>${paso.id === 'verif' ? T('Medir reconexión') : T('Medir {0}', paso.id.toUpperCase())}</button>
        ${paso.id === 'verif' ? `<button id="m-omitir">${T('Omitir verificación y guardar el tramo')}</button>` : ''}
        ${S.paso > 0 && paso.id !== 'verif' ? '<button id="m-atras" ' + (S.ocupado ? 'disabled' : '') + '>' + T('Repetir el paso anterior') + '</button>' : ''}
        <button id="m-luego" ${S.ocupado ? 'disabled' : ''}>${T('Dejar el resto para más tarde')}</button>
      </div>`;
    contenedor.querySelector('#m-medir').onclick = medirPaso;
    contenedor.querySelector('#m-luego').onclick = () => { S.fase = 'fin'; render(); };
    contenedor.querySelector('#m-atras')?.addEventListener('click', () => { S.paso--; S.msg = ''; render(); });
    contenedor.querySelector('#m-omitir')?.addEventListener('click', guardarTramo);
  }

  const mismaRejilla = (a, b) => a.length === b.length && a.every((f, k) => Math.abs(f - b[k]) <= 2 + f * 1e-6);

  async function medirPaso() {
    const drv = getDriver();
    if (!drv) { S.msg = T('Conecta primero el equipo (o activa el modo simulado y pulsa Conectar).'); S.msgError = true; return render(); }
    const t = S.tramos[S.i], paso = PASOS[S.paso];
    S.ocupado = true; S.msg = ''; S.prog = 0; render();
    try {
      drv.setEstandar?.(paso.id === 'verif' ? 'load' : paso.id); // solo el simulado; en un equipo real conectas tú el patrón
      const crudo = await drv.scan(t.fIni, t.fFin, t.puntos, p => {
        S.prog = p;
        const pr = contenedor.querySelector('progress'); if (pr) pr.value = p;
      }, 'log', { bruto: true });

      if (paso.id === 'verif') {
        const db = repetibilidadDb(S.seg, crudo);
        const bien = db <= -20;
        S.msg = T('Con la carga reconectada, |Γ| medio = {0} dB. {1}', db.toFixed(1), bien ? T('La calibración se repite bien.') : T('Es poco: revisa conectores, apriétalos y repite la calibración de este tramo.'));
        S.msgError = !bien; S.ocupado = false; S.verifHecha = bien;
        return bien ? guardarTramo() : render();
      }
      if (S.paso > 0 && !mismaRejilla(S.freq, Array.from(crudo.freq))) throw new Error(T('El equipo ha cambiado las frecuencias de medida. Repite el tramo desde OPEN.'));
      const ref = S.m.open;
      const chk = comprobarPatron(paso.id, crudo, ref);
      if (!chk.ok) { S.msg = chk.mensaje; S.msgError = true; S.ocupado = false; return render(); }
      if (paso.id === 'open') S.freq = Array.from(crudo.freq);
      S.m[paso.id] = crudo;
      S.msg = chk.mensaje; S.msgError = false;
      S.paso++;
      if (paso.id === 'load') {
        S.seg = calcularTramo(S.freq, S.m.open, S.m.short, S.m.load, { equipo: drv.nombre + (drv.version ? ' ' + drv.version : ''), patrones: cargarPatrones() });
        const r = resumenTramo(S.seg);
        S.msg = T('Calibración calculada. Directividad |Ed| media {0}, adaptación de fuente |Es| media {1}. Ahora una verificación rápida (puedes omitirla).', r.ed.toFixed(3), r.es.toFixed(3));
      }
    } catch (e) {
      S.msg = e.codigo === 'desconectado' ? T('{0} El paso no se ha guardado: vuelve a conectar y repítelo.', e.message) : e.message;
      S.msgError = true;
    }
    S.ocupado = false;
    render();
  }

  function guardarTramo() {
    const j = juegoActual();
    j.segmentos.push(S.seg);
    const ok = almacen.guardar();
    onCambio(j.id);
    estado(ok ? T('Tramo guardado en «{0}»', j.nombre) : T('Tramo calculado, pero no se pudo guardar en el navegador (exporta el juego para no perderlo)'), !ok);
    S.i++; S.paso = 0; S.m = {}; S.seg = null; S.verifHecha = false;
    S.msg = ok ? T('Tramo guardado.') : T('No se pudo guardar en el navegador: exporta el juego desde el panel de calibración.');
    S.msgError = !ok;
    if (S.i >= S.tramos.length) S.fase = 'fin';
    render();
  }

  // ---------- Final ----------
  function pantallaFin() {
    const j = juegoActual();
    const huecos = j ? faltante(j.segmentos, S.rango.fIni, S.rango.fFin) : [];
    contenedor.innerHTML = `
      <h3>${S.i >= S.tramos.length ? T('Calibración completada') : T('Calibración guardada hasta aquí')}</h3>
      <p>${j?.segmentos.length === 1 ? T('Juego «{0}»: 1 tramo calibrado.', esc(j?.nombre ?? '')) : T('Juego «{0}»: {1} tramos calibrados.', esc(j?.nombre ?? ''), j?.segmentos.length ?? 0)}</p>
      <div id="fin-cob"></div>
      ${huecos.length
        ? `<p class="msg-error">${T('Falta por calibrar (del rango {0} a {1}): {2}. Vuelve al asistente cuando quieras para completarlo.', fmtF(S.rango.fIni), fmtF(S.rango.fFin), huecos.map(h => T('{0} a {1}', fmtF(h[0]), fmtF(h[1]))).join('; '))}</p>`
        : `<p class="msg-ok">${T('Todo el rango previsto está calibrado.')}</p>`}
      <div class="botones">
        <button id="f-usar" class="primario">${T('Usar esta calibración')}</button>
        <button id="f-otro">${T('Calibrar otro tramo')}</button>
        <button id="f-x">${T('Cerrar')}</button>
      </div>`;
    if (j) barraCobertura(contenedor.querySelector('#fin-cob'), j.segmentos, S.rango.fIni, S.rango.fFin);
    contenedor.querySelector('#f-usar').onclick = () => { onCambio(S.juegoId, true); cerrar(); };
    contenedor.querySelector('#f-otro').onclick = () => abrir(S.juegoId);
    contenedor.querySelector('#f-x').onclick = cerrar;
  }

  function render() {
    if (!S) return;
    if (S.fase === 'plan') pantallaPlan();
    else if (S.fase === 'medir') pantallaMedir();
    else pantallaFin();
  }

  return { abrir, cerrar };
}
