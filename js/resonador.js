// Resonancia y Q de una trampa LC, un bobinado o un condensador medidos por reflexión con acoplo débil
// (un lazo o una sonda junto al circuito). Sin DOM (se prueba con Node).

// medida = salida de calcular(). Busca el pozo más profundo de |S11| y mide su anchura a media potencia.
// Q cargada = f0/Δf. Q propia (acoplo débil, circuito subacoplado): Q0 = 2·Qc/(1 + |S11|mín./línea base); con acoplo muy débil Q0 ≈ Qc
export function analizarResonador(medida) {
  const n = medida.freq.length;
  if (n < 8) return null;
  const g = i => Math.hypot(medida.re[i], medida.im[i]);
  let im = 1;
  for (let i = 2; i < n - 2; i++) if (g(i) < g(im)) im = i;
  const gmin = g(im), gmax = Math.max(g(0), g(n - 1));
  if (!(gmax > gmin * 1.05) || im < 2 || im > n - 3) return null; // no hay pozo
  // nivel de media potencia entre el fondo del pozo y la línea base (|S11| de fuera de la resonancia)
  const base = Math.max(g(0), g(n - 1), 1e-6);
  const nivel = Math.sqrt((gmin * gmin + base * base) / 2);
  const cruce = dir => {
    for (let i = im; i > 0 && i < n - 1; i += dir) {
      const a = g(i), b = g(i + dir);
      if (a <= nivel && b > nivel) return medida.freq[i] + (medida.freq[i + dir] - medida.freq[i]) * (nivel - a) / (b - a);
    }
    return null;
  };
  const fLo = cruce(-1), fHi = cruce(1);
  if (fLo == null || fHi == null) return null;
  const f0 = medida.freq[im], bw = fHi - fLo;
  const qc = f0 / bw;
  return { f0, bw, qc, q0: 2 * qc / (1 + gmin / base), profundidadDb: -20 * Math.log10(gmin / base), gmin, base };
}
