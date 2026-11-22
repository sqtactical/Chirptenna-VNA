// Asistente de materiales del cupón C (modo Avanzado): εr del FR4 del cupón y εr (y tanδ aproximada) de un plástico con un stub abierto medido en S11.
// La interfaz; el cálculo está en plastico.js.
import { T } from './i18n.js';
import { leerTouchstone } from './touchstone.js';
import { medirStub, erFr4Stubs, resonanciasStub, elegirResonancia, STUBS, REF_STUBS } from './plastico.js';

const $ = id => document.getElementById(id);

export function iniciarMateriales({ getUltimo = () => null } = {}) {
  if (!$('tarjeta-materiales')) return;
  const num = id => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };
  const modo = () => $('mat-modo').value, n = () => +$('mat-n').value, stub = () => $('mat-stub').value;
  const nota = txt => { $('mat-nota').textContent = txt; };
  const esperada = (s = stub()) => REF_STUBS[s][n() - 1] ?? null;
  const actualizar = () => {
    const fr4 = modo() === 'fr4';
    $('mat-bloque-fr4').hidden = !fr4; $('mat-bloque-plastico').hidden = fr4; $('mat-stub').disabled = fr4;
    const ref = esperada();
    $('mat-esperada').textContent = fr4 ? T('Con el FR4 se usan los stubs en el mismo modo (el elegido en «Resonancia»).')
      : ref ? T('Resonancia esperada con FR4 de εr 4,5 (simulación 3D, sin conector): {0} MHz; con una muestra baja entre un 5 y un 40 %.', Math.round(ref * 10) / 10)
        : T('Ese stub no tiene ese modo dentro de lo simulado: elige otro.');
    $('mat-aviso').textContent = fr4 ? T('El FR4 se mide con dos o tres stubs en el mismo modo: el largo eléctrico del conector, que no se conoce, sale de la recta 1/f frente al largo.') : '';
  };
  for (const id of ['mat-modo', 'mat-stub', 'mat-n']) $(id).onchange = actualizar;
  actualizar();

  // Rellena la frecuencia (y la R) de la resonancia que se busca en un S11 (freq en Hz, re, im)
  const buscar = (freq, re, im, destino) => {
    const s = destino in STUBS ? destino : stub(), refs = REF_STUBS[s];
    if (n() > refs.length) { nota(T('Ese stub no tiene ese modo dentro de lo simulado: elige otro.')); return; }
    const centro = destino === '1' ? (num('mat-f-0') ?? refs[n() - 1]) * 0.8 : refs[n() - 1];
    const r = elegirResonancia(resonanciasStub(freq, re, im), centro, destino === '1' ? 0.3 : 0.15);
    if (!r) { nota(T('No se ve una resonancia (X = 0 con pendiente positiva) en el margen esperado: escribe los valores a mano o revisa el stub y el modo.')); return; }
    if (destino in STUBS) $('mat-fr4-' + destino).value = +r.fMHz.toFixed(3);
    else { $('mat-f-' + destino).value = +r.fMHz.toFixed(3); $('mat-r-' + destino).value = +r.rOhm.toFixed(2); }
    nota(T('Resonancia en {0} MHz, R = {1} Ω.', +r.fMHz.toFixed(3), +r.rOhm.toFixed(2)));
  };
  for (const d of ['0', '1', ...Object.keys(STUBS)]) {
    $('mat-arch-' + d).onchange = async e => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      try { const t = leerTouchstone(await archivo.text(), archivo.name); buscar(t.freq, t.re, t.im, d); }
      catch (err) { nota(T('No se puede leer el archivo: {0}', err.message)); }
    };
  }
  for (const d of ['0', '1']) {
    $('mat-ult-' + d).onclick = () => {
      const u = getUltimo();
      if (!u?.crudo) { nota(T('Todavía no hay ninguna medida en esta página: mide o sube un archivo.')); return; }
      buscar(u.crudo.freq, u.crudo.re, u.crudo.im, d);
    };
  }

  $('mat-calcular').onclick = () => {
    const tabla = $('mat-tabla');
    tabla.replaceChildren(); nota('');
    const fila = (a, b) => { const tr = tabla.insertRow(); tr.insertCell().textContent = a; tr.insertCell().textContent = b; };
    if (modo() === 'fr4') {
      const fs = Object.fromEntries(Object.keys(STUBS).map(k => [k, num('mat-fr4-' + k)]));
      const r = erFr4Stubs(fs, n());
      if (!r.ok) { nota(r.motivo); return; }
      fila(T('εr del FR4'), `${r.er.toFixed(2)} ± ${r.erIncertidumbre.toFixed(2)}`);
      fila(T('εeff'), r.epsEff.toFixed(3));
      fila(T('Longitud eléctrica del conector (mm)'), r.lanzamientoMm.toFixed(1));
      $('mat-er-fr4').value = r.er.toFixed(2);
      nota(T('La simulación 3D da +3 % de εr sobre el valor cuasiestático (la malla de FDTD): no te fíes de menos de ±3 % en el valor absoluto. Ponlo en «εr del FR4 de tu placa» para medir plásticos.'));
      return;
    }
    const f0 = num('mat-f-0'), f1 = num('mat-f-1'), t = num('mat-t');
    if (!f0 || !f1 || !t) { nota(T('Faltan las dos resonancias y el grosor.')); return; }
    const r = medirStub({ fVacioMHz: f0, fCargadoMHz: f1, grosorMm: t, rVacio: num('mat-r-0'), rCargado: num('mat-r-1'), modo: n(),
      erSustrato: num('mat-er-fr4') ?? 4.5, gapMm: num('mat-gap') ?? 0 });
    if (!r.ok) { nota(r.motivo); return; }
    fila(T('εr de la muestra'), `${r.er.toFixed(2)} ± ${r.erIncertidumbre.toFixed(2)}`);
    fila(T('Desplazamiento de la resonancia'), `${r.desplazamientoPct.toFixed(2)} %`);
    fila(T('Energía del campo en la muestra'), `${(100 * r.fraccionEnergiaMuestra).toFixed(0)} %`);
    if (r.tand !== undefined && r.tand !== null) {
      fila(T('tanδ de la muestra'), `${r.tand.toFixed(4)} ± ${r.tandIncertidumbre.toFixed(4)}${r.tandFiable ? '' : ' · ' + T('no fiable: la incertidumbre es mayor que el valor')}`);
    }
    const avisos = [];
    if (r.fueraDeCalibracion) avisos.push(T('Fuera del rango calibrado en 3D (εr de 2 a 10, grosor de 1,5 a 4,5 mm): menos fiable.'));
    if (r.tand !== undefined) avisos.push(T('La tanδ sale de la resistencia en la resonancia (unas décimas de ohmio): un NanoVNA solo la distingue si pasa de ~0,03. Con plásticos de pérdidas bajas, usa la de la literatura.'));
    nota(avisos.join(' ') + ' ' + T('Es el valor efectivo de ese trozo (impresión 3D: depende del relleno y de la orientación de las capas), no del filamento. Llévalo a Chirptenna: Fabricar → Carcasa → material «Personalizado».'));
  };
}