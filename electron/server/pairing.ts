import { app } from 'electron';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { getServerInstance, startServer } from './server';
import { readAppSettings } from '../utils/app-settings.utils';

/**
 * Arranque on-demand del server Fastify para el emparejamiento por QR.
 *
 * El server sólo arranca automáticamente en `mode === 'server'` (ver main.ts).
 * Pero la subida por QR debe funcionar también en `standalone` (el caso común
 * de un único PC). Esta función asegura que el Fastify HTTP esté escuchando —
 * `startServer` es idempotente, así que si ya arrancó (modo server) no hace nada.
 */

function resolveMobileStaticRoot(): string | undefined {
  // Mismo criterio que main.ts: servir dist/mobile, resolviendo app.asar.unpacked
  // en el paquete (los binarios nativos/estáticos quedan desempacados por asarUnpack).
  let staticRoot = path.join(app.getAppPath(), 'dist', 'mobile');
  if (
    staticRoot.includes(`app.asar${path.sep}`) &&
    !staticRoot.includes('app.asar.unpacked')
  ) {
    const unpacked = staticRoot.replace(
      `app.asar${path.sep}`,
      `app.asar.unpacked${path.sep}`,
    );
    if (fs.existsSync(unpacked)) staticRoot = unpacked;
  }
  return fs.existsSync(staticRoot) ? staticRoot : undefined;
}

/** Primera IPv4 privada no interna (LAN). null si no se encuentra. */
export function getLanIp(): string | null {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family !== 'IPv4' || iface.internal) continue;
      const ip = iface.address;
      if (
        ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
      ) {
        return ip;
      }
    }
  }
  return null;
}

export interface PairingServerInfo {
  port: number;
  lanUrl: string | null;
}

/**
 * Asegura que el Fastify HTTP esté corriendo (arranca si hace falta, sin importar
 * el modo) y devuelve el puerto + la URL LAN-directa para armar el QR.
 */
export async function ensurePairingServer(dataSource: DataSource): Promise<PairingServerInfo> {
  const userData = app.getPath('userData');
  const settings = readAppSettings(userData);
  const port = (settings as any).network?.serverPort || 7070;

  if (!getServerInstance()) {
    const driver: 'sqlite' | 'postgres' = (settings as any).database?.type || 'sqlite';
    const appVersion = (() => {
      try { return require('../../package.json').version || '0.0.0'; } catch { return '0.0.0'; }
    })();
    const schemaVersion = driver === 'postgres'
      ? 'BaselinePostgres1778380893207'
      : 'Baseline1778378410416';
    const lanIp = getLanIp();
    const lanUrl = lanIp ? `http://${lanIp}:${port}` : undefined;
    await startServer({
      port,
      appVersion,
      schemaVersion,
      driver,
      dataSource,
      staticRoot: resolveMobileStaticRoot(),
      httpsPort: (settings as any).network?.httpsPort,
      certPath: (settings as any).network?.certPath,
      keyPath: (settings as any).network?.keyPath,
      lanUrl,
    });
  }

  const lanIp = getLanIp();
  return { port, lanUrl: lanIp ? `http://${lanIp}:${port}` : null };
}
