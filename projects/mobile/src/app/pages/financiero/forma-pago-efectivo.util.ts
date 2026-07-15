/**
 * Regla de negocio: cuando la fuente de un movimiento es CAJA MAYOR, la forma de
 * pago siempre es EFECTIVO (el saldo de caja se mueve en efectivo). Cuando la
 * fuente es una CUENTA BANCARIA es siempre transferencia y no se elige forma de
 * pago (la moneda la dicta la cuenta).
 *
 * No existe un flag `esEfectivo` en la entidad FormasPago, así que se identifica
 * igual que el escritorio: entre las formas que mueven caja (`movimentaCaja`),
 * se prefiere la principal o la que se llame "EFECTIVO"; con fallback al resto.
 */
export function formaPagoEfectivo(formas: any[]): any | null {
  const activas = (formas || []).filter((f) => f && f.activo !== false);
  const muevenCaja = activas.filter((f) => f.movimentaCaja === true);
  const pool = muevenCaja.length ? muevenCaja : activas;
  return (
    pool.find((f) => /EFECTIVO/i.test(f.nombre || '')) ||
    pool.find((f) => f.principal) ||
    pool[0] ||
    null
  );
}
