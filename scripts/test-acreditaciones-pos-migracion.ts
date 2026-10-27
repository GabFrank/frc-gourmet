/**
 * Migración AcreditacionesPosReglas (issue #320): up / down / up en SQLite (o Postgres con
 * ACRED_PG=<base>, 127.0.0.1, usuario PGUSER o postgres; la base se vacía).
 * Uso: npm run test:acreditaciones-pos-migracion
 */
import 'reflect-metadata';
import './_electron-mock';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from '../src/app/database/database.config';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const TABLAS = ['maquinas_pos_reglas', 'conciliaciones_pos'];
const COLS_NUEVAS: Record<string, string[]> = {
  maquinas_pos: ['auto_acreditar'],
  pagos_detalles: ['medio_pos'],
  acreditaciones_pos: ['medio', 'marca', 'cuotas', 'monto_iva_comision', 'monto_ret_renta', 'monto_ret_iva', 'regla_id', 'conciliacion_id'],
};

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-acreditaciones-pos-migracion.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['ACRED_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  if (pgDb) { await ds.query('DROP SCHEMA public CASCADE'); await ds.query('CREATE SCHEMA public'); }
  console.log(`[acred-migracion] ${pgDb ? 'postgres' : 'sqlite'}`);
  const tablaMig = (ds.options as any).migrationsTableName || 'migrations';

  const esquema = async (): Promise<Record<string, string[]>> => {
    const filas: { t: string; c: string }[] = pgDb
      ? await ds.query(`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public'`)
      : (await Promise.all(
          (await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)).map(async (r: any) =>
            (await ds.query(`PRAGMA table_info('${r.name}')`)).map((c: any) => ({ t: r.name, c: c.name })),
          ),
        )).flat();
    const out: Record<string, string[]> = {};
    for (const f of filas) if (f.t !== tablaMig) (out[f.t] ??= []).push(f.c);
    for (const k of Object.keys(out)) out[k].sort();
    return out;
  };
  const canon = (e: Record<string, string[]>) => JSON.stringify(Object.keys(e).sort().map((t) => [t, e[t]]));

  const migs = ds.migrations.map((m: any) => m.name || m.constructor.name);
  const nombre = migs.find((n) => /AcreditacionesPosReglas/.test(n));
  ok(!!nombre, 'la migración está registrada');
  const posteriores = nombre ? migs.length - 1 - migs.indexOf(nombre) : 0;
  const hasta = async () => {
    await ds.runMigrations({ transaction: 'each' });
    for (let i = 0; i < posteriores; i++) await ds.undoLastMigration({ transaction: 'each' });
  };

  await hasta();
  const con = await esquema();
  ok(TABLAS.every((t) => !!con[t]), 'up crea maquinas_pos_reglas y conciliaciones_pos');
  const difs: string[] = [];
  for (const meta of ds.entityMetadatas.filter((m) => [...TABLAS, ...Object.keys(COLS_NUEVAS)].includes(m.tableName))) {
    const ent = meta.columns.map((c) => c.databaseName).sort();
    if (JSON.stringify(ent) !== JSON.stringify(con[meta.tableName])) difs.push(`${meta.tableName}: ${JSON.stringify(ent)} vs ${JSON.stringify(con[meta.tableName])}`);
  }
  ok(difs.length === 0, 'las columnas coinciden con las entidades (tablas nuevas y modificadas)', difs);

  // Datos previos: una máquina y una acreditación existentes siguen igual y toman los defaults.
  const T = pgDb ? 'true' : '1';
  await ds.query(`INSERT INTO cuentas_bancarias (nombre, banco, numero_cuenta, tipo_cuenta, titular, saldo, saldo_reservado, activo) VALUES ('X', 'B', '1', 'AHORRO', 'T', 0, 0, ${T})`).catch(() => undefined);
  const maq = await ds.query(`INSERT INTO maquinas_pos (nombre, porcentaje_comision, minutos_acreditacion, activo) VALUES ('M', 3.5, 2160, ${T})${pgDb ? ' RETURNING id' : ''}`);
  const filasMaq = await ds.query(`SELECT auto_acreditar FROM maquinas_pos`);
  ok(filasMaq.length === 1 && (filasMaq[0].auto_acreditar === true || filasMaq[0].auto_acreditar === 1), 'auto_acreditar por defecto = true (comportamiento anterior)', filasMaq);
  let dup = false;
  const maqId = pgDb ? maq[0].id : (await ds.query(`SELECT id FROM maquinas_pos`))[0].id;
  await ds.query(`INSERT INTO maquinas_pos_reglas (maquina_pos_id, medio) VALUES (${maqId}, 'CREDITO')`);
  try { await ds.query(`INSERT INTO maquinas_pos_reglas (maquina_pos_id, medio) VALUES (${maqId}, 'CREDITO')`); } catch { dup = true; }
  ok(dup, 'una sola regla por máquina y medio (índice único)');
  await ds.query(`DELETE FROM maquinas_pos_reglas`);
  await ds.query(`DELETE FROM maquinas_pos`);

  await ds.undoLastMigration({ transaction: 'each' });
  const despues = await esquema();
  ok(TABLAS.every((t) => !despues[t]), 'down borra las dos tablas nuevas');
  ok(Object.entries(COLS_NUEVAS).every(([t, cs]) => cs.every((c) => !(despues[t] || []).includes(c))), 'down quita las columnas nuevas');
  const reg = await ds.query(`SELECT name FROM "${tablaMig}"`);
  ok(!reg.some((r: any) => /AcreditacionesPosReglas/.test(r.name)), 'down quita el registro de la migración');

  await hasta();
  ok(canon(await esquema()) === canon(con), 'up de nuevo deja el mismo esquema');

  await ds.destroy();
  console.log(`\n[acred-migracion] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
