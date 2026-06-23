import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Venta de días de vacaciones (`vacacion_ventas`). El funcionario vende días no
 * gozados y se le pagan como HABER en la liquidación de sueldo.
 *
 * Driver-aware: SQLite usa `datetime` + `integer PRIMARY KEY AUTOINCREMENT`,
 * Postgres usa `TIMESTAMP` + `SERIAL`. FK solo en Postgres.
 */
export class AddVacacionVentas1779600000000 implements MigrationInterface {
  name = 'AddVacacionVentas1779600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const tsDefault = isPg ? 'now()' : "(datetime('now'))";
    const fk = isPg
      ? `, CONSTRAINT "FK_vacacion_ventas_vacacion" FOREIGN KEY ("vacacion_id") REFERENCES "vacaciones"("id")`
      : '';

    await queryRunner.query(`
      CREATE TABLE "vacacion_ventas" (
        "id" ${pk},
        "vacacion_id" integer NOT NULL,
        "dias" integer NOT NULL,
        "monto" numeric(18,2) NOT NULL DEFAULT 0,
        "fecha" ${ts} NOT NULL,
        "estado" varchar(20) NOT NULL DEFAULT 'PENDIENTE',
        "liquidacion_id" integer NULL,
        "observacion" text NULL,
        "created_at" ${ts} NOT NULL DEFAULT ${tsDefault},
        "updated_at" ${ts} NOT NULL DEFAULT ${tsDefault},
        "created_by" integer NULL,
        "updated_by" integer NULL${fk}
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_vacacion_ventas_vacacion" ON "vacacion_ventas" ("vacacion_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "vacacion_ventas"`);
  }
}
