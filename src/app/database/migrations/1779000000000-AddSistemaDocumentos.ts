import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sistema de generación de PDFs y tickets térmicos — schema base.
 *
 * Cambios:
 * 1. Tabla `sectores_impresoras` — M2M Sector↔Printer con rol (COMANDA |
 *    TICKET_VENTA | PRECUENTA). Multi-impresora por sector soportado.
 * 2. Tabla `producto_sectores` — M2M Producto↔Sector. **Multi-sector por
 *    producto** (requerimiento explícito) — un mismo producto puede imprimirse
 *    en las impresoras de varios sectores al mismo tiempo.
 * 3. `venta_items` + `impreso`, `fecha_impresion`, `impresiones` (JSON
 *    serializado del log por-sector). El VentaItem es la unidad de
 *    impresión — el sistema dispara comandas para cualquier venta que
 *    tenga `mesa_id` o `comanda_id` asignado.
 * 4. `pdv_config` + `auto_imprimir_comanda`, `auto_imprimir_ticket_venta`,
 *    `imprimir_precuenta_al_solicitar`.
 * 5. `printers` + `rol` (fallback global cuando no se quiere pasar por M2M
 *    Sector).
 *
 * Driver-aware: SQLite usa `datetime` + `integer PRIMARY KEY AUTOINCREMENT`,
 * Postgres usa `TIMESTAMP` + `SERIAL`. ADD COLUMN en SQLite no permite FK
 * inline a tabla existente sin recrear — dejamos las FKs solo declaradas en
 * Postgres; TypeORM aún hace los join correctamente en ambos drivers.
 */
export class AddSistemaDocumentos1779000000000 implements MigrationInterface {
  name = 'AddSistemaDocumentos1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // ── 1. sectores_impresoras (M2M Sector↔Printer + rol) ────────────────
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "sectores_impresoras" (
          "id" SERIAL PRIMARY KEY,
          "sector_id" integer NOT NULL,
          "printer_id" integer NOT NULL,
          "rol" varchar(30) NOT NULL DEFAULT 'COMANDA',
          "activo" boolean NOT NULL DEFAULT true,
          "observacion" varchar(200) NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL,
          CONSTRAINT "UQ_sectores_impresoras_sector_printer_rol"
            UNIQUE ("sector_id", "printer_id", "rol"),
          CONSTRAINT "FK_sectores_impresoras_sector"
            FOREIGN KEY ("sector_id") REFERENCES "sectores"("id") ON DELETE CASCADE,
          CONSTRAINT "FK_sectores_impresoras_printer"
            FOREIGN KEY ("printer_id") REFERENCES "printers"("id") ON DELETE CASCADE
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sectores_impresoras_sector" ON "sectores_impresoras" ("sector_id")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sectores_impresoras_printer" ON "sectores_impresoras" ("printer_id")`);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "sectores_impresoras" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "sector_id" integer NOT NULL,
          "printer_id" integer NOT NULL,
          "rol" varchar(30) NOT NULL DEFAULT 'COMANDA',
          "activo" boolean NOT NULL DEFAULT 1,
          "observacion" varchar(200) NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL,
          CONSTRAINT "UQ_sectores_impresoras_sector_printer_rol"
            UNIQUE ("sector_id", "printer_id", "rol")
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sectores_impresoras_sector" ON "sectores_impresoras" ("sector_id")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_sectores_impresoras_printer" ON "sectores_impresoras" ("printer_id")`);
    }

    // ── 2. producto_sectores (M2M Producto↔Sector + prioridad) ───────────
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "producto_sectores" (
          "id" SERIAL PRIMARY KEY,
          "producto_id" integer NOT NULL,
          "sector_id" integer NOT NULL,
          "prioridad" integer NOT NULL DEFAULT 0,
          "activo" boolean NOT NULL DEFAULT true,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL,
          CONSTRAINT "UQ_producto_sectores_producto_sector"
            UNIQUE ("producto_id", "sector_id"),
          CONSTRAINT "FK_producto_sectores_producto"
            FOREIGN KEY ("producto_id") REFERENCES "producto"("id") ON DELETE CASCADE,
          CONSTRAINT "FK_producto_sectores_sector"
            FOREIGN KEY ("sector_id") REFERENCES "sectores"("id") ON DELETE CASCADE
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_producto_sectores_producto" ON "producto_sectores" ("producto_id")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_producto_sectores_sector" ON "producto_sectores" ("sector_id")`);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "producto_sectores" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "producto_id" integer NOT NULL,
          "sector_id" integer NOT NULL,
          "prioridad" integer NOT NULL DEFAULT 0,
          "activo" boolean NOT NULL DEFAULT 1,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL,
          CONSTRAINT "UQ_producto_sectores_producto_sector"
            UNIQUE ("producto_id", "sector_id")
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_producto_sectores_producto" ON "producto_sectores" ("producto_id")`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_producto_sectores_sector" ON "producto_sectores" ("sector_id")`);
    }

    // ── 3. venta_items + impresión ────────────────────────────────────────
    // Los VentaItems son la unidad de impresión (la venta puede tener mesa
    // o comanda; ambos disparan el ticket). Antes vivía en comanda_items
    // por un mal modelo del feature original.
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "venta_items" ADD COLUMN "impreso" boolean NOT NULL DEFAULT false`);
      await queryRunner.query(`ALTER TABLE "venta_items" ADD COLUMN "fecha_impresion" TIMESTAMP NULL`);
      await queryRunner.query(`ALTER TABLE "venta_items" ADD COLUMN "impresiones" text NULL`);
    } else {
      await queryRunner.query(`ALTER TABLE "venta_items" ADD COLUMN "impreso" boolean NOT NULL DEFAULT 0`);
      await queryRunner.query(`ALTER TABLE "venta_items" ADD COLUMN "fecha_impresion" datetime NULL`);
      await queryRunner.query(`ALTER TABLE "venta_items" ADD COLUMN "impresiones" text NULL`);
    }

    // ── 4. pdv_config + flags auto-impresión ──────────────────────────────
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "pdv_config" ADD COLUMN "auto_imprimir_comanda" boolean NOT NULL DEFAULT true`);
      await queryRunner.query(`ALTER TABLE "pdv_config" ADD COLUMN "auto_imprimir_ticket_venta" boolean NOT NULL DEFAULT true`);
      await queryRunner.query(`ALTER TABLE "pdv_config" ADD COLUMN "imprimir_precuenta_al_solicitar" boolean NOT NULL DEFAULT true`);
    } else {
      await queryRunner.query(`ALTER TABLE "pdv_config" ADD COLUMN "auto_imprimir_comanda" boolean NOT NULL DEFAULT 1`);
      await queryRunner.query(`ALTER TABLE "pdv_config" ADD COLUMN "auto_imprimir_ticket_venta" boolean NOT NULL DEFAULT 1`);
      await queryRunner.query(`ALTER TABLE "pdv_config" ADD COLUMN "imprimir_precuenta_al_solicitar" boolean NOT NULL DEFAULT 1`);
    }

    // ── 5. printers + rol global ──────────────────────────────────────────
    await queryRunner.query(`ALTER TABLE "printers" ADD COLUMN "rol" varchar(30) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // Inverso al up — orden inverso.
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "printers" DROP COLUMN IF EXISTS "rol"`);
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN IF EXISTS "imprimir_precuenta_al_solicitar"`);
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN IF EXISTS "auto_imprimir_ticket_venta"`);
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN IF EXISTS "auto_imprimir_comanda"`);
      await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN IF EXISTS "impresiones"`);
      await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN IF EXISTS "fecha_impresion"`);
      await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN IF EXISTS "impreso"`);
    } else {
      // SQLite >= 3.35 soporta DROP COLUMN
      await queryRunner.query(`ALTER TABLE "printers" DROP COLUMN "rol"`);
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN "imprimir_precuenta_al_solicitar"`);
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN "auto_imprimir_ticket_venta"`);
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN "auto_imprimir_comanda"`);
      await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN "impresiones"`);
      await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN "fecha_impresion"`);
      await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN "impreso"`);
    }

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_producto_sectores_sector"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_producto_sectores_producto"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "producto_sectores"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sectores_impresoras_printer"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sectores_impresoras_sector"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sectores_impresoras"`);
  }
}
