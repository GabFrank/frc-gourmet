import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online F3 (docs/planes/PLAN-tienda-online.md): credenciales de ingreso de clientes
 * cargadas desde «Config Tienda Online».
 *
 * ESTRICTAMENTE ADITIVO: cuatro columnas nullable en `tienda_online_config`, sin backfill.
 * Solo datos públicos (Phone Number ID, plantilla, idioma, Client ID de Google): el token de
 * WhatsApp va al almacén seguro del SO, no a la BD. Con las columnas vacías rigen las
 * variables de entorno, así que el `down` no cambia el comportamiento de una instalación
 * que no las cargó.
 */
const COLS: Array<[string, string]> = [
  ['whatsapp_phone_number_id', 'varchar(64)'],
  ['whatsapp_plantilla', 'varchar(120)'],
  ['whatsapp_idioma', 'varchar(16)'],
  ['google_client_id', 'varchar(255)'],
];

export class TiendaIngresoClientes1793400000000 implements MigrationInterface {
  name = 'TiendaIngresoClientes1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const existentes: string[] = isPg
      ? []
      : ((await queryRunner.query(`PRAGMA table_info("tienda_online_config")`)) as any[]).map((c) => c.name);
    for (const [col, tipo] of COLS) {
      if (isPg) {
        await queryRunner.query(`ALTER TABLE "tienda_online_config" ADD COLUMN IF NOT EXISTS "${col}" ${tipo} NULL`);
      } else if (!existentes.includes(col)) {
        await queryRunner.query(`ALTER TABLE "tienda_online_config" ADD COLUMN "${col}" ${tipo} NULL`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [col] of [...COLS].reverse()) {
      await queryRunner.query(`ALTER TABLE "tienda_online_config" DROP COLUMN "${col}"`);
    }
  }
}
