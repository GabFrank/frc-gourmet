/**
 * Password de la BD externa (Postgres) en keytar. Mismo patron que jwt-secret.
 */
const KEYCHAIN_SERVICE = 'com.frcgourmet.app';
const KEYCHAIN_ACCOUNT = 'postgres-password';

let keytarModule: any | undefined;
function loadKeytar(): any | null {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    keytarModule = require('keytar');
  } catch (e) {
    console.warn('[db-password] keytar no disponible:', (e as Error).message);
    keytarModule = null;
  }
  return keytarModule;
}

export async function getDbPassword(): Promise<string> {
  const k = loadKeytar();
  if (!k) return '';
  try {
    return (await k.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)) || '';
  } catch (e) {
    console.warn('[db-password] error leyendo keychain:', e);
    return '';
  }
}

export async function setDbPassword(value: string): Promise<void> {
  const k = loadKeytar();
  if (!k) {
    console.warn('[db-password] keytar no disponible — password NO persistido.');
    return;
  }
  try {
    if (value) await k.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, value);
    else await k.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  } catch (e) {
    console.warn('[db-password] error guardando en keychain:', e);
  }
}
