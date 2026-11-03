import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tipos de venta del PdV, configurables globalmente: mesas, comandas y venta
 * rápida (delivery ya tenía `delivery_habilitado`).
 *
 * - `pdv_config.pdv_mesas_habilitadas`
 * - `pdv_config.pdv_comandas_habilitadas`
 * - `pdv_config.pdv_venta_rapida_habilitada`
 *
 * ESTRICTAMENTE ADITIVO. Las tres nacen en `true`: ninguna instalación cambia
 * de comportamiento al actualizar. No se reusa `comandas_habilitadas`: nunca se
 * leyó y nace en `false`, así que cablearlo escondía las comandas en todos lados.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class PdvTiposVenta1793381465964 implements MigrationInterface {
  name = 'PdvTiposVenta1793381465964';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const verdadero = queryRunner.connection.options.type === 'postgres' ? 'true' : '1';
    const columnas = ['pdv_mesas_habilitadas', 'pdv_comandas_habilitadas', 'pdv_venta_rapida_habilitada'];
    const tabla = await queryRunner.getTable('pdv_config');
    for (const col of columnas) {
      if (tabla?.columns.find((c) => c.name === col)) continue;
      await queryRunner.query(`ALTER TABLE "pdv_config" ADD COLUMN "${col}" boolean NOT NULL DEFAULT ${verdadero}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const col of ['pdv_venta_rapida_habilitada', 'pdv_comandas_habilitadas', 'pdv_mesas_habilitadas']) {
      try {
        await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN "${col}"`);
      } catch {
        // SQLite viejo no soporta DROP COLUMN.
      }
    }
  }
}
