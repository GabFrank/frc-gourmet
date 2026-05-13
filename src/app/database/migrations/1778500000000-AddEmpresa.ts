import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla `empresa` (singleton). Driver-aware: SQLite usa `datetime`
 * y Postgres `TIMESTAMP`. La fila default (id=1) se crea on-demand desde el
 * handler `get-empresa`, no en la migracion, para no interferir con
 * eventuales restores.
 */
export class AddEmpresa1778500000000 implements MigrationInterface {
  name = 'AddEmpresa1778500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE "empresa" (
          "id" SERIAL PRIMARY KEY,
          "nombre" varchar(120) NOT NULL,
          "nombre_comercial" varchar(120) NULL,
          "razon_social" varchar(180) NULL,
          "ruc" varchar(20) NULL,
          "direccion" varchar(200) NULL,
          "telefono" varchar(60) NULL,
          "email" varchar(120) NULL,
          "sitio_web" varchar(200) NULL,
          "logo_url" varchar(300) NULL,
          "timbrado_numero" varchar(40) NULL,
          "timbrado_vigencia_hasta" date NULL,
          "punto_expedicion" varchar(20) NULL,
          "pais" varchar(60) NOT NULL DEFAULT 'PARAGUAY',
          "zona_horaria" varchar(60) NOT NULL DEFAULT 'America/Asuncion',
          "moneda_principal_id" integer NULL,
          "actividad_economica" varchar(120) NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE "empresa" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "nombre" varchar(120) NOT NULL,
          "nombre_comercial" varchar(120) NULL,
          "razon_social" varchar(180) NULL,
          "ruc" varchar(20) NULL,
          "direccion" varchar(200) NULL,
          "telefono" varchar(60) NULL,
          "email" varchar(120) NULL,
          "sitio_web" varchar(200) NULL,
          "logo_url" varchar(300) NULL,
          "timbrado_numero" varchar(40) NULL,
          "timbrado_vigencia_hasta" date NULL,
          "punto_expedicion" varchar(20) NULL,
          "pais" varchar(60) NOT NULL DEFAULT 'PARAGUAY',
          "zona_horaria" varchar(60) NOT NULL DEFAULT 'America/Asuncion',
          "moneda_principal_id" integer NULL,
          "actividad_economica" varchar(120) NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "empresa"`);
  }
}
