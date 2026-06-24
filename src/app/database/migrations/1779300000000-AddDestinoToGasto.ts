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
 * Permite que un Gasto se pague desde una cuenta bancaria (no solo desde la
 * caja mayor). Agrega:
 *   - `destino_tipo` (varchar) — 'CAJA_MAYOR' (default, comportamiento histórico)
 *     o 'CUENTA_BANCARIA' (debita `cuentas_bancarias.saldo`, no afecta caja).
 *   - `cuenta_bancaria_id` (int nullable) — FK lógica (sin constraint, mirror del
 *     patrón de `cajaMayor` en esta misma entity).
 *
 * `caja_mayor_id` se mantiene NOT NULL: en modo CUENTA_BANCARIA igual se guarda
 * desde qué caja se registró el gasto (metadata), aunque no impacte saldos.
 * Asi evitamos un ALTER COLUMN nullable que en SQLite obligaria a recrear tabla.
 *
 * Filas existentes: TypeORM aplica el default 'CAJA_MAYOR' → comportamiento
 * intacto para los gastos previos.
 */
export class AddDestinoToGasto1779300000000 implements MigrationInterface {
  name = 'AddDestinoToGasto1779300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    // Idempotente y locale-independiente: chequear existencia ANTES de agregar
    // (no por texto del error, que en Postgres viene traducido — ej. "ya existe
    // la columna" en es_ES — y rompía el guard por regex).
    const addCol = async (col: string, type: string) => {
      if (await hasColumn(queryRunner, 'gastos', col, isPg)) return;
      await queryRunner.query(`ALTER TABLE "gastos" ADD COLUMN "${col}" ${type}`);
    };
    await addCol('destino_tipo', `varchar(30) DEFAULT 'CAJA_MAYOR' NOT NULL`);
    await addCol('cuenta_bancaria_id', 'integer NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`ALTER TABLE "gastos" DROP COLUMN IF EXISTS "cuenta_bancaria_id"`);
      await queryRunner.query(`ALTER TABLE "gastos" DROP COLUMN IF EXISTS "destino_tipo"`);
    } else {
      try { await queryRunner.query(`ALTER TABLE "gastos" DROP COLUMN "cuenta_bancaria_id"`); } catch { /* SQLite viejo */ }
      try { await queryRunner.query(`ALTER TABLE "gastos" DROP COLUMN "destino_tipo"`); } catch { /* SQLite viejo */ }
    }
  }
}
