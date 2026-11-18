import { T } from './i18n.js';
import { DriverNanoVNAH } from './drivers/nanovna-h.js';
import { DriverSimulado } from './drivers/simulado.js';
import { ejecutarDiagnostico } from './diagnostico.js';

const $ = id => document.getElementById(id);
let drv = null, ultimo = '';
const estado = (t, error = false) => { $('estado').textContent = t; $('estado').className = error ? 'msg-error' : ''; };

if (!('serial' in navigator)) $('aviso-nav').hidden = false;

$('btn-tema').onclick = () => {
  const r = document.documentElement, oscuro = matchMedia('(prefers-color-scheme: dark)').matches;
  const act = r.dataset.theme || (oscuro ? 'dark' : 'light');
  r.dataset.theme = act === 'dark' ? 'light' : 'dark';
};

$('conectar').onclick = async () => {
  if (drv) { await drv.disconnect?.(); drv = null; $('conectar').textContent = T('Conectar'); $('ejecutar').disabled = true; return estado(T('Desconectado')); }
  try {
    drv = $('simulado').checked ? new DriverSimulado() : new DriverNanoVNAH();
    estado(T('Conectando…'));
    await drv.connect();
    drv.alPerder = m => { drv = null; $('conectar').textContent = T('Conectar'); $('ejecutar').disabled = true; estado(m, true); };
    $('conectar').textContent = T('Desconectar'); $('ejecutar').disabled = false;
    estado(T('Conectado: {0}', drv.nombre + (drv.version ? ' · ' + drv.version : '')));
  } catch (e) { drv = null; estado(e.message, e.codigo !== 'cancelado'); }
};

$('ejecutar').onclick = async () => {
  if (!drv) return;
  $('ejecutar').disabled = true; $('copiar').disabled = $('descargar').disabled = true;
  $('informe').textContent = '';
  try {
    const r = await ejecutarDiagnostico(drv, {
      bruto: $('bruto').checked,
      onPaso: p => { estado(T('Hecho: {0}…', p.nombre)); $('informe').textContent += `${p.ok === true ? '✔' : p.ok === false ? '✖' : 'ℹ'} ${p.nombre}\n`; },
    });
    ultimo = r.resumen;
    $('informe').textContent = ultimo;
    $('copiar').disabled = $('descargar').disabled = false;
    estado(r.pasos.some(p => p.ok === false) ? T('Terminado con fallos: copia el informe y compártelo.') : T('Terminado: todo correcto.'), r.pasos.some(p => p.ok === false));
  } catch (e) { estado(e.message, true); }
  $('ejecutar').disabled = !drv;
};

$('copiar').onclick = async () => { try { await navigator.clipboard.writeText(ultimo); estado(T('Informe copiado')); } catch { estado(T('No se pudo copiar; usa «Descargar»'), true); } };
$('descargar').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ultimo], { type: 'text/plain;charset=utf-8' }));
  a.download = `diagnostico_chirptenna_vna_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click(); URL.revokeObjectURL(a.href);
};
