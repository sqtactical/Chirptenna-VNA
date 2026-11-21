// Incertidumbre orientativa de |S11| a partir de la calidad de la calibración. Sin DOM (se prueba con Node).
// Modelo de cota (no estadístico): δ = d + t·|Γ| + 2·d·|Γ|²
//   d  directividad residual: el |Γ| medio de la carga reconectada tras calibrar (la verificación del asistente);
//      sin verificar se supone D_DEFECTO (≈ −30 dB, típico de un NanoVNA con un kit decente) o D_EQUIPO si mide el propio equipo.
//   t  error de seguimiento (≈ 0,17 dB, cables y deriva), 2·d  adaptación de fuente residual (aprox.).
// No sustituye una caracterización de laboratorio: sirve para saber cuándo una diferencia de ROE o de dB es real o es ruido de calibración.

export const D_DEFECTO = 0.03, D_EQUIPO = 0.05, T_SEGUIMIENTO = 0.02;

// juego: juego de calibración de la app (o null = la del equipo). Usa el peor `repetDb` de sus tramos.
export function parametrosIncertidumbre(juego) {
  if (!juego) return { d: D_EQUIPO, verificada: false, fuente: 'equipo' };
  const reps = juego.segmentos.map(s => s.repetDb).filter(Number.isFinite);
  if (!reps.length) return { d: D_DEFECTO, verificada: false, fuente: 'app' };
  return { d: Math.max(...reps.map(db => 10 ** (db / 20)), 1e-4), verificada: true, fuente: 'app' };
}

export const margenGamma = (g, p) => p.d + T_SEGUIMIENTO * g + 2 * p.d * g * g;

// Rango de pérdida de retorno (dB) y de ROE posible para un |Γ| medido. rlMax = Infinity si |Γ| ≤ δ (no se distingue de una carga perfecta).
export function rangoAdaptacion(g, p) {
  const m = margenGamma(g, p), alto = Math.min(g + m, 0.999999), bajo = g - m;
  return {
    margen: m, indistinguible: bajo <= 1e-3,
    rlMin: Math.max(-20 * Math.log10(alto), 0), rlMax: bajo > 1e-3 ? -20 * Math.log10(bajo) : Infinity,
    roeMin: bajo > 1e-3 ? (1 + bajo) / (1 - bajo) : 1, roeMax: (1 + alto) / (1 - alto),
  };
}
