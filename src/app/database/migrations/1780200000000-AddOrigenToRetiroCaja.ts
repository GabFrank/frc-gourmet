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
 * Distingue el origen de un retiro de caja (MANUAL vs CIERRE) y lo vincula al
 * conteo de cierre que lo generó. Permite que al ingresar un retiro de cierre a
 * caja mayor se registre como `INGRESO_CIERRE_CAJA` en vez de `INGRESO_RETIRO_CAJA`.
 *
 * Portable SQLite/Postgres. Columnas nullable/con default → sin backfill.
 */
export class AddOrigenToRetiroCaja1780200000000 implements MigrationInterface {
  name = 'AddOrigenToRetiroCaja1780200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'retiros_caja', 'origen', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "retiros_caja" ADD COLUMN "origen" varchar NOT NULL DEFAULT 'MANUAL'`,
      );
    }
    if (!(await hasColumn(queryRunner, 'retiros_caja', 'conteo_cierre_id', isPg))) {
      await queryRunner.query(`ALTER TABLE "retiros_caja" ADD COLUMN "conteo_cierre_id" integer`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "retiros_caja" DROP COLUMN "conteo_cierre_id"`);
      await queryRunner.query(`ALTER TABLE "retiros_caja" DROP COLUMN "origen"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
