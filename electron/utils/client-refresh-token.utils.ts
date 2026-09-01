/**
 * Persistencia del **refresh token del modo cliente**.
 *
 * El problema que resuelve: en `mode=client` el access token y el refresh token
 * viven sólo como variables de módulo del `preload.ts`, así que mueren con el
 * proceso. Pero el estado de sesión de la UI sí se persiste en `localStorage`.
 * Al reabrir la app, Angular reconstruía el usuario desde ese caché mientras el
 * transporte HTTP arrancaba sin credenciales: la app mostraba tu nombre y tu
 * avatar, y cada llamada al servidor salía sin `Authorization` y volvía
 * rechazada. Sesión zombi.
 *
 * Guardando el refresh token acá, al arrancar se puede pedir un access token
 * nuevo y la sesión sigue viva de verdad.
 *
 * ## Por qué keytar y no `safeStorage`
 *
 * Mismo patrón que `jwt-secret.utils.ts`: keychain del sistema y, si no hay
 * (Linux sin keyring, que es el caso de una PC de reparto), archivo con
 * permisos `0600` en `userData`. `safeStorage` obligaría a escribir de cero su
 * propio `isEncryptionAvailable()` + fallback, y en Linux termina dependiendo
 * del mismo keyring igual. Acá se reusa un camino ya probado.
 *
 * ## Por qué NO va en localStorage
 *
 * Es una credencial de **30 días**. En `localStorage` la lee cualquier código
 * del renderer en claro. El access token, que dura 15 minutos, sí puede vivir
 * en memoria del renderer; éste no.
 *
 * ⚠️ Sólo aplica al **modo cliente de Electron**. La web `/admin` persiste sus
 * tokens en `localStorage` por su cuenta (`src/app/web/api-http.ts`) porque no
 * tiene proceso principal donde guardarlos.
 */

const KEYCHAIN_SERVICE = 'com.frcgourmet.app';
const KEYCHAIN_ACCOUNT = 'client-refresh-token';
const FALLBACK_FILE = 'client-refresh-token.local';

let keytarModule: any | undefined;
function loadKeytar(): any | null {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    keytarModule = require('keytar');
  } catch (e) {
    console.warn('[client-refresh-token] keytar no disponible, fallback filesystem:', (e as Error).message);
    keytarModule = null;
  }
  return keytarModule;
}

function fallbackPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    return path.join(app.getPath('userData'), FALLBACK_FILE);
  } catch {
    return null;
  }
}

function readFromFile(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const p = fallbackPath();
    if (!p || !fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

function writeToFile(value: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const p = fallbackPath();
    if (!p) return;
    fs.writeFileSync(p, value, { encoding: 'utf-8', mode: 0o600 });
  } catch (e) {
    console.warn('[client-refresh-token] error guardando fallback file:', e);
  }
}

function deleteFile(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const p = fallbackPath();
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    console.warn('[client-refresh-token] error borrando fallback file:', e);
  }
}

/** Devuelve el refresh token guardado, o null si no hay. */
export async function readClientRefreshToken(): Promise<string | null> {
  const k = loadKeytar();
  if (k) {
    try {
      const v = await k.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
      if (v) return v;
    } catch (e) {
      console.warn('[client-refresh-token] error leyendo keychain:', e);
    }
  }
  return readFromFile();
}

/**
 * Guarda (o borra, con `null`) el refresh token.
 *
 * Se escribe en los dos lados nunca: si el keychain acepta, se limpia el
 * archivo de fallback para no dejar la credencial en claro por duplicado.
 */
export async function writeClientRefreshToken(token: string | null): Promise<void> {
  if (!token) {
    await clearClientRefreshToken();
    return;
  }
  const k = loadKeytar();
  if (k) {
    try {
      await k.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, token);
      deleteFile();
      return;
    } catch (e) {
      console.warn('[client-refresh-token] error guardando en keychain:', e);
    }
  }
  writeToFile(token);
}

/** Borra el token de los dos almacenes. Se llama en el logout. */
export async function clearClientRefreshToken(): Promise<void> {
  const k = loadKeytar();
  if (k) {
    try {
      await k.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    } catch (e) {
      console.warn('[client-refresh-token] error borrando del keychain:', e);
    }
  }
  deleteFile();
}
