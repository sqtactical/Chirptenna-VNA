import { T } from './i18n.js';
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
// Por encima de ROE 50 (pérdida de retorno < 0,35 dB) no se da el número: casi todo se refleja y el valor exacto no dice nada
// (un circuito abierto, un cable suelto o una antena muy desacoplada salen igual). Se escribe «> 50».
export const ROE_MAX_MOSTRADO = 50;
export const fmtROE = x => x > ROE_MAX_MOSTRADO ? `> ${ROE_MAX_MOSTRADO}` : x.toFixed(2);
// Niveles de ROE del modo Simple (de mejor a peor). `max` es el límite superior de cada región.
// «Aceptable» llega hasta ROE 2, que es el criterio de «bien adaptada» del modo Simple.
export const NIVELES_ROE = [
  { id: 'muy_bien', max: 1.5, etiqueta: T('Muy bien acoplada'), consejo: T('Se puede usar con normalidad'), color: '#2e9e5b' },
  { id: 'aceptable', max: 2, etiqueta: T('Aceptable'), consejo: T('Se puede usar con normalidad'), color: '#8bc34a' },
  { id: 'mejorable', max: 3, etiqueta: T('Mejorable'), consejo: T('Transmitir poco y a potencia reducida'), color: '#f0a30a' },
  { id: 'mal', max: Infinity, etiqueta: T('Mal acoplada'), consejo: T('No transmitir salvo emergencias'), color: '#d9534f' },
];
export const nivelROE = roe => NIVELES_ROE.find(n => roe <= n.max + 1e-9);
// Cómo se muestra la adaptación de un punto: 'roe' (modo Simple: lo que conoce todo el mundo, con su nivel) o 'rl' (pérdida de retorno y ROE).
export const textoAdaptacion = (p, unidad = 'rl') => unidad === 'roe'
  ? T('ROE {0}: {1}', fmtROE(p.vswr), nivelROE(p.vswr).etiqueta.toLowerCase())
  : T('{0} dB, VSWR {1}', p.rl.toFixed(1), fmtROE(p.vswr));
export const textoUmbral = (umbralDb, unidad = 'rl') => unidad === 'roe' ? T('ROE de {0} o mejor', +roeDeRl(umbralDb).toFixed(2)) : T('pérdida de retorno de al menos {0} dB', umbralDb);

// Frase para explicar el criterio en ROE: porcentaje de potencia que se refleja con esa ROE como máximo.
export const explicacionROE = umbralDb => {
  const g = 10 ** (-umbralDb / 20);
  return T('Con ese valor se refleja como máximo un {0} % de la potencia hacia el equipo: suficiente para casi cualquier uso. ROE 1 sería la adaptación perfecta.', (g * g * 100).toFixed(0));
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
  if (valles.length >= 2) return { motivo: T('Hay {0} mínimos de ROE a ambos lados del objetivo, a {1}', valles.length, valles.map(p => fmtF(p.f)).join(' y ')), valles };
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
    if (reales.length >= 2) return { motivo: T('La ROE sube y baja varias veces dentro de la propia banda'), valles: [] };
  }
  return null;
}

// Un objetivo «puntual»: una frecuencia exacta o un tramo diminuto (p. ej. los 3 kHz de una señal FT8), que se juzga por un valor, no por un rango.
const esPuntual = (est, fMin, fMax) => est.sinPuntos || fMin === fMax || (fMax - fMin) / ((fMin + fMax) / 2) < 0.001;

// Líneas del modo Simple sobre la banda objetivo: ROE mínima y máxima, nivel de la peor y consejo de uso.
function lineasBanda(est, fMin, fMax, umbralDb) {
  const puntual = esPuntual(est, fMin, fMax);
  const peor = nivelROE(est.roeMax);
  const l = [];
  if (puntual) l.push(T('A {0}: ROE {1} ({2}).', fmtF(est.fMejor), fmtROE(est.roeMin), nivelROE(est.roeMin).etiqueta.toLowerCase()));
  else if (est.roeMin > ROE_MAX_MOSTRADO) l.push(T('En toda la banda ({0} a {1}): ROE {2}; mal acoplada.', fmtF(fMin), fmtF(fMax), fmtROE(est.roeMin)));
  else l.push(T('En la banda ({0} a {1}): ROE entre {2} y {3}; en el peor punto, {4}.', fmtF(fMin), fmtF(fMax), fmtROE(est.roeMin), fmtROE(est.roeMax), peor.etiqueta.toLowerCase()));
  l.push(`${(puntual ? nivelROE(est.roeMin) : peor).consejo}.`);
  if (est.roeMin > ROE_MAX_MOSTRADO) {
    l.push(T('No entra casi nada de potencia en ningún punto de la banda. Si la antena no está conectada (circuito abierto) o el cable está suelto, sale exactamente igual: comprueba la conexión antes de tocar la antena.'));
  } else if (!puntual && est.fracBuena < 1) {
    l.push(est.fracBuena > 0
      ? T('Solo el {0} % de la banda llega a {1}; la mejor frecuencia es {2} (ROE {3}).', (est.fracBuena * 100).toFixed(0), textoUmbral(umbralDb, 'roe'), fmtF(est.fMejor), fmtROE(est.roeMin))
      : T('Ninguna frecuencia de la banda llega a {0}; la mejor es {1} (ROE {2}).', textoUmbral(umbralDb, 'roe'), fmtF(est.fMejor), fmtROE(est.roeMin)));
  }
  return l;
}

// ---------- Segmentos por modo en HF (CW, fonía, digitales, FT8...) ----------
// cfg = contenido de segmentos_hf.json. region = valor del selector ('eu' | 'us' | 'ap' | 'todas'). Devuelve [] si la banda no tiene segmentos.
export function segmentosDeBanda(cfg, banda, region) {
  const datos = cfg?.bandas?.[banda?.nombre];
  if (!datos) return [];
  const clave = region === 'eu' ? 'R1' : region === 'us' ? 'US' : region === 'ap' ? 'R3' : (banda.region.includes('R1') || banda.region.includes('global') ? 'R1' : 'US');
  const lista = (datos[clave] ?? []).map(s => ({ ...s }));
  const dig = cfg.digitales?.[banda.nombre] ?? {}, ancho = cfg.ancho_senal_digital_MHz ?? 0.003;
  const nombres = { ft8: 'FT8', ft4: 'FT4', wspr: 'WSPR', msk144: 'MSK144' };
  for (const [id, v] of Object.entries(dig)) {
    // v = dial (MHz) o { dial, nota }; la señal ocupa unos 3 kHz por encima de la frecuencia de dial
    const dial = typeof v === 'number' ? v : v.dial;
    lista.push({
      id, nombre: nombres[id] ?? id.toUpperCase(), f_min: dial, f_max: +(dial + ancho).toFixed(6), puntual: true,
      nota: typeof v === 'object' && v.nota ? v.nota : T('Dial de WSJT-X {0} MHz', dial.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')),
    });
  }
  return lista;
}

// ROE de cada segmento en lo medido (peor y mejor punto, % de segmento en el criterio) y su nivel de ROE (por el peor punto).
export function coberturaSegmentos(medida, segmentos, umbralDb) {
  const fmin = medida.freq[0], fmax = medida.freq[medida.freq.length - 1];
  return segmentos.map(s => {
    const f0 = s.f_min * 1e6, f1 = s.f_max * 1e6;
    if (f1 < fmin || f0 > fmax) return { segmento: s, medido: false };
    const est = estadisticaBanda(medida, f0, f1, umbralDb);
    return { segmento: s, medido: true, est, nivel: nivelROE(s.puntual || est.sinPuntos ? est.roeMin : est.roeMax) };
  });
}

// Pasa una curva medida en `freqO` a la rejilla `freqD` (interpolación lineal en log f); NaN fuera del rango medido.
export function remuestrear(freqO, valO, freqD) {
  const out = new Float64Array(freqD.length), n = freqO.length;
  let j = 0;
  for (let i = 0; i < freqD.length; i++) {
    const f = freqD[i];
    if (f < freqO[0] || f > freqO[n - 1]) { out[i] = NaN; continue; }
    while (j < n - 2 && freqO[j + 1] < f) j++;
    const t = (Math.log(f) - Math.log(freqO[j])) / (Math.log(freqO[j + 1]) - Math.log(freqO[j]));
    out[i] = valO[j] + t * (valO[j + 1] - valO[j]);
  }
  return out;
}

// ¿Es una antena multibanda? Sí si el usuario lo ha indicado o si, en lo medido, hay otra resonancia clara (ROE ≲ 3) al menos un 40 %
// por encima o por debajo de la frecuencia objetivo. `posicion` dice qué banda es la objetivo: 'baja' (hay otras por encima),
// 'alta' (hay otras por debajo), 'media' (hay a ambos lados) o null (indicado por el usuario, sin otras a la vista).
export function infoMultibanda(picos, fc, indicado = false) {
  const otras = picos.filter(q => q.rl >= 6 && Math.abs(Math.log(q.f / fc)) >= Math.log(1.4));
  const arriba = otras.some(q => q.f > fc), abajo = otras.some(q => q.f < fc);
  if (!otras.length && !indicado) return null;
  return { otras, indicado: !otras.length, posicion: arriba && abajo ? 'media' : arriba ? 'baja' : abajo ? 'alta' : null };
}

// Avisos de una medida mal hecha, mirando la curva entera (no solo la banda objetivo): [{ id, texto }].
//  - sin_conectar: casi todo se refleja en todo el rango (antena o cable sin conectar, conector flojo)
//  - carga: adaptación casi perfecta en un rango ancho (una carga de 50 Ω en vez de la antena)
//  - ruido: la pérdida de retorno salta de un punto a otro (mal contacto, interferencias, mano cerca del cable)
// Umbrales calibrados con la antena real de 868 MHz (ruido mediano 0,04 dB) y con una copia con ruido añadido (0,7 dB).
export function avisosMedida(medida) {
  const n = medida.freq.length;
  if (n < 20) return [];
  const mediana = a => Array.from(a).sort((x, y) => x - y)[a.length >> 1];
  const av = [];
  if (mediana(medida.rl) < 0.5) {
    av.push({ id: 'sin_conectar', texto: T('Casi todo se refleja en todo el rango medido. Es lo normal si la antena o el cable no están conectados, o si el conector está flojo.') });
  } else {
    const v90 = Array.from(medida.vswr).sort((a, b) => a - b)[Math.floor(n * 0.9)];
    if (v90 < 1.25 && medida.freq[n - 1] / medida.freq[0] > 1.2) {
      av.push({ id: 'carga', texto: T('La adaptación es casi perfecta en todo el rango. Una antena real no hace eso: parece que hay una carga de 50 Ω conectada en vez de la antena.') });
    }
  }
  const saltos = [];
  for (let i = 1; i < n - 1; i++) saltos.push(Math.abs(medida.rl[i] - (medida.rl[i - 1] + medida.rl[i + 1]) / 2));
  if (mediana(saltos) > 0.4) {
    av.push({ id: 'ruido', texto: T('La curva tiene mucho ruido (saltos sueltos entre puntos). Revisa el conector y el cable, aléjate de la antena y no toques el cable mientras mide.') });
  }
  return av;
}

// Cuántos milímetros mover para un cambio de longitud de pct % (positivo = alargar). Cortar es irreversible: el primer paso es el 70 %.
export function calculoMm(largoMm, pct) {
  if (!(largoMm > 0) || !Number.isFinite(pct) || pct === 0) return null;
  const mm = (largoMm * Math.abs(pct)) / 100;
  return { accion: pct > 0 ? 'alargar' : 'cortar', mm, primerPaso: pct < 0 ? mm * 0.7 : null };
}

// Indica si hay que alargar o cortar la antena para centrar su resonancia en la banda objetivo (Hz).
// En modo 'roe' (Simple) juzga la banda objetivo (peor punto) y avisa si la curva es irregular.
// opts.multibanda: el usuario ha dicho que la antena es multibanda (trampas, abanico...): no se da un factor global de dimensiones.
export function recomendacion(medida, picos, { fMin, fMax }, umbralDb, unidad = 'rl', opts = {}) {
  const fmt = hz => hz >= 1e9 ? `${(hz / 1e9).toFixed(3)} GHz` : hz >= 1e6 ? `${(hz / 1e6).toFixed(2)} MHz` : `${(hz / 1e3).toFixed(1)} kHz`;
  const fc = (fMin + fMax) / 2;
  const ic = indiceMasCercano(medida.freq, fc);
  const zr = medida.zr[ic], zx = medida.zx[ic];
  const cand = picos
    .filter(p => p.f >= fc / 2 && p.f <= fc * 2)
    .sort((a, b) => Math.abs(Math.log(a.f / fc)) - Math.abs(Math.log(b.f / fc)));
  const p = cand[0];
  const nota = T('Estimación de primer orden (la longitud es inversamente proporcional a la frecuencia). Tras cada cambio vuelve a medir; en antenas cargadas, fractales o con plano de masa el efecto real puede diferir.');
  const est = estadisticaBanda(medida, fMin, fMax, umbralDb);
  const intro = unidad === 'roe' ? lineasBanda(est, fMin, fMax, umbralDb) : [];
  if (!p) {
    const n = medida.freq.length, rl = medida.rl;
    const f0 = medida.freq[0], f1 = medida.freq[n - 1];
    const k = Math.max(3, Math.floor(n * 0.05));
    const media = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += rl[i]; return s / Math.max(1, b - a); };
    const bajo = media(0, k) - media(k, 2 * k), alto = media(n - k, n) - media(n - 2 * k, n - k);
    const lineas = [...intro, T('No se ve ningún mínimo claro de S11 dentro del rango medido ({0} a {1}).', fmt(f0), fmt(f1))];
    if (alto > 1 && alto >= bajo) lineas.push(T('La adaptación mejora hacia el extremo ALTO del rango: la antena probablemente resuena por encima. Sube el margen lateral o usa el barrido general.'));
    else if (bajo > 1) lineas.push(T('La adaptación mejora hacia el extremo BAJO del rango: la antena probablemente resuena por debajo. Sube el margen lateral o usa el barrido general.'));
    else lineas.push(T('Puede que resuene fuera del rango medido. Sube el margen lateral o usa el barrido general para buscarla.'));
    lineas.push(T('Si no aparece en ningún sitio, comprueba la conexión del cable y la calibración.'));
    return { accion: 'sin_resonancia', titulo: T('No resuena dentro del rango medido'), lineas, est };
  }
  const pct = (p.f / fc - 1) * 100;
  const bien = p.rl >= umbralDb;
  const cubre = p.fLo != null && p.fLo <= fMin && p.fHi >= fMax;
  const lineas = [...intro, T('Resonancia más cercana: {0} ({1}). Objetivo: {2}.', fmt(p.f), unidad === 'roe' ? T('ROE {0}', fmtROE(p.vswr)) : textoAdaptacion(p, unidad), fmt(fc))];
  // Banda ancha (típico en HF: 80 m es un 8 % de su frecuencia): una antena resonante sencilla rara vez la cubre entera con ROE 2
  if (unidad === 'roe' && !(bien && cubre) && (fMax - fMin) / fc > 0.04) {
    lineas.push(T('Esta banda es ancha ({0} % de su frecuencia): una antena resonante sencilla rara vez la cubre entera con ROE 2. Si no la necesitas toda, elige el segmento que más uses (CW, fonía, digital, FT8…) y la antena se ajustará a ese.', (((fMax - fMin) / fc) * 100).toFixed(0)));
  }
  const irreg = bien && cubre ? null : curvaIrregular(medida, picos, { fMin, fMax }, umbralDb);
  if (irreg) {
    lineas.push(`${irreg.motivo}.`);
    lineas.push(T('Con una curva así no se puede saber cuánto alargar o cortar: el porcentaje de longitud solo vale cuando hay una única resonancia.'));
    lineas.push(T('Mide en la frecuencia exacta que vas a usar (objetivo «frecuencia personalizada»), y recuerda que mover el cable o la mano cambia el resultado.'));
    return { accion: 'irregular', titulo: T('La curva es irregular: el ajuste por longitud no es fiable'), lineas, est, irreg };
  }
  let accion, titulo;
  if (bien && cubre) {
    accion = 'ok';
    titulo = T('La antena cubre la banda objetivo ({0} a {1})', fmt(fMin), fmt(fMax));
    lineas.push(T('Ancho de banda útil: {0} ({1} a {2}).', fmt(p.fHi - p.fLo), fmt(p.fLo), fmt(p.fHi)));
  } else if (Math.abs(pct) < 1) {
    if (!bien) {
      accion = 'adaptacion';
      titulo = T('Resuena en la frecuencia correcta pero está mal adaptada');
      lineas.push(T('A la resonancia, Z ≈ {0} Ω frente a 50 Ω. No es un problema de longitud: revisa el punto de alimentación o añade un adaptador de impedancia.', zr.toFixed(0)));
    } else {
      accion = 'estrecha';
      titulo = T('Está centrada pero su ancho de banda no cubre toda la banda');
      lineas.push(T('Ancho de banda actual {0}; la banda objetivo necesita {1}.', fmt(p.fHi - p.fLo), fmt(fMax - fMin)));
      lineas.push(T('Para ensanchar: elementos más anchos o gruesos, o una geometría de banda ancha (bowtie, etc.).'));
    }
  } else if (pct > 0) {
    accion = 'alargar';
    titulo = T('Alarga la antena un {0} %', pct.toFixed(1));
    lineas.push(T('Resuena demasiado alto: la antena es eléctricamente corta. Multiplica sus dimensiones por {0}.', (p.f / fc).toFixed(3)));
  } else {
    accion = 'cortar';
    titulo = T('Acorta la antena un {0} %', (-pct).toFixed(1));
    lineas.push(T('Resuena demasiado bajo: la antena es eléctricamente larga. Multiplica sus dimensiones por {0}.', (p.f / fc).toFixed(3)));
  }
  const mb = accion === 'alargar' || accion === 'cortar' ? infoMultibanda(picos, fc, !!opts.multibanda) : null;
  if (mb) {
    // En una antena multibanda cada banda la manda un tramo: un factor global movería todas las bandas a la vez.
    const verbo = accion === 'alargar' ? T('Alarga') : T('Acorta'), verboIng = accion === 'alargar' ? T('alargar') : T('acortar'), pctTxt = Math.abs(pct).toFixed(1);
    titulo = T('{0} un {1} % el tramo que gobierna esta banda', verbo, pctTxt);
    const quien = mb.posicion === 'baja'
      ? T('Es la banda más baja: la gobiernan el tramo exterior (el que queda más allá de la trampa o del elemento de las bandas altas) y las bobinas de carga. Hay que {0} ese tramo una longitud equivalente al {1} % de lo que mide el brazo entero.', verboIng, pctTxt)
      : mb.posicion === 'alta'
        ? T('Es una banda alta: la gobierna el tramo interior, el que va desde el alimentador hasta la primera trampa. Hay que {0} ese tramo un {1} % de su propia longitud.', verboIng, pctTxt)
        : mb.posicion === 'media'
          ? T('Es una banda intermedia: la gobierna el tramo que queda entre dos trampas (o elementos). Hay que {0} ese tramo un {1} % de su propia longitud.', verboIng, pctTxt)
          : T('Ajusta el tramo que gobierna esta banda (el que resuena en ella) un {0} % de su longitud efectiva.', pctTxt);
    const aviso = mb.indicado
      ? T('Has indicado que la antena es multibanda: el factor «multiplica todas las dimensiones» no sirve, porque cambiar todo mueve todas las bandas a la vez.')
      : T('La antena parece multibanda (otras resonancias en {0}): el factor «multiplica todas las dimensiones» no sirve, porque cambiar todo mueve todas las bandas a la vez.', mb.otras.slice(0, 3).map(q => fmt(q.f)).join(', '));
    const i = lineas.findIndex(l => /Multiplica sus dimensiones/.test(l));
    lineas.splice(i < 0 ? lineas.length : i, i < 0 ? 0 : 1, aviso, quien, T('Ajusta una banda cada vez y vuelve a medir también las demás: tocar un tramo las mueve un poco a todas.'));
  }
  if (accion === 'alargar' || accion === 'cortar') {
    if (!bien) lineas.push(T('La adaptación en la resonancia es baja ({0}): tras ajustar la longitud, revisa también la alimentación.', unidad === 'roe' ? T('ROE {0}', fmtROE(p.vswr)) : `${p.rl.toFixed(1)} dB`));
    const inductiva = zx > 0;
    const coincide = (accion === 'cortar') === inductiva;
    lineas.push(T('A {0} la antena presenta Z = {1} {2} j{3} Ω ({4}): {5}', fmt(fc), zr.toFixed(1), zx >= 0 ? '+' : '-', Math.abs(zx).toFixed(1), inductiva ? 'inductiva' : 'capacitiva', coincide ? T('coincide con ese diagnóstico.') : T('no coincide con el diagnóstico; es normal en antenas que no son tipo dipolo o monopolo. Fíate más de la frecuencia de resonancia.')));
    if (Math.abs(pct) > 25) lineas.push(T('El cambio es grande: hazlo en dos pasos y mide entre ellos.'));
  }
  const rx = accion === 'ok' ? null : reactanciaCero(medida, p.f);
  if (rx && rx.tipo === 'serie' && Math.abs(rx.desv) > DESV_REACTANCIA) {
    lineas.push(T('Ojo: la antena resuena eléctricamente (reactancia cero) a {0}, un {1} % {2} de donde mejor se adapta ({3}). Es habitual en antenas cargadas, fractales o con adaptador, pero el porcentaje de longitud puede no ser fiable: corta o alarga poco a poco y vuelve a medir.', fmt(rx.fX), (Math.abs(rx.desv) * 100).toFixed(1), rx.desv > 0 ? T('por encima') : T('por debajo'), fmt(p.f)));
  }
  lineas.push(nota);
  return { accion, titulo, lineas, fRes: p.f, pct, est, rx, multibanda: mb };
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
      motivo: cerca ? T('rizado en la falda de la resonancia principal, probablemente ruido') : T('muy poco marcada, probablemente ruido o un artefacto de la medida'),
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
    v.push({ lo: f0 - pad, hi: f1 + pad, puntos: 101, motivo: T('banda {0}', e.banda.nombre) });
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
    const puntual = esPuntual(est, fMin, fMax);
    const peor = nivelROE(puntual ? est.roeMin : est.roeMax);
    const nom = banda && banda.servicio !== 'objetivo' ? `${banda.servicio.toUpperCase()} ${banda.nombre}` : fmt((fMin + fMax) / 2);
    const titulo = puntual
      ? T('{0}: ROE {1} ({2}).', nom, fmtROE(est.roeMin), peor.etiqueta.toLowerCase())
      : T('{0}: ROE entre {1} y {2} ({3} en el peor punto).', nom, fmtROE(est.roeMin), fmtROE(est.roeMax), peor.etiqueta.toLowerCase());
    const l = lineasBanda(est, fMin, fMax, umbralDb).slice(1); // consejo (y, si procede, qué parte de la banda es buena)
    if (mejor && (mejor.f < fMin || mejor.f > fMax)) l.push(T('La antena resuena mejor en {0} (ROE {1}), fuera de esta banda.', fmt(mejor.f), fmtROE(mejor.vswr)));
    else if (mejor && mejor.fLo != null && !puntual) l.push(T('Ancho de banda con {0}: {1} ({2} a {3}).', textoUmbral(umbralDb, unidad), fmt(mejor.fHi - mejor.fLo), fmt(mejor.fLo), fmt(mejor.fHi)));
    if (est.fracBuena < 1 && curvaIrregular(ctx.medida, picos, { fMin, fMax }, umbralDb)) l.push(T('La curva es irregular (varios mínimos): no te fíes de un solo punto y mide la frecuencia exacta que vas a usar.'));
    l.push(`Criterio: ${textoUmbral(umbralDb, unidad)}. ${explicacionROE(umbralDb)}`);
    return { titulo, lineas: l };
  }
  const lineas = [];
  let titulo;
  if (!mejor || mejor.rl < umbralDb) {
    titulo = T('La antena no está bien adaptada en ninguna frecuencia del rango medido.');
    if (mejor) lineas.push(T('La mejor adaptación es {0} a {1}, peor que el mínimo exigido ({2}).', textoAdaptacion(mejor, unidad), fmt(mejor.f), textoUmbral(umbralDb, unidad)));
    lineas.push(T('Revisa el conector, el cable y la calibración antes de concluir que la antena es defectuosa.'));
  } else {
    titulo = T('Resuena a {0} ({1}).', fmt(mejor.f), textoAdaptacion(mejor, unidad));
    if (mejor.fLo != null) lineas.push(T('Ancho de banda con {0}: {1} ({2} a {3}).', textoUmbral(umbralDb, unidad), fmt(mejor.fHi - mejor.fLo), fmt(mejor.fLo), fmt(mejor.fHi)));
    const otros = picos.slice(1).filter(p => p.rl >= umbralDb);
    if (otros.length) lineas.push(T('Otras resonancias: {0}.', otros.slice(0, 4).map(p => `${fmt(p.f)} (${unidad === 'roe' ? T('ROE {0}', fmtROE(p.vswr)) : `${p.rl.toFixed(1)} dB`})`).join(', ')));
  }
  if (unidad === 'roe') lineas.push(`Criterio: ${textoUmbral(umbralDb, unidad)}. ${explicacionROE(umbralDb)}`, T('El resultado de cada banda (y si se puede usar) está en la tabla de bandas.'));
  lineas.push(buenos.length ? T('Cubre por completo: {0}.', buenos.map(nombre).join(', ')) : T('No cubre por completo ninguna banda de la lista.'));
  if (parciales.length) lineas.push(T('Cubre parte de: {0}.', parciales.map(nombre).join(', ')));
  return { titulo, lineas };
}

const REGIONES = {
  eu: ['R1', 'EU', 'global'],
  us: ['R2', 'US', 'global'],
  ap: ['R3', 'AP', 'global'],
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
