import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Opciones avanzadas por bloque de musica.
 *
 * El limite de temas por artista era una constante global del generador, pero
 * depende del estilo del bloque: en covers bossa varios temas del mismo
 * interprete son lo esperado; en la noche de rock repetir artista es el
 * problema que el modulo existe para evitar. Por eso pasa a ser por bloque,
 * con `null` = sin limite.
 *
 * Aditiva y driver-aware. Ver docs/MIGRATIONS.md.
 */
export class MusicaOpcionesAvanzadas1786383979096 implements MigrationInterface {
  name = 'MusicaOpcionesAvanzadas1786383979096';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const int = isPg ? 'INTEGER' : 'integer';
    const float = isPg ? 'DOUBLE PRECISION' : 'float';
    const bool = isPg ? 'BOOLEAN' : 'boolean';
    const boolTrue = isPg ? 'true' : '(1)';

    // SQLite no soporta IF NOT EXISTS en ADD COLUMN: se consulta el esquema.
    const columnas = await queryRunner.getTable('musica_bloques');
    const tiene = (nombre: string) => !!columnas?.columns.find((c) => c.name === nombre);

    if (!tiene('maxPorArtista')) {
      await queryRunner.query(`ALTER TABLE "musica_bloques" ADD COLUMN "maxPorArtista" ${int}`);
    }
    if (!tiene('evitarArtistaConsecutivo')) {
      await queryRunner.query(
        `ALTER TABLE "musica_bloques" ADD COLUMN "evitarArtistaConsecutivo" ${bool} NOT NULL DEFAULT ${boolTrue}`,
      );
    }
    if (!tiene('factorDuracion')) {
      await queryRunner.query(`ALTER TABLE "musica_bloques" ADD COLUMN "factorDuracion" ${float}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    // SQLite < 3.35 no soporta DROP COLUMN; en ese caso la baja no hace nada
    // (las columnas son nullable/con default, no molestan).
    if (!isPg) return;
    await queryRunner.query(`ALTER TABLE "musica_bloques" DROP COLUMN IF EXISTS "factorDuracion"`);
    await queryRunner.query(
      `ALTER TABLE "musica_bloques" DROP COLUMN IF EXISTS "evitarArtistaConsecutivo"`,
    );
    await queryRunner.query(`ALTER TABLE "musica_bloques" DROP COLUMN IF EXISTS "maxPorArtista"`);
  }
}
