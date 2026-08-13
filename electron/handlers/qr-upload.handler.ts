import { ipcMain } from 'electron';
import * as QRCode from 'qrcode';
import { DataSource } from 'typeorm';
import { ensurePairingServer } from '../server/pairing';
import { startTunnel } from './remote-tunnel.handler';
import {
  closeQrUploadSession,
  createQrUploadSession,
  getQrUploadSession,
} from '../server/qr-upload-store';

/**
 * Handler de emparejamiento QR → subida mobile.
 *
 * El desktop crea una sesión (carpeta destino) y muestra el QR. El celular abre
 * la PWA (`/upload?session=<id>`), sube el archivo vía `POST /api/qr-upload/:id`
 * y el desktop lo recoge por polling. Ver flujo completo en `qr-upload-store.ts`.
 */

// Ruta de la PWA mobile que atiende la subida por QR.
const MOBILE_UPLOAD_PATH = '/upload';

function buildTargetUrl(base: string, sessionId: string): string {
  const clean = base.replace(/\/$/, '');
  return `${clean}${MOBILE_UPLOAD_PATH}?session=${encodeURIComponent(sessionId)}`;
}

async function toQrDataUrl(url: string): Promise<string | null> {
  try {
    return await QRCode.toDataURL(url, { margin: 1, width: 260 });
  } catch {
    return null;
  }
}

/**
 * El sessionId puede llegar como objeto `{ sessionId }` (el preload de Electron
 * envuelve el arg antes del invoke) o como string posicional (los shims HTTP de
 * web /admin y mobile pasan los args verbatim a `/api/rpc`, sin ese wrapping).
 * Aceptar ambas formas para que el handler funcione por IPC y por RPC. Sin esto,
 * por /admin `input.sessionId` era undefined y el poll devolvia `expired: true`.
 */
function resolveSessionId(input: any): string | undefined {
  if (typeof input === 'string') return input;
  return input?.sessionId;
}

export function registerQrUploadHandler(dataSource: DataSource): void {
  // Crea la sesión + asegura el server LAN + genera el QR (URL LAN por defecto).
  ipcMain.handle(
    'qr-upload-create-session',
    async (_event, input: { carpeta: string; accept?: string; maxSizeMB?: number }) => {
      if (!input?.carpeta) {
        return { ok: false, error: 'carpeta_requerida' };
      }
      let lanUrl: string | null = null;
      try {
        const info = await ensurePairingServer(dataSource);
        lanUrl = info.lanUrl;
      } catch (e: any) {
        return { ok: false, error: `No se pudo iniciar el servidor local: ${e?.message || e}` };
      }
      if (!lanUrl) {
        return {
          ok: false,
          error: 'No se detectó una red local (WiFi/LAN). Conectá la PC a la red o usá el acceso remoto.',
        };
      }

      const session = createQrUploadSession({
        carpeta: input.carpeta,
        accept: input.accept,
        maxSizeMB: input.maxSizeMB,
      });
      const target = buildTargetUrl(lanUrl, session.id);
      const qrDataUrl = await toQrDataUrl(target);

      return {
        ok: true,
        sessionId: session.id,
        lanUrl,
        targetUrl: target,
        qrDataUrl,
        expiresAt: session.expiresAt,
      };
    },
  );

  // Activa el túnel HTTPS (acceso remoto + escáner de cámara en vivo) y
  // regenera el QR apuntando a la URL pública, manteniendo la misma sesión.
  ipcMain.handle('qr-upload-enable-remote', async (_event, input: { sessionId: string } | string) => {
    const session = getQrUploadSession(resolveSessionId(input));
    if (!session) {
      return { ok: false, error: 'sesion_invalida_o_expirada' };
    }
    let info;
    try {
      info = await ensurePairingServer(dataSource);
    } catch (e: any) {
      return { ok: false, error: `No se pudo iniciar el servidor local: ${e?.message || e}` };
    }
    const tunnel = await startTunnel(info.port);
    if (!tunnel.ok || !tunnel.url) {
      return { ok: false, error: tunnel.error || 'No se pudo iniciar el túnel.' };
    }
    const target = buildTargetUrl(tunnel.url, session.id);
    const qrDataUrl = await toQrDataUrl(target);
    return { ok: true, remoteUrl: tunnel.url, targetUrl: target, qrDataUrl };
  });

  // Polling del desktop — devuelve los archivos subidos hasta el momento.
  ipcMain.handle('qr-upload-poll', async (_event, input: { sessionId: string } | string) => {
    const session = getQrUploadSession(resolveSessionId(input));
    if (!session) {
      return { ok: false, expired: true, files: [] };
    }
    return { ok: true, expired: false, files: session.files, expiresAt: session.expiresAt };
  });

  ipcMain.handle('qr-upload-close', async (_event, input: { sessionId: string } | string) => {
    const sessionId = resolveSessionId(input);
    if (sessionId) closeQrUploadSession(sessionId);
    return { ok: true };
  });
}
