import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liquidación de sueldo — cobro de consumos a crédito (docs/planes/PLAN-liquidacion-descuento-cpc.md).
 *
 * ESTRICTAMENTE ADITIVO: `liquidacion_item_id` nullable (+ índice) en `movimientos_cliente`,
 * sin FK física. Sin backfill: los cobros viejos se revierten por la observación, como antes.
 */
export class MovimientoClienteLiquidacionItem1794800000000 implements MigrationInterface {
  name = 'MovimientoClienteLiquidacionItem1794800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const cols: { name: string }[] = isPg
      ? await queryRunner.query(`SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1 AND table_schema = current_schema()`, ['movimientos_cliente'])
      : await queryRunner.query(`PRAGMA table_info("movimientos_cliente")`);
    if (!cols.some((c) => c.name === 'liquidacion_item_id')) {
      await queryRunner.query(`ALTER TABLE "movimientos_cliente" ADD COLUMN "liquidacion_item_id" integer NULL`);
    }
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_movimientos_cliente_liquidacion_item" ON "movimientos_cliente" ("liquidacion_item_id")`);
  }

  /** Solo para uso manual (revertir en producción = versión nueva). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_movimientos_cliente_liquidacion_item"`);
    try { await queryRunner.query(`ALTER TABLE "movimientos_cliente" DROP COLUMN ${isPg ? 'IF EXISTS ' : ''}"liquidacion_item_id"`); } catch { /* no está */ }
  }
}
