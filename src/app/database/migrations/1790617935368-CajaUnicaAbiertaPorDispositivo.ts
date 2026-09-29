import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nombre de la migración, exportado para los tests.
 *
 * `test-caja-apertura` borra su fila de `typeorm_migrations` para volver a
 * correrla con duplicados sembrados. Con el nombre hardcodeado en el test, un
 * cambio de timestamp dejaba el `DELETE` sin matchear: la migración no se
 * reejecutaba y el bloque quedaba tautológico (hallazgo D12).
 */
export const NOMBRE_MIGRACION_CAJA_UNICA_ABIERTA = 'CajaUnicaAbiertaPorDispositivo1790617935368';

/**
 * Índice único parcial: **una sola caja `ABIERTO` por dispositivo**.
 *
 * El 24/09 la caja #122 se cerró a las 14:35 y la #123 se abrió a las 14:39,
 * pero la pestaña del PdV siguió con la #122 en memoria hasta la 01:54. Nunca
 * hubo dos cajas `ABIERTO` a la vez — el solape fue de hecho, no de estado —,
 * pero el camino de apertura es `count()` + `save()` **fuera de transacción**
 * (`financiero.handler.ts`) y `findOne()` + `save()` en
 * `abrir-caja-desde-conteo`, o sea check-then-act puro.
 *
 * ⚠️ **Este índice es el control primario del invariante, no un cinturón.** El
 * guard transaccional con `SELECT … FOR UPDATE` NO cierra la carrera de doble
 * apertura: en el caso que importa —el dispositivo todavía no tiene caja
 * abierta— el lock matchea **cero filas**, y Postgres en `READ COMMITTED` no
 * toma gap locks: dos transacciones concurrentes leen cero las dos, pasan las
 * dos e insertan las dos. En SQLite el argumento "un solo escritor" vale dentro
 * de un proceso, pero no entre dos instancias de Electron contra el mismo
 * archivo. Sin el índice no hay defensa real (RB-2 del plan).
 *
 * **El SQL es portable y la migración NO ramifica por driver a propósito:**
 * los índices parciales existen en SQLite >= 3.8.0 y en Postgres >= 9.0, el
 * quoting con comillas dobles vale en los dos, y `Caja.estado` es
 * `@Column({ type: 'varchar', enum: CajaEstado })` — **no** un enum nativo de
 * Postgres —, así que `WHERE "estado" = 'ABIERTO'` es un literal de texto
 * inmutable en ambos. `dispositivo_id` es NOT NULL por diseño
 * (`@ManyToOne(..., { nullable: false })`), así que el índice parcial cubre el
 * 100 % de las cajas abiertas.
 *
 * **Si ya hay duplicados, NO se crea el índice y NO se aborta.** Las
 * migraciones corren al arrancar la app (`DatabaseService.runMigrations`): una
 * que falla deja la instalación sin arrancar. Es el mismo criterio que
 * `1787255528889-IndicesRucYReconciliarMesas`. Y **no se cierra ninguna caja
 * sola**: eso lo decide una persona.
 *
 * ⚠️ El `return` temprano no alcanza como mitigación: TypeORM marca la
 * migración como ejecutada igual (el `up()` no lanzó), así que limpiar los
 * duplicados después nunca volvería a intentarla. Por eso el mismo
 * `CREATE UNIQUE INDEX IF NOT EXISTS` se reintenta en **cada arranque** desde
 * `asegurarIndicesOpcionales()` (`src/app/database/indices-opcionales.ts`),
 * llamada justo después de `runMigrations`.
 */
export class CajaUnicaAbiertaPorDispositivo1790617935368 implements MigrationInterface {
  name = NOMBRE_MIGRACION_CAJA_UNICA_ABIERTA;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pre-chequeo portable: `COUNT(*)`, `GROUP BY` y `HAVING` son estándar. En
    // Postgres `n` vuelve como string (bigint), pero sólo se usa en el mensaje.
    //
    // ⚠️ `dispositivo_id IS NOT NULL` (hallazgo M9). Un índice único parcial
    // trata los NULL como DISTINTOS en los dos drivers, así que dos cajas
    // ABIERTO sin dispositivo NO lo violarían y el índice se crearía igual; sin
    // el filtro, en cambio, `GROUP BY` las junta en un solo grupo `null (2)` y
    // el pre-chequeo bloquearía para siempre la creación del control primario
    // del invariante, con un log que además miente.
    //
    // Es defensa en profundidad, no un bug reproducible hoy: `dispositivo_id`
    // es NOT NULL en las DOS baselines (`1778378410416-Baseline.ts:104` SQLite,
    // `1778380893207-BaselinePostgres.ts:104`) y ninguna migración posterior la
    // afloja, así que no puede existir una fila con NULL. El filtro está por si
    // alguna vez se afloja, y porque el `GROUP BY` sin él es incorrecto aunque
    // hoy no tenga filas que agrupar.
    const dups: any[] = await queryRunner.query(`
      SELECT dispositivo_id, COUNT(*) AS n
        FROM cajas
       WHERE estado = 'ABIERTO'
         AND dispositivo_id IS NOT NULL
       GROUP BY dispositivo_id
      HAVING COUNT(*) > 1
    `);
    if (dups && dups.length > 0) {
      console.error(
        '[migration CajaUnicaAbiertaPorDispositivo] NO se creó el índice único: hay dispositivos con más '
        + 'de una caja ABIERTO. Cerrá manualmente las sobrantes; el próximo arranque crea el índice solo. '
        + 'Dispositivos (id → cantidad): '
        + dups.map((d: any) => `${d.dispositivo_id} (${d.n})`).join(', '),
      );
      return;
    }

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_cajas_abierta_por_dispositivo"
        ON "cajas" ("dispositivo_id") WHERE "estado" = 'ABIERTO'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cajas_abierta_por_dispositivo"`);
  }
}
