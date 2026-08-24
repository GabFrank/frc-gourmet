import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { In } from 'typeorm';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { ZonaDelivery } from '../../src/app/database/entities/pedidos-online/zona-delivery.entity';
import { EstadoPedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { ensurePermission } from '../utils/auth.utils';
import { materializarPedidoOnlineEnVenta } from './ventas.handler';
import { cancelarVentaCompletaEnTx } from '../utils/venta-reversa.utils';
import { invokeHandler } from '../utils/handler-registry';

/**
 * Pedidos online — Fase 4: BANDEJA en el PdV (admin, vía /api/rpc, permisos staff).
 *
 * Máquina de estados del pedido. ACEPTAR materializa: un solo clic cambia el
 * estado, crea la `Venta` y dispara cocina. Con el local lleno, obligar al
 * cajero a un segundo paso para mandar el pedido a la cocina no es operable.
 * La materialización es best-effort: si falla (no hay caja abierta, dos cajas
 * abiertas), el pedido igual queda ACEPTADO y se puede reintentar desde la
 * bandeja — nunca se pierde la aceptación por un problema de caja.
 *
 * Ver docs/arquitectura/webapp-pedidos-plan.md (Fase 4).
 */

const PERM_VER = 'PEDIDOS_ONLINE_VER';
const PERM_GESTIONAR = 'PEDIDOS_ONLINE_GESTIONAR';
// Las zonas son configuración del negocio, no operación: mismo criterio que
// `VENTAS_PDV_CONFIGURAR` para los precios de delivery del PdV.
const PERM_CONFIGURAR = 'PEDIDOS_ONLINE_CONFIGURAR';

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
    deliveryId: p.deliveryId ?? null,
    mesaId: p.mesaId ?? null,
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
    await ensurePermission(dataSource, getCurrentUser, PERM_VER);
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
    await ensurePermission(dataSource, getCurrentUser, PERM_VER);
    const count = await repo().count({
      where: { estado: In([EstadoPedidoOnline.RECIBIDO, EstadoPedidoOnline.ACEPTADO]) },
    });
    return { pendientes: count };
  });

  // ============== ACEPTAR ==============
  ipcMain.handle('aceptar-pedido-online', async (_event: any, pedidoId: number, data?: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_GESTIONAR);
    const pedido = await repo().findOne({ where: { id: pedidoId }, relations: ['items'] });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    if (pedido.estado !== EstadoPedidoOnline.RECIBIDO) {
      return { success: false, error: 'estado_invalido', estadoActual: pedido.estado };
    }
    pedido.estado = EstadoPedidoOnline.ACEPTADO;
    pedido.fechaAceptado = new Date();
    // Vínculo a una venta ya creada a mano (compat; el camino normal materializa acá).
    if (data?.ventaId) pedido.ventaId = data.ventaId;
    const saved = await repo().save(pedido);

    // Materializar en la misma acción: crear la Venta y mandar a cocina.
    // Best-effort a propósito: un problema de caja no debe deshacer la
    // aceptación, que ya es visible para el cliente.
    let ventaId: number | null = saved.ventaId ?? null;
    let errorMaterializacion: string | null = null;
    if (!ventaId) {
      try {
        const mat = await materializarPedidoOnlineEnVenta(
          dataSource,
          saved.id,
          data?.cajaId ? { cajaId: Number(data.cajaId) } : undefined,
          getCurrentUser()?.id,
        );
        ventaId = mat?.ventaId ?? null;
      } catch (e) {
        errorMaterializacion = (e as Error)?.message || 'error_materializando';
        console.warn('[aceptar-pedido-online] materialización falló:', errorMaterializacion);
      }
    }

    const final = await repo().findOne({ where: { id: pedidoId } });
    return {
      success: true,
      pedido: mapPedidoAdmin(final || saved),
      ventaId,
      errorMaterializacion,
    };
  });

  // ============== VINCULAR VENTA (tras crearla en el PdV) ==============
  ipcMain.handle('vincular-venta-pedido-online', async (_event: any, pedidoId: number, ventaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_GESTIONAR);
    const pedido = await repo().findOne({ where: { id: pedidoId } });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    pedido.ventaId = ventaId;
    await repo().save(pedido);
    return { success: true };
  });

  // ============== RECHAZAR ==============
  // Estados desde los que se puede cancelar. Incluye EN_PREPARACION y LISTO a
  // propósito: como aceptar ahora materializa, el camino normal deja el pedido
  // en EN_PREPARACION de inmediato, y limitar el rechazo a RECIBIDO/ACEPTADO
  // dejaba sin salida el caso más común — el cliente se arrepiente o el local no
  // puede cumplirlo con la comida ya en la plancha. ENTREGADO no se cancela: el
  // pedido ya salió; eso se resuelve con una devolución, no acá.
  const ESTADOS_CANCELABLES = [
    EstadoPedidoOnline.RECIBIDO,
    EstadoPedidoOnline.ACEPTADO,
    EstadoPedidoOnline.EN_PREPARACION,
    EstadoPedidoOnline.LISTO,
  ];

  ipcMain.handle('rechazar-pedido-online', async (_event: any, pedidoId: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_GESTIONAR);
    const pedido = await repo().findOne({ where: { id: pedidoId } });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    if (!ESTADOS_CANCELABLES.includes(pedido.estado)) {
      return { success: false, error: 'estado_no_rechazable', estadoActual: pedido.estado };
    }

    const motivoNormalizado = motivo ? String(motivo).toUpperCase() : 'SIN MOTIVO';
    const usuarioId = getCurrentUser()?.id;

    // Si el pedido ya se materializó hay una Venta viva detrás: cancelar sólo el
    // pedido dejaría al local cobrando algo que el cliente da por cancelado, y
    // con el stock ya descontado si además estaba cobrada. La reversa y el
    // cambio de estado van en UNA transacción: o se cancelan las dos cosas o
    // ninguna.
    let reversa: any = null;
    await dataSource.transaction(async (manager) => {
      if (pedido.ventaId) {
        reversa = await cancelarVentaCompletaEnTx(manager, dataSource, pedido.ventaId, {
          usuarioId,
          motivo: motivoNormalizado,
        });
      }
      pedido.estado = EstadoPedidoOnline.RECHAZADO;
      pedido.motivoRechazo = motivoNormalizado;
      await manager.getRepository(PedidoOnline).save(pedido);
    });

    const saved = await repo().findOne({ where: { id: pedidoId } });
    return { success: true, pedido: mapPedidoAdmin(saved || pedido), reversa };
  });

  // ============== ZONAS DE DELIVERY (CRUD admin) ==============
  const mapZona = (z: any) => ({
    id: z.id,
    nombre: z.nombre,
    tarifa: Number(z.tarifa),
    montoMinimo: Number(z.montoMinimo),
    activa: z.activa,
    orden: z.orden,
    poligono: z.poligono ?? null,
    precioDeliveryId: z.precioDelivery?.id ?? null,
  });

  ipcMain.handle('get-zonas-delivery-admin', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const zonas = await dataSource.getRepository(ZonaDelivery).find({
      order: { orden: 'ASC', nombre: 'ASC' },
      relations: ['precioDelivery'],
    });
    return zonas.map(mapZona);
  });

  ipcMain.handle('guardar-zona-delivery', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const repoZ = dataSource.getRepository(ZonaDelivery);
    const zona = data?.id ? await repoZ.findOne({ where: { id: data.id } }) : repoZ.create();
    if (!zona) return { success: false, error: 'zona_no_encontrada' };
    zona.nombre = String(data?.nombre || '').trim().toUpperCase();
    zona.tarifa = Number(data?.tarifa) || 0;
    zona.montoMinimo = Number(data?.montoMinimo) || 0;
    zona.activa = data?.activa !== false;
    zona.orden = Number(data?.orden) || 0;
    // Polígono dibujado en el mapa (GeoJSON en texto). Se valida que parsee y que
    // sea una geometría de área: guardar un GeoJSON roto dejaría la zona muda —
    // no resolvería nunca y el pedido caería en "fuera de cobertura" sin que
    // nadie entienda por qué.
    if (data?.poligono !== undefined) {
      const crudo = data.poligono;
      if (!crudo) {
        zona.poligono = null;
      } else {
        const texto = typeof crudo === 'string' ? crudo : JSON.stringify(crudo);
        let geo: any;
        try { geo = JSON.parse(texto); } catch { return { success: false, error: 'poligono_invalido' }; }
        const g = geo?.type === 'Feature' ? geo.geometry : geo;
        if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon') || !Array.isArray(g.coordinates)) {
          return { success: false, error: 'poligono_invalido' };
        }
        zona.poligono = texto;
      }
    }
    if (data?.precioDeliveryId !== undefined) {
      zona.precioDelivery = data.precioDeliveryId ? ({ id: Number(data.precioDeliveryId) } as any) : null;
    }
    if (!zona.nombre) return { success: false, error: 'nombre_requerido' };
    const saved = await repoZ.save(zona);
    return { success: true, zona: mapZona(saved) };
  });

  ipcMain.handle('eliminar-zona-delivery', async (_event: any, zonaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    await dataSource.getRepository(ZonaDelivery).delete({ id: zonaId });
    return { success: true };
  });

  // ============== AVANZAR ESTADO ==============
  ipcMain.handle('avanzar-estado-pedido-online', async (_event: any, pedidoId: number, nuevoEstado: string, data?: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_GESTIONAR);
    const pedido = await repo().findOne({ where: { id: pedidoId } });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };

    const permitidos = TRANSICIONES[pedido.estado] || [];
    if (!permitidos.includes(nuevoEstado as EstadoPedidoOnline)) {
      return { success: false, error: 'transicion_invalida', estadoActual: pedido.estado, permitidos };
    }

    // Si el pedido tiene un Delivery detrás, la transición equivalente se delega
    // al módulo de delivery en vez de duplicar sus reglas acá. Eso mantiene una
    // sola máquina de estados: sin esto, marcar ENTREGADO desde la bandeja
    // saltaba el guard de "la venta tiene que estar cobrada" que ese módulo ya
    // impone, y reintroducía por la puerta de atrás un bug que cerró el 2026-08-24.
    // Si el delivery rechaza la transición, el pedido tampoco avanza.
    const ESTADO_DELIVERY_EQUIVALENTE: Partial<Record<string, string>> = {
      [EstadoPedidoOnline.LISTO]: 'PARA_ENTREGA',
      [EstadoPedidoOnline.EN_CAMINO]: 'EN_CAMINO',
      [EstadoPedidoOnline.ENTREGADO]: 'ENTREGADO',
    };
    const destinoDelivery = ESTADO_DELIVERY_EQUIVALENTE[nuevoEstado];
    if (pedido.deliveryId && destinoDelivery) {
      try {
        await invokeHandler('delivery-cambiar-estado', pedido.deliveryId, destinoDelivery, {
          funcionarioId: data?.funcionarioId,
        });
      } catch (e) {
        return {
          success: false,
          error: 'delivery_rechazo_transicion',
          detalle: (e as Error)?.message || String(e),
          estadoActual: pedido.estado,
        };
      }
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
