import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KDS Fase 2 — tabla `kds_pantallas`: config de cada pantalla de cocina
 * (qué sectores muestra, umbrales de semáforo, sonido). Portable SQLite/Postgres.
 */
export class AddKdsPantalla1780100000000 implements MigrationInterface {
  name = 'AddKdsPantalla1780100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE "kds_pantallas" (
          "id" SERIAL PRIMARY KEY,
          "nombre" varchar(100) NOT NULL,
          "sectores" text NULL,
          "umbral_amarillo" integer NOT NULL DEFAULT 5,
          "umbral_rojo" integer NOT NULL DEFAULT 10,
          "sonido_nuevo" boolean NOT NULL DEFAULT true,
          "columnas" integer NOT NULL DEFAULT 0,
          "activo" boolean NOT NULL DEFAULT true,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE "kds_pantallas" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "nombre" varchar(100) NOT NULL,
          "sectores" text NULL,
          "umbral_amarillo" integer NOT NULL DEFAULT 5,
          "umbral_rojo" integer NOT NULL DEFAULT 10,
          "sonido_nuevo" boolean NOT NULL DEFAULT 1,
          "columnas" integer NOT NULL DEFAULT 0,
          "activo" boolean NOT NULL DEFAULT 1,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "kds_pantallas"`);
  }
}
