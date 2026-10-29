import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online F4 (docs/planes/PLAN-tienda-online.md): pago online con uPay.
 *
 * ESTRICTAMENTE ADITIVO: columnas nullable (o con default) en `pedidos_online` y
 * `tienda_online_config`, tabla `pagos_online_eventos` e índice único parcial de `pago_id`.
 * `pago_online_activo` nace en false: la migración no cambia nada en el local.
 *
 * El `down` ABORTA si hay algún pago registrado: perder la referencia de un cobro real
 * impediría devolverlo. Con pagos reales la vuelta atrás es revertir el código (las
 * columnas quedan y no molestan).
 */
const COLS_PEDIDO: Array<[string, string]> = [
  ['estado_pago', 'varchar(30) NULL'],
  ['pago_proveedor', 'varchar(20) NULL'],
  ['pago_intento', 'integer NULL'],
  ['pago_idem_key', 'varchar(64) NULL'],
  ['pago_sesion_id', 'varchar(64) NULL'],
  ['pago_checkout_url', 'varchar(500) NULL'],
  ['pago_id', 'varchar(64) NULL'],
  ['pago_monto', 'decimal(18,2) NULL'],
  ['pago_expira_en', 'TIMESTAMP NULL'],
  ['pago_ultima_consulta', 'TIMESTAMP NULL'],
  ['pago_detalle', 'varchar(255) NULL'],
  ['pagado_en', 'TIMESTAMP NULL'],
  ['pago_aviso_sin_aceptar', 'boolean NOT NULL DEFAULT false'],
];
const COLS_CONFIG: Array<[string, string]> = [
  ['pago_online_activo', 'boolean NOT NULL DEFAULT false'],
  ['upay_base_url', 'varchar(255) NULL'],
  ['upay_merchant_id', 'varchar(64) NULL'],
  ['upay_merchant_nombre', 'varchar(150) NULL'],
  ['minutos_aviso_pagado_sin_aceptar', 'integer NOT NULL DEFAULT 20'],
];

export class TiendaPagoOnline1793500000000 implements MigrationInterface {
  name = 'TiendaPagoOnline1793500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const tipo = (t: string) => (isPg ? t : t.replace('TIMESTAMP', 'datetime').replace('DEFAULT false', 'DEFAULT 0'));
    const agregar = async (tabla: string, cols: Array<[string, string]>) => {
      const existentes: string[] = isPg
        ? []
        : ((await queryRunner.query(`PRAGMA table_info("${tabla}")`)) as any[]).map((c) => c.name);
      for (const [col, t] of cols) {
        if (isPg) await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN IF NOT EXISTS "${col}" ${tipo(t)}`);
        else if (!existentes.includes(col)) await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${col}" ${tipo(t)}`);
      }
    };
    await agregar('pedidos_online', COLS_PEDIDO);
    await agregar('tienda_online_config', COLS_CONFIG);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pedidos_online_pago_id" ON "pedidos_online" ("pago_proveedor", "pago_id") WHERE "pago_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pedidos_online_estado_pago" ON "pedidos_online" ("estado_pago")`,
    );

    const id = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const ts = isPg ? 'TIMESTAMP NOT NULL DEFAULT now()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "pagos_online_eventos" (
      "id" ${id},
      "created_at" ${ts},
      "updated_at" ${ts},
      "created_by" integer NULL,
      "updated_by" integer NULL,
      "pedido_online_id" integer NOT NULL,
      "intento" integer NULL,
      "tipo" varchar(30) NOT NULL,
      "estado_proveedor" varchar(60) NULL,
      "respuesta" text NULL
    )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_pagos_online_eventos_pedido" ON "pagos_online_eventos" ("pedido_online_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [{ n }] = await queryRunner.query(
      `SELECT COUNT(*) AS n FROM "pedidos_online" WHERE "pago_id" IS NOT NULL OR "estado_pago" IS NOT NULL`,
    );
    if (Number(n) > 0) {
      throw new Error(
        `TiendaPagoOnline down abortado: hay ${n} pedido(s) con pago online registrado. ` +
          'Revertí el código y dejá las columnas (ver PLAN-tienda-online F4).',
      );
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pagos_online_eventos_pedido"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pagos_online_eventos"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pedidos_online_estado_pago"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_pedidos_online_pago_id"`);
    for (const [col] of [...COLS_CONFIG].reverse()) {
      await queryRunner.query(`ALTER TABLE "tienda_online_config" DROP COLUMN "${col}"`);
    }
    for (const [col] of [...COLS_PEDIDO].reverse()) {
      await queryRunner.query(`ALTER TABLE "pedidos_online" DROP COLUMN "${col}"`);
    }
  }
}
