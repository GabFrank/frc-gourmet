import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega columna `seq` a `ventas` para ordenar eventos SSE del PdV.
 *
 * El seq se incrementa en cada mutación de la venta (agregar/editar/borrar
 * ítems, cobrar, cancelar, etc.) y permite al cliente descartar eventos viejos
 * que lleguen después de un refresh manual más reciente.
 *
 * Nullable con default null: las ventas existentes no tienen seq hasta que
 * muten. El índice es para queries de `ORDER BY seq DESC` al reconstruir orden
 * de eventos.
 */
export class AddSeqToVenta1789151316209 implements MigrationInterface {
  name = 'AddSeqToVenta1789151316209';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const driverType = queryRunner.connection.options.type;

    if (driverType === 'postgres') {
      await queryRunner.query(`ALTER TABLE "ventas" ADD COLUMN "seq" INTEGER NULL`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_seq_venta" ON "ventas" ("seq")`);
    } else {
      // SQLite
      await queryRunner.query(`ALTER TABLE "ventas" ADD COLUMN "seq" INTEGER NULL`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_seq_venta" ON "ventas" ("seq")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_seq_venta"`);
    
    const driverType = queryRunner.connection.options.type;
    if (driverType === 'postgres') {
      await queryRunner.query(`ALTER TABLE "ventas" DROP COLUMN "seq"`);
    } else {
      // SQLite no soporta DROP COLUMN, se necesitaría recrear la tabla
      // Para down basta con eliminar el índice
    }
  }
}
