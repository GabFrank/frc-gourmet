import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalogo canonico de estilos musicales (F4).
 *
 * POR QUE: el modulo tenia cuatro vocabularios que no se hablaban — los generos
 * de artista de Spotify en los tracks, los nombres inventados por el LLM en la
 * grilla, los strings sueltos de los vetos, y los de la grilla otra vez en el
 * descubrimiento. Dos consecuencias verificadas: configurar "almuerzo: bossa"
 * no tenia NINGUN efecto sobre lo que sonaba (el planner nunca leyo
 * `generosPreferidos`), y vetar `FUNK` mataba al funk americano porque la
 * comparacion era `includes()` contra `FUNK BRASILEIRO`.
 *
 * Crea tres tablas y agrega columnas a `musica_tracks` y `musica_vetos`.
 * Estrictamente aditiva: no toca `genero` (se conserva como dato de origen y
 * alimenta la tabla de alias) ni `generosPreferidos`, que quedan como estan
 * hasta que la UI nueva los reemplace. Ver docs/MIGRATIONS.md.
 */
export class MusicaCatalogoEstilos1786475808081 implements MigrationInterface {
  name = 'MusicaCatalogoEstilos1786475808081';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const nowDefault = isPg ? 'now()' : "(datetime('now'))";
    const bool = isPg ? 'BOOLEAN' : 'boolean';
    const boolTrue = isPg ? 'true' : '(1)';
    const boolFalse = isPg ? 'false' : '(0)';
    const int = isPg ? 'INTEGER' : 'integer';
    const str = isPg ? 'VARCHAR' : 'varchar';
    const txt = 'TEXT';

    /** Columnas comunes de BaseModel. */
    const base = `
      "id" ${pk},
      "created_at" ${ts} NOT NULL DEFAULT ${nowDefault},
      "updated_at" ${ts} NOT NULL DEFAULT ${nowDefault},
      "created_by" ${int},
      "updated_by" ${int}
    `;

    // ─────────────── Catalogo ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_estilos" (
        ${base},
        "nombre" ${str} NOT NULL,
        "descripcion" ${txt},
        "orden" ${int} NOT NULL DEFAULT 0,
        "activo" ${bool} NOT NULL DEFAULT ${boolTrue}
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_musica_estilos_nombre" ON "musica_estilos" ("nombre")`,
    );

    // ─────────────── Alias (capa anticorrupcion) ───────────────
    // El UNIQUE en "valor" es el corazon de esta tabla: impide que un mismo
    // genero crudo de Spotify termine mapeado a dos estilos distintos.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_estilo_alias" (
        ${base},
        "valor" ${str} NOT NULL,
        "estilo_id" ${int} NOT NULL,
        CONSTRAINT "FK_musica_estilo_alias_estilo" FOREIGN KEY ("estilo_id")
          REFERENCES "musica_estilos" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_musica_estilo_alias_valor" ON "musica_estilo_alias" ("valor")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_estilo_alias_estilo" ON "musica_estilo_alias" ("estilo_id")`,
    );

    // ─────────────── Mezcla por bloque ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_bloque_estilo_mezcla" (
        ${base},
        "bloque_id" ${int} NOT NULL,
        "estilo_id" ${int} NOT NULL,
        "porcentaje" ${int} NOT NULL DEFAULT 0,
        CONSTRAINT "FK_musica_mezcla_bloque" FOREIGN KEY ("bloque_id")
          REFERENCES "musica_bloques" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_musica_mezcla_estilo" FOREIGN KEY ("estilo_id")
          REFERENCES "musica_estilos" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_musica_mezcla_bloque_estilo" ON "musica_bloque_estilo_mezcla" ("bloque_id", "estilo_id")`,
    );

    // ─────────────── Columnas nuevas ───────────────
    // SQLite no soporta IF NOT EXISTS en ADD COLUMN: se consulta el esquema.
    const tracks = await queryRunner.getTable('musica_tracks');
    const tieneTrack = (n: string) => !!tracks?.columns.find((c) => c.name === n);

    if (!tieneTrack('estilo_id')) {
      await queryRunner.query(`ALTER TABLE "musica_tracks" ADD COLUMN "estilo_id" ${int}`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_musica_tracks_estilo" ON "musica_tracks" ("estilo_id")`,
      );
    }
    if (!tieneTrack('estiloFijado')) {
      await queryRunner.query(
        `ALTER TABLE "musica_tracks" ADD COLUMN "estiloFijado" ${bool} NOT NULL DEFAULT ${boolFalse}`,
      );
    }

    const vetos = await queryRunner.getTable('musica_vetos');
    if (!vetos?.columns.find((c) => c.name === 'estilo_id')) {
      await queryRunner.query(`ALTER TABLE "musica_vetos" ADD COLUMN "estilo_id" ${int}`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_musica_vetos_estilo" ON "musica_vetos" ("estilo_id")`,
      );
    }

    // Sin FK en las columnas agregadas: SQLite no permite anadir constraints a
    // una tabla existente sin recrearla, y recrear `musica_tracks` con datos en
    // produccion es exactamente el tipo de migracion que este proyecto prohibe.
    // La integridad la sostiene el servicio, que resuelve contra el catalogo.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    await queryRunner.query(`DROP TABLE IF EXISTS "musica_bloque_estilo_mezcla"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_estilo_alias"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_estilos"`);

    // SQLite < 3.35 no soporta DROP COLUMN; ahi las columnas quedan (son
    // nullable o con default, no molestan).
    if (!isPg) return;
    await queryRunner.query(`ALTER TABLE "musica_vetos" DROP COLUMN IF EXISTS "estilo_id"`);
    await queryRunner.query(`ALTER TABLE "musica_tracks" DROP COLUMN IF EXISTS "estiloFijado"`);
    await queryRunner.query(`ALTER TABLE "musica_tracks" DROP COLUMN IF EXISTS "estilo_id"`);
  }
}
