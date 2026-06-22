import { MigrationInterface, QueryRunner } from 'typeorm';

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
