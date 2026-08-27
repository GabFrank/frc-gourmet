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
  /**
   * URL pública del túnel con dominio propio (ej: https://app.midominio.com).
   * Si está seteada (mode === 'server'), el QR del dashboard apunta SIEMPRE a
   * esta URL (acceso desde cualquier red) en vez de a la IP de LAN.
   */
  remoteUrl?: string;
  /**
   * HTTPS directo en LAN (latencia baja, sin pasar por el túnel). Cuando hay
   * un certificado válido (ej: emitido para `lan.midominio.com` vía DNS-01) el
   * server abre un listener HTTPS adicional con ese cert. El A record público
   * `lan.midominio.com → IP_LAN` hace que, en el local, el dispositivo pegue
   * directo al server con cert válido (sin mixed-content).
   */
  httpsPort?: number;
  certPath?: string;
  keyPath?: string;
  /**
   * URL LAN-directa que la PWA "prueba" al arrancar (ej:
   * https://lan.midominio.com:7443). Si responde, enruta el tráfico de datos
   * por LAN; si no, cae al origen (túnel). Se expone en /api/client-config.
   */
  lanUrl?: string;
}

export interface UpdateSettings {
  channel: UpdateChannel;
  autoCheck: boolean;
  lastCheckAt?: string;
}

export type BackupMode = 'interval' | 'daily';

export type PgBackupFormat = 'custom' | 'plain';

export interface BackupSettings {
  autoBackupEnabled: boolean;
  /** 'daily' = una vez por día (default); 'interval' = cada N horas desde el arranque. */
  mode: BackupMode;
  intervalHours: number;
  /** Hora fija del backup diario 'HH:MM' local. Vacío = al abrir la app cada día. */
  dailyTime?: string;
  retentionCount: number;
  customBackupDir?: string;
  includeImages: boolean;
  lastAutoBackupAt?: string;
  /**
   * Postgres: formato del dump. 'custom' = pg_dump -Fc (.dump comprimido,
   * restaura con pg_restore); 'plain' = SQL de texto (.sql, restaura con psql).
   * Solo aplica cuando database.type === 'postgres'. Default 'custom'.
   */
  pgFormat?: PgBackupFormat;
  /**
   * Postgres: carpeta con los binarios pg_dump/pg_restore/psql, si no están en
   * el PATH del sistema. Vacío = autodetección (PATH + rutas típicas del SO).
   */
  pgBinDir?: string;
  /**
   * Número/JID de WhatsApp destino para enviar backups (formato internacional,
   * ej 595991123456, o JID de grupo). Reusa la conexión Evolution API de
   * Notificaciones. Vacío = envío deshabilitado hasta configurarlo.
   */
  whatsappDestino?: string;
}

export interface IaSettings {
  modelo: string;
  habilitado: boolean;
  // openaiApiKey persiste en keytar, NO en este JSON.
}

export interface MusicaSettings {
  /** Client ID de la app de Spotify del local (cada local crea la suya). */
  spotifyClientId: string;
  /**
   * Puerto del listener loopback que recibe el callback de OAuth. Spotify sólo
   * acepta http:// en loopback con IP explícita, así que el redirect URI es
   * `http://127.0.0.1:<puerto>/callback` y debe estar cargado igual en el
   * dashboard de Spotify.
   */
  redirectPort: number;
  /** Device de Spotify Connect elegido como salida de audio del local. */
  deviceId?: string | null;
  deviceNombre?: string | null;
  habilitado: boolean;
  /**
   * Lo que descubre la IA entra directo al repertorio en vez de esperar
   * aprobación. Default true: el dueño recurrió a la app justamente porque no
   * tiene tiempo de curar, así que el modelo es corregir por sustracción
   * ("no va") y no aprobar de a uno.
   */
  autoAprobarDescubrimientos?: boolean;
  /** Texto libre del dueño sobre el local. Va literal al prompt (F1.5). */
  brief?: string;
  /**
   * Ajustes finos del generador y del descubridor. Estaban hardcodeados; se
   * exponen porque el valor correcto depende del local y del estilo musical.
   * Cada bloque puede sobreescribir los que le apliquen.
   */
  avanzado?: MusicaAvanzado;
}

export interface MusicaAvanzado {
  /** Tope de temas por artista cuando el bloque no define el suyo. */
  maxPorArtistaDefault: number;
  /** Días que un tema no se repite. */
  ventanaAntirepeticionDias: number;
  /** Cuánto más larga que el bloque se genera la playlist. */
  factorDuracion: number;
  /** Desplazamiento de BPM entre variantes (suave −delta, movido +delta). */
  deltaBpmVariante: number;
  /** Descarta intros, skits y sets largos que no sirven de fondo. */
  duracionMinSeg: number;
  duracionMaxSeg: number;
  /** Cuántos temas pide la IA por ronda de descubrimiento. */
  candidatosPorRonda: number;
  /** Si se aceptan temas marcados como explícitos por Spotify. */
  permitirExplicit: boolean;
  /**
   * Base de la API de ReccoBeats (reemplazo del `audio-features` que Spotify
   * apagó). Configurable porque su documentación pública no fija la URL ni el
   * esquema: si cambia, se corrige acá sin recompilar.
   */
  reccobeatsUrl?: string;
  // El refresh token persiste en keytar, NO en este JSON.
  // PKCE no usa client_secret: no se guarda en ningún lado.
}

export interface UiSettings {
  /**
   * Factor de zoom del renderer (`webContents.setZoomFactor`). Es por PC:
   * la app corre en cajas, tablets y monitores de cocina con densidades muy
   * distintas, y la ventana es frameless (sin menú nativo con Zoom), así que
   * el ajuste se hace desde el menú de herramientas del header y se recuerda.
   */
  zoomFactor: number;
}

export interface AppSettings {
  mode: AppMode;
  database: DatabaseSettings;
  network: NetworkSettings | null;
  update: UpdateSettings;
  backup: BackupSettings;
  ia: IaSettings;
  musica: MusicaSettings;
  ui: UiSettings;
  /**
   * F5 paso 3: dispositivo "fisico" identificado para este proceso.
   * - standalone/server: el PC donde corre la app (selección manual).
   * - client: el dispositivo asignado a este PC cliente (se envia en login).
   * Nullable cuando aun no se selecciono — los handlers caen a `null` y la
   * columna `dispositivo_id` queda vacia (es nullable).
   */
  deviceId?: number | null;
  /**
   * Zona horaria IANA aplicada a TODO el proceso via `process.env.TZ` al
   * arranque (antes de createWindow, para que el renderer la herede). Espejo
   * de `empresa.zonaHoraria` — se persiste aca para poder leerla sync temprano.
   * Paraguay quedo en UTC-3 fijo (sin horario de invierno): si el tzdata del SO
   * esta viejo, usar 'America/Sao_Paulo' (UTC-3 estable) corrige la hora.
   */
  timezone?: string;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  mode: 'standalone',
  database: { type: 'sqlite', path: 'default' },
  network: null,
  update: { channel: 'stable', autoCheck: true },
  backup: {
    autoBackupEnabled: false,
    mode: 'daily',
    intervalHours: 24,
    retentionCount: 7,
    includeImages: false,
  },
  ia: {
    modelo: 'gpt-4o',
    habilitado: false,
  },
  musica: {
    spotifyClientId: '',
    redirectPort: 8888,
    deviceId: null,
    deviceNombre: null,
    habilitado: false,
    autoAprobarDescubrimientos: true,
    brief: '',
    avanzado: {
      maxPorArtistaDefault: 2,
      ventanaAntirepeticionDias: 3,
      factorDuracion: 1.5,
      deltaBpmVariante: 12,
      duracionMinSeg: 60,
      duracionMaxSeg: 600,
      candidatosPorRonda: 40,
      permitirExplicit: false,
      reccobeatsUrl: 'https://api.reccobeats.com/v1',
    },
  },
  ui: {
    zoomFactor: 1,
  },
  deviceId: null,
  timezone: 'America/Asuncion',
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

function cloneDefaults(): AppSettings {
  return deepMerge(DEFAULT_APP_SETTINGS, {});
}

export function readAppSettings(userDataPath: string): AppSettings {
  const p = getAppSettingsPath(userDataPath);
  if (!fs.existsSync(p)) return cloneDefaults();
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return deepMerge(DEFAULT_APP_SETTINGS, raw);
  } catch (e) {
    console.warn('[app-settings] no se pudo leer, usando defaults:', e);
    return cloneDefaults();
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
