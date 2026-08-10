/**
 * Secretos del modulo de Musica en keytar (almacen seguro del SO).
 * Mismo patron que notificaciones-secrets.util / db-password.utils.
 *
 * - Refresh token de Spotify (OAuth): permite renovar el access token sin
 *   volver a abrir el navegador. Es el unico secreto persistente del modulo.
 *
 * El flujo usado es Authorization Code + PKCE, que NO requiere client_secret:
 * por eso el secret de la app de Spotify no se guarda en ningun lado.
 *
 * NUNCA se persisten en la BD ni en JSON en texto plano.
 */
const KEYCHAIN_SERVICE = 'com.frcgourmet.app';
const ACCOUNT_SPOTIFY_REFRESH = 'musica-spotify-refresh-token';

let keytarModule: any | undefined;
function loadKeytar(): any | null {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    keytarModule = require('keytar');
  } catch (e) {
    console.warn('[musica-secrets] keytar no disponible:', (e as Error).message);
    keytarModule = null;
  }
  return keytarModule;
}

async function getSecret(account: string): Promise<string> {
  const k = loadKeytar();
  if (!k) return '';
  try {
    return (await k.getPassword(KEYCHAIN_SERVICE, account)) || '';
  } catch (e) {
    console.warn('[musica-secrets] error leyendo keychain:', e);
    return '';
  }
}

async function setSecret(account: string, value: string): Promise<void> {
  const k = loadKeytar();
  if (!k) {
    console.warn('[musica-secrets] keytar no disponible — secreto NO persistido.');
    return;
  }
  try {
    if (value) await k.setPassword(KEYCHAIN_SERVICE, account, value);
    else await k.deletePassword(KEYCHAIN_SERVICE, account);
  } catch (e) {
    console.warn('[musica-secrets] error guardando en keychain:', e);
  }
}

export const getSpotifyRefreshToken = () => getSecret(ACCOUNT_SPOTIFY_REFRESH);
export const setSpotifyRefreshToken = (v: string) => setSecret(ACCOUNT_SPOTIFY_REFRESH, v);
export const clearSpotifyRefreshToken = () => setSecret(ACCOUNT_SPOTIFY_REFRESH, '');
