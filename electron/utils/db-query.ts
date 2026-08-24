import type { DataSource } from 'typeorm';

/**
 * Helper portable para queries raw que respeta el dialect del driver activo.
 *
 * Problema: TypeORM no traduce placeholders en `dataSource.query(sql, params)`.
 * SQLite/MySQL usan `?`, Postgres usa `$1, $2, $3`. Si pasás `?` a Postgres
 * obtenés `syntax error at or near "AND"`.
 *
 * Esta función reescribe `?` → `$N` cuando el driver es Postgres y delega
 * al `dataSource.query` original. Para SQLite es no-op.
 *
 * Uso:
 *   import { dbQuery } from '../utils/db-query';
 *   const rows = await dbQuery(dataSource, `SELECT * FROM x WHERE id = ?`, [id]);
 *
 * Para queries más complejas (JOINs, agregaciones con condiciones dinámicas)
 * preferí TypeORM QueryBuilder, que ya maneja portabilidad nativamente vía
 * placeholders `:name`.
 */
/**
 * Formato en que SQLite guarda las fechas: `YYYY-MM-DD HH:MM:SS`, en UTC.
 *
 * TypeORM escribe `created_at` con el literal `datetime('now')`, que en SQLite
 * es UTC y SIN la `T` ni la `Z`. Los handlers, en cambio, arman los limites de
 * un rango con `Date.toISOString()` — `2026-08-24T03:00:00.000Z`.
 *
 * SQLite compara esas columnas como TEXTO, y ahi el espacio (0x20) ordena ANTES
 * que la `T` (0x54): `'2026-08-24 09:40:12' >= '2026-08-24T03:00:00.000Z'` da
 * FALSO. Una fila creada hoy quedaba fuera del rango "hoy" — el filtro no fallaba,
 * devolvia cero. En Postgres no pasa: ahi la columna es `timestamp` de verdad y
 * el driver castea el ISO, asi que el bug solo se ve en modo standalone.
 *
 * Se normaliza el LIMITE (no la columna) para no perder el indice.
 */
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function aFormatoSqlite(v: any): any {
  if (typeof v === 'string' && ISO_Z.test(v)) return v.slice(0, 19).replace('T', ' ');
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace('T', ' ');
  return v;
}

export async function dbQuery<T = any>(
  ds: DataSource,
  sql: string,
  params?: any[],
): Promise<T> {
  const driver = ds.options.type;
  if (driver === 'postgres') {
    let i = 0;
    sql = sql.replace(/\?/g, () => `$${++i}`);
    return ds.query(sql, params);
  }
  return ds.query(sql, params?.map(aFormatoSqlite));
}
