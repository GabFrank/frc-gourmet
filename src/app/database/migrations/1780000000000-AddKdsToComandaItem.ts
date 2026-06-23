import { MigrationInterface, QueryRunner } from 'typeorm';

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
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "comanda_items" ADD COLUMN "sector_id" integer`);
      await queryRunner.query(`ALTER TABLE "comanda_items" ADD COLUMN "fecha_en_preparacion" TIMESTAMP`);
    } else {
      await queryRunner.query(`ALTER TABLE "comanda_items" ADD COLUMN "sector_id" integer`);
      await queryRunner.query(`ALTER TABLE "comanda_items" ADD COLUMN "fecha_en_preparacion" datetime`);
    }
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
