import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pedidos online — Fase 2: auth de cliente autoservicio.
 *
 * Crea:
 * - `cuentas_cliente`: cuenta del cliente final (login por teléfono/OTP + opcional
 *   email/password), vinculable a un `Cliente` interno.
 * - `codigos_otp`: códigos OTP de un solo uso (hash) para verificar el teléfono.
 *
 * Portable SQLite/Postgres. Ver docs/arquitectura/webapp-pedidos-plan.md.
 */
export class AddCuentasClienteYOtp1783520460211 implements MigrationInterface {
  name = 'AddCuentasClienteYOtp1783520460211';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "cuentas_cliente" (
          "id" SERIAL PRIMARY KEY,
          "telefono" varchar(30) NOT NULL,
          "telefono_verificado" boolean NOT NULL DEFAULT false,
          "email" varchar(150) NULL,
          "email_verificado" boolean NOT NULL DEFAULT false,
          "password_hash" varchar(100) NULL,
          "nombre" varchar(150) NULL,
          "cliente_id" integer NULL,
          "activo" boolean NOT NULL DEFAULT true,
          "ultimo_login" TIMESTAMP NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cuentas_cliente_telefono" ON "cuentas_cliente" ("telefono")`,
      );
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "codigos_otp" (
          "id" SERIAL PRIMARY KEY,
          "telefono" varchar(30) NOT NULL,
          "codigo_hash" varchar(100) NOT NULL,
          "canal" varchar(20) NOT NULL DEFAULT 'WHATSAPP',
          "expires_at" TIMESTAMP NOT NULL,
          "intentos" integer NOT NULL DEFAULT 0,
          "usado" boolean NOT NULL DEFAULT false,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_codigos_otp_telefono" ON "codigos_otp" ("telefono")`,
      );
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "cuentas_cliente" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "telefono" varchar(30) NOT NULL,
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
      await queryRunner.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_cuentas_cliente_telefono" ON "cuentas_cliente" ("telefono")`,
      );
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "codigos_otp" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "telefono" varchar(30) NOT NULL,
          "codigo_hash" varchar(100) NOT NULL,
          "canal" varchar(20) NOT NULL DEFAULT 'WHATSAPP',
          "expires_at" datetime NOT NULL,
          "intentos" integer NOT NULL DEFAULT 0,
          "usado" boolean NOT NULL DEFAULT 0,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_codigos_otp_telefono" ON "codigos_otp" ("telefono")`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "codigos_otp"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cuentas_cliente"`);
  }
}
