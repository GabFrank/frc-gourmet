import { MigrationInterface, QueryRunner } from 'typeorm';

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
    // Idempotente: ignorar si la columna ya existe (DB con drift de synchronize).
    const addCol = async (sql: string) => {
      try {
        await queryRunner.query(sql);
      } catch (e: any) {
        if (!/duplicate column|already exists/i.test(e?.message || '')) throw e;
      }
    };
    await addCol(
      `ALTER TABLE "gastos" ADD COLUMN "destino_tipo" varchar(30) DEFAULT 'CAJA_MAYOR' NOT NULL`,
    );
    await addCol(
      `ALTER TABLE "gastos" ADD COLUMN "cuenta_bancaria_id" integer NULL`,
    );
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
