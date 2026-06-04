import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `cuenta_bancaria_id` (nullable) a `gastos`, `vales` y `movimientos_cliente`
 * para soportar el padrón de fuente/destino CAJA_MAYOR | CUENTA_BANCARIA en:
 *  - Gasto: egreso pagado desde una cuenta bancaria (en vez de Caja Mayor).
 *  - Vale: egreso del vale desde una cuenta bancaria.
 *  - Cobro de cuota CPC: ingreso acreditado a una cuenta bancaria.
 *
 * Cuando está seteada, el movimiento debita/acredita el saldo bancario y NO
 * genera movimiento de Caja Mayor; al anular se revierte el saldo de esa cuenta.
 * FK no estricta (createForeignKeyConstraints:false en las entidades).
 */
export class AddCuentaBancariaToPagosCobros1779700000000 implements MigrationInterface {
  name = 'AddCuentaBancariaToPagosCobros1779700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gastos" ADD COLUMN "cuenta_bancaria_id" integer NULL`);
    await queryRunner.query(`ALTER TABLE "vales" ADD COLUMN "cuenta_bancaria_id" integer NULL`);
    await queryRunner.query(`ALTER TABLE "movimientos_cliente" ADD COLUMN "cuenta_bancaria_id" integer NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const tablas = ['gastos', 'vales', 'movimientos_cliente'];
    for (const t of tablas) {
      if (isPg) {
        await queryRunner.query(`ALTER TABLE "${t}" DROP COLUMN IF EXISTS "cuenta_bancaria_id"`);
      } else {
        try {
          await queryRunner.query(`ALTER TABLE "${t}" DROP COLUMN "cuenta_bancaria_id"`);
        } catch { /* SQLite viejo */ }
      }
    }
  }
}
