import { MigrationInterface, QueryRunner } from 'typeorm';

/** Chequeo de columna existente, independiente del driver y del locale. */
async function hasColumn(
  queryRunner: QueryRunner,
  table: string,
  column: string,
  isPg: boolean,
): Promise<boolean> {
  if (isPg) {
    const rows = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column],
    );
    return rows.length > 0;
  }
  const rows = await queryRunner.query(`PRAGMA table_info("${table}")`);
  return Array.isArray(rows) && rows.some((r: any) => r.name === column);
}

/**
 * Agrega `requiere_comanda` a `producto` para el sistema de impresion
 * de comandas. Default true (la mayoria de productos generan comanda).
 * Marcar false para items que NO se imprimen: servicio mesa, propina,
 * descuento, etc.
 *
 * El handler print-comanda usa este flag + la M2M producto_sectores
 * para decidir si/donde imprimir cada item.
 */
export class AddRequiereComandaToProducto1779100000000 implements MigrationInterface {
  name = 'AddRequiereComandaToProducto1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (await hasColumn(queryRunner, 'producto', 'requiere_comanda', isPg)) return;
    const def = isPg ? 'true' : '1';
    await queryRunner.query(
      `ALTER TABLE "producto" ADD COLUMN "requiere_comanda" boolean NOT NULL DEFAULT ${def}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "producto" DROP COLUMN "requiere_comanda"`);
    } else {
      try {
        await queryRunner.query(`ALTER TABLE "producto" DROP COLUMN "requiere_comanda"`);
      } catch {
        // No-op para SQLite viejo
      }
    }
  }
}
