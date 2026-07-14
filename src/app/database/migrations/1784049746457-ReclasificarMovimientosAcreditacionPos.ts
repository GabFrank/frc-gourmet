import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Da tipo propio a los MovimientoBancario generados por acreditaciones POS:
 * de `ENTRADA_MANUAL` a `ACREDITACION_POS`. Se detectan por la observación con
 * la que los crea `banking.handler`:
 *   - "ACREDITACION POS AUTO #<id>"       (auto-acreditación)
 *   - "ACREDITACION POS VERIFICADA #<id>" (verificación manual desde pendiente)
 *
 * Con el tipo correcto quedan etiquetados como "Acreditación POS" y se ocultan
 * por defecto de la lista consolidada (son "ruidosos").
 *
 * SQLite: la columna `tipo_movimiento` se creó con un CHECK que solo permite los
 * 4 tipos originales, así que primero se reconstruye la tabla sin ese CHECK
 * (alineado con la entity, que declara `varchar`). En Postgres la columna es
 * `character varying` sin constraint, por lo que basta el UPDATE.
 */
export class ReclasificarMovimientosAcreditacionPos1784049746457 implements MigrationInterface {
  name = 'ReclasificarMovimientosAcreditacionPos1784049746457';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    if (!isPg) {
      // SQLite: soltar el CHECK de tipo_movimiento reconstruyendo la tabla.
      await queryRunner.query(`
        CREATE TABLE "movimientos_bancarios_new" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "tipo_movimiento" varchar NOT NULL,
          "monto" decimal(14,2) NOT NULL,
          "fecha" datetime NOT NULL,
          "observacion" text,
          "numero_comprobante" varchar(100),
          "anulado" boolean NOT NULL DEFAULT (0),
          "created_by" integer,
          "updated_by" integer,
          "cuenta_bancaria_id" integer NOT NULL,
          "responsable_id" integer,
          CONSTRAINT "FK_mb_created_by" FOREIGN KEY ("created_by") REFERENCES "usuarios" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
          CONSTRAINT "FK_mb_updated_by" FOREIGN KEY ("updated_by") REFERENCES "usuarios" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
          CONSTRAINT "FK_mb_responsable" FOREIGN KEY ("responsable_id") REFERENCES "usuarios" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        )
      `);
      await queryRunner.query(`
        INSERT INTO "movimientos_bancarios_new"
          ("id","created_at","updated_at","tipo_movimiento","monto","fecha","observacion","numero_comprobante","anulado","created_by","updated_by","cuenta_bancaria_id","responsable_id")
        SELECT
          "id","created_at","updated_at","tipo_movimiento","monto","fecha","observacion","numero_comprobante","anulado","created_by","updated_by","cuenta_bancaria_id","responsable_id"
        FROM "movimientos_bancarios"
      `);
      await queryRunner.query(`DROP TABLE "movimientos_bancarios"`);
      await queryRunner.query(`ALTER TABLE "movimientos_bancarios_new" RENAME TO "movimientos_bancarios"`);
    }

    // 1) Reclasificar los asientos POS que YA existen (ENTRADA_MANUAL → ACREDITACION_POS).
    await queryRunner.query(`
      UPDATE "movimientos_bancarios"
      SET "tipo_movimiento" = 'ACREDITACION_POS'
      WHERE "tipo_movimiento" = 'ENTRADA_MANUAL'
        AND ("observacion" LIKE 'ACREDITACION POS AUTO #%'
          OR "observacion" LIKE 'ACREDITACION POS VERIFICADA #%')
    `);

    // 2) Backfill: crear el asiento de las acreditaciones acreditadas históricas
    //    que NUNCA registraron su MovimientoBancario (acreditadas antes de que
    //    existiera esa lógica). Es SOLO un registro contable para que aparezcan
    //    en la lista de movimientos; NO toca el saldo de la cuenta (que ya se
    //    incrementó al acreditarse y no se recalcula desde los movimientos).
    //    Idempotente por la observación (NOT EXISTS). created_at/updated_at/anulado
    //    usan sus DEFAULT.
    await queryRunner.query(`
      INSERT INTO "movimientos_bancarios"
        ("tipo_movimiento","monto","fecha","observacion","cuenta_bancaria_id")
      SELECT
        'ACREDITACION_POS',
        COALESCE(a."monto_acreditado", a."monto_esperado"),
        COALESCE(a."fecha_acreditacion_real", a."fecha_transaccion"),
        'ACREDITACION POS AUTO #' || a."id",
        a."cuenta_bancaria_id"
      FROM "acreditaciones_pos" a
      WHERE a."estado" IN ('ACREDITADO_AUTO','VERIFICADO','CON_DIFERENCIA')
        AND NOT EXISTS (
          SELECT 1 FROM "movimientos_bancarios" mb
          WHERE mb."observacion" = 'ACREDITACION POS AUTO #' || a."id"
             OR mb."observacion" = 'ACREDITACION POS VERIFICADA #' || a."id"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Best-effort: volver al tipo genérico (no restauramos el CHECK en SQLite).
    await queryRunner.query(`
      UPDATE "movimientos_bancarios"
      SET "tipo_movimiento" = 'ENTRADA_MANUAL'
      WHERE "tipo_movimiento" = 'ACREDITACION_POS'
        AND ("observacion" LIKE 'ACREDITACION POS AUTO #%'
          OR "observacion" LIKE 'ACREDITACION POS VERIFICADA #%')
    `);
  }
}
