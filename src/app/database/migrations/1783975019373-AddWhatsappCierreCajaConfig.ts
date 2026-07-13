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
 * Config de envío por WhatsApp del resumen al cerrar una caja PdV.
 *
 * - `pdv_config.whatsapp_cierre_caja_activo`: on/off del envío automático.
 * - `pdv_config.whatsapp_cierre_caja_destino`: número internacional o JID de grupo.
 *
 * Aditiva y portable SQLite/Postgres.
 */
export class AddWhatsappCierreCajaConfig1783975019373 implements MigrationInterface {
  name = 'AddWhatsappCierreCajaConfig1783975019373';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const boolFalse = isPg ? 'boolean NOT NULL DEFAULT false' : 'boolean NOT NULL DEFAULT 0';

    if (!(await hasColumn(queryRunner, 'pdv_config', 'whatsapp_cierre_caja_activo', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "pdv_config" ADD COLUMN "whatsapp_cierre_caja_activo" ${boolFalse}`,
      );
    }
    if (!(await hasColumn(queryRunner, 'pdv_config', 'whatsapp_cierre_caja_destino', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "pdv_config" ADD COLUMN "whatsapp_cierre_caja_destino" varchar(120) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    // SQLite no soporta DROP COLUMN en versiones viejas; solo lo intentamos en PG.
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN IF EXISTS "whatsapp_cierre_caja_destino"`);
      await queryRunner.query(`ALTER TABLE "pdv_config" DROP COLUMN IF EXISTS "whatsapp_cierre_caja_activo"`);
    }
  }
}
