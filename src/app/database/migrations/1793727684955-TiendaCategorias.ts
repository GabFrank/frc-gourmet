import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tienda online F6 (docs/planes/PLAN-tienda-online-F6-ux-carta.md): categorías de la tienda
 * armadas a mano y sus productos.
 *
 * ESTRICTAMENTE ADITIVO: dos tablas nuevas, sin tocar las existentes ni cargar datos. Sin
 * categorías, la carta sigue agrupada por familia, así que el local no cambia nada.
 *
 * El `down` borra las categorías cargadas: antes de revertir en producción, exportarlas
 * (get-tienda-categorias-admin) a JSON.
 */
export class TiendaCategorias1793727684955 implements MigrationInterface {
  name = 'TiendaCategorias1793727684955';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const id = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const ts = isPg ? 'TIMESTAMP NOT NULL DEFAULT now()' : "datetime NOT NULL DEFAULT (datetime('now'))";
    const verdadero = isPg ? 'true' : '1';
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "tienda_categorias" (
      "id" ${id},
      "created_at" ${ts},
      "updated_at" ${ts},
      "created_by" integer NULL,
      "updated_by" integer NULL,
      "nombre" varchar(80) NOT NULL,
      "orden" integer NOT NULL DEFAULT 0,
      "activo" boolean NOT NULL DEFAULT ${verdadero}
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "tienda_categoria_productos" (
      "id" ${id},
      "created_at" ${ts},
      "updated_at" ${ts},
      "created_by" integer NULL,
      "updated_by" integer NULL,
      "categoria_id" integer NOT NULL REFERENCES "tienda_categorias" ("id") ON DELETE CASCADE,
      "producto_id" integer NOT NULL REFERENCES "producto" ("id") ON DELETE CASCADE,
      "orden" integer NOT NULL DEFAULT 0
    )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tienda_categoria_producto" ON "tienda_categoria_productos" ("categoria_id", "producto_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tienda_categoria_productos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tienda_categorias"`);
  }
}
