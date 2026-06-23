/**
 * Cliente LPR/LPD (RFC 1179) — envía un Buffer crudo a una cola de
 * impresión en un servidor LPD remoto.
 *
 * Caso de uso típico: impresora térmica USB conectada a una PC Windows,
 * compartida via "Servicios de impresión LPD" (Windows Features). La PC
 * Windows escucha en puerto 515 y la cola se identifica con el "share
 * name" de la impresora.
 *
 * El driver Windows recomendado para la impresora compartida es
 * "Generic / Text Only" para que los bytes ESC/POS pasen raw al USB sin
 * interpretación del spooler.
 *
 * Address format: la app espera `printer.address = "IP/QUEUE_NAME"` para
 * connectionType=`lpr`. Ejemplos:
 *   - `192.168.1.50/Cocina`
 *   - `printer-host.local/PrinterShareName`
 *
 * Si no hay slash, se asume cola default `lp`.
 */

import * as net from 'net';
import * as os from 'os';

export interface LprOptions {
  host: string;
  port?: number;             // default 515
  queue: string;             // nombre de la cola/share en el servidor LPD
  user?: string;             // default 'frc-gourmet'
  jobName?: string;          // default 'ticket'
  timeoutMs?: number;        // default 5000
}

/**
 * Parsea `printer.address` para LPR. Soporta:
 *   - "host"             → {host, queue: 'lp'}
 *   - "host/queue"       → {host, queue}
 *   - "host:port/queue"  → {host, port, queue}
 */
export function parseLprAddress(address: string): { host: string; port?: number; queue: string } {
  const [hostPart, queuePart] = (address || '').split('/', 2);
  const queue = (queuePart || 'lp').trim();
  if (hostPart.includes(':')) {
    const [h, p] = hostPart.split(':', 2);
    return { host: h.trim(), port: Number(p) || 515, queue };
  }
  return { host: hostPart.trim(), queue };
}

/**
 * Query del estado de la cola (RFC 1179 §5.3 / §5.4).
 *
 * Envía `\x04 <queue>\n` (status largo) y lee la respuesta hasta que el
 * servidor cierra el socket. Retorna el texto crudo + jobs parseados.
 *
 * Windows LPD responde con un encabezado tabular en español:
 *   "Propietario  Estado  Trabajo  Id. de trabajo  Tamaño  Páginas  Prioridad"
 * seguido de filas (una por job en cola). Si no hay jobs, solo header.
 *
 * Útil para detectar:
 * - Jobs colgados en cola tras impresora apagada / sin papel.
 * - Errores previos sin atender.
 * - "Sanity check" antes de enviar un job nuevo.
 */
export async function queryLprQueueStatus(opts: {
  host: string;
  port?: number;
  queue: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; text?: string; jobCount?: number; error?: string }> {
  const host = opts.host;
  const port = opts.port || 515;
  const queue = opts.queue;
  const timeoutMs = opts.timeoutMs ?? 3000;

  return new Promise(resolve => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let settled = false;
    const finish = (result: { ok: boolean; text?: string; jobCount?: number; error?: string }) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* noop */ }
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish({ ok: false, error: `LPR status: timeout` }));
    socket.on('error', err => finish({ ok: false, error: `LPR status socket: ${err.message}` }));
    socket.on('data', chunk => { buf = Buffer.concat([buf, chunk]); });
    socket.on('close', () => {
      const text = buf.toString('latin1'); // Windows LPD a veces escribe acentos en CP850
      // Heurística: cuenta filas no vacías después del header de columnas
      let jobCount = 0;
      const lines = text.split(/\r?\n/);
      let inJobs = false;
      for (const line of lines) {
        const t = line.trim();
        if (!inJobs) {
          if (/^-{5,}$/.test(t)) inJobs = true;
          continue;
        }
        if (t.length > 0) jobCount++;
      }
      finish({ ok: true, text, jobCount });
    });

    socket.connect(port, host, () => {
      const cmd = Buffer.from(`\x04${queue}\n`, 'ascii');
      socket.write(cmd, err => {
        if (err) finish({ ok: false, error: `LPR status write: ${err.message}` });
      });
    });
  });
}

/**
 * Inspecciona la respuesta del status para detectar palabras de error.
 * Lista ampliada en español + inglés porque Windows LPD emite los strings
 * localizados según el idioma del SO.
 */
function detectStatusError(text: string): string | null {
  if (!text) return null;
  // Patrones de error conocidos en respuestas LPD (Windows + Linux/CUPS)
  const patterns: { rx: RegExp; label: string }[] = [
    { rx: /\berror\b/i, label: 'Error reportado por el servidor de impresión' },
    { rx: /sin\s+papel|out\s+of\s+paper|paper\s+(jam|empty)/i, label: 'Impresora sin papel o atascada' },
    { rx: /atasc/i, label: 'Atasco de papel' },
    { rx: /offline|sin\s+conex|no\s+conect|not\s+ready|no\s+est[áa]\s+lista/i, label: 'Impresora desconectada / no lista' },
    { rx: /pausad|paused/i, label: 'Cola pausada' },
    { rx: /detenid|stopped/i, label: 'Cola detenida' },
    { rx: /needs?\s+attention|requiere\s+atenci[óo]n/i, label: 'La impresora requiere atención' },
    { rx: /apagad|powered?\s+off/i, label: 'Impresora apagada' },
  ];
  for (const p of patterns) {
    if (p.rx.test(text)) return p.label;
  }
  return null;
}

/**
 * Envía `data` (bytes raw, ya formateados ESC/POS si es ticket térmico) a
 * una cola LPD remota.
 *
 * **Modelo de garantía: delegamos en el spooler de Windows**. Si LPDSVC
 * acepta el job (todos los ACKs del protocolo RFC 1179 OK), consideramos
 * que el job está "entregado". Windows va a intentar imprimirlo cuando
 * la impresora física vuelva online — eso ya no es nuestro problema. El
 * único caso en que retornamos error es cuando LPDSVC mismo no responde
 * o rechaza el handshake (servicio caído, firewall, IP inalcanzable,
 * permiso ANONYMOUS LOGON faltante, etc.). El worker de retry de
 * `ventas.handler.ts` reintenta solo en ese caso.
 *
 * **Por qué no validamos impresión física**: Windows LPD responde con
 * el mismo texto (cola vacía) tanto con impresora prendida como apagada.
 * No hay forma de saber por LPR si la impresora física respondió. Si
 * intentáramos detectar por re-query del status, generaríamos jobs
 * duplicados (el worker reintentaría enviar otro job mientras el original
 * sigue pendiente en cola del spooler).
 *
 * Retorna {ok, error?}. NUNCA hace throw — el caller decide bloquear o no.
 */
export async function sendLprJob(data: Buffer, opts: LprOptions): Promise<{ ok: boolean; error?: string }> {
  return await sendLprJobRaw(data, opts);
}

/**
 * Implementación cruda del protocolo LPR (RFC 1179) — sin pre/post checks.
 * Se exporta también porque algunos casos puntuales pueden querer enviar
 * sin overhead de status query (ej: tests, jobs no críticos).
 */
export async function sendLprJobRaw(data: Buffer, opts: LprOptions): Promise<{ ok: boolean; error?: string }> {
  const host = opts.host;
  const port = opts.port || 515;
  const queue = opts.queue;
  const user = (opts.user || 'frc-gourmet').slice(0, 31);
  const hostname = (os.hostname() || 'frc-gourmet').slice(0, 31);
  const jobName = (opts.jobName || 'ticket').slice(0, 99);
  const timeoutMs = opts.timeoutMs ?? 5000;

  // JobId 3 digits (RFC 1179 §6).
  const jobId = String(Math.floor(Math.random() * 900) + 100);

  // Control file (BSD format, RFC 1179 §7)
  const controlFile = [
    `H${hostname}`,
    `P${user}`,
    `J${jobName}`,
    `ldfA${jobId}${hostname}`,
    `UdfA${jobId}${hostname}`,
    `N${jobName}`,
    '',
  ].join('\n');
  const controlBuf = Buffer.from(controlFile, 'ascii');

  return new Promise(resolve => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* noop */ }
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish({ ok: false, error: `Impresora fuera de alcance, se volverá a intentar` }));
    socket.on('error', () => finish({ ok: false, error: `Impresora fuera de alcance, se volverá a intentar` }));

    socket.connect(port, host, async () => {
      try {
        // Step 1 — Receive a printer job: \x02<queue>\n + ACK
        await writeAndExpectAck(socket, Buffer.concat([Buffer.from([0x02]), Buffer.from(`${queue}\n`, 'ascii')]), timeoutMs);

        // Step 2 — Send control file: \x02<size> cfA<jobid><hostname>\n + ACK,
        // then payload + \x00 + ACK
        await writeAndExpectAck(
          socket,
          Buffer.from(`\x02${controlBuf.length} cfA${jobId}${hostname}\n`, 'ascii'),
          timeoutMs,
        );
        await writeAndExpectAck(socket, Buffer.concat([controlBuf, Buffer.from([0x00])]), timeoutMs);

        // Step 3 — Send data file: \x03<size> dfA<jobid><hostname>\n + ACK,
        // then payload + \x00 + ACK
        await writeAndExpectAck(
          socket,
          Buffer.from(`\x03${data.length} dfA${jobId}${hostname}\n`, 'ascii'),
          timeoutMs,
        );
        await writeAndExpectAck(socket, Buffer.concat([data, Buffer.from([0x00])]), timeoutMs);

        finish({ ok: true });
      } catch (e: any) {
        finish({ ok: false, error: e?.message || `LPR: ${String(e)}` });
      }
    });
  });
}

/**
 * Escribe en el socket y espera 1 byte de respuesta. ACK válido = 0x00.
 * Cualquier otro byte = error según RFC 1179.
 */
function writeAndExpectAck(socket: net.Socket, payload: Buffer, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      socket.removeListener('data', onData);
      reject(new Error('LPR: timeout esperando ACK'));
    }, timeoutMs);

    const onData = (buf: Buffer) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      socket.removeListener('data', onData);
      const code = buf[0];
      if (code === 0x00) resolve();
      else reject(new Error(`LPR: servidor LPD rechazó (código ${code})`));
    };
    socket.on('data', onData);

    socket.write(payload, err => {
      if (err) {
        done = true;
        clearTimeout(t);
        socket.removeListener('data', onData);
        reject(err);
      }
    });
  });
}
