/**
 * Qué es una "venta directa": la venta rápida de mostrador.
 *
 * No tiene mesa, comanda ni delivery, y nació en el local (`canalOrigen` LOCAL).
 * Es la única venta que NO va a cocina, porque no hay a quién llevarle el
 * pedido: el cliente lo retira en el mostrador o en la barra. Por eso es
 * también la única que emite fichas de cantina.
 *
 * Antes este predicado estaba repetido en los tres gates de cocina
 * (`autoPrintComandaIfNeeded`, `crearComandaItemsSiCorresponde` y
 * `printComandaInternal`). Un predicado repetido diverge: el delivery pasó días
 * sin imprimir su comanda porque un gate se actualizó y otro no. Ahora cocina y
 * fichas leen del mismo lugar, así que una venta nunca puede ir a la cocina y
 * emitir fichas a la vez.
 *
 * ⚠️ Precondición: la venta tiene que venir con `mesa`, `comanda` y `delivery`
 * CARGADAS. Con una relación sin cargar, `venta.delivery?.id` da siempre
 * `undefined` y un delivery pasaría por venta directa.
 */
export function esVentaDirecta(venta: any): boolean {
  if (!venta) return false;
  const tieneMesa = !!venta.mesa?.id;
  const tieneComanda = !!venta.comanda?.id;
  const tieneDelivery = !!venta.delivery?.id;
  // `QR_MESA` y `WEB` no son mostrador aunque no tengan mesa: van a cocina.
  const esLocal = (venta.canalOrigen ?? 'LOCAL') === 'LOCAL';
  return !tieneMesa && !tieneComanda && !tieneDelivery && esLocal;
}

/** Relaciones que `esVentaDirecta` necesita cargadas. */
export const RELACIONES_VENTA_DIRECTA = ['mesa', 'comanda', 'delivery'] as const;
