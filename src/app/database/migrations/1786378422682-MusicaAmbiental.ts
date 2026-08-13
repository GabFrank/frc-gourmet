import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Modulo de Musica ambiental (F1): repertorio propio, grilla de bloques y
 * planes materializados en playlists de Spotify.
 *
 * Escrita a mano y no con `migration:generate`: el DataSource del CLI apunta a
 * una SQLite vacia, asi que el diff generaba el esquema COMPLETO de la app
 * (2000+ lineas) en vez de solo estas tablas.
 *
 * Aditiva y driver-aware (SQLite + Postgres), con IF NOT EXISTS en todo.
 * Ver docs/DISENO-OPERATIVO-MUSICA.md.
 */
export class MusicaAmbiental1786378422682 implements MigrationInterface {
  name = 'MusicaAmbiental1786378422682';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // Tipos que difieren entre drivers
    const pk = isPg ? 'SERIAL PRIMARY KEY' : 'integer PRIMARY KEY AUTOINCREMENT NOT NULL';
    const ts = isPg ? 'TIMESTAMP' : 'datetime';
    const nowDefault = isPg ? 'now()' : "(datetime('now'))";
    const bool = isPg ? 'BOOLEAN' : 'boolean';
    const boolTrue = isPg ? 'true' : '(1)';
    const boolFalse = isPg ? 'false' : '(0)';
    const float = isPg ? 'DOUBLE PRECISION' : 'float';
    const int = isPg ? 'INTEGER' : 'integer';
    const str = isPg ? 'VARCHAR' : 'varchar';
    const txt = 'TEXT';
    const date = isPg ? 'DATE' : 'date';

    /** Columnas comunes de BaseModel. */
    const base = `
      "id" ${pk},
      "created_at" ${ts} NOT NULL DEFAULT ${nowDefault},
      "updated_at" ${ts} NOT NULL DEFAULT ${nowDefault},
      "created_by" ${int},
      "updated_by" ${int}
    `;

    // ─────────────── Semillas ("que suene como esto") ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_semillas" (
        ${base},
        "tipo" ${txt} NOT NULL,
        "spotifyUri" ${str} NOT NULL,
        "nombre" ${str} NOT NULL,
        "imagenUrl" ${str},
        "bloqueIds" ${txt},
        "tracksImportados" ${int} NOT NULL DEFAULT 0,
        "ultimaImportacion" ${ts},
        "activo" ${bool} NOT NULL DEFAULT ${boolTrue}
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_semillas_uri" ON "musica_semillas" ("spotifyUri")`,
    );

    // ─────────────── Repertorio propio ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_tracks" (
        ${base},
        "spotifyId" ${str} NOT NULL,
        "isrc" ${str},
        "titulo" ${str} NOT NULL,
        "artista" ${str} NOT NULL,
        "artistaId" ${str},
        "album" ${str},
        "imagenUrl" ${str},
        "duracionMs" ${int} NOT NULL DEFAULT 0,
        "explicit" ${bool} NOT NULL DEFAULT ${boolFalse},
        "bpm" ${float},
        "energia" ${float},
        "valencia" ${float},
        "danceability" ${float},
        "genero" ${str},
        "escenas" ${txt},
        "ambiente" ${str},
        "familiaridad" ${str},
        "aptoFamiliar" ${bool},
        "idioma" ${str},
        "etiquetado" ${bool} NOT NULL DEFAULT ${boolFalse},
        "estado" ${txt} NOT NULL DEFAULT 'SUGERIDO',
        "score" ${float} NOT NULL DEFAULT 0,
        "ultimaVez" ${ts},
        "vecesSonado" ${int} NOT NULL DEFAULT 0
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_musica_tracks_spotify" ON "musica_tracks" ("spotifyId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_tracks_isrc" ON "musica_tracks" ("isrc")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_tracks_artista" ON "musica_tracks" ("artistaId")`,
    );
    // Ventana anti-repeticion: se consulta por ultima vez que sono.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_tracks_ultima_vez" ON "musica_tracks" ("ultimaVez")`,
    );

    // ─────────────── Vetos ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_vetos" (
        ${base},
        "tipo" ${txt} NOT NULL,
        "valor" ${str} NOT NULL,
        "etiqueta" ${str},
        "bloqueId" ${int},
        "motivo" ${str},
        "activo" ${bool} NOT NULL DEFAULT ${boolTrue}
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_vetos_valor" ON "musica_vetos" ("valor")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_vetos_bloque" ON "musica_vetos" ("bloqueId")`,
    );

    // ─────────────── Grilla de bloques ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_bloques" (
        ${base},
        "diaSemana" ${int} NOT NULL,
        "nombre" ${str} NOT NULL,
        "horaDesde" ${str} NOT NULL,
        "horaHasta" ${str} NOT NULL,
        "energia" ${int} NOT NULL DEFAULT 3,
        "volumen" ${int} NOT NULL DEFAULT 50,
        "generosPreferidos" ${txt},
        "generosEvitar" ${txt},
        "bpmMin" ${float},
        "bpmMax" ${float},
        "valenciaMin" ${float},
        "notas" ${txt},
        "orden" ${int} NOT NULL DEFAULT 0,
        "activo" ${bool} NOT NULL DEFAULT ${boolTrue}
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_bloques_dia" ON "musica_bloques" ("diaSemana")`,
    );

    // ─────────────── Planes diarios ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_planes" (
        ${base},
        "fecha" ${date} NOT NULL,
        "origen" ${txt} NOT NULL DEFAULT 'REGLAS',
        "justificacion" ${txt},
        "instruccion" ${txt},
        "activo" ${bool} NOT NULL DEFAULT ${boolTrue}
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_musica_planes_fecha" ON "musica_planes" ("fecha")`,
    );

    // ─────────────── Playlists materializadas ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_plan_bloques" (
        ${base},
        "plan_id" ${int} NOT NULL,
        "bloque_id" ${int} NOT NULL,
        "variante" ${txt} NOT NULL DEFAULT 'NORMAL',
        "spotifyPlaylistId" ${str},
        "spotifyUri" ${str},
        "trackIds" ${txt},
        "cantidadTracks" ${int} NOT NULL DEFAULT 0,
        "duracionMs" ${int} NOT NULL DEFAULT 0,
        "materializadoAt" ${ts},
        CONSTRAINT "FK_musica_plan_bloques_plan" FOREIGN KEY ("plan_id")
          REFERENCES "musica_planes" ("id") ON DELETE CASCADE,
        CONSTRAINT "FK_musica_plan_bloques_bloque" FOREIGN KEY ("bloque_id")
          REFERENCES "musica_bloques" ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_plan_bloques_plan" ON "musica_plan_bloques" ("plan_id")`,
    );

    // ─────────────── Log de reproduccion ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_track_log" (
        ${base},
        "spotifyId" ${str} NOT NULL,
        "titulo" ${str},
        "artista" ${str},
        "bloqueId" ${int},
        "variante" ${txt},
        "inicio" ${ts} NOT NULL,
        "fin" ${ts},
        "salteado" ${bool} NOT NULL DEFAULT ${boolFalse},
        "ocupacionPct" ${float},
        "ventasPorMinuto" ${float}
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_track_log_spotify" ON "musica_track_log" ("spotifyId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_track_log_inicio" ON "musica_track_log" ("inicio")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_track_log_bloque" ON "musica_track_log" ("bloqueId")`,
    );

    // ─────────────── Feedback del staff ───────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "musica_feedback" (
        ${base},
        "spotifyId" ${str} NOT NULL,
        "artistaId" ${str},
        "titulo" ${str},
        "tipo" ${txt} NOT NULL,
        "bloqueId" ${int},
        "fecha" ${ts} NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_feedback_spotify" ON "musica_feedback" ("spotifyId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_feedback_bloque" ON "musica_feedback" ("bloqueId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Orden inverso por la FK de plan_bloques.
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_feedback"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_track_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_plan_bloques"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_planes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_bloques"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_vetos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_tracks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "musica_semillas"`);
  }
}
