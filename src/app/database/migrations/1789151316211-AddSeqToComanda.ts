import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega columna `seq` a `comandas` para ordenar eventos SSE del PdV.
 *
 * El seq se incrementa en cada mutación de la comanda (abrir, cerrar, cambiar
 * observación, transferir cuenta, etc.) y permite al cliente descartar eventos
 * viejos.
 *
 * Nullable con default null: las comandas existentes no tienen seq hasta que
 * muten. El índice es para queries de `ORDER BY seq DESC`.
 */
export class AddSeqToComanda1789151316211 implements MigrationInterface {
  name = 'AddSeqToComanda1789151316211';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const driverType = queryRunner.connection.options.type;

    if (driverType === 'postgres') {
      await queryRunner.query(`ALTER TABLE "comandas" ADD COLUMN "seq" INTEGER NULL`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_seq_comanda" ON "comandas" ("seq")`);
    } else {
      // SQLite
      await queryRunner.query(`ALTER TABLE "comandas" ADD COLUMN "seq" INTEGER NULL`);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_seq_comanda" ON "comandas" ("seq")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_seq_comanda"`);
    
    const driverType = queryRunner.connection.options.type;
    if (driverType === 'postgres') {
      await queryRunner.query(`ALTER TABLE "comandas" DROP COLUMN "seq"`);
    } else {
      // SQLite no soporta DROP COLUMN
    }
  }
}
