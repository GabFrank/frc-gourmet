import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cuentas bancarias de DESTINO/COBRO (terceros, SIN saldo).
 * 
 * DISTINCIÓN CRÍTICA CON `cuentas_bancarias`:
 * - `cuentas_bancarias` = EMPRESA (activo con saldo, caja mayor, POS, transferencias internas)
 * - `cuentas_bancarias_destino` = TERCEROS (sin saldo, info de cobro para pago consolidado)
 * 
 * Cuenta pertenece a `Persona` (titular real). Proveedores/clientes/funcionarios la
 * referencian opcionalmente como cuenta default de cobro.
 * 
 * ESTRICTAMENTE ADITIVO:
 * - 1 tabla nueva (`cuentas_bancarias_destino`) con FK a `personas` y `monedas`
 * - Sin migración de datos (greenfield confirmado por Gabriel 2026-09-16)
 * 
 * Driver-aware (SQLite vs Postgres). FKs solo en Postgres, validación en handlers.
 */
export class CuentasBancariasDestinoHibrido1789586966573 implements MigrationInterface {
  name = 'CuentasBancariasDestinoHibrido1789586966573';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const tsDefault = isPg ? 'now()' : "(datetime('now'))";
    const bool = isPg ? 'boolean' : 'integer';
    const boolTrue = isPg ? 'true' : '1';
    const audit = `
      "created_at" ${ts} NOT NULL DEFAULT ${tsDefault},
      "updated_at" ${ts} NOT NULL DEFAULT ${tsDefault},
      "created_by" integer NULL,
      "updated_by" integer NULL`;

    // ── Tabla: Cuentas bancarias de terceros ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cuentas_bancarias_destino" (
        "id" ${pk},
        "persona_id" integer NOT NULL,
        "banco" varchar(100) NOT NULL,
        "numero_cuenta" varchar(50) NOT NULL,
        "alias" varchar(100) NULL,
        "titular" varchar(200) NOT NULL,
        "moneda_id" integer NOT NULL,
        "tipo_cuenta" varchar(20) NOT NULL DEFAULT 'CORRIENTE',
        "activo" ${bool} NOT NULL DEFAULT ${boolTrue},
        "observacion" text NULL,${audit}
      )
    `);

    // Índices
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cbd_persona" ON "cuentas_bancarias_destino" ("persona_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cbd_activo" ON "cuentas_bancarias_destino" ("activo")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cbd_moneda" ON "cuentas_bancarias_destino" ("moneda_id")`
    );

    // FKs solo en Postgres (SQLite las valida en handlers)
    if (isPg) {
      await queryRunner.query(`
        ALTER TABLE "cuentas_bancarias_destino"
        ADD CONSTRAINT "FK_cbd_persona"
        FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT
      `);
      await queryRunner.query(`
        ALTER TABLE "cuentas_bancarias_destino"
        ADD CONSTRAINT "FK_cbd_moneda"
        FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE RESTRICT
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // Drop FKs en Postgres
    if (isPg) {
      await queryRunner.query(
        `ALTER TABLE "cuentas_bancarias_destino" DROP CONSTRAINT IF EXISTS "FK_cbd_moneda"`
      );
      await queryRunner.query(
        `ALTER TABLE "cuentas_bancarias_destino" DROP CONSTRAINT IF EXISTS "FK_cbd_persona"`
      );
    }

    // Drop índices
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cbd_moneda"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cbd_activo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cbd_persona"`);

    // Drop tabla
    await queryRunner.query(`DROP TABLE IF EXISTS "cuentas_bancarias_destino"`);
  }
}
