import {
  EstadoPagoOnline, EstadoPedidoOnline, TipoPedidoOnline, esMetodoPagoOnline,
} from '../../src/app/database/entities/pedidos-online/pedido-online.enums';

/**
 * F5 (auditoría C1): por qué un pedido online NO puede pasar a venta/cocina, o null si puede.
 * - Con tarjeta online (uPay, Bancard…): solo con el pago confirmado (PAGADO).
 * - ACEPTADO: sí. RECIBIDO: solo de mesa (QR) o con aceptación automática del local.
 * - Cualquier otro estado (PENDIENTE_PAGO, RECHAZADO, CANCELADO, en curso...): no.
 */
export function motivoNoMaterializable(
  p: { estado: string; tipoPedido: string; mesaId?: number | null; metodoPago: string; estadoPago?: string | null; pagoModalidad?: string | null },
  aceptacionAutomatica: boolean,
): string | null {
  if (p.estado === EstadoPedidoOnline.RECHAZADO || p.estado === EstadoPedidoOnline.CANCELADO) {
    return 'pedido_rechazado_durante_materializacion';
  }
  // Pagado online (cualquier proveedor): solo con el cobro confirmado.
  if ((esMetodoPagoOnline(p.metodoPago) || p.pagoModalidad === 'ONLINE') && p.estadoPago !== EstadoPagoOnline.PAGADO) {
    return 'pedido_sin_pago_confirmado';
  }
  if (p.estado === EstadoPedidoOnline.ACEPTADO) return null;
  if (p.estado === EstadoPedidoOnline.RECIBIDO) {
    const esMesa = !!p.mesaId || p.tipoPedido === TipoPedidoOnline.MESA_QR;
    return esMesa || aceptacionAutomatica ? null : 'pedido_no_aceptado';
  }
  return 'pedido_en_estado_no_materializable';
}
