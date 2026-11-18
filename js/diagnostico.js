// Diagnostico con el equipo real: comprueba lo que el driver da por supuesto y devuelve un informe de texto
// para pegarlo en una incidencia. Solo lee, salvo el paso "ida y vuelta en bruto", que hace `cal off` / `cal on` /
// `sweep` y lo restaura (igual que vna/calibracion.py). NUNCA envia `save`.

const MAXIMO_PROBADO = [101, 201, 401]; // puntos por scan que se intentan para ver el limite real del firmware

const esFilaScan = l => /^\d+\s+-?[\d.eE+-]+\s+-?[\d.eE+-]+(\s+-?[\d.eE+-]+\s+-?[\d.eE+-]+)?$/.test(l.trim());
const limpio = t => t.split(/\r?\n/).map(s => s.trim()).filter(l => l && l !== 'ch>');
const sinEco = (t, cmd) => limpio(t).filter(l => l !== cmd);

// Cada paso devuelve { ok: boolean|null, texto, datos? }. ok === null = informativo.
export async function ejecutarDiagnostico(drv, { bruto = false, onPaso = () => {} } = {}) {
  const pasos = [];
  const hayShell = typeof drv._cmd === 'function'; // el controlador simulado no tiene shell
  const reg = async (nombre, fn) => {
    const t0 = performance.now();
    let r;
    try { r = await fn(); } catch (e) { r = { ok: false, texto: `Error: ${e.message}${e.codigo ? ` [${e.codigo}]` : ''}` }; }
    r.nombre = nombre; r.ms = Math.round(performance.now() - t0);
    pasos.push(r); onPaso(r);
    return r;
  };

  await reg('Identificación', async () => ({
    ok: true,
    texto: `version: ${drv.version || '(vacía)'}${drv.aviso ? `\nAVISO: ${drv.aviso}` : ''}`,
  }));

  if (!hayShell) await reg('Shell del equipo', async () => ({ ok: null, texto: 'Controlador simulado: no hay shell que probar (info, cal, sweep, límite de puntos y ida y vuelta en bruto se omiten).' }));
  if (hayShell) await reg('Comando info', async () => {
    const l = sinEco(await drv._cmd('info', 3000), 'info');
    return { ok: null, texto: l.length ? l.join('\n') : '(sin respuesta útil; no pasa nada, es informativo)' };
  });

  let sweepInicial = null, calInicial = null;
  if (hayShell) await reg('Estado de calibración y barrido del equipo', async () => {
    calInicial = sinEco(await drv._cmd('cal', 3000), 'cal').join(' ');
    const s = sinEco(await drv._cmd('sweep', 3000), 'sweep').join(' ');
    const m = s.match(/(\d+)\s+(\d+)\s+(\d+)/);
    sweepInicial = m ? [m[1], m[2], m[3]] : null;
    return {
      ok: !!m && /cal'ed|cal/i.test(calInicial),
      texto: `cal → «${calInicial}» (se detecta como ${/cal'ed/i.test(calInicial) ? 'ACTIVA' : 'no activa'})\nsweep → «${s}» (${m ? 'formato reconocido' : 'FORMATO NO RECONOCIDO: la restauración del barrido no funcionaría'})`,
    };
  });

  await reg('scan de 11 puntos (50 kHz – 2,7 GHz)', async () => {
    const r = await drv.scan(drv.fMinHz, drv.fMaxHz, 11, () => {}, 'lineal');
    const raros = [...r.freq].filter(f => !(f > 0)).length;
    return { ok: raros === 0 && r.freq[10] > r.freq[0], texto: `11 puntos recibidos; f = ${(r.freq[0] / 1e6).toFixed(3)} … ${(r.freq[10] / 1e6).toFixed(3)} MHz; |S11| punto 5 = ${Math.hypot(r.re[5], r.im[5]).toFixed(3)}` };
  });

  if (hayShell) await reg('Límite de puntos por scan', async () => {
    const res = [];
    let max = 0;
    for (const n of MAXIMO_PROBADO) {
      const t = await drv._cmd(`scan 1000000 100000000 ${n} 7`, 20000);
      const filas = limpio(t).filter(esFilaScan).length;
      res.push(`${n} pedidos → ${filas} filas`);
      if (filas === n) max = n; else break;
    }
    try { await drv._cmd('resume', 3000); } catch {}
    return { ok: max >= 101, texto: `${res.join(' · ')}\nLímite comprobado ≥ ${max} (el driver usa ${drv.puntosPorBloque}).`, datos: { max } };
  });

  await reg('Barrido de 3000 puntos (30 scans encadenados)', async () => {
    const t0 = performance.now();
    const r = await drv.scan(drv.fMinHz, drv.fMaxHz, 3000, () => {}, 'log');
    const s = (performance.now() - t0) / 1000;
    let mono = true; for (let i = 1; i < r.freq.length; i++) if (!(r.freq[i] > r.freq[i - 1])) { mono = false; break; }
    return { ok: mono && r.freq.length === 3000, texto: `${s.toFixed(1)} s (${(s / Math.ceil(3000 / (drv.puntosPorBloque || 101)) * 1000).toFixed(0)} ms por scan); frecuencias ${mono ? 'crecientes' : 'NO crecientes'}`, datos: { segundos: s } };
  });

  await reg('Repetibilidad (dos barridos seguidos, 101 puntos, sin tocar nada)', async () => {
    const a = await drv.scan(1e6, 1e9, 101, () => {}, 'lineal'), b = await drv.scan(1e6, 1e9, 101, () => {}, 'lineal');
    let s2 = 0, n = 0;
    for (let i = 0; i < 101; i++) {
      const m = Math.hypot(a.re[i], a.im[i]) || 1e-9, mb = Math.hypot(b.re[i], b.im[i]) || 1e-9;
      const d = 20 * Math.log10(mb / m); s2 += d * d; n++;
    }
    const rms = Math.sqrt(s2 / n);
    return { ok: rms < 0.5, texto: `diferencia RMS de |S11| entre dos barridos: ${rms.toFixed(3)} dB (esperable < 0,1 dB con la antena quieta)`, datos: { rms } };
  });

  if (bruto && hayShell) {
    await reg('Ida y vuelta en bruto (cal off → scan → cal on → sweep)', async () => {
      const antes = { cal: sinEco(await drv._cmd('cal', 3000), 'cal').join(' '), sweep: sinEco(await drv._cmd('sweep', 3000), 'sweep').join(' ') };
      const r = await drv.scan(1e6, 100e6, 51, () => {}, 'lineal', { bruto: true });
      const despues = { cal: sinEco(await drv._cmd('cal', 3000), 'cal').join(' '), sweep: sinEco(await drv._cmd('sweep', 3000), 'sweep').join(' ') };
      const igual = antes.cal === despues.cal && antes.sweep === despues.sweep;
      return {
        ok: igual && r.freq.length === 51,
        texto: `antes:   cal «${antes.cal}» · sweep «${antes.sweep}»\ndespués: cal «${despues.cal}» · sweep «${despues.sweep}»\n${igual ? 'El equipo quedó EXACTAMENTE como estaba.' : 'EL EQUIPO NO QUEDÓ IGUAL: revísalo y avisa.'}`,
      };
    });
  }

  if (hayShell) await reg('Estado final', async () => {
    const cal = sinEco(await drv._cmd('cal', 3000), 'cal').join(' ');
    const s = sinEco(await drv._cmd('sweep', 3000), 'sweep').join(' ');
    const igual = cal === calInicial && (!sweepInicial || s.startsWith(sweepInicial.join(' ')));
    return { ok: igual, texto: `cal «${cal}» · sweep «${s}» — ${igual ? 'igual que al empezar' : 'DISTINTO al inicial (cal «' + calInicial + '», sweep ' + (sweepInicial || []).join(' ') + ')'}` };
  });

  return { pasos, resumen: informeTexto(drv, pasos) };
}

export function informeTexto(drv, pasos) {
  const marca = p => (p.ok === true ? '[OK]  ' : p.ok === false ? '[FALLA]' : '[INFO]');
  const nfallos = pasos.filter(p => p.ok === false).length;
  return [
    `Diagnóstico de Chirptenna VNA — ${new Date().toISOString()}`,
    `Equipo: ${drv.nombre} · ${drv.version || '?'} · navegador: ${typeof navigator !== 'undefined' ? (navigator.userAgent || '?') : 'node'}`,
    `Resultado: ${nfallos ? `${nfallos} paso(s) con fallo` : 'todo correcto'}`,
    '',
    ...pasos.map(p => `${marca(p)} ${p.nombre} (${p.ms} ms)\n${p.texto.split('\n').map(l => '      ' + l).join('\n')}`),
  ].join('\n');
}
