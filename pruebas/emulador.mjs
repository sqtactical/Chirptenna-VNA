// Emulador minimo del shell serie de un NanoVNA con firmware DiSlord (solo lo que usa la web).
// Sirve para probar js/drivers/nanovna-h.js sin hardware: eco del comando, respuesta y prompt "ch> ".
// Los formatos son los que usa vna/nanovna.py de Chirptenna; los numeros concretos son inventados.

export const gammaCorregido = f => ({ re: 0.5 * Math.cos(f / 1e8), im: 0.3 * Math.sin(f / 1e8) });
export const gammaBruto = f => ({ re: 0.9 * Math.cos(f / 7e7) + 0.05, im: 0.8 * Math.sin(f / 7e7) - 0.02 });
const s21 = f => ({ re: 0.01 * Math.cos(f / 1e9), im: 0.01 });

export class EmuladorNanoVNA {
  constructor({ puntosPorScan = 101, devolverDeMenos = false } = {}) {
    this.calActiva = true;
    this.barrido = [50000, 900000000, 101];
    this.log = [];                 // comandos recibidos, en orden
    this.puntosPorScan = puntosPorScan;
    this.devolverDeMenos = devolverDeMenos;
    this._buf = '';
  }

  // Devuelve el texto que el equipo enviaria como respuesta a lo recibido (eco incluido).
  recibir(texto) {
    let salida = '';
    for (const ch of texto) {
      if (ch !== '\r') { this._buf += ch; continue; }
      const cmd = this._buf.trim();
      this._buf = '';
      this.log.push(cmd);
      salida += `${cmd}\r\n${this._ejecutar(cmd)}ch> `;
    }
    return salida;
  }

  _ejecutar(cmd) {
    const [nombre, ...a] = cmd.split(/\s+/);
    switch (nombre) {
      case '': return '';
      case 'version': return 'DiSlord NanoVNA-H4 1.2.38 (emulado)\r\n';
      case 'cal':
        if (a[0] === 'off') { this.calActiva = false; return ''; }
        if (a[0] === 'on') { this.calActiva = true; return ''; }
        return this.calActiva ? "cal'ed: load open short\r\n" : 'cal: off\r\n';
      case 'sweep':
        if (a.length === 3) { this.barrido = a.map(Number); return ''; }
        return `${this.barrido.join(' ')}\r\n`;
      case 'resume': return '';
      case 'scan': {
        const [f0, f1, n, mask] = a.map(Number);
        if (mask !== 7) return `mascara no soportada: ${mask}\r\n`;
        if (n > this.puntosPorScan) return 'error: demasiados puntos\r\n';
        const total = this.devolverDeMenos ? n - 1 : n;
        let s = '';
        for (let i = 0; i < total; i++) {
          const f = Math.round(n === 1 ? f0 : f0 + (i * (f1 - f0)) / (n - 1));
          const g = this.calActiva ? gammaCorregido(f) : gammaBruto(f), t = s21(f);
          s += `${f} ${g.re.toFixed(6)} ${g.im.toFixed(6)} ${t.re.toFixed(6)} ${t.im.toFixed(6)}\r\n`;
        }
        return s;
      }
      default: return `${nombre}?\r\n`;
    }
  }
}

// Puerto serie falso con la API de Web Serial: lo imprescindible para que el controlador funcione.
export function puertoFalso(emulador) {
  const enc = new TextEncoder();
  let ctrl;
  const readable = new ReadableStream({ start(c) { ctrl = c; } });
  const writable = new WritableStream({
    write(chunk) {
      const texto = new TextDecoder().decode(chunk);
      const resp = emulador.recibir(texto);
      // el equipo real responde en trozos pequenos: se trocea para probar el ensamblado del buffer
      for (let i = 0; i < resp.length; i += 37) ctrl.enqueue(enc.encode(resp.slice(i, i + 37)));
    },
  });
  return {
    async open() {},
    async close() { try { ctrl.close(); } catch {} },
    readable, writable,
  };
}

export function instalarSerial(emulador) {
  const puerto = puertoFalso(emulador);
  Object.defineProperty(globalThis, 'navigator', {
    value: { serial: { requestPort: async () => puerto } },
    configurable: true,
  });
  return puerto;
}
