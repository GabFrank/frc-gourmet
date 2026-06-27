import { MigrationInterface, QueryRunner } from 'typeorm';

/** Chequeo de columna existente, independiente del driver y del locale. */
async function hasColumn(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    );
    return rows.length > 0;
  }
  const rows = await queryRunner.query(`PRAGMA table_info("${table}")`);
  return Array.isArray(rows) && rows.some((r: any) => r.name === column);
}

/**
 * Vincula un movimiento de caja mayor a un Conteo de billetes. Se usa en el
 * EGRESO_CAJA_INICIAL (Fase 2 de Caja Mayor): el efectivo retirado para sembrar
 * la apertura de una caja se cuenta billete por billete; ese Conteo se reutiliza
 * después como conteo de apertura al "abrir caja con este conteo".
 *
 * Portable SQLite/Postgres. Columna nullable → sin backfill.
 */
export class AddConteoToCajaMayorMovimiento1780300000000 implements MigrationInterface {
  name = 'AddConteoToCajaMayorMovimiento1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'cajas_mayor_movimientos', 'conteo_id', isPg))) {
      await queryRunner.query(`ALTER TABLE "cajas_mayor_movimientos" ADD COLUMN "conteo_id" integer`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "cajas_mayor_movimientos" DROP COLUMN "conteo_id"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
