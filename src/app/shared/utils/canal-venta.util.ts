/**
 * Canal de una venta: **cómo llegó el pedido a manos del cliente**.
 *
 * Single source of truth compartida entre backend y frontend (TS puro, sin
 * dependencias de Electron ni de Angular). El backend la re-exporta desde
 * `electron/utils/canal-venta.utils.ts`, que además agrega el fragmento SQL
 * equivalente para agrupar en consultas.
 *
 * Existe porque la misma clasificación la necesitan cuatro pantallas —el
 * reporte de cierre de mes, el dashboard de ventas, el historial y el resumen
 * de caja— y si cada una la deduce por su cuenta terminan discrepando: alcanza
 * con que una mire `venta.mesa` y otra `delivery.modo` para que el mismo pedido
 * cuente como SALÓN en un lado y como DELIVERY en el otro.
 *
 * ⚠️ El canal NO es lo mismo que `Venta.canalOrigen` (LOCAL / WEB / QR_MESA),
 * que dice por qué **puerta de entrada** se cargó el pedido. Un delivery puede
 * ser LOCAL (lo cargó el cajero por teléfono) o WEB (entró por la tienda), y
 * las dos cosas son ciertas a la vez. Se cruzan, no se reemplazan.
 */

export enum CanalVenta {
  /** Venta con mesa: el cliente consume en el local. */
  SALON = 'SALON',
  /** Sin mesa y sin reparto: mostrador / para llevar en el momento. */
  MOSTRADOR = 'MOSTRADOR',
  /** Se reparte a domicilio (`Delivery.modo = DELIVERY`). */
  DELIVERY = 'DELIVERY',
  /** El cliente lo pasa a buscar (`Delivery.modo = RETIRO`). */
  RETIRO = 'RETIRO',
}

/** Orden de presentación estable: primero el salón, al final lo que sale. */
export const CANAL_VENTA_ORDEN: CanalVenta[] = [
  CanalVenta.SALON,
  CanalVenta.MOSTRADOR,
  CanalVenta.DELIVERY,
  CanalVenta.RETIRO,
];

export const CANAL_VENTA_LABEL: Record<CanalVenta, string> = {
  [CanalVenta.SALON]: 'SALÓN',
  [CanalVenta.MOSTRADOR]: 'MOSTRADOR',
  [CanalVenta.DELIVERY]: 'DELIVERY',
  [CanalVenta.RETIRO]: 'RETIRO',
};

export const CANAL_VENTA_ICONO: Record<CanalVenta, string> = {
  [CanalVenta.SALON]: 'restaurant',
  [CanalVenta.MOSTRADOR]: 'storefront',
  [CanalVenta.DELIVERY]: 'two_wheeler',
  [CanalVenta.RETIRO]: 'shopping_bag',
};

/** Puerta de entrada del pedido (`Venta.canalOrigen`). */
export const ORIGEN_VENTA_LABEL: Record<string, string> = {
  LOCAL: 'LOCAL',
  WEB: 'WEB',
  QR_MESA: 'QR MESA',
};

/**
 * Datos mínimos para clasificar. Se recibe así —y no una `Venta`— para que
 * sirva igual con una entidad de TypeORM, con una fila cruda de SQL y con el
 * DTO que viaja al renderer.
 */
export interface DatosCanalVenta {
  /** `true` si la venta tiene mesa asignada. */
  tieneMesa: boolean;
  /** `Delivery.modo` de la venta, o null/undefined si no tiene delivery. */
  modoDelivery?: string | null;
  /** `true` si la venta tiene delivery, aunque no se conozca el modo. */
  tieneDelivery?: boolean;
}

/**
 * Clasifica una venta en su canal.
 *
 * El orden de las preguntas importa: el reparto gana sobre la mesa. Un delivery
 * no debería tener mesa, pero si por un arrastre de datos la tuviera, contarlo
 * como SALÓN lo borraría de los informes de delivery, que es justo lo que se
 * quiere evitar.
 *
 * Un delivery sin `modo` conocido cuenta como DELIVERY: es el default de la
 * columna y el sentido de todo lo anterior a que el RETIRO existiera.
 */
export function clasificarCanalVenta(datos: DatosCanalVenta): CanalVenta {
  const modo = String(datos.modoDelivery ?? '').toUpperCase();
  const conDelivery = datos.tieneDelivery ?? !!modo;
  if (modo === CanalVenta.RETIRO) return CanalVenta.RETIRO;
  if (conDelivery) return CanalVenta.DELIVERY;
  return datos.tieneMesa ? CanalVenta.SALON : CanalVenta.MOSTRADOR;
}

/**
 * Adaptador para una `Venta` de TypeORM (o el objeto plano que llega al
 * renderer). Tolera que `mesa` y `delivery` vengan sin cargar.
 */
export function canalDeVenta(venta: any): CanalVenta {
  return clasificarCanalVenta({
    tieneMesa: !!(venta?.mesa?.id ?? venta?.mesaId),
    tieneDelivery: !!(venta?.delivery?.id ?? venta?.deliveryId),
    modoDelivery: venta?.delivery?.modo ?? venta?.deliveryModo ?? null,
  });
}

/** `true` si el canal implica que alguien lleva o entrega el pedido. */
export function esCanalDeReparto(canal: CanalVenta): boolean {
  return canal === CanalVenta.DELIVERY || canal === CanalVenta.RETIRO;
}
