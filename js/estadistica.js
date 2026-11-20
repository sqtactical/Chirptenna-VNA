// Promediado de barridos y ruido del sistema. Sin DOM: se prueba con Node.

// Promedia N barridos de los mismos puntos ({ freq, re, im }). Devuelve la media y, por punto, la desviación típica
// de S11 (módulo del vector de diferencia), que sirve de barra de ruido.
export function promediar(barridos) {
  const N = barridos.length, n = barridos[0].freq.length;
  const freq = barridos[0].freq, re = new Float64Array(n), im = new Float64Array(n), desv = new Float64Array(n);
  for (const b of barridos) if (b.freq.length !== n) throw new Error('Los barridos a promediar tienen distinto número de puntos.');
  for (let i = 0; i < n; i++) {
    let sr = 0, si = 0;
    for (const b of barridos) { sr += b.re[i]; si += b.im[i]; }
    re[i] = sr / N; im[i] = si / N;
    if (N > 1) {
      let q = 0;
      for (const b of barridos) q += (b.re[i] - re[i]) ** 2 + (b.im[i] - im[i]) ** 2;
      desv[i] = Math.sqrt(q / (N - 1));
    }
  }
  return { freq: Float64Array.from(freq), re, im, desv, n: N };
}

const mediana = v => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

// Ruido típico del barrido (mediana de la desviación por punto, en unidades de |Γ|) y su equivalente en dB de |S11|
// alrededor de |Γ|=0,1 (S11 de −20 dB), que es donde se ve el pozo de una antena adaptada.
export function ruidoSistema(desv) {
  const sigma = mediana(desv);
  return { sigma, dbEn20: sigma > 0 ? 20 * Math.log10(0.1 + sigma) - 20 * Math.log10(0.1) : 0 };
}

// Umbral de prominencia (dB) para considerar un pico real: el fijo de 3 dB, o 6 σ del ruido en dB si es mayor.
export function umbralProminencia(desv, base = 3) {
  const { sigma } = ruidoSistema(desv);
  if (!sigma) return base;
  const dB = 6 * 20 * Math.log10(1 + sigma / 0.3); // |Γ| típico de 0,3 en el flanco de una resonancia
  return Math.max(base, +dB.toFixed(1));
}
