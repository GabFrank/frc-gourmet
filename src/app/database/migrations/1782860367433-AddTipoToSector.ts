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
  const rows = await queryRunner.query(`PRAGMA table_info("sectores")`);
  return Array.isArray(rows) && rows.some((r: any) => r.name === column);
}

/**
 * Separa sectores de MESA de sectores de IMPRESION (cocina/barra). Agrega
 * `tipo` a `sectores` con default 'MESA': los sectores existentes quedan como
 * MESA (no rompe nada); los de impresión se recrean tipados desde el nuevo ABM.
 * Aditiva e idempotente. Portable SQLite/Postgres.
 */
export class AddTipoToSector1782860367433 implements MigrationInterface {
  name = 'AddTipoToSector1782860367433';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'sectores', 'tipo', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "sectores" ADD COLUMN "tipo" varchar(20) NOT NULL DEFAULT 'MESA'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "sectores" DROP COLUMN "tipo"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
