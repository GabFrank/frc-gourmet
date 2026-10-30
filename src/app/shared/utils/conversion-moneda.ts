/**
 * Conversión de montos entre monedas usando una cotización expresada en
 * **moneda principal (ej. Gs) por 1 unidad de la divisa extranjera** (mismo
 * modelo que el cambio de divisa de operaciones financieras).
 *
 * - principal → divisa: DIVIDE (600.000 Gs / 6.000 = 100 USD)
 * - divisa → principal: MULTIPLICA (100 USD * 6.000 = 600.000 Gs)
 * - misma moneda: sin conversión
 */
export function convertirMonto(
  monto: number,
  monedaOrigen: { id: number; principal?: boolean } | null | undefined,
  monedaDestino: { id: number; principal?: boolean } | null | undefined,
  cotizacion: number,
): number {
  const m = Number(monto) || 0;
  if (!monedaOrigen || !monedaDestino) return m;
  if (monedaOrigen.id === monedaDestino.id) return m;
  const cotiz = Number(cotizacion) || 0;
  if (cotiz <= 0) return 0;
  if (monedaOrigen.principal && !monedaDestino.principal) {
    return +(m / cotiz).toFixed(2);
  }
  // destino principal, o divisa→divisa (cotización como factor directo)
  return +(m * cotiz).toFixed(2);
}

/** Fila de `MonedaCambio` tal como llega de `getMonedasCambio()`. */
export interface CambioCotizacion {
  monedaOrigen?: { id: number } | null;
  monedaDestino?: { id: number } | null;
  compraLocal?: number | string | null;
  activo?: boolean;
  createdAt?: string | Date | null;
}

/**
 * `compraLocal` vigente del par, buscado en las DOS direcciones (primero la
 * directa). Espejo de `getCotizacionCompraLocal` del backend.
 *
 * `compraLocal` es siempre "unidades de la moneda principal por 1 unidad de la
 * otra", sin importar cómo se guardó la fila: la UI la guarda extranjera →
 * principal, el código viejo principal → extranjera.
 */
export function compraLocalVigente(
  cambios: CambioCotizacion[] | null | undefined,
  aId: number,
  bId: number,
): number | null {
  const activos = [...(cambios || [])]
    .filter((c) => c?.activo !== false)
    .sort((x, y) => new Date(y?.createdAt || 0).getTime() - new Date(x?.createdAt || 0).getTime());
  const par = (o: number, d: number) =>
    activos.find((c) => c?.monedaOrigen?.id === o && c?.monedaDestino?.id === d);
  const fila = par(aId, bId) ?? par(bId, aId);
  const tasa = Number(fila?.compraLocal);
  return tasa > 0 ? tasa : null;
}

/**
 * Tasa para convertir 1 unidad de `origenId` a `destinoId` (resultado =
 * monto × tasa). Espejo de `getCotizacionBidireccional` del backend (#332):
 *
 * - extranjera → principal: multiplica por `compraLocal`;
 * - principal → extranjera: divide (Gs → USD a 6.000 es × 1/6.000);
 * - dos extranjeras: cruza por la principal.
 *
 * Antes cada diálogo buscaba sólo la fila origen → destino y multiplicaba: una
 * deuda en USD pagada con Gs daba "falta cotización" o un número gigante.
 */
export function tasaEntreMonedas(
  cambios: CambioCotizacion[] | null | undefined,
  origenId: number | null | undefined,
  destinoId: number | null | undefined,
  principalId: number | null | undefined,
): number | null {
  if (origenId == null || destinoId == null) return null;
  if (origenId === destinoId) return 1;
  if (principalId == null) return null;
  if (destinoId === principalId) return compraLocalVigente(cambios, origenId, principalId);
  if (origenId === principalId) {
    const t = compraLocalVigente(cambios, destinoId, principalId);
    return t != null ? 1 / t : null;
  }
  const tOrigen = compraLocalVigente(cambios, origenId, principalId);
  const tDestino = compraLocalVigente(cambios, destinoId, principalId);
  return tOrigen != null && tDestino != null ? tOrigen / tDestino : null;
}

/**
 * La cotización que tipea el cajero es la de siempre: **principal por 1
 * extranjera** (1 US$ = 6.000 Gs). Esto la pasa a tasa origen → destino.
 * Entre dos extranjeras no hay principal de por medio: el valor es el factor
 * directo (1 unidad de origen = ? de destino).
 */
export function tasaDesdeCotizacion(
  cotizacion: number | null | undefined,
  origenId: number | null | undefined,
  destinoId: number | null | undefined,
  principalId: number | null | undefined,
): number | null {
  if (origenId == null || destinoId == null) return null;
  if (origenId === destinoId) return 1;
  const c = Number(cotizacion);
  if (!(c > 0)) return null;
  return origenId === principalId ? 1 / c : c;
}

/**
 * Valor a precargar en un campo de cotización con la semántica de
 * `tasaDesdeCotizacion` (principal por 1 extranjera, o factor directo entre dos
 * extranjeras). `null` si no hay cotización cargada.
 */
export function cotizacionSugerida(
  cambios: CambioCotizacion[] | null | undefined,
  origenId: number | null | undefined,
  destinoId: number | null | undefined,
  principalId: number | null | undefined,
): number | null {
  if (origenId == null || destinoId == null) return null;
  if (origenId === destinoId) return 1;
  if (origenId === principalId) return compraLocalVigente(cambios, destinoId, origenId);
  return tasaEntreMonedas(cambios, origenId, destinoId, principalId);
}

/** ¿Requiere cotización para mover `monto` desde `monedaOrigen` a `monedaDestino`? */
export function requiereCotizacion(
  monedaOrigen: { id: number } | null | undefined,
  monedaDestino: { id: number } | null | undefined,
): boolean {
  return !!monedaOrigen && !!monedaDestino && monedaOrigen.id !== monedaDestino.id;
}

/**
 * Extrae la tasa de mercado para una divisa desde el resultado de
 * `getCotizacionMercado()` ({ monedas: { DOLAR: {compraMercado, ventaMercado}, ... } }).
 * @param tipo 'VENTA' para egresos, 'COMPRA' para ingresos.
 */
export function cotizacionMercadoPara(
  resultado: any,
  monedaDenominacion: string | null | undefined,
  tipo: 'COMPRA' | 'VENTA',
): number | null {
  if (!resultado?.success || !resultado?.monedas || !monedaDenominacion) return null;
  const item = resultado.monedas[String(monedaDenominacion).toUpperCase()];
  if (!item) return null;
  const tasa = tipo === 'VENTA' ? item.ventaMercado : item.compraMercado;
  return Number(tasa) > 0 ? Number(tasa) : null;
}
