/**
 * Cuánto vale una venta.
 *
 * `Venta.total` es una columna que **nunca se escribe** en ningún flujo del repo
 * (ni al cobrar ni en la venta a crédito), así que quien la leía obtenía 0 — de
 * ahí que la comisión `META_VENTA_LOCAL` no pagara nunca y que el ranking de
 * vendedores del dashboard RRHH mostrara 0 (issue #239). El total se calcula
 * siempre desde los ítems, y esta es la única implementación de esa cuenta.
 *
 * Criterio (decidido con el usuario, 2026-08-17): **ítems activos, netos de los
 * ajustes globales del cobro**. Es lo mismo que imprime el ticket, y es lo que
 * corresponde en un local donde los descuentos globales y las ventas a crédito
 * son moneda corriente: si se hizo un 10% de descuento, la meta del vendedor no
 * debería contar el bruto.
 */
import type { DataSource } from 'typeorm';
import { dbQuery } from './db-query';
import { convertirAPrincipal, getMonedaPrincipal } from './moneda.utils';

/**
 * Total de una línea de venta, como expresión SQL reutilizable.
 *
 * `(precioVentaUnitario + precioAdicionales − descuentoUnitario) × cantidad`
 *
 * Los tres montos son **por unidad**: el adicional también. Olvidarse de
 * multiplicarlo por la cantidad es el error que tenían `comisiones.handler` y
 * `equipos-comision.handler` (2 hamburguesas con extra queso contaban un solo
 * extra). Es la misma fórmula que documenta `domains/ventas-pdv.md` y que usan
 * el cobro y el ticket.
 *
 * @param alias alias de la tabla `venta_items` en la query.
 */
export function sqlTotalLineaItem(alias = 'vi'): string {
  return `((${alias}.precio_venta_unitario + ${alias}.precio_adicionales - ${alias}.descuento_unitario) * ${alias}.cantidad)`;
}

/**
 * Total por venta para un conjunto de ventas: ítems ACTIVOS menos los
 * descuentos y más los aumentos cargados en el cobro (`PagoDetalle`),
 * convertidos a la moneda principal.
 *
 * Devuelve un `Map<ventaId, total>`; las ventas sin ítems activos no aparecen.
 * Nunca devuelve negativos (un descuento mayor al bruto queda en 0).
 */
export async function getTotalesPorVenta(
  dataSource: DataSource,
  ventaIds: number[],
): Promise<Map<number, number>> {
  const totales = new Map<number, number>();
  const ids = Array.from(new Set((ventaIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)));
  if (ids.length === 0) return totales;

  const inList = ids.join(',');

  // Bruto por venta desde los ítems activos.
  const brutoRows: any[] = await dbQuery(
    dataSource,
    `SELECT vi.venta_id as venta_id, COALESCE(SUM(${sqlTotalLineaItem('vi')}), 0) as bruto
       FROM venta_items vi
      WHERE vi.venta_id IN (${inList}) AND vi.estado = 'ACTIVO'
      GROUP BY vi.venta_id`,
    [],
  );
  for (const r of brutoRows) {
    totales.set(Number(r.venta_id), Number(r.bruto || 0));
  }
  if (totales.size === 0) return totales;

  // Ajustes del cobro. Vienen por moneda porque un descuento puede haberse
  // cargado en USD/BRL; se convierten a la principal antes de restar/sumar.
  const ajusteRows: any[] = await dbQuery(
    dataSource,
    `SELECT v.id as venta_id, pd.tipo as tipo, pd.moneda_id as moneda_id,
            COALESCE(SUM(pd.valor), 0) as valor
       FROM ventas v
       JOIN pagos p ON p.id = v.pago_id
       JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.activo
      WHERE v.id IN (${inList}) AND pd.tipo IN ('DESCUENTO', 'AUMENTO')
      GROUP BY v.id, pd.tipo, pd.moneda_id`,
    [],
  );

  if (ajusteRows.length > 0) {
    const principal = await getMonedaPrincipal(dataSource);
    for (const r of ajusteRows) {
      const ventaId = Number(r.venta_id);
      if (!totales.has(ventaId)) continue;
      const valor = Number(r.valor || 0);
      const conv = await convertirAPrincipal(dataSource, valor, r.moneda_id, principal);
      // Sin cotización cargada se usa el valor nominal, mismo criterio que el
      // ticket: preferible un ajuste aproximado a ignorarlo (ignorar un
      // descuento infla la meta del vendedor).
      const monto = conv?.montoPrincipal ?? valor;
      const actual = totales.get(ventaId) || 0;
      totales.set(ventaId, String(r.tipo) === 'DESCUENTO' ? actual - monto : actual + monto);
    }
    for (const [ventaId, total] of totales) {
      if (total < 0) totales.set(ventaId, 0);
    }
  }

  return totales;
}

/** Suma de los totales de varias ventas (0 si no hay ninguna). */
export async function sumarTotalesDeVentas(
  dataSource: DataSource,
  ventaIds: number[],
): Promise<number> {
  const totales = await getTotalesPorVenta(dataSource, ventaIds);
  let suma = 0;
  totales.forEach((t) => { suma += t; });
  return suma;
}
