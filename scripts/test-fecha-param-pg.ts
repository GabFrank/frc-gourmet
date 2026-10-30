#!/usr/bin/env tsx
/**
 * Test #317: `fechaParamSql` en Postgres no tiene que correr los filtros de fecha.
 *
 * Las columnas de Postgres son `timestamp without time zone` con hora local. Antes
 * se mandaba `toISOString()` (con `Z`), Postgres descartaba la zona y el límite
 * quedaba +3 h en America/Asuncion: una venta de las 01:00 del día 1 quedaba
 * afuera del día 1 y adentro del día anterior.
 *
 * Parte 1 (siempre): formato del parámetro en SQLite y Postgres.
 * Parte 2 (si hay Postgres en 127.0.0.1:5432, o PGHOST/PGUSER/PGPASSWORD): inserta
 * filas con un `Date` como lo hace TypeORM y filtra un día que cruza medianoche.
 * Sin Postgres se autosaltea (como test:locks-pg).
 */
process.env['TZ'] = process.env['TZ'] || 'America/Asuncion';

import { fechaParamSql } from '../electron/utils/date.utils';

const ok = (cond: boolean, msg: string, data?: any) => {
  if (!cond) {
    console.error(`❌ ${msg}`, data ?? '');
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
};

async function main() {
  console.log(`Test #317 fechaParamSql · TZ=${process.env['TZ']}`);
  const pg = { options: { type: 'postgres' } };
  const sqlite = { options: { type: 'sqlite' } };

  // 01/08/2026 00:00 local (America/Asuncion = UTC-3 → 03:00Z)
  const desde = new Date(2026, 7, 1, 0, 0, 0, 0);
  const hasta = new Date(2026, 7, 1, 23, 59, 59, 999);

  ok(fechaParamSql(pg, desde) === '2026-08-01 00:00:00.000', 'Postgres: desde en hora local sin zona', fechaParamSql(pg, desde));
  ok(fechaParamSql(pg, hasta) === '2026-08-01 23:59:59.999', 'Postgres: hasta en hora local sin zona', fechaParamSql(pg, hasta));
  ok(fechaParamSql(sqlite, desde) === desde.toISOString().slice(0, 23).replace('T', ' '), 'SQLite: sigue en UTC con espacio (#249)');
  ok(!fechaParamSql(pg, desde).includes('Z') && !fechaParamSql(pg, desde).includes('T'), 'Postgres: sin T ni Z');

  let Client: any;
  try { Client = require('pg').Client; } catch { console.log('⏭️  sin módulo pg: salteo la parte Postgres'); return; }
  const client = new Client({
    host: process.env['PGHOST'] || '127.0.0.1',
    port: Number(process.env['PGPORT'] || 5432),
    user: process.env['PGUSER'] || 'postgres',
    password: process.env['PGPASSWORD'] || '',
    database: process.env['PGDATABASE'] || 'postgres',
    connectionTimeoutMillis: 3000,
  });
  try { await client.connect(); } catch (e: any) {
    console.log(`⏭️  sin Postgres (${e?.message}): salteo la parte Postgres`);
    return;
  }
  try {
    await client.query('CREATE TEMP TABLE t317 (id int, created_at timestamp without time zone)');
    // Como TypeORM: el driver pg serializa el Date con offset local.
    const filas: Array<[number, Date]> = [
      [1, new Date(2026, 6, 31, 23, 30)], // 31/07 23:30 → afuera
      [2, new Date(2026, 7, 1, 1, 0)],    // 01/08 01:00 → adentro (antes se perdía)
      [3, new Date(2026, 7, 1, 21, 0)],   // 01/08 21:00 → adentro
      [4, new Date(2026, 7, 2, 1, 0)],    // 02/08 01:00 → afuera (antes se colaba)
    ];
    for (const [id, f] of filas) await client.query('INSERT INTO t317 VALUES ($1, $2)', [id, f]);
    const r = await client.query(
      'SELECT id FROM t317 WHERE created_at >= $1 AND created_at <= $2 ORDER BY id',
      [fechaParamSql(pg, desde), fechaParamSql(pg, hasta)],
    );
    const ids = r.rows.map((x: any) => x.id);
    ok(JSON.stringify(ids) === '[2,3]', 'Postgres: el día 01/08 trae la venta de las 01:00 y no la del 02/08', ids);
    const viejo = await client.query(
      'SELECT id FROM t317 WHERE created_at >= $1 AND created_at <= $2 ORDER BY id',
      [desde.toISOString(), hasta.toISOString()],
    );
    if (process.env['TZ'] === 'America/Asuncion') {
      ok(JSON.stringify(viejo.rows.map((x: any) => x.id)) === '[3,4]', 'Control: el ISO con Z reproduce el bug (+3 h)');
    }
  } finally {
    await client.end();
  }
}

main().then(() => console.log('\nOK test-fecha-param-pg')).catch((e) => { console.error(e); process.exit(1); });
