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
  const F4_PEDIDO = ['estado_pago', 'pago_proveedor', 'pago_intento', 'pago_idem_key', 'pago_sesion_id', 'pago_checkout_url',
    'pago_id', 'pago_monto', 'pago_expira_en', 'pago_ultima_consulta', 'pago_detalle', 'pagado_en', 'pago_aviso_sin_aceptar'];
  const F4_CFG = ['pago_online_activo', 'upay_base_url', 'upay_merchant_id', 'upay_merchant_nombre', 'minutos_aviso_pagado_sin_aceptar'];
  const POSTERIORES = ['seguimiento_token_hash', ...F4_PEDIDO];
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
  // Se sube todo y se bajan F4 y F3 para que F2 quede última.
  await ds.runMigrations({ transaction: 'each' });
  await ds.undoLastMigration({ transaction: 'each' });
  await ds.undoLastMigration({ transaction: 'each' });
  const ultima = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaSeguimientoMesa/.test(String(ultima)), 'F2: TiendaSeguimientoMesa es la última migración', ultima);
  ok((await columnas()).includes('seguimiento_token_hash'), 'F2 up agrega pedidos_online.seguimiento_token_hash');
  ok((await indices()).some((n) => /IDX_pedidos_online_seguimiento/.test(n)), 'F2 up crea el índice de seguimiento');
  ok((await columnas()).includes('idempotency_key'), 'F2 no toca idempotency_key');
  ok(JSON.stringify(entTodas.filter((c) => !F4_PEDIDO.includes(c))) === JSON.stringify([...(await columnas())].sort()), 'F2: las columnas coinciden con la entidad (sin F4)');
  await ds.undoLastMigration({ transaction: 'each' });
  ok(!(await columnas()).includes('seguimiento_token_hash'), 'F2 down quita la columna');
  ok(!(await indices()).some((n) => /IDX_pedidos_online_seguimiento/.test(n)), 'F2 down quita el índice');
  await ds.runMigrations({ transaction: 'each' });
  ok((await columnas()).includes('seguimiento_token_hash'), 'F2 up de nuevo la vuelve a crear');

  // F3: TiendaIngresoClientes (4 columnas nullable en tienda_online_config), up / down / up.
  const colsCfg = async (): Promise<string[]> => pgDb
    ? (await ds.query(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='tienda_online_config'`)).map((r: any) => r.c)
    : (await ds.query(`PRAGMA table_info('tienda_online_config')`)).map((r: any) => r.name);
  const F3_COLS = ['whatsapp_phone_number_id', 'whatsapp_plantilla', 'whatsapp_idioma', 'google_client_id'];
  await ds.undoLastMigration({ transaction: 'each' }); // baja F4 para que F3 quede última
  const ultimaF3 = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaIngresoClientes/.test(String(ultimaF3)), 'F3: TiendaIngresoClientes es la última migración', ultimaF3);
  const cfgCols = await colsCfg();
  ok(F3_COLS.every((c) => cfgCols.includes(c)), 'F3 up agrega las 4 columnas', cfgCols);
  const metaCfg = ds.entityMetadatas.find((m) => m.tableName === 'tienda_online_config')!;
  ok(JSON.stringify(metaCfg.columns.map((c) => c.databaseName).filter((c) => !F4_CFG.includes(c)).sort()) === JSON.stringify([...cfgCols].sort()), 'F3: las columnas coinciden con la entidad (sin F4)');
  await ds.query(`DELETE FROM tienda_online_config`);
  await ds.query(`INSERT INTO tienda_online_config (nombre_comercio, google_client_id) VALUES ('ZT-CFG', 'x.apps.googleusercontent.com')`);
  await ds.undoLastMigration({ transaction: 'each' });
  const sinF3 = await colsCfg();
  ok(!F3_COLS.some((c) => sinF3.includes(c)), 'F3 down quita las 4 columnas', sinF3);
  const fila = await ds.query(`SELECT nombre_comercio FROM tienda_online_config`);
  ok(fila.length === 1 && fila[0].nombre_comercio === 'ZT-CFG', 'F3 down conserva la fila de config', fila);
  await ds.runMigrations({ transaction: 'each' });
  ok((await colsCfg()).includes('google_client_id'), 'F3 up de nuevo las vuelve a crear');
  await ds.query(`DELETE FROM tienda_online_config WHERE nombre_comercio = 'ZT-CFG'`);

  // F4: TiendaPagoOnline, up / down / up y down bloqueado con pagos registrados.
  const ultimaF4 = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaPagoOnline/.test(String(ultimaF4)), 'F4: TiendaPagoOnline es la última migración', ultimaF4);
  const colsF4 = await columnas();
  ok(F4_PEDIDO.every((c) => colsF4.includes(c)), 'F4 up agrega las columnas de pago al pedido');
  ok(JSON.stringify(entTodas) === JSON.stringify([...colsF4].sort()), 'F4: las columnas del pedido coinciden con la entidad completa');
  ok(JSON.stringify(metaCfg.columns.map((c) => c.databaseName).sort()) === JSON.stringify([...(await colsCfg())].sort()), 'F4: las columnas de config coinciden con la entidad');
  ok((await indices()).includes('UQ_pedidos_online_pago_id'), 'F4 crea el índice único de pago_id');
  const actCfg = await ds.query(`SELECT pago_online_activo AS a FROM tienda_online_config`);
  ok(actCfg.every((r: any) => !r.a || r.a === '0'), 'F4: pago online queda apagado en las configs existentes', actCfg);
  await ds.query(`INSERT INTO pedidos_online (numero, tipo_pedido, pago_proveedor, pago_id) VALUES ('ZT-P1', 'PICKUP', 'UPAY', 'pay-1')`);
  ok(await falla(() => ds.query(`INSERT INTO pedidos_online (numero, tipo_pedido, pago_proveedor, pago_id) VALUES ('ZT-P2', 'PICKUP', 'UPAY', 'pay-1')`)), 'F4: un mismo pago no confirma dos pedidos');
  ok(await falla(() => ds.undoLastMigration({ transaction: 'each' })), 'F4 down aborta si hay un pago registrado');
  ok((await columnas()).includes('pago_id'), 'F4: tras el abort las columnas siguen');
  await ds.query(`DELETE FROM pedidos_online WHERE numero LIKE 'ZT-P%'`);
  await ds.undoLastMigration({ transaction: 'each' });
  const sinF4 = await columnas();
  const sinF4Cfg = await colsCfg();
  ok(!F4_PEDIDO.some((c) => sinF4.includes(c)) && !F4_CFG.some((c) => sinF4Cfg.includes(c)), 'F4 down sin pagos quita las columnas');
  const tablas = pgDb
    ? (await ds.query(`SELECT tablename AS t FROM pg_tables WHERE schemaname='public'`)).map((r: any) => r.t)
    : (await ds.query(`SELECT name AS t FROM sqlite_master WHERE type='table'`)).map((r: any) => r.t);
  ok(!tablas.includes('pagos_online_eventos'), 'F4 down quita la tabla de eventos');
  await ds.runMigrations({ transaction: 'each' });
  ok((await columnas()).includes('pago_id'), 'F4 up de nuevo las vuelve a crear');

  await ds.destroy();
  console.log(`\n[tienda-migracion] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
