import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convenios de clientes + cobro consolidado.
 *
 * Tablas:
 *  - convenios: agrupa clientes de una empresa/entidad externa con acuerdo.
 *  - cliente_convenios: M2M Cliente↔Convenio (lado dueno: Cliente).
 *  - cobros_consolidados: cabecera del pago consolidado de un convenio.
 *  - cobros_consolidados_detalles: lo cobrado a cada cliente en ese cobro.
 *
 * Driver-aware: SQLite usa `datetime` + `integer PRIMARY KEY AUTOINCREMENT` +
 * boolean 0/1; Postgres usa `TIMESTAMP` + `SERIAL` + boolean true/false. Las FKs
 * se declaran solo en Postgres (TypeORM hace los joins en ambos por igual).
 */
export class AddConveniosCobroConsolidado1779500000000 implements MigrationInterface {
  name = 'AddConveniosCobroConsolidado1779500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const tsDefault = isPg ? 'now()' : "(datetime('now'))";
    const boolTrue = isPg ? 'true' : '1';
    const audit = `
      "created_at" ${ts} NOT NULL DEFAULT ${tsDefault},
      "updated_at" ${ts} NOT NULL DEFAULT ${tsDefault},
      "created_by" integer NULL,
      "updated_by" integer NULL`;

    // ── convenios ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "convenios" (
        "id" ${pk},
        "nombre" varchar(160) NOT NULL,
        "descripcion" varchar(300) NULL,
        "ruc" varchar(40) NULL,
        "contacto" varchar(160) NULL,
        "activo" boolean NOT NULL DEFAULT ${boolTrue},${audit}
      )
    `);

    // ── cliente_convenios (M2M) ──────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cliente_convenios" (
        "cliente_id" integer NOT NULL,
        "convenio_id" integer NOT NULL,
        CONSTRAINT "PK_cliente_convenios" PRIMARY KEY ("cliente_id", "convenio_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cliente_convenios_cliente" ON "cliente_convenios" ("cliente_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cliente_convenios_convenio" ON "cliente_convenios" ("convenio_id")`);

    // ── cobros_consolidados ──────────────────────────────────────────────
    const fkConvenio = isPg
      ? `, CONSTRAINT "FK_cobros_consolidados_convenio" FOREIGN KEY ("convenio_id") REFERENCES "convenios"("id")`
      : '';
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cobros_consolidados" (
        "id" ${pk},
        "convenio_id" integer NOT NULL,
        "fecha" ${ts} NOT NULL,
        "monto_total" numeric(18,2) NOT NULL DEFAULT 0,
        "cantidad_clientes" integer NOT NULL DEFAULT 0,
        "fuente" varchar(30) NOT NULL DEFAULT 'CAJA_MAYOR',
        "caja_mayor_id" integer NULL,
        "moneda_id" integer NULL,
        "forma_pago_id" integer NULL,
        "cuenta_bancaria_id" integer NULL,
        "observacion" text NULL,
        "estado" varchar(30) NOT NULL DEFAULT 'ACTIVO',${audit}${fkConvenio}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cobros_consolidados_convenio" ON "cobros_consolidados" ("convenio_id")`);

    // ── cobros_consolidados_detalles ─────────────────────────────────────
    const fkDet = isPg
      ? `, CONSTRAINT "FK_ccd_cobro" FOREIGN KEY ("cobro_consolidado_id") REFERENCES "cobros_consolidados"("id") ON DELETE CASCADE`
      : '';
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cobros_consolidados_detalles" (
        "id" ${pk},
        "cobro_consolidado_id" integer NOT NULL,
        "cliente_id" integer NOT NULL,
        "monto_cobrado" numeric(18,2) NOT NULL DEFAULT 0,
        "saldo_anterior" numeric(18,2) NOT NULL DEFAULT 0,${audit}${fkDet}
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ccd_cobro" ON "cobros_consolidados_detalles" ("cobro_consolidado_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_ccd_cliente" ON "cobros_consolidados_detalles" ("cliente_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cobros_consolidados_detalles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cobros_consolidados"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cliente_convenios"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "convenios"`);
  }
}
