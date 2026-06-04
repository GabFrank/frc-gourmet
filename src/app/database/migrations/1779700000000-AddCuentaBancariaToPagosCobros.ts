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
 *
 * Idempotente: si `synchronize` ya creó la columna (o una corrida previa la
 * agregó), se saltea la tabla en vez de fallar.
 */
export class AddCuentaBancariaToPagosCobros1779700000000 implements MigrationInterface {
  name = 'AddCuentaBancariaToPagosCobros1779700000000';

  private readonly tablas = ['gastos', 'vales', 'movimientos_cliente'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    for (const t of this.tablas) {
      if (isPg) {
        await queryRunner.query(
          `ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "cuenta_bancaria_id" integer NULL`,
        );
      } else {
        // SQLite no soporta ADD COLUMN IF NOT EXISTS: chequear con PRAGMA.
        const info: any[] = await queryRunner.query(`PRAGMA table_info("${t}")`);
        const existe = Array.isArray(info) && info.some((c) => c.name === 'cuenta_bancaria_id');
        if (!existe) {
          await queryRunner.query(`ALTER TABLE "${t}" ADD COLUMN "cuenta_bancaria_id" integer NULL`);
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    for (const t of this.tablas) {
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
