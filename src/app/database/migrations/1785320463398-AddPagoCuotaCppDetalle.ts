import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pago mixto de cuotas de compra (CuentaPorPagar): permite pagar una cuota con
 * varias formas de pago y/o monedas, imitando el detalle del Gasto.
 *
 * Tabla NUEVA `pago_cuota_cpp_detalles` (una fila por linea de pago). ESTRICTAMENTE
 * ADITIVO: no toca `cuentas_por_pagar` ni `cuentas_por_pagar_cuotas`, asi que los
 * pagos de compras ya realizados no se ven afectados.
 *
 * Driver-aware (SQLite vs Postgres). FKs solo en Postgres; sin FK dura a la cuota
 * para evitar romper por datos legacy (TypeORM hace los joins igual).
 */
export class AddPagoCuotaCppDetalle1785320463398 implements MigrationInterface {
  name = 'AddPagoCuotaCppDetalle1785320463398';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const tsDefault = isPg ? 'now()' : "(datetime('now'))";
    const audit = `
      "created_at" ${ts} NOT NULL DEFAULT ${tsDefault},
      "updated_at" ${ts} NOT NULL DEFAULT ${tsDefault},
      "created_by" integer NULL,
      "updated_by" integer NULL`;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pago_cuota_cpp_detalles" (
        "id" ${pk},
        "cuenta_por_pagar_cuota_id" integer NOT NULL,
        "moneda_id" integer NOT NULL,
        "forma_pago_id" integer NULL,
        "fuente" varchar(20) NOT NULL DEFAULT 'CAJA_MAYOR',
        "monto_origen" numeric(18,2) NOT NULL DEFAULT 0,
        "cotizacion" numeric(18,6) NOT NULL DEFAULT 1,
        "monto_cpp" numeric(18,2) NOT NULL DEFAULT 0,
        "caja_mayor_movimiento_id" integer NULL,
        "cuenta_bancaria_id" integer NULL,
        "observacion" varchar(255) NULL,${audit}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pccd_cuota" ON "pago_cuota_cpp_detalles" ("cuenta_por_pagar_cuota_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pago_cuota_cpp_detalles"`);
  }
}
