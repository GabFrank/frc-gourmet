import { ipcMain } from 'electron';
import { DataSource, In } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';
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
import { PdvMesa } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { registerPublicOperation } from '../server/public-routes';
import { getTiendaConfig, estaAbierta, getPizzaConfig } from './pedidos-online-config.handler';
import { resolverZonaPorPunto } from '../utils/geo.utils';
import { materializarPedidoOnlineEnVenta } from './ventas.handler';
import { ipEnRangosLan } from '../utils/ip-lan.util';

/**
 * Pedidos online — Fase 3: creación de pedido + zonas de delivery (superficie pública).
 *
 * `crear-pedido-online` RECALCULA los precios en el server desde el catálogo
 * (no confía en el precio que manda el cliente) y valida disponibilidad online +
 * monto mínimo por zona. El pedido entra RECIBIDO y aparece en la bandeja del PdV.
 *
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
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
): Promise<{
  valor: number;
  moneda: any;
  label: string;
  presentacionId?: number;
  recetaId?: number;
  recetaIds?: number[];
  sabores?: { saborId: number; nombre: string; proporcion: number; recetaPresentacionId: number; precioReferencia: number }[];
  error?: string;
} | null> {
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

  // ELABORADO_CON_VARIACION (pizza) → tamaño + sabor(es), precio desde RecetaPresentacion.
  if (tipoProd === 'ELABORADO_CON_VARIACION') {
    // Shape nuevo (pizza): { tipo:'PIZZA', presentacionId, saborIds:[...] }
    const presentacionId = Number(opcion?.presentacionId) || null;
    const saborIds: number[] = Array.isArray(opcion?.saborIds)
      ? opcion.saborIds.map((n: any) => Number(n)).filter((n: number) => n > 0)
      : [];

    if (presentacionId && saborIds.length) {
      const { maxSabores, estrategia } = await getPizzaConfig(dataSource, producto);
      const uniqueSabores = Array.from(new Set(saborIds));
      if (uniqueSabores.length > maxSabores) return { valor: 0, moneda: null, label: '', error: 'demasiados_sabores' };

      // RecetaPresentacion de (sabor × tamaño) que pertenezcan a este producto.
      const rps = await dataSource.getRepository(RecetaPresentacion).find({
        where: {
          presentacion: { id: presentacionId },
          sabor: { id: In(uniqueSabores), producto: { id: producto.id } },
          activo: true,
        } as any,
        relations: ['presentacion', 'sabor', 'receta', 'preciosVenta', 'preciosVenta.moneda', 'preciosVenta.tipoPrecio'],
      });
      // Todos los sabores elegidos deben existir y tener precio para ese tamaño.
      const porSabor = new Map<number, any>();
      for (const rp of rps as any[]) {
        const precio = pickPrecio(rp.preciosVenta);
        if (precio) porSabor.set(rp.sabor.id, { rp, precio });
      }
      if (porSabor.size !== uniqueSabores.length) return { valor: 0, moneda: null, label: '', error: 'sabor_o_tamano_invalido' };

      const precios = uniqueSabores.map((sid) => Number(porSabor.get(sid).precio.valor));
      const valor = estrategia === 'PROMEDIO'
        ? precios.reduce((a, b) => a + b, 0) / precios.length
        : Math.max(...precios);

      const proporcion = 1 / uniqueSabores.length;
      const first = porSabor.get(uniqueSabores[0]);
      const tamanoNombre = first.rp.presentacion?.nombre || '';
      const saboresSnap = uniqueSabores.map((sid) => {
        const { rp, precio } = porSabor.get(sid);
        return {
          saborId: sid,
          nombre: rp.sabor?.nombre || '',
          proporcion,
          recetaPresentacionId: rp.id,
          precioReferencia: Number(precio.valor),
        };
      });
      const label = uniqueSabores.length > 1
        ? `${tamanoNombre} · ${saboresSnap.map((s) => `1/${uniqueSabores.length} ${s.nombre}`).join(' + ')}`
        : `${tamanoNombre} · ${saboresSnap[0].nombre}`;
      const recetaIds = Array.from(new Set((rps as any[]).map((r) => r.receta?.id).filter(Boolean)));

      return {
        valor: Math.round(valor),
        moneda: first.precio.moneda,
        label,
        presentacionId,
        recetaIds,
        sabores: saboresSnap,
      };
    }

    // Backward-compat: shape viejo { recetaId } (variación con precio en la receta).
    const recetaId = opcion?.recetaId;
    if (!recetaId) return null;
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
  opcionRecetaIds: number[],
  adicionalIds: number[],
): Promise<{ total: number; detalle: { id: number; nombre: string; precio: number }[] }> {
  if (!Array.isArray(adicionalIds) || !adicionalIds.length) return { total: 0, detalle: [] };
  const recetaIds: number[] = [];
  if (producto.receta?.id) recetaIds.push(producto.receta.id);
  for (const rid of opcionRecetaIds || []) if (rid) recetaIds.push(rid);
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
    const tipoPedido: TipoPedidoOnline = data?.tipoPedido || TipoPedidoOnline.PICKUP;
    const itemsIn: any[] = Array.isArray(data?.items) ? data.items : [];
    if (!itemsIn.length) return { success: false, error: 'pedido_sin_items' };

    // Config de tienda: apertura.
    const cfg = await getTiendaConfig(dataSource);
    if (!estaAbierta(cfg)) return { success: false, error: 'tienda_cerrada' };

    // ── Resolución del solicitante según el canal ──
    // MESA_QR: autoservicio en mesa, invitado permitido (solo nombre obligatorio,
    // teléfono/cuenta opcional). PICKUP/DELIVERY: exige cliente autenticado.
    let cuenta: CuentaCliente | null = null;
    let mesa: PdvMesa | null = null;
    let nombreClienteInvitado: string | null = null;

    if (tipoPedido === TipoPedidoOnline.MESA_QR) {
      if (!cfg.permiteMesa) return { success: false, error: 'mesa_no_disponible' };
      const token = String(data?.mesaToken || '').trim();
      if (!token) return { success: false, error: 'falta_mesa_token' };
      mesa = await dataSource.getRepository(PdvMesa).findOne({ where: { qrToken: token } });
      if (!mesa || !mesa.activo) return { success: false, error: 'mesa_invalida' };
      // Gate del cajero: la mesa debe estar habilitada para autoservicio.
      if (!mesa.autoservicioActivo) return { success: false, error: 'mesa_no_habilitada' };
      // Anti-fraude de red: el pedido debe venir de una IP permitida (la red del
      // local). Requiere trustProxy si el server está detrás de reverse proxy.
      if (cfg.requiereLanMesa) {
        const clientIp = String(event?._clientIp || '');
        if (!ipEnRangosLan(clientIp, cfg.rangoLanMesa)) {
          return { success: false, error: 'fuera_de_red_local' };
        }
      }
      nombreClienteInvitado = String(data?.nombreCliente || '').trim().slice(0, 150);
      if (!nombreClienteInvitado) return { success: false, error: 'falta_nombre' };
      // Si además viene autenticado, se asocia la cuenta (opcional).
      if (customerId) {
        cuenta = await dataSource.getRepository(CuentaCliente).findOne({ where: { id: customerId } });
        if (cuenta && !cuenta.activo) cuenta = null;
      }
    } else {
      if (!customerId) return { success: false, error: 'no_autenticado' };
      cuenta = await dataSource.getRepository(CuentaCliente).findOne({ where: { id: customerId } });
      if (!cuenta || !cuenta.activo) return { success: false, error: 'cuenta_invalida' };
      if (tipoPedido === TipoPedidoOnline.PICKUP && !cfg.permitePickup) {
        return { success: false, error: 'pickup_no_disponible' };
      }
      if (tipoPedido === TipoPedidoOnline.DELIVERY && !cfg.permiteDelivery) {
        return { success: false, error: 'delivery_no_disponible' };
      }
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
      if (opcion.error) return { success: false, error: `${opcion.error}:${producto.nombre}` };
      if (monedaId == null && opcion.moneda) monedaId = opcion.moneda.id;

      // Adicionales validados contra el catálogo (precio del server, no del cliente).
      const adicionalIds: number[] = Array.isArray(it.adicionalIds) ? it.adicionalIds : [];
      const opcionRecetaIds = opcion.recetaIds ?? (opcion.recetaId ? [opcion.recetaId] : []);
      const adic = await resolveAdicionales(dataSource, producto, opcionRecetaIds, adicionalIds);

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
        // Desglose de sabores (pizza mitad y mitad) para la bandeja del PdV.
        sabores: opcion.sabores ?? null,
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

    // DELIVERY: el costo del envío lo resuelve el SERVIDOR a partir del punto que
    // el cliente marcó en el mapa. El cliente no elige zona ni manda tarifa —
    // ambas cosas son datos internos del negocio, y que las mandara el cliente
    // abría la puerta a pedir la zona barata.
    let costoEnvio = 0;
    let zona: ZonaDelivery | null = null;
    if (tipoPedido === TipoPedidoOnline.DELIVERY) {
      // El pin es obligatorio: sin coordenadas no hay polígono que resolver, y
      // una dirección escrita no se puede cotizar. El texto sigue viajando como
      // complemento (referencia, piso, portón) porque le sirve al repartidor.
      const tieneCoords =
        typeof data?.latitud === 'number' && typeof data?.longitud === 'number';
      if (!tieneCoords) return { success: false, error: 'falta_ubicacion_mapa' };

      const zonas = await dataSource.getRepository(ZonaDelivery).find({ where: { activa: true } });
      const conPoligono = zonas.filter((z) => !!z.poligono);

      if (conPoligono.length) {
        zona = resolverZonaPorPunto(data.latitud, data.longitud, conPoligono as any) as ZonaDelivery | null;
        // Fuera de todo polígono es un resultado legítimo, no un error interno:
        // el local no llega ahí. Se rechaza explícito en vez de dejar pasar un
        // envío gratis en silencio, que es lo que pasaba antes.
        if (!zona) return { success: false, error: 'fuera_de_cobertura' };
      } else if (data?.zonaDeliveryId) {
        // Compat: instalaciones que todavía no dibujaron sus zonas.
        zona = zonas.find((z) => z.id === Number(data.zonaDeliveryId)) || null;
        if (!zona) return { success: false, error: 'zona_delivery_invalida' };
      }

      if (zona) {
        if (subtotal < Number(zona.montoMinimo)) {
          return {
            success: false,
            error: 'monto_minimo_no_alcanzado',
            montoMinimo: Number(zona.montoMinimo),
            subtotal,
            zona: zona.nombre,
          };
        }
        // La tarifa sale del precio compartido con el PdV; `tarifa` es el
        // fallback de las zonas anteriores a la unificación.
        const zonaConPrecio = await dataSource.getRepository(ZonaDelivery).findOne({
          where: { id: zona.id }, relations: ['precioDelivery'],
        });
        const valorCompartido = Number(zonaConPrecio?.precioDelivery?.valor);
        costoEnvio = Number.isFinite(valorCompartido) && zonaConPrecio?.precioDelivery
          ? valorCompartido
          : Number(zona.tarifa) || 0;
      }
    }

    const total = subtotal + costoEnvio;

    // Persistencia (con reintento de número por colisión de índice único).
    const pedido = new PedidoOnline();
    pedido.numero = await siguienteNumero(pedidoRepo());
    pedido.cuentaCliente = (cuenta || null) as any;
    pedido.nombreCliente = (cuenta?.nombre || nombreClienteInvitado || null) as any;
    pedido.telefonoCliente = (cuenta?.telefono ?? null) as any;
    pedido.tipoPedido = tipoPedido;
    if (mesa) pedido.mesaId = mesa.id;
    // Aceptación automática: entra ACEPTADO directo; si no, RECIBIDO (revisión en PdV).
    if (cfg.aceptacionAutomatica) {
      pedido.estado = EstadoPedidoOnline.ACEPTADO;
      pedido.fechaAceptado = new Date();
    } else {
      pedido.estado = EstadoPedidoOnline.RECIBIDO;
    }
    pedido.canalOrigen = tipoPedido === TipoPedidoOnline.MESA_QR
      ? CanalPedidoOnline.QR_MESA
      : (data?.canalOrigen || CanalPedidoOnline.WEB);
    // MESA_QR: el pago es SIEMPRE en la caja física; el método queda EFECTIVO.
    pedido.metodoPago = tipoPedido === TipoPedidoOnline.MESA_QR
      ? MetodoPagoOnline.EFECTIVO
      : (data?.metodoPago || MetodoPagoOnline.EFECTIVO);
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

    // El número (`count()+1`) puede colisionar con pedidos concurrentes (ej. un
    // grupo grande en una mesa mandando varios pedidos en segundos). Se reintenta
    // regenerando el número; tras N intentos se propaga el error real.
    let saved: PedidoOnline;
    for (let intento = 1; ; intento++) {
      try {
        saved = await pedidoRepo().save(pedido);
        break;
      } catch (e) {
        if (intento >= 6) throw e;
        pedido.numero = await siguienteNumero(pedidoRepo());
      }
    }

    // Materialización automática (auto a cocina). Dos casos:
    // - MESA_QR: siempre. El cliente ya está sentado y el gate del cajero se
    //   aplicó al habilitar la mesa; pedirle otra aceptación no aporta nada.
    // - PICKUP/DELIVERY: sólo si el local activó `aceptacionAutomatica`. Por
    //   defecto está apagado y el pedido espera a que una persona lo mire, que
    //   es lo que evita cocinar algo que después hay que cancelar.
    // Best-effort en los dos casos: si no hay caja abierta o es ambiguo, el
    // pedido queda para la bandeja. Nunca falla el pedido por esto.
    let ventaId: number | null = null;
    if (tipoPedido === TipoPedidoOnline.MESA_QR || cfg.aceptacionAutomatica) {
      try {
        const mat = await materializarPedidoOnlineEnVenta(dataSource, saved.id);
        ventaId = mat?.ventaId ?? null;
      } catch (e) {
        console.warn('[crear-pedido-online] auto-materialización falló:', (e as any)?.message || e);
      }
    }

    return {
      success: true,
      numero: saved.numero,
      pedidoId: saved.id,
      // Si se materializó, el pedido ya está EN_PREPARACION (en cocina).
      estado: ventaId ? EstadoPedidoOnline.EN_PREPARACION : saved.estado,
      subtotal,
      costoEnvio,
      total,
      ventaId,
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

  // ====== CONTEXTO DE MESA POR TOKEN (público, sin auth) — canal MESA_QR ======
  // El storefront, al abrir /tienda?mesa=<token>, resuelve el nº de mesa y si el
  // autoservicio está habilitado. NO devuelve el token (el cliente ya lo tiene).
  ipcMain.handle('get-mesa-online-por-token', async (_event: any, token: string) => {
    const t = String(token || '').trim();
    if (!t) return { success: false, error: 'falta_mesa_token' };
    const mesa = await dataSource.getRepository(PdvMesa).findOne({ where: { qrToken: t } });
    if (!mesa || !mesa.activo) return { success: false, error: 'mesa_invalida' };
    const cfg = await getTiendaConfig(dataSource);
    return {
      success: true,
      mesaId: mesa.id,
      numero: mesa.numero,
      habilitada: !!mesa.autoservicioActivo && !!cfg.permiteMesa,
      permiteMesa: !!cfg.permiteMesa,
      nombreComercio: cfg.nombreComercio || null,
    };
  });

  // ====== COTIZAR ENVÍO POR UBICACIÓN (público, sin auth) ======
  // El checkout llama a esto mientras el cliente mueve el pin, para mostrarle el
  // costo ANTES de confirmar. Es sólo una previsualización: el precio que vale
  // es el que recalcula `crear-pedido-online` con la misma función.
  ipcMain.handle('cotizar-envio-online', async (_event: any, lat: number, lng: number) => {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return { success: false, error: 'coordenadas_invalidas' };
    }
    const zonas = await dataSource.getRepository(ZonaDelivery).find({
      where: { activa: true }, relations: ['precioDelivery'],
    });
    const conPoligono = zonas.filter((z) => !!z.poligono);
    if (!conPoligono.length) {
      // Todavía nadie dibujó las zonas: no se puede cotizar, pero tampoco se
      // bloquea el pedido (el handler de creación mantiene el camino de compat).
      return { success: true, cubierto: true, sinZonasDefinidas: true, costoEnvio: 0, zona: null };
    }
    const zona = resolverZonaPorPunto(lat, lng, conPoligono as any) as ZonaDelivery | null;
    if (!zona) return { success: true, cubierto: false, costoEnvio: 0, zona: null };

    const valorCompartido = Number((zona as any).precioDelivery?.valor);
    const costoEnvio = Number.isFinite(valorCompartido) && (zona as any).precioDelivery
      ? valorCompartido
      : Number(zona.tarifa) || 0;
    return {
      success: true,
      cubierto: true,
      costoEnvio,
      montoMinimo: Number(zona.montoMinimo) || 0,
      zona: { id: zona.id, nombre: zona.nombre },
    };
  });

  // ---- Operaciones públicas ----
  registerPublicOperation('zonas.get', { channel: 'get-zonas-delivery-online', requiresAuth: false, description: 'Zonas de delivery activas.' });
  registerPublicOperation('envio.cotizar', { channel: 'cotizar-envio-online', requiresAuth: false, description: 'Costo de envío para una ubicación del mapa.' });
  registerPublicOperation('mesa.get', { channel: 'get-mesa-online-por-token', requiresAuth: false, description: 'Contexto de una mesa por su token QR.' });
  // pedido.crear usa optionalAuth: MESA_QR admite invitado; PICKUP/DELIVERY exige
  // cliente (validado dentro del handler). Si viene token de cliente, se resuelve.
  registerPublicOperation('pedido.crear', { channel: 'crear-pedido-online', requiresAuth: false, optionalAuth: true, description: 'Crear un pedido online.' });
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
