// Genera img/grillo-cable.svg: el grillo de Chirptenna (img/grillo.svg, copiado de docs/logo/ del proyecto Chirptenna)
// peleándose con un cable coaxial que acaba en un conector SMA que sujeta con la pata delantera.
//   node img/generar_variante.mjs
// Se inyectan tres piezas en el SVG original: el cable por DETRÁS del grillo (pasa por debajo del abdomen y de las patas),
// el cable por DELANTE (cruza sobre el abdomen: da la sensación de que lo ha enrollado) y el conector.
import fs from 'node:fs';

const aqui = new URL('.', import.meta.url);
const original = fs.readFileSync(new URL('grillo.svg', aqui), 'utf8').replace(/\r\n/g, '\n');

const FUNDA = '#2e3a42', BRILLO = '#6a7882', SOMBRA = 'rgba(0,0,0,.20)';
// trazos de cable: [capa, d]. «detras» va antes que el grillo (lo tapa); «delante», después.
const TRAMOS = {
  delante1: 'M 6 282 C 40 272, 72 262, 98 244 C 122 232, 154 256, 188 226 C 208 210, 212 188, 202 172',
  detras:   'M 202 172 C 182 162, 108 160, 84 170',
  delante2: 'M 84 170 C 66 154, 60 128, 82 104',
};
const cable = (d, extra = '') => `
    <path d="${d}" transform="translate(2.2 3)" style="fill:none;stroke:${SOMBRA};stroke-width:8;stroke-linecap:round"${extra}/>
    <path d="${d}" style="fill:none;stroke:${FUNDA};stroke-width:7.5;stroke-linecap:round"${extra}/>
    <path d="${d}" transform="translate(-1.3 -1.3)" style="fill:none;stroke:${BRILLO};stroke-width:1.8;stroke-linecap:round;opacity:.75"${extra}/>`;

// Conector SMA mirando hacia arriba, con el origen en el final del cable
const conector = `
  <g id="conector" transform="translate(82 104) rotate(28)">
    <rect x="-4.6" y="-9" width="9.2" height="10" rx="2" style="fill:${FUNDA}"/>
    <rect x="-6.4" y="-19" width="12.8" height="11" rx="2.2" style="fill:#d9a441;stroke:#a97d27;stroke-width:.8"/>
    <rect x="-4.6" y="-34" width="9.2" height="16" style="fill:#d3d8dc;stroke:#9aa3aa;stroke-width:.8"/>
    ${[-31, -27.5, -24, -20.5].map(y => `<line x1="-4.6" y1="${y}" x2="4.6" y2="${y}" style="stroke:#9aa3aa;stroke-width:.9"/>`).join('\n    ')}
    <rect x="-1.4" y="-40" width="2.8" height="7" rx="1" style="fill:#d9a441"/>
  </g>`;

// Se inserta justo después de abrir <g id="axes_1"> (detrás de todo) y justo antes de cerrarlo (delante de todo)
const inicio = original.indexOf('<g id="axes_1">');
if (inicio < 0) throw new Error('No encuentro axes_1 en grillo.svg');
const apertura = inicio + '<g id="axes_1">'.length;
const cierre = original.lastIndexOf('  </g>\n </g>\n <defs>');
if (cierre < 0) throw new Error('No encuentro el cierre de axes_1 en grillo.svg');

const detras = `\n   <g id="cable_detras">${cable(TRAMOS.detras)}\n   </g>`;
const pata = '\n    <path d="M 105.721519 111.189873 L 98.43038 92.962025" style="fill:none;stroke:#1f4a28;stroke-width:6;stroke-linecap:round"/>';
const delante = `   <g id="cable_delante">${cable(TRAMOS.delante1)}${cable(TRAMOS.delante2)}${conector}${pata}\n   </g>\n`;

let svg = original.slice(0, apertura) + detras + original.slice(apertura, cierre) + delante + original.slice(cierre);
svg = svg.replace('<dc:title>Matplotlib', '<dc:title>Chirptenna VNA, variante con cable (base: Matplotlib');
fs.writeFileSync(new URL('grillo-cable.svg', aqui), svg);
console.log('Escrito img/grillo-cable.svg', svg.length, 'bytes');
