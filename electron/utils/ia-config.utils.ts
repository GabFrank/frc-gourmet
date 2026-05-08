import * as fs from 'fs';
import * as path from 'path';

export interface IaConfig {
  openaiApiKey: string;
  modelo: string;
  habilitado: boolean;
}

export const DEFAULT_IA_CONFIG: IaConfig = {
  openaiApiKey: '',
  modelo: 'gpt-4o',
  habilitado: false,
};

const CONFIG_FILE_NAME = 'ia-config.json';
const KEYCHAIN_SERVICE = 'com.frcgourmet.app';
const KEYCHAIN_ACCOUNT = 'openai-api-key';

interface IaConfigPersisted {
  modelo?: string;
  habilitado?: boolean;
  openaiApiKey?: string; // legado: se migra a keytar la primera vez
}

export function getIaConfigPath(userDataPath: string): string {
  return path.join(userDataPath, CONFIG_FILE_NAME);
}

export function getFacturaImportsDir(userDataPath: string): string {
  const dir = path.join(userDataPath, 'factura-imports');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/* ───────────────────── Keytar (con fallback) ───────────────────── */

let keytarModule: any | undefined; // undefined = no intentado, null = no disponible
function loadKeytar(): any | null {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    keytarModule = require('keytar');
  } catch (e) {
    console.warn('[ia-config] keytar no disponible, fallback a JSON plaintext:', (e as Error).message);
    keytarModule = null;
  }
  return keytarModule;
}

async function getKeyFromKeychain(): Promise<string> {
  const k = loadKeytar();
  if (!k) return '';
  try {
    const v = await k.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    return v || '';
  } catch (e) {
    console.warn('[ia-config] error leyendo keychain:', e);
    return '';
  }
}

async function setKeyInKeychain(value: string): Promise<void> {
  const k = loadKeytar();
  if (!k) return;
  try {
    if (value) await k.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, value);
    else await k.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
  } catch (e) {
    console.warn('[ia-config] error guardando en keychain:', e);
  }
}

/* ───────────────────── API pública ───────────────────── */

/** Lee config (JSON + keytar). Migra automaticamente la key plaintext si existe. */
export async function readIaConfig(userDataPath: string): Promise<IaConfig> {
  const p = getIaConfigPath(userDataPath);
  let persisted: IaConfigPersisted = {};
  if (fs.existsSync(p)) {
    try {
      persisted = JSON.parse(fs.readFileSync(p, 'utf-8')) as IaConfigPersisted;
    } catch (e) {
      console.warn('No se pudo leer ia-config.json:', e);
    }
  }

  // Migración legado: si la key estaba en JSON, moverla a keychain y borrarla del JSON
  let key = '';
  if (persisted.openaiApiKey) {
    key = persisted.openaiApiKey;
    await setKeyInKeychain(key);
    delete persisted.openaiApiKey;
    fs.writeFileSync(p, JSON.stringify(persisted, null, 2), 'utf-8');
    console.log('[ia-config] Migración: openaiApiKey movida a keychain, removida de JSON.');
  } else {
    key = await getKeyFromKeychain();
  }

  return {
    openaiApiKey: key,
    modelo: persisted.modelo ?? DEFAULT_IA_CONFIG.modelo,
    habilitado: persisted.habilitado ?? DEFAULT_IA_CONFIG.habilitado,
  };
}

/** Escribe config (JSON sin key + keytar para la key). */
export async function writeIaConfig(userDataPath: string, config: IaConfig): Promise<void> {
  const persisted: IaConfigPersisted = {
    modelo: config.modelo,
    habilitado: config.habilitado,
  };
  fs.writeFileSync(getIaConfigPath(userDataPath), JSON.stringify(persisted, null, 2), 'utf-8');
  await setKeyInKeychain(config.openaiApiKey || '');
}
