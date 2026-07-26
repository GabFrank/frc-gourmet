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
 * Pedidos en Mesa por QR (MESA_QR autoservicio) — Fase 1 (datos + config).
 *
 * `pdv_mesas`:
 * - `qr_token`: token opaco (UUID) codificado en el QR estático de la mesa; la
 *   mesa se resuelve por este token, nunca por el número. Índice único (los NULL
 *   no colisionan ni en SQLite ni en Postgres).
 * - `autoservicio_activo`: gate del cajero — la mesa solo acepta pedidos MESA_QR
 *   mientras esté habilitada.
 *
 * `tienda_online_config`:
 * - `permite_mesa`: habilita el canal MESA_QR.
 * - `requiere_lan_mesa`: exige que el pedido MESA_QR venga de la red del local
 *   (validación de IP de origen; el alpha está expuesto a internet).
 * - `rango_lan_mesa`: CIDRs permitidos separados por coma.
 *
 * Aditiva, idempotente y portable SQLite/Postgres.
 */
export class AddMesaQrAutoservicio1785082533104 implements MigrationInterface {
  name = 'AddMesaQrAutoservicio1785082533104';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const boolDef = isPg ? 'false' : '0';

    // --- pdv_mesas ---
    if (!(await hasColumn(queryRunner, 'pdv_mesas', 'qr_token', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "pdv_mesas" ADD COLUMN "qr_token" varchar(64) NULL`,
      );
    }
    // Índice único aparte: SQLite no soporta agregar columna UNIQUE vía ALTER TABLE.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_pdv_mesas_qr_token" ON "pdv_mesas" ("qr_token")`,
    );
    if (!(await hasColumn(queryRunner, 'pdv_mesas', 'autoservicio_activo', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "pdv_mesas" ADD COLUMN "autoservicio_activo" boolean NOT NULL DEFAULT ${boolDef}`,
      );
    }

    // --- tienda_online_config ---
    if (!(await hasColumn(queryRunner, 'tienda_online_config', 'permite_mesa', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "tienda_online_config" ADD COLUMN "permite_mesa" boolean NOT NULL DEFAULT ${boolDef}`,
      );
    }
    if (!(await hasColumn(queryRunner, 'tienda_online_config', 'requiere_lan_mesa', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "tienda_online_config" ADD COLUMN "requiere_lan_mesa" boolean NOT NULL DEFAULT ${isPg ? 'true' : '1'}`,
      );
    }
    if (!(await hasColumn(queryRunner, 'tienda_online_config', 'rango_lan_mesa', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "tienda_online_config" ADD COLUMN "rango_lan_mesa" varchar(255) NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_pdv_mesas_qr_token"`);
    try {
      await queryRunner.query(`ALTER TABLE "tienda_online_config" DROP COLUMN "rango_lan_mesa"`);
      await queryRunner.query(`ALTER TABLE "tienda_online_config" DROP COLUMN "requiere_lan_mesa"`);
      await queryRunner.query(`ALTER TABLE "tienda_online_config" DROP COLUMN "permite_mesa"`);
      await queryRunner.query(`ALTER TABLE "pdv_mesas" DROP COLUMN "autoservicio_activo"`);
      await queryRunner.query(`ALTER TABLE "pdv_mesas" DROP COLUMN "qr_token"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
