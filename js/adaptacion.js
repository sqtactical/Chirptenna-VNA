// Calculadora de adaptación: red en L entre la impedancia medida de la antena y 50 Ω.
// Sin DOM (se prueba con Node). Todas las impedancias en ohmios, frecuencias en Hz.

const Z0 = 50;
const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

// Valor E24 más cercano (en escala logarítmica)
export function e24(v) {
  if (!(v > 0)) return v;
  const dec = 10 ** Math.floor(Math.log10(v));
  let mejor = Infinity, res = v;
  for (const m of [...E24, 10]) {
    const c = m * dec, d = Math.abs(Math.log(c / v));
    if (d < mejor) { mejor = d; res = c; }
  }
  return res;
}

// Componente que da una reactancia serie (X) o una susceptancia en derivación (B) a la frecuencia f
const compSerie = (x, w) => x >= 0 ? { tipo: 'L', valor: x / w } : { tipo: 'C', valor: -1 / (w * x) };
const compDeriv = (b, w) => b >= 0 ? { tipo: 'C', valor: b / w } : { tipo: 'L', valor: -1 / (w * b) };

// Reactancia (serie) o susceptancia (derivación) de un componente a la frecuencia w
const reactancia = (c, w) => c.tipo === 'L' ? w * c.valor : -1 / (w * c.valor);
const suscept = (c, w) => c.tipo === 'C' ? w * c.valor : -1 / (w * c.valor);

// Soluciones teóricas de una red en L que lleva zr + j·zx a Z0.
// 'derivacionCarga': el elemento en derivación va junto a la carga y el serie hacia el equipo (carga con R mayor que Z0 tras ella)
// 'serieCarga': el serie va junto a la carga y el de derivación hacia el equipo (R menor que Z0)
function solucionesExactas(zr, zx) {
  const sol = [];
  const d = zr * zr + zx * zx, G = zr / d, B = -zx / d;
  if (G * Z0 < 1) {
    const q = Math.sqrt(G / Z0 - G * G);
    for (const s of [1, -1]) {
      const bt = s * q;
      // el elemento serie cancela la reactancia que queda tras la derivación: X = (B + Bp)·Z0/G
      sol.push({ topologia: 'derivacionCarga', b: bt - B, x: (bt * Z0) / G });
    }
  }
  if (zr < Z0) {
    const xt = Math.sqrt(zr * (Z0 - zr));
    for (const s of [1, -1]) sol.push({ topologia: 'serieCarga', x: s * xt - zx, b: (s * xt) / (zr * Z0) });
  }
  return sol;
}

// Coeficiente de reflexión visto desde el equipo con la red y una carga zr + j·zx a la frecuencia f
export function gammaConRed(red, f, zr, zx) {
  const w = 2 * Math.PI * f;
  const xs = reactancia(red.serie, w), bp = suscept(red.derivacion, w);
  let zr1 = zr, zi1 = zx;
  const inv = (a, b) => { const d = a * a + b * b; return [a / d, -b / d]; };
  if (red.topologia === 'derivacionCarga') {
    const [g, b] = inv(zr1, zi1);
    [zr1, zi1] = inv(g, b + bp);
    zi1 += xs;
  } else {
    zi1 += xs;
    const [g, b] = inv(zr1, zi1);
    [zr1, zi1] = inv(g, b + bp);
  }
  const nr = zr1 - Z0, den = (zr1 + Z0) ** 2 + zi1 * zi1;
  const re = (nr * (zr1 + Z0) + zi1 * zi1) / den, im = (zi1 * (zr1 + Z0) - nr * zi1) / den;
  return Math.hypot(re, im);
}

// Todas las redes en L posibles con valores E24 para la impedancia dada a la frecuencia f, de mejor a peor
export function redesL(zr, zx, f) {
  if (!(zr > 0) || !(f > 0)) return [];
  const w = 2 * Math.PI * f;
  const res = [];
  for (const s of solucionesExactas(zr, zx)) {
    const serieIdeal = compSerie(s.x, w), derivIdeal = compDeriv(s.b, w);
    if (!isFinite(serieIdeal.valor) || !isFinite(derivIdeal.valor)) continue;
    const red = {
      topologia: s.topologia,
      serie: { tipo: serieIdeal.tipo, valor: e24(serieIdeal.valor), ideal: serieIdeal.valor },
      derivacion: { tipo: derivIdeal.tipo, valor: e24(derivIdeal.valor), ideal: derivIdeal.valor },
    };
    red.gamma = gammaConRed(red, f, zr, zx);
    red.rl = -20 * Math.log10(Math.max(red.gamma, 1e-6));
    red.vswr = (1 + Math.min(red.gamma, 0.999999)) / (1 - Math.min(red.gamma, 0.999999));
    res.push(red);
  }
  return res.sort((a, b) => a.gamma - b.gamma);
}

// Curva prevista de ROE con la red, sobre la medida (freq, zr, zx)
export function roePrevista(red, medida) {
  const n = medida.freq.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const g = Math.min(gammaConRed(red, medida.freq[i], medida.zr[i], medida.zx[i]), 0.999999);
    out[i] = (1 + g) / (1 - g);
  }
  return out;
}

export function nombreValor(c) {
  const v = c.valor;
  if (c.tipo === 'L') return v >= 1e-6 ? `${+(v * 1e6).toPrecision(3)} µH` : `${+(v * 1e9).toPrecision(3)} nH`;
  return v >= 1e-9 ? `${+(v * 1e9).toPrecision(3)} nF` : `${+(v * 1e12).toPrecision(3)} pF`;
}
