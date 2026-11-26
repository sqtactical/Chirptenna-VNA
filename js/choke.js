// Comprobación de un choke o balun 1:1 (corriente de modo común) con una medida de S11, para Chirptenna Wire y cualquier antena de HF.
// Se junta el vivo y la malla en un extremo del coaxial con el choke ya montado, se mide por el otro y lo que se ve es la impedancia
// por fuera de la malla. Sin DOM: se prueba con Node.

// Bandas de HF (nombre, MHz mínimo y máximo): las de la región 1; las de otras regiones caen casi todas dentro de estas.
export const BANDAS_CHOKE = [
  ['160 m', 1.8, 2.0], ['80 m', 3.5, 3.8], ['40 m', 7.0, 7.2], ['30 m', 10.1, 10.15], ['20 m', 14.0, 14.35],
  ['17 m', 18.068, 18.168], ['15 m', 21.0, 21.45], ['12 m', 24.89, 24.99], ['10 m', 28.0, 29.7],
];

export const BUENO_OHM = 1000;     // por encima: el choke corta bien las corrientes de modo común
export const JUSTO_OHM = 500;      // entre los dos: aceptable para poca potencia
export const FIABLE_OHM = 3000;    // por encima un NanoVNA ya no mide bien (el S11 está pegado a 1)

// medida = { freq (Hz), zr, zx (Ω) }. Devuelve una fila por banda que la medida cubre entera o en parte.
export function analizarChoke(medida, bandas = BANDAS_CHOKE) {
  const filas = [];
  for (const [nombre, a, b] of bandas) {
    let zMin = Infinity, zMax = 0, n = 0;
    for (let i = 0; i < medida.freq.length; i++) {
      const f = medida.freq[i] / 1e6;
      if (f < a || f > b) continue;
      const z = Math.hypot(medida.zr[i], medida.zx[i]);
      if (!Number.isFinite(z)) continue;
      zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); n++;
    }
    if (!n) continue;
    const veredicto = zMin >= BUENO_OHM ? 'bien' : zMin >= JUSTO_OHM ? 'justo' : 'corto';
    filas.push({ nombre, fMin: a, fMax: b, zMin, zMax, puntos: n, veredicto, dudoso: zMax > FIABLE_OHM });
  }
  return filas;
}

// Consejo general a partir de las filas: qué retocar si alguna banda falla.
export function consejoChoke(filas) {
  if (!filas.length) return 'sin_bandas';
  const malas = filas.filter(f => f.veredicto === 'corto');
  if (!malas.length) return filas.some(f => f.veredicto === 'justo') ? 'justo' : 'bien';
  const bajas = malas.filter(f => f.fMax < 10), altas = malas.filter(f => f.fMin >= 14);
  if (bajas.length && !altas.length) return 'faltan_vueltas';       // corto en las bandas bajas: más inductancia
  if (altas.length && !bajas.length) return 'menos_capacidad';      // corto en las altas: la capacidad entre vueltas lo deja pasar
  return 'general';
}
