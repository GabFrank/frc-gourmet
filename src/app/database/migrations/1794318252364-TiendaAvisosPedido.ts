import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Avisos del pedido al cliente por WhatsApp (PLAN-tienda-avisos-whatsapp, fase 1).
 *
 * - `pedido_online_avisos`: cola con reintentos. Una fila por (pedido, evento): el índice único
 *   impide mandar dos veces el mismo aviso aunque dos procesos lo encolen.
 * - `pedidos_online.avisos_consentimiento_en`: el cliente aceptó recibir avisos en el checkout.
 * - `tienda_online_config.avisos_whatsapp` (apagado) y `avisos_telefono_prueba`: fuera de la app
 *   instalada los avisos van solo a ese número.
 *
 * ESTRICTAMENTE ADITIVO.
 */
export class TiendaAvisosPedido1794318252364 implements MigrationInterface {
  name = 'TiendaAvisosPedido1794318252364';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const agregar = async (tabla: string, col: string, tipo: string) => {
      const t = await queryRunner.getTable(tabla);
      if (t && !t.findColumnByName(col)) await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${col}" ${tipo}`);
    };
    const id = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const ts = isPg ? 'TIMESTAMP NOT NULL DEFAULT now()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    const tsNull = isPg ? 'TIMESTAMP NULL' : 'datetime NULL';
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "pedido_online_avisos" (
      "id" ${id},
      "created_at" ${ts},
      "updated_at" ${ts},
      "created_by" integer NULL,
      "updated_by" integer NULL,
      "pedido_online_id" integer NOT NULL,
      "evento" varchar(20) NOT NULL,
      "telefono" varchar(30) NOT NULL,
      "estado" varchar(15) NOT NULL DEFAULT 'PENDIENTE',
      "intentos" integer NOT NULL DEFAULT 0,
      "proximo_intento" ${tsNull},
      "error" varchar(255) NULL,
      "enviado_en" ${tsNull}
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pedido_online_avisos_pedido_evento" ON "pedido_online_avisos" ("pedido_online_id", "evento")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pedido_online_avisos_estado" ON "pedido_online_avisos" ("estado", "proximo_intento")`);
    await agregar('pedidos_online', 'avisos_consentimiento_en', tsNull);
    await agregar('tienda_online_config', 'avisos_whatsapp', `boolean NOT NULL DEFAULT ${isPg ? 'false' : '0'}`);
    await agregar('tienda_online_config', 'avisos_telefono_prueba', 'varchar(30) NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Aditiva: la bajada solo quita la tabla nueva (las columnas quedan; no molestan).
    await queryRunner.query(`DROP TABLE IF EXISTS "pedido_online_avisos"`);
  }
}
