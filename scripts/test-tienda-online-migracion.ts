/**
 * Migración TiendaOnlineSeguridad (PLAN-tienda-online F1): up / down / up en SQLite, o en
 * Postgres con TIENDA_PG=<base> (127.0.0.1, PGUSER o postgres). Con TIENDA_PG_VACIAR=1 la
 * base se vacía antes; si no, corre sobre lo que tenga (p. ej. una copia de producción).
 * Uso: npm run test:tienda-online-migracion
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

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-tienda-online-migracion.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['TIENDA_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  if (pgDb && process.env['TIENDA_PG_VACIAR'] === '1') { await ds.query('DROP SCHEMA public CASCADE'); await ds.query('CREATE SCHEMA public'); }
  console.log(`[tienda-migracion] ${pgDb ? 'postgres ' + pgDb : 'sqlite'}`);

  const migs = ds.migrations.map((m: any) => m.name || m.constructor.name);
  const nombre = migs.find((n) => /TiendaOnlineSeguridad/.test(n));
  ok(!!nombre, 'la migración está registrada');
  const posteriores = nombre ? migs.length - 1 - migs.indexOf(nombre) : 0;
  const hasta = async () => {
    await ds.runMigrations({ transaction: 'each' });
    for (let i = 0; i < posteriores; i++) await ds.undoLastMigration({ transaction: 'each' });
  };
  const columnas = async (): Promise<string[]> => pgDb
    ? (await ds.query(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='pedidos_online'`)).map((r: any) => r.c)
    : (await ds.query(`PRAGMA table_info('pedidos_online')`)).map((r: any) => r.name);
  const indices = async (): Promise<string[]> => pgDb
    ? (await ds.query(`SELECT indexname AS n FROM pg_indexes WHERE tablename='pedidos_online'`)).map((r: any) => r.n)
    : (await ds.query(`SELECT name AS n FROM sqlite_master WHERE type='index' AND tbl_name='pedidos_online'`)).map((r: any) => r.n);

  const antes = Number((await ds.query(`SELECT COUNT(*) AS n FROM pedidos_online`).catch(() => [{ n: 0 }]))[0].n);
  await hasta();
  const cols = await columnas();
  ok(cols.includes('idempotency_key'), 'up agrega pedidos_online.idempotency_key');
  const meta = ds.entityMetadatas.find((m) => m.tableName === 'pedidos_online')!;
  // Columnas que agregan migraciones posteriores (F2) no están todavía en este punto.
  const POSTERIORES = ['seguimiento_token_hash'];
  const entTodas = meta.columns.map((c) => c.databaseName).sort();
  const ent = entTodas.filter((c) => !POSTERIORES.includes(c));
  ok(JSON.stringify(ent) === JSON.stringify([...cols].sort()), 'las columnas coinciden con la entidad', [ent, cols]);
  const idx = await indices();
  ok(['UQ_pedidos_online_cuenta_idem', 'UQ_pedidos_online_mesa_idem', 'IDX_pedidos_online_cuenta_cliente'].every((n) => idx.includes(n)), 'up crea los 3 índices', idx);
  const despuesUp = Number((await ds.query(`SELECT COUNT(*) AS n FROM pedidos_online`))[0].n);
  ok(despuesUp === antes, 'no toca los pedidos existentes', [antes, despuesUp]);
  const sinClave = Number((await ds.query(`SELECT COUNT(*) AS n FROM pedidos_online WHERE idempotency_key IS NOT NULL`))[0].n);
  ok(sinClave === 0, 'los existentes quedan sin clave (sin backfill)');

  const ins = (num: string, cuenta: number | null, mesa: number | null, key: string | null) =>
    ds.query(`INSERT INTO pedidos_online (numero, tipo_pedido, cuenta_cliente_id, mesa_id, idempotency_key) VALUES ('${num}', 'PICKUP', ${cuenta ?? 'NULL'}, ${mesa ?? 'NULL'}, ${key ? `'${key}'` : 'NULL'})`);
  const falla = async (fn: () => Promise<any>) => { try { await fn(); return false; } catch { return true; } };
  await ins('ZT-1', 900001, null, 'k-1');
  ok(await falla(() => ins('ZT-2', 900001, null, 'k-1')), 'misma cuenta + misma clave → rechazado');
  ok(!(await falla(() => ins('ZT-3', 900002, null, 'k-1'))), 'otra cuenta + misma clave → permitido');
  await ins('ZT-4', null, 900001, 'k-2');
  ok(await falla(() => ins('ZT-5', null, 900001, 'k-2')), 'misma mesa (invitado) + misma clave → rechazado');
  ok(!(await falla(() => ins('ZT-6', null, 900002, 'k-2'))), 'otra mesa + misma clave → permitido');
  ok(!(await falla(() => ins('ZT-7', 900003, null, null))) && !(await falla(() => ins('ZT-8', 900003, null, null))), 'sin clave no aplica unicidad');
  await ds.query(`DELETE FROM pedidos_online WHERE numero LIKE 'ZT-%'`);

  await ds.undoLastMigration({ transaction: 'each' });
  ok(!(await columnas()).includes('idempotency_key'), 'down quita la columna');
  ok(!(await indices()).some((n) => /idem|IDX_pedidos_online_cuenta_cliente/.test(n)), 'down quita los índices');
  await hasta();
  ok((await columnas()).includes('idempotency_key'), 'up de nuevo la vuelve a crear');

  // F2: TiendaSeguimientoMesa (columna del hash de seguimiento + índice), up / down / up.
  await ds.runMigrations({ transaction: 'each' });
  const ultima = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaSeguimientoMesa/.test(String(ultima)), 'F2: TiendaSeguimientoMesa es la última migración', ultima);
  ok((await columnas()).includes('seguimiento_token_hash'), 'F2 up agrega pedidos_online.seguimiento_token_hash');
  ok((await indices()).some((n) => /IDX_pedidos_online_seguimiento/.test(n)), 'F2 up crea el índice de seguimiento');
  ok((await columnas()).includes('idempotency_key'), 'F2 no toca idempotency_key');
  ok(JSON.stringify(entTodas) === JSON.stringify([...(await columnas())].sort()), 'F2: las columnas coinciden con la entidad completa');
  await ds.undoLastMigration({ transaction: 'each' });
  ok(!(await columnas()).includes('seguimiento_token_hash'), 'F2 down quita la columna');
  ok(!(await indices()).some((n) => /IDX_pedidos_online_seguimiento/.test(n)), 'F2 down quita el índice');
  await ds.runMigrations({ transaction: 'each' });
  ok((await columnas()).includes('seguimiento_token_hash'), 'F2 up de nuevo la vuelve a crear');

  await ds.destroy();
  console.log(`\n[tienda-migracion] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
