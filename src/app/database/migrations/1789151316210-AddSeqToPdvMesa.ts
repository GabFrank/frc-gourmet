import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega columna `seq` a `pdv_mesas` para ordenar eventos SSE del PdV.
 *
 * El seq se incrementa en cada mutación del estado de la mesa (ocupar, liberar,
 * transferir cuenta, etc.) y permite al cliente descartar eventos viejos.
 *
 * Nullable con default null: las mesas existentes no tienen seq hasta que
 * muten. El índice es para queries de `ORDER BY seq DESC`.
 */
export class AddSeqToPdvMesa1789151316210 implements MigrationInterface {
  name = 'AddSeqToPdvMesa1789151316210';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const driverType = queryRunner.connection.options.type;

    if (driverType === 'postgres') {
      await queryRunner.query(`ALTER TABLE "pdv_mesas" ADD COLUMN "seq" INTEGER NULL`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_seq_pdv_mesa" ON "pdv_mesas" ("seq")`);
    } else {
      // SQLite
      await queryRunner.query(`ALTER TABLE "pdv_mesas" ADD COLUMN "seq" INTEGER NULL`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_seq_pdv_mesa" ON "pdv_mesas" ("seq")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_seq_pdv_mesa"`);
    
    const driverType = queryRunner.connection.options.type;
    if (driverType === 'postgres') {
      await queryRunner.query(`ALTER TABLE "pdv_mesas" DROP COLUMN "seq"`);
    } else {
      // SQLite no soporta DROP COLUMN
    }
  }
}
