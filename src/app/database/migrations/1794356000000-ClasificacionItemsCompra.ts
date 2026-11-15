import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clasificación de ítems de compra (docs/planes/PLAN-clasificacion-items-compras.md).
 *
 * ESTRICTAMENTE ADITIVO:
 * - Tabla nueva `compra_item_clase` con la semilla de 7 clases (idempotente por nombre).
 * - `clase_id` nullable en `subfamilia`, `producto` y `compras_detalles` (sin FK física).
 * - `alias_id` y `texto_original` nullable en `compras_detalles`.
 * - `marca`, `contenido`, `codigo_proveedor` nullable y `activo` (default true) en
 *   `ocr_aliases_producto`.
 * Sin backfill: las compras viejas quedan «Sin clasificar».
 */
export const CLASES_SEMILLA: { nombre: string; destino: string; controlaStock: boolean; orden: number }[] = [
  { nombre: 'INSUMO DE PRODUCCIÓN', destino: 'CMV', controlaStock: true, orden: 10 },
  { nombre: 'BEBIDA DE REVENTA', destino: 'REVENTA', controlaStock: true, orden: 20 },
  { nombre: 'DESCARTABLE/PACKAGING', destino: 'CMV', controlaStock: true, orden: 30 },
  { nombre: 'LIMPIEZA E HIGIENE', destino: 'GASTO_OPERATIVO', controlaStock: false, orden: 40 },
  { nombre: 'MANTENIMIENTO', destino: 'GASTO_OPERATIVO', controlaStock: false, orden: 50 },
  { nombre: 'MENAJE/UTENSILIOS', destino: 'GASTO_OPERATIVO', controlaStock: false, orden: 60 },
  { nombre: 'OTROS', destino: 'GASTO_OPERATIVO', controlaStock: false, orden: 70 },
];

export class ClasificacionItemsCompra1794356000000 implements MigrationInterface {
  name = 'ClasificacionItemsCompra1794356000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const id = isPg ? '"id" SERIAL PRIMARY KEY' : '"id" integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const now = isPg ? 'now()' : "(datetime('now'))";
    const T = isPg ? 'true' : '1';
    const auditoria = `"created_at" ${ts} NOT NULL DEFAULT ${now}, "updated_at" ${ts} NOT NULL DEFAULT ${now}, ` +
      `"created_by" integer NULL REFERENCES "usuarios"("id") ON DELETE SET NULL, ` +
      `"updated_by" integer NULL REFERENCES "usuarios"("id") ON DELETE SET NULL`;

    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "compra_item_clase" (
      ${id}, ${auditoria},
      "nombre" varchar(100) NOT NULL,
      "destino" varchar(20) NOT NULL,
      "controla_stock_por_defecto" boolean NOT NULL DEFAULT ${T},
      "orden" integer NOT NULL DEFAULT 0,
      "activo" boolean NOT NULL DEFAULT ${T}
    )`);

    for (const c of CLASES_SEMILLA) {
      const existe = await queryRunner.query(
        `SELECT "id" FROM "compra_item_clase" WHERE UPPER("nombre") = ${isPg ? '$1' : '?'}`, [c.nombre],
      );
      if (existe.length) continue;
      await queryRunner.query(
        `INSERT INTO "compra_item_clase" ("nombre", "destino", "controla_stock_por_defecto", "orden", "activo") ` +
        `VALUES (${isPg ? '$1, $2, $3, $4' : '?, ?, ?, ?'}, ${T})`,
        [c.nombre, c.destino, isPg ? c.controlaStock : (c.controlaStock ? 1 : 0), c.orden],
      );
    }

    const addCol = async (tabla: string, col: string, def: string) => {
      const cols: { name: string }[] = isPg
        ? await queryRunner.query(`SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1`, [tabla])
        : await queryRunner.query(`PRAGMA table_info("${tabla}")`);
      if (!cols.some((c) => c.name === col)) await queryRunner.query(`ALTER TABLE "${tabla}" ADD COLUMN "${col}" ${def}`);
    };
    await addCol('subfamilia', 'clase_id', 'integer NULL');
    await addCol('producto', 'clase_id', 'integer NULL');
    await addCol('compras_detalles', 'clase_id', 'integer NULL');
    await addCol('compras_detalles', 'alias_id', 'integer NULL');
    await addCol('compras_detalles', 'texto_original', 'varchar(500) NULL');
    await addCol('ocr_aliases_producto', 'marca', 'varchar(120) NULL');
    await addCol('ocr_aliases_producto', 'contenido', 'varchar(120) NULL');
    await addCol('ocr_aliases_producto', 'codigo_proveedor', 'varchar(60) NULL');
    await addCol('ocr_aliases_producto', 'activo', `boolean NOT NULL DEFAULT ${T}`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_compras_detalles_clase" ON "compras_detalles" ("clase_id")`);
  }

  /** Solo para uso manual (revertir en producción = versión nueva). */
  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_compras_detalles_clase"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "compra_item_clase"`);
    // SQLite ≥ 3.35 soporta DROP COLUMN; si no se puede, quedan (son nullables o con default).
    const drop = async (tabla: string, col: string) => {
      try { await queryRunner.query(`ALTER TABLE "${tabla}" DROP COLUMN ${isPg ? 'IF EXISTS ' : ''}"${col}"`); } catch { /* no está */ }
    };
    await drop('subfamilia', 'clase_id');
    await drop('producto', 'clase_id');
    for (const c of ['clase_id', 'alias_id', 'texto_original']) await drop('compras_detalles', c);
    for (const c of ['marca', 'contenido', 'codigo_proveedor', 'activo']) await drop('ocr_aliases_producto', c);
  }
}
