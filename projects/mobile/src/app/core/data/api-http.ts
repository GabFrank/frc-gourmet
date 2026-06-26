/**
 * Transporte HTTP de la PWA mobile — el equivalente browser del `invokeRouter`
 * de `preload.ts` (mode=client). Instala un `window.api` que enruta cada
 * llamada de `RepositoryIpcService` a `POST /api/rpc` contra el server Fastify,
 * con login vía `/api/auth/login`, refresh automático del JWT en 401, y
 * tracking del estado de conexión.
 *
 * NO hay Electron acá: el shim reemplaza al `window.api` que en el desktop
 * provee el preload. Se instala con `installApiHttp()` ANTES del bootstrap de
 * Angular, así `RepositoryIpcService` (que lee `window.api` en su constructor)
 * lo encuentra.
 *
 * El mapeo método→canal sale de `api-channel-map.generated.ts` (regenerado
 * desde preload.ts con `scripts/generate-mobile-api-map.js`).
 */
import { API_CHANNEL_MAP } from './api-channel-map.generated';
import { setOnline } from './connection-state';
import { sessionExpired$ } from './auth-events';

const ACCESS_KEY = 'frc_mobile_access_token';
const REFRESH_KEY = 'frc_mobile_refresh_token';
const SERVER_URL_KEY = 'frc_mobile_server_url';
const DEVICE_ID_KEY = 'frc_mobile_device_id';

let baseUrl = '';
// URL LAN-directa detectada (latencia baja, sin pasar por el túnel). Cuando está
// seteada, TODO el tráfico (RPC, login, archivos) va por acá. null = usar baseUrl.
let lanBaseUrl: string | null = null;
let deviceId: number | null = null;
let accessToken: string | null = null;
let refreshToken: string | null = null;

/** Base efectiva: LAN-directa si fue detectada, si no el origen de instalación. */
function currentBase(): string {
  return lanBaseUrl ?? baseUrl;
}

/**
 * Detecta si estamos en la red local: lee /api/client-config (del origen),
 * obtiene la URL LAN-directa y la "prueba" con /api/health (timeout corto). Si
 * responde, enruta todo por LAN (más rápido). Si no, queda en el origen/túnel.
 * Es best-effort y no bloquea el arranque.
 */
async function detectLan(): Promise<void> {
  try {
    const cfg = await fetch(`${baseUrl}/api/client-config`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const lanUrl = cfg?.lanUrl ? String(cfg.lanUrl).replace(/\/$/, '') : null;
    if (!lanUrl || lanUrl === baseUrl) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 800);
    const ok = await fetch(`${lanUrl}/api/health`, { signal: ctrl.signal })
      .then((r) => r.ok)
      .catch(() => false);
    clearTimeout(timer);
    if (ok) {
      lanBaseUrl = lanUrl;
      setOnline(true);
      console.log(`[api-http] LAN directo detectado, enrutando por ${lanUrl}`);
    } else if (lanBaseUrl) {
      // Estábamos en LAN y dejó de responder (cambio de red) → volver al origen.
      lanBaseUrl = null;
    }
  } catch {
    /* queda en baseUrl */
  }
}

/** Resuelve la URL base del server. Same-origin por defecto (Fastify sirve la PWA). */
function resolveBaseUrl(explicit?: string): string {
  if (explicit) return explicit.replace(/\/$/, '');
  const fromWindow = (window as unknown as { __FRC_SERVER_URL__?: string }).__FRC_SERVER_URL__;
  if (fromWindow) return fromWindow.replace(/\/$/, '');
  const fromStorage = localStorage.getItem(SERVER_URL_KEY);
  if (fromStorage) return fromStorage.replace(/\/$/, '');
  return ''; // same-origin
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
    // fetch rechaza solo ante fallo de red real (server inalcanzable).
    setOnline(false);
    const err: HttpError = new Error('SERVER_UNREACHABLE');
    err.status = 0;
    throw err;
  }
  // Hubo respuesta del server (aunque sea 4xx/5xx) → estamos online.
  setOnline(true);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err: HttpError = new Error(`HTTP ${res.status}: ${txt}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function refreshAccessIfPossible(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const reqBody: { refreshToken: string; deviceId?: number } = { refreshToken };
    if (deviceId != null) reqBody.deviceId = deviceId;
    const data = await httpFetch('/api/auth/refresh', reqBody, false);
    storeTokens(data.accessToken, data.refreshToken || refreshToken);
    return true;
  } catch {
    storeTokens(null, null);
    return false;
  }
}

/** Núcleo del transporte: traduce un canal IPC a la llamada HTTP correspondiente. */
async function invokeRouter(channel: string, ...args: any[]): Promise<any> {
  // --- Login: va a /api/auth/login, adapta al shape que espera el renderer ---
  if (channel === 'login') {
    const loginData = { ...((args[0] as Record<string, unknown>) || {}) };
    if (deviceId != null && loginData['deviceId'] == null) loginData['deviceId'] = deviceId;
    let data: any;
    try {
      data = await httpFetch('/api/auth/login', loginData, false);
    } catch (err) {
      // El server responde 401 ante credenciales inválidas (usuario inexistente,
      // inactivo o contraseña incorrecta). httpFetch lanza; lo traducimos a un
      // mensaje claro en vez de dejar que el AuthService muestre "Error en el servidor".
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
      const ok = refreshToken ? await refreshAccessIfPossible() : false;
      if (ok) return await doRpc();
      // 401 sin refresh posible → sesión expirada: notificar para logout+login.
      storeTokens(null, null);
      sessionExpired$.next();
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
  console.warn(`[api-http] método "${method}" no está en API_CHANNEL_MAP; uso fallback "${guess}". Regenerá el mapa si es un canal real.`);
  return guess;
}

/** Métodos que en mobile se resuelven local/sincrónicamente (no van por RPC). */
function buildExplicit(): Record<string, unknown> {
  return {
    getAppVersion: (): string => '0.0.0',
    getAppMode: (): 'client' => 'client',
    getServerUrl: (): string | null => currentBase() || null,
    getDeviceId: (): number | null => deviceId,
    getAccessToken: (): string | null => accessToken,
    // RepositoryIpcService maneja su propio currentUser (BehaviorSubject interno);
    // estos quedan como no-ops/locales por compatibilidad si algo los llama.
    setCurrentUser: (_u: unknown): void => undefined,
    getCurrentUser: async (): Promise<unknown> => null,
    getCurrentUserId: (): number | undefined => undefined,
    restoreSession: async (_id: number, _t: string): Promise<{ success: boolean }> => ({
      success: !!accessToken,
    }),
    // Invocación IPC genérica por canal explícito (usada por algunos servicios).
    callIpc: (channel: string, ...rest: any[]): Promise<any> => invokeRouter(channel, ...rest),
  };
}

/**
 * Instala el `window.api` HTTP. Llamar UNA vez antes de `bootstrapApplication`.
 */
export function installApiHttp(opts?: { serverUrl?: string; deviceId?: number | null }): void {
  baseUrl = resolveBaseUrl(opts?.serverUrl);
  const storedDevice = localStorage.getItem(DEVICE_ID_KEY);
  deviceId = opts?.deviceId ?? (storedDevice ? Number(storedDevice) || null : null);
  loadTokens();

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
  console.log(`[api-http] window.api instalado (server: "${baseUrl || 'same-origin'}")`);

  // LAN-first: detectar la red local en segundo plano y re-detectar al reconectar.
  void detectLan();
  window.addEventListener('online', () => void detectLan());
}
