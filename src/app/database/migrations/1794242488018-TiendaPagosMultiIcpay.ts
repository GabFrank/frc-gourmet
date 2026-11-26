import { MigrationInterface, QueryRunner } from 'typeorm';
import { FORMA_PAGO_ICPAY } from '../entities/pedidos-online/pedido-online.enums';

/**
 * Formas de pago online (cuentas de proveedores) + IC Pay (PLAN-tienda-pagos-multi-icpay).
 *
 * - `formas_pago_online`: una fila por CUENTA de un proveedor (puede haber varias del mismo:
 *   dos cuentas de IC Pay, Bancard y dinelco a la vez). Nombre para el cliente, orden, activa,
 *   retiro/delivery y los datos NO secretos (`config_json`). Los secretos van al almacén seguro
 *   por cuenta.
 * - Conversión: el proveedor que estaba elegido (`tienda_online_config.pago_proveedor` +
 *   `pago_config_json`) pasa a ser la primera cuenta, marcada `_legado` para seguir leyendo sus
 *   secretos de antes. Sin proveedor elegido no se crea nada (la tienda sigue como antes).
 * - `pedidos_online.forma_pago_online_id`: con qué cuenta se cobró (se consulta y devuelve con esa).
 * - `pedidos_online.pago_datos_json`: lo que el proveedor devolvió al crear el cobro (QR Pix, USD).
 * - Forma de pago «PIX ONLINE», inactiva como las otras online.
 *
 * ESTRICTAMENTE ADITIVO.
 */
const ETIQUETAS: Record<string, string> = { UPAY: 'TARJETA — UPAY', BANCARD: 'TARJETA — BANCARD', ICPAY: 'PIX (BRASIL)' };

export class TiendaPagosMultiIcpay1794242488018 implements MigrationInterface {
  name = 'TiendaPagosMultiIcpay1794242488018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const agregar = async (tabla: string, col: string, tipo: string) => {
      const t = await queryRunner.getTable(tabla);
      if (t && !t.findColumnByName(col)) await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${col}" ${tipo}`);
    };
    const B = (v: boolean) => (isPg ? (v ? 'true' : 'false') : v ? '1' : '0');
    const id = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const ts = isPg ? 'TIMESTAMP NOT NULL DEFAULT now()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "formas_pago_online" (
      "id" ${id},
      "created_at" ${ts},
      "updated_at" ${ts},
      "created_by" integer NULL,
      "updated_by" integer NULL,
      "proveedor" varchar(20) NOT NULL,
      "nombre" varchar(80) NOT NULL,
      "activo" boolean NOT NULL DEFAULT ${B(true)},
      "orden" integer NOT NULL DEFAULT 0,
      "permite_pickup" boolean NOT NULL DEFAULT ${B(true)},
      "permite_delivery" boolean NOT NULL DEFAULT ${B(true)},
      "config_json" text NULL
    )`);
    await agregar('pedidos_online', 'forma_pago_online_id', 'integer NULL');
    await agregar('pedidos_online', 'pago_datos_json', 'text NULL');

    // El proveedor elegido hasta ahora pasa a ser la primera cuenta.
    const hay = await queryRunner.query(`SELECT COUNT(*) AS n FROM "formas_pago_online"`);
    if (!Number(hay[0]?.n ?? 0)) {
      const cfg = (await queryRunner.query(
        `SELECT "pago_proveedor", "pago_config_json", "upay_merchant_id" FROM "tienda_online_config" ORDER BY "id" ASC LIMIT 1`,
      ))[0];
      const prov = String(cfg?.pago_proveedor || (cfg?.upay_merchant_id ? 'UPAY' : '')).toUpperCase();
      if (ETIQUETAS[prov]) {
        let todo: any = {};
        try { todo = cfg?.pago_config_json ? JSON.parse(cfg.pago_config_json) : {}; } catch { todo = {}; }
        const conf = { ...(todo && typeof todo === 'object' ? todo[prov] || {} : {}), _legado: '1' };
        const ph = isPg ? ['$1', '$2', '$3'] : ['?', '?', '?'];
        await queryRunner.query(
          `INSERT INTO "formas_pago_online" ("proveedor", "nombre", "activo", "orden", "permite_pickup", "permite_delivery", "config_json") VALUES (${ph[0]}, ${ph[1]}, ${B(true)}, 1, ${B(true)}, ${B(true)}, ${ph[2]})`,
          [prov, ETIQUETAS[prov], JSON.stringify(conf)],
        );
      }
    }

    const fp = await queryRunner.query(`SELECT id FROM "formas_pago" WHERE "nombre" = '${FORMA_PAGO_ICPAY}'`);
    if (!fp.length) {
      await queryRunner.query(
        `INSERT INTO "formas_pago" ("nombre", "activo", "movimenta_caja", "principal", "orden") VALUES ('${FORMA_PAGO_ICPAY}', ${B(false)}, ${B(false)}, ${B(false)}, 99)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "formas_pago" WHERE "nombre" = '${FORMA_PAGO_ICPAY}' AND "id" NOT IN (SELECT "forma_pago_id" FROM "pagos_detalles" WHERE "forma_pago_id" IS NOT NULL)`,
    );
    for (const col of ['pago_datos_json', 'forma_pago_online_id']) {
      const t = await queryRunner.getTable('pedidos_online');
      if (t && t.findColumnByName(col)) await queryRunner.dropColumn('pedidos_online', col);
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "formas_pago_online"`);
  }
}
