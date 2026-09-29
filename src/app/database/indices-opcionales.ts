import { DataSource } from 'typeorm';

/**
 * Índices que **no se pueden garantizar desde una migración** porque dependen
 * de que los datos ya estén limpios, y cuya ausencia no puede impedir que la
 * app arranque.
 *
 * Por qué existe este archivo (hallazgo B4 del plan de caja cerrada):
 * `1790617935368-CajaUnicaAbiertaPorDispositivo` hace un pre-chequeo y, si
 * encuentra dos cajas `ABIERTO` en el mismo dispositivo, loguea y hace
 * `return` sin crear el índice — abortar dejaría la instalación sin arrancar.
 * El problema es que **TypeORM marca la migración como ejecutada igual** (el
 * `up()` no lanzó) y `runMigrations()` sólo corre las pendientes: aunque el
 * operador después cierre las cajas sobrantes, el índice no se crearía nunca
 * más y la instalación quedaría sin el control primario del invariante.
 *
 * Esta función se llama en **cada arranque**, inmediatamente después de
 * `runMigrations`, y reintenta la creación. Con eso "cerrá los duplicados"
 * vuelve a ser una instrucción que funciona.
 *
 * Reglas de la casa para todo lo que se agregue acá:
 *  - **Nunca lanza.** Un `try/catch` que loguea. Arrancar la app no puede
 *    depender de un índice opcional.
 *  - **Idempotente.** `IF NOT EXISTS` y un pre-chequeo antes de cada intento.
 *  - **Nunca toca filas de negocio.** Si los datos impiden el índice, se avisa
 *    y se deja la decisión a una persona.
 *  - **SQL portable** entre SQLite y Postgres, o ramificado explícitamente.
 */

/** Nombre del índice único parcial de cajas. Compartido con los tests. */
export const UQ_CAJAS_ABIERTA_POR_DISPOSITIVO = 'UQ_cajas_abierta_por_dispositivo';

/**
 * Dispositivos con más de una caja `ABIERTO`. Mientras haya alguno, el índice
 * único parcial no se puede crear.
 *
 * `COUNT(*)`, `GROUP BY` y `HAVING` son estándar; en Postgres `n` vuelve como
 * string (bigint) y sólo se usa para el mensaje.
 *
 * ⚠️ Se excluyen las cajas **sin dispositivo** (hallazgo M9): el índice parcial
 * trata los NULL como distintos en los dos drivers, así que dos cajas ABIERTO
 * con `dispositivo_id IS NULL` no lo violan. Sin el filtro, `GROUP BY` las
 * agrupa en un `null (2)` y el reintento de arranque nunca crearía el índice,
 * pidiéndole al operador que cierre cajas que no son el problema.
 *
 * Defensa en profundidad: hoy `cajas.dispositivo_id` es NOT NULL en las dos
 * baselines, así que la fila que dispararía el falso positivo no puede existir
 * (ver el encabezado de la migración).
 */
export async function dispositivosConCajasDuplicadas(
  ds: DataSource,
): Promise<Array<{ dispositivoId: number; cantidad: number }>> {
  const filas: any[] = await ds.query(`
    SELECT dispositivo_id, COUNT(*) AS n
      FROM cajas
     WHERE estado = 'ABIERTO'
       AND dispositivo_id IS NOT NULL
     GROUP BY dispositivo_id
    HAVING COUNT(*) > 1
  `);
  return (filas || []).map((f: any) => ({
    dispositivoId: Number(f.dispositivo_id),
    cantidad: Number(f.n),
  }));
}

/**
 * Reintenta crear los índices opcionales. Best-effort: loguea y sigue.
 *
 * Devuelve un resumen para que los tests puedan afirmar qué pasó; el arranque
 * lo ignora.
 */
export async function asegurarIndicesOpcionales(
  ds: DataSource,
): Promise<{ cajaUnicaAbierta: 'ok' | 'duplicados' | 'error' }> {
  let cajaUnicaAbierta: 'ok' | 'duplicados' | 'error' = 'error';
  try {
    const dups = await dispositivosConCajasDuplicadas(ds);
    if (dups.length > 0) {
      cajaUnicaAbierta = 'duplicados';
      console.error(
        `[indices-opcionales] falta el índice "${UQ_CAJAS_ABIERTA_POR_DISPOSITIVO}": hay dispositivos con `
        + 'más de una caja ABIERTO. Cerrá las sobrantes desde Financiero › Cajas y el próximo arranque lo '
        + 'crea solo. Dispositivos (id → cantidad): '
        + dups.map((d) => `${d.dispositivoId} (${d.cantidad})`).join(', '),
      );
    } else {
      // Mismo SQL que la migración: portable en SQLite >= 3.8.0 y Postgres >= 9.0.
      await ds.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "${UQ_CAJAS_ABIERTA_POR_DISPOSITIVO}"
          ON "cajas" ("dispositivo_id") WHERE "estado" = 'ABIERTO'
      `);
      cajaUnicaAbierta = 'ok';
    }
  } catch (e: any) {
    console.warn(
      `[indices-opcionales] no se pudo asegurar "${UQ_CAJAS_ABIERTA_POR_DISPOSITIVO}": ${e?.message || e}`,
    );
  }
  return { cajaUnicaAbierta };
}
