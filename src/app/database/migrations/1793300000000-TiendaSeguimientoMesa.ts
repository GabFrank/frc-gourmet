import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online F2 (docs/planes/PLAN-tienda-online.md §F2, M6): seguimiento del pedido
 * del invitado de mesa sin cuenta.
 *
 * ESTRICTAMENTE ADITIVO: una columna nullable y un índice. Se guarda el SHA-256 del
 * token de seguimiento (nunca el token en claro). Sin backfill.
 */
export class TiendaSeguimientoMesa1793300000000 implements MigrationInterface {
  name = 'TiendaSeguimientoMesa1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "pedidos_online" ADD COLUMN IF NOT EXISTS "seguimiento_token_hash" varchar(64) NULL`);
    } else {
      const cols: any[] = await queryRunner.query(`PRAGMA table_info("pedidos_online")`);
      if (!cols.some((c) => c.name === 'seguimiento_token_hash')) {
        await queryRunner.query(`ALTER TABLE "pedidos_online" ADD COLUMN "seguimiento_token_hash" varchar(64) NULL`);
      }
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pedidos_online_seguimiento" ON "pedidos_online" ("seguimiento_token_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pedidos_online_seguimiento"`);
    await queryRunner.query(`ALTER TABLE "pedidos_online" DROP COLUMN "seguimiento_token_hash"`);
  }
}
