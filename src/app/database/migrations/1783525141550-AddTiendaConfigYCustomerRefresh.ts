import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pedidos online — cierre MVP: config de tienda + refresh token de cliente.
 *
 * Crea:
 * - `tienda_online_config`: config de la tienda (apertura, tipos de pedido,
 *   prep-time, mínimo, aceptación automática, branding, horarios).
 * - `customer_refresh_tokens`: refresh tokens de las CuentaCliente (storefront).
 *
 * Portable SQLite/Postgres. Ver docs/arquitectura/webapp-pedidos-plan.md.
 */
export class AddTiendaConfigYCustomerRefresh1783525141550 implements MigrationInterface {
  name = 'AddTiendaConfigYCustomerRefresh1783525141550';

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
      CREATE TABLE IF NOT EXISTS "tienda_online_config" (
        "id" ${pk},
        "activa" ${bool(true)},
        "nombre_comercio" varchar(150) NULL,
        "mensaje_bienvenida" varchar(300) NULL,
        "color_primario" varchar(20) NULL,
        "permite_pickup" ${bool(true)},
        "permite_delivery" ${bool(true)},
        "prep_time_minutos" integer NOT NULL DEFAULT 30,
        "monto_minimo_pedido" numeric(18,2) NOT NULL DEFAULT 0,
        "aceptacion_automatica" ${bool(false)},
        "horarios_json" text NULL,
        ${audit}
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_refresh_tokens" (
        "id" ${pk},
        "cuenta_cliente_id" integer NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "issued_at" ${ts} NOT NULL,
        "expires_at" ${ts} NOT NULL,
        "revoked_at" ${ts} NULL,
        "ip" varchar(255) NULL,
        "user_agent" varchar(255) NULL,
        ${audit}
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_customer_refresh_token_hash" ON "customer_refresh_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_customer_refresh_cuenta" ON "customer_refresh_tokens" ("cuenta_cliente_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tienda_online_config"`);
  }
}
