import { app, ipcMain } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as QRCode from 'qrcode';
import { readAppSettings } from '../utils/app-settings.utils';

/**
 * Acceso remoto a la PWA vía Cloudflare "quick tunnel" (gratis, sin cuenta ni
 * dominio). Expone http://localhost:<puerto> en una URL pública https://*.trycloudflare.com.
 *
 * El binario `cloudflared` NO se empaqueta (evita +50MB en el instalador): se
 * descarga UNA vez a userData/bin la primera vez que se activa, y queda cacheado.
 * Se corre como proceso hijo y se mata al cerrar la app o al desactivar.
 *
 * La URL del quick tunnel es efímera (cambia en cada arranque) → por eso se
 * devuelve junto a un QR generado al vuelo.
 */

let tunnelProc: ChildProcess | null = null;
let tunnelUrl: string | null = null;
let tunnelQr: string | null = null;

const URL_RE = /https:\/\/[-a-z0-9]+\.trycloudflare\.com/i;

function cloudflaredAsset(): { name: string; bin: string } {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  if (process.platform === 'win32') {
    return { name: `cloudflared-windows-${arch}.exe`, bin: 'cloudflared.exe' };
  }
  if (process.platform === 'darwin') {
    return { name: `cloudflared-darwin-${arch}.tgz`, bin: 'cloudflared' }; // (no soportado aún en mac)
  }
  return { name: `cloudflared-linux-${arch}`, bin: 'cloudflared' };
}

function cloudflaredPath(): string {
  return path.join(app.getPath('userData'), 'bin', cloudflaredAsset().bin);
}

function downloadFile(url: string, dest: string, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('Demasiados redirects'));
    const req = https.get(url, { headers: { 'User-Agent': 'frc-gourmet' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadFile(res.headers.location, dest, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} bajando cloudflared`));
      }
      const tmp = `${dest}.part`;
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        try {
          fs.renameSync(tmp, dest);
          if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      }));
      file.on('error', (e) => { try { fs.unlinkSync(tmp); } catch { /* */ } reject(e); });
    });
    req.on('error', reject);
  });
}

async function ensureCloudflared(): Promise<string> {
  const bin = cloudflaredPath();
  if (fs.existsSync(bin)) return bin;
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  const asset = cloudflaredAsset();
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset.name}`;
  console.log('[remote-tunnel] descargando cloudflared:', url);
  await downloadFile(url, bin);
  console.log('[remote-tunnel] cloudflared listo en', bin);
  return bin;
}

function stopTunnel(): void {
  if (tunnelProc) {
    try { tunnelProc.kill(); } catch { /* */ }
  }
  tunnelProc = null;
  tunnelUrl = null;
  tunnelQr = null;
}

export function registerRemoteTunnelHandlers(): void {
  ipcMain.handle('remote-tunnel-status', () => ({
    running: !!tunnelProc,
    url: tunnelUrl,
    qr: tunnelQr,
  }));

  ipcMain.handle('remote-tunnel-stop', () => {
    stopTunnel();
    return { running: false };
  });

  ipcMain.handle('remote-tunnel-start', async () => {
    if (tunnelProc && tunnelUrl) {
      return { ok: true, running: true, url: tunnelUrl, qr: tunnelQr };
    }
    const settings = readAppSettings(app.getPath('userData'));
    if ((settings as any).mode !== 'server') {
      return { ok: false, error: 'La app no está en modo Servidor.' };
    }
    const port = (settings as any).network?.serverPort || 7070;
    let bin: string;
    try {
      bin = await ensureCloudflared();
    } catch (e: any) {
      return { ok: false, error: `No se pudo descargar cloudflared: ${e?.message || e}` };
    }

    return await new Promise((resolve) => {
      let settled = false;
      const proc = spawn(bin, [
        'tunnel',
        '--no-autoupdate',
        '--url',
        `http://localhost:${port}`,
      ]);
      tunnelProc = proc;

      const onData = async (buf: Buffer) => {
        const text = buf.toString();
        const m = text.match(URL_RE);
        if (m && !settled) {
          settled = true;
          tunnelUrl = m[0];
          try {
            tunnelQr = await QRCode.toDataURL(tunnelUrl, { margin: 1, width: 240 });
          } catch {
            tunnelQr = null;
          }
          resolve({ ok: true, running: true, url: tunnelUrl, qr: tunnelQr });
        }
      };
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);
      proc.on('error', (e) => {
        if (!settled) {
          settled = true;
          stopTunnel();
          resolve({ ok: false, error: `No se pudo iniciar el túnel: ${e.message}` });
        }
      });
      proc.on('exit', () => {
        if (proc === tunnelProc) { tunnelProc = null; tunnelUrl = null; tunnelQr = null; }
      });

      // Timeout si no aparece la URL.
      setTimeout(() => {
        if (!settled) {
          settled = true;
          stopTunnel();
          resolve({ ok: false, error: 'Timeout esperando la URL del túnel.' });
        }
      }, 25000);
    });
  });

  // Asegurar que el proceso hijo muera con la app.
  app.on('before-quit', stopTunnel);
  app.on('will-quit', stopTunnel);
}
