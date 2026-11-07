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
  // F8: se pagan al recibir / retirar (el repartidor o la caja los cobran).
  TARJETA_POS = 'TARJETA_POS',
  QR = 'QR',
  PIX = 'PIX',
  TRANSFERENCIA = 'TRANSFERENCIA',
  // F8b: a cuenta del cliente vinculado (crédito). La deuda nace al aceptar el pedido.
  CREDITO = 'CREDITO',
}

/** F8: cuándo paga el cliente. Online = antes (uPay); al recibir = en la entrega o el retiro. */
export enum PagoModalidad {
  AL_RECIBIR = 'AL_RECIBIR',
  ONLINE = 'ONLINE',
  /** F8b: a cuenta (crédito del cliente vinculado). */
  A_CUENTA = 'A_CUENTA',
}

/** F8: métodos que el local puede ofrecer para pagar al recibir (interruptores en la config). */
export const METODOS_AL_RECIBIR: MetodoPagoOnline[] = [
  MetodoPagoOnline.EFECTIVO, MetodoPagoOnline.TARJETA_POS, MetodoPagoOnline.QR,
  MetodoPagoOnline.PIX, MetodoPagoOnline.TRANSFERENCIA,
];

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
  /** La devolución automática está en curso (reclamada antes de llamar al proveedor). Segundos. */
  DEVOLVIENDO = 'DEVOLVIENDO',
  DEVUELTO = 'DEVUELTO',
  /** Se canceló y el local registró que el cobro no llegó a entrar (uPay no lo acreditó o se anuló allá). */
  NO_ACREDITADO = 'NO_ACREDITADO',
  /** Se canceló y el local decidió no devolver el cobro (con motivo). */
  RETENIDO = 'RETENIDO',
}

/**
 * Qué se hace con lo cobrado online al cancelar un pedido pagado (o al resolver una devolución
 * pendiente). La elige quien cancela; sin elección, se devuelve (lo de siempre).
 */
export enum DecisionPagoOnline {
  DEVOLVER = 'DEVOLVER',
  YA_DEVUELTO = 'YA_DEVUELTO',
  NO_ENTRO = 'NO_ENTRO',
  NO_SE_DEVUELVE = 'NO_SE_DEVUELVE',
}

/** Forma de pago (formas_pago.nombre) del cobro con tarjeta por la tienda. La siembra TiendaPagoOnline. */
export const FORMA_PAGO_UPAY = 'UPAY ONLINE';
/** Forma de pago del cobro online con Bancard vPOS. La siembra TiendaPagoProveedores. */
export const FORMA_PAGO_BANCARD = 'BANCARD ONLINE';
/** Métodos que son un PROVEEDOR de pago online (el cliente paga antes, en su página/formulario). */
export const METODOS_PAGO_ONLINE: string[] = ['UPAY', 'BANCARD'];
export function esMetodoPagoOnline(m: string | null | undefined): boolean {
  return METODOS_PAGO_ONLINE.includes(String(m || '').toUpperCase());
}
/** Formas de pago de los cobros online (no se ofrecen a mano en el PdV). */
export const FORMAS_PAGO_ONLINE: string[] = [FORMA_PAGO_UPAY, FORMA_PAGO_BANCARD];
