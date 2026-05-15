import * as crypto from 'crypto';

const KEYCHAIN_SERVICE = 'com.frcgourmet.app';
const KEYCHAIN_ACCOUNT = 'jwt-secret';
const FALLBACK_FILE = 'jwt-secret.local';

let keytarModule: any | undefined;
function loadKeytar(): any | null {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    keytarModule = require('keytar');
  } catch (e) {
    console.warn('[jwt-secret] keytar no disponible, fallback filesystem:', (e as Error).message);
    keytarModule = null;
  }
  return keytarModule;
}

let cachedSecret: string | null = null;

function generateSecret(): string {
  return crypto.randomBytes(48).toString('base64');
}

async function readFromKeychain(): Promise<string | null> {
  const k = loadKeytar();
  if (!k) return null;
  try {
    return (await k.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)) || null;
  } catch (e) {
    console.warn('[jwt-secret] error leyendo keychain:', e);
    return null;
  }
}

async function writeToKeychain(value: string): Promise<boolean> {
  const k = loadKeytar();
  if (!k) return false;
  try {
    await k.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, value);
    return true;
  } catch (e) {
    console.warn('[jwt-secret] error guardando en keychain:', e);
    return false;
  }
}

function readFromFile(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const p = path.join(app.getPath('userData'), FALLBACK_FILE);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim() || null;
    return null;
  } catch {
    return null;
  }
}

function writeToFile(value: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const p = path.join(app.getPath('userData'), FALLBACK_FILE);
    fs.writeFileSync(p, value, { encoding: 'utf-8', mode: 0o600 });
  } catch (e) {
    console.warn('[jwt-secret] error guardando fallback file:', e);
  }
}

export async function getJwtSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  let secret = await readFromKeychain();
  if (!secret) secret = readFromFile();

  if (!secret) {
    secret = generateSecret();
    const stored = await writeToKeychain(secret);
    if (!stored) writeToFile(secret);
    console.log('[jwt-secret] secret generado y persistido.');
  }

  cachedSecret = secret;
  return secret;
}
