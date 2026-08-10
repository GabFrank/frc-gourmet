/**
 * Motor de backup/restore para Postgres.
 *
 * El modulo de Backup/Restore historicamente solo contemplaba SQLite (copia del
 * archivo `frc-gourmet.db`). Cuando la app corre sobre Postgres (mode server /
 * client, o standalone con driver postgres) el "backup" ya no es un archivo
 * local sino un dump generado con `pg_dump`. Este util encapsula esa logica:
 *
 *   - `pgDump`      -> genera un `.dump` (custom, comprimido) o `.sql` (plano)
 *   - `pgRestore`   -> restaura un dump (reset del schema + pg_restore / psql)
 *   - `pgResetSchema` -> DROP SCHEMA ... CASCADE + CREATE SCHEMA (reset de BD)
 *   - `getPgDatabaseSize` -> tamano de la BD para el panel de info
 *
 * Los binarios (`pg_dump`/`pg_restore`/`psql`) vienen con la instalacion de
 * Postgres; `resolvePgBinary` los busca en PATH y en las rutas tipicas de cada
 * SO, con posibilidad de override manual (config `pgBinDir`). El reset de schema
 * y el tamano usan el driver `pg` (ya es dependencia) para no depender de `psql`
 * cuando el formato elegido es custom.
 */
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

export type PgFormat = 'custom' | 'plain';

export interface PgConnInfo {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  /** Schema a respaldar/resetear. Default 'public'. */
  schema?: string;
}

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Extension de archivo para cada formato de dump. */
export function pgDumpExtension(format: PgFormat): 'dump' | 'sql' {
  return format === 'plain' ? 'sql' : 'dump';
}

/** Deriva el formato del dump a partir de la extension del archivo. */
export function pgFormatFromFile(filePath: string): PgFormat | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.dump')) return 'custom';
  if (lower.endsWith('.sql')) return 'plain';
  return null;
}

/** true si el archivo es un dump de Postgres (por extension). */
export function isPgDumpFile(filePath: string): boolean {
  return pgFormatFromFile(filePath) !== null;
}

/**
 * Localiza un binario de Postgres. Orden de busqueda:
 *   1. `overrideDir` (config manual del operador)
 *   2. directorios tipicos segun SO (incluye subdirectorios por version)
 *   3. fallback: el nombre pelado (que `spawn` resuelve via PATH)
 */
export function resolvePgBinary(
  name: 'pg_dump' | 'pg_restore' | 'psql',
  overrideDir?: string,
): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;

  if (overrideDir && overrideDir.trim()) {
    const p = path.join(overrideDir.trim(), exe);
    if (fs.existsSync(p)) return p;
  }

  const candidates: string[] = [];
  const pushVersionDirs = (base: string) => {
    try {
      for (const v of fs.readdirSync(base)) {
        candidates.push(path.join(base, v, 'bin', exe));
      }
    } catch {
      /* base inexistente: ignorar */
    }
  };

  if (process.platform === 'win32') {
    for (const base of ['C:/Program Files/PostgreSQL', 'C:/Program Files (x86)/PostgreSQL']) {
      pushVersionDirs(base);
    }
  } else {
    for (const d of ['/usr/bin', '/usr/local/bin', '/opt/homebrew/bin', '/opt/local/bin']) {
      candidates.push(path.join(d, exe));
    }
    // Linux (paquetes por version) y macOS (EnterpriseDB / Postgres.app-ish)
    for (const base of ['/usr/lib/postgresql', '/usr/local/pgsql', '/Library/PostgreSQL']) {
      pushVersionDirs(base);
    }
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return exe; // ultima chance: PATH
}

// ===================== Construccion de argumentos (funciones puras) =====================

/**
 * Args de `pg_dump` para el formato pedido, escribiendo a `outFile`.
 *
 * Se respalda la base COMPLETA (sin `-n`): un dump full no emite
 * `CREATE SCHEMA public`, por lo que restaura limpio sobre un schema public
 * recién recreado (ver `pgResetSchema` + `pgRestore`). Restringir con `-n public`
 * sí agrega `CREATE SCHEMA public`, que colisiona al restaurar. Además un backup
 * full es lo correcto (captura todo, no un solo schema).
 */
export function buildPgDumpArgs(conn: PgConnInfo, format: PgFormat, outFile: string): string[] {
  return [
    '-h', conn.host,
    '-p', String(conn.port),
    '-U', conn.username,
    '-d', conn.database,
    '--no-owner',
    '--no-privileges',
    format === 'custom' ? '-Fc' : '-Fp',
    '-f', outFile,
  ];
}

/** Args de `pg_restore` (formato custom) para restaurar `file`. */
export function buildPgRestoreArgs(conn: PgConnInfo, file: string): string[] {
  return [
    '-h', conn.host,
    '-p', String(conn.port),
    '-U', conn.username,
    '-d', conn.database,
    '--no-owner',
    '--no-privileges',
    file,
  ];
}

/** Args de `psql` (formato plano) para restaurar `file`. */
export function buildPsqlRestoreArgs(conn: PgConnInfo, file: string): string[] {
  return [
    '-h', conn.host,
    '-p', String(conn.port),
    '-U', conn.username,
    '-d', conn.database,
    '-v', 'ON_ERROR_STOP=1',
    '-f', file,
  ];
}

// ===================== Ejecucion de binarios =====================

function pgEnv(conn: PgConnInfo): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGPASSWORD: conn.password || '',
    PGCONNECT_TIMEOUT: '15',
  };
  if (conn.ssl) env['PGSSLMODE'] = 'require';
  return env;
}

function runPgCommand(bin: string, args: string[], conn: PgConnInfo): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: pgEnv(conn), windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      reject(new Error(
        `No se pudo ejecutar ${path.basename(bin)} (${err.message}). ` +
        `Verifica que Postgres este instalado o configura la carpeta de binarios (pg_dump/pg_restore/psql).`,
      ));
    });
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${path.basename(bin)} salio con codigo ${code}: ${(stderr || stdout).trim()}`));
    });
  });
}

function pgClient(conn: PgConnInfo): Client {
  return new Client({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.username,
    password: conn.password,
    ssl: conn.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 15000,
  });
}

// ===================== Operaciones de alto nivel =====================

/** Genera un dump de la BD. Devuelve el tamano del archivo resultante. */
export async function pgDump(
  conn: PgConnInfo,
  format: PgFormat,
  outFile: string,
  opts?: { binDir?: string },
): Promise<{ size: number }> {
  const bin = resolvePgBinary('pg_dump', opts?.binDir);
  await runPgCommand(bin, buildPgDumpArgs(conn, format, outFile), conn);
  if (!fs.existsSync(outFile)) {
    throw new Error('pg_dump no genero el archivo de salida.');
  }
  return { size: fs.statSync(outFile).size };
}

/**
 * Resetea el schema configurado: DROP SCHEMA ... CASCADE + CREATE SCHEMA.
 * Deja la BD vacia lista para que corran las migraciones al reiniciar, o para
 * restaurar un dump encima sin colisiones.
 */
export async function pgResetSchema(conn: PgConnInfo): Promise<void> {
  const schema = conn.schema && conn.schema.trim() ? conn.schema.trim() : 'public';
  if (!SAFE_IDENT.test(schema)) {
    throw new Error(`Nombre de schema invalido: ${schema}`);
  }
  if (!SAFE_IDENT.test(conn.username)) {
    throw new Error(`Nombre de usuario invalido: ${conn.username}`);
  }
  const client = pgClient(conn);
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.query(`CREATE SCHEMA "${schema}" AUTHORIZATION "${conn.username}"`);
  } finally {
    await client.end();
  }
}

/**
 * Restaura un dump. Estrategia uniforme: reset del schema (clean slate) y luego
 * restaura con pg_restore (custom) o psql (plano). Idempotente respecto de datos
 * previos: lo que hubiera se pierde (reemplazo total, igual que el restore SQLite).
 */
export async function pgRestore(
  conn: PgConnInfo,
  format: PgFormat,
  file: string,
  opts?: { binDir?: string },
): Promise<void> {
  if (!fs.existsSync(file)) throw new Error('Archivo de dump no encontrado.');
  await pgResetSchema(conn);
  if (format === 'custom') {
    const bin = resolvePgBinary('pg_restore', opts?.binDir);
    await runPgCommand(bin, buildPgRestoreArgs(conn, file), conn);
  } else {
    const bin = resolvePgBinary('psql', opts?.binDir);
    await runPgCommand(bin, buildPsqlRestoreArgs(conn, file), conn);
  }
}

/** Tamano de la base (bytes) via pg_database_size. 0 si no se puede leer. */
export async function getPgDatabaseSize(conn: PgConnInfo): Promise<number> {
  const client = pgClient(conn);
  await client.connect();
  try {
    const r = await client.query('SELECT pg_database_size($1) AS size', [conn.database]);
    return Number(r.rows?.[0]?.size || 0);
  } finally {
    await client.end();
  }
}

/** Prueba de conectividad simple (SELECT 1). true si conecta. */
export async function pgPing(conn: PgConnInfo): Promise<boolean> {
  const client = pgClient(conn);
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    try { await client.end(); } catch { /* noop */ }
  }
}
