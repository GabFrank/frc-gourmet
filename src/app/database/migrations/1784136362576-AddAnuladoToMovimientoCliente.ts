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
 * M-01: marca de reversión en movimientos_cliente.
 *
 * `movimientos_cliente.anulado` permite que anular-cobro-cpc-cuota sea
 * idempotente: al anular un cobro (PAGO) acreditado a cuenta bancaria se marca
 * el PAGO como anulado; una segunda llamada lo detecta y no vuelve a revertir el
 * saldo. Aditiva y portable SQLite/Postgres. Las filas existentes quedan en
 * false (ningún cobro previo estaba marcado como revertido).
 */
export class AddAnuladoToMovimientoCliente1784136362576 implements MigrationInterface {
  name = 'AddAnuladoToMovimientoCliente1784136362576';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const boolFalse = isPg ? 'boolean NOT NULL DEFAULT false' : 'boolean NOT NULL DEFAULT 0';

    if (!(await hasColumn(queryRunner, 'movimientos_cliente', 'anulado', isPg))) {
      await queryRunner.query(
        `ALTER TABLE "movimientos_cliente" ADD COLUMN "anulado" ${boolFalse}`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    // SQLite no soporta DROP COLUMN en versiones viejas; solo lo intentamos en PG.
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "movimientos_cliente" DROP COLUMN IF EXISTS "anulado"`);
    }
  }
}
