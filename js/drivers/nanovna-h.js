// Controlador para NanoVNA-H / H4 con firmware DiSlord (protocolo serie de texto).
// Interfaz comun de los controladores: connect(), disconnect(), scan(), info
// Otros equipos (V2, LiteVNA...) se anaden como ficheros hermanos con la misma interfaz.

const PROMPT = /ch> $/;

export class DriverNanoVNAH {
  id = 'nanovna-h';
  nombre = 'NanoVNA-H (DiSlord)';
  fMinHz = 50e3;
  fMaxHz = 2.7e9;
  puntosPorBloque = 101; // ajustar si el firmware admite mas por scan (ver comando 'sweep'/'info')

  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    this.reader = this.port.readable.getReader();
    this.buf = '';
    this.dec = new TextDecoder();
    this.enc = new TextEncoder();
    this._notify = null;
    this._pump();
    await this._cmd('', 3000); // sincroniza con el prompt "ch> "
    this.version = (await this._cmd('version', 3000)).split(/\r?\n/).map(s => s.trim()).filter(l => l && l !== 'version' && l !== 'ch>').join(' ');
  }

  async disconnect() {
    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = null;
  }

  async _pump() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.buf += this.dec.decode(value, { stream: true });
        this._notify?.();
      }
    } catch { /* puerto cerrado */ }
  }

  _cmd(cmd, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      this.buf = '';
      const t = setTimeout(() => {
        this._notify = null;
        reject(new Error(`Sin respuesta del equipo a "${cmd}"`));
      }, timeoutMs);
      this._notify = () => {
        if (PROMPT.test(this.buf)) {
          clearTimeout(t);
          this._notify = null;
          resolve(this.buf);
        }
      };
      this.writer.write(this.enc.encode(cmd + '\r')).catch(e => { clearTimeout(t); reject(e); });
    });
  }

  // Devuelve { freq: Float64Array (Hz), re: Float64Array, im: Float64Array } de S11.
  // El equipo aplica la calibracion que tenga activa.
  // espaciado: 'log' (por bloques: cada bloque es lineal, pero los bloques siguen una progresion geometrica)
  // o 'lineal'. El comando scan solo admite rangos lineales, asi que el espaciado log se logra encadenando scans.
  // opts.bruto: devuelve los datos SIN corregir (para la calibracion propia de la app). Igual que
  // vna/calibracion.py de Chirptenna: 'cal off' durante el barrido y, al terminar, 'cal on' (si estaba
  // activa) y se restaura el barrido, porque scan puede cambiar el numero de puntos.
  async scan(startHz, stopHz, points, onProgress = () => {}, espaciado = 'log', { bruto = false } = {}) {
    if (!bruto) return this._scan(startHz, stopHz, points, onProgress, espaciado);
    const estadoCal = await this._cmd('cal', 3000);
    const calActiva = /cal'ed/i.test(estadoCal);
    let barrido = null;
    try {
      const l = (await this._cmd('sweep', 3000)).split(/\r?\n/).map(s => s.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/)).find(Boolean);
      if (l) barrido = [l[1], l[2], l[3]];
    } catch {}
    await this._cmd('cal off', 3000);
    try {
      return await this._scan(startHz, stopHz, points, onProgress, espaciado);
    } finally {
      try {
        if (calActiva) await this._cmd('cal on', 3000);
        if (barrido) await this._cmd(`sweep ${barrido.join(' ')}`, 3000);
      } catch {}
    }
  }

  async _scan(startHz, stopHz, points, onProgress, espaciado) {
    const objetivo = espaciado === 'log'
      ? i => startHz * Math.pow(stopHz / startHz, i / (points - 1))
      : i => startHz + (i * (stopHz - startHz)) / (points - 1);
    const freq = new Float64Array(points), re = new Float64Array(points), im = new Float64Array(points);
    const C = this.puntosPorBloque;
    let hecho = 0;
    while (hecho < points) {
      let i0 = hecho;
      const i1 = Math.min(points - 1, i0 + C - 1);
      let skip = 0;
      if (i1 - i0 < 1) { i0 = i1 - 1; skip = 1; } // un scan necesita >=2 puntos: se solapa 1 punto
      const n = i1 - i0 + 1;
      const f0 = Math.round(objetivo(i0)), f1 = Math.round(objetivo(i1));
      // Mascara 7 (frecuencia + S11 + S21), igual que vna/nanovna.py de Chirptenna. Se usan solo freq y S11.
      const out = await this._cmd(`scan ${f0} ${f1} ${n} 7`, 20000);
      const filas = [];
      for (const l of out.split(/\r?\n/)) {
        const m = l.trim().match(/^(\d+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)(?:\s+-?[\d.eE+-]+\s+-?[\d.eE+-]+)?$/);
        if (m) filas.push([+m[1], +m[2], +m[3]]);
      }
      if (filas.length !== n) throw new Error(`Bloque ${f0}-${f1}: se esperaban ${n} puntos y llegaron ${filas.length}`);
      for (let k = skip; k < n; k++) {
        const j = i0 + k;
        [freq[j], re[j], im[j]] = filas[k];
      }
      hecho = i1 + 1;
      onProgress(hecho / points);
    }
    try { await this._cmd('resume', 3000); } catch {}
    return { freq, re, im };
  }
}
