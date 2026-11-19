// Herramientas de radioaficionado del modo Avanzado: calculadora de adaptación y medidas de coaxial/stubs.
// Trabajan sobre la última medida (ultimo.medida) y se rehacen al cambiar un dato.
import { T } from './i18n.js';
import { indiceMasCercano, fmtROE } from './analisis.js';
import { redesL, nombreValor } from './adaptacion.js';
import { medirLinea, largoStub, descripcionStub } from './coaxial.js';

const $ = id => document.getElementById(id);
const fila = (celdas, th = false) => `<tr>${celdas.map(c => `<${th ? 'th' : 'td'}>${c}</${th ? 'th' : 'td'}>`).join('')}</tr>`;
const fMHz = hz => +(hz / 1e6).toPrecision(6);
const mm = m => m >= 1 ? `${m.toFixed(3)} m` : `${(m * 1000).toFixed(1)} mm`;

export function iniciarHerramientas({ getUltimo }) {
  const adaptar = () => {
    const u = getUltimo(), tabla = $('adapt-tabla'), nota = $('adapt-nota');
    tabla.replaceChildren(); nota.textContent = '';
    if (!u) return;
    const f = +$('adapt-f').value * 1e6, m = u.medida;
    if (!(f >= m.freq[0] && f <= m.freq[m.freq.length - 1])) { nota.textContent = T('La frecuencia está fuera de la medida.'); return; }
    const i = indiceMasCercano(m.freq, f), zr = m.zr[i], zx = m.zx[i];
    const redes = redesL(zr, zx, m.freq[i]);
    const z = `${zr.toFixed(1)} ${zx >= 0 ? '+' : '−'} j${Math.abs(zx).toFixed(1)} Ω`;
    if (!redes.length) { nota.textContent = T('Con Z = {0} no hay red en L (R debe ser mayor que 0).', z); return; }
    const sitio = r => r.topologia === 'derivacionCarga' ? T('en derivación junto a la antena, serie hacia el equipo') : T('serie junto a la antena, en derivación hacia el equipo');
    const comp = (c, tipo) => `${tipo === 'serie' ? T('serie') : T('derivación')}: ${c.tipo === 'L' ? T('bobina') : T('condensador')} ${nombreValor(c)}`;
    let h = fila([T('Red'), T('Componentes'), T('Pérdida de retorno'), 'VSWR'], true);
    redes.forEach((r, k) => { h += fila([`${k + 1}. ${sitio(r)}`, `${comp(r.serie, 'serie')}<br>${comp(r.derivacion, 'der')}`, `${r.rl.toFixed(1)} dB`, fmtROE(r.vswr)]); });
    tabla.innerHTML = h;
    nota.textContent = T('Impedancia a {0} MHz: {1}. La curva real cambia fuera de esa frecuencia y los componentes tienen pérdidas y tolerancia: ajusta con el modo En vivo.', fMHz(m.freq[i]), z);
  };

  const coaxial = () => {
    const u = getUltimo(), tabla = $('coax-tabla'), nota = $('coax-nota');
    tabla.replaceChildren(); nota.textContent = '';
    if (!u) return;
    const largo = +$('coax-largo').value, f = +$('coax-f').value * 1e6 || u.medida.freq[u.idx];
    const r = medirLinea(u.medida, largo, f);
    if (!r) { nota.textContent = T('Hacen falta más puntos para medir una línea.'); return; }
    if (!r.valido) { nota.textContent = T('El retardo medido no es válido: ¿hay una línea con el extremo abierto o en corto?'); return; }
    if (r.ambigua) { nota.textContent = T('El paso de frecuencia es demasiado grande para esa longitud: mide una banda más estrecha o con más puntos.'); return; }
    let h = fila([T('Dato'), T('Valor')], true);
    h += fila([T('Retardo de ida'), `${(r.tau * 1e9).toFixed(2)} ns`]);
    h += fila([T('Longitud eléctrica'), mm(r.largoElectricoM)]);
    h += fila([T('Pérdida de ida a {0} MHz', fMHz(r.fPerdida)), `${r.perdidaIdaDb.toFixed(2)} dB`]);
    let vf = null;
    if (largo > 0) {
      vf = r.vf;
      h += fila([T('Factor de velocidad'), vf.toFixed(3)]);
      h += fila([T('Pérdida por 100 m'), `${r.perdidaPor100m.toFixed(1)} dB`]);
    }
    const fs = +$('stub-f').value * 1e6;
    if (fs > 0 && vf > 0) {
      const ext = $('coax-extremo').value;
      for (const fr of [0.25, 0.5]) {
        const L = largoStub(fr, fs, vf);
        h += fila([T('Stub de {0} a {1} MHz', fr === 0.25 ? 'λ/4' : 'λ/2', fMHz(fs)), `${mm(L)} · ${T('con el extremo {0} hace de {1}', ext === 'abierto' ? T('abierto') : T('en corto'), T(descripcionStub(ext, fr)))}`]);
      }
    }
    tabla.innerHTML = h;
    nota.textContent = vf > 0 ? T('La pérdida solo es fiable si el extremo refleja todo (abierto o en corto limpios) y está calibrado en el conector del cable.') : T('Escribe el largo físico para obtener el factor de velocidad.');
  };

  $('adapt-cursor').onclick = () => { const u = getUltimo(); if (u) { $('adapt-f').value = fMHz(u.medida.freq[u.idx]); adaptar(); } };
  for (const id of ['adapt-f']) $(id).oninput = adaptar;
  for (const id of ['coax-largo', 'coax-extremo', 'coax-f', 'stub-f']) $(id).oninput = coaxial;

  return {
    // se llama tras cada medida: pone la frecuencia por defecto (la del cursor) y rehace las tablas
    actualizar() {
      const u = getUltimo();
      if (!u) return;
      if (!$('adapt-f').value) $('adapt-f').value = fMHz(u.medida.freq[u.idx]);
      adaptar(); coaxial();
    },
  };
}
