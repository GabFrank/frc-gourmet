import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persiste cuenta bancaria destino en movimientos bancarios (además de descripción).
 * 
 * HALLAZGO AUDIT B #4: Solo enriquecer `observacion` (string) no es queryable.
 * FK permite búsquedas eficientes de transferencias por cuenta destino para
 * match de comprobantes bancarios.
 * 
 * Descripción enriquecida se mantiene para legibilidad humana.
 * 
 * ESTRICTAMENTE ADITIVO:
 * - 1 columna nueva nullable en `movimientos_bancarios`
 * - Sin datos legacy (movimientos históricos tendrán NULL)
 * - FK solo en Postgres
 */
export class MovimientoBancarioCuentaDestino1789587049751 implements MigrationInterface {
  name = 'MovimientoBancarioCuentaDestino1789587049751';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // SQLite: validar existencia antes de agregar columna
    const tabla = await queryRunner.getTable('movimientos_bancarios');
    if (tabla && !tabla.columns.find((c) => c.name === 'cuenta_bancaria_destino_id')) {
      await queryRunner.query(
        `ALTER TABLE "movimientos_bancarios" ADD COLUMN "cuenta_bancaria_destino_id" integer NULL`
      );
    }

    // Índice parcial (solo movimientos con destino registrado)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_mov_bancario_destino"
      ON "movimientos_bancarios" ("cuenta_bancaria_destino_id")
      WHERE "cuenta_bancaria_destino_id" IS NOT NULL
    `);

    // FK solo en Postgres
    if (isPg) {
      await queryRunner.query(`
        ALTER TABLE "movimientos_bancarios"
        ADD CONSTRAINT "FK_mov_bancario_destino"
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
        `ALTER TABLE "movimientos_bancarios" DROP CONSTRAINT IF EXISTS "FK_mov_bancario_destino"`
      );
    }

    // Drop índice
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_mov_bancario_destino"`);

    // Drop columna (SQLite requiere recrear tabla, pero para down es aceptable no hacerlo)
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "movimientos_bancarios" DROP COLUMN IF EXISTS "cuenta_bancaria_destino_id"`
      );
    }
  }
}
