import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online F8b fase 1 (docs/planes/PLAN-tienda-f8b-credito.md): la cuenta web se vincula a
 * mano al `Cliente` interno.
 *
 * - `cuentas_cliente.vinculado_por` / `vinculado_en`: quién hizo el vínculo vigente y cuándo.
 * - `cuentas_cliente_vinculos`: historial de cada vínculo y desvínculo (no se borra nunca).
 * - Índice único parcial «un cliente, una cuenta web»: dos cuentas no pueden gastar el mismo
 *   crédito. Hoy nada escribe `cliente_id`, así que no puede haber duplicados.
 * - `pedidos_online.cliente_id`: el cliente al que pertenece el pedido, fijado al crearlo.
 *   Desvincular la cuenta después no cambia a quién es el pedido.
 *
 * ESTRICTAMENTE ADITIVO.
 */
export class TiendaVinculoCuentaCliente1794069224523 implements MigrationInterface {
  name = 'TiendaVinculoCuentaCliente1794069224523';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const agregar = async (tabla: string, col: string, tipo: string) => {
      const t = await queryRunner.getTable(tabla);
      if (t && !t.findColumnByName(col)) await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${col}" ${tipo}`);
    };
    await agregar('cuentas_cliente', 'vinculado_por', 'integer NULL');
    await agregar('cuentas_cliente', 'vinculado_en', 'TIMESTAMP NULL');
    await agregar('pedidos_online', 'cliente_id', 'integer NULL');

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cuentas_cliente_cliente" ON "cuentas_cliente" ("cliente_id") WHERE "cliente_id" IS NOT NULL`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pedidos_online_cliente" ON "pedidos_online" ("cliente_id")`);

    const id = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const ts = isPg ? 'TIMESTAMP NOT NULL DEFAULT now()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "cuentas_cliente_vinculos" (
      "id" ${id},
      "created_at" ${ts},
      "updated_at" ${ts},
      "created_by" integer NULL,
      "updated_by" integer NULL,
      "cuenta_cliente_id" integer NOT NULL,
      "cliente_id" integer NOT NULL,
      "accion" varchar(20) NOT NULL,
      "motivo" varchar(200) NULL
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cuentas_cliente_vinculos_cuenta" ON "cuentas_cliente_vinculos" ("cuenta_cliente_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cuentas_cliente_vinculos_cuenta"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cuentas_cliente_vinculos"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pedidos_online_cliente"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cuentas_cliente_cliente"`);
    for (const [tabla, col] of [['pedidos_online', 'cliente_id'], ['cuentas_cliente', 'vinculado_en'], ['cuentas_cliente', 'vinculado_por']]) {
      const t = await queryRunner.getTable(tabla);
      if (t && t.findColumnByName(col)) await queryRunner.dropColumn(tabla, col);
    }
  }
}
