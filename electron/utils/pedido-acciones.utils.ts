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

/**
 * F10: lo que el diálogo de delivery necesita saber del pedido web de una fila. El diálogo es la
 * pantalla de atención; la bandeja sigue viva como panel de observación. Cualquier regla de
 * atención nueva va en las DOS (ver domains/pedidos-online.md, «Dos pantallas, un pedido»).
 */
export function resumenPedidoWeb(p: {
  id: number; numero: string; estado: string; tipoPedido?: string | null; estadoPago?: string | null;
  pagoMonto?: any; pagoId?: string | null; cancelacionSolicitadaEn?: any; cancelacionMotivo?: string | null;
  cancelacionRespuesta?: string | null;
}) {
  return {
    id: p.id,
    numero: p.numero,
    estado: p.estado,
    tipoPedido: p.tipoPedido ?? null,
    estadoPago: p.estadoPago ?? null,
    pagoMonto: p.pagoMonto != null ? Number(p.pagoMonto) : null,
    pagoId: p.pagoId ?? null,
    pideCancelar: !!p.cancelacionSolicitadaEn && ESTADOS_CANCELABLES_CLIENTE.includes(p.estado as EstadoPedidoOnline),
    cancelacionMotivo: p.cancelacionMotivo ?? null,
    cancelacionRespuesta: p.cancelacionRespuesta ?? null,
  };
}

/**
 * F10: qué espera a alguien en la cola de atención (diálogo de delivery y contador del PdV).
 * Un pedido puede caer en una sola: se toma la primera que aplica, en este orden.
 * - CANCELACION: el cliente pidió cancelar y no se le respondió.
 * - NUEVO: espera que el local lo acepte.
 * - SIN_COCINA: aceptado pero no llegó a crear su venta (p. ej. sin caja abierta). Los de mesa
 *   se atienden desde el PdV de la mesa, no desde acá.
 * - DEVOLVER: se cobró online y se canceló: hay que devolver desde uPay.
 */
export type MotivoAtencion = 'CANCELACION' | 'NUEVO' | 'SIN_COCINA' | 'DEVOLVER';

export function motivoAtencion(p: {
  estado: string; tipoPedido?: string | null; ventaId?: number | null; mesaId?: number | null;
  estadoPago?: string | null; cancelacionSolicitadaEn?: any;
}): MotivoAtencion | null {
  if (p.cancelacionSolicitadaEn && ESTADOS_CANCELABLES_CLIENTE.includes(p.estado as EstadoPedidoOnline)) return 'CANCELACION';
  if (p.estado === EstadoPedidoOnline.RECIBIDO && p.tipoPedido !== TipoPedidoOnline.MESA_QR) return 'NUEVO';
  if (p.estado === EstadoPedidoOnline.ACEPTADO && !p.ventaId && !p.mesaId && p.tipoPedido !== TipoPedidoOnline.MESA_QR) return 'SIN_COCINA';
  if (p.estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE) return 'DEVOLVER';
  return null;
}

/** El mismo criterio que `motivoAtencion`, como WHERE (alias `p`) para listar y contar. */
export const WHERE_ATENCION = `(
  (p.cancelacion_solicitada_en IS NOT NULL AND p.estado IN (:...atCanc))
  OR (p.estado = :atRecibido AND p.tipo_pedido <> :atMesa)
  OR (p.estado = :atAceptado AND p.venta_id IS NULL AND p.mesa_id IS NULL AND p.tipo_pedido <> :atMesa)
  OR p.estado_pago = :atDevolver
)`;
export const PARAMS_ATENCION = {
  atCanc: ESTADOS_CANCELABLES_CLIENTE,
  atRecibido: EstadoPedidoOnline.RECIBIDO,
  atAceptado: EstadoPedidoOnline.ACEPTADO,
  atMesa: TipoPedidoOnline.MESA_QR,
  atDevolver: EstadoPagoOnline.REEMBOLSO_PENDIENTE,
};
