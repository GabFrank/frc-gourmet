/**
 * Migración DisciplinaReconocimiento: up → down → up, en SQLite (por defecto)
 * o en Postgres con DR_E2E_PG=<base> (la base se usa vacía).
 *
 *  - up crea las tablas dr_* y nada más cambia en el resto del esquema.
 *  - down borra solo las tablas dr_* y deja el esquema igual que antes del up.
 *  - up de nuevo funciona (la migración es reversible y repetible).
 *
 * Uso: npm run test:disciplina-migracion
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
  const dbFile = path.join(tmpDir, 'test-disciplina-migracion.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['DR_E2E_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', database: pgDb, username: process.env['PGUSER'] || 'postgres' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  if (pgDb) { await ds.query('DROP SCHEMA public CASCADE'); await ds.query('CREATE SCHEMA public'); }
  console.log(`[disciplina-migracion] ${pgDb ? 'postgres' : 'sqlite'}`);
  const tablaMig = (ds.options as any).migrationsTableName || 'migrations';

  /** Esquema: tabla → columnas (ordenadas), sin la tabla de control de migraciones. */
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
  const drDe = (e: Record<string, string[]>) => Object.keys(e).filter((t) => t.startsWith('dr_')).sort();
  const sinDr = (e: Record<string, string[]>) => JSON.stringify(Object.keys(e).filter((t) => !t.startsWith('dr_')).sort().map((t) => [t, e[t]]));

  const migs = ds.migrations.map((m: any) => m.name || m.constructor.name);
  const nombreDr = migs.find((n) => /DisciplinaReconocimiento/.test(n));
  ok(!!nombreDr && migs[migs.length - 1] === nombreDr, 'la migración DR es la última registrada', migs.slice(-2));

  // Todo hasta antes de DR: se corre todo y se deshace DR para obtener el «antes».
  await ds.runMigrations({ transaction: 'each' });
  const conDr = await esquema();
  const tablasDr = drDe(conDr);
  const esperadas = ds.entityMetadatas.map((m) => m.tableName).filter((t) => t.startsWith('dr_')).sort();
  ok(esperadas.length > 0 && JSON.stringify(tablasDr) === JSON.stringify(esperadas), `up crea las ${esperadas.length} tablas dr_* de las entidades`, { tablasDr, esperadas });

  await ds.undoLastMigration({ transaction: 'each' });
  const despuesDown = await esquema();
  ok(drDe(despuesDown).length === 0, 'down borra todas las tablas dr_*', drDe(despuesDown));
  ok(sinDr(despuesDown) === sinDr(conDr), 'down no toca ninguna otra tabla ni columna');
  const reg = await ds.query(`SELECT name FROM "${tablaMig}"`);
  ok(!reg.some((r: any) => /DisciplinaReconocimiento/.test(r.name)), 'down quita el registro de la migración');

  await ds.runMigrations({ transaction: 'each' });
  const reUp = await esquema();
  ok(JSON.stringify(drDe(reUp)) === JSON.stringify(tablasDr) && canon(reUp) === canon(conDr), 'up de nuevo deja el mismo esquema');

  await ds.destroy();
  console.log(`\n[disciplina-migracion] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
