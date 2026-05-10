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
export async function dbQuery<T = any>(
  ds: DataSource,
  sql: string,
  params?: any[],
): Promise<T> {
  const driver = ds.options.type;
  if (driver === 'postgres') {
    let i = 0;
    sql = sql.replace(/\?/g, () => `$${++i}`);
  }
  return ds.query(sql, params);
}
