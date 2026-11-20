// Diferencia punto a punto entre una medida y una referencia (otro .s1p: simulación, fabricante, medida anterior).
// Sin DOM: se prueba con Node.

// Interpola linealmente S11 complejo de la referencia en las frecuencias de la medida.
function interpolar(ref, f) {
  const n = ref.freq.length;
  if (f < ref.freq[0] || f > ref.freq[n - 1]) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ref.freq[mid] <= f) lo = mid; else hi = mid; }
  const t = ref.freq[hi] === ref.freq[lo] ? 0 : (f - ref.freq[lo]) / (ref.freq[hi] - ref.freq[lo]);
  return [ref.re[lo] + t * (ref.re[hi] - ref.re[lo]), ref.im[lo] + t * (ref.im[hi] - ref.im[lo])];
}

const roe = g => (g >= 1 ? Infinity : (1 + g) / (1 - g));

// medida y referencia: { freq, re, im }. Compara solo donde se solapan.
export function compararConReferencia(medida, ref) {
  let n = 0, sq = 0, maxG = 0, fMaxG = null, sumDRoe = 0, maxDRoe = 0, fMaxDRoe = null;
  let iMin = -1, iMinR = -1, gMin = Infinity, gMinR = Infinity, fMinR = null, fMin = null;
  for (let i = 0; i < medida.freq.length; i++) {
    const r = interpolar(ref, medida.freq[i]);
    if (!r) continue;
    const dr = medida.re[i] - r[0], di = medida.im[i] - r[1], d = Math.hypot(dr, di);
    const gm = Math.hypot(medida.re[i], medida.im[i]), gr = Math.hypot(r[0], r[1]);
    n++; sq += d * d;
    if (d > maxG) { maxG = d; fMaxG = medida.freq[i]; }
    const dRoe = Math.abs(roe(Math.min(gm, 0.999)) - roe(Math.min(gr, 0.999)));
    sumDRoe += dRoe;
    if (dRoe > maxDRoe) { maxDRoe = dRoe; fMaxDRoe = medida.freq[i]; }
    if (gm < gMin) { gMin = gm; fMin = medida.freq[i]; }
    if (gr < gMinR) { gMinR = gr; fMinR = medida.freq[i]; }
  }
  if (!n) return null;
  return {
    n, rmsGamma: Math.sqrt(sq / n), maxGamma: maxG, fMaxGamma: fMaxG,
    roeMedia: sumDRoe / n, roeMaxDif: maxDRoe, fRoeMaxDif: fMaxDRoe,
    fMinMedida: fMin, fMinRef: fMinR, desplazamiento: fMin && fMinR ? fMin / fMinR - 1 : null,
    gMinMedida: gMin, gMinRef: gMinR,
    solape: n / medida.freq.length,
  };
}
