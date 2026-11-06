import { MigrationInterface, QueryRunner } from 'typeorm';
import { FORMA_PAGO_BANCARD } from '../entities/pedidos-online/pedido-online.enums';

/**
 * Pago online con proveedores intercambiables (PLAN-tienda-pagos-proveedores, fase 2).
 *
 * - `pago_proveedor`: el proveedor con el que se cobran los pedidos NUEVOS. Vacío = uPay (lo de
 *   F4), así una instalación existente no cambia de conducta.
 * - `pago_config_json`: datos NO secretos por proveedor (`{"BANCARD":{"publicKey":…}}`). Los
 *   secretos van al almacén seguro. Las columnas `upay_*` quedan: uPay las sigue usando.
 * - `pago_devolucion_automatica`: «Hay que devolverlo» intenta devolver por API (apagado).
 * - Forma de pago «BANCARD ONLINE», inactiva como «UPAY ONLINE»: solo la usa la materialización.
 *
 * ESTRICTAMENTE ADITIVO.
 */
export class TiendaPagoProveedores1793998020104 implements MigrationInterface {
  name = 'TiendaPagoProveedores1793998020104';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const t = await queryRunner.getTable('tienda_online_config');
    const agregar = async (col: string, tipo: string) => {
      if (t && !t.findColumnByName(col)) await queryRunner.query(`ALTER TABLE "tienda_online_config" ADD COLUMN "${col}" ${tipo}`);
    };
    await agregar('pago_proveedor', 'varchar(20) NULL');
    await agregar('pago_config_json', 'text NULL');
    await agregar('pago_devolucion_automatica', `boolean NOT NULL DEFAULT ${isPg ? 'false' : '0'}`);

    const fp = await queryRunner.query(`SELECT id FROM "formas_pago" WHERE "nombre" = '${FORMA_PAGO_BANCARD}'`);
    if (!fp.length) {
      await queryRunner.query(
        `INSERT INTO "formas_pago" ("nombre", "activo", "movimenta_caja", "principal", "orden") VALUES ('${FORMA_PAGO_BANCARD}', ${isPg ? 'false' : '0'}, ${isPg ? 'false' : '0'}, ${isPg ? 'false' : '0'}, 99)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "formas_pago" WHERE "nombre" = '${FORMA_PAGO_BANCARD}' AND "id" NOT IN (SELECT "forma_pago_id" FROM "pagos_detalles" WHERE "forma_pago_id" IS NOT NULL)`,
    );
    const t = await queryRunner.getTable('tienda_online_config');
    for (const col of ['pago_devolucion_automatica', 'pago_config_json', 'pago_proveedor']) {
      if (t && t.findColumnByName(col)) await queryRunner.dropColumn('tienda_online_config', col);
    }
  }
}
