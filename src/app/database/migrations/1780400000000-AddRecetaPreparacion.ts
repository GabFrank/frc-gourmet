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
 * Recetas avanzadas (Fase A):
 * - `receta`: agrega `tiempo_preparo` (min) e `image_url` (foto del producto final).
 * - `receta_ingrediente`: agrega `descripcion` (ítem sin ingrediente vinculado) y
 *   relaja NOT NULL de `ingrediente_id`, `cantidad`, `unidad` (en Postgres; en
 *   SQLite dev lo aplica synchronize).
 * - Nuevas tablas: `receta_material`, `receta_fase`, `receta_fase_ingrediente`.
 *
 * Portable SQLite/Postgres. Idempotente.
 */
export class AddRecetaPreparacion1780400000000 implements MigrationInterface {
  name = 'AddRecetaPreparacion1780400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // --- receta: tiempo_preparo + image_url ---
    if (!(await hasColumn(queryRunner, 'receta', 'tiempo_preparo', isPg))) {
      await queryRunner.query(`ALTER TABLE "receta" ADD COLUMN "tiempo_preparo" integer`);
    }
    if (!(await hasColumn(queryRunner, 'receta', 'image_url', isPg))) {
      await queryRunner.query(`ALTER TABLE "receta" ADD COLUMN "image_url" varchar(500)`);
    }

    // --- receta_ingrediente: descripcion + relajar NOT NULL ---
    if (!(await hasColumn(queryRunner, 'receta_ingrediente', 'descripcion', isPg))) {
      await queryRunner.query(`ALTER TABLE "receta_ingrediente" ADD COLUMN "descripcion" text`);
    }
    if (isPg) {
      // En Postgres se puede relajar el NOT NULL sin recrear la tabla.
      await queryRunner.query(`ALTER TABLE "receta_ingrediente" ALTER COLUMN "ingrediente_id" DROP NOT NULL`);
      await queryRunner.query(`ALTER TABLE "receta_ingrediente" ALTER COLUMN "cantidad" DROP NOT NULL`);
      await queryRunner.query(`ALTER TABLE "receta_ingrediente" ALTER COLUMN "unidad" DROP NOT NULL`);
    }
    // En SQLite (dev) el cambio de nullability lo aplica synchronize:true.

    // --- receta_material ---
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "receta_material" (
          "id" SERIAL PRIMARY KEY,
          "descripcion" varchar(255) NOT NULL,
          "orden" integer NOT NULL DEFAULT 0,
          "activo" boolean NOT NULL DEFAULT true,
          "receta_id" integer NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "receta_material" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "descripcion" varchar(255) NOT NULL,
          "orden" integer NOT NULL DEFAULT 0,
          "activo" boolean NOT NULL DEFAULT 1,
          "receta_id" integer NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    }

    // --- receta_fase ---
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "receta_fase" (
          "id" SERIAL PRIMARY KEY,
          "orden" integer NOT NULL DEFAULT 0,
          "titulo" varchar(255) NULL,
          "descripcion" text NOT NULL,
          "activo" boolean NOT NULL DEFAULT true,
          "receta_id" integer NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "receta_fase" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "orden" integer NOT NULL DEFAULT 0,
          "titulo" varchar(255) NULL,
          "descripcion" text NOT NULL,
          "activo" boolean NOT NULL DEFAULT 1,
          "receta_id" integer NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    }

    // --- receta_fase_ingrediente (join fase ↔ ítem de receta) ---
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "receta_fase_ingrediente" (
          "id" SERIAL PRIMARY KEY,
          "fase_id" integer NULL,
          "receta_ingrediente_id" integer NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "receta_fase_ingrediente" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "fase_id" integer NULL,
          "receta_ingrediente_id" integer NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "receta_fase_ingrediente"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "receta_fase"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "receta_material"`);
    try {
      await queryRunner.query(`ALTER TABLE "receta_ingrediente" DROP COLUMN "descripcion"`);
      await queryRunner.query(`ALTER TABLE "receta" DROP COLUMN "image_url"`);
      await queryRunner.query(`ALTER TABLE "receta" DROP COLUMN "tiempo_preparo"`);
    } catch {
      // No-op para SQLite viejo (sin soporte DROP COLUMN)
    }
  }
}
