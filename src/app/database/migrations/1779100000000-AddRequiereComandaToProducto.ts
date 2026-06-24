import { MigrationInterface, QueryRunner } from 'typeorm';

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
    const def = isPg ? 'true' : '1';
    try {
      await queryRunner.query(
        `ALTER TABLE "producto" ADD COLUMN "requiere_comanda" boolean NOT NULL DEFAULT ${def}`,
      );
    } catch (e: any) {
      // Idempotente: si la columna ya existe (DB con drift de synchronize), ignorar.
      if (!/duplicate column|already exists/i.test(e?.message || '')) throw e;
    }
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
