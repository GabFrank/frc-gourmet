import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla `egresos_caja`: vales/compras pagados con el efectivo de la caja de
 * venta (PdV). Análoga a `gastos_caja`. Aditiva y portable SQLite/Postgres.
 */
export class AddEgresoCaja1784664715714 implements MigrationInterface {
  name = 'AddEgresoCaja1784664715714';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "egresos_caja" (
          "id" SERIAL PRIMARY KEY,
          "caja_id" integer NOT NULL,
          "tipo" varchar(20) NOT NULL,
          "monto" numeric(18,2) NOT NULL,
          "moneda_id" integer NULL,
          "forma_pago_id" integer NULL,
          "vale_id" integer NULL,
          "vale_creado" boolean NOT NULL DEFAULT false,
          "cuenta_por_pagar_cuota_id" integer NULL,
          "descripcion" varchar(255) NULL,
          "fecha" TIMESTAMP NOT NULL DEFAULT now(),
          "estado" varchar NOT NULL DEFAULT 'ACTIVO',
          "motivo_anulacion" text NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_egresos_caja_caja_id" ON "egresos_caja" ("caja_id")`);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "egresos_caja" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "caja_id" integer NOT NULL,
          "tipo" varchar(20) NOT NULL,
          "monto" numeric(18,2) NOT NULL,
          "moneda_id" integer NULL,
          "forma_pago_id" integer NULL,
          "vale_id" integer NULL,
          "vale_creado" boolean NOT NULL DEFAULT (0),
          "cuenta_por_pagar_cuota_id" integer NULL,
          "descripcion" varchar(255) NULL,
          "fecha" datetime NOT NULL DEFAULT (datetime('now')),
          "estado" varchar NOT NULL DEFAULT 'ACTIVO',
          "motivo_anulacion" text NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_egresos_caja_caja_id" ON "egresos_caja" ("caja_id")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "egresos_caja"`);
  }
}
