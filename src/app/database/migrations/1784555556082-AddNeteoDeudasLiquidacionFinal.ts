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

async function addColumnIfMissing(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  ddl: string,
  isPg: boolean,
): Promise<void> {
  if (!(await hasColumn(queryRunner, table, column, isPg))) {
    await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${ddl}`);
  }
}

/**
 * Neteo de deudas en la liquidación final: al egresar, se descuentan del total
 * los vales pendientes, el saldo de préstamos y el consumo a crédito.
 * - `liquidacion_final_items`: `tipo` (HABER/DESCUENTO) + `referencia_tipo`/`referencia_id`
 *   para poder saldar cada deuda al pagar.
 * - `liquidaciones_final`: `total_haberes`, `total_descuentos`, `total_neto`.
 * Aditiva, idempotente y portable SQLite/Postgres.
 */
export class AddNeteoDeudasLiquidacionFinal1784555556082 implements MigrationInterface {
  name = 'AddNeteoDeudasLiquidacionFinal1784555556082';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    await addColumnIfMissing(queryRunner, 'liquidacion_final_items', 'tipo', `varchar(20) NOT NULL DEFAULT 'HABER'`, isPg);
    await addColumnIfMissing(queryRunner, 'liquidacion_final_items', 'referencia_tipo', `varchar(40) NULL`, isPg);
    await addColumnIfMissing(queryRunner, 'liquidacion_final_items', 'referencia_id', `integer NULL`, isPg);

    await addColumnIfMissing(queryRunner, 'liquidaciones_final', 'total_haberes', `decimal(18,2) NOT NULL DEFAULT 0`, isPg);
    await addColumnIfMissing(queryRunner, 'liquidaciones_final', 'total_descuentos', `decimal(18,2) NOT NULL DEFAULT 0`, isPg);
    await addColumnIfMissing(queryRunner, 'liquidaciones_final', 'total_neto', `decimal(18,2) NOT NULL DEFAULT 0`, isPg);

    // Backfill: las liquidaciones existentes solo tenían haberes (sin neteo).
    await queryRunner.query(
      `UPDATE "liquidaciones_final" SET "total_haberes" = "total_liquidado", "total_neto" = "total_liquidado" WHERE "total_haberes" = 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    for (const [table, column] of [
      ['liquidaciones_final', 'total_neto'],
      ['liquidaciones_final', 'total_descuentos'],
      ['liquidaciones_final', 'total_haberes'],
      ['liquidacion_final_items', 'referencia_id'],
      ['liquidacion_final_items', 'referencia_tipo'],
      ['liquidacion_final_items', 'tipo'],
    ] as const) {
      if (await hasColumn(queryRunner, table, column, isPg)) {
        await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "${column}"`);
      }
    }
  }
}
