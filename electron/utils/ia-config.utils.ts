import * as fs from 'fs';
import * as path from 'path';
import { readAppSettings, updateAppSettings } from './app-settings.utils';

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

const LEGACY_CONFIG_FILE_NAME = 'ia-config.json';
const KEYCHAIN_SERVICE = 'com.frcgourmet.app';
const KEYCHAIN_ACCOUNT = 'openai-api-key';

interface IaConfigPersisted {
  modelo?: string;
  habilitado?: boolean;
  openaiApiKey?: string; // legado: se migra a keytar la primera vez
}

export function getIaConfigPath(userDataPath: string): string {
  return path.join(userDataPath, LEGACY_CONFIG_FILE_NAME);
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

async function migrateLegacyIaConfig(userDataPath: string): Promise<void> {
  const p = getIaConfigPath(userDataPath);
  if (!fs.existsSync(p)) return;
  try {
    const persisted = JSON.parse(fs.readFileSync(p, 'utf-8')) as IaConfigPersisted;
    // openaiApiKey legacy en JSON → keytar
    if (persisted.openaiApiKey) {
      await setKeyInKeychain(persisted.openaiApiKey);
      console.log('[ia-config] openaiApiKey movida a keychain.');
    }
    // modelo/habilitado → app-settings
    updateAppSettings(userDataPath, (s) => ({
      ...s,
      ia: {
        ...s.ia,
        modelo: persisted.modelo ?? s.ia.modelo,
        habilitado: persisted.habilitado ?? s.ia.habilitado,
      },
    }));
    fs.unlinkSync(p);
    console.log('[ia-config] ia-config.json migrado a app-settings.json y eliminado.');
  } catch (e) {
    console.warn('[ia-config] error migrando legacy ia-config:', e);
  }
}

/** Lee config (app-settings + keytar). Migra automaticamente legacy si existe. */
export async function readIaConfig(userDataPath: string): Promise<IaConfig> {
  await migrateLegacyIaConfig(userDataPath);
  const settings = readAppSettings(userDataPath);
  const key = await getKeyFromKeychain();
  return {
    openaiApiKey: key,
    modelo: settings.ia.modelo,
    habilitado: settings.ia.habilitado,
  };
}

/** Escribe config (app-settings sin key + keytar para la key). */
export async function writeIaConfig(userDataPath: string, config: IaConfig): Promise<void> {
  updateAppSettings(userDataPath, (s) => ({
    ...s,
    ia: { modelo: config.modelo, habilitado: config.habilitado },
  }));
  await setKeyInKeychain(config.openaiApiKey || '');
}
