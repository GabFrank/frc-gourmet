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
  const pool = formasPagoDeCaja(formas);
  return (
    pool.find((f) => /EFECTIVO/i.test(f.nombre || '')) ||
    pool.find((f) => f.principal) ||
    pool[0] ||
    null
  );
}

/**
 * Pool de formas de pago elegibles para un tramo contra Caja Mayor: las activas
 * que mueven caja (con fallback a todas las activas si ninguna declara el flag).
 * `formaPagoEfectivo()` es la que se elige por defecto dentro de este pool.
 *
 * El diálogo de escritorio usaba `nombre.includes('EFECTIVO')` a secas, que
 * ignora `movimentaCaja`/`activo` y se queda sin opciones si la forma no se
 * llama literalmente "EFECTIVO".
 */
export function formasPagoDeCaja(formas: any[]): any[] {
  const activas = (formas || []).filter((f) => f && f.activo !== false);
  const muevenCaja = activas.filter((f) => f.movimentaCaja === true);
  return muevenCaja.length ? muevenCaja : activas;
}

/**
 * Opciones ofrecibles en un select de forma de pago cuya fuente es Caja Mayor:
 * las del pool de caja **cuyo nombre es EFECTIVO**. `movimentaCaja` solo no
 * alcanza — deja pasar formas que no son efectivo pero mueven caja (regla
 * documentada en `.claude/skills/frc-gourmet-expert/domains/financiero-caja-mayor.md`).
 *
 * Si ninguna coincide por nombre se devuelve la que elige `formaPagoEfectivo()`
 * (o vacío si no hay ninguna usable), para no dejar el select sin opciones.
 */
export function formasPagoEfectivoDeCaja(formas: any[]): any[] {
  const porNombre = formasPagoDeCaja(formas).filter((f) => /EFECTIVO/i.test(f.nombre || ''));
  if (porNombre.length) return porNombre;
  const fallback = formaPagoEfectivo(formas);
  return fallback ? [fallback] : [];
}
