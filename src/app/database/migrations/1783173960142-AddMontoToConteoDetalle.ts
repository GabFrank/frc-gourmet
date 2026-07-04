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
  const rows = await queryRunner.query(`PRAGMA table_info("conteos_detalles")`);
  return Array.isArray(rows) && rows.some((r: any) => r.name === column);
}

/**
 * Conteo resumido/simplificado de caja: agrega `monto` (nullable) a
 * `conteos_detalles`. En el conteo completo cada fila lleva `cantidad` por
 * denominación (billete) y `monto` queda NULL (el total se deriva de
 * cantidad*valor). En el conteo resumido se carga UNA fila por moneda con el
 * total directo en `monto` (cantidad 0, apuntando a cualquier billete de esa
 * moneda como portador). Las agregaciones usan COALESCE(monto, cantidad*valor).
 * Aditiva, idempotente y portable SQLite/Postgres.
 */
export class AddMontoToConteoDetalle1783173960142 implements MigrationInterface {
  name = 'AddMontoToConteoDetalle1783173960142';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'conteos_detalles', 'monto', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "conteos_detalles" ADD COLUMN "monto" numeric(18,2) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "conteos_detalles" DROP COLUMN "monto"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
