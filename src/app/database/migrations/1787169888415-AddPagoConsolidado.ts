import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pago consolidado de obligaciones desde Caja Mayor: un solo evento salda N
 * obligaciones del mismo concepto (compras / gastos / vales / liquidacion de
 * sueldo) cobrando con N lineas de pago (multi-moneda x multi-forma).
 *
 * ESTRICTAMENTE ADITIVO:
 *  - 2 tablas nuevas (`pagos_consolidados`, `pagos_consolidados_detalles`).
 *  - 1 columna nueva y nullable en `cajas_mayor_movimientos`.
 * No se toca ninguna tabla de deuda existente, asi que los pagos ya realizados
 * siguen exactamente igual.
 *
 * Driver-aware (SQLite vs Postgres). Sin FKs duras: TypeORM hace los joins igual
 * y evitamos romper por datos legacy, mismo criterio que el resto del dominio.
 */
export class AddPagoConsolidado1787169888415 implements MigrationInterface {
  name = 'AddPagoConsolidado1787169888415';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const tsDefault = isPg ? 'now()' : "(datetime('now'))";
    const bool = isPg ? 'boolean' : 'integer';
    const boolFalse = isPg ? 'false' : '0';
    const audit = `
      "created_at" ${ts} NOT NULL DEFAULT ${tsDefault},
      "updated_at" ${ts} NOT NULL DEFAULT ${tsDefault},
      "created_by" integer NULL,
      "updated_by" integer NULL`;

    // ── Cabecera del evento ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pagos_consolidados" (
        "id" ${pk},
        "fecha" ${ts} NOT NULL,
        "concepto" varchar(30) NOT NULL,
        "descripcion" varchar(255) NOT NULL,
        "moneda_deuda_id" integer NOT NULL,
        "monto_total" numeric(18,2) NOT NULL DEFAULT 0,
        "cantidad_items" integer NOT NULL DEFAULT 0,
        "responsable_id" integer NULL,
        "observacion" text NULL,
        "estado" varchar(30) NOT NULL DEFAULT 'ACTIVO',
        "motivo_anulacion" varchar(255) NULL,
        "fecha_anulacion" ${ts} NULL,${audit}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pcons_concepto" ON "pagos_consolidados" ("concepto")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pcons_estado" ON "pagos_consolidados" ("estado")`);

    // ── Detalle: una fila por (obligacion x linea de pago) ──
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pagos_consolidados_detalles" (
        "id" ${pk},
        "pago_consolidado_id" integer NOT NULL,
        "origen_tipo" varchar(30) NOT NULL,
        "origen_id" integer NOT NULL,
        "origen_descripcion" varchar(255) NOT NULL,
        "origen_beneficiario" varchar(255) NULL,
        "fuente" varchar(20) NOT NULL DEFAULT 'CAJA_MAYOR',
        "moneda_id" integer NOT NULL,
        "forma_pago_id" integer NULL,
        "caja_mayor_id" integer NULL,
        "cuenta_bancaria_id" integer NULL,
        "monto_origen" numeric(18,2) NOT NULL DEFAULT 0,
        "cotizacion" numeric(18,6) NOT NULL DEFAULT 1,
        "monto_imputado" numeric(18,2) NOT NULL DEFAULT 0,
        "caja_mayor_movimiento_id" integer NULL,
        "movimiento_bancario_id" integer NULL,
        "anulado" ${bool} NOT NULL DEFAULT ${boolFalse},${audit}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pcd_pago" ON "pagos_consolidados_detalles" ("pago_consolidado_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pcd_origen" ON "pagos_consolidados_detalles" ("origen_tipo", "origen_id")`);

    // ── Ancla del movimiento consolidado ──
    // SQLite no soporta IF NOT EXISTS en ADD COLUMN: se consulta el esquema.
    const tabla = await queryRunner.getTable('cajas_mayor_movimientos');
    if (tabla && !tabla.columns.find((c) => c.name === 'pago_consolidado_id')) {
      await queryRunner.query(
        `ALTER TABLE "cajas_mayor_movimientos" ADD COLUMN "pago_consolidado_id" integer NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // La columna en cajas_mayor_movimientos NO se revierte: soltarla en SQLite
    // exige recrear una tabla grande y viva, y una columna nullable de sobra no
    // molesta a nadie.
    await queryRunner.query(`DROP TABLE IF EXISTS "pagos_consolidados_detalles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pagos_consolidados"`);
  }
}
