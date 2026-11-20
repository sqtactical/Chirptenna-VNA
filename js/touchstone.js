// Lectura de archivos Touchstone (.s1p / .s2p) de otras herramientas (NanoVNA, openEMS, NEC, CST, fabricantes).
// Devuelve S11 como { freq, re, im } (Hz, parte real e imaginaria) y, si es de dos puertos, también S21.
// Sin DOM: se prueba con Node.
import { T } from './i18n.js';

const UNIDAD = { HZ: 1, KHZ: 1e3, MHZ: 1e6, GHZ: 1e9 };

// Pasa un par de números del formato del archivo (RI, MA o DB) a parte real e imaginaria.
function aComplejo(formato, a, b) {
  if (formato === 'RI') return [a, b];
  const mod = formato === 'DB' ? 10 ** (a / 20) : a, fase = b * Math.PI / 180;
  return [mod * Math.cos(fase), mod * Math.sin(fase)];
}

export function leerTouchstone(texto, nombre = '') {
  let unidad = 1e9, parametro = 'S', formato = 'MA', z0 = 50, vistaOpciones = false;
  const m = /\.s(\d)p$/i.exec(nombre);
  let puertos = m ? +m[1] : 0;
  const nums = [];
  for (const cruda of String(texto).replace(/^﻿/, '').split(/\r?\n/)) {
    const linea = cruda.split('!')[0].trim();
    if (!linea) continue;
    if (linea[0] === '#') {
      if (vistaOpciones) continue; // solo vale la primera línea de opciones
      vistaOpciones = true;
      const t = linea.slice(1).trim().toUpperCase().split(/\s+/);
      for (let i = 0; i < t.length; i++) {
        if (UNIDAD[t[i]]) unidad = UNIDAD[t[i]];
        else if (['S', 'Y', 'Z', 'G', 'H'].includes(t[i])) parametro = t[i];
        else if (['RI', 'MA', 'DB'].includes(t[i])) formato = t[i];
        else if (t[i] === 'R' && t[i + 1] !== undefined) z0 = +t[++i] || 50;
      }
      continue;
    }
    for (const x of linea.split(/\s+/)) nums.push(+x);
  }
  if (parametro !== 'S') throw new Error(T('El archivo no tiene parámetros S (solo se leen S11 y S21).'));
  if (nums.some(Number.isNaN)) throw new Error(T('El archivo Touchstone tiene líneas que no se entienden.'));
  // columnas por punto: frecuencia + 2 por cada parámetro (S1P: 3; S2P: 9). Sin extensión, se deduce del total.
  let ancho = puertos === 2 ? 9 : puertos === 1 ? 3 : 0;
  if (!ancho) ancho = nums.length % 3 === 0 ? 3 : nums.length % 9 === 0 ? 9 : 0;
  if (!ancho || nums.length < ancho) throw new Error(T('No se reconoce el formato del archivo (se esperan 1 o 2 puertos).'));
  puertos = ancho === 3 ? 1 : 2;
  const n = Math.floor(nums.length / ancho);
  const freq = new Float64Array(n), re = new Float64Array(n), im = new Float64Array(n);
  const s21 = puertos === 2 ? { re: new Float64Array(n), im: new Float64Array(n) } : null;
  for (let i = 0; i < n; i++) {
    const o = i * ancho;
    freq[i] = nums[o] * unidad;
    [re[i], im[i]] = aComplejo(formato, nums[o + 1], nums[o + 2]);
    if (s21) [s21.re[i], s21.im[i]] = aComplejo(formato, nums[o + 3], nums[o + 4]); // orden del s2p: S11 S21 S12 S22
  }
  for (let i = 1; i < n; i++) if (!(freq[i] > freq[i - 1])) throw new Error(T('Las frecuencias del archivo no van en orden creciente.'));
  return { freq, re, im, z0, puertos, s21, formato };
}
