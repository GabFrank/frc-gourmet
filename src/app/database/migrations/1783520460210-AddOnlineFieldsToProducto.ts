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
 * Pedidos online (web app) — Fase 1.
 *
 * Agrega a `producto` los flags de canal ONLINE:
 * - `disponible_online`: el producto se publica en la carta de la web de pedidos.
 * - `pausado_online`: "86ing" en vivo — pausa temporal sin despublicar.
 *
 * Ambos default false: por defecto ningún producto se expone online hasta que
 * el operador lo marca desde la pantalla "Carta Online". Portable SQLite/Postgres.
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
 */
export class AddOnlineFieldsToProducto1783520460210 implements MigrationInterface {
  name = 'AddOnlineFieldsToProducto1783520460210';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const def = isPg ? 'false' : '0';
    const addCol = async (col: string) => {
      if (await hasColumn(queryRunner, 'producto', col, isPg)) return;
      await queryRunner.query(
        `ALTER TABLE "producto" ADD COLUMN "${col}" boolean NOT NULL DEFAULT ${def}`,
      );
    };
    await addCol('disponible_online');
    await addCol('pausado_online');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "producto" DROP COLUMN "pausado_online"`);
      await queryRunner.query(`ALTER TABLE "producto" DROP COLUMN "disponible_online"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
