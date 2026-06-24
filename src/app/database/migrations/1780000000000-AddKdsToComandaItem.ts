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
 * KDS Fase 0 — habilita `comanda_items` como unidad de pantalla de cocina.
 *
 * - `sector_id`: FK al sector donde se prepara este item. El ruteo ya fanea
 *   por sector (M2M producto_sectores), así un mismo producto puede generar
 *   N ComandaItems (uno por sector) con estado de preparación independiente
 *   (ej. LISTO en cocina, PENDIENTE en bar).
 * - `fecha_en_preparacion`: timestamp al pasar a EN_PREPARACION, para métricas
 *   de tiempo de preparación (junto con fecha_listo y created_at).
 *
 * Portable SQLite/Postgres. La tabla `comanda_items` ya existe (baseline /
 * AddSistemaDocumentos); acá solo se agregan columnas nullable.
 */
export class AddKdsToComandaItem1780000000000 implements MigrationInterface {
  name = 'AddKdsToComandaItem1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const tsType = isPg ? 'TIMESTAMP' : 'datetime';
    const addCol = async (col: string, type: string) => {
      if (await hasColumn(queryRunner, 'comanda_items', col, isPg)) return;
      await queryRunner.query(`ALTER TABLE "comanda_items" ADD COLUMN "${col}" ${type}`);
    };
    await addCol('sector_id', 'integer');
    await addCol('fecha_en_preparacion', tsType);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`ALTER TABLE "comanda_items" DROP COLUMN "fecha_en_preparacion"`);
      await queryRunner.query(`ALTER TABLE "comanda_items" DROP COLUMN "sector_id"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
