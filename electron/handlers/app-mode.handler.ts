import { app, ipcMain } from 'electron';
import { readAppSettings, updateAppSettings, AppMode, NetworkSettings } from '../utils/app-settings.utils';
import { setCurrentDevice } from '../utils/current-device.utils';

export interface AppModeDto {
  mode: AppMode;
  network: NetworkSettings | null;
  /** F5 paso 3: Dispositivo configurado para este PC (FK a dispositivos.id). */
  deviceId?: number | null;
}

export interface AppModeOpResult {
  success: boolean;
  message?: string;
}

const VALID_MODES = new Set<AppMode>(['standalone', 'server', 'client']);

export function registerAppModeHandlers() {
  ipcMain.handle('app-mode-get', async (): Promise<AppModeDto> => {
    const settings = readAppSettings(app.getPath('userData'));
    return {
      mode: settings.mode,
      network: settings.network,
      deviceId: settings.deviceId ?? null,
    };
  });

  ipcMain.handle('app-mode-save', async (_e, payload: AppModeDto): Promise<AppModeOpResult> => {
    if (!payload || !VALID_MODES.has(payload.mode)) {
      return { success: false, message: 'Modo invalido (debe ser standalone | server | client).' };
    }

    let network: NetworkSettings | null = null;
    if (payload.mode === 'server') {
      const port = payload.network?.serverPort ?? 7070;
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return { success: false, message: 'Puerto invalido (1-65535).' };
      }
      network = { serverPort: port };
    } else if (payload.mode === 'client') {
      const url = payload.network?.serverUrl?.trim() || '';
      if (!url) return { success: false, message: 'URL del servidor requerida.' };
      if (!/^https?:\/\/.+/i.test(url)) {
        return { success: false, message: 'URL debe empezar con http:// o https://' };
      }
      network = { serverUrl: url };
    }

    const deviceId = typeof payload.deviceId === 'number' && payload.deviceId > 0
      ? payload.deviceId
      : null;

    updateAppSettings(app.getPath('userData'), (s) => ({
      ...s,
      mode: payload.mode,
      network,
      deviceId,
    }));

    // Sincronizar currentDevice en memoria. main.ts ya lo cargo al boot,
    // pero si el usuario cambia el deviceId en caliente desde la wizard,
    // queremos que el proximo create-venta (mismo proceso) lo refleje.
    setCurrentDevice(deviceId != null ? { id: deviceId } : null);

    return { success: true };
  });

  ipcMain.handle('app-mode-test-server', async (_e, payload: { serverUrl: string }): Promise<AppModeOpResult> => {
    const url = payload?.serverUrl?.trim() || '';
    if (!url) return { success: false, message: 'URL requerida.' };
    // Workaround: Node 18 fetch (undici) en main process puede no fallback de
    // IPv6 a IPv4. Forzar 127.0.0.1 cuando piden localhost.
    const probeUrl = url.replace(/^(https?:\/\/)localhost(:|\/|$)/i, '$1127.0.0.1$2');
    try {
      const versionUrl = probeUrl.replace(/\/$/, '') + '/api/version';
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(versionUrl, { signal: ctrl.signal });
      clearTimeout(t);
      if (!resp.ok) {
        return { success: false, message: `Server respondio HTTP ${resp.status}` };
      }
      const body = await resp.json();
      const version = (body as any)?.appVersion || (body as any)?.version || 'desconocida';
      const driver = (body as any)?.driver || '?';
      return { success: true, message: `Server OK — v${version} (${driver})` };
    } catch (e: any) {
      const msg = e?.message || String(e);
      return { success: false, message: `No se pudo conectar: ${msg}` };
    }
  });
}
