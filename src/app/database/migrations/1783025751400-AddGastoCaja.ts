import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla `gastos_caja`: gastos pagados con el efectivo de la caja de venta (PdV).
 * Aditiva y portable SQLite/Postgres.
 */
export class AddGastoCaja1783025751400 implements MigrationInterface {
  name = 'AddGastoCaja1783025751400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "gastos_caja" (
          "id" SERIAL PRIMARY KEY,
          "caja_id" integer NOT NULL,
          "gasto_categoria_id" integer NULL,
          "descripcion" varchar(255) NOT NULL,
          "monto" numeric(18,2) NOT NULL,
          "moneda_id" integer NULL,
          "forma_pago_id" integer NULL,
          "fecha" TIMESTAMP NOT NULL DEFAULT now(),
          "estado" varchar NOT NULL DEFAULT 'ACTIVO',
          "motivo_anulacion" text NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_gastos_caja_caja_id" ON "gastos_caja" ("caja_id")`);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "gastos_caja" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "caja_id" integer NOT NULL,
          "gasto_categoria_id" integer NULL,
          "descripcion" varchar(255) NOT NULL,
          "monto" numeric(18,2) NOT NULL,
          "moneda_id" integer NULL,
          "forma_pago_id" integer NULL,
          "fecha" datetime NOT NULL DEFAULT (datetime('now')),
          "estado" varchar NOT NULL DEFAULT 'ACTIVO',
          "motivo_anulacion" text NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_gastos_caja_caja_id" ON "gastos_caja" ("caja_id")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "gastos_caja"`);
  }
}
