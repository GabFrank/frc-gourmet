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
 * Agrega `cuenta_bancaria_id` a `liquidaciones_sueldo` para soportar el pago de
 * una liquidacion desde una cuenta bancaria (ademas de Caja Mayor). Cuando esta
 * seteada, el pago debito el saldo bancario y NO genero movimiento de Caja Mayor;
 * al anular la liquidacion se revierte el saldo de esa cuenta.
 *
 * FK no estricta (createForeignKeyConstraints:false en la entidad).
 */
export class AddCuentaBancariaToLiquidacionSueldo1779400000000 implements MigrationInterface {
  name = 'AddCuentaBancariaToLiquidacionSueldo1779400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (await hasColumn(queryRunner, 'liquidaciones_sueldo', 'cuenta_bancaria_id', isPg)) return;
    await queryRunner.query(
      `ALTER TABLE "liquidaciones_sueldo" ADD COLUMN "cuenta_bancaria_id" integer NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "liquidaciones_sueldo" DROP COLUMN IF EXISTS "cuenta_bancaria_id"`,
      );
    } else {
      try {
        await queryRunner.query(
          `ALTER TABLE "liquidaciones_sueldo" DROP COLUMN "cuenta_bancaria_id"`,
        );
      } catch { /* SQLite viejo */ }
    }
  }
}
