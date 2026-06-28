import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modulo de facturacion (Fase fundacion).
 *
 * Crea las tablas del modulo: `timbrados`, `timbrado_detalles`,
 * `factura_plantillas`, `facturas`, `factura_items`. Driver-aware
 * (SQLite usa `datetime`/AUTOINCREMENT, Postgres `TIMESTAMP`/SERIAL).
 *
 * Aditiva e idempotente (CREATE TABLE/INDEX IF NOT EXISTS): no toca tablas
 * existentes y es segura de re-ejecutar.
 */
export class AddFacturacion1782519234187 implements MigrationInterface {
  name = 'AddFacturacion1782519234187';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? `"id" SERIAL PRIMARY KEY` : `"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL`;
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const now = isPg ? 'now()' : `(datetime('now'))`;
    const audit = `
      "created_at" ${ts} NOT NULL DEFAULT ${now},
      "updated_at" ${ts} NOT NULL DEFAULT ${now},
      "created_by" integer NULL,
      "updated_by" integer NULL
    `;

    // timbrados
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "timbrados" (
        ${pk},
        "numero" varchar NOT NULL,
        "razon_social" varchar NULL,
        "ruc" varchar NULL,
        "is_electronico" boolean NOT NULL DEFAULT ${isPg ? 'false' : '0'},
        "csc" varchar NULL,
        "csc_id" varchar NULL,
        "fecha_inicio" date NULL,
        "fecha_fin" date NULL,
        "tipo_documento" varchar NULL DEFAULT 'FACTURA',
        "observacion" text NULL,
        "activo" boolean NOT NULL DEFAULT ${isPg ? 'true' : '1'},
        ${audit}
      )
    `);

    // timbrado_detalles
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "timbrado_detalles" (
        ${pk},
        "timbrado_id" integer NULL,
        "dispositivo_id" integer NULL,
        "establecimiento" varchar NOT NULL DEFAULT '001',
        "punto_expedicion" varchar NOT NULL DEFAULT '001',
        "rango_desde" integer NOT NULL DEFAULT 1,
        "rango_hasta" integer NOT NULL DEFAULT 1,
        "numero_actual" integer NOT NULL DEFAULT 1,
        "activo" boolean NOT NULL DEFAULT ${isPg ? 'true' : '1'},
        ${audit}
      )
    `);

    // factura_plantillas
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "factura_plantillas" (
        ${pk},
        "nombre" varchar NOT NULL,
        "tipo" varchar NOT NULL DEFAULT 'PRE_IMPRESO',
        "ancho_mm" decimal(8,2) NOT NULL DEFAULT 210,
        "alto_mm" decimal(8,2) NOT NULL DEFAULT 297,
        "config" text NULL,
        "background_image_url" text NULL,
        "activo" boolean NOT NULL DEFAULT ${isPg ? 'true' : '1'},
        "predeterminada" boolean NOT NULL DEFAULT ${isPg ? 'false' : '0'},
        ${audit}
      )
    `);

    // facturas
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "facturas" (
        ${pk},
        "timbrado_detalle_id" integer NULL,
        "venta_id" integer NULL,
        "cliente_id" integer NULL,
        "plantilla_id" integer NULL,
        "tipo_facturacion" varchar NOT NULL DEFAULT 'PRE_IMPRESO',
        "numero_factura" integer NULL,
        "numero_completo" varchar NULL,
        "fecha" ${ts} NOT NULL DEFAULT ${now},
        "condicion_venta" varchar NOT NULL DEFAULT 'CONTADO',
        "nombre_cliente" varchar NULL,
        "ruc" varchar NULL,
        "direccion" varchar NULL,
        "email" varchar NULL,
        "moneda_id" integer NULL,
        "tipo_cambio" decimal(18,6) NULL,
        "gravada10" decimal(18,2) NOT NULL DEFAULT 0,
        "gravada5" decimal(18,2) NOT NULL DEFAULT 0,
        "exenta" decimal(18,2) NOT NULL DEFAULT 0,
        "iva10" decimal(18,2) NOT NULL DEFAULT 0,
        "iva5" decimal(18,2) NOT NULL DEFAULT 0,
        "descuento" decimal(18,2) NOT NULL DEFAULT 0,
        "total" decimal(18,2) NOT NULL DEFAULT 0,
        "cdc" varchar NULL,
        "estado" varchar NOT NULL DEFAULT 'EMITIDA',
        "motivo_anulacion" text NULL,
        "fecha_anulacion" ${ts} NULL,
        ${audit}
      )
    `);

    // factura_items
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "factura_items" (
        ${pk},
        "factura_id" integer NULL,
        "venta_item_id" integer NULL,
        "producto_id" integer NULL,
        "descripcion" varchar NOT NULL,
        "cantidad" decimal(18,3) NOT NULL DEFAULT 1,
        "unidad_medida" varchar NULL,
        "precio_unitario" decimal(18,2) NOT NULL DEFAULT 0,
        "descuento" decimal(18,2) NOT NULL DEFAULT 0,
        "iva_tipo" integer NOT NULL DEFAULT 10,
        "total" decimal(18,2) NOT NULL DEFAULT 0,
        ${audit}
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_timbrado_detalles_timbrado" ON "timbrado_detalles" ("timbrado_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_facturas_venta" ON "facturas" ("venta_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_facturas_timbrado_detalle" ON "facturas" ("timbrado_detalle_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_factura_items_factura" ON "factura_items" ("factura_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "factura_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "facturas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "factura_plantillas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "timbrado_detalles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "timbrados"`);
  }
}
