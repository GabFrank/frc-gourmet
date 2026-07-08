import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { ZonaDelivery } from '../../src/app/database/entities/pedidos-online/zona-delivery.entity';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { PedidoOnlineItem } from '../../src/app/database/entities/pedidos-online/pedido-online-item.entity';
import { CuentaCliente } from '../../src/app/database/entities/pedidos-online/cuenta-cliente.entity';
import {
  TipoPedidoOnline,
  EstadoPedidoOnline,
  CanalPedidoOnline,
  MetodoPagoOnline,
} from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { registerPublicOperation } from '../server/public-routes';
import { getTiendaConfig, estaAbierta } from './pedidos-online-config.handler';

/**
 * Pedidos online — Fase 3: creación de pedido + zonas de delivery (superficie pública).
 *
 * `crear-pedido-online` RECALCULA los precios en el server desde el catálogo
 * (no confía en el precio que manda el cliente) y valida disponibilidad online +
 * monto mínimo por zona. El pedido entra RECIBIDO y aparece en la bandeja del PdV.
 *
 * Ver docs/arquitectura/webapp-pedidos-plan.md (Fase 3).
 */

const ONLINE_TIPO = 'ONLINE';

function resolvePrecio(presentacion: any): any | null {
  const precios = (presentacion?.preciosVenta || []).filter((p: any) => p && p.activo);
  if (!precios.length) return null;
  const online = precios.find(
    (p: any) => String(p.tipoPrecio?.descripcion || '').toUpperCase() === ONLINE_TIPO,
  );
  return online || precios.find((p: any) => p.principal) || precios[0];
}

async function siguienteNumero(repo: any): Promise<string> {
  const count = await repo.count();
  return `PO-${String(count + 1).padStart(6, '0')}`;
}

export function registerPedidosOnlinePedidosHandlers(
  dataSource: DataSource,
  _getCurrentUser: () => any,
): void {
  const pedidoRepo = () => dataSource.getRepository(PedidoOnline);

  // ============== ZONAS DE DELIVERY (público, lectura) ==============
  ipcMain.handle('get-zonas-delivery-online', async () => {
    const zonas = await dataSource.getRepository(ZonaDelivery).find({
      where: { activa: true },
      order: { orden: 'ASC', nombre: 'ASC' },
    });
    return zonas.map((z) => ({
      id: z.id,
      nombre: z.nombre,
      tarifa: Number(z.tarifa),
      montoMinimo: Number(z.montoMinimo),
    }));
  });

  // ============== CREAR PEDIDO (público, requiere cliente) ==============
  ipcMain.handle('crear-pedido-online', async (event: any, data: any) => {
    const customerId = event?._customerId;
    if (!customerId) return { success: false, error: 'no_autenticado' };

    const tipoPedido: TipoPedidoOnline = data?.tipoPedido || TipoPedidoOnline.PICKUP;
    const itemsIn: any[] = Array.isArray(data?.items) ? data.items : [];
    if (!itemsIn.length) return { success: false, error: 'pedido_sin_items' };

    const cuenta = await dataSource
      .getRepository(CuentaCliente)
      .findOne({ where: { id: customerId } });
    if (!cuenta || !cuenta.activo) return { success: false, error: 'cuenta_invalida' };

    // Config de tienda: apertura + tipos de pedido habilitados.
    const cfg = await getTiendaConfig(dataSource);
    if (!estaAbierta(cfg)) return { success: false, error: 'tienda_cerrada' };
    if (tipoPedido === TipoPedidoOnline.PICKUP && !cfg.permitePickup) {
      return { success: false, error: 'pickup_no_disponible' };
    }
    if (tipoPedido === TipoPedidoOnline.DELIVERY && !cfg.permiteDelivery) {
      return { success: false, error: 'delivery_no_disponible' };
    }

    const productoRepo = dataSource.getRepository(Producto);
    let subtotal = 0;
    let monedaId: number | null = null;
    const itemsToSave: PedidoOnlineItem[] = [];

    for (const it of itemsIn) {
      const producto = await productoRepo.findOne({
        where: { id: it.productoId },
        relations: [
          'presentaciones',
          'presentaciones.preciosVenta',
          'presentaciones.preciosVenta.moneda',
          'presentaciones.preciosVenta.tipoPrecio',
        ],
      });
      if (!producto) return { success: false, error: `producto_inexistente:${it.productoId}` };
      if (!producto.activo || !producto.esVendible || !producto.disponibleOnline || producto.pausadoOnline) {
        return { success: false, error: `producto_no_disponible:${producto.nombre}` };
      }

      const presentaciones = producto.presentaciones || [];
      const pres = it.presentacionId
        ? presentaciones.find((p: any) => p.id === it.presentacionId)
        : presentaciones.find((p: any) => p.principal) || presentaciones[0];
      if (!pres) return { success: false, error: `presentacion_inexistente:${producto.nombre}` };

      const precio = resolvePrecio(pres);
      if (!precio) return { success: false, error: `sin_precio_online:${producto.nombre}` };
      if (monedaId == null && precio.moneda) monedaId = precio.moneda.id;

      // Cantidad entera ≥ 1 (no se venden fracciones online).
      const cantidad = Math.max(1, Math.floor(Number(it.cantidad) || 1));
      // Adicionales del snapshot del cliente. Se CLAMPea a ≥0 para que un POST
      // directo no pueda inyectar precios negativos y evadir el mínimo. El precio
      // real de los adicionales se valida contra el catálogo en Fase 5 (cobro
      // online); hoy el PdV revisa el pedido antes de aceptar.
      const adicionales = Array.isArray(it.personalizacion?.adicionales)
        ? it.personalizacion.adicionales
        : [];
      const totalAdicionales = adicionales.reduce(
        (s: number, a: any) => s + Math.max(0, Number(a?.precio) || 0),
        0,
      );
      const precioUnitario = Number(precio.valor) + totalAdicionales;
      const itemSubtotal = precioUnitario * cantidad;
      subtotal += itemSubtotal;

      const item = new PedidoOnlineItem();
      item.productoId = producto.id;
      item.presentacionId = pres.id;
      item.nombreProducto = producto.nombre;
      item.nombrePresentacion = pres.nombre;
      item.cantidad = cantidad;
      item.precioUnitario = precioUnitario;
      item.subtotal = itemSubtotal;
      item.personalizacion = it.personalizacion ? JSON.stringify(it.personalizacion) : undefined;
      itemsToSave.push(item);
    }

    // Mínimo global de pedido (config de tienda), independiente de la zona.
    if (Number(cfg.montoMinimoPedido) > 0 && subtotal < Number(cfg.montoMinimoPedido)) {
      return {
        success: false,
        error: 'monto_minimo_global',
        montoMinimo: Number(cfg.montoMinimoPedido),
        subtotal,
      };
    }

    // Delivery: tarifa + validación de monto mínimo.
    let costoEnvio = 0;
    let zona: ZonaDelivery | null = null;
    if (tipoPedido === TipoPedidoOnline.DELIVERY) {
      if (!data?.zonaDeliveryId) return { success: false, error: 'falta_zona_delivery' };
      zona = await dataSource
        .getRepository(ZonaDelivery)
        .findOne({ where: { id: data.zonaDeliveryId, activa: true } });
      if (!zona) return { success: false, error: 'zona_delivery_invalida' };
      if (subtotal < Number(zona.montoMinimo)) {
        return {
          success: false,
          error: 'monto_minimo_no_alcanzado',
          montoMinimo: Number(zona.montoMinimo),
          subtotal,
        };
      }
      if (!data?.direccionEntrega) return { success: false, error: 'falta_direccion' };
      costoEnvio = Number(zona.tarifa);
    }

    const total = subtotal + costoEnvio;

    // Persistencia (con reintento de número por colisión de índice único).
    const pedido = new PedidoOnline();
    pedido.numero = await siguienteNumero(pedidoRepo());
    pedido.cuentaCliente = cuenta;
    pedido.nombreCliente = cuenta.nombre || null as any;
    pedido.telefonoCliente = cuenta.telefono;
    pedido.tipoPedido = tipoPedido;
    // Aceptación automática: entra ACEPTADO directo; si no, RECIBIDO (revisión en PdV).
    if (cfg.aceptacionAutomatica) {
      pedido.estado = EstadoPedidoOnline.ACEPTADO;
      pedido.fechaAceptado = new Date();
    } else {
      pedido.estado = EstadoPedidoOnline.RECIBIDO;
    }
    pedido.canalOrigen = data?.canalOrigen || CanalPedidoOnline.WEB;
    pedido.metodoPago = data?.metodoPago || MetodoPagoOnline.EFECTIVO;
    pedido.fechaProgramada = data?.fechaProgramada ? new Date(data.fechaProgramada) : undefined;
    pedido.subtotal = subtotal;
    pedido.costoEnvio = costoEnvio;
    pedido.total = total;
    if (monedaId != null) pedido.moneda = { id: monedaId } as any;
    if (zona) pedido.zonaDelivery = zona;
    pedido.direccionEntrega = data?.direccionEntrega || undefined;
    pedido.referenciaDireccion = data?.referenciaDireccion || undefined;
    pedido.notas = data?.notas || undefined;
    pedido.items = itemsToSave;

    let saved: PedidoOnline;
    try {
      saved = await pedidoRepo().save(pedido);
    } catch {
      // Reintento por si el número colisionó con un pedido concurrente.
      pedido.numero = await siguienteNumero(pedidoRepo());
      saved = await pedidoRepo().save(pedido);
    }

    return {
      success: true,
      numero: saved.numero,
      pedidoId: saved.id,
      estado: saved.estado,
      subtotal,
      costoEnvio,
      total,
    };
  });

  // ============== MIS PEDIDOS (público, requiere cliente) ==============
  ipcMain.handle('get-mis-pedidos-online', async (event: any) => {
    const customerId = event?._customerId;
    if (!customerId) return { success: false, error: 'no_autenticado' };
    const pedidos = await pedidoRepo().find({
      where: { cuentaCliente: { id: customerId } },
      relations: ['items'],
      order: { createdAt: 'DESC' },
      take: 30,
    });
    return { success: true, pedidos: pedidos.map(mapPedido) };
  });

  // ============== ESTADO DE UN PEDIDO (público, requiere cliente) ==============
  ipcMain.handle('get-pedido-online-estado', async (event: any, numero: string) => {
    const customerId = event?._customerId;
    if (!customerId) return { success: false, error: 'no_autenticado' };
    const pedido = await pedidoRepo().findOne({
      where: { numero, cuentaCliente: { id: customerId } },
      relations: ['items'],
    });
    if (!pedido) return { success: false, error: 'pedido_no_encontrado' };
    return { success: true, pedido: mapPedido(pedido) };
  });

  // ---- Operaciones públicas ----
  registerPublicOperation('zonas.get', { channel: 'get-zonas-delivery-online', requiresAuth: false, description: 'Zonas de delivery activas.' });
  registerPublicOperation('pedido.crear', { channel: 'crear-pedido-online', requiresAuth: true, description: 'Crear un pedido online.' });
  registerPublicOperation('pedido.mis', { channel: 'get-mis-pedidos-online', requiresAuth: true, description: 'Mis pedidos.' });
  registerPublicOperation('pedido.estado', { channel: 'get-pedido-online-estado', requiresAuth: true, description: 'Estado de un pedido por número.' });
}

function mapPedido(p: PedidoOnline): any {
  return {
    id: p.id,
    numero: p.numero,
    estado: p.estado,
    tipoPedido: p.tipoPedido,
    subtotal: Number(p.subtotal),
    costoEnvio: Number(p.costoEnvio),
    total: Number(p.total),
    direccionEntrega: p.direccionEntrega ?? null,
    notas: p.notas ?? null,
    createdAt: p.createdAt,
    fechaAceptado: p.fechaAceptado ?? null,
    fechaListo: p.fechaListo ?? null,
    fechaEntregado: p.fechaEntregado ?? null,
    items: (p.items || []).map((it) => ({
      nombreProducto: it.nombreProducto,
      nombrePresentacion: it.nombrePresentacion ?? null,
      cantidad: Number(it.cantidad),
      precioUnitario: Number(it.precioUnitario),
      subtotal: Number(it.subtotal),
      personalizacion: it.personalizacion ? safeParse(it.personalizacion) : null,
    })),
  };
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
