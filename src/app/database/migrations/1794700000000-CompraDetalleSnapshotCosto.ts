import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #189 — snapshot del costo al finalizar una compra (docs/planes/PLAN-189-costo-anular-compra.md).
 *
 * ESTRICTAMENTE ADITIVO: `precio_costo_id` y `precio_costo_previo_id` nullable en
 * `compras_detalles` (sin FK física). Sin backfill: las compras viejas no tienen snapshot
 * y, al anularlas, el costo se recalcula desde cero.
 */
export class CompraDetalleSnapshotCosto1794700000000 implements MigrationInterface {
  name = 'CompraDetalleSnapshotCosto1794700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const cols: { name: string }[] = isPg
      ? await queryRunner.query(`SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1 AND table_schema = current_schema()`, ['compras_detalles'])
      : await queryRunner.query(`PRAGMA table_info("compras_detalles")`);
    for (const col of ['precio_costo_id', 'precio_costo_previo_id']) {
      if (!cols.some((c) => c.name === col)) {
        await queryRunner.query(`ALTER TABLE "compras_detalles" ADD COLUMN "${col}" integer NULL`);
      }
    }
  }

  /** Solo para uso manual (revertir en producción = versión nueva). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    for (const col of ['precio_costo_id', 'precio_costo_previo_id']) {
      try { await queryRunner.query(`ALTER TABLE "compras_detalles" DROP COLUMN ${isPg ? 'IF EXISTS ' : ''}"${col}"`); } catch { /* no está */ }
    }
  }
}
