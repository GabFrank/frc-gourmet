import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pedidos online — Fase 3: pedidos + zonas de delivery.
 *
 * Crea:
 * - `zonas_delivery`: tarifa + monto mínimo por zona.
 * - `pedidos_online`: envelope del pedido (RECIBIDO → ... → ENTREGADO / RECHAZADO),
 *   con snapshot de totales y vínculos opcionales a venta/delivery al aceptar.
 * - `pedido_online_items`: ítems con precio congelado + personalización JSON.
 *
 * Portable SQLite/Postgres. Ver docs/arquitectura/webapp-pedidos-plan.md.
 */
export class AddPedidosOnline1782800000000 implements MigrationInterface {
  name = 'AddPedidosOnline1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const tsNow = isPg ? 'TIMESTAMP NOT NULL DEFAULT now()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    const bool = (d: boolean) => (isPg ? `boolean NOT NULL DEFAULT ${d}` : `boolean NOT NULL DEFAULT ${d ? 1 : 0}`);
    const audit = `
      "created_at" ${tsNow},
      "updated_at" ${tsNow},
      "created_by" integer NULL,
      "updated_by" integer NULL
    `;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "zonas_delivery" (
        "id" ${pk},
        "nombre" varchar(150) NOT NULL,
        "tarifa" numeric(18,2) NOT NULL DEFAULT 0,
        "monto_minimo" numeric(18,2) NOT NULL DEFAULT 0,
        "activa" ${bool(true)},
        "orden" integer NOT NULL DEFAULT 0,
        ${audit}
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pedidos_online" (
        "id" ${pk},
        "numero" varchar(20) NOT NULL,
        "cuenta_cliente_id" integer NULL,
        "nombre_cliente" varchar(150) NULL,
        "telefono_cliente" varchar(30) NULL,
        "tipo_pedido" varchar(20) NOT NULL,
        "estado" varchar(20) NOT NULL DEFAULT 'RECIBIDO',
        "canal_origen" varchar(20) NOT NULL DEFAULT 'WEB',
        "metodo_pago" varchar(20) NOT NULL DEFAULT 'EFECTIVO',
        "fecha_programada" ${ts} NULL,
        "subtotal" numeric(18,2) NOT NULL DEFAULT 0,
        "costo_envio" numeric(18,2) NOT NULL DEFAULT 0,
        "total" numeric(18,2) NOT NULL DEFAULT 0,
        "moneda_id" integer NULL,
        "zona_delivery_id" integer NULL,
        "direccion_entrega" text NULL,
        "referencia_direccion" varchar(255) NULL,
        "notas" text NULL,
        "venta_id" integer NULL,
        "delivery_id" integer NULL,
        "mesa_id" integer NULL,
        "motivo_rechazo" varchar(255) NULL,
        "fecha_aceptado" ${ts} NULL,
        "fecha_listo" ${ts} NULL,
        "fecha_entregado" ${ts} NULL,
        ${audit}
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_pedidos_online_numero" ON "pedidos_online" ("numero")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pedidos_online_estado" ON "pedidos_online" ("estado")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pedido_online_items" (
        "id" ${pk},
        "pedido_online_id" integer NOT NULL,
        "producto_id" integer NOT NULL,
        "presentacion_id" integer NULL,
        "nombre_producto" varchar(255) NOT NULL,
        "nombre_presentacion" varchar(255) NULL,
        "cantidad" numeric(18,3) NOT NULL DEFAULT 1,
        "precio_unitario" numeric(18,2) NOT NULL DEFAULT 0,
        "subtotal" numeric(18,2) NOT NULL DEFAULT 0,
        "personalizacion" text NULL,
        ${audit}
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pedido_online_items_pedido" ON "pedido_online_items" ("pedido_online_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pedido_online_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pedidos_online"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "zonas_delivery"`);
  }
}
