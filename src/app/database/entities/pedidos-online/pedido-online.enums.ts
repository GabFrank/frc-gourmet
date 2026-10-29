/** Enums del dominio de pedidos online (web app). */

export enum TipoPedidoOnline {
  PICKUP = 'PICKUP',
  DELIVERY = 'DELIVERY',
  MESA_QR = 'MESA_QR',
}

/**
 * Ciclo de vida del pedido online. Antes de ACEPTADO es un "envelope" pendiente
 * de revisión en el PdV; al aceptar se materializa en una `Venta`.
 */
export enum EstadoPedidoOnline {
  /** F4: pago online iniciado y todavía no confirmado. No se acepta ni va a cocina. */
  PENDIENTE_PAGO = 'PENDIENTE_PAGO',
  RECIBIDO = 'RECIBIDO',
  ACEPTADO = 'ACEPTADO',
  EN_PREPARACION = 'EN_PREPARACION',
  LISTO = 'LISTO',
  EN_CAMINO = 'EN_CAMINO',
  ENTREGADO = 'ENTREGADO',
  RECHAZADO = 'RECHAZADO',
  CANCELADO = 'CANCELADO',
}

export enum CanalPedidoOnline {
  WEB = 'WEB',
  QR_MESA = 'QR_MESA',
  WHATSAPP = 'WHATSAPP',
}

export enum MetodoPagoOnline {
  EFECTIVO = 'EFECTIVO',
  BANCARD = 'BANCARD',
  UPAY = 'UPAY',
  PAGOPAR = 'PAGOPAR',
}

/**
 * Estado del pago online (PLAN-tienda-online F4). `null` en pedidos en efectivo.
 * Solo PAGADO habilita el pedido; lo desconocido sigue PENDIENTE.
 */
export enum EstadoPagoOnline {
  PENDIENTE = 'PENDIENTE',
  PAGADO = 'PAGADO',
  FALLIDO = 'FALLIDO',
  EXPIRADO = 'EXPIRADO',
  /** Cobrado pero el pedido no sigue (rechazado, vencido o pago tardío): devolver en uPay. */
  REEMBOLSO_PENDIENTE = 'REEMBOLSO_PENDIENTE',
  DEVUELTO = 'DEVUELTO',
}

/** Forma de pago (formas_pago.nombre) del cobro con tarjeta por la tienda. La siembra TiendaPagoOnline. */
export const FORMA_PAGO_UPAY = 'UPAY ONLINE';
