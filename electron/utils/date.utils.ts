/**
 * Parsea un string de fecha como FECHA LOCAL (no UTC), evitando el shift
 * de timezone que ocurre cuando `new Date("YYYY-MM-DD")` interpreta el
 * string como medianoche UTC.
 *
 * Usar para campos persistidos en columnas TypeORM `date` (sin hora).
 * Para columnas `datetime`/`timestamp`, `new Date()` directo esta bien
 * porque preservan la hora completa (incluyendo offset).
 *
 *   parseLocalDate("2026-05-07")  -> new Date(2026, 4, 7) - local midnight
 *   parseLocalDate(date)          -> el mismo Date
 *   parseLocalDate(undefined)     -> undefined
 */
/**
 * Formatea una fecha como parámetro para comparar contra una columna
 * `datetime`/`timestamp` en SQL crudo, **según el driver**.
 *
 * Es necesario porque SQLite guarda esas columnas como TEXT con el formato de
 * TypeORM — `2026-08-01 18:00:00.000`, con espacio y sin `Z` — y compara TEXT
 * byte a byte. Pasarle un `toISOString()` (`2026-08-01T18:00:00.000Z`) rompe la
 * comparación en el separador: `' '` (0x20) es menor que `'T'` (0x54), así que
 * **todas** las filas del día del límite inferior quedan afuera del `>=`, y las
 * del día del límite superior se cuelan en el `<=`. En un reporte mensual eso
 * significa perder el día 1 entero y sumar ventas del mes siguiente.
 *
 * En Postgres las columnas son `timestamp without time zone` y guardan la hora
 * **local** del proceso (el driver `pg` serializa un `Date` con su offset local y
 * Postgres descarta el offset). Comparar contra un ISO con `Z` también descarta
 * la zona, así que el límite quedaba corrido 3 h en America/Asuncion (#317): se
 * perdía lo de 00:00-03:00 del primer día y se sumaba lo del día siguiente. Por
 * eso ahí se manda la hora local sin zona, armada con getters locales.
 *
 * ⚠️ Cualquier query nueva que compare `created_at` (u otra `datetime`) contra
 * una fecha tiene que pasar por acá.
 */
export function fechaParamSql(dataSource: { options: { type: string } }, fecha: Date): string {
  if (dataSource?.options?.type === 'postgres') return fechaLocalSinZona(fecha);
  const iso = fecha.toISOString();
  // '2026-08-01T18:00:00.000Z' → '2026-08-01 18:00:00.000'
  return iso.slice(0, 23).replace('T', ' ');
}

/** `Date` → `YYYY-MM-DD HH:mm:ss.SSS` en hora local, sin zona (lo que guarda un `timestamp` de Postgres). */
function fechaLocalSinZona(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function parseLocalDate(s: any): Date | undefined {
  if (!s) return undefined;
  if (s instanceof Date) return s;
  const str = String(s);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(str);
}
