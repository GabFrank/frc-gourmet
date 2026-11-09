import { MigrationInterface, QueryRunner } from 'typeorm';
import { FORMA_PAGO_ICPAY } from '../entities/pedidos-online/pedido-online.enums';

/**
 * Varios proveedores de pago a la vez + IC Pay (PLAN-tienda-pagos-multi-icpay).
 *
 * - `tienda_online_config.pago_proveedores`: JSON con los proveedores prendidos
 *   (`["BANCARD","ICPAY"]`). Vacío = se lee `pago_proveedor` como antes.
 * - `pedidos_online.pago_datos_json`: lo que el proveedor devolvió al crear el cobro y hace falta
 *   para mostrarlo de nuevo o verificarlo (QR Pix, monto en USD, cotización). No secreto.
 * - Forma de pago «PIX ONLINE», inactiva como las otras online: solo la usa la materialización.
 *
 * ESTRICTAMENTE ADITIVO.
 */
export class TiendaPagosMultiIcpay1794242488018 implements MigrationInterface {
  name = 'TiendaPagosMultiIcpay1794242488018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const agregar = async (tabla: string, col: string, tipo: string) => {
      const t = await queryRunner.getTable(tabla);
      if (t && !t.findColumnByName(col)) await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${col}" ${tipo}`);
    };
    await agregar('tienda_online_config', 'pago_proveedores', 'text NULL');
    await agregar('pedidos_online', 'pago_datos_json', 'text NULL');

    const fp = await queryRunner.query(`SELECT id FROM "formas_pago" WHERE "nombre" = '${FORMA_PAGO_ICPAY}'`);
    if (!fp.length) {
      await queryRunner.query(
        `INSERT INTO "formas_pago" ("nombre", "activo", "movimenta_caja", "principal", "orden") VALUES ('${FORMA_PAGO_ICPAY}', ${isPg ? 'false' : '0'}, ${isPg ? 'false' : '0'}, ${isPg ? 'false' : '0'}, 99)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "formas_pago" WHERE "nombre" = '${FORMA_PAGO_ICPAY}' AND "id" NOT IN (SELECT "forma_pago_id" FROM "pagos_detalles" WHERE "forma_pago_id" IS NOT NULL)`,
    );
    for (const [tabla, col] of [['pedidos_online', 'pago_datos_json'], ['tienda_online_config', 'pago_proveedores']]) {
      const t = await queryRunner.getTable(tabla);
      if (t && t.findColumnByName(col)) await queryRunner.dropColumn(tabla, col);
    }
  }
}
