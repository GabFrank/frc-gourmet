import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `monto_cuenta_bancaria` (monto efectivamente acreditado/debitado en la
 * moneda de la cuenta) y `cotizacion` a `gastos`, `vales` y `movimientos_cliente`.
 *
 * Cuando un pago/cobro por banco se hace contra una cuenta en otra moneda que la
 * de la operación, se convierte con `cotizacion` y se guarda el monto resultante
 * en `monto_cuenta_bancaria`. La anulación revierte ESE monto (no el original),
 * para que el saldo de la cuenta quede exacto.
 *
 * Idempotente (synchronize puede haber creado las columnas).
 */
export class AddCotizacionBancariaToPagosCobros1779800000000 implements MigrationInterface {
  name = 'AddCotizacionBancariaToPagosCobros1779800000000';

  private readonly tablas = ['gastos', 'vales', 'movimientos_cliente'];
  private readonly columnas = [
    ['monto_cuenta_bancaria', 'numeric(18,2)'],
    ['cotizacion', 'numeric(18,6)'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    for (const t of this.tablas) {
      for (const [col, type] of this.columnas) {
        if (isPg) {
          await queryRunner.query(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "${col}" ${type} NULL`);
        } else {
          const info: any[] = await queryRunner.query(`PRAGMA table_info("${t}")`);
          const existe = Array.isArray(info) && info.some((c) => c.name === col);
          if (!existe) await queryRunner.query(`ALTER TABLE "${t}" ADD COLUMN "${col}" ${type} NULL`);
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    for (const t of this.tablas) {
      for (const [col] of this.columnas) {
        if (isPg) {
          await queryRunner.query(`ALTER TABLE "${t}" DROP COLUMN IF EXISTS "${col}"`);
        } else {
          try { await queryRunner.query(`ALTER TABLE "${t}" DROP COLUMN "${col}"`); } catch { /* SQLite viejo */ }
        }
      }
    }
  }
}
