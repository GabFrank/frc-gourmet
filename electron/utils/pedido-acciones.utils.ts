/**
 * Tienda online F9: qué puede hacer el cliente con su pedido. Lo decide el SERVIDOR (la tienda
 * sólo muestra los botones que vienen en `acciones`); las operaciones vuelven a validar con un
 * update condicionado, así que un botón viejo en pantalla no alcanza para saltarse la regla.
 *
 * Decisiones del propietario (05/11):
 * - Cancelar es SIEMPRE una solicitud que el local aprueba o rechaza.
 * - Excepción: «Modificar» (cancelar y volver al carrito) es inmediato, pero sólo mientras el
 *   pedido espera confirmación y no hay nada armado detrás (sin venta, sin cobro online).
 */
import { EstadoPagoOnline, EstadoPedidoOnline, TipoPedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';

/** Los mismos que acepta `rechazar-pedido-online` (la aprobación pasa por ahí). */
export const ESTADOS_CANCELABLES_CLIENTE: EstadoPedidoOnline[] = [
  EstadoPedidoOnline.RECIBIDO,
  EstadoPedidoOnline.ACEPTADO,
  EstadoPedidoOnline.EN_PREPARACION,
  EstadoPedidoOnline.LISTO,
];

export interface AccionesPedido {
  solicitarCancelacion: boolean;
  modificar: boolean;
  repetir: boolean;
  compartir: boolean;
}

export function accionesPedido(p: {
  estado: string; tipoPedido?: string | null; ventaId?: number | null; mesaId?: number | null;
  estadoPago?: string | null; cancelacionSolicitadaEn?: any; cancelacionRespuesta?: string | null;
}): AccionesPedido {
  const pendiente = !!p.cancelacionSolicitadaEn;
  const yaRechazada = !!p.cancelacionRespuesta;
  // En la mesa los pedidos comparten la cuenta: una vez en la venta se quitan desde el PdV
  // (`rechazar-pedido-online` lo impide con `mesa_ya_materializada`). Se pide al mozo.
  const mesaEnCuenta = !!p.mesaId && !!p.ventaId;
  const solicitarCancelacion = ESTADOS_CANCELABLES_CLIENTE.includes(p.estado as EstadoPedidoOnline)
    && !pendiente && !yaRechazada && !mesaEnCuenta;
  // Modificar cancela al instante: sólo si no hay venta, ni cobro online hecho o en curso (un pago
  // tardío caería sobre un pedido cancelado), ni una solicitud ya en manos del local.
  const pagoOnline = p.estadoPago === EstadoPagoOnline.PAGADO || p.estadoPago === EstadoPagoOnline.PENDIENTE;
  // Tampoco si el local ya dijo que no a una cancelación: modificar es cancelar (auditoría F9).
  const modificar = p.estado === EstadoPedidoOnline.RECIBIDO && !p.ventaId && !pagoOnline && !pendiente && !yaRechazada
    && p.tipoPedido !== TipoPedidoOnline.MESA_QR;
  return { solicitarCancelacion, modificar, repetir: true, compartir: true };
}

/** Motivo del cliente: sin caracteres de control, en MAYÚSCULAS, hasta 200. Vacío → null. */
export function limpiarMotivo(v: any): string | null {
  const t = v == null ? '' : String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().toUpperCase().slice(0, 200);
  return t || null;
}

/**
 * Cambios a aplicar cuando el pedido pasa a `destino`: si tenía una solicitud de cancelación sin
 * responder y ya salió (EN_CAMINO / ENTREGADO), se cierra con una respuesta para el cliente. En
 * un cancelado o rechazado no hace falta (el pedido ya terminó). Vacío si no corresponde.
 */
export function cierreSolicitudAlSalir(
  p: { cancelacionSolicitadaEn?: any },
  destino: string,
): { cancelacionSolicitadaEn?: null; cancelacionRespuesta?: string } {
  if (!p.cancelacionSolicitadaEn) return {};
  if (ESTADOS_CANCELABLES_CLIENTE.includes(destino as EstadoPedidoOnline)) return {};
  if (destino === EstadoPedidoOnline.CANCELADO || destino === EstadoPedidoOnline.RECHAZADO) return {};
  return { cancelacionSolicitadaEn: null, cancelacionRespuesta: 'EL PEDIDO YA HABÍA SALIDO' };
}
