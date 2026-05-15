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
export function parseLocalDate(s: any): Date | undefined {
  if (!s) return undefined;
  if (s instanceof Date) return s;
  const str = String(s);
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(str);
}
