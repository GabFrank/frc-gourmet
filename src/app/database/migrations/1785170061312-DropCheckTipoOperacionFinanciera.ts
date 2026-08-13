import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suelta el CHECK de `operaciones_financieras.tipo_operacion` en SQLite.
 *
 * El baseline SQLite creó la columna con
 *   CHECK( "tipo_operacion" IN ('CAMBIO_DIVISA','DEPOSITO_BANCARIO',
 *          'RETIRO_BANCARIO','TRANSFERENCIA_ENTRE_CAJAS') )
 * así que un valor nuevo (`TRANSFERENCIA_BANCARIA`) sería rechazado por la BD.
 * La entity declara `varchar` (sin enum nativo), y en Postgres la columna es
 * `character varying` SIN constraint, por lo que allí no hay nada que hacer.
 *
 * SQLite no permite modificar/soltar un CHECK vía ALTER TABLE: hay que
 * reconstruir la tabla. Se copia el DDL exacto de la tabla migrada, cambiando
 * `tipo_operacion` a `varchar NOT NULL` liso (se conserva el CHECK de
 * `diferencia_destino_tipo` y todas las FKs). Mismo patrón que
 * `ReclasificarMovimientosAcreditacionPos` (soltó el CHECK de
 * `movimientos_bancarios.tipo_movimiento`).
 *
 * Aditiva/portable: en Postgres es no-op. Ninguna tabla referencia a
 * `operaciones_financieras` por FK entrante (el `operacion_financiera_id` de
 * `caja_mayor_movimientos` es int plano sin constraint), así que el
 * drop/rename es seguro.
 */
export class DropCheckTipoOperacionFinanciera1785170061312 implements MigrationInterface {
  name = 'DropCheckTipoOperacionFinanciera1785170061312';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) return; // Postgres: tipo_operacion es character varying sin CHECK.

    // ¿Todavía tiene el CHECK? Si ya se reconstruyó, no repetir (idempotente).
    const rows: Array<{ sql: string }> = await queryRunner.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='operaciones_financieras'`,
    );
    const currentSql = rows?.[0]?.sql || '';
    if (!currentSql.includes(`CHECK( "tipo_operacion"`)) return;

    await queryRunner.query(`
      CREATE TABLE "operaciones_financieras_new" (
        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "created_at" datetime NOT NULL DEFAULT (datetime('now')),
        "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
        "tipo_operacion" varchar NOT NULL,
        "descripcion" varchar(255) NOT NULL,
        "fecha" datetime NOT NULL,
        "monto_origen" decimal(14,2),
        "monto_destino" decimal(14,2),
        "cotizacion" decimal(14,6),
        "numero_comprobante" varchar(100),
        "comprobante_url" varchar(500),
        "diferencia" decimal(14,2) NOT NULL DEFAULT (0),
        "diferencia_destino_tipo" varchar CHECK( "diferencia_destino_tipo" IN ('GASTO','VALE','IGNORAR') ),
        "diferencia_observacion" text,
        "observacion" text,
        "anulado" boolean NOT NULL DEFAULT (0),
        "created_by" integer,
        "updated_by" integer,
        "operacion_financiera_categoria_id" integer,
        "caja_mayor_origen_id" integer,
        "moneda_origen_id" integer,
        "forma_pago_origen_id" integer,
        "cuenta_bancaria_origen_id" integer,
        "caja_mayor_destino_id" integer,
        "moneda_destino_id" integer,
        "forma_pago_destino_id" integer,
        "cuenta_bancaria_destino_id" integer,
        CONSTRAINT "FK_2cc7fc124c5e035255198a293de" FOREIGN KEY ("created_by") REFERENCES "usuarios" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_585c5dd25a21c201ae2bb82b35a" FOREIGN KEY ("updated_by") REFERENCES "usuarios" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_15cbd0bce55815f8185f3ed77dd" FOREIGN KEY ("operacion_financiera_categoria_id") REFERENCES "operaciones_financieras_categorias" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_3a7b540dc0c2f82f07d5dd33b71" FOREIGN KEY ("moneda_origen_id") REFERENCES "monedas" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_111a89aef12906fc07308ed3f57" FOREIGN KEY ("forma_pago_origen_id") REFERENCES "formas_pago" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_f5a15302f411285836d76c33a75" FOREIGN KEY ("moneda_destino_id") REFERENCES "monedas" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_5191d736544916836fc03dfe813" FOREIGN KEY ("forma_pago_destino_id") REFERENCES "formas_pago" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(`
      INSERT INTO "operaciones_financieras_new"
        ("id","created_at","updated_at","tipo_operacion","descripcion","fecha","monto_origen","monto_destino","cotizacion","numero_comprobante","comprobante_url","diferencia","diferencia_destino_tipo","diferencia_observacion","observacion","anulado","created_by","updated_by","operacion_financiera_categoria_id","caja_mayor_origen_id","moneda_origen_id","forma_pago_origen_id","cuenta_bancaria_origen_id","caja_mayor_destino_id","moneda_destino_id","forma_pago_destino_id","cuenta_bancaria_destino_id")
      SELECT
        "id","created_at","updated_at","tipo_operacion","descripcion","fecha","monto_origen","monto_destino","cotizacion","numero_comprobante","comprobante_url","diferencia","diferencia_destino_tipo","diferencia_observacion","observacion","anulado","created_by","updated_by","operacion_financiera_categoria_id","caja_mayor_origen_id","moneda_origen_id","forma_pago_origen_id","cuenta_bancaria_origen_id","caja_mayor_destino_id","moneda_destino_id","forma_pago_destino_id","cuenta_bancaria_destino_id"
      FROM "operaciones_financieras"
    `);
    await queryRunner.query(`DROP TABLE "operaciones_financieras"`);
    await queryRunner.query(`ALTER TABLE "operaciones_financieras_new" RENAME TO "operaciones_financieras"`);
  }

  public async down(): Promise<void> {
    // No se restaura el CHECK (best-effort, alineado con la entity varchar).
  }
}
