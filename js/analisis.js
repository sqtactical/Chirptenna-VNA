// Analisis de S11: perdida de retorno, VSWR, resonancias y evaluacion por banda.
// Sin dependencias del DOM (se puede probar con Node).

const Z0 = 50;

// Parametros derivados de S11. Z = Z0 (1+G)/(1-G). fase en grados. retardo de grupo en ns.
export function calcular({ freq, re, im }) {
  const n = freq.length;
  const rl = new Float64Array(n), vswr = new Float64Array(n), mag = new Float64Array(n);
  const fase = new Float64Array(n), zr = new Float64Array(n), zx = new Float64Array(n), retardo = new Float64Array(n);
  const desenv = new Float64Array(n);
  let fasePrev = 0;
  for (let i = 0; i < n; i++) {
    const g = Math.hypot(re[i], im[i]);
    mag[i] = 20 * Math.log10(Math.max(g, 1e-6));
    rl[i] = -mag[i];
    const gc = Math.min(g, 0.999999);
    vswr[i] = (1 + gc) / (1 - gc);
    fase[i] = (Math.atan2(im[i], re[i]) * 180) / Math.PI;
    const den = Math.max((1 - re[i]) ** 2 + im[i] ** 2, 1e-9);
    zr[i] = (Z0 * (1 - re[i] ** 2 - im[i] ** 2)) / den;
    zx[i] = (Z0 * 2 * im[i]) / den;
    // fase desenvuelta (rad) para el retardo de grupo
    const f = Math.atan2(im[i], re[i]);
    if (i === 0) desenv[i] = f;
    else {
      const d = f - fasePrev;
      desenv[i] = desenv[i - 1] + (d - 2 * Math.PI * Math.round(d / (2 * Math.PI)));
    }
    fasePrev = f;
  }
  for (let i = 1; i < n - 1; i++) {
    const df = freq[i + 1] - freq[i - 1];
    retardo[i] = df > 0 ? (-(desenv[i + 1] - desenv[i - 1]) / (2 * Math.PI * df)) * 1e9 : 0;
  }
  if (n > 2) { retardo[0] = retardo[1]; retardo[n - 1] = retardo[n - 2]; }
  return { freq, re, im, rl, vswr, mag, fase, zr, zx, retardo };
}

export function indiceMasCercano(freq, f) {
  let lo = 0, hi = freq.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; freq[m] < f ? (lo = m) : (hi = m); }
  return Math.abs(freq[lo] - f) <= Math.abs(freq[hi] - f) ? lo : hi;
}

// Equivalente en serie de la reactancia en un punto: bobina (X>0) o condensador (X<0).
export function equivalenteReactivo(f, x) {
  if (Math.abs(x) < 1e-9) return null;
  return x > 0 ? { tipo: 'L', valor: x / (2 * Math.PI * f) } : { tipo: 'C', valor: -1 / (2 * Math.PI * f * x) };
}

// ROE (VSWR) equivalente a una pérdida de retorno en dB.
export const roeDeRl = db => (1 + 10 ** (-db / 20)) / (1 - 10 ** (-db / 20));
// Cómo se muestra la adaptación de un punto: 'roe' (modo Simple: lo que conoce todo el mundo) o 'rl' (pérdida de retorno y ROE).
export const textoAdaptacion = (p, unidad = 'rl') => unidad === 'roe' ? `ROE ${p.vswr.toFixed(2)}` : `${p.rl.toFixed(1)} dB, VSWR ${p.vswr.toFixed(2)}`;
export const textoUmbral = (umbralDb, unidad = 'rl') => unidad === 'roe' ? `ROE de ${+roeDeRl(umbralDb).toFixed(2)} o mejor` : `pérdida de retorno de al menos ${umbralDb} dB`;

// Frase para explicar el criterio en ROE: porcentaje de potencia que se refleja con esa ROE como máximo.
export const explicacionROE = umbralDb => {
  const g = 10 ** (-umbralDb / 20);
  return `Con ese valor se refleja como máximo un ${(g * g * 100).toFixed(0)} % de la potencia hacia el equipo: suficiente para casi cualquier uso. ROE 1 sería la adaptación perfecta.`;
};

// Indica si hay que alargar o cortar la antena para centrar su resonancia en la banda objetivo (Hz).
export function recomendacion(medida, picos, { fMin, fMax }, umbralDb, unidad = 'rl') {
  const fmt = hz => hz >= 1e9 ? `${(hz / 1e9).toFixed(3)} GHz` : hz >= 1e6 ? `${(hz / 1e6).toFixed(2)} MHz` : `${(hz / 1e3).toFixed(1)} kHz`;
  const fc = (fMin + fMax) / 2;
  const ic = indiceMasCercano(medida.freq, fc);
  const zr = medida.zr[ic], zx = medida.zx[ic];
  const cand = picos
    .filter(p => p.f >= fc / 2 && p.f <= fc * 2)
    .sort((a, b) => Math.abs(Math.log(a.f / fc)) - Math.abs(Math.log(b.f / fc)));
  const p = cand[0];
  const nota = 'Estimación de primer orden (la longitud es inversamente proporcional a la frecuencia). Tras cada cambio vuelve a medir; en antenas cargadas, fractales o con plano de masa el efecto real puede diferir.';
  if (!p) {
    const n = medida.freq.length, rl = medida.rl;
    const f0 = medida.freq[0], f1 = medida.freq[n - 1];
    const k = Math.max(3, Math.floor(n * 0.05));
    const media = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += rl[i]; return s / Math.max(1, b - a); };
    const bajo = media(0, k) - media(k, 2 * k), alto = media(n - k, n) - media(n - 2 * k, n - k);
    const lineas = [`No se ve ningún mínimo claro de S11 dentro del rango medido (${fmt(f0)} a ${fmt(f1)}).`];
    if (alto > 1 && alto >= bajo) lineas.push('La adaptación mejora hacia el extremo ALTO del rango: la antena probablemente resuena por encima. Sube el margen lateral o usa el barrido general.');
    else if (bajo > 1) lineas.push('La adaptación mejora hacia el extremo BAJO del rango: la antena probablemente resuena por debajo. Sube el margen lateral o usa el barrido general.');
    else lineas.push('Puede que resuene fuera del rango medido. Sube el margen lateral o usa el barrido general para buscarla.');
    lineas.push('Si no aparece en ningún sitio, comprueba la conexión del cable y la calibración.');
    return { accion: 'sin_resonancia', titulo: 'No resuena dentro del rango medido', lineas };
  }
  const pct = (p.f / fc - 1) * 100;
  const bien = p.rl >= umbralDb;
  const cubre = p.fLo != null && p.fLo <= fMin && p.fHi >= fMax;
  const lineas = [`Resonancia más cercana: ${fmt(p.f)} (${textoAdaptacion(p, unidad)}). Objetivo: ${fmt(fc)}.`];
  let accion, titulo;
  if (bien && cubre) {
    accion = 'ok';
    titulo = `La antena cubre la banda objetivo (${fmt(fMin)} a ${fmt(fMax)})`;
    lineas.push(`Ancho de banda útil: ${fmt(p.fHi - p.fLo)} (${fmt(p.fLo)} a ${fmt(p.fHi)}).`);
  } else if (Math.abs(pct) < 1) {
    if (!bien) {
      accion = 'adaptacion';
      titulo = 'Resuena en la frecuencia correcta pero está mal adaptada';
      lineas.push(`A la resonancia, Z ≈ ${zr.toFixed(0)} Ω frente a 50 Ω. No es un problema de longitud: revisa el punto de alimentación o añade un adaptador de impedancia.`);
    } else {
      accion = 'estrecha';
      titulo = 'Está centrada pero su ancho de banda no cubre toda la banda';
      lineas.push(`Ancho de banda actual ${fmt(p.fHi - p.fLo)}; la banda objetivo necesita ${fmt(fMax - fMin)}.`);
      lineas.push('Para ensanchar: elementos más anchos o gruesos, o una geometría de banda ancha (bowtie, etc.).');
    }
  } else if (pct > 0) {
    accion = 'alargar';
    titulo = `Alarga la antena un ${pct.toFixed(1)} %`;
    lineas.push(`Resuena demasiado alto: la antena es eléctricamente corta. Multiplica sus dimensiones por ${(p.f / fc).toFixed(3)}.`);
  } else {
    accion = 'cortar';
    titulo = `Acorta la antena un ${(-pct).toFixed(1)} %`;
    lineas.push(`Resuena demasiado bajo: la antena es eléctricamente larga. Multiplica sus dimensiones por ${(p.f / fc).toFixed(3)}.`);
  }
  if (accion === 'alargar' || accion === 'cortar') {
    if (!bien) lineas.push(`La adaptación en la resonancia es baja (${unidad === 'roe' ? `ROE ${p.vswr.toFixed(2)}` : `${p.rl.toFixed(1)} dB`}): tras ajustar la longitud, revisa también la alimentación.`);
    const inductiva = zx > 0;
    const coincide = (accion === 'cortar') === inductiva;
    lineas.push(`A ${fmt(fc)} la antena presenta Z = ${zr.toFixed(1)} ${zx >= 0 ? '+' : '-'} j${Math.abs(zx).toFixed(1)} Ω (${inductiva ? 'inductiva' : 'capacitiva'}): ${coincide ? 'coincide con ese diagnóstico.' : 'no coincide con el diagnóstico; es normal en antenas que no son tipo dipolo o monopolo. Fíate más de la frecuencia de resonancia.'}`);
    if (Math.abs(pct) > 25) lineas.push('El cambio es grande: hazlo en dos pasos y mide entre ellos.');
  }
  lineas.push(nota);
  return { accion, titulo, lineas, fRes: p.f, pct };
}

// Anade el indice a cada resonancia para poder situar el cursor.

// Maximos locales de perdida de retorno (= minimos de S11) con prominencia minima.
export function resonancias({ freq, rl, vswr }, umbralDb = 10, prominenciaDb = 3) {
  const n = freq.length, out = [], cand = [];
  // Prominencia topografica: a cada lado se baja desde el maximo hasta encontrar un punto MAS ALTO
  // (o hasta el limite de +-10 % de frecuencia, para que funcione igual con barridos densos o escasos).
  // La prominencia es la altura sobre el mas alto de los dos valles. Asi un rizado de ruido en la falda de
  // una resonancia grande (su valle hacia ella es casi plano) no cuenta como resonancia, aunque el otro
  // lado baje mucho. Luego se descartan maximos duplicados a menos de un 3 %.
  for (let i = 1; i < n - 1; i++) {
    if (!(rl[i] >= rl[i - 1] && rl[i] > rl[i + 1])) continue;
    let minIzq = rl[i], minDer = rl[i];
    for (let j = i - 1; j >= 0 && freq[j] >= freq[i] / 1.1 && rl[j] <= rl[i]; j--) minIzq = Math.min(minIzq, rl[j]);
    for (let j = i + 1; j < n && freq[j] <= freq[i] * 1.1 && rl[j] <= rl[i]; j++) minDer = Math.min(minDer, rl[j]);
    if (rl[i] - Math.max(minIzq, minDer) >= prominenciaDb) cand.push(i);
  }
  cand.sort((a, b) => rl[b] - rl[a]);
  const keep = [];
  for (const i of cand) if (!keep.some(k => Math.abs(Math.log(freq[i] / freq[k])) < 0.03)) keep.push(i);
  for (const i of keep) {
    let lo = i, hi = i;
    if (rl[i] >= umbralDb) {
      while (lo > 0 && rl[lo - 1] >= umbralDb) lo--;
      while (hi < n - 1 && rl[hi + 1] >= umbralDb) hi++;
    }
    out.push({
      i, f: freq[i], rl: rl[i], vswr: vswr[i],
      fLo: rl[i] >= umbralDb ? freq[lo] : null,
      fHi: rl[i] >= umbralDb ? freq[hi] : null,
    });
  }
  return out.sort((a, b) => b.rl - a.rl);
}

// Maximos locales que NO llegan a resonancia (poca prominencia) pero que conviene mostrar marcados como
// "posiblemente falsa": normalmente ruido o rizado en la falda de una resonancia real, o un cable/conector.
// No se usan para la recomendacion, el veredicto ni el afinado. Solo se listan los de rl >= minRlDb.
export function resonanciasDudosas({ freq, rl, vswr }, picos, { max = 5, minRlDb = 3 } = {}) {
  const n = freq.length, cand = [];
  for (let i = 1; i < n - 1; i++) {
    if (!(rl[i] >= rl[i - 1] && rl[i] > rl[i + 1]) || rl[i] < minRlDb) continue;
    if (picos.some(p => Math.abs(Math.log(freq[i] / p.f)) < 0.015)) continue;
    cand.push(i);
  }
  cand.sort((a, b) => rl[b] - rl[a]);
  const keep = [];
  for (const i of cand) if (!keep.some(k => Math.abs(Math.log(freq[i] / freq[k])) < 0.03)) keep.push(i);
  return keep.slice(0, max).map(i => {
    const cerca = picos.filter(p => p.rl > rl[i] && Math.abs(Math.log(freq[i] / p.f)) < 0.1)
      .sort((a, b) => Math.abs(Math.log(freq[i] / a.f)) - Math.abs(Math.log(freq[i] / b.f)))[0];
    return {
      i, f: freq[i], rl: rl[i], vswr: vswr[i], dudosa: true,
      motivo: cerca ? 'rizado en la falda de la resonancia principal, probablemente ruido' : 'muy poco marcada, probablemente ruido o un artefacto de la medida',
      cercaDe: cerca ? cerca.f : null,
    };
  }).sort((a, b) => a.f - b.f);
}

// Ventanas donde conviene remedir con mas detalle: alrededor de las resonancias y en las bandas sin puntos.
export function ventanasAfinado(picos, evaluacion, fIni, fFin, { maxPicos = 4, minRlDb = 6 } = {}) {
  const v = [];
  for (const p of picos.filter(p => p.rl >= minRlDb).slice(0, maxPicos)) {
    const ancho = p.fLo != null ? 1.5 * (p.fHi - p.fLo) : 0;
    const medio = Math.max(0.03 * p.f, ancho);
    v.push({ lo: p.f - medio, hi: p.f + medio, puntos: 201, motivo: 'resonancia' });
  }
  for (const e of evaluacion.filter(e => e.estado === 'sin_datos')) {
    const f0 = e.banda.f_min * 1e6, f1 = e.banda.f_max * 1e6, pad = (f1 - f0) * 0.05;
    v.push({ lo: f0 - pad, hi: f1 + pad, puntos: 101, motivo: `banda ${e.banda.nombre}` });
  }
  return v
    .map(w => ({ ...w, lo: Math.max(w.lo, fIni), hi: Math.min(w.hi, fFin) }))
    .filter(w => w.hi - w.lo > 1000);
}

// Sustituye en `crudo` los puntos que caen dentro del rango de `nuevo` por los nuevos, manteniendo el orden.
export function fusionar(crudo, nuevo) {
  const lo = nuevo.freq[0], hi = nuevo.freq[nuevo.freq.length - 1];
  const f = [], r = [], i = [];
  for (let k = 0; k < crudo.freq.length; k++) {
    if (crudo.freq[k] >= lo && crudo.freq[k] <= hi) continue;
    f.push(crudo.freq[k]); r.push(crudo.re[k]); i.push(crudo.im[k]);
  }
  for (let k = 0; k < nuevo.freq.length; k++) { f.push(nuevo.freq[k]); r.push(nuevo.re[k]); i.push(nuevo.im[k]); }
  const idx = f.map((_, k) => k).sort((a, b) => f[a] - f[b]);
  return { freq: Float64Array.from(idx, k => f[k]), re: Float64Array.from(idx, k => r[k]), im: Float64Array.from(idx, k => i[k]) };
}

// Resumen en lenguaje sencillo para la UI y el PDF.
export function veredicto(picos, evaluacion, umbralDb, unidad = 'rl') {
  const fmt = hz => hz >= 1e9 ? `${(hz / 1e9).toFixed(3)} GHz` : hz >= 1e6 ? `${(hz / 1e6).toFixed(2)} MHz` : `${(hz / 1e3).toFixed(1)} kHz`;
  const buenos = evaluacion.filter(e => e.estado === 'ok');
  const parciales = evaluacion.filter(e => e.estado === 'parcial');
  const nombre = e => `${e.banda.servicio.toUpperCase()} ${e.banda.nombre}`;
  const lineas = [];
  let titulo;
  const mejor = picos[0];
  if (!mejor || mejor.rl < umbralDb) {
    titulo = 'La antena no está bien adaptada en ninguna frecuencia del rango medido.';
    if (mejor) lineas.push(`La mejor adaptación es ${textoAdaptacion(mejor, unidad)} a ${fmt(mejor.f)}, peor que el mínimo exigido (${textoUmbral(umbralDb, unidad)}).`);
    lineas.push('Revisa el conector, el cable y la calibración antes de concluir que la antena es defectuosa.');
  } else {
    titulo = `Resuena a ${fmt(mejor.f)} (${textoAdaptacion(mejor, unidad)}).`;
    if (mejor.fLo != null) lineas.push(`Ancho de banda con ${textoUmbral(umbralDb, unidad)}: ${fmt(mejor.fHi - mejor.fLo)} (${fmt(mejor.fLo)} a ${fmt(mejor.fHi)}).`);
    const otros = picos.slice(1).filter(p => p.rl >= umbralDb);
    if (otros.length) lineas.push(`Otras resonancias: ${otros.slice(0, 4).map(p => `${fmt(p.f)} (${unidad === 'roe' ? `ROE ${p.vswr.toFixed(2)}` : `${p.rl.toFixed(1)} dB`})`).join(', ')}.`);
  }
  if (unidad === 'roe') lineas.push(`Criterio: ${textoUmbral(umbralDb, unidad)}. ${explicacionROE(umbralDb)}`);
  lineas.push(buenos.length ? `Cubre por completo: ${buenos.map(nombre).join(', ')}.` : 'No cubre por completo ninguna banda de la lista.');
  if (parciales.length) lineas.push(`Cubre parte de: ${parciales.map(nombre).join(', ')}.`);
  return { titulo, lineas };
}

const REGIONES = {
  eu: ['R1', 'EU', 'global'],
  us: ['R2', 'US', 'global'],
  todas: null,
};

export function bandasDeRegion(bandas, region) {
  const ok = REGIONES[region];
  return bandas.filter(b => !ok || b.region.some(r => ok.includes(r)));
}

// estado: ok (>=90% de los puntos de la banda cumplen), parcial, no, sin_datos (ningun punto cae dentro), fuera (el equipo no llega)
export function evaluarBandas({ freq, rl, vswr }, bandas, umbralDb, fMaxEquipoHz) {
  return bandas.map(b => {
    const f0 = b.f_min * 1e6, f1 = b.f_max * 1e6;
    if (f0 > fMaxEquipoHz || freq[0] > f1 || freq[freq.length - 1] < f0) return { banda: b, estado: 'fuera' };
    let n = 0, buenos = 0, mejor = -Infinity, fMejor = null, vMejor = null;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < f0 || freq[i] > f1) continue;
      n++;
      if (rl[i] >= umbralDb) buenos++;
      if (rl[i] > mejor) { mejor = rl[i]; fMejor = freq[i]; vMejor = vswr[i]; }
    }
    if (n === 0) return { banda: b, estado: 'sin_datos' };
    const frac = buenos / n;
    return { banda: b, estado: frac >= 0.9 ? 'ok' : frac > 0 ? 'parcial' : 'no', frac, puntos: n, mejorRl: mejor, fMejor, vMejor };
  });
}
