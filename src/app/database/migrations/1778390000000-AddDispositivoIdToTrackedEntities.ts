import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * F5 — agrega `dispositivo_id INTEGER NULLABLE` a entities relevantes para
 * audit por dispositivo (multi-tenant).
 *
 * Tablas afectadas: ventas, compras, conteos, comandas.
 * (caja ya tenia dispositivo_id desde antes, no se toca.)
 *
 * Migracion driver-aware: SQLite y Postgres usan SQL ALTER TABLE casi
 * identico; la diferencia esta en como agregar la FK constraint. SQLite
 * desde 3.6+ acepta ADD COLUMN sin FK constraint inline si la tabla ya
 * existe — agregar FK requiere recrear tabla. Por simplicidad, dejamos
 * la columna sin FK declarada en SQLite (TypeORM aun puede join via
 * relationships). Postgres soporta ADD COLUMN + ADD CONSTRAINT en
 * pasos separados — lo hacemos a mano.
 */
export class AddDispositivoIdToTrackedEntities1778390000000 implements MigrationInterface {
  name = 'AddDispositivoIdToTrackedEntities1778390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const tables = ['ventas', 'compras', 'conteos', 'comandas'];

    if (isPg) {
      for (const t of tables) {
        await queryRunner.query(`ALTER TABLE "${t}" ADD COLUMN "dispositivo_id" integer NULL`);
        await queryRunner.query(
          `ALTER TABLE "${t}" ADD CONSTRAINT "FK_${t}_dispositivo_id" ` +
          `FOREIGN KEY ("dispositivo_id") REFERENCES "dispositivos"("id") ` +
          `ON DELETE NO ACTION ON UPDATE NO ACTION`,
        );
      }
    } else {
      // SQLite — ADD COLUMN sin FK inline (FK se aplica logicamente via TypeORM)
      for (const t of tables) {
        await queryRunner.query(`ALTER TABLE "${t}" ADD COLUMN "dispositivo_id" integer`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const tables = ['ventas', 'compras', 'conteos', 'comandas'];

    if (isPg) {
      for (const t of tables) {
        await queryRunner.query(`ALTER TABLE "${t}" DROP CONSTRAINT IF EXISTS "FK_${t}_dispositivo_id"`);
        await queryRunner.query(`ALTER TABLE "${t}" DROP COLUMN IF EXISTS "dispositivo_id"`);
      }
    } else {
      // SQLite >=3.35 soporta DROP COLUMN
      for (const t of tables) {
        await queryRunner.query(`ALTER TABLE "${t}" DROP COLUMN "dispositivo_id"`);
      }
    }
  }
}
