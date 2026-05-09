/**
 * Settings unificadas de la app. Persisten en `userData/app-settings.json`.
 *
 * Sub-secciones:
 *  - mode:     'standalone' | 'server' | 'client'  — F4 introduce server/client
 *  - database: type sqlite|postgres + opciones
 *  - network:  null en standalone, server URL/port cuando aplica
 *  - update:   canal + autoCheck (subsume update-config.json)
 *  - backup:   subsume backup-config.json (sub-tarea C)
 *  - ia:       subsume ia-config.json (sub-tarea C)
 *
 * Lectura/escritura idempotente. `readAppSettings` aplica defaults profundos
 * para que llamadores no tengan que chequear undefined sub-keys.
 */
import * as fs from 'fs';
import * as path from 'path';

const FILE_NAME = 'app-settings.json';

export type AppMode = 'standalone' | 'server' | 'client';
export type DbType = 'sqlite' | 'postgres';
export type UpdateChannel = 'stable' | 'beta' | 'alpha';

export interface DatabaseSettings {
  type: DbType;
  /** sqlite: 'default' = userData/frc-gourmet.db, sino path absoluto. */
  path?: string;
  /** postgres: connection. password va a keytar, NO a este JSON. */
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  schema?: string;
  ssl?: boolean;
}

export interface NetworkSettings {
  /** Puerto del servidor cuando mode === 'server' */
  serverPort?: number;
  /** URL del servidor cuando mode === 'client' (ej: http://192.168.1.10:7070) */
  serverUrl?: string;
}

export interface UpdateSettings {
  channel: UpdateChannel;
  autoCheck: boolean;
  lastCheckAt?: string;
}

export interface AppSettings {
  mode: AppMode;
  database: DatabaseSettings;
  network: NetworkSettings | null;
  update: UpdateSettings;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  mode: 'standalone',
  database: { type: 'sqlite', path: 'default' },
  network: null,
  update: { channel: 'stable', autoCheck: true },
};

export function getAppSettingsPath(userDataPath: string): string {
  return path.join(userDataPath, FILE_NAME);
}

function deepMerge<T>(base: T, override: Partial<T> | undefined | null): T {
  if (!override) return { ...(base as any) };
  const out: any = { ...(base as any) };
  for (const k of Object.keys(override)) {
    const bv = (base as any)[k];
    const ov = (override as any)[k];
    if (ov === null) {
      out[k] = null;
    } else if (typeof ov === 'object' && !Array.isArray(ov) && typeof bv === 'object' && bv !== null) {
      out[k] = deepMerge(bv, ov);
    } else if (ov !== undefined) {
      out[k] = ov;
    }
  }
  return out as T;
}

export function readAppSettings(userDataPath: string): AppSettings {
  const p = getAppSettingsPath(userDataPath);
  if (!fs.existsSync(p)) {
    return { ...DEFAULT_APP_SETTINGS, database: { ...DEFAULT_APP_SETTINGS.database }, update: { ...DEFAULT_APP_SETTINGS.update } };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return deepMerge(DEFAULT_APP_SETTINGS, raw);
  } catch (e) {
    console.warn('[app-settings] no se pudo leer, usando defaults:', e);
    return { ...DEFAULT_APP_SETTINGS, database: { ...DEFAULT_APP_SETTINGS.database }, update: { ...DEFAULT_APP_SETTINGS.update } };
  }
}

export function writeAppSettings(userDataPath: string, settings: AppSettings): void {
  const p = getAppSettingsPath(userDataPath);
  fs.writeFileSync(p, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Aplica un mutator inmutable y persiste. Devuelve el resultado final.
 * Uso: updateAppSettings(userData, s => ({ ...s, update: { ...s.update, channel: 'beta' } }))
 */
export function updateAppSettings(
  userDataPath: string,
  mutator: (current: AppSettings) => AppSettings,
): AppSettings {
  const current = readAppSettings(userDataPath);
  const next = mutator(current);
  writeAppSettings(userDataPath, next);
  return next;
}
