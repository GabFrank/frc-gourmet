import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuracion singleton del modulo de facturacion (tipo de facturacion del
 * sistema + plantilla y punto de expedicion predeterminados).
 *
 * Aditiva e idempotente (CREATE TABLE IF NOT EXISTS).
 */
export class AddFacturacionConfig1782519876542 implements MigrationInterface {
  name = 'AddFacturacionConfig1782519876542';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? `"id" SERIAL PRIMARY KEY` : `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL`;
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const now = isPg ? 'now()' : `(datetime('now'))`;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facturacion_config" (
        ${pk},
        "tipo_facturacion" varchar NOT NULL DEFAULT 'PRE_IMPRESO',
        "plantilla_predeterminada_id" integer NULL,
        "timbrado_detalle_predeterminado_id" integer NULL,
        "permitir_editar_numero_preimpreso" boolean NOT NULL DEFAULT ${isPg ? 'true' : '1'},
        "created_at" ${ts} NOT NULL DEFAULT ${now},
        "updated_at" ${ts} NOT NULL DEFAULT ${now},
        "created_by" integer NULL,
        "updated_by" integer NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "facturacion_config"`);
  }
}
