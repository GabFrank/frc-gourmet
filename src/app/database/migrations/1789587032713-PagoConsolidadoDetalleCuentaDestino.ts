import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persiste cuenta bancaria destino en cada detalle de pago consolidado.
 * 
 * Permite saber A QUIÉN (persona + cuenta) fue cada línea de pago con
 * transferencia bancaria, para match de comprobantes y reportes.
 * 
 * ESTRICTAMENTE ADITIVO:
 * - 1 columna nueva nullable en `pagos_consolidados_detalles`
 * - Sin datos legacy (pagos históricos tendrán NULL, legible como "sin destino registrado")
 * - FK solo en Postgres
 */
export class PagoConsolidadoDetalleCuentaDestino1789587032713 implements MigrationInterface {
  name = 'PagoConsolidadoDetalleCuentaDestino1789587032713';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // SQLite: validar existencia antes de agregar columna
    const tabla = await queryRunner.getTable('pagos_consolidados_detalles');
    if (tabla && !tabla.columns.find((c) => c.name === 'cuenta_bancaria_destino_id')) {
      await queryRunner.query(
        `ALTER TABLE "pagos_consolidados_detalles" ADD COLUMN "cuenta_bancaria_destino_id" integer NULL`
      );
    }

    // Índice parcial (solo líneas con destino registrado)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_pcd_cuenta_destino"
      ON "pagos_consolidados_detalles" ("cuenta_bancaria_destino_id")
      WHERE "cuenta_bancaria_destino_id" IS NOT NULL
    `);

    // FK solo en Postgres
    if (isPg) {
      await queryRunner.query(`
        ALTER TABLE "pagos_consolidados_detalles"
        ADD CONSTRAINT "FK_pcd_cuenta_destino"
        FOREIGN KEY ("cuenta_bancaria_destino_id")
        REFERENCES "cuentas_bancarias_destino"("id")
        ON DELETE SET NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // Drop FK en Postgres
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "pagos_consolidados_detalles" DROP CONSTRAINT IF EXISTS "FK_pcd_cuenta_destino"`
      );
    }

    // Drop índice
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pcd_cuenta_destino"`);

    // Drop columna (SQLite requiere recrear tabla, pero para down es aceptable no hacerlo)
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "pagos_consolidados_detalles" DROP COLUMN IF EXISTS "cuenta_bancaria_destino_id"`
      );
    }
  }
}
