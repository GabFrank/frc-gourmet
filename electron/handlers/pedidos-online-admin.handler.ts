import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { In } from 'typeorm';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { ZonaDelivery } from '../../src/app/database/entities/pedidos-online/zona-delivery.entity';
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

// Transiciones válidas de la bandeja (avance del pedido). La cancelación de un
// pedido RECIBIDO/ACEPTADO se maneja con `rechazar-pedido-online` (con motivo),
// por eso CANCELADO no se ofrece acá.
const TRANSICIONES: Record<string, EstadoPedidoOnline[]> = {
  [EstadoPedidoOnline.ACEPTADO]: [EstadoPedidoOnline.EN_PREPARACION],
  [EstadoPedidoOnline.EN_PREPARACION]: [EstadoPedidoOnline.LISTO],
  [EstadoPedidoOnline.LISTO]: [EstadoPedidoOnline.EN_CAMINO, EstadoPedidoOnline.ENTREGADO],
  [EstadoPedidoOnline.EN_CAMINO]: [EstadoPedidoOnline.ENTREGADO],
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
    latitud: p.latitud != null ? Number(p.latitud) : null,
    longitud: p.longitud != null ? Number(p.longitud) : null,
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
  // Cuenta RECIBIDO + ACEPTADO sin venta materializada: así el staff también ve
  // señal de los pedidos auto-aceptados (que no pasan por RECIBIDO).
  ipcMain.handle('contar-pedidos-online-pendientes', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const count = await repo().count({
      where: { estado: In([EstadoPedidoOnline.RECIBIDO, EstadoPedidoOnline.ACEPTADO]) },
    });
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

  // ============== ZONAS DE DELIVERY (CRUD admin) ==============
  ipcMain.handle('get-zonas-delivery-admin', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const zonas = await dataSource.getRepository(ZonaDelivery).find({ order: { orden: 'ASC', nombre: 'ASC' } });
    return zonas.map((z) => ({
      id: z.id, nombre: z.nombre, tarifa: Number(z.tarifa), montoMinimo: Number(z.montoMinimo),
      activa: z.activa, orden: z.orden,
    }));
  });

  ipcMain.handle('guardar-zona-delivery', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repoZ = dataSource.getRepository(ZonaDelivery);
    const zona = data?.id ? await repoZ.findOne({ where: { id: data.id } }) : repoZ.create();
    if (!zona) return { success: false, error: 'zona_no_encontrada' };
    zona.nombre = String(data?.nombre || '').trim().toUpperCase();
    zona.tarifa = Number(data?.tarifa) || 0;
    zona.montoMinimo = Number(data?.montoMinimo) || 0;
    zona.activa = data?.activa !== false;
    zona.orden = Number(data?.orden) || 0;
    if (!zona.nombre) return { success: false, error: 'nombre_requerido' };
    const saved = await repoZ.save(zona);
    return { success: true, zona: { id: saved.id, nombre: saved.nombre, tarifa: Number(saved.tarifa), montoMinimo: Number(saved.montoMinimo), activa: saved.activa, orden: saved.orden } };
  });

  ipcMain.handle('eliminar-zona-delivery', async (_event: any, zonaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    await dataSource.getRepository(ZonaDelivery).delete({ id: zonaId });
    return { success: true };
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
