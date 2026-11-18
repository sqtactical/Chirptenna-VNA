// Informe PDF generado en el navegador con jsPDF (se carga bajo demanda desde cdnjs).
import { dibujar, dibujarROE } from './grafico.js';
import { veredicto, roeDeRl } from './analisis.js';

async function cargarJsPDF() {
  if (window.jspdf) return window.jspdf.jsPDF;
  await new Promise((ok, ko) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = ok;
    s.onerror = () => ko(new Error('No se pudo cargar la libreria PDF (necesita conexion a internet)'));
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

const fmtF = hz => hz >= 1e9 ? `${(hz / 1e9).toFixed(3)} GHz` : hz >= 1e6 ? `${(hz / 1e6).toFixed(2)} MHz` : `${(hz / 1e3).toFixed(1)} kHz`;
const ETIQUETA = { ok: 'Cubre', parcial: 'Parcial', no: 'No resuena', sin_datos: 'Sin datos', fuera: 'Fuera de rango' };
const COLOR = { ok: [46, 125, 50], parcial: [178, 106, 0], no: [198, 40, 40], sin_datos: [120, 120, 120], fuera: [120, 120, 120] };

// meta: { equipo, puntos, espaciado, fIni, fFin, region, antena }
export async function generarPDF(ultimo, meta) {
  const JsPDF = await cargarJsPDF();
  const doc = new JsPDF({ unit: 'mm', format: 'a4' });
  const M = 15, W = 210 - 2 * M;
  let y = M;
  const salto = h => { if (y + h > 297 - M) { doc.addPage(); y = M; } };
  // La fuente estandar del PDF no tiene estos simbolos
  const limpiar = s => String(s).replace(/Ω/g, ' ohm').replace(/≈/g, '~').replace(/[−–—]/g, '-').replace(/≥/g, '>=').replace(/∝/g, 'proporcional a');
  const texto = (t, { size = 10, bold = false, color = [31, 42, 48], gap = 1.5 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    for (const l of doc.splitTextToSize(limpiar(t), W)) { salto(size * 0.45); y += size * 0.4; doc.text(l, M, y); y += size * 0.12; }
    y += gap;
  };

  // Cabecera
  doc.setFillColor(21, 101, 192); doc.rect(0, 0, 210, 14, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text('Chirptenna VNA - Informe de medida de antena', M, 9);
  y = 22;

  if (ultimo.reco) {
    texto('Que hacer con la antena', { size: 9, color: [93, 106, 115], gap: 0.5 });
    texto(ultimo.reco.titulo, { size: 15, bold: true, color: [21, 101, 192], gap: 2 });
    for (const l of ultimo.reco.lineas) texto('- ' + l, { size: 9.5, gap: 1 });
    y += 3;
  }
  const roe = meta.unidad === 'roe';
  const v = veredicto(ultimo.picos, ultimo.evaluacion, ultimo.umbral, meta.unidad);
  texto(v.titulo, { size: 13, bold: true, gap: 2 });
  for (const l of v.lineas) texto('- ' + l, { size: 10, gap: 1 });
  y += 2;

  // Grafico (siempre en colores claros para imprimir)
  const cv = document.createElement('canvas');
  (roe ? dibujarROE : dibujar)(cv, ultimo.medida, ultimo.evaluacion, ultimo.umbral, { claro: true, ancho: 900, alto: 380, dpr: 2 });
  const alto = (W * 380) / 900;
  salto(alto + 6);
  doc.addImage(cv.toDataURL('image/png'), 'PNG', M, y, W, alto);
  y += alto + 2;
  texto('Franjas: verde = cubre la banda, ambar = parcial, rojo = no resuena, gris = sin datos. Linea roja discontinua = minimo exigido.', { size: 8, color: [93, 106, 115], gap: 4 });

  // Datos de la medida
  texto('Datos de la medida', { size: 11, bold: true });
  texto([
    `Fecha: ${ultimo.fecha.toLocaleString('es-ES')}`,
    `Equipo: ${meta.equipo}`,
    `Calibracion: ${ultimo.calNombre ?? 'la del equipo'}`,
    `Rango: ${fmtF(ultimo.medida.freq[0])} a ${fmtF(ultimo.medida.freq[ultimo.medida.freq.length - 1])}, ${ultimo.medida.freq.length} puntos, espaciado ${meta.espaciado}${ultimo.afinado ? ', con afinado alrededor de resonancias y bandas' : ''}`,
    roe
      ? `Maximo aceptable: ROE <= ${roeDeRl(ultimo.umbral).toFixed(2)}`
      : `Minimo exigido: perdida de retorno >= ${ultimo.umbral} dB (VSWR <= ${roeDeRl(ultimo.umbral).toFixed(2)})`,
    `Region de bandas: ${meta.region}`,
  ].join('\n'), { size: 9, gap: 4 });

  // Resonancias
  texto('Resonancias detectadas', { size: 11, bold: true });
  if (!ultimo.picos.length) texto('No se detectan resonancias claras en el rango medido.', { size: 9 });
  for (const p of ultimo.picos.slice(0, 8)) {
    const bw = p.fLo != null ? `ancho de banda ${fmtF(p.fHi - p.fLo)}` : `no alcanza ${roe ? `ROE ${roeDeRl(ultimo.umbral).toFixed(2)}` : `${ultimo.umbral} dB`}`;
    texto(`${fmtF(p.f)}  -  ${roe ? `ROE ${p.vswr.toFixed(2)}` : `${p.rl.toFixed(1)} dB  -  VSWR ${p.vswr.toFixed(2)}`}  -  ${bw}`, { size: 9, gap: 0.5 });
  }
  for (const p of ultimo.dudosos ?? []) {
    texto(`${fmtF(p.f)}  -  ${roe ? `ROE ${p.vswr.toFixed(2)}` : `${p.rl.toFixed(1)} dB`}  -  POSIBLEMENTE FALSA: ${p.motivo}`, { size: 8, gap: 0.5 });
  }
  y += 3;

  // Bandas
  texto('Bandas', { size: 11, bold: true });
  const orden = { ok: 0, parcial: 1, no: 2, sin_datos: 3, fuera: 4 };
  const filas = [...ultimo.evaluacion].sort((a, b) => orden[a.estado] - orden[b.estado] || a.banda.f_min - b.banda.f_min);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  for (const e of filas) {
    salto(5);
    const b = e.banda;
    doc.setTextColor(...COLOR[e.estado]); doc.setFont('helvetica', 'bold');
    doc.text(ETIQUETA[e.estado], M, y + 4);
    doc.setTextColor(31, 42, 48); doc.setFont('helvetica', 'normal');
    doc.text(`${b.servicio.toUpperCase()} ${b.nombre} [${b.region.join('/')}]`, M + 28, y + 4);
    doc.text(`${b.f_min} - ${b.f_max} MHz`, M + 100, y + 4);
    if (e.fMejor) doc.text(roe ? `ROE ${e.vMejor.toFixed(2)}` : `${e.mejorRl.toFixed(1)} dB, VSWR ${e.vMejor.toFixed(2)}`, M + 140, y + 4);
    y += 5;
  }
  y += 4;

  texto('Notas', { size: 11, bold: true });
  texto([
    '- La precision depende de la calibracion (open/short/load) hecha en el extremo del cable de la antena.',
    '- Por encima de ~1,5 GHz el NanoVNA-H usa armonicos y la medida es menos fiable.',
    '- Los bordes de las bandas varian segun el pais y la licencia: verificalos antes de transmitir.',
    '- El cable y la posicion del cuerpo pueden alterar la medida en antenas pequenas.',
  ].join('\n'), { size: 8.5, color: [93, 106, 115] });

  const nombre = `informe_antena_${ultimo.fecha.toISOString().slice(0, 10)}.pdf`;
  doc.save(nombre);
  return nombre;
}
