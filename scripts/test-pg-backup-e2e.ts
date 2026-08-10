/**
 * E2E: backup/restore de Postgres + generalización del contenedor .frcbak.
 *
 * Levanta un cluster Postgres temporal (initdb + pg_ctl, corriendo como el
 * usuario `postgres` porque los binarios se niegan a correr como root), crea
 * datos, y ejercita el motor real de `electron/utils/pg-backup.utils.ts` y la
 * generalización de `electron/utils/backup-utils.ts`:
 *
 *   - pgDump custom (.dump) y plano (.sql)
 *   - pgResetSchema (drop + create schema)
 *   - pgRestore de ambos formatos -> los datos vuelven
 *   - getPgDatabaseSize / pgPing
 *   - resolvePgBinary / build*Args (funciones puras)
 *   - packFrcBak/unpackFrcBak con dbType='postgres' (dump + imágenes) y restore
 *   - helpers de nombre/extensión (buildBackupFileName, backupDbTypeFromName, ...)
 *
 * Uso: npm run test:pg-backup
 * Requiere: initdb, pg_ctl, pg_dump, pg_restore, psql en el sistema, y el
 * usuario `postgres`. Si no están disponibles, el test se SALTEA (exit 0).
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { Client } from 'pg';

import {
  PgConnInfo,
  resolvePgBinary,
  buildPgDumpArgs,
  buildPgRestoreArgs,
  buildPsqlRestoreArgs,
  pgDump,
  pgRestore,
  pgResetSchema,
  getPgDatabaseSize,
  pgPing,
  pgDumpExtension,
  pgFormatFromFile,
  isPgDumpFile,
} from '../electron/utils/pg-backup.utils';
import {
  buildBackupFileName,
  backupDbTypeFromName,
  packFrcBak,
  unpackFrcBak,
  readFrcBakManifest,
  frcBakDbFileName,
  pruneSafetyBackups,
} from '../electron/utils/backup-utils';

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const PG_USER = 'postgres';
const PG_PORT = 54329;
const PG_DB = 'frc_backup_test';

/** Directorio de binarios de servidor (initdb/pg_ctl) — no siempre en PATH. */
function resolveServerBinDir(): string {
  const candidates: string[] = ['/usr/bin', '/usr/local/bin'];
  for (const base of ['/usr/lib/postgresql', '/usr/local/pgsql', '/Library/PostgreSQL']) {
    try { for (const v of fs.readdirSync(base)) candidates.push(path.join(base, v, 'bin')); } catch { /* noop */ }
  }
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'initdb')) || fs.existsSync(path.join(c, 'initdb.exe'))) return c;
  }
  return '';
}

const PG_BIN_DIR = resolveServerBinDir();
const PG_PATH_ENV = PG_BIN_DIR ? `${PG_BIN_DIR}:${process.env['PATH'] || ''}` : (process.env['PATH'] || '');

function run(cmd: string, args: string[], opts: { asPostgres?: boolean } = {}): string {
  const full = PG_BIN_DIR ? path.join(PG_BIN_DIR, cmd) : cmd;
  const finalCmd = opts.asPostgres ? 'runuser' : full;
  const finalArgs = opts.asPostgres ? ['-u', PG_USER, '--', full, ...args] : args;
  return execFileSync(finalCmd, finalArgs, {
    env: { ...process.env, PATH: PG_PATH_ENV },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString();
}

function toolsAvailable(): boolean {
  if (!PG_BIN_DIR) return false;
  for (const t of ['initdb', 'pg_ctl', 'pg_dump', 'pg_restore', 'psql', 'createdb']) {
    if (!fs.existsSync(path.join(PG_BIN_DIR, t)) && !fs.existsSync(path.join(PG_BIN_DIR, `${t}.exe`))) return false;
  }
  try { execFileSync('getent', ['passwd', PG_USER], { stdio: 'ignore' }); } catch { return false; }
  return true;
}

async function main() {
  if (!toolsAvailable()) {
    console.log('[pg-backup] Herramientas Postgres o usuario `postgres` no disponibles: SALTEADO.');
    process.exit(0);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frc-pgbak-'));
  const dataDir = path.join(workDir, 'pgdata');
  const sockDir = path.join(workDir, 'sock');
  const backupDir = path.join(workDir, 'backups');
  const logFile = path.join(workDir, 'pg.log');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(sockDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  // El usuario postgres debe poder leer/escribir el árbol.
  execFileSync('chown', ['-R', `${PG_USER}:${PG_USER}`, workDir]);
  execFileSync('chmod', ['-R', 'u+rwX', workDir]);

  let started = false;
  try {
    // 1) initdb (trust auth, sin password)
    run('initdb', ['-D', dataDir, '-U', PG_USER, '-A', 'trust', '--auth-host=trust', '--auth-local=trust'], { asPostgres: true });
    console.log('[pg-backup] initdb OK.');

    // 2) start
    run('pg_ctl', [
      '-D', dataDir,
      '-l', logFile,
      '-o', `-p ${PG_PORT} -c listen_addresses=localhost -k ${sockDir}`,
      '-w', 'start',
    ], { asPostgres: true });
    started = true;
    console.log(`[pg-backup] Postgres arriba en localhost:${PG_PORT}.`);

    // 3) crear DB
    run('createdb', ['-h', 'localhost', '-p', String(PG_PORT), '-U', PG_USER, PG_DB], { asPostgres: true });

    const conn: PgConnInfo = {
      host: 'localhost',
      port: PG_PORT,
      database: PG_DB,
      username: PG_USER,
      password: '',
      schema: 'public',
    };

    // ---- Sembrar datos ----
    const seed = new Client({ host: 'localhost', port: PG_PORT, database: PG_DB, user: PG_USER });
    await seed.connect();
    await seed.query(`CREATE TABLE clientes (id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, saldo NUMERIC(12,2) DEFAULT 0)`);
    await seed.query(`CREATE INDEX idx_clientes_nombre ON clientes (nombre)`);
    await seed.query(`INSERT INTO clientes (nombre, saldo) VALUES ('JUAN', 1500.50), ('MARIA', 0), ('PEDRO', 999999.99)`);
    await seed.end();

    const countRows = async (): Promise<number> => {
      const c = new Client({ host: 'localhost', port: PG_PORT, database: PG_DB, user: PG_USER });
      await c.connect();
      try {
        const r = await c.query('SELECT count(*)::int AS n FROM clientes');
        return r.rows[0].n;
      } finally { await c.end(); }
    };
    const tableExists = async (): Promise<boolean> => {
      const c = new Client({ host: 'localhost', port: PG_PORT, database: PG_DB, user: PG_USER });
      await c.connect();
      try {
        const r = await c.query(`SELECT to_regclass('public.clientes') IS NOT NULL AS ex`);
        return r.rows[0].ex === true;
      } finally { await c.end(); }
    };

    // ========== Funciones puras ==========
    console.log('\n[pg-backup] Funciones puras');
    ok(pgDumpExtension('custom') === 'dump', 'pgDumpExtension custom -> dump');
    ok(pgDumpExtension('plain') === 'sql', 'pgDumpExtension plain -> sql');
    ok(pgFormatFromFile('/x/y.dump') === 'custom', 'pgFormatFromFile .dump -> custom');
    ok(pgFormatFromFile('/x/y.sql') === 'plain', 'pgFormatFromFile .sql -> plain');
    ok(pgFormatFromFile('/x/y.db') === null, 'pgFormatFromFile .db -> null');
    ok(isPgDumpFile('a.dump') && isPgDumpFile('a.sql') && !isPgDumpFile('a.db'), 'isPgDumpFile');
    const dumpArgs = buildPgDumpArgs(conn, 'custom', '/tmp/o.dump');
    ok(dumpArgs.includes('-Fc') && dumpArgs.includes('--no-owner') && dumpArgs.includes(PG_DB), 'buildPgDumpArgs custom');
    ok(buildPgDumpArgs(conn, 'plain', '/tmp/o.sql').includes('-Fp'), 'buildPgDumpArgs plain -> -Fp');
    ok(buildPgRestoreArgs(conn, '/tmp/o.dump').includes('--no-privileges'), 'buildPgRestoreArgs');
    ok(buildPsqlRestoreArgs(conn, '/tmp/o.sql').includes('ON_ERROR_STOP=1'), 'buildPsqlRestoreArgs ON_ERROR_STOP');
    const resolved = resolvePgBinary('pg_dump');
    ok(!!resolved, 'resolvePgBinary devuelve algo', resolved);

    ok(buildBackupFileName({ withImages: false, isAutomatic: false, dbExt: 'dump' }).endsWith('.dump'), 'buildBackupFileName dbExt dump');
    ok(buildBackupFileName({ withImages: false, isAutomatic: true, dbExt: 'sql' }).endsWith('.sql'), 'buildBackupFileName dbExt sql');
    ok(buildBackupFileName({ withImages: true, isAutomatic: false, dbExt: 'dump' }).endsWith('.frcbak'), 'buildBackupFileName withImages -> frcbak');
    ok(backupDbTypeFromName('x.dump') === 'postgres' && backupDbTypeFromName('x.db') === 'sqlite', 'backupDbTypeFromName');

    // ========== Conectividad / tamaño ==========
    console.log('\n[pg-backup] Conectividad');
    ok(await pgPing(conn), 'pgPing true');
    ok((await getPgDatabaseSize(conn)) > 0, 'getPgDatabaseSize > 0');

    // ========== Dump + reset + restore (custom) ==========
    console.log('\n[pg-backup] Dump/restore formato custom (.dump)');
    const dumpCustom = path.join(backupDir, 'bk.dump');
    const rc = await pgDump(conn, 'custom', dumpCustom);
    ok(fs.existsSync(dumpCustom) && rc.size > 0, 'pgDump custom generó archivo', rc.size);
    ok(await countRows() === 3, 'datos presentes antes del reset');
    await pgResetSchema(conn);
    ok(!(await tableExists()), 'pgResetSchema borró la tabla');
    await pgRestore(conn, 'custom', dumpCustom);
    ok(await tableExists(), 'pgRestore custom recreó la tabla');
    ok(await countRows() === 3, 'pgRestore custom restauró las 3 filas');

    // ========== Dump + reset + restore (plain) ==========
    console.log('\n[pg-backup] Dump/restore formato plano (.sql)');
    const dumpPlain = path.join(backupDir, 'bk.sql');
    const rp = await pgDump(conn, 'plain', dumpPlain);
    ok(fs.existsSync(dumpPlain) && rp.size > 0, 'pgDump plain generó archivo', rp.size);
    ok(fs.readFileSync(dumpPlain, 'utf-8').includes('CREATE TABLE'), 'dump plano contiene CREATE TABLE');
    await pgResetSchema(conn);
    ok(!(await tableExists()), 'reset antes de restore plano');
    await pgRestore(conn, 'plain', dumpPlain);
    ok(await countRows() === 3, 'pgRestore plain restauró las 3 filas');

    // ========== .frcbak generalizado (dump + imágenes) ==========
    console.log('\n[pg-backup] Contenedor .frcbak con dbType=postgres');
    // Imágenes de mentira
    const imgRoot = path.join(workDir, 'ud');
    const profDir = path.join(imgRoot, 'profile-images');
    fs.mkdirSync(profDir, { recursive: true });
    fs.writeFileSync(path.join(profDir, 'a.png'), Buffer.from('PNGDATA-A'));
    const dumpForBak = path.join(backupDir, 'forbak.dump');
    await pgDump(conn, 'custom', dumpForBak);
    const frcbak = path.join(backupDir, 'full.frcbak');
    const packed = packFrcBak({
      outFile: frcbak,
      dbPath: dumpForBak,
      dbFileName: 'frc-gourmet.dump',
      dbType: 'postgres',
      imagesDirs: [{ relRoot: 'profile-images', absDir: profDir }],
    });
    ok(fs.existsSync(frcbak) && packed.size > 0, 'packFrcBak (postgres) generó contenedor');
    const manifest = readFrcBakManifest(frcbak);
    ok(manifest.dbType === 'postgres', 'manifest.dbType === postgres');
    ok(frcBakDbFileName(manifest) === 'frc-gourmet.dump', 'frcBakDbFileName === frc-gourmet.dump');

    // Unpack: dump a temp, imágenes a un userData nuevo
    const restoreUd = path.join(workDir, 'restore-ud');
    fs.mkdirSync(restoreUd, { recursive: true });
    const tmpDump = path.join(workDir, 'unpacked.dump');
    const un = unpackFrcBak({ srcFile: frcbak, targetUserDataPath: restoreUd, dbDest: tmpDump });
    ok(un.dbDestPath === tmpDump && fs.existsSync(tmpDump), 'unpackFrcBak extrajo el dump al dbDest');
    ok(Buffer.compare(fs.readFileSync(tmpDump), fs.readFileSync(dumpForBak)) === 0, 'dump extraído idéntico al original');
    ok(fs.existsSync(path.join(restoreUd, 'profile-images', 'a.png')), 'imagen extraída a userData');

    // Restaurar el dump extraído del frcbak
    await pgResetSchema(conn);
    await pgRestore(conn, pgFormatFromFile(tmpDump)!, tmpDump);
    ok(await countRows() === 3, 'restore del dump extraído del .frcbak restauró las filas');

    // Backup viejo (sin dbType) => se asume sqlite / frc-gourmet.db
    ok(frcBakDbFileName({ version: 1, createdAt: '', dbHash: '', files: [] } as any) === 'frc-gourmet.db',
      'frcBakDbFileName fallback backup viejo -> frc-gourmet.db');

    // ========== Modos de unpack (db-only / images-only) ==========
    console.log('\n[pg-backup] unpackFrcBak modos + seguridad');
    const udDbOnly = path.join(workDir, 'ud-db-only');
    fs.mkdirSync(udDbOnly, { recursive: true });
    const dbOnlyDest = path.join(workDir, 'dbonly.dump');
    unpackFrcBak({ srcFile: frcbak, targetUserDataPath: udDbOnly, dbDest: dbOnlyDest, mode: 'db-only' });
    ok(fs.existsSync(dbOnlyDest), 'db-only: extrajo el dump');
    ok(!fs.existsSync(path.join(udDbOnly, 'profile-images', 'a.png')), 'db-only: NO extrajo imágenes');

    const udImgOnly = path.join(workDir, 'ud-img-only');
    fs.mkdirSync(udImgOnly, { recursive: true });
    const imgOnlyDbDest = path.join(workDir, 'shouldnot.dump');
    unpackFrcBak({ srcFile: frcbak, targetUserDataPath: udImgOnly, dbDest: imgOnlyDbDest, mode: 'images-only' });
    ok(fs.existsSync(path.join(udImgOnly, 'profile-images', 'a.png')), 'images-only: extrajo imágenes');
    ok(!fs.existsSync(imgOnlyDbDest), 'images-only: NO extrajo el dump');

    // Path traversal: construir un .frcbak malicioso a mano y verificar rechazo.
    const evilManifest = {
      version: 1, createdAt: 'x', dbType: 'sqlite', dbFileName: 'frc-gourmet.db', dbHash: '',
      files: [{ relPath: '../evil.bin', size: 3, sha256: '' }],
    };
    const mBuf = Buffer.from(JSON.stringify(evilManifest), 'utf-8');
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(mBuf.length, 0);
    const evilPath = path.join(workDir, 'evil.frcbak');
    fs.writeFileSync(evilPath, Buffer.concat([lenBuf, mBuf, Buffer.from('XYZ')]));
    let traversalBlocked = false;
    try {
      unpackFrcBak({ srcFile: evilPath, targetUserDataPath: path.join(workDir, 'evil-ud'), mode: 'images-only' });
    } catch (e: any) {
      traversalBlocked = /insegura/i.test(e?.message || '');
    }
    ok(traversalBlocked, 'path traversal en relPath es rechazado');
    ok(!fs.existsSync(path.join(workDir, 'evil.bin')), 'archivo fuera del userData NO fue escrito');

    // Manifest length inválido (corrupto)
    const badLen = Buffer.alloc(4); badLen.writeUInt32BE(50 * 1024 * 1024, 0);
    const badPath = path.join(workDir, 'bad.frcbak');
    fs.writeFileSync(badPath, Buffer.concat([badLen, Buffer.from('{}')]));
    let lenBlocked = false;
    try { unpackFrcBak({ srcFile: badPath, targetUserDataPath: workDir }); }
    catch (e: any) { lenBlocked = /Manifest length/i.test(e?.message || ''); }
    ok(lenBlocked, 'manifest length inválido es rechazado');

    // ========== pruneSafetyBackups ==========
    console.log('\n[pg-backup] pruneSafetyBackups');
    const pruneDir = path.join(workDir, 'prune');
    fs.mkdirSync(pruneDir, { recursive: true });
    for (let i = 0; i < 8; i++) {
      const f = path.join(pruneDir, `pre-restore-${1000 + i}.dump`);
      fs.writeFileSync(f, 'x');
      // mtime creciente para orden determinístico
      const t = new Date(2020, 0, 1, 0, 0, i);
      fs.utimesSync(f, t, t);
    }
    fs.writeFileSync(path.join(pruneDir, 'frc-gourmet-backup_auto_x.dump'), 'keep'); // no es safety
    const pruned = pruneSafetyBackups(pruneDir, 3);
    const remaining = fs.readdirSync(pruneDir).filter((n) => n.startsWith('pre-restore-'));
    ok(pruned.deleted.length === 5 && remaining.length === 3, 'pruneSafetyBackups deja los 3 más nuevos', { deleted: pruned.deleted.length, remaining: remaining.length });
    ok(fs.existsSync(path.join(pruneDir, 'frc-gourmet-backup_auto_x.dump')), 'prune no toca backups normales');

  } finally {
    if (started) {
      try { run('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], { asPostgres: true }); } catch { /* noop */ }
    }
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* noop */ }
  }

  console.log(`\n[pg-backup] Resultado: ${passed} OK, ${failed} FALLIDOS`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('[pg-backup] Error fatal:', e);
  process.exit(1);
});
