import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Voto del dueno sobre cada estilo del catalogo.
 *
 * POR QUE: el descubridor no tenia forma de saber hacia donde crecer el
 * repertorio. Sabia que estilos existen y cuales estan vetados, pero no cuales
 * le gustan MAS. Con 278 temas repartidos como `INDIE 53 · POP 47 · ROCK 44`
 * contra `PAGODE 6 · SERTANEJO 6`, la diferencia entre "esto lo tolero" y
 * "de esto quiero mas" es justamente lo que faltaba decir.
 *
 * ALCANCE: la columna alimenta SOLO el prompt del descubrimiento. Cuanto suena
 * cada estilo lo sigue decidiendo la mezcla por bloque
 * (`musica_bloque_estilo_mezcla`); si el voto tambien moviera las cuotas
 * habria dos perillas peleando por lo mismo.
 *
 * Rechazar un estilo NO necesita columna: ya se expresa con una fila en
 * `musica_vetos` con `tipo = 'ESTILO'`, que el planner respeta por id y se
 * revierte poniendo `activo = false`.
 *
 * Estrictamente aditiva. Ver docs/MIGRATIONS.md.
 */
export class MusicaPreferenciaEstilo1786804287491 implements MigrationInterface {
  name = 'MusicaPreferenciaEstilo1786804287491';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPg = queryRunner.connection.options.type === 'postgres';
    const int = isPg ? 'INTEGER' : 'integer';

    // SQLite no soporta IF NOT EXISTS en ADD COLUMN: se consulta el esquema.
    const tabla = await queryRunner.getTable('musica_estilos');
    if (tabla?.columns.find((c) => c.name === 'preferencia')) return;

    await queryRunner.query(
      `ALTER TABLE "musica_estilos" ADD COLUMN "preferencia" ${int} NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres soporta DROP COLUMN directo; en SQLite depende de la version,
    // asi que se intenta y se ignora el fallo: revertir esta migracion solo
    // pierde los votos, y la app funciona igual sin la columna.
    try {
      await queryRunner.query(`ALTER TABLE "musica_estilos" DROP COLUMN "preferencia"`);
    } catch {
      /* SQLite viejo: la columna queda, es inofensiva. */
    }
  }
}
