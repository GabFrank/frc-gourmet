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
 * Cobro parcial por ítems (PdV).
 *
 * - `venta_items.monto_cubierto`: cobertura acumulada EN BRUTO por ítem (cache).
 * - `pagos_detalles.cobro_parcial_id`: ronda que originó cada línea de pago.
 * - `cobros_parciales`: ronda de cobro parcial (anulable) con factor y cash.
 * - `cobro_parcial_items`: imputación en bruto de cada ronda sobre un ítem.
 *
 * Portable SQLite/Postgres, aditiva. Ver docs/PLAN-COBRO-PARCIAL-POR-ITEMS.md.
 */
export class AddCobroParcialPorItems1783805921597 implements MigrationInterface {
  name = 'AddCobroParcialPorItems1783805921597';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const tsNow = isPg ? 'TIMESTAMP NOT NULL DEFAULT now()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    const bool = (d: boolean) => (isPg ? `boolean NOT NULL DEFAULT ${d}` : `boolean NOT NULL DEFAULT ${d ? 1 : 0}`);
    const audit = `
      "created_at" ${tsNow},
      "updated_at" ${tsNow},
      "created_by" integer NULL,
      "updated_by" integer NULL
    `;

    // 1) Columnas nuevas en tablas existentes
    if (!(await hasColumn(queryRunner, 'venta_items', 'monto_cubierto', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "venta_items" ADD COLUMN "monto_cubierto" numeric(10,2) NOT NULL DEFAULT 0`,
      );
    }
    if (!(await hasColumn(queryRunner, 'pagos_detalles', 'cobro_parcial_id', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "pagos_detalles" ADD COLUMN "cobro_parcial_id" integer NULL`,
      );
    }

    // 2) Tabla de rondas de cobro parcial
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cobros_parciales" (
        "id" ${pk},
        "venta_id" integer NOT NULL,
        "usuario_id" integer NULL,
        "fecha" ${ts} NOT NULL,
        "factor_aplicado" numeric(10,6) NOT NULL DEFAULT 1,
        "cash_total" numeric(10,2) NOT NULL DEFAULT 0,
        "activo" ${bool(true)},
        ${audit}
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cobros_parciales_venta" ON "cobros_parciales" ("venta_id")`,
    );

    // 3) Tabla de imputaciones (item ↔ ronda, en bruto)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cobro_parcial_items" (
        "id" ${pk},
        "cobro_parcial_id" integer NOT NULL,
        "venta_item_id" integer NOT NULL,
        "bruto_cubierto" numeric(10,2) NOT NULL DEFAULT 0,
        "cantidad" numeric(10,3) NULL,
        ${audit}
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cobro_parcial_items_ronda" ON "cobro_parcial_items" ("cobro_parcial_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_cobro_parcial_items_item" ON "cobro_parcial_items" ("venta_item_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cobro_parcial_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cobros_parciales"`);
    try {
      await queryRunner.query(`ALTER TABLE "pagos_detalles" DROP COLUMN "cobro_parcial_id"`);
      await queryRunner.query(`ALTER TABLE "venta_items" DROP COLUMN "monto_cubierto"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
