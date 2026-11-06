import { avisarReembolso, marcarDevuelto } from '../services/pagos-online/pagos-online.service';
import { cierreSolicitudAlSalir, ESTADOS_CANCELABLES_CLIENTE, limpiarMotivo, motivoAtencion, WHERE_ATENCION, PARAMS_ATENCION } from '../utils/pedido-acciones.utils';

class PedidoCambioError extends Error { constructor() { super('pedido_cambio_reintentar'); } }
import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { In, Not } from 'typeorm';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { ZonaDelivery } from '../../src/app/database/entities/pedidos-online/zona-delivery.entity';
import { TiendaCategoria, TiendaCategoriaProducto } from '../../src/app/database/entities/pedidos-online/tienda-categoria.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Delivery, DeliveryEstado } from '../../src/app/database/entities/ventas/delivery.entity';
import { EstadoPedidoOnline, EstadoPagoOnline, TipoPedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { checkPermission, ensurePermission } from '../utils/auth.utils';
import { PrecioDelivery } from '../../src/app/database/entities/ventas/precio-delivery.entity';
import { enviosPorZonaYCanal, filtroDeRango } from './reportes-delivery.helper';
import { getCotizacionMap, getInicioJornada, getMonedaPrincipalId } from './dashboard-ventas.handler';
import { rangoToFechas } from '../utils/dashboard-rangos.util';
import { dbQuery } from '../utils/db-query';
import { asignarEnviosAZonas, redondearCoordenada } from '../utils/zonas-dashboard.utils';
import { MonedaTienda, monedasParaResumen, resumenPago } from '../utils/pago-pedido.utils';
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
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
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

/** `monedas` hace falta para el resumen del pago (símbolos); sin ellas, el resumen sale sin moneda. */
function mapPedidoAdmin(p: PedidoOnline, monedas: Pick<MonedaTienda, 'id' | 'simbolo' | 'decimales' | 'principal'>[] = []): any {
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
    // F4: pago con tarjeta (uPay).
    estadoPago: p.estadoPago ?? null,
    pagoId: p.pagoId ?? null,
    pagoMonto: p.pagoMonto != null ? Number(p.pagoMonto) : null,
    pagoDetalle: p.pagoDetalle ?? null,
    pagadoEn: p.pagadoEn ?? null,
    // F8: cómo dijo que va a pagar (no es un cobro).
    pagoModalidad: p.pagoModalidad ?? null,
    pagoMonedaId: p.pagoMonedaId ?? null,
    vueltoPara: p.vueltoPara != null ? Number(p.vueltoPara) : null,
    pagoCotizacion: p.pagoCotizacion != null ? Number(p.pagoCotizacion) : null,
    pagoObservacion: p.pagoObservacion ?? null,
    pagoResumen: resumenPago(p as any, monedas),
    // F9: solicitud de cancelación del cliente.
    cancelacionSolicitadaEn: p.cancelacionSolicitadaEn ?? null,
    cancelacionMotivo: p.cancelacionMotivo ?? null,
    cancelacionRespuesta: p.cancelacionRespuesta ?? null,
    // F10: por qué está en la cola de atención del diálogo de delivery (null = no espera nada).
    motivoAtencion: motivoAtencion(p as any),
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

    if (filtros?.atencion) {
      // F10: la cola de atención del diálogo de delivery (mismo criterio que el contador).
      qb.andWhere(WHERE_ATENCION, PARAMS_ATENCION);
    } else if (filtros?.cancelacionPendiente) {
      // F9: solicitudes de cancelación del cliente que esperan respuesta.
      qb.andWhere('p.cancelacion_solicitada_en IS NOT NULL AND p.estado IN (:...canc)', { canc: ESTADOS_CANCELABLES_CLIENTE });
    } else if (filtros?.estado) {
      qb.andWhere('p.estado = :estado', { estado: filtros.estado });
    } else if (filtros?.estados?.length) {
      qb.andWhere('p.estado IN (:...estados)', { estados: filtros.estados });
    }
    const pedidos = await qb.getMany();
    const monedas = await monedasParaResumen(dataSource);
    return pedidos.map((p) => mapPedidoAdmin(p, monedas));
  });

  // ============== CONTADOR DE PENDIENTES (badge/sonido) ==============
  ipcMain.handle('contar-pedidos-online-pendientes', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_VER);
    // F10: el badge cuenta lo mismo que muestra la cola de atención del diálogo de delivery
    // (`motivoAtencion`). Antes contaba todo ACEPTADO, aunque ya tuviera venta y estuviera en curso.
    // `pendientes` (nuevos, piden cancelar y aceptados que no llegaron a cocina —p. ej. la aceptación
    // automática sin caja abierta—) es lo que hace sonar el aviso; `total` es el número del badge,
    // que suma además las devoluciones de uPay (esperan a alguien, pero no hay cliente esperando).
    const filas: any[] = await repo().createQueryBuilder('p')
      .select(['p.id', 'p.estado', 'p.tipoPedido', 'p.ventaId', 'p.mesaId', 'p.estadoPago', 'p.cancelacionSolicitadaEn'])
      .where(WHERE_ATENCION, PARAMS_ATENCION)
      .getMany();
    const motivos = filas.map((p) => motivoAtencion(p));
    const cuenta = (m: string) => motivos.filter((x) => x === m).length;
    const cancelaciones = cuenta('CANCELACION');
    const nuevos = cuenta('NUEVO');
    const sinCocina = cuenta('SIN_COCINA');
    const devoluciones = cuenta('DEVOLVER');
    const pendientes = nuevos + cancelaciones + sinCocina;
    return { pendientes, cancelaciones, nuevos, sinCocina, devoluciones, total: motivos.filter(Boolean).length };
  });

  // ============== ACEPTAR ==============
  ipcMain.handle('aceptar-pedido-online', async (_event: any, pedidoId: number, data?: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_GESTIONAR);
    const pedido = await repo().findOne({ where: { id: pedidoId }, relations: ['items'] });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    if (pedido.estado !== EstadoPedidoOnline.RECIBIDO) {
      return { success: false, error: 'estado_invalido', estadoActual: pedido.estado };
    }
    // F5 (auditoría C2/M-F2-7): sin una caja abierta de quien acepta no se acepta. Antes el
    // pedido quedaba ACEPTADO sin venta (invisible para el PdV) o caía en una caja ajena.
    if (!data?.ventaId) {
      const cajaId = Number(data?.cajaId) || 0;
      const caja = cajaId ? await dataSource.getRepository(Caja).findOne({ where: { id: cajaId } }) : null;
      if (!caja || caja.estado !== CajaEstado.ABIERTO) {
        return { success: false, error: 'sin_caja' };
      }
    }
    // Transición atómica RECIBIDO → ACEPTADO (F5, M-F2-8): un rechazo o una aceptación
    // concurrente gana una sola vez.
    const upd = await repo().createQueryBuilder().update(PedidoOnline)
      .set({
        estado: EstadoPedidoOnline.ACEPTADO,
        fechaAceptado: new Date(),
        // Vínculo a una venta ya creada a mano (compat; el camino normal materializa acá).
        ...(data?.ventaId ? { ventaId: Number(data.ventaId) } : {}),
      } as any)
      .where('id = :id AND estado = :est', { id: pedido.id, est: EstadoPedidoOnline.RECIBIDO })
      .execute();
    if (!upd.affected) {
      const actual = await repo().findOne({ where: { id: pedidoId } });
      return { success: false, error: 'estado_invalido', estadoActual: actual?.estado };
    }
    const saved = (await repo().findOne({ where: { id: pedidoId } }))!;

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
    return cancelarPedido(pedidoId, motivo, EstadoPedidoOnline.RECHAZADO);
  });

  /**
   * Rechazo del local (RECHAZADO) o aprobación de la solicitud del cliente (F9: CANCELADO). Es el
   * mismo camino —reversa de la venta, permiso de cobrado, devolución de uPay— para que aprobar
   * una solicitud no pueda saltarse ninguna regla del rechazo.
   */
  const cancelarPedido = async (
    pedidoId: number, motivo: string,
    estadoFinal: EstadoPedidoOnline.RECHAZADO | EstadoPedidoOnline.CANCELADO,
    extra: Partial<PedidoOnline> = {},
    condicion?: string,
  ): Promise<any> => {
    const pedido = await repo().findOne({ where: { id: pedidoId } });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    if (!ESTADOS_CANCELABLES.includes(pedido.estado)) {
      return { success: false, error: 'estado_no_rechazable', estadoActual: pedido.estado };
    }

    const motivoNormalizado = motivo ? String(motivo).toUpperCase() : 'SIN MOTIVO';
    const usuarioId = getCurrentUser()?.id;

    // MESA_QR comparte UNA cuenta por mesa: varios comensales pidiendo desde su
    // celular caen en la misma `Venta`. Revertirla por el rechazo de un solo
    // pedido cancelaría los platos de los demás -y su cobro, y su stock-. No hay
    // forma de deshacer sólo la parte de este pedido porque no se persiste qué
    // VentaItem vino de qué pedido, así que se corta acá y se manda a editar la
    // cuenta en el PdV, que es la pantalla que sí sabe operar sobre ítems.
    if (pedido.mesaId && pedido.ventaId) {
      return {
        success: false,
        error: 'mesa_ya_materializada',
        detalle: 'El pedido ya está en la cuenta de la mesa. Quitá los ítems desde el PdV.',
        ventaId: pedido.ventaId,
      };
    }

    // Si el pedido ya se materializó hay una Venta viva detrás: cancelar sólo el
    // pedido dejaría al local cobrando algo que el cliente da por cancelado, y
    // con el stock ya descontado si además estaba cobrada. La reversa y el
    // cambio de estado van en UNA transacción: o se cancelan las dos cosas o
    // ninguna.
    // Revertir un cobro ya hecho no es lo mismo que descartar un pedido que
    // nunca se cobró: `delivery-cancelar` exige un permiso aparte para eso y
    // esta puerta lo estaba bypaseando. Mismo criterio, mismo permiso.
    if (pedido.ventaId) {
      const ventaPrevia = await dataSource.getRepository(Venta).findOne({ where: { id: pedido.ventaId } });
      if (ventaPrevia?.estado === VentaEstado.CONCLUIDA) {
        await ensurePermission(dataSource, getCurrentUser, 'VENTAS_DELIVERY_CANCELAR_COBRADO');
      }
    }

    let reversa: any = null;
    try {
    await dataSource.transaction(async (manager) => {
      if (pedido.ventaId) {
        reversa = await cancelarVentaCompletaEnTx(manager, dataSource, pedido.ventaId, {
          usuarioId,
          motivo: motivoNormalizado,
        });
      }
      // El delivery (o retiro) del pedido se cancela con él, como hace `delivery-cancelar` del
      // otro lado. Sin esto quedaba vivo en la lista de delivery sobre una venta ya cancelada, y
      // el cajero podía cobrarlo y finalizarlo (pasó el 2026-11-06 con PO-000006).
      if (pedido.deliveryId) {
        await manager.createQueryBuilder().update(Delivery)
          .set({ estado: DeliveryEstado.CANCELADO, fechaCancelacion: new Date(), motivoCancelacion: motivoNormalizado } as any)
          .where('id = :id AND estado NOT IN (:...terminales)', {
            id: pedido.deliveryId, terminales: [DeliveryEstado.ENTREGADO, DeliveryEstado.CANCELADO],
          })
          .execute();
      }
      // F5 (auditoría M-F2-8/M-pay4): rechazo condicionado al estado y a la venta que se
      // revirtió (una materialización concurrente no queda pisada), y el «a devolver» del pago
      // con tarjeta en la MISMA transacción.
      const qb = manager.getRepository(PedidoOnline).createQueryBuilder().update(PedidoOnline)
        .set({
          ...extra,
          estado: estadoFinal,
          motivoRechazo: motivoNormalizado,
          ...(pedido.estadoPago === EstadoPagoOnline.PAGADO ? { estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } : {}),
        } as any)
        .where('id = :id AND estado IN (:...cancelables)', { id: pedido.id, cancelables: ESTADOS_CANCELABLES });
      if (pedido.ventaId) qb.andWhere('venta_id = :v', { v: pedido.ventaId });
      else qb.andWhere('venta_id IS NULL');
      if (pedido.estadoPago) qb.andWhere('estado_pago = :ep', { ep: pedido.estadoPago });
      else qb.andWhere('estado_pago IS NULL');
      if (condicion) qb.andWhere(condicion);
      const r = await qb.execute();
      if (!r.affected) throw new PedidoCambioError();
    });
    } catch (e) {
      if (!(e instanceof PedidoCambioError)) throw e;
      return { success: false, error: 'pedido_cambio_reintentar', detalle: 'El pedido cambió mientras se rechazaba. Volvé a intentarlo.' };
    }

    // Pagado con tarjeta: ya quedó para devolver en uPay (F4 §6); se registra y se avisa al personal.
    const montoDevolver = pedido.estadoPago === EstadoPagoOnline.PAGADO
      ? await avisarReembolso(dataSource, pedido, estadoFinal === EstadoPedidoOnline.CANCELADO ? 'CANCELADO' : 'RECHAZADO')
      : null;

    const saved = await repo().findOne({ where: { id: pedidoId } });
    return { success: true, pedido: mapPedidoAdmin(saved || pedido), reversa, montoDevolver };
  };

  // ============== F9: RESOLVER LA SOLICITUD DE CANCELACIÓN DEL CLIENTE ==============
  // Aprobar = cancelar por el mismo camino que el rechazo (estado CANCELADO: lo pidió el
  // cliente). Rechazar = el pedido sigue; se guarda la respuesta y el cliente no puede volver a
  // pedirlo (para eso está el teléfono del local).
  ipcMain.handle('resolver-cancelacion-pedido-online', async (_event: any, pedidoId: number, aprobar: boolean, respuesta?: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_GESTIONAR);
    const pedido = await repo().findOne({ where: { id: Number(pedidoId) } });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    if (!pedido.cancelacionSolicitadaEn) return { success: false, error: 'sin_solicitud' };
    const texto = limpiarMotivo(respuesta);
    if (aprobar) {
      return cancelarPedido(pedido.id, pedido.cancelacionMotivo || 'CANCELADO A PEDIDO DEL CLIENTE',
        EstadoPedidoOnline.CANCELADO, { cancelacionRespuesta: texto || 'APROBADA' } as any,
        'cancelacion_solicitada_en IS NOT NULL');
    }
    const r = await repo().createQueryBuilder().update(PedidoOnline)
      .set({ cancelacionSolicitadaEn: null, cancelacionRespuesta: texto || 'NO SE PUEDE CANCELAR' } as any)
      .where('id = :id AND cancelacion_solicitada_en IS NOT NULL AND estado IN (:...e)', { id: pedido.id, e: ESTADOS_CANCELABLES_CLIENTE })
      .execute();
    if (!r.affected) return { success: false, error: 'sin_solicitud' };
    const saved = await repo().findOne({ where: { id: pedido.id } });
    return { success: true, pedido: mapPedidoAdmin(saved!) };
  });

  // ============== PAGO DEVUELTO (F4): el personal ya hizo la devolución en uPay ==============
  ipcMain.handle('marcar-pago-devuelto-pedido-online', async (_event: any, pedidoId: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_GESTIONAR);
    const okDev = await marcarDevuelto(dataSource, Number(pedidoId));
    return okDev ? { success: true } : { success: false, error: 'no_hay_devolucion_pendiente' };
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
    const zona = data?.id ? await repoZ.findOne({ where: { id: data.id }, relations: ['precioDelivery'] }) : repoZ.create();
    if (!zona) return { success: false, error: 'zona_no_encontrada' };
    // En una zona existente, un campo que no viene conserva su valor: antes un
    // guardado parcial (p. ej. por /api/rpc) la reactivaba y le ponía orden y
    // mínimo en 0. En una nueva, los defaults de siempre.
    const nueva = !zona.id;
    const viene = (k: string) => data?.[k] !== undefined;
    if (nueva || viene('nombre')) zona.nombre = String(data?.nombre || '').trim().toUpperCase();
    if (!zona.nombre) return { success: false, error: 'nombre_requerido' };
    if (nueva || viene('tarifa')) zona.tarifa = Number(data?.tarifa) || 0;
    if (nueva || viene('montoMinimo')) zona.montoMinimo = Number(data?.montoMinimo) || 0;
    if (nueva || viene('activa')) zona.activa = data?.activa !== false;
    if (nueva || viene('orden')) zona.orden = Number(data?.orden) || 0;
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
    // La tarifa del PdV es EL precio de envío de la zona (F7: obligatoria). Es la
    // misma que usa el cajero por teléfono, así el envío es uno solo en los dos
    // canales, y es lo que le dice al dashboard a qué zona fue un delivery por
    // teléfono. `tarifa` (precio propio de la zona) queda sólo como respaldo de
    // zonas viejas sin vínculo: no se pide ni se muestra.
    const esNueva = nueva;
    const actualId = (zona as any).precioDelivery?.id ?? null;
    const tarifaId = data?.precioDeliveryId !== undefined
      ? (data.precioDeliveryId ? Number(data.precioDeliveryId) : null)
      : actualId;
    // Requerida al crear y al cambiarla; una zona vieja sin tarifa se puede seguir
    // redibujando o renombrando (el dashboard la marca como alerta).
    if (tarifaId == null && (esNueva || actualId != null)) return { success: false, error: 'tarifa_requerida' };
    if (tarifaId != null && tarifaId !== actualId) {
      if (!Number.isInteger(tarifaId) || tarifaId <= 0) return { success: false, error: 'tarifa_invalida' };
      const existe = await dataSource.getRepository(PrecioDelivery).findOne({ where: { id: tarifaId } });
      if (!existe) return { success: false, error: 'tarifa_invalida' };
      // Una tarifa por zona. Sólo se controla si CAMBIA: dos zonas viejas que ya
      // la compartían tienen que poder seguir editándose sin quedar trabadas.
      const otra = await repoZ.findOne({
        where: { precioDelivery: { id: tarifaId }, ...(zona.id ? { id: Not(zona.id) } : {}) },
        relations: ['precioDelivery'],
      });
      if (otra) return { success: false, error: 'tarifa_en_uso', zona: otra.nombre };
    }
    zona.precioDelivery = tarifaId != null ? ({ id: tarifaId } as any) : null;
    const saved = await repoZ.save(zona);
    return { success: true, zona: mapZona(saved) };
  });

  // ============== DASHBOARD DE ZONAS (F7) ==============
  // Lectura con VENTAS_PDV (decisión del propietario): la ve quien ve la entrada del
  // menú. Crear, editar, dibujar y eliminar siguen pidiendo PEDIDOS_ONLINE_CONFIGURAR.
  const RANGOS_DASHBOARD = ['today', 'week', 'month'] as const;
  const TOPE_PUNTOS = 1000;
  ipcMain.handle('get-dashboard-zonas-delivery', async (_event: any, params?: { rango?: string }) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const rango = (RANGOS_DASHBOARD as readonly string[]).includes(String(params?.rango))
      ? (params!.rango as typeof RANGOS_DASHBOARD[number]) : 'week';
    const inicioJornada = await getInicioJornada(dataSource);
    const ventana = rangoToFechas(rango, new Date(), inicioJornada);
    const filtro = filtroDeRango(dataSource, ventana);
    const monPrincipal = await getMonedaPrincipalId(dataSource);
    const ctx = { monPrincipal, cotMap: await getCotizacionMap(dataSource, monPrincipal), isPg: dataSource.options.type === 'postgres' };

    const zonasEnt = await dataSource.getRepository(ZonaDelivery).find({
      order: { orden: 'ASC', nombre: 'ASC' }, relations: ['precioDelivery'],
    });
    const zonas = zonasEnt.map(mapZona);
    const tarifas = (await dataSource.getRepository(PrecioDelivery).find({ order: { descripcion: 'ASC' } }))
      .map((t: any) => ({ id: t.id, descripcion: t.descripcion, valor: Number(t.valor), activo: t.activo !== false }));
    const { filas, kpis } = asignarEnviosAZonas(zonas, tarifas, await enviosPorZonaYCanal(dataSource, ctx, filtro));

    // Puntos del mapa: el MISMO conjunto que cuenta la tabla para la tienda (venta
    // concluida del período, reparto y no retiro), con coordenadas redondeadas y
    // sin nada que identifique al cliente.
    const filasPuntos: any[] = await dbQuery(dataSource, `
      SELECT po.latitud AS lat, po.longitud AS lng, u.zid AS zona_id
      FROM ventas v
      -- Un pedido por venta (venta_id no es único en pedidos_online): las
      -- coordenadas del primero y la zona con el MISMO criterio que la tabla
      -- (MIN(zona_delivery_id) en enviosPorZonaYCanal), para que punto y fila coincidan.
      JOIN (SELECT venta_id, MIN(id) AS pid, MIN(zona_delivery_id) AS zid FROM pedidos_online WHERE venta_id IS NOT NULL GROUP BY venta_id) u ON u.venta_id = v.id
      JOIN pedidos_online po ON po.id = u.pid
      LEFT JOIN deliveries dcanal ON dcanal.id = v.delivery_id
      WHERE v.estado = ? AND ${filtro.sql}
        AND v.canal_origen = 'WEB'
        AND v.delivery_id IS NOT NULL AND (dcanal.modo IS NULL OR dcanal.modo <> 'RETIRO')
        AND po.latitud IS NOT NULL AND po.longitud IS NOT NULL
      ORDER BY v.created_at DESC, v.id DESC
      LIMIT ${TOPE_PUNTOS + 1}
    `, [VentaEstado.CONCLUIDA, ...filtro.params]);
    const puntos = filasPuntos.slice(0, TOPE_PUNTOS)
      .map((f) => ({ lat: redondearCoordenada(f.lat), lng: redondearCoordenada(f.lng), zonaId: f.zona_id != null ? Number(f.zona_id) : null }))
      .filter((p) => p.lat != null && p.lng != null);

    const puedeConfigurar = (await checkPermission(dataSource, getCurrentUser, PERM_CONFIGURAR)).ok;
    return {
      rango, desde: ventana.desde, hasta: ventana.hasta,
      zonas, tarifas, filas, kpis, puntos,
      puntosTruncados: filasPuntos.length > TOPE_PUNTOS,
      puedeConfigurar,
    };
  });

  ipcMain.handle('eliminar-zona-delivery', async (_event: any, zonaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    await dataSource.getRepository(ZonaDelivery).delete({ id: zonaId });
    return { success: true };
  });

  // ============== CATEGORÍAS DE LA TIENDA (F6) ==============
  const mapCategoriaTienda = (c: any) => ({
    id: c.id,
    nombre: c.nombre,
    orden: c.orden,
    activo: c.activo,
    productos: (c.productos || [])
      .filter((cp: any) => cp.producto)
      .sort((a: any, b: any) => a.orden - b.orden)
      .map((cp: any) => ({ productoId: cp.producto.id, nombre: cp.producto.nombre, orden: cp.orden })),
  });
  const cargarCategoriaTienda = (id: number) =>
    dataSource.getRepository(TiendaCategoria).findOne({ where: { id }, relations: ['productos', 'productos.producto'] });

  ipcMain.handle('get-tienda-categorias-admin', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const cats = await dataSource.getRepository(TiendaCategoria).find({
      relations: ['productos', 'productos.producto'],
      order: { orden: 'ASC', id: 'ASC' },
    });
    return cats.map(mapCategoriaTienda);
  });

  /** Alta o edición: nombre, activo y la lista completa de productos en su orden (reemplaza la anterior). */
  ipcMain.handle('guardar-tienda-categoria', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    const nombre = String(data?.nombre || '').trim().toUpperCase().slice(0, 80);
    if (!nombre) return { success: false, error: 'nombre_requerido' };
    const productoIds: number[] = Array.isArray(data?.productoIds)
      ? Array.from(new Set<number>(data.productoIds.map((x: any) => Number(x)).filter((x: number) => Number.isInteger(x) && x > 0)))
      : [];
    if (productoIds.length) {
      const existen = await dataSource.getRepository(Producto).count({ where: { id: In(productoIds) } as any });
      if (existen !== productoIds.length) return { success: false, error: 'producto_inexistente' };
    }
    const id = await dataSource.transaction(async (em) => {
      const repoC = em.getRepository(TiendaCategoria);
      let cat: TiendaCategoria | null;
      if (data?.id) {
        cat = await repoC.findOne({ where: { id: Number(data.id) } });
        if (!cat) return null;
      } else {
        const ultima = await repoC.findOne({ where: {}, order: { orden: 'DESC' } });
        cat = repoC.create({ orden: (ultima?.orden ?? -1) + 1 });
      }
      cat.nombre = nombre;
      cat.activo = data?.activo !== false;
      const saved = await repoC.save(cat);
      if (Array.isArray(data?.productoIds)) {
        const repoCP = em.getRepository(TiendaCategoriaProducto);
        await repoCP.delete({ categoria: { id: saved.id } } as any);
        if (productoIds.length) {
          await repoCP.save(productoIds.map((pid, i) => repoCP.create({ categoria: { id: saved.id } as any, producto: { id: pid } as any, orden: i })));
        }
      }
      return saved.id;
    });
    if (id == null) return { success: false, error: 'categoria_no_encontrada' };
    return { success: true, categoria: mapCategoriaTienda(await cargarCategoriaTienda(id)) };
  });

  ipcMain.handle('eliminar-tienda-categoria', async (_event: any, categoriaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    // Las asignaciones se borran a mano además del ON DELETE CASCADE (SQLite puede tener las FK apagadas).
    await dataSource.transaction(async (em) => {
      await em.getRepository(TiendaCategoriaProducto).delete({ categoria: { id: Number(categoriaId) } } as any);
      await em.getRepository(TiendaCategoria).delete({ id: Number(categoriaId) });
    });
    return { success: true };
  });

  /** Orden de las pestañas: la lista de ids en el orden nuevo. */
  ipcMain.handle('reordenar-tienda-categorias', async (_event: any, ids: number[]) => {
    await ensurePermission(dataSource, getCurrentUser, PERM_CONFIGURAR);
    if (!Array.isArray(ids)) return { success: false, error: 'ids_invalidos' };
    await dataSource.transaction(async (em) => {
      const repoC = em.getRepository(TiendaCategoria);
      for (let i = 0; i < ids.length; i++) await repoC.update({ id: Number(ids[i]) }, { orden: i });
    });
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
    // F5 (auditoría C2): un pedido aceptado sin venta no avanza a mano: primero «Enviar a
    // cocina» (que crea la venta). Si no, quedaba en preparación sin cuenta ni comanda.
    if (pedido.estado === EstadoPedidoOnline.ACEPTADO && !pedido.ventaId
        && nuevoEstado !== EstadoPedidoOnline.RECHAZADO && nuevoEstado !== EstadoPedidoOnline.CANCELADO) {
      return { success: false, error: 'sin_venta', estadoActual: pedido.estado };
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
      // El delivery avanza en su propia transacción y el pedido se guarda
      // después: si esa segunda escritura falla, el delivery queda adelantado
      // y el pedido atrás. No se puede unificar sin reescribir el módulo de
      // delivery, así que se hace REINTENTABLE: si el delivery ya está donde
      // queremos llevarlo, no se le pide la transición de nuevo (la rechazaría
      // por "transición inválida") y el handler sigue para dejar el pedido al
      // día. Así el operador destraba el desfasaje repitiendo la acción.
      const actual = await dataSource.getRepository(Delivery).findOne({
        where: { id: pedido.deliveryId },
        select: ['id', 'estado'],
      });
      if (String(actual?.estado) !== destinoDelivery) {
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
    }

    pedido.estado = nuevoEstado as EstadoPedidoOnline;
    // F9: si salió con una solicitud de cancelación sin responder, la solicitud se cierra sola
    // (ya no se puede cancelar) y el cliente ve por qué, en vez de quedar «esperando respuesta».
    Object.assign(pedido, cierreSolicitudAlSalir(pedido, nuevoEstado));
    if (nuevoEstado === EstadoPedidoOnline.LISTO) pedido.fechaListo = new Date();
    if (nuevoEstado === EstadoPedidoOnline.ENTREGADO) pedido.fechaEntregado = new Date();
    try {
      const saved = await repo().save(pedido);
      return { success: true, pedido: mapPedidoAdmin(saved) };
    } catch (e) {
      // El delivery ya avanzó y el pedido no: se nombra el desfasaje en vez de
      // devolver un error genérico, porque la salida es repetir la acción.
      return {
        success: false,
        error: 'pedido_desfasado_del_delivery',
        detalle: (e as Error)?.message || String(e),
        estadoActual: pedido.estado,
      };
    }
  });
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
