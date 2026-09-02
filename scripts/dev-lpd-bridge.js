#!/usr/bin/env node
/**
 * Puente LPD → CUPS para probar impresión en el Mac de desarrollo.
 *
 * POR QUÉ EXISTE: la app manda los tickets como bytes ESC/POS crudos por LPD
 * (RFC 1179). En macOS, `cups-lpd` viene deshabilitado y, aun habilitándolo,
 * launchd mantiene el socket del puerto 515 abierto pero **nunca lanza el
 * daemon** (`runs = 0`) — una rareza de los jobs `inetdCompatibility`. Este
 * puente hace el mismo trabajo sin tocar nada del sistema: escucha LPD y le
 * pasa los bytes a `lp -o raw`, que sí funciona.
 *
 * SÓLO PARA DESARROLLO. En producción el LPD lo da el servidor de impresión.
 *
 *   node scripts/dev-lpd-bridge.js [puerto] [cola]
 *   node scripts/dev-lpd-bridge.js 5515 ticket_raw
 *
 * Y en la app, la impresora va como `lpr` con dirección
 * `127.0.0.1:5515/ticket_raw`.
 */
const net = require('net');
const { spawn } = require('child_process');

const PUERTO = Number(process.argv[2]) || 5515;
const COLA_DEFAULT = process.argv[3] || 'ticket_raw';
const OK = Buffer.from([0x00]);

function imprimir(cola, datos) {
  return new Promise((resolve) => {
    const p = spawn('lp', ['-d', cola, '-o', 'raw'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let salida = '';
    p.stdout.on('data', (d) => (salida += d));
    p.stderr.on('data', (d) => (salida += d));
    p.on('close', (code) => resolve({ code, salida: salida.trim() }));
    p.stdin.end(datos);
  });
}

const server = net.createServer((sock) => {
  let cola = COLA_DEFAULT;
  let buf = Buffer.alloc(0);
  // esperando: 'cmd' (una línea) | {tipo:'datos', n, destino}
  let esperando = { tipo: 'cmd' };

  sock.on('data', async (chunk) => {
    buf = Buffer.concat([buf, chunk]);

    for (;;) {
      if (esperando.tipo === 'datos') {
        // n bytes + un 0x00 de cierre
        if (buf.length < esperando.n + 1) return;
        const datos = buf.subarray(0, esperando.n);
        buf = buf.subarray(esperando.n + 1);
        const destino = esperando.destino;
        esperando = { tipo: 'cmd' };
        if (destino === 'df') {
          const r = await imprimir(cola, datos);
          const marca = new Date().toLocaleTimeString('es-PY');
          if (r.code === 0) console.log(`[${marca}] ${datos.length} bytes → ${cola}  ${r.salida}`);
          else console.error(`[${marca}] FALLÓ lp (code ${r.code}): ${r.salida}`);
        }
        sock.write(OK);
        continue;
      }

      const nl = buf.indexOf(0x0a);
      if (nl < 0) return;
      const linea = buf.subarray(0, nl);
      buf = buf.subarray(nl + 1);
      const cmd = linea[0];
      const resto = linea.subarray(1).toString('ascii').trim();

      if (cmd === 0x02 && !/^\d+\s/.test(resto)) {
        // 02 <cola> — recibir trabajo
        cola = resto || COLA_DEFAULT;
        console.log(`→ trabajo para la cola "${cola}"`);
        sock.write(OK);
      } else if (cmd === 0x02 || cmd === 0x03) {
        // 02/03 <n> <nombre> — viene un archivo de control (cf) o de datos (df)
        const [nStr, nombre = ''] = resto.split(/\s+/);
        esperando = { tipo: 'datos', n: Number(nStr) || 0, destino: nombre.startsWith('df') ? 'df' : 'cf' };
        sock.write(OK);
      } else {
        sock.write(OK);
      }
    }
  });

  sock.on('error', () => { /* el cliente cortó: no es noticia */ });
});

server.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Puente LPD escuchando en 127.0.0.1:${PUERTO} → cola CUPS "${COLA_DEFAULT}"`);
  console.log(`En la app: impresora tipo "lpr", dirección 127.0.0.1:${PUERTO}/${COLA_DEFAULT}`);
});
