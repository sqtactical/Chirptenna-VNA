// Controlador para NanoVNA-H / H4 con firmware DiSlord (protocolo serie de texto).
// Interfaz comun de los controladores: connect(), disconnect(), scan(), info
// Otros equipos (V2, LiteVNA...) se anaden como ficheros hermanos con la misma interfaz.

const PROMPT = /ch> $/;

// Error del equipo con un codigo que la interfaz puede tratar:
//  cancelado (no se eligio puerto), ocupado (otro programa lo usa), permiso, sin_respuesta,
//  desconectado (se perdio el cable a mitad), respuesta (datos incompletos), ocupado_interno (uso simultaneo).
export class ErrorEquipo extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.name = 'ErrorEquipo'; this.codigo = codigo; }
}

export class DriverNanoVNAH {
  id = 'nanovna-h';
  nombre = 'NanoVNA-H (DiSlord)';
  fMinHz = 50e3;
  fMaxHz = 2.7e9;
  puntosPorBloque = 101; // ajustar si el firmware admite mas por scan (ver comando 'sweep'/'info')
  escalaTiempo = 1;      // multiplica los tiempos de espera (las pruebas lo reducen)
  alPerder = null;       // callback(mensaje) cuando se pierde la conexion fuera de una orden
  aviso = '';            // texto si el equipo no parece un NanoVNA

  async connect() {
    if (!('serial' in navigator)) throw new ErrorEquipo('sin_soporte', 'Este navegador no soporta Web Serial. Usa Chrome o Edge de escritorio.');
    this.perdido = false;
    try {
      this.port = await navigator.serial.requestPort();
    } catch (e) {
      throw this._errorApertura(e, 'elegir');
    }
    try {
      await this.port.open({ baudRate: 115200 });
    } catch (e) {
      this.port = null;
      throw this._errorApertura(e, 'abrir');
    }
    try {
      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      this.buf = '';
      this.dec = new TextDecoder();
      this.enc = new TextEncoder();
      this._notify = null;
      this._rechazar = null;
      this._escucharDesconexion();
      this._pump();
      await this._cmd('', 3000); // sincroniza con el prompt "ch> "
      this.version = (await this._cmd('version', 3000)).split(/\r?\n/).map(s => s.trim()).filter(l => l && l !== 'version' && l !== 'ch>').join(' ');
      this.aviso = /nano|vna|dislord/i.test(this.version) ? '' : 'El equipo no se identifica como NanoVNA; si las medidas salen raras, comprueba que has elegido el puerto correcto.';
    } catch (e) {
      await this.disconnect();
      throw e;
    }
  }

  async disconnect() {
    this._quitarEscucha?.();
    this.perdido = true;
    this._rechazar?.(new ErrorEquipo('desconectado', 'Conexión cerrada.'));
    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = null;
  }

  _errorApertura(e, paso) {
    const n = e?.name;
    if (n === 'NotFoundError') return new ErrorEquipo('cancelado', 'No se eligió ningún equipo.');
    if (n === 'SecurityError') return new ErrorEquipo('permiso', 'El navegador no permite acceder al puerto serie. Comprueba los permisos del sitio o abre la página desde https o localhost.');
    if (n === 'InvalidStateError' || n === 'NetworkError') {
      return new ErrorEquipo('ocupado', 'No se pudo abrir el puerto: otro programa (u otra pestaña) lo está usando. Cierra la app de Chirptenna, PuTTY, el monitor serie de Arduino u otras pestañas con el NanoVNA y vuelve a intentarlo.');
    }
    return new ErrorEquipo('ocupado', `No se pudo ${paso} el puerto serie: ${e?.message || e}`);
  }

  _escucharDesconexion() {
    const f = ev => { if (!ev.target || ev.target === this.port || ev.port === this.port) this._perder('Se desconectó el cable USB del equipo.'); };
    navigator.serial.addEventListener?.('disconnect', f);
    this._quitarEscucha = () => navigator.serial.removeEventListener?.('disconnect', f);
  }

  // Marca la conexion como perdida y avisa a quien espera una respuesta (o a la interfaz si no hay ninguna).
  _perder(mensaje) {
    if (this.perdido) return;
    this.perdido = true;
    const e = new ErrorEquipo('desconectado', `${mensaje} Vuelve a conectar y repite la medida.`);
    if (this._rechazar) this._rechazar(e); else this.alPerder?.(e.message);
  }

  async _pump() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.buf += this.dec.decode(value, { stream: true });
        this._notify?.();
      }
    } catch { /* puerto cerrado o error de lectura */ }
    this._perder('Se perdió la conexión con el equipo.');
  }

  _cmd(cmd, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (this.perdido) return reject(new ErrorEquipo('desconectado', 'No hay conexión con el equipo. Vuelve a conectar.'));
      if (this._rechazar) return reject(new ErrorEquipo('ocupado_interno', 'El equipo está ocupado con otra orden; espera a que termine.'));
      this.buf = '';
      const limpiar = () => { clearTimeout(t); this._notify = null; this._rechazar = null; };
      const t = setTimeout(async () => {
        limpiar();
        // la respuesta tardia podria colarse en la orden siguiente: se descarta lo que llegue en un momento
        await new Promise(r => setTimeout(r, 150 * this.escalaTiempo));
        this.buf = '';
        reject(new ErrorEquipo('sin_respuesta', `El equipo no responde${cmd ? ` a «${cmd.split(' ')[0]}»` : ''}. ¿Está encendido, con firmware DiSlord y sin otro programa usando el puerto?`));
      }, timeoutMs * this.escalaTiempo);
      this._rechazar = e => { limpiar(); reject(e); };
      this._notify = () => {
        if (PROMPT.test(this.buf)) { limpiar(); resolve(this.buf); }
      };
      this.writer.write(this.enc.encode(cmd + '\r')).catch(() => this._perder('No se pudo escribir en el equipo.'));
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
      // Se intenta SIEMPRE devolver el equipo a como estaba (si sigue conectado)
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
      if (filas.length !== n) throw new ErrorEquipo('respuesta', `Bloque ${f0}-${f1}: se esperaban ${n} puntos y llegaron ${filas.length}. Repite la medida; si se repite, prueba otro cable USB.`);
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
