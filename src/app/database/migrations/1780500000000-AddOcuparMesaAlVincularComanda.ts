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
 * Flag de PdV: `ocupar_mesa_al_vincular_comanda`. Si true, vincular una comanda a
 * una mesa la marca OCUPADA (y al liberar la comanda se libera la mesa si no quedan
 * otras comandas ni venta de mesa). Default false (comportamiento histórico).
 *
 * Portable SQLite/Postgres. Columna con default → sin backfill.
 */
export class AddOcuparMesaAlVincularComanda1780500000000 implements MigrationInterface {
  name = 'AddOcuparMesaAlVincularComanda1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'pdv_config', 'ocupar_mesa_al_vincular_comanda', isPg))) {
      const def = isPg ? 'false' : '0';
      await queryRunner.query(
        `ALTER TABLE "pdv_config" ADD COLUMN "ocupar_mesa_al_vincular_comanda" boolean NOT NULL DEFAULT ${def}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN "ocupar_mesa_al_vincular_comanda"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
