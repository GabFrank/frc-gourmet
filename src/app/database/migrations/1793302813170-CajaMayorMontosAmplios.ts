import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Caja Mayor: `cajas_mayor_movimientos.monto` y `cajas_mayor_saldos.saldo`
 * pasan de numeric(10,2) a numeric(18,2).
 *
 * Con (10,2) el máximo es 99.999.999,99: en guaraníes, el saldo acumulado de la
 * caja mayor de un local llega a eso, y Postgres rechaza el movimiento con
 * `numeric field overflow` (issue #340). Cuenta bancaria ya era (14,2) y
 * funcionario/cliente (18,2).
 *
 * Sólo Postgres: SQLite no fija precisión ni escala (mismo criterio que
 * AddBuffetPorPeso). Ampliar es seguro: ningún valor existente deja de entrar.
 *
 * Ver docs/MIGRATIONS.md.
 */
export class CajaMayorMontosAmplios1793302813170 implements MigrationInterface {
  name = 'CajaMayorMontosAmplios1793302813170';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.connection.options.type !== 'postgres') return;
    await queryRunner.query(`ALTER TABLE "cajas_mayor_movimientos" ALTER COLUMN "monto" TYPE numeric(18,2)`);
    await queryRunner.query(`ALTER TABLE "cajas_mayor_saldos" ALTER COLUMN "saldo" TYPE numeric(18,2)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se achica: volver a (10,2) fallaría con cualquier saldo que ya supere
    // el máximo viejo, y perdería datos. Estrategia de 2 versiones si hiciera falta.
  }
}
