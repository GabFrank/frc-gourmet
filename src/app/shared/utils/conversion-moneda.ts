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
