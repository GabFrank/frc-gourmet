import { MigrationInterface, QueryRunner } from 'typeorm';
import { FORMA_PAGO_DINELCO } from '../entities/pedidos-online/pedido-online.enums';

/**
 * dinelco Checkout embebido (PLAN-tienda-pagos-dinelco): forma de pago «DINELCO ONLINE», inactiva
 * como las otras online. Las cuentas van en `formas_pago_online` y lo del intento en
 * `pedidos_online.pago_datos_json`, que ya existen.
 *
 * ESTRICTAMENTE ADITIVO.
 */
export class TiendaPagoDinelco1794900000000 implements MigrationInterface {
  name = 'TiendaPagoDinelco1794900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const B = (v: boolean) => (isPg ? (v ? 'true' : 'false') : v ? '1' : '0');
    const fp = await queryRunner.query(`SELECT id FROM "formas_pago" WHERE "nombre" = '${FORMA_PAGO_DINELCO}'`);
    if (!fp.length) {
      await queryRunner.query(
        `INSERT INTO "formas_pago" ("nombre", "activo", "movimenta_caja", "principal", "orden") VALUES ('${FORMA_PAGO_DINELCO}', ${B(false)}, ${B(false)}, ${B(false)}, 99)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Solo si nunca se usó en una venta.
    await queryRunner.query(
      `DELETE FROM "formas_pago" WHERE "nombre" = '${FORMA_PAGO_DINELCO}' AND "id" NOT IN (SELECT "forma_pago_id" FROM "pagos_detalles" WHERE "forma_pago_id" IS NOT NULL)`,
    );
  }
}
