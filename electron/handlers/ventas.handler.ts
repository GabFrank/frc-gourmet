import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { PrecioDelivery } from '../../src/app/database/entities/ventas/precio-delivery.entity';
import { Delivery, DeliveryEstado } from '../../src/app/database/entities/ventas/delivery.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { VentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { VentaItemObservacion } from '../../src/app/database/entities/ventas/venta-item-observacion.entity';
import { Observacion } from '../../src/app/database/entities/productos/observacion.entity';
import { VentaItemAdicional } from '../../src/app/database/entities/ventas/venta-item-adicional.entity';
import { VentaItemIngredienteModificacion } from '../../src/app/database/entities/ventas/venta-item-ingrediente-modificacion.entity';
import { PdvGrupoCategoria } from '../../src/app/database/entities/ventas/pdv-grupo-categoria.entity';
import { PdvCategoria } from '../../src/app/database/entities/ventas/pdv-categoria.entity';
import { PdvCategoriaItem } from '../../src/app/database/entities/ventas/pdv-categoria-item.entity';
import { PdvItemProducto } from '../../src/app/database/entities/ventas/pdv-item-producto.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { crearDeliveryEnTx } from '../utils/delivery-alta.utils';
import { DeliveryModo } from '../../src/app/database/entities/ventas/delivery.entity';
import { getRangosPrecioVariacion } from '../utils/variacion-precio.utils';
import { getVariacionConfig, getVariacionConfigGlobal } from '../utils/variacion-config.utils';
import { ensureObservacionNotaLibreId } from '../utils/observacion-libre.utils';
import { resolveRequestDeviceId } from '../utils/current-device.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';
import { assertTerminalPuedeOperar } from '../utils/terminal-caja.utils';
import { Not, IsNull, In, EntityManager } from 'typeorm';
import { DeepPartial } from 'typeorm';
import { Reserva } from '../../src/app/database/entities/ventas/reserva.entity';
import { ensurePermission } from '../utils/auth.utils';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import { CuentaPorCobrarEstado, MovimientoClienteTipo } from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { PdvMesa, PdvMesaEstado } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { Comanda, ComandaEstado } from '../../src/app/database/entities/ventas/comanda.entity';
import { printComandaInternal, printVentaTicketInternal } from './documentos-tickets.handler';
import { Sector } from '../../src/app/database/entities/ventas/sector.entity';
import { ComandaItem, ComandaItemEstado } from '../../src/app/database/entities/ventas/comanda-item.entity';
import { ProductoSector } from '../../src/app/database/entities/productos/producto-sector.entity';
import { broadcastComandaEvent } from '../utils/comanda-events.utils';
import { PdvAtajoGrupo } from '../../src/app/database/entities/ventas/pdv-atajo-grupo.entity';
import { PdvAtajoItem } from '../../src/app/database/entities/ventas/pdv-atajo-item.entity';
import { PdvAtajoGrupoItem } from '../../src/app/database/entities/ventas/pdv-atajo-grupo-item.entity';
import { PdvAtajoItemProducto } from '../../src/app/database/entities/ventas/pdv-atajo-item-producto.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { ProductoTipo } from '../../src/app/database/entities/productos/producto-tipo.enum';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaIngrediente } from '../../src/app/database/entities/productos/receta-ingrediente.entity';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';
import { PrecioCosto } from '../../src/app/database/entities/productos/precio-costo.entity';
import { StockMovimiento, StockMovimientoTipo, StockMovimientoTipoReferencia } from '../../src/app/database/entities/productos/stock-movimiento.entity';
import { Combo } from '../../src/app/database/entities/productos/combo.entity';
import { ComboProducto } from '../../src/app/database/entities/productos/combo-producto.entity';
import { Produccion } from '../../src/app/database/entities/productos/produccion.entity';
import { resumirMetricasBuffet, BuffetItemMetrica } from '../../src/app/shared/utils/buffet-metricas.util';
import { Adicional } from '../../src/app/database/entities/productos/adicional.entity';
import { TipoModificacionIngrediente } from '../../src/app/database/entities/ventas/venta-item-ingrediente-modificacion.entity';
import { EstadoVentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { VentaItemSabor } from '../../src/app/database/entities/ventas/venta-item-sabor.entity';
import { dbQuery } from '../utils/db-query';
import { computeResumenCaja } from '../utils/resumen-caja.utils';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { EstadoPedidoOnline, TipoPedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { CobroParcial } from '../../src/app/database/entities/ventas/cobro-parcial.entity';
import { CobroParcialItem } from '../../src/app/database/entities/ventas/cobro-parcial-item.entity';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { invalidarCacheJornada } from './dashboard-ventas.handler';

/**
 * M-04: mutex por-venta para serializar procesarStockVenta. El chequeo de
 * idempotencia (contar StockMovimiento existentes) y la escritura ocurren en
 * pasos separados; dos llamadas concurrentes para la misma venta podían pasar
 * ambas el chequeo y duplicar el descuento de stock. En cualquier modo
 * (standalone/server/client) hay UN solo proceso Node que escribe la BD, así
 * que un candado en memoria por ventaId serializa correctamente.
 */
const procesarStockTails = new Map<number, Promise<void>>();
async function withVentaStockLock<T>(ventaId: number, fn: () => Promise<T>): Promise<T> {
  const prev = procesarStockTails.get(ventaId) ?? Promise.resolve();
  let release!: () => void;
  const myTurn = new Promise<void>((res) => (release = res));
  const composed = prev.then(() => myTurn);
  procesarStockTails.set(ventaId, composed);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (procesarStockTails.get(ventaId) === composed) procesarStockTails.delete(ventaId);
  }
}

// Serializa por mesa las operaciones que abren una venta sobre ella (proceso Node
// único). Evita dos ventas ABIERTAS para la misma mesa y la doble materialización
// de un pedido online cuando la auto-materialización y un click manual del cajero
// coinciden. Lo usan `materializarPedidoOnlineEnVenta` y `createVenta`.
const mesaTails = new Map<number, Promise<void>>();
async function withMesaLock<T>(mesaId: number, fn: () => Promise<T>): Promise<T> {
  const prev = mesaTails.get(mesaId) ?? Promise.resolve();
  let release!: () => void;
  const myTurn = new Promise<void>((res) => (release = res));
  const composed = prev.then(() => myTurn);
  mesaTails.set(mesaId, composed);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (mesaTails.get(mesaId) === composed) mesaTails.delete(mesaId);
  }
}

// Lo mismo por comanda. El candado de mesa no las cubre: una transferencia
// entre dos comandas no toca ninguna mesa, asi que corria sin serializar y dos
// cajeros podian dejar dos ventas ABIERTA colgando de la misma comanda — una de
// ellas inalcanzable desde el cobro, con sus items ya en cocina.
// Y lo mismo por pedido online. Un pedido de PICKUP/DELIVERY no tiene mesa, así
// que `withMesaLock` no lo cubre: usarlo con `mesaId` nulo haría que TODOS los
// pedidos sin mesa compartan una única clave y se serialicen entre sí, un mutex
// global accidental. La unidad que hay que serializar es el pedido.
const pedidoTails = new Map<number, Promise<void>>();
async function withPedidoLock<T>(pedidoId: number, fn: () => Promise<T>): Promise<T> {
  const prev = pedidoTails.get(pedidoId) ?? Promise.resolve();
  let release!: () => void;
  const myTurn = new Promise<void>((res) => (release = res));
  const composed = prev.then(() => myTurn);
  pedidoTails.set(pedidoId, composed);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (pedidoTails.get(pedidoId) === composed) pedidoTails.delete(pedidoId);
  }
}

const comandaTails = new Map<number, Promise<void>>();
async function withComandaLock<T>(comandaId: number, fn: () => Promise<T>): Promise<T> {
  const prev = comandaTails.get(comandaId) ?? Promise.resolve();
  let release!: () => void;
  const myTurn = new Promise<void>((res) => (release = res));
  const composed = prev.then(() => myTurn);
  comandaTails.set(comandaId, composed);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (comandaTails.get(comandaId) === composed) comandaTails.delete(comandaId);
  }
}

/**
 * Materializa un PedidoOnline en una Venta y lo manda a cocina.
 *
 * Dos caminos según el canal:
 * - **MESA_QR** (con `mesaId`): reusa la Venta ABIERTA de la mesa o la abre, y
 *   marca la mesa OCUPADO. Varios comensales de la misma mesa caen en una sola
 *   cuenta. Se serializa por mesa.
 * - **PICKUP/DELIVERY** (sin mesa): abre una Venta propia por pedido, con
 *   `canalOrigen = 'WEB'`. No reusa ninguna venta de mostrador abierta: cada
 *   pedido web es una cuenta en sí misma. Se serializa por pedido.
 *
 * Vuelca los items como VentaItem (+ sabores + adicionales + observaciones/nota
 * libre) disparando el KDS/impresión por los hooks. Idempotente por
 * `pedido.ventaId`. Escrituras en transacción; los hooks corren post-commit.
 *
 * Las observaciones predefinidas se resuelven por texto contra el catálogo
 * `Observacion`; la nota libre y las no matcheadas se cuelgan de un sentinel
 * ('NOTA DEL CLIENTE') vía observacionLibre. Las modificaciones de ingredientes
 * no se capturan en pedidos online (no aplica).
 *
 * NO chequea permisos: es una función de sistema, gateada aguas arriba por la
 * validación de mesa (autoservicio habilitado + LAN). El ipc handler la envuelve
 * con ensurePermission para el uso manual del cajero.
 */
export async function materializarPedidoOnlineEnVenta(
  dataSource: DataSource,
  pedidoId: number,
  opts?: { cajaId?: number },
  _userId?: number,
): Promise<{ ventaId: number; yaMaterializado: boolean; itemsCreados: number; observacionesNoMapeadas: any[] }> {
  // Fast-path (no autoritativo): si ya se materializó, salir sin tomar el lock.
  const pedidoPre = await dataSource.getRepository(PedidoOnline).findOne({ where: { id: pedidoId } });
  if (!pedidoPre) throw new Error(`Pedido online ${pedidoId} no encontrado`);
  if (pedidoPre.ventaId) {
    return { ventaId: pedidoPre.ventaId, yaMaterializado: true, itemsCreados: 0, observacionesNoMapeadas: [] };
  }

  // MESA_QR se serializa por mesa (varios comensales pidiendo a la misma cuenta);
  // PICKUP/DELIVERY no tienen mesa y se serializan por pedido.
  const conMesa = !!pedidoPre.mesaId;
  const conLock = conMesa
    ? <T,>(fn: () => Promise<T>) => withMesaLock(pedidoPre.mesaId as number, fn)
    : <T,>(fn: () => Promise<T>) => withPedidoLock(pedidoId, fn);

  return conLock(async () => {
    const pedido = await dataSource.getRepository(PedidoOnline).findOne({
      where: { id: pedidoId },
      relations: ['items'],
    });
    if (!pedido) throw new Error(`Pedido online ${pedidoId} no encontrado`);
    // Idempotencia autoritativa BAJO lock: evita doble materialización del mismo pedido.
    if (pedido.ventaId) {
      return { ventaId: pedido.ventaId, yaMaterializado: true, itemsCreados: 0, observacionesNoMapeadas: [] };
    }

    // Caja: la del parámetro o la única caja abierta.
    let cajaId: number | undefined = opts?.cajaId ? Number(opts.cajaId) : undefined;
    if (!cajaId) {
      const abiertas = await dataSource.getRepository(Caja).find({ where: { estado: CajaEstado.ABIERTO } });
      if (abiertas.length === 0) throw new Error('no_hay_caja_abierta');
      if (abiertas.length > 1) throw new Error('caja_ambigua_especificar_cajaId');
      cajaId = abiertas[0].id;
    }

    const userId = _userId;
    const createdItemIds: number[] = [];
    const observacionesNoMapeadas: any[] = [];
    let ventaId = 0;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
    const mesaRepo = qr.manager.getRepository(PdvMesa);
    const ventaRepo = qr.manager.getRepository(Venta);
    const itemRepo = qr.manager.getRepository(VentaItem);
    const saborRepo = qr.manager.getRepository(VentaItemSabor);
    const adicionalRepo = qr.manager.getRepository(VentaItemAdicional);
    const obsCatRepo = qr.manager.getRepository(Observacion);
    const obsItemRepo = qr.manager.getRepository(VentaItemObservacion);

    // Sentinel para la nota libre del cliente (VentaItemObservacion.observacion es
    // FK obligatoria; la nota va en observacionLibre colgada de esta observación).
    // Se asegura vía dataSource (fuera de la transacción) tolerando la colisión de
    // unique, para no abortar la materialización si dos mesas lo crean a la vez.
    // Se memoiza por llamada: la materialización puede tener varios ítems con nota.
    let sentinelObsId: number | null = null;
    const getSentinelObs = async (): Promise<number> => {
      if (sentinelObsId == null) sentinelObsId = await ensureObservacionNotaLibreId(dataSource);
      return sentinelObsId;
    };

    let venta: Venta | null = null;

    if (conMesa) {
      const mesa = await mesaRepo.findOneBy({ id: pedido.mesaId });
      if (!mesa) throw new Error(`Mesa ${pedido.mesaId} no encontrada`);

      // Venta ABIERTA de la mesa (comanda IsNull = cuenta de mesa), o crear una.
      // Se REUSA a propósito: varios comensales de la misma mesa pidiendo desde
      // su celular tienen que caer en una sola cuenta.
      venta = await ventaRepo.findOne({
        where: { mesa: { id: mesa.id }, estado: VentaEstado.ABIERTA, comanda: IsNull() },
      });
      if (!venta) {
        venta = ventaRepo.create({
          estado: VentaEstado.ABIERTA,
          caja: { id: cajaId } as any,
          mesa: { id: mesa.id } as any,
          canalOrigen: 'QR_MESA',
        });
        await setEntityUserTracking(dataSource, venta, userId, false);
        venta = await ventaRepo.save(venta);
        if (mesa.estado !== PdvMesaEstado.OCUPADO) {
          mesa.estado = PdvMesaEstado.OCUPADO;
          await setEntityUserTracking(dataSource, mesa, userId, true);
          await mesaRepo.save(mesa);
        }
      }
    } else {
      // PICKUP/DELIVERY: venta propia por pedido, sin mesa. NO se reusa ninguna
      // venta abierta — cada pedido web es una cuenta cerrada en sí misma, y
      // colgarlo de una venta de mostrador ajena mezclaría dos clientes.
      // `canalOrigen: 'WEB'` es lo que hace que los hooks la manden a cocina.
      venta = ventaRepo.create({
        estado: VentaEstado.ABIERTA,
        caja: { id: cajaId } as any,
        canalOrigen: 'WEB',
        nombreCliente: pedido.nombreCliente ? pedido.nombreCliente.toUpperCase() : undefined,
      });

      // DELIVERY y PICKUP abren su registro en la misma transacción. Sin esto
      // el pedido no entra al tablero del PdV: no se le puede cambiar de
      // estado, ni cobrar desde el footer, ni imprimir su ticket — vivía en un
      // carril paralelo.
      //
      // El PICKUP entra como `Delivery` en modo RETIRO, sin dirección ni costo
      // de envío. Es la misma fila de la lista que un reparto, con las tres
      // columnas que dependen de que alguien lo lleve vacías.
      const esRetiro = pedido.tipoPedido === TipoPedidoOnline.PICKUP;
      if (esRetiro || pedido.tipoPedido === TipoPedidoOnline.DELIVERY) {
        const delivery = await crearDeliveryEnTx(qr.manager, dataSource, {
          nombre: pedido.nombreCliente,
          telefono: pedido.telefonoCliente,
          direccion: esRetiro
            ? undefined
            : [pedido.direccionEntrega, pedido.referenciaDireccion]
                .filter(Boolean).join(' · ') || undefined,
          observacion: pedido.notas,
          modo: esRetiro ? DeliveryModo.RETIRO : DeliveryModo.DELIVERY,
          // El costo ya viene congelado en el pedido: no se re-resuelve por zona,
          // que podría haber cambiado de precio entre el pedido y la aceptación.
          cobroAnticipado: false,
        }, userId);
        venta.delivery = delivery as any;
        venta.costoDelivery = esRetiro ? 0 : (Number(pedido.costoEnvio) || 0);
        pedido.deliveryId = delivery.id;
      }

      await setEntityUserTracking(dataSource, venta, userId, false);
      venta = await ventaRepo.save(venta);
    }

    ventaId = venta.id;

    for (const pItem of pedido.items || []) {
      let pers: any = {};
      try { pers = pItem.personalizacion ? JSON.parse(pItem.personalizacion) : {}; } catch { pers = {}; }
      const sabores: any[] = Array.isArray(pers.sabores) ? pers.sabores : [];
      const adicionales: any[] = Array.isArray(pers.adicionales) ? pers.adicionales : [];

      // El pedido congela precioUnitario = opcion.valor + Σ adicionales.
      // Se separa igual que el PdV: precioVentaUnitario base + precioAdicionales.
      const adicTotal = adicionales.reduce((s, a) => s + (Number(a?.precio) || 0), 0);
      const precioVentaUnitario = Math.max(0, Number(pItem.precioUnitario || 0) - adicTotal);

      const esPizza = sabores.length > 0;
      let principalRpId: number | undefined;
      if (esPizza) {
        const principal = sabores.reduce(
          (best, s) => (Number(s?.precioReferencia) || 0) > (Number(best?.precioReferencia) || 0) ? s : best,
          sabores[0],
        );
        principalRpId = principal?.recetaPresentacionId;
      }

      // Costo (best-effort): el snapshot online no lo trae. Pizza → costo_calculado
      // por RecetaPresentacion ponderado por proporción; simple → PrecioCosto activo
      // del producto. Sin dato → 0. Necesario para que margen/CMV no queden inflados.
      const rpCostos = new Map<number, number>();
      let precioCostoUnitario = 0;
      if (esPizza) {
        for (const s of sabores) {
          const rpId = Number(s?.recetaPresentacionId) || 0;
          if (!rpId) continue;
          if (!rpCostos.has(rpId)) {
            const rp = await qr.manager.getRepository(RecetaPresentacion).findOne({ where: { id: rpId } });
            rpCostos.set(rpId, Number(rp?.costo_calculado) || 0);
          }
          precioCostoUnitario += (Number(s.proporcion) || 1 / sabores.length) * (rpCostos.get(rpId) || 0);
        }
      } else {
        const pc = await qr.manager.getRepository(PrecioCosto).findOne({
          where: { producto: { id: pItem.productoId }, activo: true },
          order: { id: 'DESC' },
        });
        precioCostoUnitario = Number(pc?.valor) || 0;
      }

      const vItem = itemRepo.create({
        venta: { id: ventaId } as any,
        producto: { id: pItem.productoId } as any,
        presentacion: pItem.presentacionId ? ({ id: pItem.presentacionId } as any) : null,
        cantidad: Number(pItem.cantidad) || 1,
        precioVentaUnitario,
        precioCostoUnitario,
        precioAdicionales: adicTotal,
        estado: EstadoVentaItem.ACTIVO,
        recetaPresentacion: principalRpId ? ({ id: principalRpId } as any) : null,
        ensambladoDescripcion: esPizza ? String(pers?.opcion?.label || '').slice(0, 500) : null,
        cantidadSabores: sabores.length,
      });
      await setEntityUserTracking(dataSource, vItem, userId, false);
      const savedItem = await itemRepo.save(vItem);
      createdItemIds.push(savedItem.id);

      // Sabores (pizza mitad y mitad) — ids presentes en el snapshot.
      for (const s of sabores) {
        if (!s?.recetaPresentacionId) continue;
        const vs = saborRepo.create({
          ventaItem: { id: savedItem.id } as any,
          recetaPresentacion: { id: s.recetaPresentacionId } as any,
          proporcion: Number(s.proporcion) || 1 / sabores.length,
          precioReferencia: Number(s.precioReferencia) || 0,
          costoReferencia: rpCostos.get(Number(s.recetaPresentacionId) || 0) || 0,
        });
        await setEntityUserTracking(dataSource, vs, userId, false);
        await saborRepo.save(vs);
      }

      // Adicionales — ids presentes en el snapshot.
      for (const a of adicionales) {
        if (!a?.id) continue;
        const va = adicionalRepo.create({
          ventaItem: { id: savedItem.id } as any,
          adicional: { id: a.id } as any,
          precioCobrado: Number(a.precio) || 0,
          cantidad: 1,
        });
        await setEntityUserTracking(dataSource, va, userId, false);
        await adicionalRepo.save(va);
      }

      // Observaciones predefinidas: el snapshot online trae el TEXTO; se resuelve
      // contra el catálogo global `Observacion` (descripcion única). Las que no
      // matchean + la nota libre se cuelgan del sentinel vía observacionLibre.
      const obs: string[] = Array.isArray(pers.observaciones) ? pers.observaciones : [];
      const libres: string[] = [];
      for (const texto of obs) {
        const desc = String(texto || '').trim().toUpperCase();
        if (!desc) continue;
        const cat = await obsCatRepo.findOne({ where: { descripcion: desc } });
        if (cat) {
          const vo = obsItemRepo.create({
            ventaItem: { id: savedItem.id } as any,
            observacion: { id: cat.id } as any,
          });
          await setEntityUserTracking(dataSource, vo, userId, false);
          await obsItemRepo.save(vo);
        } else {
          libres.push(desc);
        }
      }
      // UPPERCASE como todo string que va a BD (las de catálogo ya se normalizan arriba).
      const notaLibre = pers.notaLibre ? String(pers.notaLibre).trim().toUpperCase() : '';
      if (notaLibre) libres.push(notaLibre);
      if (libres.length) {
        const vo = obsItemRepo.create({
          ventaItem: { id: savedItem.id } as any,
          observacion: { id: await getSentinelObs() } as any,
          observacionLibre: libres.join(' · ').slice(0, 500),
        });
        await setEntityUserTracking(dataSource, vo, userId, false);
        await obsItemRepo.save(vo);
      }
    }

    // Relectura del estado DENTRO de la transacción, justo antes de escribir.
    //
    // El `pedido` que tenemos en memoria se cargó al abrir la transacción, y
    // entre ese momento y ahora hay una ventana real: `aceptar-pedido-online`
    // marca ACEPTADO y recién después llama acá, así que un RECHAZAR de otro
    // operador (o un reintento cruzado) puede haber comiteado RECHAZADO
    // mientras esto corría. Sin este chequeo el `save` de abajo pisaba ese
    // rechazo y el pedido resucitaba EN_PREPARACION, con venta viva y comanda
    // ya impresa: el operador rechazó y la cocina cocinó igual.
    const estadoActual = await qr.manager.getRepository(PedidoOnline).findOne({
      where: { id: pedidoId },
      select: ['id', 'estado', 'ventaId'],
    });
    if (!estadoActual) throw new Error(`Pedido online ${pedidoId} no encontrado`);
    if (
      estadoActual.estado === EstadoPedidoOnline.RECHAZADO ||
      estadoActual.estado === EstadoPedidoOnline.CANCELADO
    ) {
      // Rollback: la Venta y sus ítems creados en esta transacción se
      // descartan enteros, que es exactamente lo que corresponde a un pedido
      // que ya no existe para el negocio.
      throw new Error('pedido_rechazado_durante_materializacion');
    }
    if (estadoActual.ventaId) {
      // Otro camino lo materializó primero. Igual que arriba: descartar.
      throw new Error('pedido_ya_materializado_por_otro');
    }

    pedido.ventaId = ventaId;
    pedido.estado = EstadoPedidoOnline.EN_PREPARACION;
    await qr.manager.getRepository(PedidoOnline).save(pedido);

    await qr.commitTransaction();
  } catch (e) {
    await qr.rollbackTransaction();
    throw e;
  } finally {
    await qr.release();
  }

  // Post-commit: disparar KDS + impresión (leen por dataSource, ya visible).
  for (const itemId of createdItemIds) {
    try { await crearComandaItemsSiCorresponde(dataSource, itemId); }
    catch (e) { console.warn('[materializar-pedido-online] hook KDS falló:', e); }
  }
  try { await autoPrintComandaIfNeeded(dataSource, ventaId); }
  catch (e) { console.warn('[materializar-pedido-online] auto-imprimir comanda falló:', e); }

    return { ventaId, yaMaterializado: false, itemsCreados: createdItemIds.length, observacionesNoMapeadas };
  });
}

/**
 * Un producto con variación no puede venderse sin su variación.
 *
 * El diálogo del PdV no deja avanzar sin elegir tamaño y sabor, pero esa
 * validación es de la UI: `/api/rpc` es default-allow, así que cualquier
 * cliente con `VENTAS_PDV` podía crear un ítem de PAPAS FRITAS sin tamaño ni
 * sabor —y con el precio que quisiera— llamando al handler directo. El ítem
 * entraba a la venta, a la comanda de cocina y al ticket como «1 PAPAS
 * FRITAS», sin que nadie supiera cuáles.
 *
 * `recetaPresentacion` es lo que identifica la variación (sabor × tamaño) y es
 * lo que el PdV manda siempre; sin eso el ítem no describe nada vendible.
 */
async function validarVariacionDelItem(
  dataSource: DataSource,
  data: any,
  existente?: any,
): Promise<void> {
  // Se valida el ESTADO FINAL del ítem, no el payload.
  //
  // Es la diferencia entre funcionar y bloquear ventas: `cancelItem` en el PdV
  // reenvía el `VentaItem` entero tal como lo devolvió `getVentaItems`, y esa
  // consulta no carga la relación `recetaPresentacion`. Mirando sólo el payload,
  // cancelar una pizza fallaba siempre con "falta elegir el tamaño y el sabor"
  // — el ítem sí tenía su variación, simplemente no venía en el objeto.
  const productoId = data?.producto?.id ?? data?.productoId ?? data?.producto_id
    ?? existente?.producto?.id;
  if (!productoId) return;

  const producto = await dataSource.getRepository(Producto).findOne({
    where: { id: Number(productoId) },
    select: ['id', 'nombre', 'tipo'],
  });
  if (!producto || (producto as any).tipo !== ProductoTipo.ELABORADO_CON_VARIACION) return;

  const rp = data?.recetaPresentacion?.id ?? data?.recetaPresentacionId ?? data?.receta_presentacion_id
    ?? existente?.recetaPresentacion?.id;
  if (!rp) {
    throw new Error(
      `${producto.nombre} se vende por variación: falta elegir el tamaño y el sabor.`,
    );
  }
}

export function registerVentasHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  // Remove this line - get the current user in each handler instead
  // const currentUser = getCurrentUser(); // Get user for tracking


  // Arrancar worker de retry de comandas (cada 5s reintenta items con
  // `impreso=false` y al menos un intento previo, en ventas ABIERTAS).
  startRetryComandaWorker(dataSource);

  // --- Métricas de buffet por peso (dashboard) ---
  ipcMain.handle('get-buffet-metricas', async (_event: any, filtros: any = {}) => {
    try {
      const desde = filtros?.desde ? new Date(filtros.desde) : null;
      const hasta = filtros?.hasta ? new Date(filtros.hasta) : null;

      const viRepo = dataSource.getRepository(VentaItem);
      const qb = viRepo.createQueryBuilder('vi')
        .innerJoinAndSelect('vi.venta', 'venta')
        .innerJoinAndSelect('vi.producto', 'producto')
        .where('producto.tipo = :tipo', { tipo: ProductoTipo.BUFFET_POR_PESO })
        .andWhere('vi.estado = :estado', { estado: 'ACTIVO' })
        .andWhere('venta.estado = :vestado', { vestado: VentaEstado.CONCLUIDA });
      if (desde) qb.andWhere('venta.fechaCierre >= :desde', { desde });
      if (hasta) qb.andWhere('venta.fechaCierre <= :hasta', { hasta });
      const items = await qb.getMany();

      const metricaItems: BuffetItemMetrica[] = items.map((it: any) => ({
        pesoNetoGramos: Number(it.pesoNeto) || 0,
        total: (Number(it.precioVentaUnitario) || 0) * (Number(it.cantidad) || 0),
        costo: (Number(it.precioCostoUnitario) || 0) * (Number(it.cantidad) || 0),
        aplicoLibre: !!it.aplicoLibre,
        ventaId: it.venta?.id,
      }));

      const prodRepo = dataSource.getRepository(Produccion);
      const pqb = prodRepo.createQueryBuilder('p').where('p.activo = :a', { a: true });
      if (desde) pqb.andWhere('p.fecha >= :desde', { desde });
      if (hasta) pqb.andWhere('p.fecha <= :hasta', { hasta });
      const producciones = await pqb.getMany();
      const kgProducidos = producciones.reduce(
        (s: number, p: any) => s + (Number(p.cantidadProducida) || 0),
        0,
      );

      return resumirMetricasBuffet(metricaItems, kgProducidos);
    } catch (error) {
      console.error('Error get-buffet-metricas:', error);
      throw error;
    }
  });

  // --- PrecioDelivery Handlers ---
  ipcMain.handle('getPreciosDelivery', async () => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      return await repo.find({ order: { descripcion: 'ASC' } });
    } catch (error) {
      console.error('Error getting precios delivery:', error);
      throw error;
    }
  });

  ipcMain.handle('getPrecioDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting precio delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPrecioDelivery', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PrecioDelivery);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating precio delivery:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePrecioDelivery', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PrecioDelivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Precio Delivery ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating precio delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePrecioDelivery', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PrecioDelivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Precio Delivery ID ${id} not found`);
      
      // Check dependencies (Deliveries) before deleting
      const deliveryRepo = dataSource.getRepository(Delivery);
      const deliveriesCount = await deliveryRepo.count({ 
        where: { precioDelivery: { id } }
      });
      
      if (deliveriesCount > 0) {
        throw new Error(`No se puede eliminar el precio de delivery porque está asociado a ${deliveriesCount} deliveries.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting precio delivery ID ${id}:`, error);
      throw error;
    }
  });

  // --- Delivery Handlers ---
  ipcMain.handle('getDeliveries', async () => {
    try {
      const repo = dataSource.getRepository(Delivery);
      return await repo.find({ 
        relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'],
        order: { fechaAbierto: 'DESC' } 
      });
    } catch (error) {
      console.error('Error getting deliveries:', error);
      throw error;
    }
  });

  ipcMain.handle('getDeliveriesByEstado', async (_event: any, estado: DeliveryEstado) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      return await repo.find({ 
        where: { estado },
        relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'],
        order: { fechaAbierto: 'DESC' } 
      });
    } catch (error) {
      console.error(`Error getting deliveries with estado ${estado}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      return await repo.findOne({ 
        where: { id },
        relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'] 
      });
    } catch (error) {
      console.error(`Error getting delivery ID ${id}:`, error);
      throw error;
    }
  });

  /**
   * @deprecated Usar `delivery-crear`, que crea el Delivery y su Venta en UNA
   * transacción.
   *
   * Este handler creaba un `Delivery` suelto. Como la lista del PdV se arma
   * partiendo de `Venta`, un delivery sin venta es un registro invisible e
   * inalcanzable para siempre. El canal sigue registrado (está en `preload.ts`
   * y en el mapa de canales) pero rechaza: `/api/rpc` es default-allow y
   * dejarlo vivo reabre el agujero desde cualquier cliente.
   */
  ipcMain.handle('createDelivery', async () => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    throw new Error(
      'createDelivery está deprecado: usá delivery-crear, que crea el delivery y su venta en una sola transacción.',
    );
  });

  ipcMain.handle('updateDelivery', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      // El estado y sus timestamps son de la máquina de estados
      // (`delivery-cambiar-estado` / `delivery-cancelar`), no de este merge
      // crudo. Como `/api/rpc` es default-allow, sin este guard cualquier
      // cliente con un JWT de VENTAS_PDV podía saltar de ABIERTO a ENTREGADO,
      // escribir un estado inexistente o falsear las fechas.
      // Además del estado y sus timestamps, la ZONA está reservada: cambiarla
      // tiene que resincronizar `venta.costoDelivery` (y sólo se puede si la
      // venta sigue ABIERTA), y este merge crudo no hace ni una cosa ni la otra
      // — dejaría el envío cobrado con un precio y el delivery mostrando otro.
      const camposReservados = [
        'estado', 'fechaAbierto', 'fechaParaEntrega', 'fechaEnCamino',
        'fechaEntregado', 'fechaCancelacion', 'motivoCancelacion',
        'precioDelivery', 'precioDeliveryId', 'entregadoPorFuncionario',
        // `modo` tiene su propio canal (`delivery-convertir-modo`): convertir
        // mueve el costo de envío de la venta, desasigna al repartidor,
        // sincroniza el pedido de la tienda y cambia la tabla de transiciones
        // que rige el pedido. Un `merge` crudo no hace nada de eso y dejaría un
        // registro con dirección y envío cobrado disfrazado de algo que nadie
        // lleva.
        'modo',
      ].filter((c) => data && Object.prototype.hasOwnProperty.call(data, c));
      if (camposReservados.length > 0) {
        throw new Error(
          `updateDelivery no puede modificar ${camposReservados.join(', ')}: usá delivery-actualizar-datos, delivery-cambiar-estado o delivery-cancelar.`,
        );
      }
      const repo = dataSource.getRepository(Delivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Delivery ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteDelivery', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Delivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Delivery ID ${id} not found`);
      
      // Check dependencies (Ventas) before deleting
      const ventaRepo = dataSource.getRepository(Venta);
      const ventasCount = await ventaRepo.count({ 
        where: { delivery: { id } }
      });
      
      if (ventasCount > 0) {
        throw new Error(`No se puede eliminar el delivery porque está asociado a ${ventasCount} ventas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting delivery ID ${id}:`, error);
      throw error;
    }
  });

  // Get deliveries by caja with pagination and filters
  ipcMain.handle('getDeliveriesByCaja', async (_event: any, cajaId: number, filtros?: any) => {
    try {
      const ventaRepo = dataSource.getRepository(Venta);
      const qb = ventaRepo.createQueryBuilder('venta')
        .leftJoinAndSelect('venta.delivery', 'delivery')
        .leftJoinAndSelect('delivery.precioDelivery', 'precioDelivery')
        .leftJoinAndSelect('delivery.cliente', 'cliente')
        .leftJoinAndSelect('cliente.persona', 'persona')
        .leftJoinAndSelect('delivery.entregadoPor', 'entregadoPor')
        .leftJoinAndSelect('entregadoPor.persona', 'entregadoPorPersona')
        .leftJoinAndSelect('venta.items', 'items')
        .leftJoinAndSelect('venta.pago', 'pago')
        .where('venta.caja_id = :cajaId', { cajaId })
        .andWhere('delivery.id IS NOT NULL');

      if (filtros?.estado) {
        qb.andWhere('delivery.estado = :estado', { estado: filtros.estado });
      }

      qb.orderBy('delivery.fechaAbierto', 'DESC');

      // Pagination
      const page = filtros?.page || 1;
      const pageSize = filtros?.pageSize || 20;
      qb.skip((page - 1) * pageSize).take(pageSize);

      const [ventas, total] = await qb.getManyAndCount();

      const data = ventas.map(venta => ({
        ...venta.delivery,
        venta: { id: venta.id, estado: venta.estado, items: venta.items, pago: venta.pago },
      }));

      return { data, total };
    } catch (error) {
      console.error(`Error getting deliveries for caja ${cajaId}:`, error);
      throw error;
    }
  });

  // --- Cerrar todas las ventas abiertas de una mesa ---
  ipcMain.handle('cerrarVentasAbiertasMesa', async (_event: any, mesaId: number, estado: string, opts?: { validarDispositivoCaja?: boolean }) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Venta);
      // Solo las ventas DE MESA (comanda IS NULL): las cuentas de comanda
      // vinculadas a la mesa se cierran/liberan desde su propio flujo.
      const ventasAbiertas = await repo.find({
        where: { mesa: { id: mesaId }, estado: VentaEstado.ABIERTA, comanda: IsNull() },
        relations: ['caja'],
      });
      // Este handler pone CONCLUIDA con `repo.save` directo, sin pasar por
      // `updateVenta`: es un tercer camino de finalización y necesita el mismo
      // gate de terminal ajena. Sólo aplica al cierre por cobro (CONCLUIDA); la
      // cancelación de una mesa no es finalizar un cobro.
      if (opts?.validarDispositivoCaja && estado === VentaEstado.CONCLUIDA) {
        for (const v of ventasAbiertas) {
          await assertTerminalPuedeOperar(dataSource, _event, (v.caja as any)?.id ?? null, 'FINALIZAR');
        }
      }
      for (const v of ventasAbiertas) {
        v.estado = estado as VentaEstado;
        await repo.save(v);
      }
      // Cerrar las cuentas de la mesa cambia su ocupacion: el cache la sigue.
      if (ventasAbiertas.length > 0) await sincronizarEstadoMesa(mesaId);
      return ventasAbiertas.length;
    } catch (error) {
      console.error(`Error cerrando ventas abiertas de mesa ${mesaId}:`, error);
      throw error;
    }
  });

  // --- Venta Handlers ---
  ipcMain.handle('getVentas', async () => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.find({
        relations: [
          'cliente', 
          'cliente.persona', 
          'formaPago', 
          'caja', 
          'pago', 
          'delivery'
        ],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting ventas:', error);
      throw error;
    }
  });

  ipcMain.handle('getVentasByEstado', async (_event: any, estado: VentaEstado) => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.find({
        where: { estado },
        relations: [
          'cliente', 
          'cliente.persona', 
          'formaPago', 
          'caja', 
          'pago', 
          'delivery'
        ],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error(`Error getting ventas with estado ${estado}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getVenta', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.findOne({
        where: { id },
        relations: [
          'cliente', 
          'cliente.persona', 
          'formaPago', 
          'caja', 
          'pago', 
          'delivery'
        ]
      });
    } catch (error) {
      console.error(`Error getting venta ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVenta', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const userId = getCurrentUser()?.id;
      // F5 paso 3: si el caller no especifico dispositivo, resolverlo del
      // request context (JWT en cliente HTTP, current-device en IPC local).
      const deviceId = (!data?.dispositivo && !data?.dispositivo_id)
        ? resolveRequestDeviceId(_event)
        : null;

      // La mesa se ocupa ACA, en la misma transaccion que crea la venta.
      //
      // Antes el frontend hacia una segunda llamada a `updatePdvMesa`, que exige
      // VENTAS_PDV_CONFIGURAR — un permiso que solo tiene GERENTE. A un mozo o
      // cajero le fallaba, el error se tragaba en un console.error y la mesa
      // quedaba sin marcar. Es el mismo patron que ya usa `abrirComanda`.
      //
      // Solo aplica a la venta de mesa DIRECTA. Si la venta cuelga de una
      // comanda NO ocupa la mesa: el vinculo comanda->mesa es de ubicacion, no
      // de ocupacion (ver `mesaTieneCuentaPropia`).
      // Sólo la forma `{ mesa: { id } }`: un `mesa_id` suelto no lo traduce
      // `repo.create()` a la relación, así que la venta quedaría sin mesa y
      // marcaríamos ocupada una mesa sin venta vinculada — justo el estado que
      // este fix elimina.
      const mesaId = data?.mesa?.id ?? null;
      const tieneComanda = !!data?.comanda?.id;
      const ocupaMesa = !!mesaId && !tieneComanda;

      const crear = async (): Promise<any> => dataSource.transaction(async (manager) => {
        const repo = manager.getRepository(Venta);
        const entity: any = repo.create(data);
        await setEntityUserTracking(dataSource, entity, userId, false);
        if (deviceId != null) entity.dispositivo = { id: deviceId };
        const saved = await repo.save(entity);

        if (ocupaMesa) {
          const mesaRepo = manager.getRepository(PdvMesa);
          const mesa = await mesaRepo.findOneBy({ id: Number(mesaId) });
          // Nunca degrada una mesa ya ocupada por otra venta.
          if (mesa && mesa.estado !== PdvMesaEstado.OCUPADO) {
            mesa.estado = PdvMesaEstado.OCUPADO;
            await mesaRepo.save(mesa);
          }
        }
        return saved;
      });

      // El lock por mesa evita dos ventas ABIERTAS sobre la misma mesa cuando dos
      // dispositivos la abren a la vez (mismo criterio que pedidos online).
      return ocupaMesa ? await withMesaLock(Number(mesaId), crear) : await crear();
    } catch (error) {
      console.error('Error creating venta:', error);
      throw error;
    }
  });

  ipcMain.handle('getVentasByDateRange', async (_event: any, desde: string, hasta: string, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(Venta);
      const qb = repo.createQueryBuilder('venta')
        .leftJoinAndSelect('venta.caja', 'caja')
        .leftJoinAndSelect('caja.dispositivo', 'dispositivo')
        .leftJoinAndSelect('caja.createdBy', 'cajaCreatedBy')
        .leftJoinAndSelect('cajaCreatedBy.persona', 'cajaCreatedByPersona')
        .leftJoinAndSelect('venta.formaPago', 'formaPago')
        .leftJoinAndSelect('venta.pago', 'pago')
        .leftJoinAndSelect('venta.mesa', 'mesa')
        .leftJoinAndSelect('venta.cliente', 'cliente')
        .leftJoinAndSelect('cliente.persona', 'persona')
        .leftJoinAndSelect('venta.createdBy', 'createdBy')
        .leftJoinAndSelect('createdBy.persona', 'createdByPersona')
        .leftJoinAndSelect('venta.items', 'items');

      // Date range filter (skip if cajaId is provided — caja has its own date range)
      if (!filtros?.cajaId) {
        qb.where('venta.createdAt >= :desde', { desde })
          .andWhere('venta.createdAt <= :hasta', { hasta });
      } else {
        qb.where('caja.id = :cajaId', { cajaId: filtros.cajaId });
      }

      // Estado
      if (filtros?.estado) {
        qb.andWhere('venta.estado = :estado', { estado: filtros.estado });
      }

      // Mesa
      if (filtros?.mesaId) {
        qb.andWhere('mesa.id = :mesaId', { mesaId: filtros.mesaId });
      }

      // Formas de pago (multi-select) — subquery en pago_detalles
      if (filtros?.formasPagoIds?.length > 0) {
        qb.andWhere(qb2 => {
          const subQuery = qb2.subQuery()
            .select('pd_fp.pago_id')
            .from('pagos_detalles', 'pd_fp')
            .where('pd_fp.forma_pago_id IN (:...formasPagoIds)')
            .andWhere('pd_fp.activo')
            .getQuery();
          return 'pago.id IN ' + subQuery;
        }).setParameter('formasPagoIds', filtros.formasPagoIds);
      }

      // Monedas (multi-select) — subquery en pago_detalles
      if (filtros?.monedaIds?.length > 0) {
        qb.andWhere(qb2 => {
          const subQuery = qb2.subQuery()
            .select('pd_m.pago_id')
            .from('pagos_detalles', 'pd_m')
            .where('pd_m.moneda_id IN (:...monedaIds)')
            .andWhere('pd_m.activo')
            .getQuery();
          return 'pago.id IN ' + subQuery;
        }).setParameter('monedaIds', filtros.monedaIds);
      }

      // Rango de valores por moneda
      if (filtros?.monedaValorId && (filtros?.valorMin != null || filtros?.valorMax != null)) {
        qb.andWhere(qb2 => {
          let subQuery = qb2.subQuery()
            .select('pd_v.pago_id')
            .from('pagos_detalles', 'pd_v')
            .where('pd_v.moneda_id = :monedaValorId')
            .andWhere('pd_v.tipo = :tipoPago')
            .andWhere('pd_v.activo')
            .groupBy('pd_v.pago_id');
          if (filtros.valorMin != null) {
            subQuery = subQuery.having('SUM(pd_v.valor) >= :valorMin');
          }
          if (filtros.valorMax != null) {
            subQuery = subQuery.andHaving('SUM(pd_v.valor) <= :valorMax');
          }
          return 'pago.id IN ' + subQuery.getQuery();
        })
        .setParameter('monedaValorId', filtros.monedaValorId)
        .setParameter('tipoPago', 'PAGO');
        if (filtros.valorMin != null) qb.setParameter('valorMin', filtros.valorMin);
        if (filtros.valorMax != null) qb.setParameter('valorMax', filtros.valorMax);
      }

      // Descuento/Aumento
      if (filtros?.tieneDescuento === 'CON_DESCUENTO') {
        qb.andWhere('(venta.descuento_monto > 0 OR EXISTS (SELECT 1 FROM venta_items vi_d WHERE vi_d.venta_id = venta.id AND vi_d.descuento_unitario > 0))');
      } else if (filtros?.tieneDescuento === 'CON_AUMENTO') {
        qb.andWhere(qb2 => {
          const subQuery = qb2.subQuery()
            .select('pd_a.pago_id')
            .from('pagos_detalles', 'pd_a')
            .where('pd_a.tipo = :tipoAumento')
            .andWhere('pd_a.activo')
            .getQuery();
          return 'pago.id IN ' + subQuery;
        }).setParameter('tipoAumento', 'AUMENTO');
      } else if (filtros?.tieneDescuento === 'SIN_DESCUENTO') {
        qb.andWhere('(venta.descuento_monto IS NULL OR venta.descuento_monto = 0)')
          .andWhere('NOT EXISTS (SELECT 1 FROM venta_items vi_nd WHERE vi_nd.venta_id = venta.id AND vi_nd.descuento_unitario > 0)');
      }

      // Mozo (usuario que creó al menos un item)
      if (filtros?.mozoId) {
        qb.andWhere('EXISTS (SELECT 1 FROM venta_items vi_m WHERE vi_m.venta_id = venta.id AND vi_m.created_by = :mozoId)')
          .setParameter('mozoId', filtros.mozoId);
      }

      // F5 paso 4: filtro por dispositivo de origen (multi-PC en LAN).
      if (filtros?.dispositivoId) {
        qb.andWhere('venta.dispositivo_id = :ventaDispositivoId', { ventaDispositivoId: filtros.dispositivoId });
      }

      qb.orderBy('venta.createdAt', 'DESC');

      // Paginación
      const page = filtros?.page || 1;
      const pageSize = filtros?.pageSize || 25;
      qb.skip((page - 1) * pageSize).take(pageSize);

      const [data, total] = await qb.getManyAndCount();
      return { data, total };
    } catch (error) {
      console.error('Error getting ventas by date range:', error);
      throw error;
    }
  });

  ipcMain.handle('getVentasByCaja', async (_event: any, cajaId: number) => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.find({
        where: { caja: { id: cajaId } },
        relations: ['caja', 'formaPago', 'pago', 'items'],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error(`Error getting ventas for caja ${cajaId}:`, error);
      throw error;
    }
  });

  // Resumen completo de una caja (para diálogo de resumen)
  ipcMain.handle('getResumenCaja', async (_event: any, cajaId: number) => {
    try {
      return await computeResumenCaja(dataSource, cajaId);
    } catch (error) {
      console.error(`Error getting resumen caja ${cajaId}:`, error);
      throw error;
    }
  });

  // Total ventas de una caja en moneda principal (liviano, para la lista)
  ipcMain.handle('getVentasTotalByCaja', async (_event: any, cajaId: number) => {
    try {
      const result = await dbQuery(dataSource, `
        SELECT
          COUNT(DISTINCT v.id) as "cantidadVentas",
          COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as "totalVentas",
          pd.moneda_id as "monedaId"
        FROM ventas v
        LEFT JOIN pagos p ON v.pago_id = p.id
        LEFT JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.activo
        WHERE v.caja_id = ? AND v.estado = 'CONCLUIDA'
        GROUP BY pd.moneda_id
      `, [cajaId]);
      return result;
    } catch (error) {
      console.error(`Error getting ventas total for caja ${cajaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('updateVenta', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Venta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta ID ${id} not found`);

      // Control opcional de impresión del ticket para esta transición puntual.
      // Si viene definido (true/false), tiene prioridad sobre el config global
      // `autoImprimirTicketVenta`. Se extrae antes del merge para que no intente
      // persistirse como columna de la entidad.
      let imprimirTicketOverride: boolean | undefined;
      if (data && Object.prototype.hasOwnProperty.call(data, '__imprimirTicketVenta')) {
        imprimirTicketOverride = data.__imprimirTicketVenta === true;
        delete data.__imprimirTicketVenta;
      }

      // Gate de terminal ajena para la FINALIZACION de la venta. Igual que
      // `__imprimirTicketVenta`, se extrae antes del merge para que no intente
      // persistirse como columna.
      //
      // Se activa sólo con el flag explícito, y no derivando la caja siempre,
      // porque `updateVenta` es genérico: lo usan pedidos online, delivery, la
      // cancelación desde el historial y varios flujos server-side que no son
      // "el cajero cobrando". Sólo el cobro del PdV lo manda.
      let validarDispositivoCaja = false;
      if (data && Object.prototype.hasOwnProperty.call(data, '__validarDispositivoCaja')) {
        validarDispositivoCaja = data.__validarDispositivoCaja === true;
        delete data.__validarDispositivoCaja;
      }

      const estadoAnterior = entity.estado;

      // `findOneBy` no trae las relaciones `mesa` ni `caja`: se leen las FK
      // crudas ANTES del merge, para poder resincronizar el cache de esa mesa si
      // la venta cierra y para resolver el gate por dispositivo.
      const filaVenta: any = (
        await dataSource.query(`SELECT mesa_id AS m, caja_id AS c FROM ventas WHERE id = $1`.replace('$1', String(Number(id))))
      )?.[0] ?? null;
      const mesaDeLaVenta: number | null = filaVenta?.m ?? null;

      // Sólo la transición ABIERTA → CONCLUIDA es "finalizar un cobro".
      // `rehabilitarVenta()` (CANCELADA → CONCLUIDA, desde el historial) queda
      // deliberadamente fuera: no es un cobro en el PdV.
      if (
        validarDispositivoCaja
        && data?.estado === VentaEstado.CONCLUIDA
        && estadoAnterior === VentaEstado.ABIERTA
      ) {
        await assertTerminalPuedeOperar(dataSource, _event, filaVenta?.c ?? null, 'FINALIZAR');
      }

      // A-01: al cancelar una venta a crédito hay que revertir la Cuenta Por
      // Cobrar y el saldoActual del cliente; antes quedaban vivos (cobros
      // fantasma). Pre-chequeo ANTES de guardar el estado para poder rechazar
      // limpiamente si la CPC ya tiene cobros.
      const willCancel =
        data?.estado === VentaEstado.CANCELADA && estadoAnterior !== VentaEstado.CANCELADA;
      let cpcToReverse: CuentaPorCobrar | null = null;
      if (willCancel) {
        cpcToReverse = await dataSource.getRepository(CuentaPorCobrar).findOne({
          where: { ventaId: id, estado: CuentaPorCobrarEstado.ACTIVO },
          relations: ['cliente'],
        });
        if (cpcToReverse && Number(cpcToReverse.montoCobrado) > 0) {
          throw new Error(
            'No se puede cancelar una venta a crédito con cobros registrados. Anule primero los cobros de la cuenta por cobrar.',
          );
        }
      }

      // La caja de una venta se fija al crearla y no cambia nunca. Aceptarla en
      // el merge permitía mover una venta CONCLUIDA —con todo su cobro— a otra
      // caja, sin gate y sin transición de estado: la palanca más directa para
      // descuadrar dos arqueos de una sola llamada. Ningún llamador la setea
      // (el PdV manda la venta entera, con su misma caja).
      //
      // `costoDelivery` va por el mismo camino y por el mismo motivo. Es el
      // monto CONGELADO del envío, y sus dos dueños —el cambio de zona y la
      // conversión entre delivery y retiro— exigen que la venta siga ABIERTA
      // justamente porque moverlo cambia lo que se cobra. Este merge no valida
      // nada: como `/api/rpc` es default-allow, dejarlo pasar convertía toda
      // esa guarda en una sugerencia, con una llamada capaz de reescribir el
      // envío de una venta ya CONCLUIDA. Ningún llamador lo setea a propósito
      // (el PdV manda la venta entera, con su mismo envío).
      const { caja: _cajaIgnorada, costoDelivery: _envioIgnorado, ...ventaData } = data ?? {};
      repo.merge(entity, ventaData);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      const saved = await repo.save(entity);

      // Cobrar o cancelar una venta de mesa CIERRA la cuenta propia de esa mesa,
      // asi que el cache `pdv_mesas.estado` tiene que seguirla. Es el evento mas
      // frecuente de todos y no lo estaba haciendo: la grilla se veia bien porque
      // deriva, pero cualquier lector de la columna cruda (p.ej. el servicio de
      // musica ambiental, que decide el tempo por mesas ocupadas) sobre-contaba
      // para siempre. El desktop lo compensaba con una segunda llamada manual
      // desde el frontend; eso no cubre `cobrar-venta-credito` ni a ningun otro
      // consumidor del handler.
      const cerroLaCuenta =
        (data?.estado === VentaEstado.CONCLUIDA || data?.estado === VentaEstado.CANCELADA)
        && estadoAnterior === VentaEstado.ABIERTA;
      if (cerroLaCuenta) {
        await sincronizarEstadoMesa(mesaDeLaVenta);
      }

      // A-01: revertir la CPC (sin cobros, garantizado por el pre-chequeo) y el
      // saldo del cliente en una transacción atómica.
      if (willCancel && cpcToReverse) {
        const cu = getCurrentUser();
        const cpcId = cpcToReverse.id;
        const montoOriginal = Number(cpcToReverse.montoTotal);
        const clienteId = cpcToReverse.cliente?.id;
        await dataSource.transaction(async (m) => {
          const cpc = await m.getRepository(CuentaPorCobrar).findOne({ where: { id: cpcId } });
          if (!cpc || cpc.estado !== CuentaPorCobrarEstado.ACTIVO) return; // ya revertida
          cpc.estado = CuentaPorCobrarEstado.CANCELADO;
          cpc.fechaCancelacion = new Date();
          cpc.motivoCancelacion = 'CANCELACION DE VENTA';
          await setEntityUserTracking(dataSource, cpc, cu?.id, true);
          await m.save(CuentaPorCobrar, cpc);

          if (clienteId) {
            const cliente = await m.getRepository(Cliente).findOne({ where: { id: clienteId } });
            if (cliente) {
              cliente.saldoActual = +(Number(cliente.saldoActual) - montoOriginal).toFixed(2);
              await m.save(Cliente, cliente);
            }
            const mov = m.getRepository(MovimientoCliente).create({
              cliente: { id: clienteId } as any,
              tipo: MovimientoClienteTipo.AJUSTE_NEGATIVO,
              monto: montoOriginal,
              fecha: new Date(),
              cuentaPorCobrarId: cpcId,
              ventaId: id,
              observacion: `CANCELACION VENTA #${id} - REVERSION CPC #${cpcId}`,
              registradoPor: cu || undefined,
            });
            await setEntityUserTracking(dataSource, mov, cu?.id, false);
            await m.save(MovimientoCliente, mov);
          }
        });
      }

      // ─── Hook E2.3: auto-imprimir ticket cuando la venta pasa a CONCLUIDA
      // Fire-and-forget. NUNCA bloquea ni revierte la transición de estado.
      if (estadoAnterior !== VentaEstado.CONCLUIDA && saved.estado === VentaEstado.CONCLUIDA) {
        try {
          let debeImprimir: boolean;
          if (imprimirTicketOverride !== undefined) {
            // El llamador (finalizar / finalizar + ticket) decide explícitamente.
            debeImprimir = imprimirTicketOverride;
          } else {
            const pdvConfig = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
            debeImprimir = !!pdvConfig?.autoImprimirTicketVenta;
          }
          if (debeImprimir) {
            setImmediate(() => {
              printVentaTicketInternal(dataSource, id)
                .catch(e => console.warn('[updateVenta] auto-print ticket falló:', e));
            });
          }
        } catch (e) {
          console.warn('[updateVenta] hook auto-imprimir ticket falló:', e);
        }
      }

      // ─── KDS: al cerrar/cancelar la venta, sacar sus items de las pantallas ─
      try {
        if (estadoAnterior !== saved.estado) {
          if (saved.estado === VentaEstado.CONCLUIDA) {
            await finalizarComandaItems(dataSource, { ventaItem: { venta: { id } } as any, activo: true }, ComandaItemEstado.ENTREGADO, getCurrentUser()?.id);
          } else if (saved.estado === VentaEstado.CANCELADA) {
            await finalizarComandaItems(dataSource, { ventaItem: { venta: { id } } as any, activo: true }, ComandaItemEstado.CANCELADO, getCurrentUser()?.id);
          }
        }
      } catch (e) {
        console.warn('[updateVenta] hook KDS cerrar comanda-items falló:', e);
      }

      return saved;
    } catch (error) {
      console.error(`Error updating venta ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteVenta', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Venta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta ID ${id} not found`);
      
      // Check if there are venta items before deleting
      const ventaItemRepo = dataSource.getRepository(VentaItem);
      const itemsCount = await ventaItemRepo.count({ 
        where: { venta: { id } }
      });
      
      if (itemsCount > 0) {
        throw new Error(`No se puede eliminar la venta porque tiene ${itemsCount} items asociados. Elimine primero los items.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting venta ID ${id}:`, error);
      throw error;
    }
  });

  // --- VentaItem Handlers ---
  ipcMain.handle('getVentaItems', async (_event: any, ventaId: number) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      return await repo.find({
        where: { venta: { id: ventaId } },
        relations: [
          'producto', 
          'presentacion', 
          'precioVentaPresentacion',
          'precioVentaPresentacion.moneda',
          'canceladoPor',
          'modificadoPor',
          'nuevaVersionVentaItem',
          'createdBy',
          'createdBy.persona'
        ],
        order: { createdAt: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting venta items for venta ID ${ventaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getVentaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      return await repo.findOne({
        where: { id },
        relations: [
          'venta',
          'producto', 
          'presentacion', 
          'precioVentaPresentacion',
          'precioVentaPresentacion.moneda',
          'canceladoPor',
          'modificadoPor',
          'nuevaVersionVentaItem',
          'createdBy', 
          'createdBy.persona'
        ]
      });
    } catch (error) {
      console.error(`Error getting venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVentaItem', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      await validarVariacionDelItem(dataSource, data);
      const repo = dataSource.getRepository(VentaItem);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const saved = await repo.save(entity);

      // ─── Hook auto-imprimir ticket de cocina ────────────────────────────
      // Si la venta tiene mesa o comanda y `pdv_config.autoImprimirComanda=true`,
      // dispara `printComandaInternal` en background. NO bloquea la creación
      // del item. La unidad de impresión es el VentaItem (no ComandaItem).
      try {
        const savedAny = saved as any;
        const ventaId = savedAny.venta?.id ?? savedAny.venta_id ?? savedAny.ventaId;
        if (ventaId) {
          await autoPrintComandaIfNeeded(dataSource, ventaId);
        }
      } catch (e) {
        // Hook NUNCA bloquea la creación del item. Solo log.
        console.warn('[createVentaItem] hook auto-imprimir comanda falló:', e);
      }

      // ─── Hook KDS: crear ComandaItems (uno por sector) para el item ─────
      // Independiente de la impresión física: el KDS funciona aunque
      // autoImprimirComanda esté en false. Nunca bloquea la creación.
      try {
        await crearComandaItemsSiCorresponde(dataSource, (saved as any).id);
      } catch (e) {
        console.warn('[createVentaItem] hook KDS comanda-items falló:', e);
      }

      return saved;
    } catch (error) {
      console.error('Error creating venta item:', error);
      throw error;
    }
  });

  // Puente MESA_QR: materializa un PedidoOnline en la Venta de su mesa. La lógica
  // vive en la función module-level `materializarPedidoOnlineEnVenta` (reutilizable
  // desde el flujo público). Ver domains/pedidos-online.md (MESA_QR, F2).
  ipcMain.handle('materializar-pedido-online-en-venta', async (_event: any, pedidoId: number, opts?: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    return materializarPedidoOnlineEnVenta(dataSource, pedidoId, opts, getCurrentUser()?.id);
  });

  ipcMain.handle('updateVentaItem', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(VentaItem);
      // Con las relaciones que necesita la validación: sin ellas no se puede
      // saber si el ítem YA tenía su variación elegida.
      const entity = await repo.findOne({
        where: { id },
        relations: ['producto', 'recetaPresentacion'],
      });
      if (!entity) throw new Error(`Venta Item ID ${id} not found`);
      // El update puede cambiar el producto: si el nuevo exige variación, hay
      // que exigirla igual que en el alta. Se pasa el ítem existente aparte
      // para que el chequeo mire el resultado final, no sólo lo que vino.
      await validarVariacionDelItem(dataSource, data, entity);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      const saved = await repo.save(entity);

      // KDS: si el item se canceló, cancelar sus ComandaItems para sacarlos de cocina.
      try {
        if ((saved as any).estado === EstadoVentaItem.CANCELADO) {
          await finalizarComandaItems(dataSource, { ventaItem: { id } as any, activo: true }, ComandaItemEstado.CANCELADO, getCurrentUser()?.id);
        }
      } catch (e) { console.warn('[updateVentaItem] KDS cancelar comanda-items falló:', e); }

      return saved;
    } catch (error) {
      console.error(`Error updating venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItem', async (_event: any, id: number) => {
    // return a boolean if success or not
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(VentaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta Item ID ${id} not found`);
      // KDS: borrar ComandaItems del item antes para no dejar FK huérfana.
      try {
        await dataSource.getRepository(ComandaItem)
          .createQueryBuilder()
          .delete()
          .where('venta_item_id = :id', { id })
          .execute();
      } catch (e) { console.warn('[deleteVentaItem] KDS limpiar comanda-items falló:', e); }
      await repo.remove(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting venta item ID ${id}:`, error);
      return false;
    }
  });

  // --- VentaItemObservacion Handlers ---
  // Sólo las activas: `activo = false` es una observación dada de baja y no debe
  // reaparecer al re-personalizar el ítem (la comanda y el KDS ya filtran así).
  ipcMain.handle('getObservacionesByVentaItem', async (_event: any, ventaItemId: number) => {
    try {
      const repo = dataSource.getRepository(VentaItemObservacion);
      return await repo.find({
        where: { ventaItem: { id: ventaItemId }, activo: true },
        // `ventaItemSabor` viaja para poder distinguir las observaciones de una
        // mitad concreta (pizza) de las del ítem entero.
        relations: ['observacion', 'ventaItemSabor'],
      });
    } catch (error) {
      console.error(`Error getting observaciones for venta item ${ventaItemId}:`, error);
      throw error;
    }
  });

  /**
   * Crea una `VentaItemObservacion`. Dos usos:
   *
   * 1. Observación del catálogo → mandar `observacion: { id }`.
   * 2. **Nota libre** → mandar `observacionLibre` y **omitir** `observacion`: acá
   *    se resuelve el sentinel `NOTA DEL CLIENTE`, porque la FK es NOT NULL.
   *    Antes cada caller improvisaba: colgar la nota de la primera observación
   *    seleccionada (la duplicaba en pantalla y en la comanda) o mandar
   *    `observacion: null` (rompía el NOT NULL y la nota se perdía callada).
   */
  ipcMain.handle('createVentaItemObservacion', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(VentaItemObservacion);
      const payload: any = { ...(data || {}) };
      const nota = typeof payload.observacionLibre === 'string' ? payload.observacionLibre.trim() : '';
      // Excluyentes: una fila es o una observación del catálogo, o la nota libre.
      // Mandar las dos juntas es justamente el bug viejo — al renderizar gana la
      // nota y la observación elegida queda tapada.
      if (payload.observacion?.id && nota) {
        throw new Error('venta_item_observacion_no_combina_observacion_y_nota');
      }
      if (!payload.observacion?.id) {
        if (!nota) throw new Error('venta_item_observacion_sin_observacion_ni_nota');
        payload.observacion = { id: await ensureObservacionNotaLibreId(dataSource) };
      }
      payload.observacionLibre = nota ? nota.toUpperCase().slice(0, 500) : null;
      const entity = repo.create(payload);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating venta item observacion:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItemObservacion', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(VentaItemObservacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`VentaItemObservacion ID ${id} not found`);
      await repo.remove(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting venta item observacion ${id}:`, error);
      return false;
    }
  });

  // --- VentaItemAdicional Handlers ---
  // Devuelve SOLO los adicionales activos: `activo = false` es un extra dado de
  // baja y no debe reaparecer al re-personalizar el ítem ni en el ticket/comanda
  // (esos ya filtran por su lado).
  ipcMain.handle('getVentaItemAdicionales', async (_event: any, ventaItemId: number) => {
    try {
      const repo = dataSource.getRepository(VentaItemAdicional);
      return await repo.find({
        where: { ventaItem: { id: ventaItemId }, activo: true },
        relations: ['adicional'],
      });
    } catch (error) {
      console.error(`Error getting adicionales for venta item ${ventaItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVentaItemAdicional', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(VentaItemAdicional);
      const entity = repo.create(data);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating venta item adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItemAdicional', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(VentaItemAdicional);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`VentaItemAdicional ID ${id} not found`);
      await repo.remove(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting venta item adicional ${id}:`, error);
      return false;
    }
  });

  // --- VentaItemIngredienteModificacion Handlers ---
  ipcMain.handle('getVentaItemIngredienteModificaciones', async (_event: any, ventaItemId: number) => {
    try {
      const repo = dataSource.getRepository(VentaItemIngredienteModificacion);
      return await repo.find({
        where: { ventaItem: { id: ventaItemId } },
        relations: ['recetaIngrediente', 'recetaIngrediente.ingrediente', 'ingredienteReemplazo'],
      });
    } catch (error) {
      console.error(`Error getting ingrediente modificaciones for venta item ${ventaItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVentaItemIngredienteModificacion', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(VentaItemIngredienteModificacion);
      const entity = repo.create(data);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating venta item ingrediente modificacion:', error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItemIngredienteModificacion', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(VentaItemIngredienteModificacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`VentaItemIngredienteModificacion ID ${id} not found`);
      await repo.remove(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting venta item ingrediente modificacion ${id}:`, error);
      return false;
    }
  });

  // --- PdvGrupoCategoria Handlers ---
  ipcMain.handle('getPdvGrupoCategorias', async () => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      return await repo.find({
        relations: ['categorias'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Grupo Categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvGrupoCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      return await repo.findOne({
        where: { id },
        relations: ['categorias']
      });
    } catch (error) {
      console.error(`Error getting PDV Grupo Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvGrupoCategoria', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Grupo Categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvGrupoCategoria', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Grupo Categoria ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Grupo Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvGrupoCategoria', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Grupo Categoria ID ${id} not found`);
      
      // Check dependencies before deleting
      const categoriaRepo = dataSource.getRepository(PdvCategoria);
      const categoriasCount = await categoriaRepo.count({ 
        where: { grupoCategoria: { id } }
      });
      
      if (categoriasCount > 0) {
        throw new Error(`No se puede eliminar el grupo de categoría porque tiene ${categoriasCount} categorías asociadas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Grupo Categoria ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvCategoria Handlers ---
  ipcMain.handle('getPdvCategorias', async () => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      return await repo.find({
        relations: ['grupoCategoria', 'items'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoriasByGrupo', async (_event: any, grupoId: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      return await repo.find({
        where: { grupoCategoria: { id: grupoId } },
        relations: ['grupoCategoria', 'items'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting PDV Categorias for Grupo ID ${grupoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      return await repo.findOne({
        where: { id },
        relations: ['grupoCategoria', 'items']
      });
    } catch (error) {
      console.error(`Error getting PDV Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvCategoria', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvCategoria);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvCategoria', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvCategoria', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria ID ${id} not found`);
      
      // Check dependencies before deleting
      const itemRepo = dataSource.getRepository(PdvCategoriaItem);
      const itemsCount = await itemRepo.count({ 
        where: { categoria: { id } }
      });
      
      if (itemsCount > 0) {
        throw new Error(`No se puede eliminar la categoría porque tiene ${itemsCount} items asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Categoria ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvCategoriaItem Handlers ---
  ipcMain.handle('getPdvCategoriaItems', async () => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      return await repo.find({
        relations: ['categoria', 'productos', 'productos.producto'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Categoria Items:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoriaItemsByCategoria', async (_event: any, categoriaId: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      return await repo.find({
        where: { categoria: { id: categoriaId } },
        relations: ['categoria', 'productos', 'productos.producto', 'productos.producto.presentaciones', 'productos.producto.presentaciones.preciosVenta'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting PDV Categoria Items for Categoria ID ${categoriaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoriaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      return await repo.findOne({
        where: { id },
        relations: ['categoria', 'productos', 'productos.producto']
      });
    } catch (error) {
      console.error(`Error getting PDV Categoria Item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvCategoriaItem', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvCategoriaItem);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Categoria Item:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvCategoriaItem', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvCategoriaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria Item ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Categoria Item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvCategoriaItem', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvCategoriaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria Item ID ${id} not found`);
      
      // Check dependencies before deleting
      const itemProductoRepo = dataSource.getRepository(PdvItemProducto);
      const productosCount = await itemProductoRepo.count({ 
        where: { categoriaItem: { id } }
      });
      
      if (productosCount > 0) {
        throw new Error(`No se puede eliminar el item de categoría porque tiene ${productosCount} productos asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Categoria Item ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvItemProducto Handlers ---
  ipcMain.handle('getPdvItemProductos', async () => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      return await repo.find({
        relations: ['categoriaItem', 'producto'],
        order: { nombre_alternativo: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Item Productos:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvItemProductosByItem', async (_event: any, itemId: number) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      return await repo.find({
        where: { categoriaItem: { id: itemId } },
        relations: ['categoriaItem', 'producto'],
        order: { nombre_alternativo: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting PDV Item Productos for Item ID ${itemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvItemProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      return await repo.findOne({
        where: { id },
        relations: ['categoriaItem', 'producto']
      });
    } catch (error) {
      console.error(`Error getting PDV Item Producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvItemProducto', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvItemProducto);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Item Producto:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvItemProducto', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvItemProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Item Producto ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Item Producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvItemProducto', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvItemProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Item Producto ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Item Producto ID ${id}:`, error);
      throw error;
    }
  });

  // PDV Config handlers
  ipcMain.handle('getPdvConfig', async (_event: any) => {
    try {
      const repository = dataSource.getRepository(PdvConfig);
      
      let config = await repository.findOne({
        where: { id: Not(IsNull()) },
        relations: ['pdvGrupoCategoria']
      });
      
      // If no config exists, create a default one
      if (!config) {
        const newConfig = repository.create({
          cantidad_mesas: 0,
          activo: true,
          // Explícito y no por default de columna: en una base vieja la columna
          // conserva el `DEFAULT true` con que se creó (SQLite no soporta
          // ALTER COLUMN SET DEFAULT), así que una fila insertada sin el campo
          // nacería exigiendo dirección aunque la migración diga lo contrario.
          deliveryRequiereDireccion: false,
        } as DeepPartial<PdvConfig>);
        
        config = await repository.save(newConfig);
      }
      
      return config;
    } catch (error) {
      console.error('Error fetching PDV config:', error);
      throw error;
    }
  });

  ipcMain.handle('createPdvConfig', async (_event: any, data: Partial<PdvConfig>) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repository = dataSource.getRepository(PdvConfig);
      
      // Make sure there is only one active config
      const existingConfig = await repository.findOne({
        where: { id: Not(IsNull()) }
      });
      
      if (existingConfig) {
        throw new Error('Ya existe una configuración activa. Utilice updatePdvConfig en su lugar.');
      }
      
      // Ensure activo is set to true for new config
      const configData = { ...data, activo: true } as DeepPartial<PdvConfig>;
      const newConfig = repository.create(configData);
      return await repository.save(newConfig);
    } catch (error) {
      console.error('Error creating PDV config:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvConfig', async (_event: any, id: number, data: Partial<PdvConfig>) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repository = dataSource.getRepository(PdvConfig);
      
      // Find the config to update
      const config = await repository.findOne({
        where: { id }
      });
      
      if (!config) {
        throw new Error(`Config ID ${id} not found`);
      }
      
      // Apply updates
      repository.merge(config, data as DeepPartial<PdvConfig>);
      const guardado = await repository.save(config);
      // La hora de la jornada se cachea 60s en los dashboards: sin esto, el
      // usuario cambia el corte, vuelve al resumen y sigue viendo el anterior.
      invalidarCacheJornada();
      return guardado;
    } catch (error) {
      console.error(`Error updating PDV config ID ${id}:`, error);
      throw error;
    }
  });

  // --- Reserva Handlers ---
  ipcMain.handle('getReservas', async () => {
    try {
      const repo = dataSource.getRepository(Reserva);
      return await repo.find({
        relations: ['cliente', 'cliente.persona'],
        order: { fecha_hora_reserva: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting reservas:', error);
      throw error;
    }
  });

  ipcMain.handle('getReservasActivas', async () => {
    try {
      const repo = dataSource.getRepository(Reserva);
      return await repo.find({
        where: { activo: true },
        relations: ['cliente', 'cliente.persona'],
        order: { fecha_hora_reserva: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting reservas activas:', error);
      throw error;
    }
  });

  ipcMain.handle('getReserva', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Reserva);
      return await repo.findOne({
        where: { id },
        relations: ['cliente', 'cliente.persona']
      });
    } catch (error) {
      console.error(`Error getting reserva ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createReserva', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Reserva);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating reserva:', error);
      throw error;
    }
  });

  ipcMain.handle('updateReserva', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Reserva);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Reserva ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating reserva ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteReserva', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Reserva);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Reserva ID ${id} not found`);
      
      // Check for dependencies on PdvMesa
      const mesaRepo = dataSource.getRepository(PdvMesa);
      const mesasCount = await mesaRepo.count({
        where: { reserva: { id } }
      });
      
      if (mesasCount > 0) {
        throw new Error(`No se puede eliminar la reserva porque está asociada a ${mesasCount} mesas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting reserva ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvMesa Handlers ---
  // Helper: query mesas with only the ABIERTA venta joined + comandas OCUPADO vinculadas
  /**
   * Estampa el estado DERIVADO sobre las mesas que devuelve una consulta.
   *
   * `mesa.venta` viene del join que ya filtra `comanda_id IS NULL`, o sea que es
   * exactamente la cuenta propia de la mesa. La columna `pdv_mesas.estado` es
   * solo un cache: si difiere, gana lo derivado. Asi el plano nunca muestra una
   * mesa colgada aunque la columna haya quedado mal por un camino viejo.
   */
  const derivarEstadoMesas = (mesas: any[]): any[] => {
    for (const mesa of mesas || []) {
      mesa.estado = mesa?.venta ? PdvMesaEstado.OCUPADO : PdvMesaEstado.DISPONIBLE;
    }
    return mesas;
  };

  const queryMesasWithVentaAbierta = (repo: any) => {
    return repo.createQueryBuilder('mesa')
      .leftJoinAndSelect('mesa.reserva', 'reserva')
      .leftJoinAndSelect('mesa.sector', 'sector')
      .leftJoinAndMapOne('mesa.venta', Venta, 'venta', 'venta.mesa_id = mesa.id AND venta.estado = :ventaEstado AND venta.comanda_id IS NULL', { ventaEstado: VentaEstado.ABIERTA })
      // Cargar el cliente de la venta (+ persona) para que el auto-refresh de mesas
      // no pierda el cliente asignado al volver a seleccionar la mesa.
      .leftJoinAndSelect('venta.cliente', 'ventaCliente')
      .leftJoinAndSelect('ventaCliente.persona', 'ventaClientePersona')
      .leftJoinAndSelect('mesa.comandas', 'comanda', 'comanda.estado = :comandaEstado AND comanda.activo = :comandaActivo', { comandaEstado: ComandaEstado.OCUPADO, comandaActivo: true })
      .orderBy('mesa.numero', 'ASC');
  };

  ipcMain.handle('getPdvMesas', async () => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      return derivarEstadoMesas(await queryMesasWithVentaAbierta(repo).getMany());
    } catch (error) {
      console.error('Error getting PDV Mesas:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvMesasActivas', async () => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      return derivarEstadoMesas(await queryMesasWithVentaAbierta(repo)
        .where('mesa.activo = :activo', { activo: true })
        .getMany());
    } catch (error) {
      console.error('Error getting PDV Mesas activas:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvMesasDisponibles', async () => {
    try {
      // "Disponible" = sin cuenta propia. Se filtra por la venta del join, no por
      // la columna cache `mesa.estado`, que puede venir desincronizada.
      const repo = dataSource.getRepository(PdvMesa);
      const mesas = derivarEstadoMesas(await queryMesasWithVentaAbierta(repo)
        .where('mesa.activo = :activo AND mesa.reservado = :reservado', { activo: true, reservado: false })
        .getMany());
      return mesas.filter((m: any) => m.estado === PdvMesaEstado.DISPONIBLE);
    } catch (error) {
      console.error('Error getting PDV Mesas disponibles:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvMesasBySector', async (_event: any, sectorId: number) => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      return derivarEstadoMesas(await queryMesasWithVentaAbierta(repo)
        .where('mesa.sector_id = :sectorId', { sectorId })
        .getMany());
    } catch (error) {
      console.error(`Error getting PDV Mesas for Sector ID ${sectorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvMesa', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvMesa);
      const mesa = await repo.findOne({
        where: { id },
        relations: ['reserva', 'reserva.cliente', 'reserva.cliente.persona', 'sector']
      });
      if (!mesa) return null;
      // Solo la venta ABIERTA cuenta como cuenta activa de la mesa. La relación
      // OneToOne `mesa.venta` no filtra por estado y puede devolver una venta
      // CANCELADA/CONCLUIDA que conserva `mesa_id` (al cancelar no se desvincula),
      // lo que hacía que el detalle en mobile siguiera mostrando ítems cancelados.
      //
      // `comanda: IsNull()` es la cuenta DE LA MESA: una venta que cuelga de una
      // comanda vinculada a esta mesa es la cuenta de esa tarjeta, no de la mesa.
      // Sin el filtro, el detalle en mobile mostraba la cuenta de una comanda —
      // mismo criterio que ya usaban `queryMesasWithVentaAbierta` y
      // `set-pdv-mesa-estado`.
      const ventaRepo = dataSource.getRepository(Venta);
      const ventaAbierta = await ventaRepo.findOne({
        where: { mesa: { id }, estado: VentaEstado.ABIERTA, comanda: IsNull() },
        order: { id: 'DESC' },
      });
      (mesa as any).venta = ventaAbierta || null;
      // Mismo criterio derivado que la grilla: la columna es solo cache.
      (mesa as any).estado = ventaAbierta ? PdvMesaEstado.OCUPADO : PdvMesaEstado.DISPONIBLE;
      return mesa;
    } catch (error) {
      console.error(`Error getting PDV Mesa ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvMesa', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvMesa);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Mesa:', error);
      throw error;
    }
  });

  ipcMain.handle('createBatchPdvMesas', async (_event: any, batchData: any[]) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvMesa);
      const savedEntities: any[] = [];
      for (const data of batchData) {
        const entity = repo.create(data as any);
        await setEntityUserTracking(dataSource, entity as any, getCurrentUser()?.id, false);
        const saved = await repo.save(entity as any);
        savedEntities.push(saved);
      }
      return savedEntities;
    } catch (error) {
      console.error('Error creating batch PDV Mesas:', error);
      throw error;
    }
  });

  /**
   * Cambia SOLO el estado de una mesa (ocupar / liberar).
   *
   * Existe aparte de `updatePdvMesa` por una razon de permisos: `updatePdvMesa` es
   * el ABM real de mesas (renombrar, cambiar de sector) y exige
   * VENTAS_PDV_CONFIGURAR, que solo tiene GERENTE. Pero ocupar y liberar mesas es
   * la operacion mas cotidiana de un mozo. Usar el mismo handler para las dos
   * cosas hacia que a un mozo o cajero le fallara siempre — en silencio, porque el
   * frontend se tragaba el error — y la mesa quedaba con el estado equivocado.
   *
   * Este handler no puede tocar nada estructural: solo `estado`.
   */
  ipcMain.handle('set-pdv-mesa-estado', async (_event: any, mesaId: number, estado: string) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      if (estado !== PdvMesaEstado.OCUPADO && estado !== PdvMesaEstado.DISPONIBLE) {
        throw new Error(`Estado de mesa invalido: ${estado}`);
      }
      const mesaRepo = dataSource.getRepository(PdvMesa);
      const mesa = await mesaRepo.findOneBy({ id: mesaId });
      if (!mesa) throw new Error(`Mesa ${mesaId} no encontrada`);
      if (mesa.estado === estado) return mesa;

      if (estado === PdvMesaEstado.DISPONIBLE) {
        // Solo la CUENTA PROPIA de la mesa impide liberarla. Las comandas ya no
        // cuentan: una mesa sin cuenta propia con comandas encima queda
        // DISPONIBLE (verde) y el badge avisa que hay comandas sentadas ahi.
        //
        // Antes esto contaba tambien las comandas, y por eso cobrar la cuenta de
        // una mesa con una comanda encima tiraba error: la excepcion salia del
        // bloque del cobro y la limpieza de la pantalla nunca corria.
        const ventasVivas = await dataSource.getRepository(Venta).count({
          where: { mesa: { id: mesaId }, estado: VentaEstado.ABIERTA, comanda: IsNull() },
        });
        if (ventasVivas > 0) {
          throw new Error(
            `La mesa ${mesa.numero} todavia tiene ${ventasVivas} venta(s) abierta(s) propia(s).`,
          );
        }
      }

      mesa.estado = estado as PdvMesaEstado;
      await setEntityUserTracking(dataSource, mesa, getCurrentUser()?.id, true);
      return await mesaRepo.save(mesa);
    } catch (error) {
      console.error(`Error cambiando estado de la mesa ${mesaId}:`, error);
      throw error;
    }
  });

  // ─── Transferencia de cuentas entre mesas y comandas ─────────────────────
  /**
   * Mueve una cuenta del salon — entera o solo algunos items — de un contenedor
   * a otro. Cubre las 4 combinaciones: mesa->mesa, mesa->comanda,
   * comanda->mesa y comanda->comanda.
   *
   * Antes esto vivia en el frontend como 5 a 8 llamadas IPC sueltas repartidas en
   * tres metodos del PdV (`transferirMesa`, `transferirComandaAMesa`,
   * `ejecutarMoverItems`). Si una fallaba a mitad de camino los items quedaban
   * movidos y la mesa origen ocupada, sin forma de saberlo. Aca es una sola
   * transaccion, con un unico `ensurePermission` y el lock por mesa que ya usan
   * `createVenta` y la materializacion de pedidos online.
   *
   * Reglas de dinero:
   * - Solo items: nunca se mueve un item con cobertura de cobro parcial. El
   *   cobro y el cliente se quedan en la cuenta origen.
   * - Completa a un contenedor SIN venta abierta: se re-apunta la venta entera,
   *   asi que cobros, pago y cliente viajan intactos con ella.
   * - Completa a un contenedor que YA tiene venta abierta: se fusionan los items
   *   en la venta destino. Si la cuenta origen tiene cobros parciales se rechaza:
   *   `Venta.pago` es un ManyToOne simple y las rondas de `CobroParcial` llevan un
   *   `factorAplicado` atado al descuento global de SU venta. Fusionarlas pisaba
   *   el pago del destino y dejaba plata cobrada huerfana.
   */
  type TransferenciaContenedor = { tipo: 'MESA' | 'COMANDA'; id: number };
  interface TransferenciaPayload {
    origen: TransferenciaContenedor;
    destino: TransferenciaContenedor;
    alcance: 'COMPLETA' | 'ITEMS';
    itemIds?: number[];
  }

  const buscarVentaAbiertaDe = async (
    manager: EntityManager,
    contenedor: TransferenciaContenedor,
  ): Promise<Venta | null> => {
    const where = contenedor.tipo === 'MESA'
      ? { mesa: { id: contenedor.id }, estado: VentaEstado.ABIERTA, comanda: IsNull() }
      : { comanda: { id: contenedor.id }, estado: VentaEstado.ABIERTA };
    return await manager.findOne(Venta, { where: where as any, relations: ['pago', 'mesa', 'comanda', 'caja', 'cliente'] });
  };

  const ocuparMesaEnTx = async (manager: EntityManager, mesaId: number): Promise<void> => {
    const mesa = await manager.findOneBy(PdvMesa, { id: mesaId });
    if (mesa && mesa.estado !== PdvMesaEstado.OCUPADO) {
      mesa.estado = PdvMesaEstado.OCUPADO;
      await manager.save(PdvMesa, mesa);
    }
  };

  /**
   * FUENTE UNICA de la ocupacion de una mesa:
   *
   *     ocupada  <=>  existe Venta ABIERTA con mesa_id = X y comanda_id IS NULL
   *
   * Las comandas quedan FUERA de la formula a proposito. El color de la mesa
   * responde una sola pregunta — "¿tiene cuenta propia?" — y la dimension "hay
   * comandas sentadas aca" la carga el badge. Colapsar las dos en un solo bit
   * destruye la distincion que necesita el cajero: "no hay nada que cobrarle a
   * la mesa" (verde + badge) vs "hay cuenta de mesa Y ademas comandas"
   * (naranja + badge).
   *
   * Antes esto era un flag manual que seis caminos distintos mantenian a mano y
   * un septimo ignoraba. Cada bug de "mesa colgada en OCUPADO" fue un camino que
   * se olvido de actualizarlo.
   */
  const mesaTieneCuentaPropia = async (manager: EntityManager, mesaId: number): Promise<boolean> => {
    const n = await manager.count(Venta, {
      where: { mesa: { id: mesaId }, estado: VentaEstado.ABIERTA, comanda: IsNull() },
    });
    return n > 0;
  };

  /**
   * Deja la columna cache `pdv_mesas.estado` igual al valor derivado. Se llama
   * despues de cualquier cambio que pueda haber abierto o cerrado la cuenta de
   * una mesa. Es idempotente y auto-reparadora: si la columna venia mal, la
   * corrige sola.
   */
  /**
   * Version sin transaccion, para los handlers que ya guardaron y solo necesitan
   * dejar el cache al dia. Nunca lanza: el cache desincronizado degrada, no
   * rompe (las consultas derivan igual), asi que no debe voltear la operacion
   * que la llamo.
   */
  const sincronizarEstadoMesa = async (mesaId: number | null | undefined): Promise<void> => {
    if (!mesaId) return;
    try {
      await sincronizarEstadoMesaEnTx(dataSource.manager, Number(mesaId));
    } catch (e) {
      console.warn(`[sincronizarEstadoMesa] no se pudo resincronizar la mesa ${mesaId}:`, e);
    }
  };

  const sincronizarEstadoMesaEnTx = async (manager: EntityManager, mesaId: number): Promise<PdvMesaEstado> => {
    const derivado = (await mesaTieneCuentaPropia(manager, mesaId))
      ? PdvMesaEstado.OCUPADO
      : PdvMesaEstado.DISPONIBLE;
    const mesa = await manager.findOneBy(PdvMesa, { id: mesaId });
    if (mesa && mesa.estado !== derivado) {
      mesa.estado = derivado;
      await manager.save(PdvMesa, mesa);
    }
    return derivado;
  };

  const cerrarComandaEnTx = async (manager: EntityManager, comandaId: number, userId?: number): Promise<void> => {
    const comanda = await manager.findOne(Comanda, { where: { id: comandaId }, relations: ['pdv_mesa'] });
    if (!comanda) return;
    const mesaId = comanda.pdv_mesa?.id ?? null;
    comanda.estado = ComandaEstado.DISPONIBLE;
    (comanda as any).pdv_mesa = null;
    (comanda as any).sector = null;
    (comanda as any).observacion = null;
    await setEntityUserTracking(dataSource, comanda, userId, true);
    await manager.save(Comanda, comanda);
    // Cerrar una comanda ya no cambia la ocupacion de su mesa — la comanda
    // nunca la ocupaba. Se resincroniza igual porque es barato y auto-repara una
    // columna que haya quedado mal por un camino viejo.
    if (mesaId) {
      await sincronizarEstadoMesaEnTx(manager, mesaId);
    }
  };

  const abrirComandaEnTx = async (
    manager: EntityManager,
    comanda: Comanda,
    mesaVinculada: PdvMesa | null,
    userId?: number,
  ): Promise<void> => {
    comanda.estado = ComandaEstado.OCUPADO;
    if (mesaVinculada) {
      comanda.pdv_mesa = mesaVinculada;
      (comanda as any).sector = (mesaVinculada as any).sector ?? null;
    }
    await setEntityUserTracking(dataSource, comanda, userId, true);
    await manager.save(Comanda, comanda);
    // No se ocupa la mesa: el vinculo comanda->mesa es de ubicacion, no de
    // ocupacion (ver `mesaTieneCuentaPropia`).
  };

  const transferirVentaPdvInternal = async (payload: TransferenciaPayload, userId?: number): Promise<any> => {
    const origen = payload?.origen;
    const destino = payload?.destino;
    const alcance = payload?.alcance;

    if (!origen?.tipo || !origen?.id) throw new Error('Origen de transferencia invalido.');
    if (!destino?.tipo || !destino?.id) throw new Error('Destino de transferencia invalido.');
    if (alcance !== 'COMPLETA' && alcance !== 'ITEMS') throw new Error('Alcance de transferencia invalido.');
    if (origen.tipo === destino.tipo && Number(origen.id) === Number(destino.id)) {
      throw new Error('El origen y el destino son el mismo.');
    }
    if (alcance === 'ITEMS' && (!Array.isArray(payload.itemIds) || payload.itemIds.length === 0)) {
      throw new Error('No se seleccionaron items para transferir.');
    }

    return await dataSource.transaction(async (manager) => {
      const ventaOrigen = await buscarVentaAbiertaDe(manager, origen);
      if (!ventaOrigen) throw new Error('La cuenta de origen no tiene una venta abierta.');

      // Mesa fisica del origen: es a la que se vincula una comanda destino nueva
      // (misma mesa, cuenta separada).
      let mesaOrigenFisica: PdvMesa | null = null;
      let comandaOrigen: Comanda | null = null;
      if (origen.tipo === 'MESA') {
        mesaOrigenFisica = await manager.findOne(PdvMesa, { where: { id: origen.id }, relations: ['sector'] });
        if (!mesaOrigenFisica) throw new Error(`Mesa de origen ${origen.id} no encontrada.`);
      } else {
        comandaOrigen = await manager.findOne(Comanda, { where: { id: origen.id }, relations: ['pdv_mesa'] });
        if (!comandaOrigen) throw new Error(`Comanda de origen ${origen.id} no encontrada.`);
        if (comandaOrigen.pdv_mesa?.id) {
          mesaOrigenFisica = await manager.findOne(PdvMesa, { where: { id: comandaOrigen.pdv_mesa.id }, relations: ['sector'] });
        }
      }

      let mesaDestino: PdvMesa | null = null;
      let comandaDestino: Comanda | null = null;
      if (destino.tipo === 'MESA') {
        mesaDestino = await manager.findOne(PdvMesa, { where: { id: destino.id }, relations: ['sector'] });
        if (!mesaDestino || !mesaDestino.activo) throw new Error(`Mesa de destino ${destino.id} no disponible.`);
      } else {
        comandaDestino = await manager.findOne(Comanda, { where: { id: destino.id }, relations: ['pdv_mesa'] });
        if (!comandaDestino || !comandaDestino.activo) throw new Error(`Comanda de destino ${destino.id} no disponible.`);
      }

      let ventaDestino = await buscarVentaAbiertaDe(manager, destino);
      if (ventaDestino && ventaDestino.id === ventaOrigen.id) {
        throw new Error('El origen y el destino son la misma cuenta.');
      }
      const destinoYaTeniaVenta = !!ventaDestino;

      // Items a mover.
      //
      // Lock pesimista en Postgres: `registrarCobroParcial` corre en su propia
      // transaccion y puede cubrir un item justo entre que aca lo leemos como
      // "sin cobro" y el save que lo re-apunta. El item terminaria en la cuenta
      // destino marcado como cubierto, con su `CobroParcialItem` atado a la venta
      // origen ya cancelada: plata adjudicada a una cuenta cerrada. En SQLite no
      // aplica (un solo escritor) y `pessimistic_write` no esta soportado.
      const esPostgres = dataSource.options.type === 'postgres';
      const itemsActivos = await manager.find(VentaItem, {
        where: { venta: { id: ventaOrigen.id }, estado: EstadoVentaItem.ACTIVO },
        ...(esPostgres ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      let itemsAMover: VentaItem[];
      if (alcance === 'COMPLETA') {
        itemsAMover = itemsActivos;
      } else {
        const pedidos = new Set((payload.itemIds || []).map((n) => Number(n)));
        itemsAMover = itemsActivos.filter((i) => pedidos.has(Number(i.id)));
        if (itemsAMover.length !== pedidos.size) {
          throw new Error('Alguno de los items seleccionados ya no esta activo en la cuenta de origen.');
        }
        const cobrados = itemsAMover.filter((i) => Number((i as any).montoCubierto || 0) > 0.5);
        if (cobrados.length > 0) {
          throw new Error(`No se pueden mover ${cobrados.length} item(s) que ya tienen cobro parcial.`);
        }
      }
      if (itemsAMover.length === 0) throw new Error('La cuenta de origen no tiene items activos para transferir.');

      const origenTieneCobros = !!ventaOrigen.pago?.id
        || (await manager.count(CobroParcial, { where: { venta: { id: ventaOrigen.id }, activo: true } })) > 0;

      // Una venta con cuenta por cobrar viva no se transfiere. El flujo normal
      // (`cobrar-venta-credito`) concluye la venta al crear la CPC, asi que no
      // deberia aparecer como origen — pero `create-cuenta-por-cobrar` permite
      // vincular una CPC a mano a una venta abierta, y por ahi la cancelacion de
      // esta transaccion se saltearia la reversion de saldo que hace `updateVenta`.
      const cpcViva = await manager.count(CuentaPorCobrar, {
        where: { ventaId: ventaOrigen.id, estado: CuentaPorCobrarEstado.ACTIVO } as any,
      });
      if (cpcViva > 0) {
        throw new Error(
          'La cuenta de origen tiene una cuenta por cobrar vinculada. '
          + 'Anula o cobra esa cuenta por cobrar antes de transferir.',
        );
      }

      // Re-apunte: la venta entera cambia de contenedor. Es el unico camino que
      // conserva cobros y pago sin tocarlos.
      const esReapunte = alcance === 'COMPLETA' && !destinoYaTeniaVenta;

      if (alcance === 'COMPLETA' && destinoYaTeniaVenta && origenTieneCobros) {
        throw new Error(
          'La cuenta de origen tiene cobros parciales y el destino ya tiene una cuenta abierta. '
          + 'Termina de cobrar o anula el cobro parcial antes de unir las dos cuentas.',
        );
      }

      // Abrir la comanda destino si estaba libre.
      //
      // Hereda la mesa del origen SOLO en una transferencia por ITEMS: eso es
      // dividir la cuenta en la misma mesa, la gente sigue sentada ahi. En una
      // transferencia COMPLETA la cuenta SE VA de la mesa, asi que vincularla
      // seria lo contrario de lo que se pidio — y dejaba la mesa ocupada, sin
      // cuenta propia y sin forma de atenderla ni liberarla.
      if (comandaDestino && comandaDestino.estado === ComandaEstado.DISPONIBLE) {
        const mesaHeredada = alcance === 'ITEMS' ? mesaOrigenFisica : null;
        await abrirComandaEnTx(manager, comandaDestino, mesaHeredada, userId);
      }

      let ventaDestinoId: number;
      let itemsMovidos = 0;

      if (esReapunte) {
        if (destino.tipo === 'MESA') {
          (ventaOrigen as any).mesa = mesaDestino;
          (ventaOrigen as any).comanda = null;
        } else {
          (ventaOrigen as any).comanda = comandaDestino;
          (ventaOrigen as any).mesa = comandaDestino!.pdv_mesa ?? null;
        }
        await setEntityUserTracking(dataSource, ventaOrigen as any, userId, true);
        await manager.save(Venta, ventaOrigen);
        ventaDestinoId = ventaOrigen.id;
        itemsMovidos = itemsAMover.length;
      } else {
        if (!ventaDestino) {
          const nueva: any = manager.create(Venta, {
            estado: VentaEstado.ABIERTA,
            caja: ventaOrigen.caja,
            ...(destino.tipo === 'MESA'
              ? { mesa: mesaDestino }
              : { comanda: comandaDestino, mesa: comandaDestino!.pdv_mesa ?? null }),
          });
          await setEntityUserTracking(dataSource, nueva, userId, false);
          ventaDestino = await manager.save(Venta, nueva);
        }
        ventaDestinoId = ventaDestino!.id;

        for (const item of itemsAMover) {
          (item as any).venta = { id: ventaDestinoId };
          await setEntityUserTracking(dataSource, item as any, userId, true);
        }
        await manager.save(VentaItem, itemsAMover);
        itemsMovidos = itemsAMover.length;

        // El nombre y el cliente solo viajan en una transferencia completa, y
        // solo si el destino no tiene los suyos.
        if (alcance === 'COMPLETA') {
          const cambios: any = {};
          if (ventaOrigen.nombreCliente && !ventaDestino!.nombreCliente) cambios.nombreCliente = ventaOrigen.nombreCliente;
          if ((ventaOrigen as any).cliente?.id && !(ventaDestino as any).cliente?.id) cambios.cliente = (ventaOrigen as any).cliente;
          if (Object.keys(cambios).length > 0) {
            Object.assign(ventaDestino as any, cambios);
            await setEntityUserTracking(dataSource, ventaDestino as any, userId, true);
            await manager.save(Venta, ventaDestino as any);
          }
        }
      }

      // Cierre de la cuenta origen: completa siempre, por items solo si quedo vacia.
      let origenCerrado = false;
      if (!esReapunte) {
        const quedanActivos = await manager.count(VentaItem, {
          where: { venta: { id: ventaOrigen.id }, estado: EstadoVentaItem.ACTIVO },
        });
        if (alcance === 'COMPLETA' || quedanActivos === 0) {
          (ventaOrigen as any).estado = VentaEstado.CANCELADA;
          await setEntityUserTracking(dataSource, ventaOrigen as any, userId, true);
          await manager.save(Venta, ventaOrigen);
          origenCerrado = true;
        }
      } else {
        origenCerrado = true;
      }

      let origenLiberado = false;
      if (origenCerrado) {
        if (origen.tipo === 'MESA') {
          origenLiberado = (await sincronizarEstadoMesaEnTx(manager, origen.id)) === PdvMesaEstado.DISPONIBLE;
        } else {
          await cerrarComandaEnTx(manager, origen.id, userId);
          origenLiberado = true;
        }
      }

      // Ocupar el destino: si es mesa, ahora tiene una venta abierta encima.
      if (destino.tipo === 'MESA') {
        await ocuparMesaEnTx(manager, destino.id);
      }

      return {
        ventaOrigenId: ventaOrigen.id,
        ventaDestinoId,
        itemsMovidos,
        origenCerrado,
        origenLiberado,
        reapunte: esReapunte,
      };
    });
  };

  ipcMain.handle('transferir-venta-pdv', async (_event: any, payload: TransferenciaPayload) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const userId = getCurrentUser()?.id;
      // Candados por contenedor. Van los DOS tipos: una transferencia entre dos
      // comandas no toca ninguna mesa, y sin candado dos cajeros podian dejar dos
      // ventas ABIERTA colgando de la misma comanda destino.
      //
      // El reduce anida de adentro hacia afuera, asi que cada lista va descendente
      // para que el candado MAS EXTERNO de cada tipo sea el del id menor: dos
      // transferencias cruzadas los toman en el mismo orden y no se abrazan. Y las
      // comandas se toman SIEMPRE despues de las mesas, para que el orden entre
      // tipos tambien sea unico.
      const idsDe = (tipo: 'MESA' | 'COMANDA'): number[] => Array.from(new Set([
        payload?.origen?.tipo === tipo ? Number(payload.origen.id) : null,
        payload?.destino?.tipo === tipo ? Number(payload.destino.id) : null,
      ].filter((n): n is number => typeof n === 'number' && !Number.isNaN(n)))).sort((a, b) => b - a);

      const ejecutar = () => transferirVentaPdvInternal(payload, userId);
      const conComandas = idsDe('COMANDA').reduce<() => Promise<any>>(
        (fn, comandaId) => () => withComandaLock(comandaId, fn),
        ejecutar,
      );
      return await idsDe('MESA').reduce<() => Promise<any>>(
        (fn, mesaId) => () => withMesaLock(mesaId, fn),
        conComandas,
      )();
    } catch (error) {
      console.error('Error transfiriendo cuenta del PdV:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvMesa', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvMesa);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Mesa ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Mesa ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvMesa', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvMesa);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Mesa ID ${id} not found`);
      
      // Check for dependencies on Comandas
      const comandaRepo = dataSource.getRepository(Comanda);
      const comandasCount = await comandaRepo.count({
        where: { pdv_mesa: { id } }
      });
      
      if (comandasCount > 0) {
        throw new Error(`No se puede eliminar la mesa porque está asociada a ${comandasCount} comandas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Mesa ID ${id}:`, error);
      throw error;
    }
  });

  // --- Comanda Handlers (tarjetas de cuenta individual) ---
  ipcMain.handle('getComandas', async () => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Comandas:', error);
      throw error;
    }
  });

  ipcMain.handle('getComandasActivas', async () => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        where: { activo: true },
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Comandas activas:', error);
      throw error;
    }
  });

  ipcMain.handle('getComandasByMesa', async (_event: any, mesaId: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        where: { pdv_mesa: { id: mesaId }, activo: true },
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting Comandas for Mesa ID ${mesaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getComanda', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.findOne({
        where: { id },
        relations: ['pdv_mesa', 'sector']
      });
    } catch (error) {
      console.error(`Error getting Comanda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createComanda', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Comanda);
      const entity: any = repo.create({ ...data, estado: ComandaEstado.DISPONIBLE });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      // F5 paso 3: propagar device_id del request context si no vino explicito.
      if (!data?.dispositivo && !data?.dispositivo_id) {
        const deviceId = resolveRequestDeviceId(_event);
        if (deviceId != null) entity.dispositivo = { id: deviceId };
      }
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating Comanda:', error);
      throw error;
    }
  });

  ipcMain.handle('updateComanda', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Comanda);
      // Con `pdv_mesa`: hace falta la mesa ANTERIOR para saber si realmente
      // cambia y arrastrar la venta.
      const entity = await repo.findOne({ where: { id }, relations: ['pdv_mesa'] });
      if (!entity) throw new Error(`Comanda ID ${id} not found`);

      // Si se cambia la mesa, sincronizar sector con el de la mesa
      const mesaAnterior = (entity as any).pdv_mesa?.id ?? null;
      const cambiaMesa = 'pdv_mesa' in data;
      if (cambiaMesa) {
        if (data.pdv_mesa?.id) {
          const mesaRepo = dataSource.getRepository(PdvMesa);
          const mesa = await mesaRepo.findOne({ where: { id: data.pdv_mesa.id }, relations: ['sector'] });
          if (mesa) {
            data.sector = mesa.sector || null;
          }
        } else {
          // Sin mesa → limpiar sector también
          data.sector = null;
        }
      }

      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);

      // `venta.mesa_id` de la cuenta de una comanda es una COPIA que se hace al
      // crearla, no una derivacion. Al mover la comanda quedaba apuntando a la
      // mesa vieja para siempre: en el PdV no se nota (todo filtra por
      // `comanda_id IS NULL`) pero cualquier reporte que agrupe por mesa la
      // atribuye a la mesa equivocada.
      //
      // Solo cuando efectivamente cambia la mesa: este handler tambien lo usa el
      // ABM administrativo de comandas, que no esta moviendo una cuenta en
      // servicio.
      //
      // Las dos escrituras van en UNA transaccion: si fallaba entre medio, la
      // comanda quedaba en la mesa nueva y su venta apuntando a la vieja — el
      // mismo desfasaje que este arreglo elimina, por otra ventana.
      const mesaNueva = data?.pdv_mesa?.id ?? null;
      return await dataSource.transaction(async (manager) => {
        const guardada = await manager.save(Comanda, entity);
        if (cambiaMesa && mesaNueva !== mesaAnterior) {
          await manager.getRepository(Venta).update(
            { comanda: { id }, estado: VentaEstado.ABIERTA } as any,
            { mesa: mesaNueva ? ({ id: mesaNueva } as any) : null } as any,
          );
        }
        return guardada;
      });
    } catch (error) {
      console.error(`Error updating Comanda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteComanda', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Comanda);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Comanda ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting Comanda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getComandasDisponibles', async () => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        where: { estado: ComandaEstado.DISPONIBLE, activo: true },
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Comandas disponibles:', error);
      throw error;
    }
  });

  // getComandasOcupadas: carga comandas ocupadas con su venta abierta via query builder
  ipcMain.handle('getComandasOcupadas', async () => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.createQueryBuilder('comanda')
        .leftJoinAndSelect('comanda.pdv_mesa', 'pdv_mesa')
        .leftJoinAndSelect('comanda.sector', 'sector')
        .leftJoinAndMapOne('comanda.venta', Venta, 'venta', 'venta.comanda_id = comanda.id AND venta.estado = :ventaEstado', { ventaEstado: VentaEstado.ABIERTA })
        .where('comanda.estado = :estado AND comanda.activo = :activo', { estado: ComandaEstado.OCUPADO, activo: true })
        .orderBy('comanda.numero', 'ASC')
        .getMany();
    } catch (error) {
      console.error('Error getting Comandas ocupadas:', error);
      throw error;
    }
  });

  ipcMain.handle('getComandasBySector', async (_event: any, sectorId: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.find({
        where: { sector: { id: sectorId }, estado: ComandaEstado.OCUPADO, activo: true },
        relations: ['pdv_mesa', 'sector'],
        order: { numero: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting Comandas for Sector ID ${sectorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('abrirComanda', async (_event: any, comandaId: number, data: { mesaId?: number, sectorId?: number, observacion?: string }) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Comanda);
      const entity = await repo.findOneBy({ id: comandaId });
      if (!entity) throw new Error(`Comanda ID ${comandaId} not found`);
      if (entity.estado !== ComandaEstado.DISPONIBLE) throw new Error(`Comanda ${comandaId} no está disponible`);

      entity.estado = ComandaEstado.OCUPADO;
      if (data.mesaId) {
        const mesaRepo = dataSource.getRepository(PdvMesa);
        const mesa = await mesaRepo.findOne({ where: { id: data.mesaId }, relations: ['sector'] });
        entity.pdv_mesa = mesa || undefined;
        // Sincronizar sector con el de la mesa (a menos que se haya indicado uno explícitamente)
        if (!data.sectorId && mesa?.sector) {
          entity.sector = mesa.sector;
        }
      }
      if (data.sectorId) {
        const sectorRepo = dataSource.getRepository(Sector);
        entity.sector = await sectorRepo.findOneBy({ id: data.sectorId }) || undefined;
      }
      if (data.observacion !== undefined) {
        entity.observacion = data.observacion;
      }
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      const saved = await repo.save(entity);

      // Vincular una comanda a una mesa NO la ocupa: el vinculo es de UBICACION
      // (donde esta sentada la cuenta, para saber a donde llevar la comida), no
      // de ocupacion. La mesa se pinta por su cuenta propia; las comandas las
      // muestra el badge.
      return saved;
    } catch (error) {
      console.error(`Error abriendo Comanda ID ${comandaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('cerrarComanda', async (_event: any, comandaId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const userId = getCurrentUser()?.id;
      // Delega en el mismo helper que usa la transferencia, dentro de una
      // transaccion y con el candado de la comanda. Antes tenia su propia copia
      // de la logica, que ya habia divergido en dos puntos:
      //
      //  - limpiaba `pdv_mesa`/`sector`/`observacion` con `undefined`, y TypeORM
      //    NO emite UPDATE para propiedades undefined: el FK quedaba con el valor
      //    viejo. Una comanda DISPONIBLE conservaba su mesa, y al reabrirse por
      //    transferencia esa mesa stale se propagaba a la venta.
      //  - contaba el trabajo vivo de la mesa FUERA de cualquier transaccion o
      //    candado, asi que podia liberar una mesa que una transferencia en curso
      //    acababa de ocupar.
      return await withComandaLock(comandaId, async () => dataSource.transaction(async (manager) => {
        const existe = await manager.findOneBy(Comanda, { id: comandaId });
        if (!existe) throw new Error(`Comanda ID ${comandaId} not found`);
        await cerrarComandaEnTx(manager, comandaId, userId);
        return await manager.findOneBy(Comanda, { id: comandaId });
      }));
    } catch (error) {
      console.error(`Error cerrando Comanda ID ${comandaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createBatchComandas', async (_event: any, batchData: any[]) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(Comanda);
      const results: any[] = [];
      for (const data of batchData) {
        const entity = repo.create({ ...data, estado: ComandaEstado.DISPONIBLE });
        await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
        const saved = await repo.save(entity);
        results.push(saved);
      }
      return results;
    } catch (error) {
      console.error('Error creating batch Comandas:', error);
      throw error;
    }
  });

  ipcMain.handle('getComandaWithVenta', async (_event: any, comandaId: number) => {
    try {
      const repo = dataSource.getRepository(Comanda);
      return await repo.createQueryBuilder('comanda')
        .leftJoinAndSelect('comanda.pdv_mesa', 'pdv_mesa')
        .leftJoinAndSelect('comanda.sector', 'sector')
        .leftJoinAndMapOne('comanda.venta', Venta, 'venta', 'venta.comanda_id = comanda.id AND venta.estado = :ventaEstado', { ventaEstado: VentaEstado.ABIERTA })
        // Cargar cliente (+ persona) para que el auto-refresh no lo pierda al reseleccionar la comanda.
        .leftJoinAndSelect('venta.cliente', 'ventaCliente')
        .leftJoinAndSelect('ventaCliente.persona', 'ventaClientePersona')
        .where('comanda.id = :id', { id: comandaId })
        .getOne();
    } catch (error) {
      console.error(`Error getting Comanda with venta ID ${comandaId}:`, error);
      throw error;
    }
  });

  // --- Sector Handlers ---
  ipcMain.handle('getSectores', async (_event: any, tipo?: string) => {
    try {
      const repo = dataSource.getRepository(Sector);
      return await repo.find({
        where: tipo ? { tipo: tipo as any } : {},
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Sectores:', error);
      throw error;
    }
  });

  ipcMain.handle('getSectoresActivos', async (_event: any, tipo?: string) => {
    try {
      const repo = dataSource.getRepository(Sector);
      return await repo.find({
        where: { activo: true, ...(tipo ? { tipo: tipo as any } : {}) },
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting Sectores activos:', error);
      throw error;
    }
  });

  ipcMain.handle('getSector', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Sector);
      return await repo.findOne({
        where: { id },
        relations: ['mesas']
      });
    } catch (error) {
      console.error(`Error getting Sector ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createSector', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(Sector);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating Sector:', error);
      throw error;
    }
  });

  ipcMain.handle('updateSector', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(Sector);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Sector ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating Sector ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteSector', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(Sector);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Sector ID ${id} not found`);
      
      // Check for dependencies on PdvMesa
      const mesaRepo = dataSource.getRepository(PdvMesa);
      const mesasCount = await mesaRepo.count({
        where: { sector: { id } }
      });
      
      if (mesasCount > 0) {
        throw new Error(`No se puede eliminar el sector porque tiene ${mesasCount} mesas asociadas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting Sector ID ${id}:`, error);
      throw error;
    }
  });

  // --- Stock: Procesar movimientos de stock al finalizar venta ---
  ipcMain.handle('procesarStockVenta', async (_event: any, ventaId: number) => {
   await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
   return withVentaStockLock(ventaId, async () => {
    const stockRepo = dataSource.getRepository(StockMovimiento);
    const ventaItemRepo = dataSource.getRepository(VentaItem);
    const recetaIngRepo = dataSource.getRepository(RecetaIngrediente);
    const recetaPresRepo = dataSource.getRepository(RecetaPresentacion);
    const modRepo = dataSource.getRepository(VentaItemIngredienteModificacion);
    const adicRepo = dataSource.getRepository(VentaItemAdicional);
    const comboRepo = dataSource.getRepository(Combo);
    const productoRepo = dataSource.getRepository(Producto);
    const recetaRepo = dataSource.getRepository(Receta);

    try {
      // 1. Idempotencia: verificar si ya se procesó
      const existing = await stockRepo.count({
        where: { referencia: ventaId, tipoReferencia: StockMovimientoTipoReferencia.VENTA, activo: true },
      });
      if (existing > 0) {
        return { success: true, message: 'Ya procesado', movimientosCreados: 0 };
      }

      // 2. Verificar venta
      const ventaRepo = dataSource.getRepository(Venta);
      const venta = await ventaRepo.findOne({ where: { id: ventaId } });
      if (!venta || venta.estado !== VentaEstado.CONCLUIDA) {
        return { success: false, message: 'Venta no encontrada o no CONCLUIDA' };
      }

      // 3. Cargar items activos con relaciones
      const items = await ventaItemRepo.find({
        where: { venta: { id: ventaId }, estado: EstadoVentaItem.ACTIVO },
        relations: ['producto', 'presentacion'],
      });

      if (items.length === 0) {
        return { success: true, message: 'Sin items activos', movimientosCreados: 0 };
      }

      // 4. Recolectar movimientos pendientes
      interface PendingMovement {
        productoId: number;
        cantidad: number;
        ventaItemId: number;
      }
      const pending: PendingMovement[] = [];

      for (const item of items) {
        if (!item.producto) continue;
        const tipo = item.producto.tipo as ProductoTipo;

        switch (tipo) {
          case ProductoTipo.RETAIL:
          case ProductoTipo.RETAIL_INGREDIENTE:
            await processRetail(item, pending);
            break;
          case ProductoTipo.ELABORADO_SIN_VARIACION:
            await processElaboradoSinVariacion(item, pending);
            break;
          case ProductoTipo.ELABORADO_CON_VARIACION:
            await processElaboradoConVariacion(item, pending);
            break;
          case ProductoTipo.COMBO:
            await processCombo(item, pending, 0);
            break;
          case ProductoTipo.BUFFET_POR_PESO:
            await processBuffetPorPeso(item, pending);
            break;
        }
      }

      if (pending.length === 0) {
        return { success: true, message: 'Nada que descontar', movimientosCreados: 0 };
      }

      // 5. Crear movimientos en transacción
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const currentUser = getCurrentUser();
        for (const mov of pending) {
          const stockMov = new StockMovimiento();
          stockMov.cantidad = Math.round(mov.cantidad * 1000) / 1000; // precision 3 decimales
          stockMov.tipo = StockMovimientoTipo.VENTA;
          stockMov.referencia = ventaId;
          stockMov.tipoReferencia = StockMovimientoTipoReferencia.VENTA;
          stockMov.fecha = new Date();
          stockMov.activo = true;
          stockMov.producto = { id: mov.productoId } as any;
          stockMov.observaciones = `VENTA #${ventaId} - ITEM #${mov.ventaItemId}`;
          if (currentUser) {
            (stockMov as any).createdBy = currentUser;
            (stockMov as any).updatedBy = currentUser;
          }
          await queryRunner.manager.save(StockMovimiento, stockMov);
        }

        await queryRunner.commitTransaction();
        console.log(`Stock procesado para venta #${ventaId}: ${pending.length} movimientos`);
        return { success: true, movimientosCreados: pending.length };
      } catch (err) {
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }

      // --- Funciones auxiliares ---

      async function processRetail(item: VentaItem, out: PendingMovement[]): Promise<void> {
        if (!item.producto.controlaStock) return;
        let cantidad = Number(item.cantidad);
        // Multiplicar por cantidad de la presentación (ej: caja de 12)
        if (item.presentacion && Number(item.presentacion.cantidad) > 1) {
          cantidad *= Number(item.presentacion.cantidad);
        }
        out.push({ productoId: item.producto.id, cantidad, ventaItemId: item.id });
      }

      async function processBuffetPorPeso(item: VentaItem, out: PendingMovement[]): Promise<void> {
        // Modo híbrido: si el producto está marcado para descontar por receta,
        // se prorratean ingredientes (Fase 5). Por defecto (opaco), se descuenta
        // el propio producto buffet por kilo neto — su stock se carga vía
        // Producción (PRODUCCION_ENTRADA). El desperdicio = producido - vendido.
        const producto = await productoRepo.findOne({
          where: { id: item.producto.id },
          relations: ['receta'],
        });
        if (producto?.descuentaPorReceta && producto?.receta?.id) {
          const receta = await recetaRepo.findOne({ where: { id: producto.receta.id } });
          if (receta) {
            await processReceta(receta, item, out);
            return;
          }
        }
        if (!item.producto.controlaStock) return;
        // pesoNeto está en gramos; cantidad ya viene en kg neto (las dos coinciden).
        const netoKg =
          item.pesoNeto != null ? Number(item.pesoNeto) / 1000 : Number(item.cantidad);
        if (!netoKg || netoKg <= 0) return;
        out.push({ productoId: item.producto.id, cantidad: netoKg, ventaItemId: item.id });
      }

      async function processElaboradoSinVariacion(item: VentaItem, out: PendingMovement[]): Promise<void> {
        // Buscar receta del producto
        const producto = await productoRepo.findOne({
          where: { id: item.producto.id },
          relations: ['receta'],
        });
        const recetaId = producto?.receta?.id;
        if (!recetaId) return;

        const receta = await recetaRepo.findOne({ where: { id: recetaId } });
        if (!receta) return;

        await processReceta(receta, item, out);
      }

      async function processElaboradoConVariacion(item: VentaItem, out: PendingMovement[]): Promise<void> {
        if (!item.presentacion?.id) return;

        // C-02: una pizza multi-sabor tiene N VentaItemSabor, cada uno con su
        // RecetaPresentacion y su proporcion (1.0 entera, 0.5 mitad, ...). Antes
        // se resolvía UN solo RecetaPresentacion con .getOne() (sabor arbitrario)
        // y se descontaba al 100%, ignorando los demás sabores y la proporción.
        // Ahora se descuenta la receta de CADA sabor escalada por su proporción,
        // igual que el cálculo de costo (costo_calculado × proporcion).
        const sabores = await dataSource.getRepository(VentaItemSabor).find({
          where: { ventaItem: { id: item.id }, activo: true },
          relations: ['recetaPresentacion', 'recetaPresentacion.receta'],
        });

        if (sabores.length > 0) {
          for (const vis of sabores) {
            const receta = vis.recetaPresentacion?.receta;
            if (!receta) continue;
            const proporcion = Number(vis.proporcion) || 0;
            if (proporcion <= 0) continue;
            const itemEscalado = { ...item, cantidad: Number(item.cantidad) * proporcion } as VentaItem;
            // Ingredientes + modificaciones por sabor; adicionales una sola vez (abajo).
            await processReceta(receta, itemEscalado, out, false);
          }
          // Los adicionales del item se descuentan una sola vez (no por sabor).
          await processAdicionalesItem(item, out);
          return;
        }

        // Fallback (data antigua / item sin sabores persistidos): comportamiento previo.
        const recetaPres = await recetaPresRepo.createQueryBuilder('rp')
          .innerJoinAndSelect('rp.receta', 'receta')
          .innerJoin('rp.sabor', 'sabor')
          .where('rp.presentacion_id = :presId', { presId: item.presentacion.id })
          .andWhere('sabor.producto_id = :prodId', { prodId: item.producto.id })
          .andWhere('rp.activo = :activo', { activo: true })
          .getOne();

        if (!recetaPres?.receta) return;
        await processReceta(recetaPres.receta, item, out);
      }

      async function processCombo(item: VentaItem, out: PendingMovement[], depth: number): Promise<void> {
        if (depth >= 2) return; // Prevenir anidamiento infinito

        const combo = await comboRepo.findOne({
          where: { producto: { id: item.producto.id }, activo: true },
          relations: ['productos', 'productos.producto', 'productos.presentacion'],
        });
        if (!combo?.productos) return;

        for (const cp of combo.productos) {
          if (!cp.activo || !cp.producto) continue;
          const cantidadEfectiva = Number(cp.cantidad) * Number(item.cantidad);

          // Crear un item virtual para reusar la lógica
          const virtualItem = {
            id: item.id,
            producto: cp.producto,
            presentacion: cp.presentacion || null,
            cantidad: cantidadEfectiva,
          } as VentaItem;

          const cpTipo = cp.producto.tipo as ProductoTipo;
          switch (cpTipo) {
            case ProductoTipo.RETAIL:
            case ProductoTipo.RETAIL_INGREDIENTE:
              await processRetail(virtualItem, out);
              break;
            case ProductoTipo.ELABORADO_SIN_VARIACION:
              await processElaboradoSinVariacion(virtualItem, out);
              break;
            case ProductoTipo.ELABORADO_CON_VARIACION:
              await processElaboradoConVariacion(virtualItem, out);
              break;
            case ProductoTipo.COMBO:
              await processCombo(virtualItem, out, depth + 1);
              break;
          }
        }
      }

      // Procesa ingredientes de una receta recursivamente (sin modificaciones ni adicionales)
      async function processRecetaIngredientes(receta: Receta, item: { id: number; cantidad: number }, out: PendingMovement[], depth = 0): Promise<void> {
        if (depth >= 3) return; // Límite de recursión
        const rendimiento = Number(receta.rendimiento) || 1;
        const cantidadVendida = Number(item.cantidad);

        const ingredientes = await recetaIngRepo.find({
          where: { receta: { id: receta.id }, activo: true },
          relations: ['ingrediente'],
        });

        for (const ing of ingredientes) {
          if (!ing.ingrediente) continue;

          const aprovechamiento = Number(ing.porcentajeAprovechamiento) || 100;
          const rawCantidad = (Number(ing.cantidad) * cantidadVendida) / rendimiento;
          const actualCantidad = rawCantidad / (aprovechamiento / 100);

          if (ing.ingrediente.controlaStock) {
            out.push({ productoId: ing.ingrediente.id, cantidad: actualCantidad, ventaItemId: item.id });
          } else {
            // Recursar: entrar a la receta del ingrediente
            const ingProd = await productoRepo.findOne({ where: { id: ing.ingrediente.id }, relations: ['receta'] });
            if (ingProd?.receta?.id) {
              const subReceta = await recetaRepo.findOne({ where: { id: ingProd.receta.id } });
              if (subReceta) {
                await processRecetaIngredientes(subReceta, { id: item.id, cantidad: actualCantidad }, out, depth + 1);
              }
            }
          }
        }
      }

      // Procesa receta completa: con modificaciones del VentaItem + adicionales.
      // incluirAdicionales=false para el caso multi-sabor (los adicionales se
      // procesan una sola vez aparte, no por cada sabor).
      async function processReceta(receta: Receta, item: VentaItem, out: PendingMovement[], incluirAdicionales = true): Promise<void> {
        const rendimiento = Number(receta.rendimiento) || 1;
        const cantidadVendida = Number(item.cantidad);

        const ingredientes = await recetaIngRepo.find({
          where: { receta: { id: receta.id }, activo: true },
          relations: ['ingrediente'],
        });

        // Cargar modificaciones del item (removidos/intercambiados)
        const modificaciones = await modRepo.find({
          where: { ventaItem: { id: item.id } },
          relations: ['recetaIngrediente', 'ingredienteReemplazo'],
        });

        const removidos = new Set(
          modificaciones
            .filter(m => m.tipoModificacion === TipoModificacionIngrediente.REMOVIDO)
            .map(m => m.recetaIngrediente?.id)
            .filter(Boolean)
        );

        const intercambios = new Map<number, number>();
        for (const m of modificaciones) {
          if (m.tipoModificacion === TipoModificacionIngrediente.INTERCAMBIADO && m.recetaIngrediente?.id && m.ingredienteReemplazo?.id) {
            intercambios.set(m.recetaIngrediente.id, m.ingredienteReemplazo.id);
          }
        }

        for (const ing of ingredientes) {
          if (!ing.ingrediente) continue;
          if (removidos.has(ing.id)) continue;

          let targetProductoId = ing.ingrediente.id;
          let targetControlaStock = ing.ingrediente.controlaStock;

          if (intercambios.has(ing.id)) {
            targetProductoId = intercambios.get(ing.id)!;
            const reemplazo = await productoRepo.findOne({ where: { id: targetProductoId } });
            if (!reemplazo) continue;
            targetControlaStock = reemplazo.controlaStock;
          }

          const aprovechamiento = Number(ing.porcentajeAprovechamiento) || 100;
          const rawCantidad = (Number(ing.cantidad) * cantidadVendida) / rendimiento;
          const actualCantidad = rawCantidad / (aprovechamiento / 100);

          if (targetControlaStock) {
            out.push({ productoId: targetProductoId, cantidad: actualCantidad, ventaItemId: item.id });
          } else {
            // Ingrediente no controla stock: recursar a su receta
            const ingProd = await productoRepo.findOne({ where: { id: targetProductoId }, relations: ['receta'] });
            if (ingProd?.receta?.id) {
              const subReceta = await recetaRepo.findOne({ where: { id: ingProd.receta.id } });
              if (subReceta) {
                await processRecetaIngredientes(subReceta, { id: item.id, cantidad: actualCantidad }, out);
              }
            }
          }
        }

        // Adicionales del item: se procesan una sola vez por item. En pizzas
        // multi-sabor la receta se procesa por-sabor, pero los adicionales no
        // deben multiplicarse por la cantidad de sabores (C-02).
        if (incluirAdicionales) {
          await processAdicionalesItem(item, out);
        }
      }

      // Procesa los adicionales de un VentaItem (extraído de processReceta para
      // poder llamarlo una sola vez cuando la receta se procesa por-sabor).
      async function processAdicionalesItem(item: VentaItem, out: PendingMovement[]): Promise<void> {
        const cantidadVendida = Number(item.cantidad);
        const adicionales = await adicRepo.find({
          where: { ventaItem: { id: item.id }, activo: true },
          relations: ['adicional'],
        });

        for (const va of adicionales) {
          if (!va.adicional) continue;
          // Buscar si el adicional tiene receta
          const adicional = await dataSource.getRepository(Adicional).findOne({
            where: { id: (va.adicional as any).id || va.adicional },
            relations: ['receta'],
          });
          if (!adicional?.receta?.id) continue;

          const adicReceta = await recetaRepo.findOne({ where: { id: adicional.receta.id } });
          if (!adicReceta) continue;

          const adicIngredientes = await recetaIngRepo.find({
            where: { receta: { id: adicReceta.id }, activo: true },
            relations: ['ingrediente'],
          });

          const adicRendimiento = Number(adicReceta.rendimiento) || 1;
          const adicCantidad = Number(va.cantidad) * cantidadVendida;

          for (const adicIng of adicIngredientes) {
            if (!adicIng.ingrediente?.controlaStock) continue;
            const aprov = Number(adicIng.porcentajeAprovechamiento) || 100;
            const raw = (Number(adicIng.cantidad) * adicCantidad) / adicRendimiento;
            const actual = raw / (aprov / 100);
            out.push({ productoId: adicIng.ingrediente.id, cantidad: actual, ventaItemId: item.id });
          }
        }
      }

    } catch (error) {
      console.error(`Error procesando stock para venta #${ventaId}:`, error);
      return { success: false, error: (error as any).message };
    }
   });
  });

  // --- Stock: Revertir movimientos de stock al cancelar venta finalizada ---
  ipcMain.handle('revertirStockVenta', async (_event: any, ventaId: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const stockRepo = dataSource.getRepository(StockMovimiento);

    try {
      // Buscar movimientos existentes para esta venta
      const movimientos = await stockRepo.find({
        where: { referencia: ventaId, tipoReferencia: StockMovimientoTipoReferencia.VENTA, activo: true },
        relations: ['producto'],
      });

      if (movimientos.length === 0) {
        return { success: true, message: 'Sin movimientos que revertir', movimientosRevertidos: 0 };
      }

      // Marcar movimientos como inactivos (dejan de contar en el cálculo de stock)
      for (const mov of movimientos) {
        mov.activo = false;
      }
      await stockRepo.save(movimientos);

      console.log(`Stock revertido para venta #${ventaId}: ${movimientos.length} movimientos desactivados`);
      return { success: true, movimientosRevertidos: movimientos.length };
    } catch (error) {
      console.error(`Error revirtiendo stock para venta #${ventaId}:`, error);
      return { success: false, error: (error as any).message };
    }
  });

  // =============================================
  // PdvAtajoGrupo handlers
  // =============================================

  ipcMain.handle('getPdvAtajoGrupos', async () => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      return await repo.find({
        relations: ['atajoGrupoItems', 'atajoGrupoItems.atajoItem'],
        order: { posicion: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PdvAtajoGrupos:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvAtajoGrupo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      return await repo.findOne({
        where: { id },
        relations: ['atajoGrupoItems', 'atajoGrupoItems.atajoItem']
      });
    } catch (error) {
      console.error(`Error getting PdvAtajoGrupo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvAtajoGrupo', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      if (data.nombre) data.nombre = data.nombre.toUpperCase();
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PdvAtajoGrupo:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvAtajoGrupo', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoGrupo ID ${id} not found`);
      if (data.nombre) data.nombre = data.nombre.toUpperCase();
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PdvAtajoGrupo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvAtajoGrupo', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoGrupo ID ${id} not found`);
      // Delete join table entries first
      const joinRepo = dataSource.getRepository(PdvAtajoGrupoItem);
      await joinRepo.delete({ atajoGrupoId: id });
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PdvAtajoGrupo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('reorderPdvAtajoGrupos', async (_event: any, orderedIds: number[]) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoGrupo);
      for (let i = 0; i < orderedIds.length; i++) {
        await repo.update(orderedIds[i], { posicion: i });
      }
      return { success: true };
    } catch (error) {
      console.error('Error reordering PdvAtajoGrupos:', error);
      throw error;
    }
  });

  // =============================================
  // PdvAtajoItem handlers
  // =============================================

  ipcMain.handle('getPdvAtajoItems', async () => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItem);
      return await repo.find({
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PdvAtajoItems:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvAtajoItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItem);
      return await repo.findOne({
        where: { id },
        relations: ['atajoGrupoItems', 'atajoGrupoItems.atajoGrupo', 'atajoItemProductos', 'atajoItemProductos.producto']
      });
    } catch (error) {
      console.error(`Error getting PdvAtajoItem ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvAtajoItemsByGrupo', async (_event: any, grupoId: number) => {
    try {
      const joinRepo = dataSource.getRepository(PdvAtajoGrupoItem);
      const joinEntries = await joinRepo.find({
        where: { atajoGrupoId: grupoId },
        relations: ['atajoItem'],
        order: { posicion: 'ASC' }
      });
      return joinEntries.map(entry => ({
        ...entry.atajoItem,
        posicion: entry.posicion
      }));
    } catch (error) {
      console.error(`Error getting PdvAtajoItems for grupo ${grupoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvAtajoItem', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoItem);
      if (data.nombre) data.nombre = data.nombre.toUpperCase();
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PdvAtajoItem:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvAtajoItem', async (_event: any, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoItem ID ${id} not found`);
      if (data.nombre) data.nombre = data.nombre.toUpperCase();
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PdvAtajoItem ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvAtajoItem', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoItem ID ${id} not found`);
      // Delete join table entries first
      const grupoItemRepo = dataSource.getRepository(PdvAtajoGrupoItem);
      await grupoItemRepo.delete({ atajoItemId: id });
      const itemProductoRepo = dataSource.getRepository(PdvAtajoItemProducto);
      await itemProductoRepo.delete({ atajoItemId: id });
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PdvAtajoItem ID ${id}:`, error);
      throw error;
    }
  });

  // =============================================
  // PdvAtajoGrupoItem (join table) handlers
  // =============================================

  ipcMain.handle('assignAtajoItemToGrupo', async (_event: any, grupoId: number, itemId: number, posicion: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoGrupoItem);
      // Check if already exists
      const existing = await repo.findOne({
        where: { atajoGrupoId: grupoId, atajoItemId: itemId }
      });
      if (existing) {
        existing.posicion = posicion;
        return await repo.save(existing);
      }
      const entity = repo.create({ atajoGrupoId: grupoId, atajoItemId: itemId, posicion });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error assigning atajo item ${itemId} to grupo ${grupoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('removeAtajoItemFromGrupo', async (_event: any, grupoId: number, itemId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoGrupoItem);
      const entity = await repo.findOne({
        where: { atajoGrupoId: grupoId, atajoItemId: itemId }
      });
      if (!entity) throw new Error(`Join entry not found for grupo ${grupoId} and item ${itemId}`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error removing atajo item ${itemId} from grupo ${grupoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('reorderAtajoItemsInGrupo', async (_event: any, grupoId: number, orderedItemIds: number[]) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoGrupoItem);
      for (let i = 0; i < orderedItemIds.length; i++) {
        await repo.update(
          { atajoGrupoId: grupoId, atajoItemId: orderedItemIds[i] },
          { posicion: i }
        );
      }
      return { success: true };
    } catch (error) {
      console.error(`Error reordering atajo items in grupo ${grupoId}:`, error);
      throw error;
    }
  });

  // =============================================
  // PdvAtajoItemProducto (join table) handlers
  // =============================================

  ipcMain.handle('getPdvAtajoItemProductos', async (_event: any, atajoItemId: number) => {
    try {
      const repo = dataSource.getRepository(PdvAtajoItemProducto);
      const pvRepo = dataSource.getRepository(PrecioVenta);
      const items = await repo.find({
        where: { atajoItemId },
        relations: [
          'producto',
          'producto.presentaciones',
          'producto.presentaciones.preciosVenta',
          'producto.presentaciones.preciosVenta.moneda',
          'producto.presentaciones.preciosVenta.tipoPrecio',
          'producto.receta'
        ],
        order: { posicion: 'ASC' }
      });

      // Resolve prices based on product type
      const pickPrecio = (precios: any[]) =>
        precios?.find((pv: any) => pv.activo && pv.principal)
        || precios?.find((pv: any) => pv.activo)
        || precios?.[0]
        || null;

      // Productos con variación: rango de precios y config de multi-sabor
      // resueltos en batch (el atajo puede tener varios y todos consultarían lo
      // mismo).
      const idsVariacion = items
        .map((item: any) => item.producto)
        .filter((p: any) => p?.tipo === 'ELABORADO_CON_VARIACION')
        .map((p: any) => p.id);
      const rangosVariacion = idsVariacion.length
        ? await getRangosPrecioVariacion(dataSource, idsVariacion)
        : new Map();
      const configGlobalVariacion = idsVariacion.length
        ? await getVariacionConfigGlobal(dataSource)
        : undefined;

      for (const item of items) {
        const p = item.producto as any;
        if (!p) continue;

        if (p.tipo === 'ELABORADO_SIN_VARIACION') {
          const recetaId = p.receta?.id;
          if (recetaId) {
            const precios = await pvRepo.find({
              where: { receta: { id: recetaId }, activo: true },
              relations: ['moneda'],
              order: { principal: 'DESC' }
            });
            p.precioDirecto = pickPrecio(precios);
          }
        } else if (p.tipo === 'ELABORADO_CON_VARIACION') {
          // El precio de una variación cuelga de `receta_presentacion_id`, no de
          // la receta (y menos del 1:1 legacy `receta.producto_id`, que dejaba el
          // atajo en 0). Se muestra el rango "desde / hasta" de sus variaciones.
          const cfgVariacion = await getVariacionConfig(dataSource, p, configGlobalVariacion);
          p.variacionConfig = { maxSabores: cfgVariacion.maxSabores, estrategia: cfgVariacion.estrategia };
          const rango = rangosVariacion.get(p.id);
          if (rango && rango.variacionesCount > 0) {
            p.precioDirecto = rango.precioReferencia;
            p.variacionResumen = {
              precioDesde: rango.precioDesde,
              precioHasta: rango.precioHasta,
              variacionesCount: rango.variacionesCount,
              saboresCount: rango.saboresCount,
              presentacionesCount: rango.presentacionesCount,
            };
          }
        } else if (p.tipo === 'COMBO') {
          const precios = await pvRepo.find({
            where: { producto: { id: p.id }, activo: true },
            relations: ['moneda'],
            order: { principal: 'DESC' }
          });
          p.precioDirecto = pickPrecio(precios);
        }
        // RETAIL: prices already loaded via presentaciones.preciosVenta
      }

      return items;
    } catch (error) {
      console.error(`Error getting productos for atajo item ${atajoItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('assignProductoToAtajoItem', async (_event: any, atajoItemId: number, productoId: number, data?: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoItemProducto);
      // Check if already exists
      const existing = await repo.findOne({
        where: { atajoItemId, productoId }
      });
      if (existing) return existing;
      const maxPosResult = await repo.createQueryBuilder('aip')
        .select('MAX(aip.posicion)', 'maxPos')
        .where('aip.atajo_item_id = :atajoItemId', { atajoItemId })
        .getRawOne();
      const nextPos = (maxPosResult?.maxPos ?? -1) + 1;
      const entity = repo.create({
        atajoItemId,
        productoId,
        posicion: nextPos,
        nombre_alternativo: data?.nombre_alternativo || null,
        activo: true
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error assigning producto ${productoId} to atajo item ${atajoItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('removeProductoFromAtajoItem', async (_event: any, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoItemProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PdvAtajoItemProducto ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error removing PdvAtajoItemProducto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('reorderProductosInAtajoItem', async (_event: any, atajoItemId: number, orderedIds: number[]) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV_CONFIGURAR');
      const repo = dataSource.getRepository(PdvAtajoItemProducto);
      for (let i = 0; i < orderedIds.length; i++) {
        await repo.update(orderedIds[i], { posicion: i });
      }
      return { success: true };
    } catch (error) {
      console.error(`Error reordering productos in atajo item ${atajoItemId}:`, error);
      throw error;
    }
  });

  // --- VentaItemSabor Handlers (multi-sabor / variaciones) ---

  ipcMain.handle('createVentaItemSabor', async (_event: any, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const repo = dataSource.getRepository(VentaItemSabor);
      const entity = repo.create({
        ventaItem: { id: data.ventaItemId },
        recetaPresentacion: { id: data.recetaPresentacionId },
        proporcion: data.proporcion,
        precioReferencia: data.precioReferencia,
        costoReferencia: data.costoReferencia,
        activo: true
      });
      const saved = await repo.save(entity);
      return await repo.findOne({
        where: { id: saved.id },
        relations: ['recetaPresentacion', 'recetaPresentacion.sabor', 'recetaPresentacion.presentacion']
      });
    } catch (error) {
      console.error('Error creating VentaItemSabor:', error);
      throw error;
    }
  });

  ipcMain.handle('getVentaItemSabores', async (_event: any, ventaItemId: number) => {
    try {
      return await dataSource.getRepository(VentaItemSabor).find({
        where: { ventaItem: { id: ventaItemId }, activo: true },
        relations: ['recetaPresentacion', 'recetaPresentacion.sabor', 'recetaPresentacion.presentacion', 'recetaPresentacion.preciosVenta'],
        order: { id: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting VentaItemSabores for item ${ventaItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItemSaboresByItem', async (_event: any, ventaItemId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      await dataSource.getRepository(VentaItemSabor).delete({ ventaItem: { id: ventaItemId } });
      return { success: true };
    } catch (error) {
      console.error(`Error deleting VentaItemSabores for item ${ventaItemId}:`, error);
      throw error;
    }
  });

  // ─── Cobro parcial por ítems ─────────────────────────────────────────────
  // Ver docs/PLAN-COBRO-PARCIAL-POR-ITEMS.md. El estado de cobro se maneja en
  // BRUTO (moneda principal, sin conversión): la cobertura por ítem
  // (`montoCubierto`) y los topes viven en bruto. El descuento/aumento global
  // se absorbe vía el `factor` que calcula el front (ya trabaja en principal).

  // Estado de cobro de una venta: por ítem (neto bruto, cubierto, estado) +
  // totales en bruto. La verdad de dinero (saldo con descuento global) la
  // sigue calculando el front con sus cotizaciones.
  ipcMain.handle('getEstadoCobroVenta', async (_event: any, ventaId: number) => {
    return await getEstadoCobroVentaInternal(dataSource, ventaId);
  });

  // Registra una ronda de cobro parcial: crea `CobroParcial`, taguea las líneas
  // de pago de la ronda, crea las imputaciones en bruto y actualiza el cache
  // `VentaItem.montoCubierto`. Transaccional + anti-doble-cobro (valida topes
  // contra la cobertura ya persistida, incluso desde otro dispositivo).
  ipcMain.handle('registrarCobroParcial', async (_event: any, ventaId: number, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_COBRAR');
    const imputaciones: Array<{ ventaItemId: number; brutoCubierto: number; cantidad?: number }> =
      Array.isArray(payload?.imputaciones) ? payload.imputaciones : [];
    const pagoDetalleIds: number[] = Array.isArray(payload?.pagoDetalleIds) ? payload.pagoDetalleIds : [];
    const cashTotal = Number(payload?.cashTotalPrincipal ?? 0);
    const factor = Number(payload?.factorAplicado ?? 1) || 1;
    const TOL = 0.5;

    if (!imputaciones.length) throw new Error('COBRO_PARCIAL_SIN_ITEMS');

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const venta = await queryRunner.manager.findOne(Venta, {
        where: { id: ventaId },
        relations: ['pago'],
      });
      if (!venta) throw new Error(`Venta ${ventaId} no encontrada`);
      if (venta.estado !== VentaEstado.ABIERTA) throw new Error('VENTA_NO_ABIERTA');

      // Validar topes por ítem contra la cobertura ya persistida (anti doble-cobro).
      const itemsAfectados: Array<{ item: VentaItem; brutoCubierto: number; cantidad?: number }> = [];
      for (const imp of imputaciones) {
        const item = await queryRunner.manager.findOne(VentaItem, {
          where: { id: imp.ventaItemId },
          relations: ['venta'],
        });
        if (!item || (item.venta as any)?.id !== ventaId) throw new Error(`ITEM_INVALIDO_${imp.ventaItemId}`);
        if (item.estado !== EstadoVentaItem.ACTIVO) throw new Error(`ITEM_NO_ACTIVO_${imp.ventaItemId}`);
        const netoBruto = computeNetoBrutoItem(item);
        const yaCubierto = Number(item.montoCubierto || 0);
        const bruto = Number(imp.brutoCubierto || 0);
        if (bruto <= 0) continue;
        if (yaCubierto + bruto > netoBruto + TOL) {
          throw new Error(`ITEM_YA_CUBIERTO_${imp.ventaItemId}`);
        }
        itemsAfectados.push({ item, brutoCubierto: bruto, cantidad: imp.cantidad });
      }
      if (!itemsAfectados.length) throw new Error('COBRO_PARCIAL_SIN_ITEMS');

      // Crear la ronda.
      const ronda = queryRunner.manager.create(CobroParcial, {
        venta: { id: ventaId } as any,
        usuario: getCurrentUser()?.id ? ({ id: getCurrentUser()!.id } as any) : null,
        fecha: new Date(),
        factorAplicado: factor,
        cashTotal: cashTotal,
        activo: true,
      });
      setEntityUserTracking(dataSource, ronda, getCurrentUser()?.id, false);
      const rondaSaved = await queryRunner.manager.save(CobroParcial, ronda);

      // Taguear las líneas de pago de esta ronda.
      //
      // ⚠️ Se valida que TODAS pertenezcan al pago de ESTA venta antes de tocar
      // nada. El update filtraba sólo por id, así que un cliente podía mandar
      // ids de líneas de otras ventas —de otras cajas, incluso ya cerradas— y
      // atarlas a su ronda; después `anularCobroParcial` las ponía `activo=false`
      // y esa plata desaparecía del arqueo ajeno de forma retroactiva. Alcanzaba
      // con VENTAS_PDV + VENTAS_COBRAR.
      //
      // La verificación va con `find` + comparación y no como condición del
      // `update`: `PagoDetalle` no expone `pagoId` escalar (sólo el JoinColumn),
      // así que una condición de relación anidada en un UpdateQueryBuilder es
      // terreno resbaladizo. Y además permite fallar explícito en vez de taguear
      // de a pedazos.
      if (pagoDetalleIds.length) {
        const pagoVentaId = (venta.pago as any)?.id ?? null;
        const lineas = await queryRunner.manager.find(PagoDetalle, {
          where: { id: In(pagoDetalleIds) },
          relations: ['pago'],
        });
        const todasPropias = pagoVentaId != null
          && lineas.length === pagoDetalleIds.length
          && lineas.every((l) => ((l.pago as any)?.id ?? null) === pagoVentaId);
        if (!todasPropias) throw new Error('PAGO_DETALLE_AJENO');

        await queryRunner.manager.update(
          PagoDetalle,
          { id: In(pagoDetalleIds) },
          { cobroParcialId: rondaSaved.id },
        );
      }

      // Imputaciones + actualización del cache montoCubierto.
      for (const af of itemsAfectados) {
        const cpi = queryRunner.manager.create(CobroParcialItem, {
          cobroParcial: { id: rondaSaved.id } as any,
          ventaItem: { id: af.item.id } as any,
          brutoCubierto: af.brutoCubierto,
          cantidad: af.cantidad ?? null,
        });
        setEntityUserTracking(dataSource, cpi, getCurrentUser()?.id, false);
        await queryRunner.manager.save(CobroParcialItem, cpi);

        const netoBruto = computeNetoBrutoItem(af.item);
        let nuevo = Number(af.item.montoCubierto || 0) + af.brutoCubierto;
        if (nuevo > netoBruto) nuevo = netoBruto; // clamp
        await queryRunner.manager.update(VentaItem, { id: af.item.id }, { montoCubierto: nuevo });
      }

      await queryRunner.commitTransaction();
      return await getEstadoCobroVentaInternal(dataSource, ventaId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error en registrarCobroParcial:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Anula una ronda de cobro parcial: desactiva la ronda + sus líneas de pago y
  // recomputa `montoCubierto` de los ítems afectados desde las rondas activas.
  ipcMain.handle('anularCobroParcial', async (_event: any, cobroParcialId: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const ronda = await queryRunner.manager.findOne(CobroParcial, {
        where: { id: cobroParcialId },
        relations: ['venta'],
      });
      if (!ronda) throw new Error(`CobroParcial ${cobroParcialId} no encontrado`);
      const ventaId = (ronda.venta as any)?.id;

      // Anular una ronda desactiva sus `PagoDetalle`, o sea saca plata del
      // arqueo. Sobre una venta ya cerrada eso cambia el resultado de una caja
      // que puede estar cerrada, con su retiro generado y su ticket impreso — y
      // encima deja viva la AcreditacionPos que ese cobro creó. Sólo tiene
      // sentido mientras la cuenta sigue abierta.
      const ventaDeLaRonda = ventaId
        ? await queryRunner.manager.findOne(Venta, { where: { id: ventaId } })
        : null;
      if (!ventaDeLaRonda) throw new Error(`Venta de la ronda ${cobroParcialId} no encontrada`);
      if (ventaDeLaRonda.estado !== VentaEstado.ABIERTA) {
        throw new Error('COBRO_PARCIAL_VENTA_NO_ABIERTA');
      }

      // Ítems que tocaba esta ronda.
      const impsRonda = await queryRunner.manager.find(CobroParcialItem, {
        where: { cobroParcial: { id: cobroParcialId } },
        relations: ['ventaItem'],
      });

      // Desactivar ronda + sus líneas de pago.
      await queryRunner.manager.update(CobroParcial, { id: cobroParcialId }, { activo: false });
      await queryRunner.manager.update(
        PagoDetalle,
        { cobroParcialId: cobroParcialId },
        { activo: false },
      );

      // Recomputar montoCubierto de cada ítem afectado desde rondas ACTIVAS.
      const itemIds = Array.from(new Set(impsRonda.map(i => (i.ventaItem as any)?.id).filter(Boolean)));
      for (const itemId of itemIds) {
        const activos = await queryRunner.manager.find(CobroParcialItem, {
          where: { ventaItem: { id: itemId }, cobroParcial: { activo: true } },
          relations: ['cobroParcial'],
        });
        const total = activos.reduce((s, i) => s + Number(i.brutoCubierto || 0), 0);
        await queryRunner.manager.update(VentaItem, { id: itemId }, { montoCubierto: total });
      }

      await queryRunner.commitTransaction();
      return await getEstadoCobroVentaInternal(dataSource, ventaId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error en anularCobroParcial:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });
}

/** Neto bruto de un ítem (con descuento propio, SIN descuento global). */
function computeNetoBrutoItem(item: any): number {
  const unit = Number(item.precioVentaUnitario || 0)
    + Number(item.precioAdicionales || 0)
    - Number(item.descuentoUnitario || 0);
  return unit * Number(item.cantidad || 0);
}

/**
 * Estado de cobro de una venta (en bruto). Devuelve por ítem el neto bruto,
 * lo cubierto y su estado (PENDIENTE/PARCIAL/PAGADO), más totales en bruto y el
 * descuento/aumento global vigente (referencia para el front).
 *
 * Exportada: `delivery-convertir-modo` la usa para avisar si lo ya cobrado
 * quedó por encima del total nuevo. Es matemática de plata (tolerancias,
 * `Number()` sobre los `decimal` que Postgres devuelve como string) y tener dos
 * copias es la forma más segura de que diverjan.
 */
export async function getEstadoCobroVentaInternal(dataSource: DataSource, ventaId: number) {
  const TOL = 0.5;
  const items = await dataSource.getRepository(VentaItem).find({
    where: { venta: { id: ventaId }, estado: EstadoVentaItem.ACTIVO },
  });
  const itemsEstado = items.map(it => {
    const netoBruto = computeNetoBrutoItem(it);
    const cubierto = Number(it.montoCubierto || 0);
    let estado: 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
    if (cubierto <= TOL) estado = 'PENDIENTE';
    else if (cubierto >= netoBruto - TOL) estado = 'PAGADO';
    else estado = 'PARCIAL';
    return { id: it.id, netoBruto, montoCubierto: cubierto, estado };
  });
  const venta = await dataSource.getRepository(Venta).findOne({ where: { id: ventaId }, relations: ['pago'] });

  // El costo del envío es un cargo de la venta, no un ítem: no se puede cubrir
  // desde el panel de cobro parcial por ítems, pero SÍ es deuda. Antes no
  // entraba en ningún total y el envío terminaba regalado.
  // `costoDelivery` es `decimal` → string en Postgres, de ahí el Number().
  const costoDelivery = Number(venta?.costoDelivery ?? 0) || 0;

  const deudaItems = itemsEstado.reduce((s, i) => s + i.netoBruto, 0);
  const deudaBruta = deudaItems + costoDelivery;
  const totalCubierto = itemsEstado.reduce((s, i) => s + i.montoCubierto, 0);
  const pendienteBruto = Math.max(0, deudaBruta - totalCubierto);

  // Descuento/aumento global desde las líneas del pago (si existe pago).
  let descuentoGlobal = 0;
  let aumentoGlobal = 0;
  if (venta?.pago?.id) {
    const detalles = await dataSource.getRepository(PagoDetalle).find({
      where: { pago: { id: venta.pago.id }, activo: true },
    });
    for (const d of detalles) {
      if (d.tipo === TipoDetalle.DESCUENTO) descuentoGlobal += Number(d.valor || 0);
      else if (d.tipo === TipoDetalle.AUMENTO) aumentoGlobal += Number(d.valor || 0);
    }
  }

  return { items: itemsEstado, deudaItems, costoDelivery, deudaBruta, totalCubierto, pendienteBruto, descuentoGlobal, aumentoGlobal };
}

// Retardo antes de auto-imprimir la comanda: da tiempo a que el PdV persista los
// adicionales/observaciones/opcionales del ítem (que guarda en llamadas separadas
// DESPUÉS de createVentaItem) para que salgan en el ticket de cocina.
const AUTO_PRINT_COMANDA_DELAY_MS = 2500;

/**
 * Hook auto-impresión de comanda (ticket de cocina).
 *
 * Se ejecuta tras `createVentaItem`. Si la Venta tiene **mesa o comanda**
 * asignada Y `pdv_config.autoImprimirComanda=true`, dispara
 * `printComandaInternal` en background (con un retardo corto) — el item ya fue
 * guardado y la respuesta al frontend NO espera la impresión.
 *
 * Si la venta no tiene ni mesa ni comanda → venta directa de mostrador
 * (futuro), no se hace nada.
 *
 * Si la impresión falla (impresora apagada, sin sector configurado, etc.)
 * → se loguea, la venta sigue normal. El `VentaItem` queda con
 * `impreso=false` y se puede reimprimir manualmente desde PdV.
 */
async function autoPrintComandaIfNeeded(
  dataSource: DataSource,
  ventaId: number,
): Promise<void> {
  // 1. Buscar la venta con mesa+comanda
  const venta = await dataSource.getRepository(Venta).findOne({
    where: { id: ventaId },
    relations: ['mesa', 'comanda', 'delivery'],
  });
  if (!venta) return;
  const tieneMesa = !!(venta as any).mesa?.id;
  const tieneComanda = !!(venta as any).comanda?.id;
  // Un delivery o un pedido online no tienen mesa ni comanda y IGUAL van a
  // cocina. Lo que de verdad NO va a cocina es la venta rápida de mostrador, y
  // eso es lo que distingue este predicado.
  const tieneDelivery = !!(venta as any).delivery?.id;
  const vieneDeLaWeb = ((venta as any).canalOrigen ?? 'LOCAL') !== 'LOCAL';
  if (!tieneMesa && !tieneComanda && !tieneDelivery && !vieneDeLaWeb) return; // Venta directa sin cocina

  // 2. Verificar config global
  const pdvConfig = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
  if (!pdvConfig?.autoImprimirComanda) return;

  // 3. Disparar en background, con un pequeño retardo.
  //    El PdV guarda el VentaItem PRIMERO (esto dispara el hook) y RECIÉN DESPUÉS
  //    persiste sus adicionales/observaciones/opcionales en llamadas separadas.
  //    Sin el retardo, la comanda se imprime antes de que esos modificadores
  //    existan y salen sin ellos. El retardo deja que se guarden (son round-trips
  //    rápidos, locales o por LAN) antes de imprimir. La comanda usa
  //    soloItemsNoImpresos + tracking de `impreso`, así que agregar varios ítems
  //    seguidos no duplica.
  setTimeout(() => {
    printComandaInternal(dataSource, ventaId, { soloItemsNoImpresos: true })
      .then(res => {
        if (!res.ok) {
          console.warn(`[auto-print comanda venta=${ventaId}] errores parciales:`,
            res.errors.map(e => e.message).join('; '));
        }
      })
      .catch(e => console.error(`[auto-print comanda venta=${ventaId}] excepción:`, e));
  }, AUTO_PRINT_COMANDA_DELAY_MS);
}

/**
 * Hook KDS — crea los `ComandaItem` (uno por sector) de un `VentaItem` recién
 * agregado, para que aparezca en las pantallas de cocina.
 *
 * Mismas pre-condiciones que la impresión de comanda:
 * - La venta debe tener mesa o comanda (si no, es venta de mostrador sin cocina).
 * - El producto debe tener `requiereComanda !== false`.
 * - El ruteo es por la M2M `producto_sectores`: un `ComandaItem` por sector
 *   activo, con estado de preparación independiente.
 *
 * Idempotente: si ya existe un ComandaItem activo para (ventaItem, sector) no
 * lo duplica (cubre reintentos / doble-fire). Emite evento por cada item creado.
 */
export async function crearComandaItemsSiCorresponde(
  dataSource: DataSource,
  ventaItemId: number,
): Promise<void> {
  if (!ventaItemId) return;

  const item = await dataSource.getRepository(VentaItem).findOne({
    where: { id: ventaItemId },
    relations: ['venta', 'venta.mesa', 'venta.comanda', 'venta.delivery', 'producto'],
  });
  if (!item) return;

  const venta: any = (item as any).venta;
  const producto: any = (item as any).producto;
  if (!venta?.id) return;
  // Igual que en la impresión: delivery y pedidos online sin mesa sí van a
  // cocina. Un delivery cargado por el cajero jamás generaba ComandaItem, así
  // que sus items nunca se ruteaban a la impresora del sector del producto: la
  // cocina sólo veía el ticket único del reparto, si estaba configurado.
  const tieneDelivery = !!(venta as any).delivery?.id;
  const vieneDeLaWeb = (venta.canalOrigen ?? 'LOCAL') !== 'LOCAL';
  if (!venta.mesa?.id && !venta.comanda?.id && !tieneDelivery && !vieneDeLaWeb) return; // venta de mostrador
  if (!producto?.id || producto.requiereComanda === false) return;

  // Sectores destino (M2M producto_sectores, activos, por prioridad)
  const ps = await dataSource.getRepository(ProductoSector).find({
    where: { producto: { id: producto.id } as any, activo: true },
    relations: ['sector'],
    order: { prioridad: 'ASC' },
  });
  const sectores = ps.map(p => (p as any).sector).filter((s: any) => s?.id && s.activo !== false);
  if (sectores.length === 0) return; // sin sector → no aplica KDS

  const ciRepo = dataSource.getRepository(ComandaItem);
  for (const sector of sectores) {
    // Idempotencia: no duplicar (ventaItem, sector) activos
    const existe = await ciRepo.findOne({
      where: { ventaItem: { id: ventaItemId } as any, sector: { id: sector.id } as any, activo: true },
    });
    if (existe) continue;

    const ci = ciRepo.create({
      ventaItem: { id: ventaItemId } as any,
      comanda: venta.comanda?.id ? ({ id: venta.comanda.id } as any) : null,
      sector: { id: sector.id } as any,
      estado: ComandaItemEstado.PENDIENTE,
      observacion: (item as any).ensambladoDescripcion || null,
      activo: true,
    });
    const saved = await ciRepo.save(ci);
    broadcastComandaEvent({
      tipo: 'CREADO',
      comandaItemId: (saved as any).id,
      ventaId: venta.id,
      sectorId: sector.id,
      estado: ComandaItemEstado.PENDIENTE,
    });
  }
}

/**
 * Cierra/transiciona en masa los ComandaItems activos que matchean `where`
 * (por venta-item o por venta) a `nuevoEstado` — usado cuando se cancela un
 * item, se elimina, o la venta se concluye/cancela, para que no queden colgados
 * en las pantallas KDS. No re-toca los ya ENTREGADO/CANCELADO.
 */
async function finalizarComandaItems(
  dataSource: DataSource,
  where: any,
  nuevoEstado: ComandaItemEstado,
  usuarioId: number | undefined,
): Promise<void> {
  const repo = dataSource.getRepository(ComandaItem);
  const items = await repo.find({ where, relations: ['sector', 'ventaItem', 'ventaItem.venta'] });
  for (const ci of items) {
    if (ci.estado === ComandaItemEstado.CANCELADO || ci.estado === ComandaItemEstado.ENTREGADO) continue;
    ci.estado = nuevoEstado;
    if (nuevoEstado === ComandaItemEstado.LISTO && !ci.fechaListo) ci.fechaListo = new Date();
    if (nuevoEstado === ComandaItemEstado.CANCELADO) ci.activo = false;
    await setEntityUserTracking(dataSource, ci, usuarioId, true);
    const saved = await repo.save(ci);
    broadcastComandaEvent({
      tipo: nuevoEstado === ComandaItemEstado.CANCELADO ? 'CANCELADO' : 'ESTADO',
      comandaItemId: saved.id,
      ventaId: (ci as any).ventaItem?.venta?.id ?? null,
      sectorId: (ci as any).sector?.id ?? null,
      estado: nuevoEstado,
    });
  }
}

/**
 * Worker de auto-retry de comandas (cada 5s).
 *
 * Para cada venta ABIERTA que tenga al menos un `VentaItem` con
 * `impreso=false` y al menos un intento previo de impresión, reintenta
 * imprimir con `retryFailed=true`. El pre-flight del cliente LPR detecta
 * si la impresora sigue offline y aborta rápido sin generar ruido.
 *
 * Caso de uso: impresora apagada en el momento del envío original →
 * el item queda pendiente, este worker lo reintenta cada 5s hasta que la
 * impresora vuelva online.
 *
 * El worker llama con `silent: true` para NO emitir toasts en cada ciclo
 * (el envío original ya notificó una vez). Además hay un tope de reintentos
 * fallidos por item (`MAX_COMANDA_FAILED_RETRIES`) para no reintentar
 * indefinidamente cuando no hay impresora.
 */
const RETRY_INTERVAL_MS = 5_000;
let _retryComandaInterval: NodeJS.Timeout | null = null;
let _retryComandaRunning = false;

async function retryPendingComandas(dataSource: DataSource): Promise<void> {
  if (_retryComandaRunning) return;
  _retryComandaRunning = true;
  try {
    const pdvConfig = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
    if (!pdvConfig?.autoImprimirComanda) return;

    // Buscar IDs de ventas ABIERTAS con al menos 1 item pendiente con
    // intento previo (impresiones IS NOT NULL y JSON no vacío)
    const rows = await dataSource.getRepository(VentaItem)
      .createQueryBuilder('vi')
      .innerJoin('vi.venta', 'venta')
      .select('DISTINCT venta.id', 'venta_id')
      .where('vi.impreso = false')
      .andWhere('vi.impresiones IS NOT NULL')
      .andWhere(`LENGTH(vi.impresiones) > 2`)
      .andWhere('venta.estado = :estado', { estado: VentaEstado.ABIERTA })
      .getRawMany();

    for (const row of rows) {
      const ventaId = Number((row as any).venta_id);
      if (!ventaId) continue;
      try {
        const res = await printComandaInternal(dataSource, ventaId, {
          soloItemsNoImpresos: true,
          retryFailed: true,
          silent: true,
        });
        if (res.printed.length > 0) {
          console.log(`[retry-comanda venta=${ventaId}] reimpreso ${res.printed.length} item(s) tras retry`);
        }
      } catch (e: any) {
        console.warn(`[retry-comanda venta=${ventaId}] excepción:`, e?.message || e);
      }
    }
  } catch (e: any) {
    console.warn('[retry-comanda] excepción worker:', e?.message || e);
  } finally {
    _retryComandaRunning = false;
  }
}

export function startRetryComandaWorker(dataSource: DataSource): void {
  if (_retryComandaInterval) return; // ya iniciado
  _retryComandaInterval = setInterval(() => {
    retryPendingComandas(dataSource).catch(() => { /* ya logueado */ });
  }, RETRY_INTERVAL_MS);
}

export function stopRetryComandaWorker(): void {
  if (_retryComandaInterval) {
    clearInterval(_retryComandaInterval);
    _retryComandaInterval = null;
  }
}
