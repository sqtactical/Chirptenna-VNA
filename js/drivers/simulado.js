import { T } from '../i18n.js';
// Equipo simulado para desarrollar y probar sin hardware.
// Antena de ejemplo: dos resonancias (~871 MHz como el Bowtie_Sierpinski_MT, y ~2.44 GHz).
// Con { bruto: true } devuelve los datos "sin corregir": pasan por una red de errores (directividad,
// adaptacion de fuente, seguimiento con retardo de cable) y dependen del patron conectado (setEstandar).

const RESONANCIAS = [
  { f0: 871e6, q: 12, gmin: 0.08 },
  { f0: 2440e6, q: 25, gmin: 0.22 },
];

const polar = (m, fase) => [m * Math.cos(fase), m * Math.sin(fase)];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };

function gammaAntena(f) {
  let absorb = 0;
  for (const r of RESONANCIAS) {
    const x = (2 * r.q * (f - r.f0)) / r.f0;
    absorb = Math.max(absorb, (1 - r.gmin ** 2) / (1 + x * x));
  }
  return polar(Math.sqrt(Math.max(0, 1 - absorb)), -2 * Math.PI * f * 2e-10);
}

// Antena de ejemplo COMPLEJA (HF): dipolo multibanda con una trampa LC y una bobina de carga, modelado como líneas de transmisión
// (cada brazo: tramo interior -> trampa paralela LC -> tramo exterior -> bobina de carga -> punta; la radiación se aproxima con
// una atenuación uniforme). La trampa (resonante a ~14 MHz) aísla el tramo exterior en 20 m y lo suma, alargado por la bobina, en 40 m.
// Resultado: mínimos de ROE a ~6,9 MHz (40 m), ~14,3 MHz (20 m) y ~18,5 MHz (armónico, cae cerca de 17 m), con máximos de ROE
// (resonancia en paralelo de la trampa) entre medias. Es un modelo cualitativo, no un diseño.
const ca = (a, b) => [a[0] + b[0], a[1] + b[1]];
const ctanh = z => { const e = Math.exp(2 * z[0]), p = [e * Math.cos(2 * z[1]), e * Math.sin(2 * z[1])]; return cdiv([p[0] - 1, p[1]], [p[0] + 1, p[1]]); };
const TR = { vf: 0.95, zc: 480, alfa: 0.0045, cPunta: 8e-12, l1: 4.9, l2: 2.2, l3: 0.8, lBobina: 6e-6, rBobina: 2, lTrampa: 2.6e-6, cTrampa: 48e-12, rTrampa: 1.2 };
function gammaTrampas(f) {
  // por encima de ~40 MHz el modelo de líneas de transmisión repetiría resonancias sin sentido físico para este ejemplo: se deja una antena descuadrada
  if (f > 40e6) return polar(0.97, -2 * Math.PI * f * 2e-10);
  const w = 2 * Math.PI * f, beta = w / (3e8 * TR.vf);
  const linea = (Z, len) => { const t = ctanh([TR.alfa * len, beta * len]), zc = [TR.zc, 0]; return cmul(zc, cdiv(ca(Z, cmul(zc, t)), ca(zc, cmul(Z, t)))); };
  let Z = cdiv([1, 0], [0, w * TR.cPunta]);                      // capacidad de la punta
  Z = linea(Z, TR.l3);
  Z = ca(Z, [TR.rBobina, w * TR.lBobina]);                       // bobina de carga en serie
  Z = linea(Z, TR.l2);
  const yt = ca([0, w * TR.cTrampa], cdiv([1, 0], [TR.rTrampa, w * TR.lTrampa])); // trampa: L (con pérdidas) en paralelo con C
  Z = ca(Z, cdiv([1, 0], yt));
  Z = linea(Z, TR.l1);
  const Zf = [2 * Z[0], 2 * Z[1]];                               // dos brazos
  return cdiv([Zf[0] - 50, Zf[1]], [Zf[0] + 50, Zf[1]]);
}

export const ANTENAS_SIMULADAS = {
  predeterminada: T('Dipolo de ejemplo (868 MHz y 2,44 GHz)'),
  trampas: T('HF: dipolo multibanda con trampas y bobina de carga (40/20 m)'),
};

// Red de errores de un puerto: medido = Ed + Er*G / (1 - Es*G)
function errores(f) {
  return {
    ed: polar(0.04, 0.3 + (f / 1e9) * 2),
    es: polar(0.12, 1.1 - (f / 1e9)),
    er: polar(0.9 - 0.05 * (f / 1e9), -2 * Math.PI * f * 3e-9), // cable de ~1.5 ns
  };
}

export class DriverSimulado {
  id = 'simulado';
  nombre = T('Simulado (sin hardware)');
  fMinHz = 50e3;
  fMaxHz = 6e9;
  version = 'simulado';
  estandar = 'antena';
  antena = 'predeterminada'; // ver ANTENAS_SIMULADAS

  async connect() {}
  async disconnect() {}
  // Solo existe en el simulado: en un equipo real el usuario conecta el patron a mano.
  setEstandar(nombre) { this.estandar = nombre; }

  _gamma(f) {
    switch (this.estandar) {
      case 'open': return [1, 0];
      case 'short': return [-1, 0];
      case 'load': return polar(0.02, 0.7 + f / 3e9); // carga real: no es perfecta
      default: return this.antena === 'trampas' ? gammaTrampas(f) : gammaAntena(f);
    }
  }

  async scan(startHz, stopHz, points, onProgress = () => {}, espaciado = 'log', { bruto = false } = {}) {
    const freq = new Float64Array(points), re = new Float64Array(points), im = new Float64Array(points);
    for (let i = 0; i < points; i++) {
      const f = espaciado === 'log'
        ? startHz * Math.pow(stopHz / startHz, i / (points - 1))
        : startHz + (i * (stopHz - startHz)) / (points - 1);
      let g = this._gamma(f);
      if (bruto) {
        const e = errores(f);
        const m = cdiv(cmul(e.er, g), [1 - cmul(e.es, g)[0], -cmul(e.es, g)[1]]);
        g = [e.ed[0] + m[0], e.ed[1] + m[1]];
      }
      const ruido = (Math.random() - 0.5) * 0.004;
      freq[i] = f; re[i] = g[0] + ruido; im[i] = g[1] + ruido;
      if (i % 100 === 0) { onProgress(i / points); await new Promise(r => setTimeout(r, 0)); }
    }
    onProgress(1);
    return { freq, re, im };
  }
}
