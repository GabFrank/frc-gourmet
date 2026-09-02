import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pedidos online — Fase C: cuentas de cliente por email/Google (sin teléfono).
 *
 * Hace `cuentas_cliente.telefono` NULLABLE para permitir registro por
 * email+password o Google (donde no hay teléfono). El índice único se mantiene
 * (múltiples NULL son distintos en SQLite y Postgres).
 *
 * Postgres: ALTER COLUMN DROP NOT NULL. SQLite: rebuild de tabla (no soporta
 * ALTER COLUMN). Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
 */
export class CuentaClienteTelefonoNullable1783740826975 implements MigrationInterface {
  name = 'CuentaClienteTelefonoNullable1783740826975';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "cuentas_cliente" ALTER COLUMN "telefono" DROP NOT NULL`);
      return;
    }
    // SQLite: recrear la tabla con telefono NULL.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cuentas_cliente_new" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "telefono" varchar(30) NULL,
        "telefono_verificado" boolean NOT NULL DEFAULT 0,
        "email" varchar(150) NULL,
        "email_verificado" boolean NOT NULL DEFAULT 0,
        "password_hash" varchar(100) NULL,
        "nombre" varchar(150) NULL,
        "cliente_id" integer NULL,
        "activo" boolean NOT NULL DEFAULT 1,
        "ultimo_login" datetime NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        "created_by" integer NULL,
        "updated_by" integer NULL
      )
    `);
    await queryRunner.query(`
      INSERT INTO "cuentas_cliente_new"
        ("id","telefono","telefono_verificado","email","email_verificado","password_hash","nombre","cliente_id","activo","ultimo_login","created_at","updated_at","created_by","updated_by")
      SELECT
        "id","telefono","telefono_verificado","email","email_verificado","password_hash","nombre","cliente_id","activo","ultimo_login","created_at","updated_at","created_by","updated_by"
      FROM "cuentas_cliente"
    `);
    await queryRunner.query(`DROP TABLE "cuentas_cliente"`);
    await queryRunner.query(`ALTER TABLE "cuentas_cliente_new" RENAME TO "cuentas_cliente"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cuentas_cliente_telefono" ON "cuentas_cliente" ("telefono")`,
    );
  }

  public async down(): Promise<void> {
    // No-op: volver a NOT NULL requeriría datos sin nulls; se deja nullable.
  }
}
