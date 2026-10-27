/**
 * Migración FuncionesTareas: up → down → up, en SQLite (por defecto) o en Postgres con
 * FT_E2E_PG=<base> (127.0.0.1, usuario PGUSER o postgres; la base se vacía).
 *
 *  - up crea exactamente las tablas ft_* de las entidades, con sus índices únicos.
 *  - down borra solo las tablas ft_* y deja el resto del esquema igual que antes del up.
 *  - up de nuevo deja el mismo esquema (reversible y repetible).
 *  - CHECK de ft_funcion: exactamente uno de cargo_id / funcionario_id (en los dos motores).
 *
 * Uso: npm run test:funciones-tareas-migracion
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from '../src/app/database/database.config';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-funciones-tareas-migracion.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['FT_E2E_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  if (pgDb) { await ds.query('DROP SCHEMA public CASCADE'); await ds.query('CREATE SCHEMA public'); }
  console.log(`[ft-migracion] ${pgDb ? 'postgres' : 'sqlite'}`);
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
  const indices = async (): Promise<string[]> => (pgDb
    ? await ds.query(`SELECT indexname AS n FROM pg_indexes WHERE schemaname = 'public' AND tablename LIKE 'ft\\_%'`)
    : await ds.query(`SELECT name AS n FROM sqlite_master WHERE type = 'index' AND tbl_name LIKE 'ft\\_%' ESCAPE '\\'`)
  ).map((r: any) => r.n).sort();
  const canon = (e: Record<string, string[]>) => JSON.stringify(Object.keys(e).sort().map((t) => [t, e[t]]));
  const ftDe = (e: Record<string, string[]>) => Object.keys(e).filter((t) => t.startsWith('ft_')).sort();
  const sinFt = (e: Record<string, string[]>) => JSON.stringify(Object.keys(e).filter((t) => !t.startsWith('ft_')).sort().map((t) => [t, e[t]]));

  const migs = ds.migrations.map((m: any) => m.name || m.constructor.name);
  const nombreFt = migs.find((n) => /FuncionesTareas/.test(n));
  ok(!!nombreFt && migs[migs.length - 1] === nombreFt, 'la migración FuncionesTareas es la última registrada', migs.slice(-2));

  await ds.runMigrations({ transaction: 'each' });
  const conFt = await esquema();
  const tablasFt = ftDe(conFt);
  const esperadas = ds.entityMetadatas.map((m) => m.tableName).filter((t) => t.startsWith('ft_')).sort();
  ok(esperadas.length === 9 && JSON.stringify(tablasFt) === JSON.stringify(esperadas), `up crea las ${esperadas.length} tablas ft_* de las entidades`, { tablasFt, esperadas });
  // Columnas de cada tabla = columnas de su entidad.
  const difs: string[] = [];
  for (const meta of ds.entityMetadatas.filter((m) => m.tableName.startsWith('ft_'))) {
    const ent = meta.columns.map((c) => c.databaseName).sort();
    if (JSON.stringify(ent) !== JSON.stringify(conFt[meta.tableName])) difs.push(meta.tableName);
  }
  ok(difs.length === 0, 'las columnas coinciden con las entidades', difs);
  const idx = await indices();
  ok(['UQ_ft_tarea_instancia', 'UQ_ft_config_clave', 'UQ_ft_aviso_enviado_clave'].every((n) => idx.includes(n)), 'índices únicos creados', idx);

  // CHECK de ft_funcion (exactamente uno de cargo/funcionario)
  let rechazo = false;
  try { await ds.query(`INSERT INTO ft_funcion (descripcion, orden, activo) VALUES ('X', 0, ${pgDb ? 'true' : '1'})`); } catch { rechazo = true; }
  ok(rechazo, 'CHECK: una función sin cargo ni funcionario no entra');

  await ds.undoLastMigration({ transaction: 'each' });
  const despuesDown = await esquema();
  ok(ftDe(despuesDown).length === 0, 'down borra todas las tablas ft_*', ftDe(despuesDown));
  ok(sinFt(despuesDown) === sinFt(conFt), 'down no toca ninguna otra tabla ni columna');
  const reg = await ds.query(`SELECT name FROM "${tablaMig}"`);
  ok(!reg.some((r: any) => /FuncionesTareas/.test(r.name)), 'down quita el registro de la migración');
  ok(reg.some((r: any) => /DisciplinaReconocimiento/.test(r.name)), 'la migración anterior (DR) sigue aplicada');

  await ds.runMigrations({ transaction: 'each' });
  const reUp = await esquema();
  ok(JSON.stringify(ftDe(reUp)) === JSON.stringify(tablasFt) && canon(reUp) === canon(conFt), 'up de nuevo deja el mismo esquema');
  ok(JSON.stringify(await indices()) === JSON.stringify(idx), 'y los mismos índices');

  await ds.destroy();
  console.log(`\n[ft-migracion] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
