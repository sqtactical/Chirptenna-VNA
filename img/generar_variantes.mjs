// Genera las variantes del grillo de Chirptenna VNA en img/variantes/*.svg y la galería img/galeria.html.
//   node img/generar_variantes.mjs
// Parte de img/grillo.svg (el grillo de Chirptenna, 288 × 288) y le añade piezas por detrás o por delante: caras, cables, conectores,
// accesorios... Cada variante es una función que devuelve { detras, delante, ... }. Para añadir una, agrega una entrada a VARIANTES.
import fs from 'node:fs';

const aqui = new URL('.', import.meta.url);
const original = fs.readFileSync(new URL('grillo.svg', aqui), 'utf8').replace(/\r\n/g, '\n');

// ---------- colores ----------
const C = {
  cobre: '#c8892b', verde: '#2f6b3a', verdeC: '#4f9a5c', verdeO: '#1f4a28', texto: '#1f2a24',
  funda: '#2e3a42', brillo: '#6a7882', oro: '#d9a441', oroO: '#a97d27', plata: '#d3d8dc', plataO: '#9aa3aa',
  azul: '#4aa3df', rojo: '#d9534f', ambar: '#f0a30a', lima: '#8bc34a', humo: '#8a949c', papel: '#f4efe4',
};

// ---------- el grillo original ----------
const inicio = original.indexOf('<g id="axes_1">') + '<g id="axes_1">'.length;
const fin = original.lastIndexOf('  </g>\n </g>\n <defs>');
let cuerpoBase = original.slice(inicio, fin);
const sinAntenas = c => c.replace(/<g id="patch_2">[\s\S]*?<\/g>\s*/, '').replace(/<g id="patch_3">[\s\S]*?<\/g>\s*/, '');
// Ojos del grillo: centros (134.9, 102.1) y (153.1, 102.1), radio 4
const OJO = { l: [134.9, 102.1], r: [153.1, 102.1] };

// ---------- piezas ----------
const st = (o) => Object.entries(o).map(([k, v]) => `${k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}:${v}`).join(';');
const trazo = (d, color = C.texto, w = 2, extra = {}) => `<path d="${d}" style="${st({ fill: 'none', stroke: color, strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round', ...extra })}"/>`;
const relleno = (d, color, extra = {}) => `<path d="${d}" style="${st({ fill: color, ...extra })}"/>`;
const circulo = (cx, cy, r, color, extra = {}) => `<circle cx="${cx}" cy="${cy}" r="${r}" style="${st({ fill: color, ...extra })}"/>`;
const rect = (x, y, w, h, color, rx = 0, extra = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" style="${st({ fill: color, ...extra })}"/>`;
const texto = (x, y, s, { tam = 12, color = C.texto, peso = 700, ancla = 'middle' } = {}) =>
  `<text x="${x}" y="${y}" style="${st({ fontFamily: "'Segoe UI',Arial,Helvetica,sans-serif", fontSize: tam, fontWeight: peso, fill: color, textAnchor: ancla })}">${s}</text>`;
const grupo = (contenido, transform = '', id = '') => `<g${id ? ` id="${id}"` : ''}${transform ? ` transform="${transform}"` : ''}>${contenido}</g>`;

const nota = (x, y, color = C.cobre, k = 1) => grupo(
  `<ellipse cx="0" cy="0" rx="4.2" ry="3" transform="rotate(-20)" style="fill:${color}"/>` + trazo('M 3.6 -1 L 3.6 -14 q 5 1 5 7', color, 1.8),
  `translate(${x} ${y}) scale(${k})`);
const gota = (x, y, k = 1) => grupo(relleno('M 0 0 C 3 4, 4.2 6.8, 0 9.5 C -4.2 6.8, -3 4, 0 0 Z', C.azul, { opacity: .9 }), `translate(${x} ${y}) scale(${k})`);
const humo = (x, y, k = 1) => grupo([[0, 0, 7, .8], [8, -5, 6, .65], [-7, -7, 5.5, .6], [2, -13, 6.5, .5]].map(([a, b, r, o]) => circulo(a, b, r, C.humo, { opacity: o })).join(''), `translate(${x} ${y}) scale(${k})`);
const signo = (x, y, s = '?', color = C.cobre, tam = 26) => texto(x, y, s, { tam, color });
const onda = (cx, cy, r, a0, a1, color = C.cobre, w = 2) => { // arco de circunferencia (grados, 0 = derecha, sentido antihorario visual)
  const p = a => [cx + r * Math.cos(-a * Math.PI / 180), cy + r * Math.sin(-a * Math.PI / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return trazo(`M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`, color, w);
};

// Caras: se tapan los ojos originales con el color de la cabeza y se dibujan otros
const cubrir = () => circulo(...OJO.l, 5.6, C.verde) + circulo(...OJO.r, 5.6, C.verde);
const OJOS = {
  feliz: () => cubrir() + [OJO.l, OJO.r].map(([x, y]) => trazo(`M ${x - 4.5} ${y + 1.8} Q ${x} ${y - 5} ${x + 4.5} ${y + 1.8}`, C.texto, 2.2)).join(''),
  cerrados: () => cubrir() + [OJO.l, OJO.r].map(([x, y]) => trazo(`M ${x - 4.5} ${y - 1} Q ${x} ${y + 4.5} ${x + 4.5} ${y - 1}`, C.texto, 2.2)).join(''),
  asustado: () => cubrir() + [OJO.l, OJO.r].map(([x, y]) => circulo(x, y, 5.4, '#fff', { stroke: C.texto, strokeWidth: 1.2 }) + circulo(x, y, 1.7, C.texto)).join(''),
  mirando: (dx, dy) => cubrir() + [OJO.l, OJO.r].map(([x, y]) => circulo(x, y, 5, '#fff', { stroke: C.texto, strokeWidth: 1 }) + circulo(x + dx, y + dy, 2.3, C.texto)).join(''),
  espiral: () => cubrir() + [OJO.l, OJO.r].map(([x, y]) => {
    let d = ''; for (let a = 0; a <= 4.6 * Math.PI; a += .35) { const r = .55 + a * .38; d += `${d ? 'L' : 'M'} ${(x + r * Math.cos(a)).toFixed(1)} ${(y + r * Math.sin(a)).toFixed(1)} `; }
    return circulo(x, y, 5.6, '#fff', { opacity: .95 }) + trazo(d, C.texto, 1.1);
  }).join(''),
  aspa: () => cubrir() + [OJO.l, OJO.r].map(([x, y]) => trazo(`M ${x - 3.5} ${y - 3.5} L ${x + 3.5} ${y + 3.5} M ${x + 3.5} ${y - 3.5} L ${x - 3.5} ${y + 3.5}`, C.texto, 2.2)).join(''),
  grandesBrillo: () => cubrir() + [OJO.l, OJO.r].map(([x, y]) => circulo(x, y, 5.3, C.texto) + circulo(x - 1.6, y - 1.7, 1.8, '#fff') + circulo(x + 1.8, y + 1.7, .9, '#fff')).join(''),
};
const BOCAS = {
  sonrisa: () => trazo('M 137.5 113 Q 144 120 150.5 113', C.texto, 1.9),
  sonrisaPequena: () => trazo('M 139.5 114 Q 144 117.5 148.5 114', C.texto, 1.7),
  abierta: () => relleno('M 136.5 112.2 Q 144 125 151.5 112.2 Z', C.texto) + relleno('M 140 118.2 Q 144 121.6 148 118.2 Q 144 116.2 140 118.2 Z', '#e0607a'),
  neutra: () => trazo('M 139 115.5 L 149 115.5', C.texto, 1.8),
  preocupada: () => trazo('M 137.5 118 Q 144 111.5 150.5 118', C.texto, 1.9),
  ondulada: () => trazo('M 136.5 116 q 2.5 -3 5 0 t 5 0 t 5 0', C.texto, 1.7),
  o: () => circulo(144, 116, 2.9, C.texto),
};
const CEJAS = {
  preocupadas: () => trazo('M 129.5 97.5 L 139 94.8', C.texto, 1.8) + trazo('M 158.5 97.5 L 149 94.8', C.texto, 1.8),
  enfadadas: () => trazo('M 129.5 94.8 L 139 98', C.texto, 1.8) + trazo('M 158.5 94.8 L 149 98', C.texto, 1.8),
};

// Conector SMA: mirando hacia arriba con el origen en el final del cable
const sma = (transform, { color = C.oro } = {}) => grupo(
  rect(-4.6, -9, 9.2, 10, C.funda, 2) +
  rect(-6.4, -19, 12.8, 11, color, 2.2, { stroke: C.oroO, strokeWidth: .8 }) +
  rect(-4.6, -34, 9.2, 16, C.plata, 0, { stroke: C.plataO, strokeWidth: .8 }) +
  [-31, -27.5, -24, -20.5].map(y => `<line x1="-4.6" y1="${y}" x2="4.6" y2="${y}" style="stroke:${C.plataO};stroke-width:.9"/>`).join('') +
  rect(-1.4, -40, 2.8, 7, C.oro, 1), transform);

// Cable coaxial: sombra, funda y brillo
const cable = (d, { w = 7.5, funda = C.funda, brillo = C.brillo } = {}) =>
  `<path d="${d}" transform="translate(2.2 3)" style="fill:none;stroke:rgba(0,0,0,.20);stroke-width:${w + .5};stroke-linecap:round"/>` +
  `<path d="${d}" style="fill:none;stroke:${funda};stroke-width:${w};stroke-linecap:round"/>` +
  `<path d="${d}" transform="translate(-1.3 -1.3)" style="fill:none;stroke:${brillo};stroke-width:${(w * .24).toFixed(1)};stroke-linecap:round;opacity:.75"/>`;
const PATA_IZQ = trazo('M 105.721519 111.189873 L 98.43038 92.962025', C.verdeO, 6);
const PATA_DER = trazo('M 182.278481 111.189873 L 189.56962 92.962025', C.verdeO, 6);

// Cable enrollado en el abdomen que acaba en un SMA sujeto por la pata delantera izquierda (la variante «conecta»)
const ENROLLADO = {
  d1: 'M 6 282 C 40 272, 72 262, 98 244 C 122 232, 154 256, 188 226 C 208 210, 212 188, 202 172',
  dBack: 'M 202 172 C 182 162, 108 160, 84 170',
  d2: 'M 84 170 C 66 154, 60 128, 82 104',
};
const enrollado = (extraConector = '') => ({
  detras: cable(ENROLLADO.dBack),
  delante: cable(ENROLLADO.d1) + cable(ENROLLADO.d2) + sma('translate(82 104) rotate(28)') + extraConector + PATA_IZQ,
});

// Tapa de calibración con letra (O, S, L)
const tapa = (x, y, letra, color) => circulo(x, y, 11, color, { stroke: 'rgba(0,0,0,.25)', strokeWidth: 1.2 }) + texto(x, y + 4.5, letra, { tam: 13, color: '#fff' });
// Conector hembra visto de frente (OPEN)
const hembra = (x, y, r = 22, { pin = false } = {}) =>
  `<polygon points="${[0, 1, 2, 3, 4, 5].map(i => `${(x + r * Math.cos(i * Math.PI / 3 + Math.PI / 6)).toFixed(1)},${(y + r * Math.sin(i * Math.PI / 3 + Math.PI / 6)).toFixed(1)}`).join(' ')}" style="fill:${C.oro};stroke:${C.oroO};stroke-width:1.4"/>` +
  circulo(x, y, r * .72, C.plata, { stroke: C.plataO, strokeWidth: 1.2 }) + circulo(x, y, r * .42, '#2b3238') + (pin ? circulo(x, y, r * .14, C.oro) : '');
// Carta de Smith recortada en el círculo unidad
let idClip = 0;
const smith = (cx, cy, R, { color = C.verdeO, w = .9, traza = true } = {}) => {
  const id = `sm${++idClip}`, k = R;
  const circ = (cxx, cyy, r) => `<circle cx="${(cx + cxx * k).toFixed(2)}" cy="${(cy + cyy * k).toFixed(2)}" r="${(r * k).toFixed(2)}"/>`;
  const rs = [0.5, 1, 2].map(r => circ(r / (1 + r), 0, 1 / (1 + r))).join('');
  const xs = [0.5, 1, 2].flatMap(x => [circ(1, 1 / x, 1 / x), circ(1, -1 / x, 1 / x)]).join('');
  return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>` +
    circulo(cx, cy, R, 'rgba(255,255,255,.85)', { stroke: color, strokeWidth: 1.4 }) +
    `<g clip-path="url(#${id})" style="fill:none;stroke:${color};stroke-width:${w};opacity:.75">${rs}${xs}<line x1="${cx - R}" y1="${cy}" x2="${cx + R}" y2="${cy}"/></g>` +
    (traza ? trazo(`M ${cx + R * .75} ${cy} C ${cx + R * .5} ${cy - R * .7}, ${cx - R * .1} ${cy - R * .5}, ${cx - R * .15} ${cy} C ${cx - R * .2} ${cy + R * .45}, ${cx + R * .25} ${cy + R * .4}, ${cx + R * .15} ${cy + R * .05}`, C.cobre, 2) + circulo(cx + R * .15, cy + R * .05, 2.3, C.rojo) : '');
};
const lupa = (cx, cy, r, { angulo = 45 } = {}) => {
  const a = angulo * Math.PI / 180, x1 = cx + r * Math.cos(a), y1 = cy + r * Math.sin(a);
  return trazo(`M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${(x1 + 20 * Math.cos(a)).toFixed(1)} ${(y1 + 20 * Math.sin(a)).toFixed(1)}`, '#5b4636', 6) +
    circulo(cx, cy, r, 'rgba(255,255,255,.38)', { stroke: '#5b6770', strokeWidth: 3.6 }) + trazo(`M ${cx - r * .6} ${cy - r * .15} Q ${cx - r * .45} ${cy - r * .6} ${cx - r * .05} ${cy - r * .68}`, '#fff', 1.6, { opacity: .8 });
};
// Gráfico de ROE en miniatura (eje, zonas de color y una curva); mínimo en x = dx (0..1) y ancho w
const miniROE = (x, y, w, h, { dx = 0.5, plana = false, banda = null, marca = false } = {}) => {
  const zonas = [[0, .25, C.verdeC], [.25, .45, C.lima], [.45, .7, C.ambar], [.7, 1, C.rojo]];
  let s = rect(x, y, w, h, '#fff', 4, { stroke: C.plataO, strokeWidth: 1.2 });
  s += zonas.map(([a, b, col]) => rect(x + 1, y + h - b * (h - 2) - 1, w - 2, (b - a) * (h - 2), col, 0, { opacity: .28 })).join('');
  if (banda) s += rect(x + banda[0] * w, y + 1, (banda[1] - banda[0]) * w, h - 2, C.oro, 0, { opacity: .32, stroke: C.oroO, strokeWidth: 1 });
  let d = '';
  for (let i = 0; i <= 60; i++) {
    const t = i / 60, px = x + 4 + t * (w - 8);
    const v = plana ? .9 : 1 - .82 * Math.exp(-Math.pow((t - dx) / .12, 2));
    d += `${i ? 'L' : 'M'} ${px.toFixed(1)} ${(y + 3 + v * (h - 8)).toFixed(1)} `;
  }
  s += trazo(d, '#1565c0', 2);
  if (marca) s += `<polygon points="${x + dx * w - 5},${y - 9} ${x + dx * w + 5},${y - 9} ${x + dx * w},${y - 2}" style="fill:${C.oro};stroke:${C.oroO};stroke-width:1"/>`;
  return s;
};

// ---------- variantes ----------
// Cada una: { titulo, uso, vb (viewBox), cuerpo (opcional, p. ej. sin antenas), detras, delante }
const VARIANTES = {};
const v = (id, titulo, uso, def) => { VARIANTES[id] = { titulo, uso, ...def }; };

// 1. Niveles de ROE
v('roe-muy-bien', 'ROE 1–1,5 · Muy bien acoplada', 'Resultado «Muy bien acoplada»: el grillo canta contento', {
  delante: OJOS.feliz() + BOCAS.abierta() +
    nota(56, 118, C.cobre, 1.15) + nota(34, 160, C.verdeC, 1) + nota(236, 118, C.verdeC, 1.15) + nota(256, 162, C.cobre, 1) +
    onda(144, 108, 44, 20, 62, C.verdeC, 1.8) + onda(144, 108, 44, 118, 160, C.verdeC, 1.8) + onda(144, 108, 56, 22, 58, C.verdeC, 1.2) + onda(144, 108, 56, 122, 158, C.verdeC, 1.2),
});
v('roe-aceptable', 'ROE 1,5–2 · Aceptable', 'Resultado «Aceptable»: tranquilo, todo en orden', {
  delante: BOCAS.sonrisaPequena() +
    circulo(232, 70, 17, C.lima, { opacity: .95 }) + trazo('M 223 70 L 230 77 L 242 62', '#fff', 4.2),
});
v('roe-mejorable', 'ROE 2–3 · Mejorable', 'Resultado «Mejorable»: preocupado, con un termómetro', {
  delante: OJOS.mirando(0, -1.2) + CEJAS.preocupadas() + BOCAS.ondulada() + gota(124, 96, .9) + gota(168, 90, .8) +
    grupo(
      rect(-4.5, -30, 9, 40, '#fff', 4.5, { stroke: C.plataO, strokeWidth: 1.4 }) + rect(-1.6, -26, 3.2, 32, C.rojo, 1.6) + circulo(0, 12, 7.5, C.rojo, { stroke: '#a23c38', strokeWidth: 1 }) +
      [-20, -14, -8].map(y => `<line x1="4.5" y1="${y}" x2="9" y2="${y}" style="stroke:${C.plataO};stroke-width:1.3"/>`).join(''),
      'translate(226 150) rotate(18)'),
});
{
  const e = enrollado();
  v('roe-mal', 'ROE > 3 · Mal acoplada', 'Resultado «Mal acoplada»: enredado, chamuscado y con humo', {
    detras: e.detras,
    delante: e.delante + OJOS.espiral() + BOCAS.preocupada() +
      circulo(132, 188, 9, '#000', { opacity: .16 }) + circulo(158, 214, 11, '#000', { opacity: .14 }) + circulo(142, 232, 7, '#000', { opacity: .14 }) +
      humo(168, 66, 1.1) + humo(204, 40, .8) +
      relleno('M 62 76 L 54 92 L 61 92 L 55 108 L 70 88 L 62 88 L 68 76 Z', C.ambar, { stroke: '#b97b00', strokeWidth: .8 }),
  });
}

// 2. Calibración OSL
v('osl-open', 'OPEN · conector abierto', 'Paso «OPEN» del asistente de calibración', {
  delante: OJOS.mirando(-2.2, 2) + BOCAS.o() + hembra(52, 222, 26) + texto(52, 268, 'OPEN', { tam: 15, color: C.funda }) + signo(40, 168, '?', C.cobre, 30) + signo(74, 188, '?', C.cobre, 20),
});
v('osl-short', 'SHORT · cortocircuito', 'Paso «SHORT» del asistente de calibración', {
  delante: OJOS.asustado() + BOCAS.o() + rect(88, 82, 112, 9, C.oro, 4.5, { stroke: C.oroO, strokeWidth: 1.2 }) + PATA_IZQ + PATA_DER +
    relleno('M 86 62 L 78 80 L 85 80 L 79 96 L 94 76 L 87 76 L 92 62 Z', C.ambar, { stroke: '#b97b00', strokeWidth: .8 }) +
    relleno('M 202 62 L 194 80 L 201 80 L 195 96 L 210 76 L 203 76 L 208 62 Z', C.ambar, { stroke: '#b97b00', strokeWidth: .8 }) +
    texto(144, 276, 'SHORT', { tam: 15, color: C.funda }),
});
v('osl-load', 'LOAD · 50 Ω', 'Paso «LOAD» del asistente de calibración', {
  detras: trazo('M 22 262 L 64 262 M 224 262 L 266 262', C.plataO, 3.2) +
    rect(64, 247, 160, 30, '#d9c7a0', 15, { stroke: '#9c8a5f', strokeWidth: 1.4 }) +
    rect(88, 247, 9, 30, C.verdeC) + rect(110, 247, 9, 30, C.texto) + rect(132, 247, 9, 30, C.texto) + rect(188, 247, 9, 30, C.oro),
  delante: OJOS.cerrados() + BOCAS.sonrisa() + texto(144, 296, '50 Ω', { tam: 16, color: C.funda }) +
    trazo('M 40 235 q 6 -9 0 -18 M 52 240 q 6 -9 0 -18', C.verdeC, 2, { opacity: .6 }) + texto(228, 218, 'z', { tam: 18, color: C.verdeC }) + texto(242, 200, 'Z', { tam: 24, color: C.verdeC }),
  vb: '0 0 288 304',
});
v('osl-tramos', 'Calibración por tramos', 'Calibrar «a cachos»: un tramo con cada juego de patrones', {
  delante: OJOS.grandesBrillo() + BOCAS.sonrisa() +
    rect(56, 276, 176, 40, '#e9e3d4', 10, { stroke: '#b8ad92', strokeWidth: 1.4 }) + tapa(88, 296, 'O', C.rojo) + tapa(144, 296, 'S', C.ambar) + tapa(200, 296, 'L', C.azul) +
    trazo('M 76 262 q -26 -20 -30 -44', C.rojo, 3.2) + trazo('M 144 258 q 0 -22 -44 -34', C.ambar, 3.2, { opacity: 0 }) + trazo('M 212 262 q 26 -20 30 -44', C.azul, 3.2),
  vb: '0 0 288 328',
});

// 3. Pantallas de estado
{
  const e = enrollado();
  v('estado-conecta', 'Conecta tu NanoVNA', 'Pantalla vacía: antes de conectar el equipo (la imagen del README)', { detras: e.detras, delante: e.delante });
}
v('estado-desconectado', 'Equipo desconectado', 'Se perdió la conexión: el cable cuelga suelto', {
  delante: OJOS.mirando(0, 2.4) + BOCAS.preocupada() + signo(224, 74, '?', C.cobre, 34) +
    cable('M 202 104 C 226 130, 236 170, 214 208 C 200 232, 232 246, 238 272', { w: 7 }) + sma('translate(202 104) rotate(160)') + sma('translate(238 272) rotate(-30)') + PATA_DER +
    trazo('M 222 242 l 8 -8 M 230 242 l -8 -8', C.rojo, 2.4, { opacity: 0 }) + onda(252, 212, 14, 100, 180, C.rojo, 2.4) + onda(252, 212, 22, 100, 180, C.rojo, 2.4) + trazo('M 238 198 L 266 226', C.rojo, 3),
});
v('estado-midiendo', 'Midiendo… no muevas el cable', 'Barrido en curso: el grillo quieto como una estatua', {
  cuerpo: c => c,
  delante: BOCAS.neutra() + [[18, 18, 1, 1], [270, 18, -1, 1], [18, 270, 1, -1], [270, 270, -1, -1]].map(([x, y, sx, sy]) => trazo(`M ${x} ${y + 26 * sy} L ${x} ${y} L ${x + 26 * sx} ${y}`, C.azul, 3.2)).join('') +
    circulo(236, 52, 20, '#fff', { stroke: C.azul, strokeWidth: 3 }) + texto(236, 60, '3', { tam: 24, color: C.azul }) +
    rect(58, 264, 172, 9, '#fff', 4.5, { stroke: C.azul, strokeWidth: 1.4 }) + rect(60, 266, 104, 5, C.azul, 2.5),
});
v('estado-alejate', 'Aléjate de la antena', 'Cuenta atrás antes de medir: el grillo se aparta', {
  delante: BOCAS.neutra() + gota(126, 94, .8) +
    rect(236, 140, 6, 66, '#8a6d4b') + rect(196, 98, 86, 44, C.papel, 5, { stroke: '#8a6d4b', strokeWidth: 3 }) + texto(239, 118, 'ALÉJATE', { tam: 12, color: C.rojo }) + texto(239, 134, 'de la antena', { tam: 9, color: C.funda, peso: 600 }) +
    [[56, 272], [86, 282], [30, 256]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="3.4" style="fill:${C.humo};opacity:.55"/>`).join('') +
    trazo('M 112 284 L 76 284 M 84 276 L 76 284 L 84 292', C.cobre, 3),
});
v('estado-sin-resonancia', 'Sin resonancia en el rango', 'No se ve ningún mínimo: el grillo busca con una lupa', {
  delante: OJOS.mirando(-1.2, 1.6) + BOCAS.neutra() + miniROE(30, 292, 228, 50, { plana: true }) + lupa(96, 308, 22, { angulo: 50 }) + signo(60, 100, '?', C.cobre, 30),
  vb: '0 0 288 356',
});

// 4. Tipos de usuario y de antena
{
  const beads = [[.38, .0], [.74, .0]];
  const cuentas = [-1, 1].flatMap(lado => beads.map(([t]) => {
    const x = lado < 0 ? 137 + (53 - 137) * t : 151 + (235 - 151) * t, y = 95 + (19 - 95) * t, ang = Math.atan2(19 - 95, (lado < 0 ? 53 - 137 : 235 - 151)) * 180 / Math.PI;
    return grupo(rect(-8, -4.2, 16, 8.4, C.oro, 4, { stroke: C.oroO, strokeWidth: 1 }) + [-3.5, 0, 3.5].map(a => `<line x1="${a}" y1="-4.2" x2="${a}" y2="4.2" style="stroke:${C.oroO};stroke-width:1"/>`).join(''), `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(ang + 90).toFixed(1)})`);
  })).join('');
  v('tipo-multibanda', 'Antena multibanda con trampas', 'Opción «Mi antena es multibanda»: cada antena lleva sus trampas', {
    delante: cuentas + OJOS.grandesBrillo() + BOCAS.sonrisaPequena() + texto(86, 60, '40 m', { tam: 10, color: C.funda }) + texto(200, 60, '20 m', { tam: 10, color: C.funda }),
  });
}
v('tipo-meshtastic', 'Grillo Meshtastic', 'Perfil «Mi nodo Meshtastic» (868 y 915 MHz)', {
  delante: OJOS.grandesBrillo() + BOCAS.sonrisa() +
    rect(128, 156, 32, 44, '#34414a', 6, { stroke: '#1d262c', strokeWidth: 1.2 }) + rect(132, 162, 24, 16, '#9fe3a8', 2) + texto(144, 174, '868', { tam: 8, color: C.funda }) + circulo(138, 188, 2.2, C.rojo) + circulo(146, 188, 2.2, C.ambar) + circulo(154, 188, 2.2, C.lima) +
    trazo('M 158 158 L 176 128', C.funda, 4) + onda(176, 128, 14, 20, 80, C.verdeC, 2.2) + onda(176, 128, 24, 20, 80, C.verdeC, 2.2) + onda(176, 128, 34, 20, 80, C.verdeC, 2.2) +
    rect(214, 150, 54, 24, '#fff', 8, { stroke: C.verdeC, strokeWidth: 2 }) + texto(241, 166, 'hola', { tam: 11, color: C.verdeO }) + relleno('M 222 174 L 218 184 L 232 174 Z', '#fff', { stroke: C.verdeC, strokeWidth: 2 }) +
    rect(20, 176, 52, 24, '#fff', 8, { stroke: C.cobre, strokeWidth: 2 }) + texto(46, 192, '¡oído!', { tam: 11, color: C.cobre }),
});
v('tipo-radioaficionado', 'Radioaficionado', 'Bandas HAM: auriculares, micrófono y un manipulador de CW', {
  delante: OJOS.grandesBrillo() + BOCAS.sonrisa() +
    trazo('M 125 104 C 120 70, 168 70, 163 104', C.funda, 5) + rect(119, 98, 11, 20, C.funda, 5) + rect(158, 98, 11, 20, C.funda, 5) +
    trazo('M 124 117 C 124 128, 132 128, 138 119', C.funda, 2.4) + circulo(139, 119, 3.2, C.funda) +
    rect(24, 244, 78, 8, C.funda, 3) + trazo('M 34 244 L 96 232', C.plata, 5) + circulo(98, 231, 6, C.rojo) + circulo(42, 242, 3, C.oro) +
    texto(172, 82, '·–·', { tam: 20, color: C.cobre }) + texto(218, 64, '–··', { tam: 16, color: C.verdeC }) + texto(250, 96, '–', { tam: 22, color: C.cobre }),
});
v('tipo-principiante', 'Principiante', 'Para quien empieza: gafas grandes y muchas preguntas', {
  delante: OJOS.grandesBrillo() + BOCAS.sonrisaPequena() +
    circulo(...OJO.l, 10, 'rgba(255,255,255,.25)', { stroke: C.funda, strokeWidth: 2.2 }) + circulo(...OJO.r, 10, 'rgba(255,255,255,.25)', { stroke: C.funda, strokeWidth: 2.2 }) + trazo('M 144.4 101 L 143.6 101', C.funda, 2.2) +
    rect(214, 136, 52, 62, '#c94c4c', 5, { stroke: '#8f3030', strokeWidth: 1.4 }) + rect(218, 140, 44, 54, '#fff', 3) + texto(240, 164, 'ROE', { tam: 13, color: C.funda }) + texto(240, 184, '= ?', { tam: 16, color: C.cobre }) +
    signo(66, 84, '?', C.cobre, 30) + signo(36, 120, '?', C.verdeC, 22),
});
v('tipo-experto', 'Experto en RF', 'Modo Avanzado: la carta de Smith en la tripa', {
  delante: OJOS.grandesBrillo() + BOCAS.sonrisaPequena() + smith(144, 200, 27) + texto(224, 86, 'S₁₁', { tam: 14, color: C.funda }) + texto(54, 86, 'X=0', { tam: 12, color: '#9b5de5' }) +
    trazo('M 58 92 L 100 118', '#9b5de5', 1.6, { strokeDasharray: '4 3' }),
});

// 5. Ideas técnicas
v('tec-curva-real', 'Las antenas son la curva medida', 'Las antenas de Koch se convierten en la curva de ROE real', {
  cuerpo: sinAntenas,
  delante: OJOS.grandesBrillo() + BOCAS.sonrisaPequena() +
    trazo('M 136 96 C 126 80, 118 66, 104 60 C 90 54, 84 36, 74 34 C 62 32, 60 48, 50 48 C 42 48, 40 40, 34 40', C.cobre, 5) +
    trazo('M 152 96 C 162 80, 170 66, 184 60 C 198 54, 204 36, 214 34 C 226 32, 228 48, 238 48 C 246 48, 248 40, 254 40', C.cobre, 5) +
    `<polygon points="69,16 79,16 74,26" style="fill:${C.oro};stroke:${C.oroO};stroke-width:1"/>` + `<polygon points="209,16 219,16 214,26" style="fill:${C.oro};stroke:${C.oroO};stroke-width:1"/>`,
});
v('tec-smith', 'Carta de Smith', 'Modo Avanzado: Smith con el trazo de la antena', {
  delante: OJOS.grandesBrillo() + BOCAS.abierta() + smith(144, 200, 30) + trazo('M 66 100 L 112 118', C.cobre, 1.6, { strokeDasharray: '4 3' }) + texto(52, 92, 'Γ', { tam: 20, color: C.funda }),
});
v('tec-onda-estacionaria', 'Ondas estacionarias', 'El origen de la ROE: dos cuerdas con nodos y vientres', {
  delante: OJOS.grandesBrillo() + BOCAS.abierta() +
    [[98.4, 93, -1], [189.6, 93, 1]].map(([x0, y0, dir]) => {
      let d = ''; const L = 80; for (let i = 0; i <= 80; i++) { const t = i / 80; d += `${i ? 'L' : 'M'} ${(x0 + dir * t * L).toFixed(1)} ${(y0 - 9 * Math.sin(t * 3 * Math.PI) * 1).toFixed(1)} `; }
      let d2 = ''; for (let i = 0; i <= 80; i++) { const t = i / 80; d2 += `${i ? 'L' : 'M'} ${(x0 + dir * t * L).toFixed(1)} ${(y0 + 9 * Math.sin(t * 3 * Math.PI) * 1).toFixed(1)} `; }
      const nodos = [1 / 3, 2 / 3, 1].map(t => circulo((x0 + dir * t * L).toFixed(1), y0, 3, C.rojo)).join('');
      return trazo(d, C.cobre, 2.6) + trazo(d2, C.cobre, 1.4, { opacity: .45, strokeDasharray: '3 3' }) + nodos;
    }).join('') + PATA_IZQ + PATA_DER + texto(144, 276, 'ROE = máx / mín', { tam: 13, color: C.funda }),
});
v('tec-latiguillo-largo', 'Latiguillo largo', 'Medir a través de un cable largo: lo enrolla varias veces', {
  detras: [0, 1, 2].map(i => cable(`M 214 ${176 + i * 24} C 186 ${164 + i * 24}, 102 ${164 + i * 24}, 74 ${178 + i * 24}`, { w: 6.5 })).join(''),
  delante: cable('M 10 286 C 36 280, 56 268, 70 252') + [0, 1, 2].map(i => cable(`M ${i % 2 ? 74 : 214} ${178 + i * 24 + 0} C ${i % 2 ? 112 : 176} ${192 + i * 24 + 26}, ${i % 2 ? 176 : 112} ${192 + i * 24 + 26}, ${i % 2 ? 214 : 74} ${178 + i * 24 + 24}`, { w: 6.5 })).join('') +
    sma('translate(238 236) rotate(160)') + OJOS.espiral() + BOCAS.ondulada() + texto(40, 232, '10 m', { tam: 14, color: C.funda }),
});
v('tec-lupa-banda', 'Lupa sobre la banda', 'Modo de segmentos HF: el grillo mira dónde está la banda (▼)', {
  delante: OJOS.mirando(1.4, 2.2) + BOCAS.sonrisaPequena() + miniROE(30, 300, 228, 56, { dx: .55, banda: [.5, .6], marca: true }) + lupa(150, 328, 22, { angulo: 45 }) + texto(144, 292, '40 m · CW', { tam: 12, color: C.funda }),
  vb: '0 0 288 372',
});

// ---------- composición ----------
function documento(id, d) {
  const cuerpo = d.cuerpo ? d.cuerpo(cuerpoBase) : cuerpoBase;
  const vb = d.vb ?? '0 0 288 288';
  const [, , w, h] = vb.split(' ').map(Number);
  return `<?xml version="1.0" encoding="utf-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w * 1.5}" height="${h * 1.5}" viewBox="${vb}" role="img" aria-label="${d.titulo.replace(/"/g, '&quot;')}">
 <title>${d.titulo}</title>
 <desc>Chirptenna VNA · ${d.uso}. Variante generada con img/generar_variantes.mjs a partir del grillo de Chirptenna.</desc>
 <g id="${id}">
  <g id="detras">${d.detras ?? ''}</g>
  <g id="grillo" transform="translate(0 0)">${cuerpo}</g>
  <g id="delante">${d.delante ?? ''}</g>
 </g>
</svg>
`;
}

fs.mkdirSync(new URL('variantes/', aqui), { recursive: true });
const secciones = [
  ['Niveles de ROE (modo Simple)', ['roe-muy-bien', 'roe-aceptable', 'roe-mejorable', 'roe-mal']],
  ['Calibración OSL', ['osl-open', 'osl-short', 'osl-load', 'osl-tramos']],
  ['Pantallas de estado', ['estado-conecta', 'estado-desconectado', 'estado-midiendo', 'estado-alejate', 'estado-sin-resonancia']],
  ['Tipos de usuario y de antena', ['tipo-multibanda', 'tipo-meshtastic', 'tipo-radioaficionado', 'tipo-principiante', 'tipo-experto']],
  ['Ideas técnicas', ['tec-curva-real', 'tec-smith', 'tec-onda-estacionaria', 'tec-latiguillo-largo', 'tec-lupa-banda']],
];
for (const [id, d] of Object.entries(VARIANTES)) fs.writeFileSync(new URL(`variantes/${id}.svg`, aqui), documento(id, d));

// grillo-cable.svg (la imagen del README) es la variante «estado-conecta»
fs.writeFileSync(new URL('grillo-cable.svg', aqui), documento('estado-conecta', VARIANTES['estado-conecta']));

const tarjetas = ([titulo, ids]) => `<h2>${titulo}</h2><div class="rejilla">${ids.map(id => `<figure><img src="variantes/${id}.svg" alt="${VARIANTES[id].titulo}"><figcaption><b>${VARIANTES[id].titulo}</b><br><small>${VARIANTES[id].uso}</small><br><code>${id}.svg</code></figcaption></figure>`).join('')}</div>`;
fs.writeFileSync(new URL('galeria.html', aqui), `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Galería del grillo · Chirptenna VNA</title>
<style>
 body{font:15px/1.4 system-ui,Segoe UI,Arial,sans-serif;margin:0;padding:1.2rem;background:#12171a;color:#e3e9ec}
 h1{margin:.2rem 0 1rem}h2{margin:2rem 0 .6rem;border-bottom:1px solid #2e383e;padding-bottom:.3rem}
 .rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
 figure{margin:0;background:#1c2328;border:1px solid #2e383e;border-radius:10px;padding:10px;text-align:center}
 figure img{width:100%;height:230px;object-fit:contain;background:#fafafa;border-radius:6px}
 figcaption{margin-top:.5rem;text-align:left}small{color:#9aa8b0}code{color:#64a5ff;font-size:.8rem}
 .claro figure img{background:#fff}
</style></head><body>
<h1>El grillo de Chirptenna VNA</h1>
<p>Variantes generadas con <code>node img/generar_variantes.mjs</code> a partir de <code>grillo.svg</code>. ${Object.keys(VARIANTES).length} ilustraciones.</p>
${secciones.map(tarjetas).join('\n')}
</body></html>
`);
console.log(`Escritas ${Object.keys(VARIANTES).length} variantes en img/variantes/ y img/galeria.html`);
