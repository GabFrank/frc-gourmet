import { MigrationInterface, QueryRunner } from 'typeorm';

/** Chequeo de columna existente, independiente del driver. */
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
  const rows = await queryRunner.query(`PRAGMA table_info("cajas")`);
  return Array.isArray(rows) && rows.some((r: any) => r.name === column);
}

/**
 * Ajuste de caja cerrada: agrega `motivo_ajuste` (nullable) a `cajas` para dejar
 * traza del motivo cuando se corrige el conteo o se agrega un gasto/retiro a una
 * caja ya cerrada (junto con los campos existentes `revisado` / `revisado_por`).
 * Aditiva, idempotente y portable SQLite/Postgres.
 */
export class AddMotivoAjusteToCaja1784316132819 implements MigrationInterface {
  name = 'AddMotivoAjusteToCaja1784316132819';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'cajas', 'motivo_ajuste', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "cajas" ADD COLUMN "motivo_ajuste" varchar(500) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (await hasColumn(queryRunner, 'cajas', 'motivo_ajuste', isPg)) {
      await queryRunner.query(`ALTER TABLE "cajas" DROP COLUMN "motivo_ajuste"`);
    }
  }
}
