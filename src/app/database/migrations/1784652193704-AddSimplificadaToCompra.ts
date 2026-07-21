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
  const rows = await queryRunner.query(`PRAGMA table_info("${table}")`);
  return Array.isArray(rows) && rows.some((r: any) => r.name === column);
}

/**
 * Compra simplificada: flag `simplificada` en `compras`. Marca las compras cargadas sin
 * detalles (no mueven stock ni costo, solo generan la deuda CPP + pago opcional).
 * Aditiva, idempotente y portable SQLite/Postgres.
 */
export class AddSimplificadaToCompra1784652193704 implements MigrationInterface {
  name = 'AddSimplificadaToCompra1784652193704';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'compras', 'simplificada', isPg))) {
      const def = isPg ? 'false' : '(0)';
      await queryRunner.query(
        `ALTER TABLE "compras" ADD COLUMN "simplificada" boolean NOT NULL DEFAULT ${def}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (await hasColumn(queryRunner, 'compras', 'simplificada', isPg)) {
      await queryRunner.query(`ALTER TABLE "compras" DROP COLUMN "simplificada"`);
    }
  }
}
