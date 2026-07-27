import { MigrationInterface, QueryRunner } from 'typeorm';

/** Chequeo de columna existente, independiente del driver. */
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
 * Orden persistente de las cuentas bancarias en la configuración de Caja Mayor.
 *
 * `caja_mayor_configuraciones.cuentas_bancarias_orden`: texto con un array JSON
 * de ids de cuenta bancaria en el orden elegido por el usuario (drag & drop en
 * el diálogo de configuración). El sidebar de `caja-mayor-detalle` ordena las
 * cards de cuentas bancarias por este array. La M:M `cuentasBancariasVisibles`
 * sigue definiendo QUÉ cuentas se muestran (sin orden confiable); esta columna
 * define el ORDEN. NULL o ids faltantes → se caen al final por id ascendente.
 *
 * Aditiva, idempotente y portable SQLite/Postgres.
 */
export class AddCuentasBancariasOrdenCajaMayorConfig1785170062316 implements MigrationInterface {
  name = 'AddCuentasBancariasOrdenCajaMayorConfig1785170062316';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (!(await hasColumn(queryRunner, 'caja_mayor_configuraciones', 'cuentas_bancarias_orden', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "caja_mayor_configuraciones" ADD COLUMN "cuentas_bancarias_orden" text NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(
        `ALTER TABLE "caja_mayor_configuraciones" DROP COLUMN "cuentas_bancarias_orden"`,
      );
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN).
    }
  }
}
