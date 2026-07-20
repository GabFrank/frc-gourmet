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
 * Enlaza una cuota de CPC a la liquidacion de sueldo que la descuenta.
 * Cuando un funcionario que tambien es cliente consume a credito, sus cuotas
 * CPC del periodo se descuentan del sueldo (analogo a las cuotas de prestamo).
 * `liquidacion_id` evita que la misma cuota se tome en dos borradores distintos
 * antes de que la liquidacion se pague. Aditiva, idempotente y portable.
 */
export class AddLiquidacionIdToCpcCuota1784554795703 implements MigrationInterface {
  name = 'AddLiquidacionIdToCpcCuota1784554795703';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'cuentas_por_cobrar_cuotas', 'liquidacion_id', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "cuentas_por_cobrar_cuotas" ADD COLUMN "liquidacion_id" integer NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (await hasColumn(queryRunner, 'cuentas_por_cobrar_cuotas', 'liquidacion_id', isPg)) {
      await queryRunner.query(`ALTER TABLE "cuentas_por_cobrar_cuotas" DROP COLUMN "liquidacion_id"`);
    }
  }
}
