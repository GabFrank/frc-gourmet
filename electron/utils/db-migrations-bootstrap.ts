import type { DataSource } from 'typeorm';

/**
 * Bootstrap-time SQL fixes que `synchronize: true` no puede aplicar solo.
 *
 * Cada migración debe ser **idempotente**: detectar el estado actual y aplicar
 * el fix solo si hace falta. Se ejecutan al boot, después de
 * `dataSource.initialize()` y antes de seedInitialData.
 */
export async function runBootstrapMigrations(dataSource: DataSource): Promise<void> {
  await dropRecetaPresentacionUniqueRecetaId(dataSource);
}

/**
 * receta_presentacion.receta_id tenía un UNIQUE residual de cuando el campo
 * estaba modelado como `@OneToOne` en TypeORM. Ahora es `@ManyToOne` (varias
 * variaciones del mismo sabor comparten la misma receta base), pero
 * synchronize:true en SQLite no detecta el cambio porque la columna FK
 * sigue siendo idéntica. Hay que rebuild manual de la tabla.
 *
 * SQLite no soporta `ALTER TABLE DROP CONSTRAINT`, así que se hace el patrón
 * estándar: tabla nueva sin el UNIQUE, copiar filas, drop vieja, rename.
 */
async function dropRecetaPresentacionUniqueRecetaId(dataSource: DataSource): Promise<void> {
  try {
    const rows: Array<{ sql: string }> = await dataSource.query(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='receta_presentacion'`
    );
    const ddl = rows?.[0]?.sql ?? '';
    if (!/UNIQUE\s*\(\s*"receta_id"\s*\)/i.test(ddl)) {
      // Ya está corregido o el constraint nunca existió.
      return;
    }

    console.log('[bootstrap-migrations] receta_presentacion: removing legacy UNIQUE on receta_id');

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    try {
      await qr.query('PRAGMA foreign_keys = OFF');
      await qr.startTransaction();

      // Tabla temporal con el mismo schema pero sin UNIQUE en receta_id.
      await qr.query(`
        CREATE TABLE "receta_presentacion_new" (
          "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          "created_at" datetime NOT NULL DEFAULT (datetime('now')),
          "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
          "nombre_generado" varchar(255) NOT NULL,
          "sku" varchar(50),
          "precio_ajuste" decimal(10,2),
          "costo_calculado" decimal(10,2) NOT NULL DEFAULT (0),
          "activo" boolean NOT NULL DEFAULT (1),
          "created_by" integer,
          "updated_by" integer,
          "receta_id" integer NOT NULL,
          "presentacion_id" integer NOT NULL,
          "sabor_id" integer NOT NULL,
          CONSTRAINT "UQ_327748124e4fca46a5eba39658c" UNIQUE ("sku"),
          CONSTRAINT "FK_fc9b8380bf8dc433e76025ac249" FOREIGN KEY ("created_by") REFERENCES "usuarios" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
          CONSTRAINT "FK_f8964e9938ac69aaed7d5712e64" FOREIGN KEY ("updated_by") REFERENCES "usuarios" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
          CONSTRAINT "FK_083f11c488fe82941340e7bf463" FOREIGN KEY ("receta_id") REFERENCES "receta" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
          CONSTRAINT "FK_3c29e16234a9dcc4d641ebffdd9" FOREIGN KEY ("presentacion_id") REFERENCES "presentacion" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
          CONSTRAINT "FK_5795278a0ac5cf4d2f67c10e1da" FOREIGN KEY ("sabor_id") REFERENCES "sabor" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        )
      `);

      await qr.query(`
        INSERT INTO "receta_presentacion_new"
          ("id","created_at","updated_at","nombre_generado","sku","precio_ajuste","costo_calculado","activo","created_by","updated_by","receta_id","presentacion_id","sabor_id")
        SELECT
          "id","created_at","updated_at","nombre_generado","sku","precio_ajuste","costo_calculado","activo","created_by","updated_by","receta_id","presentacion_id","sabor_id"
        FROM "receta_presentacion"
      `);

      await qr.query(`DROP TABLE "receta_presentacion"`);
      await qr.query(`ALTER TABLE "receta_presentacion_new" RENAME TO "receta_presentacion"`);

      // Restaurar índice unique compuesto (presentacion_id, sabor_id) — tenía el mismo nombre original.
      await qr.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "IDX_18517794357bb17bf674255bee"
        ON "receta_presentacion" ("presentacion_id", "sabor_id")
      `);

      await qr.commitTransaction();
      console.log('[bootstrap-migrations] receta_presentacion: rebuild completed');
    } catch (err) {
      await qr.rollbackTransaction().catch(() => {});
      throw err;
    } finally {
      await qr.query('PRAGMA foreign_keys = ON').catch(() => {});
      await qr.release();
    }
  } catch (err) {
    console.error('[bootstrap-migrations] dropRecetaPresentacionUniqueRecetaId failed:', err);
    // No relanzar — no queremos bloquear el boot por esto.
  }
}
