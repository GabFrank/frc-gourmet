import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuracion singleton del modulo de facturacion (tipo de facturacion del
 * sistema + plantilla y punto de expedicion predeterminados). Aditiva.
 */
export class AddFacturacionConfig1780300000000 implements MigrationInterface {
  name = 'AddFacturacionConfig1780300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? `"id" SERIAL PRIMARY KEY` : `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL`;
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const now = isPg ? 'now()' : `(datetime('now'))`;

    await queryRunner.query(`
      CREATE TABLE "facturacion_config" (
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
