import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 2 — Config de balanza (etiqueta EAN-13) en pdv_config.
 *
 * Aditiva e idempotente. Con default, así las filas existentes quedan con la
 * configuración estándar (prefijo '2', modo PESO, factor 1 = gramos).
 */
export class AddBalanzaConfigToPdvConfig1778900000000 implements MigrationInterface {
  name = 'AddBalanzaConfigToPdvConfig1778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    const add = async (col: string, type: string) => {
      if (await this.hasColumn(queryRunner, 'pdv_config', col, isPg)) return;
      await queryRunner.query(`ALTER TABLE "pdv_config" ADD COLUMN "${col}" ${type}`);
    };

    await add('balanza_prefijo', "varchar(2) NOT NULL DEFAULT '2'");
    await add('balanza_modo', "varchar(10) NOT NULL DEFAULT 'PESO'");
    await add('balanza_factor_peso', 'decimal(10,3) NOT NULL DEFAULT 1');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['balanza_prefijo', 'balanza_modo', 'balanza_factor_peso']) {
      try {
        await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN "${col}"`);
      } catch {
        // SQLite viejo no soporta DROP COLUMN; no-op.
      }
    }
  }

  private async hasColumn(
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
}
