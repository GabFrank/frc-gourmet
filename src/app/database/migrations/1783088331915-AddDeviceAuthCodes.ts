import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla `device_auth_codes`: códigos de vinculación para el login por QR
 * (Device Authorization Grant). Aditiva y portable SQLite/Postgres.
 */
export class AddDeviceAuthCodes1783088331915 implements MigrationInterface {
  name = 'AddDeviceAuthCodes1783088331915';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "device_auth_codes" (
          "id" SERIAL PRIMARY KEY,
          "device_code" varchar NOT NULL,
          "estado" varchar NOT NULL DEFAULT 'PENDING',
          "usuario_id" integer NULL,
          "device_info" text NULL,
          "expires_at" TIMESTAMP NOT NULL,
          "approved_at" TIMESTAMP NULL,
          "consumed_at" TIMESTAMP NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_device_auth_codes_code" ON "device_auth_codes" ("device_code")`);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "device_auth_codes" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "device_code" varchar NOT NULL,
          "estado" varchar NOT NULL DEFAULT 'PENDING',
          "usuario_id" integer NULL,
          "device_info" text NULL,
          "expires_at" datetime NOT NULL,
          "approved_at" datetime NULL,
          "consumed_at" datetime NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_device_auth_codes_code" ON "device_auth_codes" ("device_code")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "device_auth_codes"`);
  }
}
