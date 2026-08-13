import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Clasificacion semantica: opiniones separadas + ejes de animo y momento.
 *
 * POR QUE (tres hallazgos medidos en produccion sobre 278 temas aprobados):
 *
 *  1. Una sola columna de estilo hacia que la ultima capa en correr pisara a
 *     las anteriores. "Bossa covers" y "bossa clasica" comparten el genero
 *     `BOSSA NOVA`, asi que el agente los distinguia bien y la reclasificacion
 *     por genero lo revertia en la corrida siguiente, sin avisar. Ahora cada
 *     fuente escribe SU columna y `estilo_id` es el valor resuelto.
 *
 *  2. El etiquetador completa `ambiente` y `escenas` en el 100% del repertorio
 *     y NINGUNA linea del backend los lee. El brief del local dice "nada
 *     triste" y habia 45 temas marcados MELANCOLICO sonando: la regla estaba
 *     escrita y no se aplicaba porque los vetos no describen animo.
 *
 *  3. El vocabulario del modelo derivo solo: `energico` 51 veces y
 *     `energetico` 16 para el mismo concepto. Un filtro por `energico` perdia
 *     esos 16 temas en silencio. Se normalizan los datos existentes y desde
 *     ahora se validan al escribir.
 *
 * Estrictamente aditiva. No toca `estilo_id` (se recalcula por precedencia,
 * que para los datos actuales da el mismo valor) ni borra `estiloFijado`, que
 * se sigue escribiendo para que un rollback no pierda la curacion manual.
 * Ver docs/MIGRATIONS.md.
 */
export class MusicaClasificacionSemantica1786563231306 implements MigrationInterface {
  name = 'MusicaClasificacionSemantica1786563231306';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const int = isPg ? 'INTEGER' : 'integer';
    const str = isPg ? 'VARCHAR' : 'varchar';
    const txt = 'TEXT';

    // ─────────── Opiniones separadas sobre el estilo ───────────
    // SQLite no soporta IF NOT EXISTS en ADD COLUMN: se consulta el esquema.
    const tracks = await queryRunner.getTable('musica_tracks');
    const tieneTrack = (n: string) => !!tracks?.columns.find((c) => c.name === n);

    for (const col of ['estilo_manual_id', 'estilo_agente_id', 'estilo_genero_id']) {
      if (tieneTrack(col)) continue;
      await queryRunner.query(`ALTER TABLE "musica_tracks" ADD COLUMN "${col}" ${int}`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_musica_tracks_${col}" ON "musica_tracks" ("${col}")`,
      );
    }

    // Backfill: lo fijado a mano pasa a ser la opinion manual, el resto se
    // atribuye al genero. El agente arranca vacio a proposito — de los datos
    // viejos no hay forma de saber cual estilo lo puso el modelo, y adivinarlo
    // seria peor que dejarlo en null (se recompleta al re-etiquetar).
    const fijadoTrue = isPg ? 'true' : '1';
    const fijadoFalse = isPg ? 'false' : '0';
    await queryRunner.query(
      `UPDATE "musica_tracks" SET "estilo_manual_id" = "estilo_id"
       WHERE "estilo_id" IS NOT NULL AND "estiloFijado" = ${fijadoTrue} AND "estilo_manual_id" IS NULL`,
    );
    await queryRunner.query(
      `UPDATE "musica_tracks" SET "estilo_genero_id" = "estilo_id"
       WHERE "estilo_id" IS NOT NULL AND "estiloFijado" = ${fijadoFalse} AND "estilo_genero_id" IS NULL`,
    );

    // ─────────── Vocabulario semantico: normalizar lo existente ───────────
    //
    // `escenas` es simple-json guardado como texto (`["almuerzo","tarde"]`).
    // Mayusculizar el texto entero es seguro: corchetes y comillas no son
    // letras, y el resultado sigue siendo JSON valido.
    //
    // Los acentos se sacan con REPLACE y NO con UPPER: el UPPER de SQLite solo
    // opera sobre ASCII (`UPPER('melancólico')` devuelve `MELANCóLICO`),
    // mientras que el de Postgres si mayusculiza la vocal acentuada. Sin esto,
    // los dos motores producirian valores distintos y ninguno coincidiria con
    // el vocabulario canonico, que es ASCII — justo el problema que esta
    // migracion viene a cerrar. Espeja `canonizar()` de musica-enums.ts.
    const sinAcentos = (col: string) => {
      const pares: Array<[string, string]> = [
        ['á', 'a'], ['é', 'e'], ['í', 'i'], ['ó', 'o'], ['ú', 'u'], ['ü', 'u'], ['ñ', 'n'],
        ['Á', 'A'], ['É', 'E'], ['Í', 'I'], ['Ó', 'O'], ['Ú', 'U'], ['Ü', 'U'], ['Ñ', 'N'],
      ];
      return pares.reduce((sql, [de, a]) => `REPLACE(${sql}, '${de}', '${a}')`, `"${col}"`);
    };

    await queryRunner.query(
      `UPDATE "musica_tracks" SET "escenas" = UPPER(${sinAcentos('escenas')})
       WHERE "escenas" IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "musica_tracks" SET "ambiente" = UPPER(${sinAcentos('ambiente')})
       WHERE "ambiente" IS NOT NULL`,
    );
    // Las variantes que el modelo devolvio para el mismo concepto.
    for (const [malo, bueno] of [
      ['ENERGETICO', 'ENERGICO'],
      ['ENERGETICA', 'ENERGICO'],
      ['ENERGICA', 'ENERGICO'],
      ['RELAJADA', 'RELAJADO'],
      ['MELANCOLICA', 'MELANCOLICO'],
      ['TRISTE', 'MELANCOLICO'],
    ]) {
      await queryRunner.query(
        `UPDATE "musica_tracks" SET "ambiente" = '${bueno}' WHERE "ambiente" = '${malo}'`,
      );
    }

    // Lo mismo para las escenas. Van CON las comillas del JSON para no pisar
    // subcadenas: sin ellas, un valor que contenga el texto quedaria partido.
    // Espeja SINONIMOS_ESCENA de musica-enums.ts.
    for (const [malo, bueno] of [
      ['MANANA', 'APERTURA'],
      ['MEDIODIA', 'ALMUERZO'],
      ['ATARDECER', 'SUNSET'],
      ['MADRUGADA', 'NOCHE'],
    ]) {
      await queryRunner.query(
        `UPDATE "musica_tracks" SET "escenas" = REPLACE("escenas", '"${malo}"', '"${bueno}"')
         WHERE "escenas" LIKE '%"${malo}"%'`,
      );
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_musica_tracks_ambiente" ON "musica_tracks" ("ambiente")`,
    );

    // ─────────── Ejes semanticos en el bloque ───────────
    const bloques = await queryRunner.getTable('musica_bloques');
    const tieneBloque = (n: string) => !!bloques?.columns.find((c) => c.name === n);

    if (!tieneBloque('animosEvitar')) {
      await queryRunner.query(`ALTER TABLE "musica_bloques" ADD COLUMN "animosEvitar" ${txt}`);
    }
    if (!tieneBloque('escenaPreferida')) {
      await queryRunner.query(`ALTER TABLE "musica_bloques" ADD COLUMN "escenaPreferida" ${str}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';

    // Los datos normalizados NO se revierten: dejar `energetico` de vuelta
    // seria restaurar un bug. La normalizacion es idempotente y compatible con
    // la version anterior, que trataba `ambiente` como texto libre.
    if (!isPg) return; // SQLite < 3.35 no soporta DROP COLUMN.

    await queryRunner.query(`ALTER TABLE "musica_bloques" DROP COLUMN IF EXISTS "escenaPreferida"`);
    await queryRunner.query(`ALTER TABLE "musica_bloques" DROP COLUMN IF EXISTS "animosEvitar"`);
    await queryRunner.query(`ALTER TABLE "musica_tracks" DROP COLUMN IF EXISTS "estilo_genero_id"`);
    await queryRunner.query(`ALTER TABLE "musica_tracks" DROP COLUMN IF EXISTS "estilo_agente_id"`);
    await queryRunner.query(`ALTER TABLE "musica_tracks" DROP COLUMN IF EXISTS "estilo_manual_id"`);
  }
}
