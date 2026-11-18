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
// Niveles de ROE del modo Simple (de mejor a peor). `max` es el límite superior de cada región.
// «Aceptable» llega hasta ROE 2, que es el criterio de «bien adaptada» del modo Simple.
export const NIVELES_ROE = [
  { id: 'muy_bien', max: 1.5, etiqueta: 'Muy bien acoplada', consejo: 'Se puede usar con normalidad', color: '#2e9e5b' },
  { id: 'aceptable', max: 2, etiqueta: 'Aceptable', consejo: 'Se puede usar con normalidad', color: '#8bc34a' },
  { id: 'mejorable', max: 3, etiqueta: 'Mejorable', consejo: 'Transmitir poco y a potencia reducida', color: '#f0a30a' },
  { id: 'mal', max: Infinity, etiqueta: 'Mal acoplada', consejo: 'No transmitir salvo emergencias', color: '#d9534f' },
];
export const nivelROE = roe => NIVELES_ROE.find(n => roe <= n.max + 1e-9);
// Cómo se muestra la adaptación de un punto: 'roe' (modo Simple: lo que conoce todo el mundo, con su nivel) o 'rl' (pérdida de retorno y ROE).
export const textoAdaptacion = (p, unidad = 'rl') => unidad === 'roe'
  ? `ROE ${p.vswr.toFixed(2)}: ${nivelROE(p.vswr).etiqueta.toLowerCase()}`
  : `${p.rl.toFixed(1)} dB, VSWR ${p.vswr.toFixed(2)}`;
export const textoUmbral = (umbralDb, unidad = 'rl') => unidad === 'roe' ? `ROE de ${+roeDeRl(umbralDb).toFixed(2)} o mejor` : `pérdida de retorno de al menos ${umbralDb} dB`;

// Frase para explicar el criterio en ROE: porcentaje de potencia que se refleja con esa ROE como máximo.
export const explicacionROE = umbralDb => {
  const g = 10 ** (-umbralDb / 20);
  return `Con ese valor se refleja como máximo un ${(g * g * 100).toFixed(0)} % de la potencia hacia el equipo: suficiente para casi cualquier uso. ROE 1 sería la adaptación perfecta.`;
};

const fmtF = hz => hz >= 1e9 ? `${(hz / 1e9).toFixed(3)} GHz` : hz >= 1e6 ? `${(hz / 1e6).toFixed(2)} MHz` : `${(hz / 1e3).toFixed(1)} kHz`;

// ROE dentro de una banda [fMin, fMax] (Hz): mínima, máxima (la peor, la que manda para transmitir), dónde ocurren y qué fracción
// de la banda cumple el criterio. Si no hay ningún punto dentro (banda muy estrecha o frecuencia exacta) usa el más cercano.
export function estadisticaBanda({ freq, vswr, rl }, fMin, fMax, umbralDb) {
  let idx = [];
  for (let i = 0; i < freq.length; i++) if (freq[i] >= fMin && freq[i] <= fMax) idx.push(i);
  const sinPuntos = !idx.length;
  if (sinPuntos) idx = [indiceMasCercano(freq, (fMin + fMax) / 2)];
  let roeMin = Infinity, roeMax = 0, fMejor = 0, fPeor = 0, buenos = 0;
  for (const i of idx) {
    const v = Math.min(vswr[i], 99);
    if (v < roeMin) { roeMin = v; fMejor = freq[i]; }
    if (v > roeMax) { roeMax = v; fPeor = freq[i]; }
    if (rl[i] >= umbralDb) buenos++;
  }
  return { n: idx.length, sinPuntos, roeMin, roeMax, fMejor, fPeor, fracBuena: buenos / idx.length };
}

// Resonancia eléctrica: frecuencia donde la reactancia X cruza por cero cerca de `f` (Hz), dentro de ±`rango`.
// Devuelve { fX, tipo: 'serie' (X sube de − a +, la resonancia habitual) | 'paralelo', desv: fX/f − 1 } o null si no hay cruce.
// Ojo: el mínimo de ROE es donde mejor se adapta la antena a 50 Ω, y no tiene por qué coincidir con X = 0 (antenas cargadas,
// fractales, con adaptador o medidas a través de un cable).
export function reactanciaCero({ freq, zx }, f, rango = 0.12) {
  let mejor = null;
  for (let i = 1; i < freq.length; i++) {
    if (freq[i] < f / (1 + rango)) continue;
    if (freq[i - 1] > f * (1 + rango)) break;
    const a = zx[i - 1], b = zx[i];
    if (a === b || a * b > 0) continue;
    const fX = freq[i - 1] + (a / (a - b)) * (freq[i] - freq[i - 1]), d = Math.abs(Math.log(fX / f));
    if (!mejor || d < mejor.d) mejor = { fX, tipo: b > a ? 'serie' : 'paralelo', d };
  }
  return mejor && { fX: mejor.fX, tipo: mejor.tipo, desv: mejor.fX / f - 1 };
}
// Cruces de X = 0 (resonancia en serie) junto a los `n` mejores mínimos de ROE, para marcarlos en el gráfico. Sin duplicados.
export function marcasReactancia(medida, picos, n = 3) {
  const out = [];
  for (const p of picos.slice(0, n)) {
    const rx = reactanciaCero(medida, p.f);
    if (rx && rx.tipo === 'serie' && !out.some(o => Math.abs(Math.log(o.fX / rx.fX)) < 0.002)) out.push({ ...rx, fMin: p.f });
  }
  return out;
}
export const DESV_REACTANCIA = 0.025; // por encima de un 2,5 % se avisa de que mínimo de ROE y X = 0 no coinciden

// ¿La curva es demasiado irregular para decir «alarga/acorta un X %»? Sí si hay varios mínimos visibles a ambos lados del
// objetivo (varias resonancias cercanas, como en un fractal o una antena multibanda) o si la ROE oscila dentro de la banda.
// Devuelve null o { motivo, valles }.
export function curvaIrregular(medida, picos, { fMin, fMax }, umbralDb) {
  const fc = (fMin + fMax) / 2, cerca = Math.max(0.03, Math.log(fMax / fMin));
  const valles = picos.filter(p => Math.abs(Math.log(p.f / fc)) <= cerca && p.rl >= umbralDb - 6);
  if (valles.length >= 2) return { motivo: `Hay ${valles.length} mínimos de ROE a ambos lados del objetivo, a ${valles.map(p => fmtF(p.f)).join(' y ')}`, valles };
  const est = estadisticaBanda(medida, fMin, fMax, umbralDb);
  if (est.n >= 4 && est.roeMax / est.roeMin >= 1.25) {
    const { freq, vswr } = medida, lo = fMin / 1.02, hi = fMax * 1.02;
    // Mínimos locales de ROE; dos cuentan como distintos solo si entre ellos la ROE sube al menos un 10 % por encima del más alto
    // de los dos (así el ruido sobre un único valle no se toma por una curva irregular).
    const cand = [];
    for (let i = 1; i < freq.length - 1; i++) if (freq[i] >= lo && freq[i] <= hi && vswr[i] < vswr[i - 1] && vswr[i] <= vswr[i + 1]) cand.push(i);
    const reales = [];
    for (const i of cand) {
      const prev = reales[reales.length - 1];
      if (prev === undefined) { reales.push(i); continue; }
      let techo = 0;
      for (let k = prev; k <= i; k++) techo = Math.max(techo, vswr[k]);
      if (techo >= 1.1 * Math.max(vswr[prev], vswr[i])) reales.push(i);
      else if (vswr[i] < vswr[prev]) reales[reales.length - 1] = i; // mismo valle: se queda el más bajo
    }
    if (reales.length >= 2) return { motivo: 'La ROE sube y baja varias veces dentro de la propia banda', valles: [] };
  }
  return null;
}

// Líneas del modo Simple sobre la banda objetivo: ROE mínima y máxima, nivel de la peor y consejo de uso.
function lineasBanda(est, fMin, fMax, umbralDb) {
  const peor = nivelROE(est.roeMax);
  const l = [];
  if (est.sinPuntos || fMin === fMax) l.push(`A ${fmtF(est.fMejor)}: ROE ${est.roeMin.toFixed(2)} (${nivelROE(est.roeMin).etiqueta.toLowerCase()}).`);
  else l.push(`En la banda (${fmtF(fMin)} a ${fmtF(fMax)}): ROE entre ${est.roeMin.toFixed(2)} y ${est.roeMax.toFixed(2)}; en el peor punto, ${peor.etiqueta.toLowerCase()}.`);
  l.push(`${(est.sinPuntos || fMin === fMax ? nivelROE(est.roeMin) : peor).consejo}.`);
  if (!est.sinPuntos && fMin !== fMax && est.fracBuena < 1) {
    l.push(est.fracBuena > 0
      ? `Solo el ${(est.fracBuena * 100).toFixed(0)} % de la banda llega a ${textoUmbral(umbralDb, 'roe')}; la mejor frecuencia es ${fmtF(est.fMejor)} (ROE ${est.roeMin.toFixed(2)}).`
      : `Ninguna frecuencia de la banda llega a ${textoUmbral(umbralDb, 'roe')}; la mejor es ${fmtF(est.fMejor)} (ROE ${est.roeMin.toFixed(2)}).`);
  }
  return l;
}

// Indica si hay que alargar o cortar la antena para centrar su resonancia en la banda objetivo (Hz).
// En modo 'roe' (Simple) juzga la banda objetivo (peor punto) y avisa si la curva es irregular.
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
  const est = estadisticaBanda(medida, fMin, fMax, umbralDb);
  const intro = unidad === 'roe' ? lineasBanda(est, fMin, fMax, umbralDb) : [];
  if (!p) {
    const n = medida.freq.length, rl = medida.rl;
    const f0 = medida.freq[0], f1 = medida.freq[n - 1];
    const k = Math.max(3, Math.floor(n * 0.05));
    const media = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += rl[i]; return s / Math.max(1, b - a); };
    const bajo = media(0, k) - media(k, 2 * k), alto = media(n - k, n) - media(n - 2 * k, n - k);
    const lineas = [...intro, `No se ve ningún mínimo claro de S11 dentro del rango medido (${fmt(f0)} a ${fmt(f1)}).`];
    if (alto > 1 && alto >= bajo) lineas.push('La adaptación mejora hacia el extremo ALTO del rango: la antena probablemente resuena por encima. Sube el margen lateral o usa el barrido general.');
    else if (bajo > 1) lineas.push('La adaptación mejora hacia el extremo BAJO del rango: la antena probablemente resuena por debajo. Sube el margen lateral o usa el barrido general.');
    else lineas.push('Puede que resuene fuera del rango medido. Sube el margen lateral o usa el barrido general para buscarla.');
    lineas.push('Si no aparece en ningún sitio, comprueba la conexión del cable y la calibración.');
    return { accion: 'sin_resonancia', titulo: 'No resuena dentro del rango medido', lineas, est };
  }
  const pct = (p.f / fc - 1) * 100;
  const bien = p.rl >= umbralDb;
  const cubre = p.fLo != null && p.fLo <= fMin && p.fHi >= fMax;
  const lineas = [...intro, `Resonancia más cercana: ${fmt(p.f)} (${unidad === 'roe' ? `ROE ${p.vswr.toFixed(2)}` : textoAdaptacion(p, unidad)}). Objetivo: ${fmt(fc)}.`];
  const irreg = bien && cubre ? null : curvaIrregular(medida, picos, { fMin, fMax }, umbralDb);
  if (irreg) {
    lineas.push(`${irreg.motivo}.`);
    lineas.push('Con una curva así no se puede saber cuánto alargar o cortar: el porcentaje de longitud solo vale cuando hay una única resonancia.');
    lineas.push('Mide en la frecuencia exacta que vas a usar (objetivo «frecuencia personalizada»), y recuerda que mover el cable o la mano cambia el resultado.');
    return { accion: 'irregular', titulo: 'La curva es irregular: el ajuste por longitud no es fiable', lineas, est, irreg };
  }
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
  const rx = accion === 'ok' ? null : reactanciaCero(medida, p.f);
  if (rx && rx.tipo === 'serie' && Math.abs(rx.desv) > DESV_REACTANCIA) {
    lineas.push(`Ojo: la antena resuena eléctricamente (reactancia cero) a ${fmt(rx.fX)}, un ${(Math.abs(rx.desv) * 100).toFixed(1)} % ${rx.desv > 0 ? 'por encima' : 'por debajo'} de donde mejor se adapta (${fmt(p.f)}). Es habitual en antenas cargadas, fractales o con adaptador, pero el porcentaje de longitud puede no ser fiable: corta o alarga poco a poco y vuelve a medir.`);
  }
  lineas.push(nota);
  return { accion, titulo, lineas, fRes: p.f, pct, est, rx };
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
// ctx = { medida, obj } (opcional): en modo 'roe' con un objetivo, el resumen juzga la BANDA objetivo (su peor punto), no la
// mejor resonancia de todo el rango, que puede estar en otro sitio.
export function veredicto(picos, evaluacion, umbralDb, unidad = 'rl', ctx = null) {
  const fmt = fmtF;
  const buenos = evaluacion.filter(e => e.estado === 'ok');
  const parciales = evaluacion.filter(e => e.estado === 'parcial');
  const nombre = e => `${e.banda.servicio.toUpperCase()} ${e.banda.nombre}`;
  const mejor = picos[0];
  if (unidad === 'roe' && ctx?.medida && ctx.obj) {
    const { fMin, fMax, banda } = ctx.obj;
    const est = estadisticaBanda(ctx.medida, fMin, fMax, umbralDb);
    const puntual = est.sinPuntos || fMin === fMax;
    const peor = nivelROE(puntual ? est.roeMin : est.roeMax);
    const nom = banda && banda.servicio !== 'objetivo' ? `${banda.servicio.toUpperCase()} ${banda.nombre}` : fmt((fMin + fMax) / 2);
    const titulo = puntual
      ? `${nom}: ROE ${est.roeMin.toFixed(2)} (${peor.etiqueta.toLowerCase()}).`
      : `${nom}: ROE entre ${est.roeMin.toFixed(2)} y ${est.roeMax.toFixed(2)} (${peor.etiqueta.toLowerCase()} en el peor punto).`;
    const l = lineasBanda(est, fMin, fMax, umbralDb).slice(1); // consejo (y, si procede, qué parte de la banda es buena)
    if (mejor && (mejor.f < fMin || mejor.f > fMax)) l.push(`La antena resuena mejor en ${fmt(mejor.f)} (ROE ${mejor.vswr.toFixed(2)}), fuera de esta banda.`);
    else if (mejor && mejor.fLo != null && !puntual) l.push(`Ancho de banda con ${textoUmbral(umbralDb, unidad)}: ${fmt(mejor.fHi - mejor.fLo)} (${fmt(mejor.fLo)} a ${fmt(mejor.fHi)}).`);
    if (est.fracBuena < 1 && curvaIrregular(ctx.medida, picos, { fMin, fMax }, umbralDb)) l.push('La curva es irregular (varios mínimos): no te fíes de un solo punto y mide la frecuencia exacta que vas a usar.');
    l.push(`Criterio: ${textoUmbral(umbralDb, unidad)}. ${explicacionROE(umbralDb)}`);
    return { titulo, lineas: l };
  }
  const lineas = [];
  let titulo;
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
  if (unidad === 'roe') lineas.push(`Criterio: ${textoUmbral(umbralDb, unidad)}. ${explicacionROE(umbralDb)}`, 'El resultado de cada banda (y si se puede usar) está en la tabla de bandas.');
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
    let n = 0, buenos = 0, mejor = -Infinity, fMejor = null, vMejor = null, peorV = 0, fPeor = null;
    for (let i = 0; i < freq.length; i++) {
      if (freq[i] < f0 || freq[i] > f1) continue;
      n++;
      if (rl[i] >= umbralDb) buenos++;
      if (rl[i] > mejor) { mejor = rl[i]; fMejor = freq[i]; vMejor = vswr[i]; }
      if (vswr[i] > peorV) { peorV = Math.min(vswr[i], 99); fPeor = freq[i]; }
    }
    if (n === 0) return { banda: b, estado: 'sin_datos' };
    const frac = buenos / n;
    return { banda: b, estado: frac >= 0.9 ? 'ok' : frac > 0 ? 'parcial' : 'no', frac, puntos: n, mejorRl: mejor, fMejor, vMejor, peorVswr: peorV, fPeor };
  });
}
