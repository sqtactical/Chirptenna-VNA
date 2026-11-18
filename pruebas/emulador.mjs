// Emulador minimo del shell serie de un NanoVNA con firmware DiSlord (solo lo que usa la web).
// Sirve para probar js/drivers/nanovna-h.js sin hardware: eco del comando, respuesta y prompt "ch> ".
// Los formatos son los que usa vna/nanovna.py de Chirptenna; los numeros concretos son inventados.
// Tambien simula fallos: puerto ocupado, usuario que cancela el selector, equipo mudo y cable desenchufado.

export const gammaCorregido = f => ({ re: 0.5 * Math.cos(f / 1e8), im: 0.3 * Math.sin(f / 1e8) });
export const gammaBruto = f => ({ re: 0.9 * Math.cos(f / 7e7) + 0.05, im: 0.8 * Math.sin(f / 7e7) - 0.02 });
const s21 = f => ({ re: 0.01 * Math.cos(f / 1e9), im: 0.01 });

export class EmuladorNanoVNA {
  constructor({ puntosPorScan = 101, devolverDeMenos = false, version = 'DiSlord NanoVNA-H4 1.2.38 (emulado)', mudo = false, cortarEnScan = 0 } = {}) {
    this.calActiva = true;
    this.barrido = [50000, 900000000, 101];
    this.log = [];                 // comandos recibidos, en orden
    this.puntosPorScan = puntosPorScan;
    this.devolverDeMenos = devolverDeMenos;
    this.versionTexto = version;
    this.mudo = mudo;              // no responde a nada (equipo equivocado, colgado)
    this.cortarEnScan = cortarEnScan; // si > 0: al llegar el scan N el "cable" se desenchufa (lo gestiona puertoFalso)
    this.alCortar = null;
    this._scans = 0;
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
      if (this.mudo) continue;
      if (cmd.startsWith('scan') && this.cortarEnScan && ++this._scans >= this.cortarEnScan) { this.alCortar?.(); return salida; }
      salida += `${cmd}\r\n${this._ejecutar(cmd)}ch> `;
    }
    return salida;
  }

  _ejecutar(cmd) {
    const [nombre, ...a] = cmd.split(/\s+/);
    switch (nombre) {
      case '': return '';
      case 'version': return `${this.versionTexto}\r\n`;
      case 'cal':
        if (a[0] === 'off') { this.calActiva = false; return ''; }
        if (a[0] === 'on') { this.calActiva = true; return ''; }
        return this.calActiva ? "cal'ed: load open short\r\n" : 'cal: off\r\n';
      case 'sweep':
        if (a.length === 3) { this.barrido = a.map(Number); return ''; }
        return `${this.barrido.join(' ')}\r\n`;
      case 'info': return 'Kernel: 5.4.0\r\nBoard: NanoVNA-H4 (emulado)\r\nMax points: 101\r\n';
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

function excepcion(nombre, mensaje) { const e = new Error(mensaje); e.name = nombre; return e; }

// Puerto serie falso con la API de Web Serial: lo imprescindible para que el controlador funcione.
// opciones.falloAbrir: nombre de la excepcion que lanza open() (p. ej. 'InvalidStateError' = puerto ocupado).
export function puertoFalso(emulador, { falloAbrir = null } = {}) {
  const enc = new TextEncoder();
  let ctrl, cortado = false;
  const readable = new ReadableStream({ start(c) { ctrl = c; } });
  const writable = new WritableStream({
    write(chunk) {
      if (cortado) throw excepcion('NetworkError', 'The device has been lost.');
      const texto = new TextDecoder().decode(chunk);
      const resp = emulador.recibir(texto);
      // el equipo real responde en trozos pequenos: se trocea para probar el ensamblado del buffer
      for (let i = 0; i < resp.length; i += 37) ctrl.enqueue(enc.encode(resp.slice(i, i + 37)));
    },
  });
  const puerto = {
    async open() { if (falloAbrir) throw excepcion(falloAbrir, 'Failed to open serial port.'); },
    async close() { try { ctrl.close(); } catch {} },
    readable, writable,
    // Simula sacar el cable USB: se acaba la lectura, fallan las escrituras y salta el evento 'disconnect'
    desenchufar() {
      cortado = true;
      try { ctrl.error(excepcion('NetworkError', 'The device has been lost.')); } catch {}
      for (const f of puerto._oyentes) f({ target: puerto, port: puerto });
    },
    _oyentes: [],
  };
  emulador.alCortar = () => puerto.desenchufar();
  return puerto;
}

// Instala navigator.serial. opciones: { falloRequest: 'NotFoundError' (el usuario cancela), falloAbrir }.
export function instalarSerial(emulador, opciones = {}) {
  const puerto = puertoFalso(emulador, opciones);
  const serial = {
    requestPort: async () => { if (opciones.falloRequest) throw excepcion(opciones.falloRequest, 'No port selected by the user.'); return puerto; },
    addEventListener: (tipo, f) => { if (tipo === 'disconnect') puerto._oyentes.push(f); },
    removeEventListener: (tipo, f) => { puerto._oyentes = puerto._oyentes.filter(x => x !== f); },
  };
  Object.defineProperty(globalThis, 'navigator', { value: { serial }, configurable: true });
  return puerto;
}
