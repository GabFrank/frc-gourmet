import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Jornada comercial: hora en que arranca "un día" para el negocio.
 *
 * Los turnos noche cruzan las 00:00 y llegan hasta las 02:00, así que el día
 * calendario partía las ventas de un mismo turno en dos. Con 7, la jornada del
 * día D va de `D 07:00` a `D+1 06:59:59.999`.
 *
 * Aditiva. `pdv_config` es singleton, así que la fila existente toma el default
 * al aplicar el ALTER. ⚠️ Eso CAMBIA números históricos: una venta de la 01:00
 * pasa del día N al N−1 en todos los dashboards. Poner 0 restaura el día
 * calendario sin desplegar nada.
 */
export class InicioJornadaHora1787563118200 implements MigrationInterface {
  name = 'InicioJornadaHora1787563118200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const esPostgres = queryRunner.connection.options.type === 'postgres';

    if (esPostgres) {
      await queryRunner.query(
        `ALTER TABLE "pdv_config" ADD COLUMN IF NOT EXISTS "inicio_jornada_hora" integer NOT NULL DEFAULT 7`,
      );
      return;
    }

    // SQLite no soporta `ADD COLUMN ... IF NOT EXISTS`: se consulta el esquema.
    const tabla = await queryRunner.getTable('pdv_config');
    if (tabla && !tabla.columns.find((c) => c.name === 'inicio_jornada_hora')) {
      await queryRunner.query(
        `ALTER TABLE "pdv_config" ADD COLUMN "inicio_jornada_hora" integer NOT NULL DEFAULT (7)`,
      );
    }
  }

  public async down(): Promise<void> {
    // Aditiva: no se dropea la columna (política del proyecto, ver docs/MIGRATIONS.md).
  }
}
