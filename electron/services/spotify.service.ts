/**
 * Cliente de Spotify Web API para el modulo de Musica ambiental.
 *
 * Rol de Spotify en el sistema: **catalogo + reproductor**. El "cerebro"
 * (programacion por franja, perfil de energia, seleccion de tracks) es nuestro.
 * Ver docs/PLAN-MUSICA-SPOTIFY.md.
 *
 * Decisiones que este archivo materializa:
 *
 * 1. **No reproducimos nosotros.** El Web Playback SDK exige Widevine DRM, que
 *    Electron no trae. Controlamos por Spotify Connect la app oficial de
 *    Spotify Desktop instalada en el PC del PdV. Este cliente es un CONTROL
 *    REMOTO, no un player.
 *
 * 2. **Authorization Code + PKCE, sin client_secret.** Spotify acepta PKCE para
 *    apps nativas; asi el secret de la app no se guarda en ningun lado. Solo
 *    persiste el refresh token, en keytar.
 *
 * 3. **Redirect loopback obligatorio.** Desde la migracion de OAuth del
 *    27-nov-2025 Spotify exige HTTPS salvo loopback con IP explicita, y
 *    prohibe `localhost` como nombre. Por eso el redirect es
 *    `http://127.0.0.1:<puerto>/callback` y levantamos un listener efimero
 *    solo durante el minuto que dura la autorizacion.
 *
 * 4. **Requiere Spotify Premium.** Todos los endpoints de player lo exigen.
 */
import * as crypto from 'crypto';
import * as http from 'http';
import { shell } from 'electron';
import { readAppSettings, updateAppSettings } from '../utils/app-settings.utils';
import {
  getSpotifyRefreshToken,
  setSpotifyRefreshToken,
  clearSpotifyRefreshToken,
} from '../utils/musica-secrets.util';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

/**
 * Set completo desde F0 aunque F0 solo use los de playback: cambiar los scopes
 * mas adelante obligaria al usuario a reconectar la cuenta. Se piden una vez.
 */
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-modify-private',
  'user-top-read',
  'user-read-recently-played',
].join(' ');

/** Margen antes del vencimiento real para renovar sin cortar la reproduccion. */
const TOKEN_MARGEN_MS = 60_000;
/** Si el usuario no autoriza en este tiempo, se cierra el listener loopback. */
const OAUTH_TIMEOUT_MS = 180_000;

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}
let tokenCache: TokenCache | null = null;

/* ───────────────────── PKCE ───────────────────── */

function base64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generarCodeVerifier(): string {
  return base64Url(crypto.randomBytes(48));
}

function generarCodeChallenge(verifier: string): string {
  return base64Url(crypto.createHash('sha256').update(verifier).digest());
}

/* ───────────────────── Config ───────────────────── */

export function getRedirectUri(userDataPath: string): string {
  const { musica } = readAppSettings(userDataPath);
  return `http://127.0.0.1:${musica.redirectPort}/callback`;
}

function getClientId(userDataPath: string): string {
  const { musica } = readAppSettings(userDataPath);
  const clientId = (musica.spotifyClientId || '').trim();
  if (!clientId) {
    throw new Error('FALTA EL CLIENT ID DE SPOTIFY. CARGALO EN CONFIGURACION → MUSICA.');
  }
  return clientId;
}

/* ───────────────────── OAuth ───────────────────── */

/**
 * Abre el navegador del sistema contra Spotify y espera el callback en el
 * listener loopback. Resuelve cuando el refresh token quedo guardado.
 *
 * Se hace UNA sola vez por local: de ahi en adelante todo es refresh silencioso.
 */
export async function conectarSpotify(userDataPath: string): Promise<{ nombreUsuario: string }> {
  const clientId = getClientId(userDataPath);
  const { musica } = readAppSettings(userDataPath);
  const redirectUri = getRedirectUri(userDataPath);
  const verifier = generarCodeVerifier();
  const challenge = generarCodeChallenge(verifier);
  const state = base64Url(crypto.randomBytes(16));

  const code = await esperarCallback(musica.redirectPort, state, () => {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      // Fuerza la pantalla de consentimiento: evita quedar pegado a una cuenta
      // equivocada si el navegador ya tenia sesion de Spotify abierta.
      show_dialog: 'true',
    });
    void shell.openExternal(`${AUTH_URL}?${params.toString()}`);
  });

  const tokens = await canjearCode(clientId, code, verifier, redirectUri);
  await setSpotifyRefreshToken(tokens.refresh_token);
  tokenCache = { accessToken: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 };

  const perfil = await spotifyApi(userDataPath, 'GET', '/me');
  return { nombreUsuario: perfil?.display_name || perfil?.id || 'SPOTIFY' };
}

/**
 * Listener HTTP efimero en 127.0.0.1 que recibe el `code`. Se cierra apenas
 * llega el callback, expira el timeout o falla el bind del puerto.
 */
function esperarCallback(
  puerto: number,
  stateEsperado: string,
  onListening: () => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let resuelto = false;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${puerto}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      const responder = (titulo: string, detalle: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          `<!doctype html><meta charset="utf-8"><title>FRC Gourmet</title>` +
            `<div style="font-family:system-ui,sans-serif;text-align:center;margin-top:15vh">` +
            `<h2>${titulo}</h2><p>${detalle}</p>` +
            `<p style="opacity:.6">Ya podes cerrar esta ventana y volver a FRC Gourmet.</p></div>`,
        );
      };

      if (error) {
        responder('No se pudo conectar', `Spotify devolvio: ${error}`);
        finalizar(new Error(`SPOTIFY RECHAZO LA AUTORIZACION: ${error}`));
      } else if (!code || state !== stateEsperado) {
        // state distinto = respuesta que no corresponde a este intento.
        responder('No se pudo conectar', 'La respuesta de Spotify no es valida.');
        finalizar(new Error('RESPUESTA DE SPOTIFY INVALIDA (STATE NO COINCIDE)'));
      } else {
        responder('Spotify conectado', 'FRC Gourmet ya puede controlar la musica del local.');
        finalizar(null, code);
      }
    });

    const timeout = setTimeout(
      () => finalizar(new Error('TIEMPO AGOTADO ESPERANDO LA AUTORIZACION DE SPOTIFY')),
      OAUTH_TIMEOUT_MS,
    );

    function finalizar(err: Error | null, code?: string) {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(timeout);
      server.close();
      if (err) reject(err);
      else resolve(code as string);
    }

    server.on('error', (e: NodeJS.ErrnoException) => {
      const msg =
        e.code === 'EADDRINUSE'
          ? `EL PUERTO ${puerto} ESTA OCUPADO. CAMBIALO EN CONFIGURACION → MUSICA (Y EN EL DASHBOARD DE SPOTIFY).`
          : `NO SE PUDO ABRIR EL PUERTO ${puerto}: ${e.message}`;
      finalizar(new Error(msg));
    });

    server.listen(puerto, '127.0.0.1', onListening);
  });
}

async function canjearCode(
  clientId: string,
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `SPOTIFY RECHAZO EL CANJE DEL CODIGO: ${data?.error_description || data?.error || res.status}`,
    );
  }
  return data;
}

/** Renueva el access token con el refresh token guardado. */
async function refrescarToken(userDataPath: string): Promise<string> {
  const clientId = getClientId(userDataPath);
  const refreshToken = await getSpotifyRefreshToken();
  if (!refreshToken) {
    throw new Error('SPOTIFY NO ESTA CONECTADO. CONECTA LA CUENTA EN CONFIGURACION → MUSICA.');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // invalid_grant = el usuario revoco el acceso o cambio la password.
    if (data?.error === 'invalid_grant') {
      await clearSpotifyRefreshToken();
      tokenCache = null;
      throw new Error('LA CONEXION CON SPOTIFY EXPIRO. VOLVE A CONECTAR LA CUENTA.');
    }
    throw new Error(`NO SE PUDO RENOVAR EL TOKEN DE SPOTIFY: ${data?.error_description || res.status}`);
  }

  // Spotify puede rotar el refresh token: si viene uno nuevo, reemplazarlo.
  if (data.refresh_token) await setSpotifyRefreshToken(data.refresh_token);
  tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function getAccessToken(userDataPath: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - TOKEN_MARGEN_MS > Date.now()) {
    return tokenCache.accessToken;
  }
  return await refrescarToken(userDataPath);
}

export async function estaConectado(): Promise<boolean> {
  return !!(await getSpotifyRefreshToken());
}

export async function desconectarSpotify(userDataPath: string): Promise<void> {
  await clearSpotifyRefreshToken();
  tokenCache = null;
  updateAppSettings(userDataPath, (s) => ({
    ...s,
    musica: { ...s.musica, deviceId: null, deviceNombre: null, habilitado: false },
  }));
}

/* ───────────────────── Llamadas a la API ───────────────────── */

/**
 * Wrapper de la Web API con las tres cosas que siempre hacen falta:
 * reintento tras 401 (token vencido antes de tiempo), respeto de `Retry-After`
 * en 429, y traduccion de los errores tipicos a mensajes accionables.
 */
export async function spotifyApi(
  userDataPath: string,
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  path: string,
  body?: any,
  _esReintento = false,
): Promise<any> {
  const token = await getAccessToken(userDataPath);
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  // 204 (sin contenido) es la respuesta normal de los endpoints de control.
  if (res.status === 204 || res.status === 202) return null;

  if (res.status === 401 && !_esReintento) {
    tokenCache = null;
    return await spotifyApi(userDataPath, method, path, body, true);
  }

  if (res.status === 429) {
    const espera = Number(res.headers.get('Retry-After') || '3');
    throw new Error(`SPOTIFY PIDIO ESPERAR ${espera} SEGUNDOS (LIMITE DE PETICIONES).`);
  }

  if (!res.ok) {
    const data: any = await res.json().catch(() => ({}));
    const detalle = data?.error?.message || `HTTP ${res.status}`;
    if (res.status === 403) {
      // Un 403 significa cosas distintas segun el endpoint: en /me/player es
      // casi siempre falta de Premium; en /playlists es que la cuenta conectada
      // no es duena ni colaboradora de esa playlist (desde feb-2026 Spotify
      // solo devuelve el contenido de playlists propias o colaborativas).
      if (method === 'GET' && (path.startsWith('/playlists') || path.startsWith('/users'))) {
        throw new Error(
          'SPOTIFY NO PERMITE LEER ESA PLAYLIST: LA CUENTA CONECTADA NO ES DUENA NI COLABORADORA. ' +
            'COPIA LOS TEMAS A UNA PLAYLIST DE ESTA CUENTA, O HACELA COLABORATIVA E INVITALA.',
        );
      }
      if (path.startsWith('/playlists') || path.startsWith('/users') || path === '/me/playlists') {
        // Escribir en playlists propias: casi siempre es scope faltante.
        throw new Error(
          `SPOTIFY RECHAZO LA OPERACION SOBRE LA PLAYLIST (${detalle}). ` +
            'SI ACABAS DE ACTUALIZAR LA APP, DESCONECTA Y VOLVE A CONECTAR SPOTIFY PARA RENOVAR LOS PERMISOS.',
        );
      }
      throw new Error(`SPOTIFY RECHAZO LA OPERACION (${detalle}). VERIFICA QUE LA CUENTA TENGA PREMIUM ACTIVO.`);
    }
    if (res.status === 404) {
      throw new Error(
        'SPOTIFY NO ENCUENTRA UN REPRODUCTOR ACTIVO. ABRI LA APP DE SPOTIFY EN ESTA PC Y VOLVE A INTENTAR.',
      );
    }
    throw new Error(`ERROR DE SPOTIFY: ${detalle}`);
  }

  return await res.json().catch(() => null);
}

/* ───────────────────── Operaciones de player ───────────────────── */

export interface DispositivoSpotify {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  volumen: number | null;
}

export async function listarDispositivos(userDataPath: string): Promise<DispositivoSpotify[]> {
  const data = await spotifyApi(userDataPath, 'GET', '/me/player/devices');
  return (data?.devices || []).map((d: any) => ({
    id: d.id,
    nombre: d.name,
    tipo: d.type,
    activo: !!d.is_active,
    volumen: d.volume_percent ?? null,
  }));
}

/** Fija el device del local y le transfiere la reproduccion. */
export async function seleccionarDispositivo(
  userDataPath: string,
  deviceId: string,
  deviceNombre: string,
): Promise<void> {
  await spotifyApi(userDataPath, 'PUT', '/me/player', { device_ids: [deviceId], play: false });
  updateAppSettings(userDataPath, (s) => ({
    ...s,
    musica: { ...s.musica, deviceId, deviceNombre },
  }));
}

function getDeviceQuery(userDataPath: string): string {
  const { musica } = readAppSettings(userDataPath);
  return musica.deviceId ? `?device_id=${encodeURIComponent(musica.deviceId)}` : '';
}

export interface EstadoReproduccion {
  reproduciendo: boolean;
  track: string | null;
  artista: string | null;
  album: string | null;
  imagenUrl: string | null;
  progresoMs: number;
  duracionMs: number;
  volumen: number | null;
  dispositivoNombre: string | null;
  dispositivoId: string | null;
}

export async function getEstado(userDataPath: string): Promise<EstadoReproduccion | null> {
  const data = await spotifyApi(userDataPath, 'GET', '/me/player');
  if (!data) return null; // 204: no hay sesion activa en ningun device
  const item = data.item;
  return {
    reproduciendo: !!data.is_playing,
    track: item?.name ?? null,
    artista: (item?.artists || []).map((a: any) => a.name).join(', ') || null,
    album: item?.album?.name ?? null,
    imagenUrl: item?.album?.images?.[0]?.url ?? null,
    progresoMs: data.progress_ms ?? 0,
    duracionMs: item?.duration_ms ?? 0,
    volumen: data.device?.volume_percent ?? null,
    dispositivoNombre: data.device?.name ?? null,
    dispositivoId: data.device?.id ?? null,
  };
}

/** `contextUri` = playlist/album; si va vacio, reanuda lo que estaba sonando. */
export async function reproducir(userDataPath: string, contextUri?: string): Promise<void> {
  const body = contextUri ? { context_uri: contextUri } : undefined;
  await spotifyApi(userDataPath, 'PUT', `/me/player/play${getDeviceQuery(userDataPath)}`, body);
}

export async function pausar(userDataPath: string): Promise<void> {
  await spotifyApi(userDataPath, 'PUT', `/me/player/pause${getDeviceQuery(userDataPath)}`);
}

export async function siguiente(userDataPath: string): Promise<void> {
  await spotifyApi(userDataPath, 'POST', `/me/player/next${getDeviceQuery(userDataPath)}`);
}

export async function anterior(userDataPath: string): Promise<void> {
  await spotifyApi(userDataPath, 'POST', `/me/player/previous${getDeviceQuery(userDataPath)}`);
}

export async function setVolumen(userDataPath: string, porcentaje: number): Promise<void> {
  const v = Math.max(0, Math.min(100, Math.round(porcentaje)));
  const q = getDeviceQuery(userDataPath);
  const sep = q ? '&' : '?';
  await spotifyApi(userDataPath, 'PUT', `/me/player/volume${q}${sep}volume_percent=${v}`);
}

/**
 * Apaga shuffle y repeat: la secuencia la decide nuestro planificador, no
 * Spotify. Se llama al tomar control del device.
 */
export async function normalizarModoReproduccion(userDataPath: string): Promise<void> {
  const q = getDeviceQuery(userDataPath);
  const sep = q ? '&' : '?';
  await spotifyApi(userDataPath, 'PUT', `/me/player/shuffle${q}${sep}state=false`);
  await spotifyApi(userDataPath, 'PUT', `/me/player/repeat${q}${sep}state=off`);
}
