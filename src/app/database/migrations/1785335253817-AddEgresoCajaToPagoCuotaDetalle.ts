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
  const rows = await queryRunner.query(`PRAGMA table_info("pago_cuota_cpp_detalles")`);
  return Array.isArray(rows) && rows.some((r: any) => r.name === column);
}

/**
 * Pago mixto desde el cajón del PdV: agrega `egreso_caja_id` (nullable) a
 * `pago_cuota_cpp_detalles`. Cuando la fuente de la linea es el cajon del PdV
 * (fuente = 'PDV_CAJA'), el pago se asienta como un `EgresoCaja` en vez de un
 * CajaMayorMovimiento; esta columna vincula la linea con ese egreso para que la
 * anulacion del egreso revierta el monto convertido correcto. Aditiva/idempotente.
 */
export class AddEgresoCajaToPagoCuotaDetalle1785335253817 implements MigrationInterface {
  name = 'AddEgresoCajaToPagoCuotaDetalle1785335253817';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'pago_cuota_cpp_detalles', 'egreso_caja_id', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "pago_cuota_cpp_detalles" ADD COLUMN "egreso_caja_id" integer NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "pago_cuota_cpp_detalles" DROP COLUMN "egreso_caja_id"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
