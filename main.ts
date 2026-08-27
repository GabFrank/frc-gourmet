// Use ES Module import syntax
import { app, BrowserWindow, protocol, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';
// os is now only used in system.handler.ts
// import * as os from 'os';
// Import TypeORM and reflect-metadata (required for TypeORM decorators)
import 'reflect-metadata';
// Remove unused imports related to moved handlers
// const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer');
// Remove jwt as it's moved to auth.handler
// const jwt = require('jsonwebtoken');
// imageHandler only used in protocol handler now
// const imageHandler = require('./electron/utils/image-handler');

// Import TypeORM-related code
// import { DataSource } from 'typeorm'; // not used here
import { DatabaseService } from './src/app/database/database.service';
// Keep Usuario import for currentUser type
import { Usuario } from './src/app/database/entities/personas/usuario.entity';

// Import the new handler registration functions
import { installHandlerRegistry, handlerRegistryCount } from './electron/utils/handler-registry';
import { startServer, stopServer } from './electron/server/server';
import { registerAllAppHandlers } from './electron/utils/register-all-handlers';
import { iniciarRuntimeMusica } from './electron/services/musica-runtime.service';
import { startAcreditacionesScheduler } from './electron/handlers/banking.handler';
import { seedPermissions } from './electron/handlers/permissions.handler';
import { seedConfiguracionRrhh } from './electron/handlers/configuracion-rrhh.handler';
import { seedLiquidacionConceptos } from './electron/handlers/liquidacion-sueldo.handler';
import { generarNotificacionesRrhh } from './electron/handlers/notificaciones-rrhh.handler';
import { startAutoBackupScheduler } from './electron/handlers/backup.handler';
import { seedNotificaciones } from './electron/handlers/notificaciones-config.handler';
import { seedInitialData } from './electron/utils/seed-data';
import { runBootstrapMigrations } from './electron/utils/db-migrations-bootstrap';
import { seedSystemData } from './electron/utils/seed-system';
import { migratePlaintextPasswords } from './electron/utils/migrate-passwords';
import { readAppSettings, updateAppSettings } from './electron/utils/app-settings.utils';
import {
  ZOOM_DEFAULT,
  clampZoom,
  nextZoom,
  normalizeOverlayColor,
  resolveControlsMode,
  resolveShortcut,
  soportaTitleBarOverlay,
} from './electron/utils/window-chrome.utils';
import { setCurrentDevice } from './electron/utils/current-device.utils';
import { Dispositivo } from './src/app/database/entities/financiero/dispositivo.entity';
import { getDbPassword } from './electron/utils/db-password.utils';
import type { DbConnectionOverride } from './src/app/database/database.config';
// Auto-updater
import { initAutoUpdater } from './electron/utils/auto-updater';
// ✅ NUEVOS HANDLERS PARA ARQUITECTURA CON VARIACIONES
// Unificado en recetas.handler: sabores y variaciones

let win: BrowserWindow | null;
let splashWin: BrowserWindow | null = null;
let dbService: DatabaseService;

// Remove JWT constants as they are moved
// const JWT_SECRET = 'frc-gourmet-secret-key';
// const TOKEN_EXPIRATION = '7d';

// Store the current user
let currentUser: Usuario | null = null;

// Functions to manage currentUser state (used by handlers)
function getCurrentUser(): Usuario | null {
  return currentUser;
}

function setCurrentUser(user: Usuario | null): void {
  currentUser = user;
}

async function buildDbOverride(userDataPath: string): Promise<DbConnectionOverride | undefined> {
  const settings = readAppSettings(userDataPath);
  const db = settings.database;
  if (db.type === 'postgres') {
    const password = await getDbPassword();
    // Postgres devuelve NUMERIC/DECIMAL como string por default (preserva precisión).
    // Para el caso de uso de esta app (montos PYG/USD/BRL con max 2 decimales y
    // valores muy por debajo de 10^15) no necesitamos esa precisión y sí necesitamos
    // que las operaciones aritméticas en el frontend funcionen sin coerciones manuales
    // (decimal + decimal terminaba concatenando strings y mostrando vacío en PdV).
    // Forzamos parseFloat en OID 1700 (numeric). OID 20 (int8/bigint) lo dejamos como
    // está por seguridad — no se usa para montos.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pgLib = require('pg');
      pgLib.types.setTypeParser(1700, (v: string) => v == null ? null : parseFloat(v));
    } catch (e) {
      console.warn('[DB] No se pudo registrar pg.types numeric parser:', e);
    }
    return {
      type: 'postgres',
      host: db.host,
      port: db.port,
      database: db.database,
      username: db.username,
      password,
      schema: db.schema,
      ssl: db.ssl,
    };
  }
  // sqlite con path opcional
  if (db.path && db.path !== 'default') {
    return { type: 'sqlite', sqlitePath: db.path };
  }
  return undefined; // sqlite default, mantiene comportamiento legacy
}

function initializeDatabase() {
  // Get user data path
  const userDataPath = app.getPath('userData');

  // Log a archivo (antes de cualquier trabajo de DB, para capturar fallos de boot).
  initFileLogging();

  // Initialize database service
  dbService = DatabaseService.getInstance();
  buildDbOverride(userDataPath)
    .then((override) => dbService!.initialize(userDataPath, override))
    .then(async (dataSource) => {
      console.log('Database initialized successfully');

      // Bootstrap-time SQL fixes (idempotentes) que synchronize:true no aplica solo.
      // Ej: drop de UNIQUE residual cuando una relacion cambio de OneToOne a ManyToOne.
      await runBootstrapMigrations(dataSource);

      // F0: hashear passwords plaintext con bcrypt (idempotente). Antes de auth handlers.
      try {
        await migratePlaintextPasswords(dataSource);
      } catch (e) {
        console.error('[migrate-passwords] error:', e);
      }

      // F3 paso 2: monkey-patch ipcMain.handle para que cada handler que
      // se registre abajo quede tambien copiado en handlerRegistry.
      // Necesario para que el server HTTP de F3 pueda routear /api/rpc al
      // mismo handler sin reescribir nada.
      installHandlerRegistry();

      // Register all IPC handlers *after* the database is ready.
      // Fuente UNICA: registerAllAppHandlers (electron/utils/register-all-handlers.ts).
      // NO agregar registros inline aca: se agregan en ese archivo, asi fluyen
      // tambien a los tests E2E y no vuelve a pasar el "handler no registrado".
      registerAllAppHandlers({ dataSource, getCurrentUser, setCurrentUser });

      console.log(`[F3] handlerRegistry: ${handlerRegistryCount()} channels registrados (disponibles via IPC + futuro /api/rpc).`);

      // Startup migration: populate vendedor_id from created_by for historic ventas
      dataSource.query(`UPDATE ventas SET vendedor_id = created_by WHERE vendedor_id IS NULL AND created_by IS NOT NULL`)
        .catch((e: any) => console.warn('Migration vendedor_id:', e.message));

      // Scheduler: procesa acreditaciones POS pendientes cada 5 min (en main process)
      startAcreditacionesScheduler(dataSource, 5);

      // Seed initial data (idempotent - only inserts if tables are empty)
      // Orden: 1) datos generales 2) permisos+conceptos 3) admin user (necesita permisos ya creados)
      (async () => {
        try {
          await seedInitialData(dataSource);
          await seedPermissions(dataSource);
          await seedConfiguracionRrhh(dataSource);
          await seedLiquidacionConceptos(dataSource);
          await seedNotificaciones(dataSource);
          await seedSystemData(dataSource);
        } catch (e) {
          console.error('Error en seeds iniciales:', e);
        }
      })();

      // F4: exponer mode al renderer via process.env (preload los lee).
      // Sirve para que el factory `repositoryFactory()` en app.module decida
      // qué impl del repository inyectar al boot del Angular.
      const settings = readAppSettings(app.getPath('userData'));
      process.env['FRC_APP_MODE'] = settings.mode;
      if (settings.mode === 'client' && settings.network?.serverUrl) {
        process.env['FRC_SERVER_URL'] = settings.network.serverUrl;
      }

      // F5 paso 3: cargar el Dispositivo configurado localmente (si existe)
      // y exponerlo para que los handlers de creacion lo persistan en
      // ventas/compras/conteos/comandas. Solo aplica al path IPC local —
      // el path HTTP recibe device_id via JWT claim.
      if (typeof settings.deviceId === 'number') {
        try {
          const disp = await dataSource.getRepository(Dispositivo).findOne({
            where: { id: settings.deviceId },
          });
          if (disp && disp.activo) {
            setCurrentDevice({ id: disp.id });
            // Tambien exponer al renderer/preload (modo cliente lo envia en
            // login + refresh para que el server lo firme en el JWT).
            process.env['FRC_DEVICE_ID'] = String(disp.id);
            console.log(`[F5] currentDevice cargado: id=${disp.id} (${disp.nombre || '?'})`);
          } else {
            console.warn(`[F5] deviceId=${settings.deviceId} no encontrado o inactivo en BD.`);
          }
        } catch (e) {
          console.warn('[F5] error cargando currentDevice:', e);
        }
      }

      // F3: arrancar Fastify HTTP server si mode === 'server'
      if (settings.mode === 'server') {
        const port = settings.network?.serverPort || 7070;
        const driver: 'sqlite' | 'postgres' = settings.database.type;
        const appVersion = (() => {
          try { return require('./package.json').version || '0.0.0'; } catch { return '0.0.0'; }
        })();
        // schemaVersion = nombre de la baseline activa (queda inmutable post-arranque)
        const schemaVersion = driver === 'postgres'
          ? 'BaselinePostgres1778380893207'
          : 'Baseline1778378410416';
        // F2 (mobile PWA): servir el bundle de projects/mobile (dist/mobile) si existe.
        // En el paquete (asar) los archivos quedan en app.asar.unpacked (ver
        // asarUnpack en package.json), así que resolvemos esa ruta para que
        // @fastify/static los sirva sin tocar el archivo asar.
        let staticRoot = path.join(__dirname, 'dist', 'mobile');
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
        // Storefront de pedidos online (dist/storefront) — se sirve en /tienda si existe.
        let storefrontRoot: string | undefined = path.join(__dirname, 'dist', 'storefront');
        if (
          storefrontRoot.includes(`app.asar${path.sep}`) &&
          !storefrontRoot.includes('app.asar.unpacked')
        ) {
          const unpackedSf = storefrontRoot.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
          if (fs.existsSync(unpackedSf)) storefrontRoot = unpackedSf;
        }
        if (!fs.existsSync(storefrontRoot)) storefrontRoot = undefined;
        // Panel admin desktop-web (dist/frc-gourmet-web) — se sirve en /admin si existe.
        let adminRoot: string | undefined = path.join(__dirname, 'dist', 'frc-gourmet-web');
        if (
          adminRoot.includes(`app.asar${path.sep}`) &&
          !adminRoot.includes('app.asar.unpacked')
        ) {
          const unpackedAdmin = adminRoot.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
          if (fs.existsSync(unpackedAdmin)) adminRoot = unpackedAdmin;
        }
        if (!fs.existsSync(adminRoot)) adminRoot = undefined;
        startServer({
          port, appVersion, schemaVersion, driver, dataSource, staticRoot, storefrontRoot, adminRoot,
          httpsPort: settings.network?.httpsPort,
          certPath: settings.network?.certPath,
          keyPath: settings.network?.keyPath,
          lanUrl: settings.network?.lanUrl,
        }).catch((e) => console.error('[server] Error al arrancar Fastify:', e));
      } else {
        console.log(`[server] Modo '${settings.mode}', no se arranca Fastify.`);
      }

      // Auto-backup scheduler (lee config persistida; idempotente si está deshabilitado)
      startAutoBackupScheduler(app.getPath('userData'));
      // Generar notificaciones RRHH al startup y cada 24h
      generarNotificacionesRrhh().catch((e) => console.error('Error generando notificaciones RRHH:', e));
      setInterval(() => { generarNotificacionesRrhh().catch((e) => console.error('Error notif RRHH interval:', e)); }, 24 * 60 * 60 * 1000);

      // Musica ambiental: el runtime solo arranca si el modulo esta habilitado.
      // Reacciona por evento (cambio de bloque) con un heartbeat de 2 min; no
      // elige tema por tema. Ver docs/DISENO-OPERATIVO-MUSICA.md 3.3.
      try {
        const settingsMusica = readAppSettings(app.getPath('userData')).musica;
        if (settingsMusica?.habilitado) {
          iniciarRuntimeMusica(dataSource, app.getPath('userData'));
          console.log('[musica] Runtime iniciado.');
        }
      } catch (e) {
        console.error('[musica] No se pudo iniciar el runtime:', e);
      }
    })
    .catch((error) => {
      console.error('Failed to initialize database:', error);
      // Init falló (típicamente una migración): la app queda sin handlers IPC,
      // así que el front muestra "Error en el servidor". Mostramos el error real
      // en un diálogo para poder diagnosticar sin DevTools.
      try {
        const logPath = path.join(app.getPath('userData'), 'logs', 'main.log');
        dialog.showErrorBox(
          'Error al iniciar la base de datos',
          `No se pudo inicializar la base de datos (probablemente una migración).\n\n` +
            `${(error && (error.message || error.toString())) || 'Error desconocido'}\n\n` +
            `Detalle completo en el log:\n${logPath}`,
        );
      } catch { /* no-op */ }
    });
}

/**
 * Logging a archivo en `userData/logs/main.log`. Tee de console.* (info/warn/
 * error) al archivo, con rotación simple. Imprescindible para diagnosticar
 * fallos de boot en la app empaquetada (no hay consola visible).
 */
function initFileLogging(): void {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const logFile = path.join(logsDir, 'main.log');
    try {
      const st = fs.statSync(logFile);
      if (st.size > 5 * 1024 * 1024) fs.renameSync(logFile, `${logFile}.old`);
    } catch { /* no existe aún */ }
    const stream = fs.createWriteStream(logFile, { flags: 'a' });
    const fmt = (a: unknown): string =>
      typeof a === 'string' ? a : a instanceof Error ? (a.stack ?? a.message) : JSON.stringify(a);
    const tee = (orig: (...a: unknown[]) => void, level: string) => (...args: unknown[]) => {
      try {
        stream.write(`[${new Date().toISOString()}] [${level}] ${args.map(fmt).join(' ')}\n`);
      } catch { /* no-op */ }
      orig(...args);
    };
    console.log = tee(console.log.bind(console), 'INFO');
    console.warn = tee(console.warn.bind(console), 'WARN');
    console.error = tee(console.error.bind(console), 'ERROR');
    console.log(`[file-logging] iniciado: ${logFile} (app ${app.getVersion()})`);
  } catch { /* nunca romper el arranque por el logger */ }
}

// Resuelve el icono de la app. En Win/Linux preferimos PNG; en Mac, .icns.
// Usado tanto para la BrowserWindow (taskbar en Win/Linux) como para
// app.dock.setIcon() en macOS (dock).
function resolveAppIconPath(): string | undefined {
  const candidates = process.platform === 'darwin'
    ? [path.join(__dirname, 'build', 'icon.icns'), path.join(__dirname, 'build', 'icons', '512x512.png')]
    : [path.join(__dirname, 'build', 'icons', '512x512.png'), path.join(__dirname, 'build', 'icon.png')];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function createSplashWindow(): void {
  // Splash frameless transparente que se muestra mientras Angular carga.
  // Se cierra cuando la main window dispara 'did-finish-load'.
  const iconPath = resolveAppIconPath();
  splashWin = new BrowserWindow({
    width: 520,
    height: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    show: false,
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  // splash.html vive en src/assets en dev y en dist/frc-gourmet/assets en prod
  const devSplash = path.join(__dirname, 'src', 'assets', 'splash.html');
  const prodSplash = path.join(__dirname, 'dist', 'frc-gourmet', 'assets', 'splash.html');
  const splashPath = fs.existsSync(prodSplash) ? prodSplash : devSplash;
  splashWin.loadFile(splashPath).catch((e) => console.warn('[splash] load failed:', e));
  splashWin.once('ready-to-show', () => splashWin?.show());
  splashWin.on('closed', () => { splashWin = null; });
}

function closeSplashIfOpen(): void {
  try {
    if (splashWin && !splashWin.isDestroyed()) {
      splashWin.close();
    }
  } catch (e) {
    console.warn('[splash] close failed:', e);
  }
  splashWin = null;
}

/**
 * Alto de la toolbar de la app (`.app-toolbar` en app.component.scss). Se usa
 * como alto del Window Controls Overlay en Windows para que los botones
 * nativos queden alineados con nuestra barra.
 */
const TOOLBAR_HEIGHT = 64;

/**
 * Reemplaza el menú por defecto de Electron.
 *
 * Ese menú sigue existiendo aunque la ventana sea frameless y no se dibuje, y
 * trae *View → Toggle Developer Tools*, *Reload* y *Zoom* con sus accelerators
 * nativos. En macOS además la barra del SO lo muestra siempre. Dejarlo puesto
 * significa: (a) DevTools abrible con `⌥⌘I` salteando el permiso
 * `SISTEMA_DEVTOOLS`, y (b) zoom y reload por caminos que no pasan por nuestros
 * handlers (no se persisten, no piden confirmación).
 *
 * En Windows/Linux se quita del todo: Chromium maneja copiar/pegar por su
 * cuenta. En macOS NO se puede quitar —sin menú se rompen Cmd+C/V/Q/W— así que
 * se arma uno mínimo con los roles del sistema y SIN el menú *View*.
 */
function configurarMenuNativo(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]),
  );
}

/** Alto válido para el overlay: cae al alto de la toolbar si viene basura. */
function clampOverlayHeight(height?: number): number {
  const h = Number(height);
  if (!Number.isFinite(h) || h <= 0) return TOOLBAR_HEIGHT;
  return Math.round(Math.min(200, Math.max(32, h)));
}

/** Guard: los handlers `window:*` se registran una sola vez por proceso. */
let windowChromeHandlersRegistrados = false;

function getUserDataPath(): string {
  return app.getPath('userData');
}

/** Zoom guardado en app-settings (por PC). Default 1. */
function leerZoomGuardado(): number {
  try {
    return clampZoom(readAppSettings(getUserDataPath()).ui?.zoomFactor ?? ZOOM_DEFAULT);
  } catch {
    return ZOOM_DEFAULT;
  }
}

/**
 * Persiste el zoom con debounce. `updateAppSettings` lee+escribe el JSON de
 * forma SÍNCRONA en el proceso main: sin debounce, mantener Ctrl+= apretado
 * (autorepeat del SO) dispara decenas de ciclos read/parse/write por segundo
 * en el mismo proceso que atiende IPC y BD.
 */
let zoomPersistTimer: NodeJS.Timeout | null = null;
function guardarZoom(factor: number): void {
  if (zoomPersistTimer) clearTimeout(zoomPersistTimer);
  zoomPersistTimer = setTimeout(() => {
    zoomPersistTimer = null;
    try {
      updateAppSettings(getUserDataPath(), (curr) => ({
        ...curr,
        ui: { ...curr.ui, zoomFactor: factor },
      }));
    } catch (e) {
      console.warn('[window] no se pudo persistir el zoom:', e);
    }
  }, 400);
}

/** Aplica el zoom persistido al renderer y avisa al header. */
function aplicarZoomGuardado(): void {
  if (!win || win.isDestroyed()) return;
  const factor = leerZoomGuardado();
  try {
    win.webContents.setZoomFactor(factor);
    win.webContents.send('window:zoom-changed', { factor });
  } catch (e) {
    console.warn('[window] no se pudo aplicar el zoom guardado:', e);
  }
}

/** Setea, persiste y notifica un factor de zoom. Devuelve el aplicado. */
function aplicarZoom(factor: number): number {
  const clamped = clampZoom(factor);
  if (!win || win.isDestroyed()) return clamped;
  win.webContents.setZoomFactor(clamped);
  guardarZoom(clamped);
  win.webContents.send('window:zoom-changed', { factor: clamped });
  return clamped;
}

function zoomActual(): number {
  if (!win || win.isDestroyed()) return leerZoomGuardado();
  return clampZoom(win.webContents.getZoomFactor());
}

/** Ejecuta una acción de ventana (desde atajo de teclado o desde el menú). */
function ejecutarAccionVentana(accion: string): void {
  if (!win || win.isDestroyed()) return;
  switch (accion) {
    case 'zoom-in':
      aplicarZoom(nextZoom(zoomActual(), 1));
      break;
    case 'zoom-out':
      aplicarZoom(nextZoom(zoomActual(), -1));
      break;
    case 'zoom-reset':
      aplicarZoom(ZOOM_DEFAULT);
      break;
    case 'reload':
      win.webContents.reload();
      break;
    case 'toggle-devtools':
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
      else win.webContents.openDevTools({ mode: 'detach' });
      break;
    case 'toggle-fullscreen':
      win.setFullScreen(!win.isFullScreen());
      break;
    default:
      break;
  }
}

/**
 * Handlers IPC del "chrome" de la ventana: botones, zoom, recargar, devtools y
 * pantalla completa. En una ventana frameless no hay menú nativo que los
 * provea, así que el header de Angular los invoca por IPC.
 *
 * OJO: se registran una sola vez (createWindow puede correr de nuevo en el
 * `activate` de macOS y `ipcMain.handle` tira si el canal ya existe). Los
 * handlers referencian `win` en el momento de la llamada, no al registrarse.
 */
function registerWindowChromeHandlers(): void {
  if (windowChromeHandlersRegistrados) return;
  windowChromeHandlersRegistrados = true;

  ipcMain.handle('window:minimize', () => { win?.minimize(); });
  ipcMain.handle('window:maximize-toggle', () => {
    if (!win) return false;
    if (win.isMaximized()) { win.unmaximize(); return false; }
    win.maximize();
    return true;
  });
  ipcMain.handle('window:close', () => { win?.close(); });
  ipcMain.handle('window:is-maximized', () => win?.isMaximized() ?? false);
  ipcMain.handle('window:platform', () => process.platform);

  /** Qué botones de ventana debe (o no) dibujar el header. */
  ipcMain.handle('window:chrome', () => ({
    platform: process.platform,
    controlsMode: resolveControlsMode(process.platform),
    overlay: soportaTitleBarOverlay(process.platform),
    toolbarHeight: TOOLBAR_HEIGHT,
  }));

  /**
   * Re-tiñe los botones nativos del overlay (Windows) para que sigan al tema
   * claro/oscuro. El renderer manda el color computado real de la toolbar.
   */
  ipcMain.handle('window:set-titlebar-overlay', (_e, opts: { color?: string; symbolColor?: string; height?: number }) => {
    if (!win || win.isDestroyed() || !soportaTitleBarOverlay(process.platform)) return false;
    const color = normalizeOverlayColor(opts?.color);
    const symbolColor = normalizeOverlayColor(opts?.symbolColor);
    if (!color && !symbolColor) return false;
    try {
      win.setTitleBarOverlay({
        ...(color ? { color } : {}),
        ...(symbolColor ? { symbolColor } : {}),
        // El alto viene del renderer (alto real de la toolbar × zoom): con el
        // zoom al 150% la barra crece y los botones nativos tienen que crecer
        // con ella. Se acota por las dudas — un alto absurdo rompe la ventana.
        height: clampOverlayHeight(opts?.height),
      });
      return true;
    } catch (e) {
      console.warn('[window] setTitleBarOverlay falló:', e);
      return false;
    }
  });

  ipcMain.handle('window:zoom-get', () => zoomActual());
  ipcMain.handle('window:zoom-set', (_e, factor: number) => aplicarZoom(Number(factor)));
  ipcMain.handle('window:zoom-step', (_e, direction: number) => aplicarZoom(nextZoom(zoomActual(), direction >= 0 ? 1 : -1)));
  ipcMain.handle('window:zoom-reset', () => aplicarZoom(ZOOM_DEFAULT));
  ipcMain.handle('window:reload', () => { win?.webContents.reload(); });
  ipcMain.handle('window:toggle-devtools', () => {
    ejecutarAccionVentana('toggle-devtools');
    return win?.webContents.isDevToolsOpened() ?? false;
  });
  ipcMain.handle('window:toggle-fullscreen', () => {
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });
  ipcMain.handle('window:is-fullscreen', () => win?.isFullScreen() ?? false);
}

function createWindow(): void {
  // Antes que nada: sacar el menú por defecto de Electron (ver docstring).
  configurarMenuNativo();

  // Splash primero — visible mientras Angular hace bootstrap.
  createSplashWindow();

  // Create the browser window.
  // La app es frameless en las tres plataformas, pero los botones de ventana
  // los dibuja SIEMPRE el sistema operativo — nunca el header de Angular:
  //  - macOS:   `titleBarStyle:'hiddenInset'` → semáforos nativos.
  //  - Windows: `titleBarStyle:'hidden'` + `titleBarOverlay` → Windows dibuja
  //             minimizar/maximizar/cerrar sobre nuestra toolbar (Window
  //             Controls Overlay). Siempre funcionan y respetan el SO.
  //  - Linux:   `frame:false` puro; ahí no hay overlay soportado, así que el
  //             header renderiza sus propios botones (modo 'custom').
  // El renderer consulta `window:chrome` para saber cuál de los tres le tocó.
  const isMac = process.platform === 'darwin';
  const usaOverlay = soportaTitleBarOverlay(process.platform);
  const iconPath = resolveAppIconPath();
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false, // se muestra cuando termina did-finish-load (cerrando el splash)
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : (usaOverlay ? 'hidden' : 'default'),
    // Colores iniciales = primary del tema (#db392e / blanco). El renderer los
    // re-sincroniza con el color real de la toolbar apenas arranca y en cada
    // cambio de tema (handler `window:set-titlebar-overlay`).
    ...(usaOverlay
      ? { titleBarOverlay: { color: '#db392e', symbolColor: '#ffffff', height: TOOLBAR_HEIGHT } }
      : {}),
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  // En Mac el icon de BrowserWindow no afecta el dock; hay que setearlo aparte.
  if (isMac && iconPath && app.dock) {
    try { app.dock.setIcon(iconPath); } catch (e) { console.warn('[icon] dock.setIcon failed:', e); }
  }
  win.maximize();
  // El show() se difiere hasta did-finish-load para no pisar el splash.
  win.webContents.once('did-finish-load', () => {
    closeSplashIfOpen();
    win?.show();
  });
  // Fallback de seguridad: si did-finish-load no llega en 8s, mostramos igual.
  setTimeout(() => {
    if (splashWin) closeSplashIfOpen();
    if (win && !win.isVisible()) win.show();
  }, 8000);

  // Emitir cambios de estado maximize/unmaximize al renderer para que el
  // toolbar pueda alternar entre el icono "maximize" y "restore" (modo custom).
  win.on('maximize', () => {
    win?.webContents.send('window:state-changed', { isMaximized: true });
  });
  win.on('unmaximize', () => {
    win?.webContents.send('window:state-changed', { isMaximized: false });
  });
  win.on('enter-full-screen', () => {
    win?.webContents.send('window:fullscreen-changed', { isFullScreen: true });
  });
  win.on('leave-full-screen', () => {
    win?.webContents.send('window:fullscreen-changed', { isFullScreen: false });
  });

  // Zoom persistido: se aplica en cada carga (un reload resetea el factor).
  win.webContents.on('did-finish-load', () => aplicarZoomGuardado());

  // Ctrl+rueda / pinch: Chromium cambia el zoom por su cuenta. Sin esto, ese
  // zoom no se guardaba (lo pisaba el valor viejo en el próximo arranque) y el
  // porcentaje del menú quedaba mintiendo. El evento avisa ANTES de aplicar el
  // nuevo factor, por eso se lee en el tick siguiente.
  win.webContents.on('zoom-changed', () => {
    setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      const factor = zoomActual();
      guardarZoom(factor);
      win.webContents.send('window:zoom-changed', { factor });
    }, 0);
  });

  // Atajos de teclado de ventana. La ventana es frameless y no tiene menú
  // nativo, así que los accelerators estándar (Ctrl +/-/0, F5, F12, F11) no
  // existen: los reponemos acá.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const accion = resolveShortcut(
      { key: input.key, control: input.control, meta: input.meta, shift: input.shift, alt: input.alt },
      process.platform,
    );
    if (!accion) return;
    event.preventDefault();
    if (accion === 'toggle-devtools') {
      // El main no sabe qué permisos tiene el usuario logueado (en modo cliente
      // ni siquiera hay BD local). Se le pide al renderer, que sí los conoce:
      // si corresponde, él llama de vuelta a `window:toggle-devtools`.
      win?.webContents.send('window:devtools-requested');
      return;
    }
    ejecutarAccionVentana(accion);
  });

  registerWindowChromeHandlers();

  // Load the app
  if (process.argv.indexOf('--serve') !== -1) {
    // Load from Angular dev server if --serve argument is provided
    win.loadURL('http://localhost:4201');
    // Open the DevTools automatically if in development mode
    win.webContents.openDevTools();
  } else {
    // Load the built app from the dist folder
    win.loadURL(url.format({
      pathname: path.join(__dirname, 'dist/frc-gourmet/index.html'),
      protocol: 'file:',
      slashes: true
    }));
  }

  // Auto-updater (solo en build empaquetada).
  if (win) {
    initAutoUpdater(win);
  }

  // Event when the window is closed.
  win.on('closed', () => {
    win = null;
  });

  // app:// protocol — registered once in app.on('ready') below.
}

// Single, generic handler for app:// URLs. Maps `app://<carpeta>/<file>` to
// `userData/<carpeta>/<file>`. Falls back to the app folder for legacy URLs
// that point to bundled assets.
function registerAppProtocol(): void {
  if (protocol.isProtocolRegistered && protocol.isProtocolRegistered('app')) {
    return;
  }
  protocol.registerFileProtocol('app', (request: { url: string }, callback: (response: any) => void) => {
    const urlPath = request.url.replace(/^app:\/\//, '');
    const userDataPath = app.getPath('userData');
    const userDataResolved = path.normalize(path.join(userDataPath, urlPath));

    // Ensure the parent dir exists for known buckets so first-write doesn't fail
    // before any file is requested. Cheap and idempotent.
    const knownBuckets = ['profile-images', 'producto-images', 'producto-thumbs', 'sabores', 'presentaciones', 'factura-imports', 'funcionario-documentos', 'adjuntos', 'logos', 'rostros'];
    for (const bucket of knownBuckets) {
      if (urlPath.startsWith(bucket + '/')) {
        const bucketDir = path.join(userDataPath, bucket);
        if (!fs.existsSync(bucketDir)) fs.mkdirSync(bucketDir, { recursive: true });
        break;
      }
    }

    if (fs.existsSync(userDataResolved)) {
      callback({ path: userDataResolved });
      return;
    }

    // Fallback: app folder (bundled assets)
    const appResolved = path.normalize(path.join(app.getAppPath(), urlPath));
    if (fs.existsSync(appResolved)) {
      callback({ path: appResolved });
      return;
    }

    // Not found — return userData path so the renderer gets a clear ENOENT
    callback({ path: userDataResolved });
  });
}

// Initialize the database when the app is ready
app.on('ready', () => {
  registerAppProtocol();

  // F4: setear env vars de mode/serverUrl ANTES de createWindow para que el
  // preload los lea al cargar (el renderer hereda process.env del main al
  // momento del spawn). initializeDatabase() corre async y los setea muy
  // tarde — para entonces el preload ya leyo defaults.
  try {
    const earlySettings = readAppSettings(app.getPath('userData'));
    process.env['FRC_APP_MODE'] = earlySettings.mode;
    if (earlySettings.mode === 'client' && earlySettings.network?.serverUrl) {
      process.env['FRC_SERVER_URL'] = earlySettings.network.serverUrl;
    }
    // F5 paso 3: tambien exponer el deviceId al preload para que lo inyecte
    // en login + refresh (modo cliente). Lectura sync para que el renderer
    // herede el valor al spawn — initializeDatabase() corre async, no llega.
    if (typeof earlySettings.deviceId === 'number') {
      process.env['FRC_DEVICE_ID'] = String(earlySettings.deviceId);
    }
    // Zona horaria: setear TZ ANTES de createWindow para que el renderer
    // (Chromium) y Node usen la zona configurada en toda la app. Paraguay
    // quedo en UTC-3 fijo; si el tzdata del SO esta viejo, configurar
    // 'America/Sao_Paulo' (UTC-3 estable) corrige la hora mostrada.
    if (earlySettings.timezone) {
      process.env.TZ = earlySettings.timezone;
      console.log(`[main] TZ=${earlySettings.timezone} (zona horaria de la empresa)`);
    }
    // Exponer version de la app al preload — para mostrarla en el header
    // como subtitle ("FRC Gourmet vX.Y.Z"). app.getVersion() lee package.json
    // (en build empaquetada lee el del .asar). En dev queda el "1.0.0" del
    // repo, que tambien es util para confirmar visualmente que estas en dev.
    process.env['FRC_APP_VERSION'] = app.getVersion();
    console.log(`[main] early FRC_APP_MODE=${earlySettings.mode} (preload heredara este valor)`);
  } catch (e) {
    console.warn('[main] no se pudo leer app-settings temprano:', e);
  }

  initializeDatabase();
  createWindow();
});

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS specific behavior
  if (process.platform !== 'darwin') {
    // Stop Fastify server (idempotente — si nunca arranco no hace nada)
    stopServer().catch(() => {});
    // Close the database connection
    if (dbService) {
      dbService.close();
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  // Stop server explicitly antes de quit (cubrira el caso macOS donde el handler
  // de window-all-closed no termina la app)
  stopServer().catch(() => {});
});

app.on('activate', () => {
  // On macOS specific behavior
  if (win === null) {
    createWindow();
  }
});

// ALL IPC HANDLERS AND HELPER FUNCTIONS PREVIOUSLY BELOW THIS LINE HAVE BEEN MOVED
// TO THE respective handler/util files in the electron/ directory.
