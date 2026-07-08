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
