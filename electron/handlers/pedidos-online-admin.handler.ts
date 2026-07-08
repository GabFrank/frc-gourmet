import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { EstadoPedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { ensurePermission } from '../utils/auth.utils';

/**
 * Pedidos online — Fase 4: BANDEJA en el PdV (admin, vía /api/rpc, permisos staff).
 *
 * Máquina de estados del pedido. La MATERIALIZACIÓN en `Venta` se hace con el
 * flujo probado del PdV (el inbox abre el pedido pre-cargado); acá se registra
 * la transición y el vínculo `ventaId`, evitando un pipeline de venta paralelo.
 *
 * Ver docs/arquitectura/webapp-pedidos-plan.md (Fase 4).
 */

const PERM = 'VENTAS_PDV';

// Transiciones válidas de la bandeja.
const TRANSICIONES: Record<string, EstadoPedidoOnline[]> = {
  [EstadoPedidoOnline.ACEPTADO]: [EstadoPedidoOnline.EN_PREPARACION, EstadoPedidoOnline.CANCELADO],
  [EstadoPedidoOnline.EN_PREPARACION]: [EstadoPedidoOnline.LISTO, EstadoPedidoOnline.CANCELADO],
  [EstadoPedidoOnline.LISTO]: [EstadoPedidoOnline.EN_CAMINO, EstadoPedidoOnline.ENTREGADO, EstadoPedidoOnline.CANCELADO],
  [EstadoPedidoOnline.EN_CAMINO]: [EstadoPedidoOnline.ENTREGADO, EstadoPedidoOnline.CANCELADO],
};

function mapPedidoAdmin(p: PedidoOnline): any {
  return {
    id: p.id,
    numero: p.numero,
    estado: p.estado,
    tipoPedido: p.tipoPedido,
    canalOrigen: p.canalOrigen,
    metodoPago: p.metodoPago,
    nombreCliente: p.nombreCliente ?? null,
    telefonoCliente: p.telefonoCliente ?? null,
    subtotal: Number(p.subtotal),
    costoEnvio: Number(p.costoEnvio),
    total: Number(p.total),
    direccionEntrega: p.direccionEntrega ?? null,
    referenciaDireccion: p.referenciaDireccion ?? null,
    notas: p.notas ?? null,
    ventaId: p.ventaId ?? null,
    zonaDelivery: p.zonaDelivery ? { id: p.zonaDelivery.id, nombre: p.zonaDelivery.nombre } : null,
    fechaProgramada: p.fechaProgramada ?? null,
    fechaAceptado: p.fechaAceptado ?? null,
    fechaListo: p.fechaListo ?? null,
    fechaEntregado: p.fechaEntregado ?? null,
    createdAt: p.createdAt,
    items: (p.items || []).map((it) => ({
      id: it.id,
      productoId: it.productoId,
      presentacionId: it.presentacionId ?? null,
      nombreProducto: it.nombreProducto,
      nombrePresentacion: it.nombrePresentacion ?? null,
      cantidad: Number(it.cantidad),
      precioUnitario: Number(it.precioUnitario),
      subtotal: Number(it.subtotal),
      personalizacion: it.personalizacion ? safeParse(it.personalizacion) : null,
    })),
  };
}

export function registerPedidosOnlineAdminHandlers(
  dataSource: DataSource,
  getCurrentUser: () => any,
): void {
  const repo = () => dataSource.getRepository(PedidoOnline);

  // ============== LISTA (bandeja) ==============
  ipcMain.handle('get-pedidos-online-admin', async (_event: any, filtros?: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const qb = repo()
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.items', 'items')
      .leftJoinAndSelect('p.zonaDelivery', 'zona')
      .orderBy('p.createdAt', 'DESC')
      .take(filtros?.take || 100);

    if (filtros?.estado) {
      qb.andWhere('p.estado = :estado', { estado: filtros.estado });
    } else if (filtros?.estados?.length) {
      qb.andWhere('p.estado IN (:...estados)', { estados: filtros.estados });
    }
    const pedidos = await qb.getMany();
    return pedidos.map(mapPedidoAdmin);
  });

  // ============== CONTADOR DE PENDIENTES (badge/sonido) ==============
  ipcMain.handle('contar-pedidos-online-pendientes', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const count = await repo().count({ where: { estado: EstadoPedidoOnline.RECIBIDO } });
    return { pendientes: count };
  });

  // ============== ACEPTAR ==============
  ipcMain.handle('aceptar-pedido-online', async (_event: any, pedidoId: number, data?: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const pedido = await repo().findOne({ where: { id: pedidoId }, relations: ['items'] });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    if (pedido.estado !== EstadoPedidoOnline.RECIBIDO) {
      return { success: false, error: 'estado_invalido', estadoActual: pedido.estado };
    }
    pedido.estado = EstadoPedidoOnline.ACEPTADO;
    pedido.fechaAceptado = new Date();
    // Vínculo a la venta creada en el flujo del PdV (opcional; se puede setear luego).
    if (data?.ventaId) pedido.ventaId = data.ventaId;
    const saved = await repo().save(pedido);
    return { success: true, pedido: mapPedidoAdmin(saved) };
  });

  // ============== VINCULAR VENTA (tras crearla en el PdV) ==============
  ipcMain.handle('vincular-venta-pedido-online', async (_event: any, pedidoId: number, ventaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const pedido = await repo().findOne({ where: { id: pedidoId } });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    pedido.ventaId = ventaId;
    await repo().save(pedido);
    return { success: true };
  });

  // ============== RECHAZAR ==============
  ipcMain.handle('rechazar-pedido-online', async (_event: any, pedidoId: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const pedido = await repo().findOne({ where: { id: pedidoId } });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    if (![EstadoPedidoOnline.RECIBIDO, EstadoPedidoOnline.ACEPTADO].includes(pedido.estado)) {
      return { success: false, error: 'estado_no_rechazable', estadoActual: pedido.estado };
    }
    pedido.estado = EstadoPedidoOnline.RECHAZADO;
    pedido.motivoRechazo = motivo ? String(motivo).toUpperCase() : 'SIN MOTIVO';
    const saved = await repo().save(pedido);
    return { success: true, pedido: mapPedidoAdmin(saved) };
  });

  // ============== AVANZAR ESTADO ==============
  ipcMain.handle('avanzar-estado-pedido-online', async (_event: any, pedidoId: number, nuevoEstado: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const pedido = await repo().findOne({ where: { id: pedidoId } });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };

    const permitidos = TRANSICIONES[pedido.estado] || [];
    if (!permitidos.includes(nuevoEstado as EstadoPedidoOnline)) {
      return { success: false, error: 'transicion_invalida', estadoActual: pedido.estado, permitidos };
    }
    pedido.estado = nuevoEstado as EstadoPedidoOnline;
    if (nuevoEstado === EstadoPedidoOnline.LISTO) pedido.fechaListo = new Date();
    if (nuevoEstado === EstadoPedidoOnline.ENTREGADO) pedido.fechaEntregado = new Date();
    const saved = await repo().save(pedido);
    return { success: true, pedido: mapPedidoAdmin(saved) };
  });
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
