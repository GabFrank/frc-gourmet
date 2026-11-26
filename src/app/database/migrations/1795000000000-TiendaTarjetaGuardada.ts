import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * «Guardar mi tarjeta» con dinelco (PLAN-tienda-tarjeta-guardada): `tienda_tarjetas_guardadas`.
 * El interruptor y los topes van en los datos de la cuenta DINELCO (`formas_pago_online`), que ya
 * existe: no hace falta columna.
 *
 * ESTRICTAMENTE ADITIVO.
 */
export class TiendaTarjetaGuardada1795000000000 implements MigrationInterface {
  name = 'TiendaTarjetaGuardada1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const id = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const ts = isPg ? 'TIMESTAMP NOT NULL DEFAULT now()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    const tsNull = isPg ? 'TIMESTAMP NULL' : 'datetime NULL';
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "tienda_tarjetas_guardadas" (
      "id" ${id},
      "created_at" ${ts},
      "updated_at" ${ts},
      "created_by" integer NULL,
      "updated_by" integer NULL,
      "cuenta_cliente_id" integer NOT NULL,
      "forma_pago_online_id" integer NULL,
      "registro_ref" varchar(60) NOT NULL,
      "registro_sesion_id" varchar(30) NULL,
      "estado" varchar(12) NOT NULL DEFAULT 'PENDIENTE',
      "token_id" varchar(80) NULL,
      "marca" varchar(10) NULL,
      "enmascarada" varchar(30) NULL,
      "tipo" varchar(2) NULL,
      "consentimiento_en" ${tsNull},
      "ultimo_uso_en" ${tsNull},
      "quitada_en" ${tsNull},
      "detalle" varchar(255) NULL
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tienda_tarjetas_registro_ref" ON "tienda_tarjetas_guardadas" ("registro_ref")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_tienda_tarjetas_cuenta" ON "tienda_tarjetas_guardadas" ("cuenta_cliente_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tienda_tarjetas_guardadas"`);
  }
}
