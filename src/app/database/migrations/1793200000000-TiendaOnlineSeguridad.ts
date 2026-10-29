import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online F1 (docs/planes/PLAN-tienda-online.md, A2.4): idempotencia del pedido.
 *
 * ESTRICTAMENTE ADITIVO: una columna nullable y tres índices. Sin backfill: los pedidos
 * existentes quedan con idempotency_key NULL, que los índices parciales no cubren.
 * - Única por cuenta: (cuenta_cliente_id, idempotency_key) si hay cuenta.
 * - Única por mesa para invitados: (mesa_id, idempotency_key) si no hay cuenta.
 * Los índices parciales (WHERE) funcionan igual en SQLite y Postgres.
 */
export class TiendaOnlineSeguridad1793200000000 implements MigrationInterface {
  name = 'TiendaOnlineSeguridad1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "pedidos_online" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(64) NULL`);
    } else {
      const cols: any[] = await queryRunner.query(`PRAGMA table_info("pedidos_online")`);
      if (!cols.some((c) => c.name === 'idempotency_key')) {
        await queryRunner.query(`ALTER TABLE "pedidos_online" ADD COLUMN "idempotency_key" varchar(64) NULL`);
      }
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pedidos_online_cuenta_idem" ON "pedidos_online" ("cuenta_cliente_id", "idempotency_key") ` +
      `WHERE "cuenta_cliente_id" IS NOT NULL AND "idempotency_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pedidos_online_mesa_idem" ON "pedidos_online" ("mesa_id", "idempotency_key") ` +
      `WHERE "cuenta_cliente_id" IS NULL AND "mesa_id" IS NOT NULL AND "idempotency_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pedidos_online_cuenta_cliente" ON "pedidos_online" ("cuenta_cliente_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pedidos_online_cuenta_cliente"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_pedidos_online_mesa_idem"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_pedidos_online_cuenta_idem"`);
    await queryRunner.query(`ALTER TABLE "pedidos_online" DROP COLUMN "idempotency_key"`);
  }
}
