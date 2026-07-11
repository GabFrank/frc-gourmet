import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaAdicionalVinculacion } from '../../src/app/database/entities/productos/receta-adicional-vinculacion.entity';
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

/** De una lista de PrecioVenta activos elige ONLINE > principal > primero. */
function pickPrecio(precios: any[]): any | null {
  const activos = (precios || []).filter((p: any) => p && p.activo);
  if (!activos.length) return null;
  const online = activos.find(
    (p: any) => String(p.tipoPrecio?.descripcion || '').toUpperCase() === ONLINE_TIPO,
  );
  return online || activos.find((p: any) => p.principal) || activos[0];
}

/**
 * Resuelve el precio de la OPCIÓN elegida server-side según el tipo de producto.
 * Devuelve { valor, moneda, label, recetaId? } o null si no hay precio.
 * Soporta el shape nuevo (`opcion`) y el viejo (`presentacionId`).
 */
async function resolveOpcion(
  dataSource: DataSource,
  producto: any,
  it: any,
): Promise<{ valor: number; moneda: any; label: string; presentacionId?: number; recetaId?: number } | null> {
  const pvRepo = dataSource.getRepository(PrecioVenta);
  const opcion = it.opcion || (it.presentacionId ? { tipo: 'PRESENTACION', presentacionId: it.presentacionId } : null);
  const tipoProd = producto.tipo;

  // RETAIL / presentaciones
  if (tipoProd === 'RETAIL' || tipoProd === 'RETAIL_INGREDIENTE' || tipoProd === 'BUFFET_POR_PESO') {
    const presentaciones = producto.presentaciones || [];
    const presId = opcion?.presentacionId;
    const pres = presId
      ? presentaciones.find((p: any) => p.id === presId)
      : presentaciones.find((p: any) => p.principal) || presentaciones[0];
    if (!pres) return null;
    const precio = pickPrecio(pres.preciosVenta);
    if (!precio) return null;
    return { valor: Number(precio.valor), moneda: precio.moneda, label: pres.nombre, presentacionId: pres.id };
  }

  // ELABORADO_SIN_VARIACION → precio de la receta del producto
  if (tipoProd === 'ELABORADO_SIN_VARIACION') {
    const recetaId = producto.receta?.id;
    if (!recetaId) return null;
    const precios = await pvRepo.find({ where: { receta: { id: recetaId }, activo: true }, relations: ['moneda', 'tipoPrecio'] });
    const precio = pickPrecio(precios);
    if (!precio) return null;
    return { valor: Number(precio.valor), moneda: precio.moneda, label: 'Estándar', recetaId };
  }

  // ELABORADO_CON_VARIACION → precio de la receta de la variación elegida
  if (tipoProd === 'ELABORADO_CON_VARIACION') {
    const recetaId = opcion?.recetaId;
    if (!recetaId) return null;
    // La variación debe pertenecer a este producto.
    const variacion = await dataSource.getRepository(Receta).findOne({
      where: { id: recetaId, productoVariacion: { id: producto.id }, activo: true } as any,
    });
    if (!variacion) return null;
    const precios = await pvRepo.find({ where: { receta: { id: recetaId }, activo: true }, relations: ['moneda', 'tipoPrecio'] });
    const precio = pickPrecio(precios);
    if (!precio) return null;
    return { valor: Number(precio.valor), moneda: precio.moneda, label: (variacion as any).nombre, recetaId };
  }

  // COMBO → precio directo del producto
  if (tipoProd === 'COMBO') {
    const precios = await pvRepo.find({ where: { producto: { id: producto.id }, activo: true }, relations: ['moneda', 'tipoPrecio'] });
    const precio = pickPrecio(precios);
    if (!precio) return null;
    return { valor: Number(precio.valor), moneda: precio.moneda, label: 'Combo' };
  }

  return null;
}

/** Suma el precio de los adicionales elegidos, tomado del CATÁLOGO (no del cliente). */
async function resolveAdicionales(
  dataSource: DataSource,
  producto: any,
  opcionRecetaId: number | undefined,
  adicionalIds: number[],
): Promise<{ total: number; detalle: { id: number; nombre: string; precio: number }[] }> {
  if (!Array.isArray(adicionalIds) || !adicionalIds.length) return { total: 0, detalle: [] };
  const recetaIds: number[] = [];
  if (producto.receta?.id) recetaIds.push(producto.receta.id);
  if (opcionRecetaId) recetaIds.push(opcionRecetaId);
  if (!recetaIds.length) return { total: 0, detalle: [] };

  const vincs = await dataSource.getRepository(RecetaAdicionalVinculacion).find({
    where: recetaIds.map((rid) => ({ receta: { id: rid }, activo: true })) as any,
    relations: ['adicional'],
  });
  const detalle: { id: number; nombre: string; precio: number }[] = [];
  let total = 0;
  const wanted = new Set(adicionalIds.map((n) => Number(n)));
  const vistos = new Set<number>();
  for (const v of vincs as any[]) {
    const ad = v.adicional;
    if (!ad || !ad.activo || !wanted.has(ad.id) || vistos.has(ad.id)) continue;
    vistos.add(ad.id);
    const precio = Math.max(0, Number(v.precioAdicional ?? ad.precio ?? 0));
    total += precio;
    detalle.push({ id: ad.id, nombre: ad.nombre, precio });
  }
  return { total, detalle };
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
          'receta',
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

      // Precio de la opción elegida (todos los tipos), recalculado server-side.
      const opcion = await resolveOpcion(dataSource, producto, it);
      if (!opcion) return { success: false, error: `opcion_invalida:${producto.nombre}` };
      if (monedaId == null && opcion.moneda) monedaId = opcion.moneda.id;

      // Adicionales validados contra el catálogo (precio del server, no del cliente).
      const adicionalIds: number[] = Array.isArray(it.adicionalIds) ? it.adicionalIds : [];
      const adic = await resolveAdicionales(dataSource, producto, opcion.recetaId, adicionalIds);

      // Observaciones predefinidas elegidas (solo se guardan como snapshot).
      const observaciones: string[] = Array.isArray(it.observaciones)
        ? it.observaciones.map((o: any) => String(o)).slice(0, 20)
        : [];
      const notaLibre = it.notaLibre ? String(it.notaLibre).slice(0, 300) : undefined;

      // Cantidad entera ≥ 1 (no se venden fracciones online).
      const cantidad = Math.max(1, Math.floor(Number(it.cantidad) || 1));
      const precioUnitario = opcion.valor + adic.total;
      const itemSubtotal = precioUnitario * cantidad;
      subtotal += itemSubtotal;

      const personalizacion = {
        opcion: { label: opcion.label, tipo: it.opcion?.tipo ?? 'PRESENTACION' },
        adicionales: adic.detalle,
        observaciones,
        notaLibre,
      };

      const item = new PedidoOnlineItem();
      item.productoId = producto.id;
      item.presentacionId = opcion.presentacionId;
      item.nombreProducto = producto.nombre;
      item.nombrePresentacion = opcion.label;
      item.cantidad = cantidad;
      item.precioUnitario = precioUnitario;
      item.subtotal = itemSubtotal;
      item.personalizacion = JSON.stringify(personalizacion);
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
    if (tipoPedido === TipoPedidoOnline.DELIVERY) {
      if (typeof data?.latitud === 'number') pedido.latitud = data.latitud;
      if (typeof data?.longitud === 'number') pedido.longitud = data.longitud;
    }
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
