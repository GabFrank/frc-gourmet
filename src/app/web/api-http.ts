/**
 * Transporte HTTP del frontend desktop servido como web (ruta /admin).
 *
 * El frontend desktop habla con el backend SIEMPRE a través de `window.api`
 * (inyectado por `preload.ts` en Electron). En un browser puro no hay preload,
 * así que este módulo instala un `window.api` equivalente que rutea cada llamada
 * de `RepositoryIpcService` a `POST /api/rpc` contra el server Fastify (modo
 * server), con login vía `/api/auth/login`, refresh automático del JWT en 401 y
 * proxy de imágenes `app://` por `/api/files/by-url`.
 *
 * Es el gemelo del shim de la PWA mobile (`projects/mobile/.../api-http.ts`):
 * comparte el mapa método→canal generado de `preload.ts`. La diferencia está en
 * los stubs de APIs solo-Electron (controles de ventana, auto-update, backup con
 * diálogos nativos) que acá quedan neutralizados para que los guards del frontend
 * (`if (!api?.windowPlatform)`, `typeof api.autoUpdateGetConfig === 'function'`,
 * etc.) las detecten como ausentes y oculten/ignoren esa UI.
 *
 * Instalar con `installApiHttp()` ANTES de `bootstrapApplication` (main.web.ts),
 * porque `RepositoryIpcService` lee `window.api` en su constructor.
 */
import { API_CHANNEL_MAP } from './api-channel-map.generated';

const ACCESS_KEY = 'frc_admin_access_token';
const REFRESH_KEY = 'frc_admin_refresh_token';

let accessToken: string | null = null;
let refreshToken: string | null = null;
let appVersion = '';
// Promesa del fetch de versión: el header la await-ea porque getAppVersion() sync
// devuelve '' hasta que /api/version resuelve (carrera al arrancar).
let appVersionPromise: Promise<string> | null = null;

/** Base same-origin: el mismo Fastify sirve /admin y /api. */
function currentBase(): string {
  return '';
}

function loadTokens(): void {
  accessToken = localStorage.getItem(ACCESS_KEY);
  refreshToken = localStorage.getItem(REFRESH_KEY);
}

function storeTokens(access: string | null, refresh: string | null): void {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem(ACCESS_KEY, access);
  else localStorage.removeItem(ACCESS_KEY);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  else localStorage.removeItem(REFRESH_KEY);
}

interface HttpError extends Error {
  status?: number;
}

async function httpFetch(path: string, body: unknown, withAuth = true): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (withAuth && accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  let res: Response;
  try {
    res = await fetch(`${currentBase()}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    const err: HttpError = new Error('SERVER_UNREACHABLE');
    err.status = 0;
    throw err;
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err: HttpError = new Error(`HTTP ${res.status}: ${txt}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Single-flight: al reabrir el navegador con el access token vencido, arranca
// un burst de RPCs que dan 401 casi simultáneos. Sin deduplicar, cada uno
// mandaba el MISMO refresh token (que es de un solo uso): el primero rotaba y
// los demás enviaban el token ya revocado → 401 → se borraban ambos tokens,
// pisando incluso el token nuevo del ganador. Resultado: empresa/cotización (y
// cualquier otra llamada perdedora) fallaban al azar. Ahora todos los 401
// concurrentes comparten UNA sola promesa de refresh.
let inFlightRefresh: Promise<boolean> | null = null;

function refreshAccessIfPossible(): Promise<boolean> {
  if (inFlightRefresh) return inFlightRefresh;
  const tokenAtStart = refreshToken;
  if (!tokenAtStart) return Promise.resolve(false);
  inFlightRefresh = (async () => {
    try {
      const data = await httpFetch('/api/auth/refresh', { refreshToken: tokenAtStart }, false);
      storeTokens(data.accessToken, data.refreshToken || tokenAtStart);
      return true;
    } catch {
      // Solo limpiar si nadie más ya obtuvo un token nuevo mientras tanto
      // (evita borrar el token recién rotado por otra tanda).
      if (refreshToken === tokenAtStart) storeTokens(null, null);
      return false;
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

/** Núcleo del transporte: traduce un canal IPC a la llamada HTTP correspondiente. */
async function invokeRouter(channel: string, ...args: any[]): Promise<any> {
  // --- Login: va a /api/auth/login, adapta al shape que espera el renderer ---
  if (channel === 'login') {
    const loginData = { ...((args[0] as Record<string, unknown>) || {}) };
    let data: any;
    try {
      data = await httpFetch('/api/auth/login', loginData, false);
    } catch (err) {
      const e = err as HttpError;
      const message =
        e.status === 401
          ? 'Usuario o contraseña incorrectos'
          : e.status === 0
            ? 'No se pudo conectar con el servidor'
            : 'Error en el servidor. Intente nuevamente más tarde.';
      return { success: false, message };
    }
    if (data.success) {
      storeTokens(data.accessToken, data.refreshToken);
    }
    return {
      success: data.success,
      usuario: data.usuario,
      token: data.accessToken,
      sessionId: data.sessionId,
      message: data.success ? 'Inicio de sesión exitoso' : (data.error || 'Error de autenticación'),
    };
  }

  // --- Logout ---
  if (channel === 'logout' || channel === 'logout-session') {
    try {
      await httpFetch('/api/auth/logout', { refreshToken }, false);
    } catch {
      /* best-effort */
    }
    storeTokens(null, null);
    return true;
  }

  // --- RPC genérico con refresh en 401 ---
  const doRpc = async (): Promise<any> => {
    const data = await httpFetch('/api/rpc', { method: channel, params: args }, true);
    return data.result;
  };
  try {
    return await doRpc();
  } catch (err) {
    const e = err as HttpError;
    if (e.status === 401) {
      const ok = await refreshAccessIfPossible();
      if (ok) return await doRpc();
      // No limpiar acá: refreshAccessIfPossible ya decide si borrar los tokens.
      // Borrar por cada llamada perdedora pisaba el token nuevo del ganador.
    }
    throw err;
  }
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function channelFor(method: string): string {
  const mapped = API_CHANNEL_MAP[method];
  if (mapped) return mapped;
  const guess = kebab(method);
  console.warn(`[api-http] método "${method}" no está en API_CHANNEL_MAP; uso fallback "${guess}".`);
  return guess;
}

/**
 * Miembros de `window.api` resueltos localmente (no van por RPC). Incluye:
 *  - getters de entorno que en Electron provee el preload,
 *  - stubs `undefined`/no-op de las APIs solo-Electron: al estar la clave EN el
 *    target, el Proxy devuelve el valor (undefined) en vez de fabricar una
 *    función RPC, así los guards del frontend las ven como ausentes.
 */
function buildExplicit(): Record<string, unknown> {
  return {
    // Entorno
    getAppVersion: (): string => appVersion,
    getAppVersionAsync: (): Promise<string> => appVersionPromise || Promise.resolve(appVersion),
    getAppMode: (): 'client' => 'client',
    getServerUrl: (): string => currentBase() || window.location.origin,
    getDeviceId: (): number | null => null,
    getAccessToken: (): string | null => accessToken,
    setCurrentUser: (_u: unknown): void => undefined,
    getCurrentUser: async (): Promise<unknown> => null,
    getCurrentUserId: (): number | undefined => undefined,
    restoreSession: async (_id: number, _t: string): Promise<{ success: boolean }> => ({
      success: !!accessToken,
    }),
    appModeGet: async (): Promise<{ mode: 'client'; network: { serverUrl: string }; deviceId: null }> => ({
      mode: 'client',
      network: { serverUrl: window.location.origin },
      deviceId: null,
    }),
    // Invocación IPC genérica por canal (usada por varios servicios: facturación,
    // documentos, PdV print, etc.).
    callIpc: (channel: string, ...rest: any[]): Promise<any> => invokeRouter(channel, ...rest),

    // --- APIs solo-Electron: neutralizadas en web (ver docstring buildExplicit) ---
    // Controles de ventana (titlebar custom): no hay ventana en browser.
    windowPlatform: undefined,
    windowIsMaximized: undefined,
    windowMinimize: undefined,
    windowMaximizeToggle: undefined,
    windowClose: undefined,
    onWindowStateChanged: undefined,
    // Auto-update (electron-updater): no aplica a la app web.
    autoUpdateGetConfig: undefined,
    // Push IPC de impresora / comandas: en web se usa el fallback SSE/poll.
    onPrinterEvent: undefined,
    onComandaEvent: undefined,
    // Diálogos nativos de archivo (backup/restore): sin equivalente en browser.
    backupPickRestoreFile: async (): Promise<null> => null,
    backupPickFolder: async (): Promise<null> => null,
  };
}

/**
 * Instala el `window.api` HTTP. Llamar UNA vez antes de `bootstrapApplication`.
 */
export function installApiHttp(): void {
  loadTokens();
  (window as unknown as { __FRC_WEB__: boolean }).__FRC_WEB__ = true;

  const explicit = buildExplicit();
  const api = new Proxy(explicit, {
    get(target, prop): unknown {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return (target as Record<string, unknown>)[prop];
      const channel = channelFor(prop);
      return (...args: any[]): Promise<any> => invokeRouter(channel, ...args);
    },
  });

  (window as unknown as { api: unknown }).api = api;
  console.log('[api-http] window.api (web /admin) instalado (same-origin)');

  // Versión del server para el header (best-effort, no bloquea el arranque).
  // Se guarda la promesa para que el header pueda await-earla vía
  // getAppVersionAsync (getAppVersion() sync devuelve '' hasta que resuelve).
  appVersionPromise = fetch('/api/version')
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => { if (v?.appVersion) appVersion = String(v.appVersion); return appVersion; })
    .catch(() => appVersion);
}
