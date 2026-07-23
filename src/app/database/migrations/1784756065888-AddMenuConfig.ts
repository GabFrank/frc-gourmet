import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla `menu_config`: overrides del ADMIN sobre el árbol de menú
 * (`menu-tree.ts`). Una fila por `node_id`; columnas nullable = usar default
 * del árbol. Aditiva y portable SQLite/Postgres.
 */
export class AddMenuConfig1784756065888 implements MigrationInterface {
  name = 'AddMenuConfig1784756065888';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    if (isPg) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "menu_config" (
          "id" SERIAL PRIMARY KEY,
          "node_id" varchar(120) NOT NULL,
          "en_sidenav" boolean NULL,
          "en_buscador" boolean NULL,
          "orden" integer NULL,
          "created_at" TIMESTAMP NOT NULL DEFAULT now(),
          "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_menu_config_node_id" ON "menu_config" ("node_id")`);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "menu_config" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "node_id" varchar(120) NOT NULL,
          "en_sidenav" boolean NULL,
          "en_buscador" boolean NULL,
          "orden" integer NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "created_by" integer NULL,
          "updated_by" integer NULL
        )
      `);
      await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "idx_menu_config_node_id" ON "menu_config" ("node_id")`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "menu_config"`);
  }
}
