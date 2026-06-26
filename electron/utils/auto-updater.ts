/**
 * Wrapper para electron-updater.
 *
 * Lee `update-config.json` en userData para saber qué canal seguir
 * (`stable` | `beta` | `alpha`). Si no existe, infiere del nombre de la versión
 * actual (ej: `1.0.0-beta.3` → canal `beta`).
 *
 * Mensajes de UX:
 *  - update-available → notifica que hay actualización disponible
 *  - update-downloaded → diálogo "Cerrar y actualizar" / "Más tarde"
 *  - error → log silencioso, reintento al próximo polling
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import type { UpdateInfo } from 'electron-updater';
import { readAppSettings, updateAppSettings } from './app-settings.utils';

let autoUpdater: any | null = null;
let pollTimer: NodeJS.Timeout | null = null;

const GH_OWNER = 'GabFrank';
const GH_REPO = 'frc-gourmet';
const LEGACY_UPDATE_CONFIG_FILE = 'update-config.json';
const POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 min
const STARTUP_DELAY_MS = 8 * 1000; // 8s después de window ready

export type UpdateChannel = 'stable' | 'beta' | 'alpha';

// electron-updater busca <channel>.yml. Mapeo interno → manifest publicado:
//   stable → latest.yml (default de electron-builder, NO existe stable.yml)
//   beta   → beta.yml
//   alpha  → alpha.yml
function toUpdaterChannel(c: UpdateChannel): string {
  return c === 'stable' ? 'latest' : c;
}

interface UpdateConfig {
  channel: UpdateChannel;
  autoCheck: boolean;
  lastCheckAt?: string;
}

const DEFAULT_CONFIG: UpdateConfig = {
  channel: 'stable',
  autoCheck: true,
};

function legacyConfigPath(): string {
  return path.join(app.getPath('userData'), LEGACY_UPDATE_CONFIG_FILE);
}

function inferChannelFromVersion(version: string): UpdateChannel {
  if (version.includes('-alpha')) return 'alpha';
  if (version.includes('-beta')) return 'beta';
  return 'stable';
}

function migrateLegacyUpdateConfig(): void {
  const p = legacyConfigPath();
  if (!fs.existsSync(p)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<UpdateConfig>;
    updateAppSettings(app.getPath('userData'), (s) => ({
      ...s,
      update: { ...s.update, ...raw },
    }));
    fs.unlinkSync(p);
    console.log('[auto-updater] update-config.json migrado a app-settings.json y eliminado.');
  } catch (e) {
    console.warn('[auto-updater] error migrando update-config legacy:', e);
  }
}

function readUpdateConfig(): UpdateConfig {
  migrateLegacyUpdateConfig();
  // El canal del BINARIO en ejecución manda para prereleases: un .exe alpha/beta
  // SIEMPRE sigue su propio canal. Antes el canal salía del default 'stable' de
  // app-settings (que existe apenas se guarda cualquier setting), así que un .exe
  // alpha quedaba en canal stable y recibía el aviso de update stable. Bug.
  const inferred = inferChannelFromVersion(app.getVersion());
  try {
    const settings = readAppSettings(app.getPath('userData'));
    const persisted = settings.update;
    // Prerelease (alpha/beta): forzar el canal del binario.
    // Stable: respetar la elección del usuario (puede optar a beta/alpha por UI).
    const channel: UpdateChannel = inferred !== 'stable' ? inferred : persisted.channel;
    return {
      channel,
      autoCheck: persisted.autoCheck,
      lastCheckAt: persisted.lastCheckAt,
    };
  } catch (e) {
    console.warn('[auto-updater] No se pudo leer settings:', e);
    return { ...DEFAULT_CONFIG, channel: inferred };
  }
}

function writeUpdateConfig(cfg: UpdateConfig): void {
  updateAppSettings(app.getPath('userData'), (s) => ({
    ...s,
    update: { channel: cfg.channel, autoCheck: cfg.autoCheck, lastCheckAt: cfg.lastCheckAt },
  }));
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  if (!app.isPackaged) {
    console.log('[auto-updater] App no empaquetada — autoUpdater desactivado.');
    return;
  }

  // Carga lazy para no romper en dev (electron-updater requiere build artifacts).
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    console.error('[auto-updater] electron-updater no disponible:', e);
    return;
  }

  const cfg = readUpdateConfig();
  autoUpdater.channel = toUpdaterChannel(cfg.channel);
  // autoDownload=false: descargamos manualmente SOLO si el canal de la versión
  // ofrecida coincide con el suscripto (guard contra cross-channel del provider
  // de GitHub, que con allowPrerelease puede colar un stable más nuevo por semver).
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = cfg.channel !== 'stable';
  autoUpdater.logger = console;

  // Apps unsigned (sin SignPath ni CSC): desactivar verificacion de firma del
  // installer descargado. Sin esto, electron-updater rechaza el .exe con
  // "publisher names do not match" porque el package.json:nsis.publisherName
  // esta seteado pero el binario no esta firmado. El deploy es interno (LAN),
  // la confianza viene del GitHub Release controlado, no de la firma.
  //
  // OJO: en electron-updater 6.x esto NO es un boolean. La propiedad es una
  // FUNCION `(publisherNames: string[], path: string) => Promise<string | null>`
  // donde retornar `null` significa "OK, sin error". Asignar `false` no
  // desactiva nada (queda la funcion default que corre PowerShell y choca con
  // Execution Policy en sistemas restringidos).
  //
  // Para activar verificacion real: configurar SIGNPATH_API_TOKEN + remover
  // esta linea. Ver workflows/release-y-deploy.md.
  autoUpdater.verifyUpdateCodeSignature = () => Promise.resolve(null);

  autoUpdater.on('checking-for-update', () => {
    sendStatus(mainWindow, 'checking');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    // Guard de canal: ignorar versiones de un canal distinto al suscripto.
    // Ej: estás en alpha y el provider ofrece un stable más nuevo → no actualizar.
    const suscripto = readUpdateConfig().channel;
    const ofrecido = inferChannelFromVersion(info.version);
    if (ofrecido !== suscripto) {
      console.log(
        `[auto-updater] Ignorando update ${info.version}: canal '${ofrecido}' ≠ suscripto '${suscripto}'.`,
      );
      sendStatus(mainWindow, 'not-available', info);
      return;
    }
    console.log('[auto-updater] Update disponible:', info.version);
    sendStatus(mainWindow, 'available', info);
    // Descarga manual (autoDownload=false). update-downloaded dispara el diálogo.
    autoUpdater.downloadUpdate().catch((e: Error) => {
      console.error('[auto-updater] downloadUpdate falló:', e);
      sendStatus(mainWindow, 'error', { message: e.message });
    });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    sendStatus(mainWindow, 'not-available', info);
  });

  autoUpdater.on('download-progress', (progress: any) => {
    sendStatus(mainWindow, 'progress', progress);
  });

  autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
    console.log('[auto-updater] Update descargado:', info.version);
    sendStatus(mainWindow, 'downloaded', info);
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Cerrar y actualizar', 'Más tarde'],
      defaultId: 0,
      cancelId: 1,
      title: 'Actualización disponible',
      message: `FRC Gourmet ${info.version} está listo para instalar.`,
      detail: 'La app se cerrará y se reiniciará con la nueva versión.',
    });
    if (choice.response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('[auto-updater] Error:', err);
    sendStatus(mainWindow, 'error', { message: err.message });
  });

  if (cfg.autoCheck) {
    setTimeout(() => triggerCheck(), STARTUP_DELAY_MS);
    pollTimer = setInterval(() => triggerCheck(), POLL_INTERVAL_MS);
  }

  registerIpc();
}

/** GET JSON simple (GitHub API). Devuelve null ante cualquier error. */
function fetchJson(url: string): Promise<any> {
  return new Promise((resolve) => {
    https
      .get(
        url,
        { headers: { 'User-Agent': 'frc-gourmet-updater', Accept: 'application/vnd.github+json' } },
        (res) => {
          if (!res.statusCode || res.statusCode >= 300) {
            res.resume();
            resolve(null);
            return;
          }
          let data = '';
          res.on('data', (d) => (data += d));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          });
        },
      )
      .on('error', () => resolve(null));
  });
}

/**
 * Devuelve el tag del ÚLTIMO release del canal pedido (alpha/beta), resolviendo
 * por la API de GitHub. Esto evita que el provider de electron-updater elija el
 * release de mayor semver (típicamente un stable) y deje al canal alpha varado:
 * un binario alpha debe seguir SIEMPRE el último alpha, aunque exista un stable
 * con número más alto. null si no hay release de ese canal o falla la red.
 */
async function fetchLatestTagForChannel(channel: UpdateChannel): Promise<string | null> {
  const releases = await fetchJson(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases?per_page=30`,
  );
  if (!Array.isArray(releases)) return null;
  // La API devuelve los releases de más nuevo a más viejo → el primero que
  // matchea el canal es el más reciente.
  for (const r of releases) {
    if (r.draft) continue;
    const tag = String(r.tag_name || '');
    const version = tag.replace(/^v/, '');
    if (version && inferChannelFromVersion(version) === channel) return tag;
  }
  return null;
}

/**
 * Apunta el feed del updater según el canal:
 *  - stable: provider GitHub normal (usa el último release no-prerelease).
 *  - alpha/beta: provider 'generic' apuntando al ÚLTIMO release de ese canal
 *    (lee su latest.yml), para no ser eclipsado por un stable de mayor semver.
 */
async function resolveFeedForChannel(channel: UpdateChannel): Promise<void> {
  if (!autoUpdater) return;
  autoUpdater.allowPrerelease = channel !== 'stable';
  if (channel === 'stable') {
    autoUpdater.setFeedURL({ provider: 'github', owner: GH_OWNER, repo: GH_REPO });
    return;
  }
  const tag = await fetchLatestTagForChannel(channel);
  if (tag) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/${tag}`,
      channel: 'latest',
    });
  } else {
    // Sin release del canal o sin red → fallback al provider GitHub.
    autoUpdater.setFeedURL({ provider: 'github', owner: GH_OWNER, repo: GH_REPO });
  }
}

function triggerCheck(): void {
  if (!autoUpdater) return;
  void (async () => {
    try {
      const cfg = readUpdateConfig();
      cfg.lastCheckAt = new Date().toISOString();
      writeUpdateConfig(cfg);
      await resolveFeedForChannel(cfg.channel);
      autoUpdater.checkForUpdates();
    } catch (e) {
      console.error('[auto-updater] checkForUpdates falló:', e);
    }
  })();
}

function sendStatus(win: BrowserWindow, status: string, payload?: any): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('auto-update:status', { status, payload });
}

function registerIpc(): void {
  ipcMain.handle('auto-update:get-config', () => readUpdateConfig());
  ipcMain.handle('auto-update:set-channel', (_event, channel: UpdateChannel) => {
    const cfg = readUpdateConfig();
    cfg.channel = channel;
    writeUpdateConfig(cfg);
    if (autoUpdater) {
      autoUpdater.channel = toUpdaterChannel(channel);
      autoUpdater.allowPrerelease = channel !== 'stable';
    }
    return cfg;
  });
  ipcMain.handle('auto-update:set-auto-check', (_event, enabled: boolean) => {
    const cfg = readUpdateConfig();
    cfg.autoCheck = enabled;
    writeUpdateConfig(cfg);
    if (enabled && !pollTimer) {
      pollTimer = setInterval(() => triggerCheck(), POLL_INTERVAL_MS);
    } else if (!enabled && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    return cfg;
  });
  ipcMain.handle('auto-update:check-now', () => {
    triggerCheck();
    return { ok: true };
  });
  ipcMain.handle('auto-update:quit-and-install', () => {
    if (autoUpdater) autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
}

export function disposeAutoUpdater(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
