import { EntityManager } from 'typeorm';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import {
  EstadoPagoOnline,
  EstadoPedidoOnline,
  TipoPedidoOnline,
} from '../../src/app/database/entities/pedidos-online/pedido-online.enums';

/**
 * Lleva el estado del pedido online detrás de lo que pasa en el PdV.
 *
 * El cajero no opera desde la bandeja de pedidos online: mueve el delivery (o el
 * retiro) desde su panel y cobra la mesa en la mesa. Sin esto el pedido quedaba
 * EN_PREPARACION para siempre y el cliente lo veía así en «Mis pedidos».
 *
 * Reglas:
 * - Sólo avanza: un pedido nunca retrocede de estado.
 * - Un pedido terminado (ENTREGADO, RECHAZADO, CANCELADO) no se toca.
 * - Cada pedido se actualiza condicionado a su estado leído: si cambió en el
 *   medio (la bandeja lo movió), esa fila se deja como está.
 * - Corre con el `manager` del llamador, dentro de su transacción cuando la hay.
 */

const ORDEN: Partial<Record<EstadoPedidoOnline, number>> = {
  [EstadoPedidoOnline.PENDIENTE_PAGO]: 0,
  [EstadoPedidoOnline.RECIBIDO]: 1,
  [EstadoPedidoOnline.ACEPTADO]: 2,
  [EstadoPedidoOnline.EN_PREPARACION]: 3,
  [EstadoPedidoOnline.LISTO]: 4,
  [EstadoPedidoOnline.EN_CAMINO]: 5,
  [EstadoPedidoOnline.ENTREGADO]: 6,
};

const TERMINALES = [EstadoPedidoOnline.ENTREGADO, EstadoPedidoOnline.RECHAZADO, EstadoPedidoOnline.CANCELADO];

/** Estado del delivery (PdV) → estado del pedido online. ABIERTO no mueve nada. */
export const PEDIDO_POR_ESTADO_DELIVERY: Record<string, EstadoPedidoOnline | undefined> = {
  PARA_ENTREGA: EstadoPedidoOnline.LISTO,
  EN_CAMINO: EstadoPedidoOnline.EN_CAMINO,
  ENTREGADO: EstadoPedidoOnline.ENTREGADO,
  CANCELADO: EstadoPedidoOnline.CANCELADO,
};

export interface FiltroPedidosSync {
  deliveryId?: number;
  ventaId?: number;
  /** Limita a un tipo de pedido (p. ej. MESA_QR al cobrar la cuenta de la mesa). */
  tipoPedido?: TipoPedidoOnline;
}

/** Devuelve cuántos pedidos cambiaron de estado. */
export async function sincronizarPedidosOnline(
  manager: EntityManager,
  filtro: FiltroPedidosSync,
  destino: EstadoPedidoOnline,
  opts?: { motivo?: string },
): Promise<number> {
  const where: any = {};
  if (filtro.deliveryId) where.deliveryId = filtro.deliveryId;
  if (filtro.ventaId) where.ventaId = filtro.ventaId;
  if (!where.deliveryId && !where.ventaId) return 0;
  if (filtro.tipoPedido) where.tipoPedido = filtro.tipoPedido;

  const repo = manager.getRepository(PedidoOnline);
  const pedidos = await repo.find({ where });
  let cambiados = 0;
  for (const p of pedidos) {
    if (TERMINALES.includes(p.estado)) continue;
    const cancela = destino === EstadoPedidoOnline.CANCELADO;
    if (!cancela && (ORDEN[destino] ?? -1) <= (ORDEN[p.estado] ?? 99)) continue;

    const cambios: any = { estado: destino };
    const ahora = new Date();
    if (destino === EstadoPedidoOnline.LISTO) cambios.fechaListo = ahora;
    if (destino === EstadoPedidoOnline.ENTREGADO) {
      cambios.fechaEntregado = ahora;
      if (!p.fechaListo) cambios.fechaListo = ahora;
    }
    if (cancela) {
      cambios.motivoRechazo = (opts?.motivo || 'CANCELADO EN EL PDV').toUpperCase();
      // Mismo criterio que el rechazo desde la bandeja: lo cobrado online queda para devolver.
      if (p.estadoPago === EstadoPagoOnline.PAGADO) cambios.estadoPago = EstadoPagoOnline.REEMBOLSO_PENDIENTE;
    }
    const r = await repo.createQueryBuilder().update(PedidoOnline).set(cambios)
      .where('id = :id AND estado = :estado', { id: p.id, estado: p.estado })
      .execute();
    if (r.affected) cambiados++;
  }
  return cambiados;
}

/**
 * Al cerrar la cuenta de una venta: cobrada, los pedidos de mesa quedan
 * ENTREGADOS (en la mesa no hay delivery que lo marque); cancelada, se cancelan
 * todos los pedidos que sigan vivos sobre ella.
 */
export async function sincronizarPedidosPorCierreDeVenta(
  manager: EntityManager,
  ventaId: number,
  estadoVenta: string,
): Promise<number> {
  if (estadoVenta === 'CONCLUIDA') {
    return sincronizarPedidosOnline(manager, { ventaId, tipoPedido: TipoPedidoOnline.MESA_QR }, EstadoPedidoOnline.ENTREGADO);
  }
  if (estadoVenta === 'CANCELADA') {
    return sincronizarPedidosOnline(manager, { ventaId }, EstadoPedidoOnline.CANCELADO, { motivo: 'VENTA CANCELADA EN EL PDV' });
  }
  return 0;
}

/**
 * Transferencia de mesa: si la cuenta origen se cerró, sus pedidos pasan a la
 * venta destino, que es la que se va a cobrar. La mesa donde se pidió no cambia.
 */
export async function reapuntarPedidosDeVenta(manager: EntityManager, ventaOrigenId: number, ventaDestinoId: number): Promise<void> {
  if (!ventaOrigenId || !ventaDestinoId || ventaOrigenId === ventaDestinoId) return;
  await manager.getRepository(PedidoOnline).createQueryBuilder().update(PedidoOnline)
    .set({ ventaId: ventaDestinoId } as any)
    .where('venta_id = :o', { o: ventaOrigenId })
    .execute();
}
