import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vincula Proveedor con cuenta bancaria destino preferida para cobros.
 * 
 * MODELO HÍBRIDO: La cuenta pertenece a Persona, el proveedor la REFERENCIA.
 * 
 * ESTRICTAMENTE ADITIVO:
 * - 1 columna nueva nullable en `proveedores` (`cuenta_bancaria_default_id`)
 * - Sin migración de datos (greenfield)
 * - FK solo en Postgres, validación en handlers
 */
export class ProveedorCuentaBancariaDefault1789587015222 implements MigrationInterface {
  name = 'ProveedorCuentaBancariaDefault1789587015222';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // SQLite: validar existencia antes de agregar columna
    const tabla = await queryRunner.getTable('proveedores');
    if (tabla && !tabla.columns.find((c) => c.name === 'cuenta_bancaria_default_id')) {
      await queryRunner.query(
        `ALTER TABLE "proveedores" ADD COLUMN "cuenta_bancaria_default_id" integer NULL`
      );
    }

    // Índice parcial (solo filas con cuenta asignada)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_proveedor_cta_default"
      ON "proveedores" ("cuenta_bancaria_default_id")
      WHERE "cuenta_bancaria_default_id" IS NOT NULL
    `);

    // FK solo en Postgres
    if (isPg) {
      await queryRunner.query(`
        ALTER TABLE "proveedores"
        ADD CONSTRAINT "FK_proveedor_cuenta_default"
        FOREIGN KEY ("cuenta_bancaria_default_id")
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
        `ALTER TABLE "proveedores" DROP CONSTRAINT IF EXISTS "FK_proveedor_cuenta_default"`
      );
    }

    // Drop índice
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_proveedor_cta_default"`);

    // Drop columna (SQLite requiere recrear tabla, pero para down es aceptable no hacerlo)
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "proveedores" DROP COLUMN IF EXISTS "cuenta_bancaria_default_id"`
      );
    }
  }
}
