/**
 * Handlers del módulo de Delivery del PdV.
 *
 * POR QUÉ ESTE ARCHIVO EXISTE
 *
 * Hasta ahora el delivery se operaba con los CRUD genéricos de
 * `ventas.handler.ts` (`createDelivery` / `updateDelivery`), que son un
 * `repo.merge(entity, data)` sin validación. Toda la lógica de negocio —qué
 * transición de estado es legal, qué fechas limpiar, qué pasa con la venta al
 * cancelar— vivía en `delivery-dialog.component.ts`, es decir en el renderer.
 *
 * Eso es un problema real y no estético: `/api/rpc` es **default-allow**, así
 * que cualquier cliente con un JWT de `VENTAS_PDV` podía saltar de ABIERTO a
 * ENTREGADO, escribir un estado inexistente o falsear los timestamps. Y la
 * cancelación eran tres llamadas sueltas que podían fallar por la mitad y dejar
 * el delivery CANCELADO con la venta viva y cobrable.
 *
 * Acá la máquina de estados es del backend y las operaciones que tocan dinero
 * son transaccionales.
 *
 * Ver docs/DIAGNOSTICO-DELIVERY.md.
 */

import { ipcMain } from 'electron';
import { DataSource, EntityManager } from 'typeorm';

import { Delivery, DeliveryEstado, DeliveryModo } from '../../src/app/database/entities/ventas/delivery.entity';
import { PrecioDelivery } from '../../src/app/database/entities/ventas/precio-delivery.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { crearDeliveryEnTx } from '../utils/delivery-alta.utils';
import { resolveRequestDeviceId } from '../utils/current-device.utils';
import {
  cancelarVentaCompletaEnTx,
  verificarVentaCancelable,
} from '../utils/venta-reversa.utils';
import { printDeliveryTicketInternal } from './documentos-tickets.handler';
import { getEstadoCobroVentaInternal } from './ventas.handler';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { TipoPedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';

/**
 * Transiciones legales del delivery.
 *
 * CANCELADO no figura como destino a propósito: cancelar mueve plata (revierte
 * el cobro, el stock y la cuenta por cobrar) y tiene su propio handler con su
 * propio permiso. Tampoco figura como origen: **cancelar es terminal**.
 *
 * Reabrir un delivery cancelado era posible antes y estaba roto de raíz: la
 * reapertura ponía la venta en ABIERTA con el comentario "el stock se
 * re-procesará cuando la venta se finalice nuevamente", que no es cierto —
 * `revertirStockVenta` desactiva los `StockMovimiento` y nada los reactiva. Si
 * el cliente vuelve a pedir, se crea un delivery nuevo.
 */
const TRANSICIONES: Record<DeliveryEstado, DeliveryEstado[]> = {
  [DeliveryEstado.ABIERTO]: [DeliveryEstado.PARA_ENTREGA, DeliveryEstado.EN_CAMINO],
  [DeliveryEstado.PARA_ENTREGA]: [DeliveryEstado.EN_CAMINO, DeliveryEstado.ABIERTO],
  [DeliveryEstado.EN_CAMINO]: [DeliveryEstado.ENTREGADO, DeliveryEstado.PARA_ENTREGA],
  // Corrección de un click errado: la venta sigue CONCLUIDA, no se mueve plata.
  [DeliveryEstado.ENTREGADO]: [DeliveryEstado.EN_CAMINO],
  [DeliveryEstado.CANCELADO]: [],
};

/**
 * Un retiro no sale a ningún lado, así que `EN_CAMINO` no existe para él:
 * ABIERTO → PARA_ENTREGA (pronto en el mostrador) → ENTREGADO (se lo llevó).
 * Dejarlo pasar por EN_CAMINO sería ofrecer un estado que no significa nada y
 * que además dispara el candado del repartidor.
 */
const TRANSICIONES_RETIRO: Record<DeliveryEstado, DeliveryEstado[]> = {
  [DeliveryEstado.ABIERTO]: [DeliveryEstado.PARA_ENTREGA, DeliveryEstado.ENTREGADO],
  [DeliveryEstado.PARA_ENTREGA]: [DeliveryEstado.ENTREGADO, DeliveryEstado.ABIERTO],
  // Un retiro sólo llega a EN_CAMINO por conversión: es un reparto que ya
  // había salido y que el cliente terminó pasando a buscar. Ofrecerle
  // PARA_ENTREGA —igual que a un delivery— es lo que permite reflejar que el
  // repartidor dio la vuelta y el pedido volvió al mostrador. Sin esto, la
  // conversión le sacaba la única salida hacia atrás que tenía.
  [DeliveryEstado.EN_CAMINO]: [DeliveryEstado.ENTREGADO, DeliveryEstado.PARA_ENTREGA],
  [DeliveryEstado.ENTREGADO]: [DeliveryEstado.PARA_ENTREGA],
  [DeliveryEstado.CANCELADO]: [],
};

/** La tabla que rige según el modo. */
export function transicionesDe(modo?: string): Record<DeliveryEstado, DeliveryEstado[]> {
  return modo === 'RETIRO' ? TRANSICIONES_RETIRO : TRANSICIONES;
}

/** Estados en los que el delivery sigue vivo (no terminal). */
export const ESTADOS_DELIVERY_PENDIENTES = [
  DeliveryEstado.ABIERTO,
  DeliveryEstado.PARA_ENTREGA,
  DeliveryEstado.EN_CAMINO,
];

/** Campo de fecha que corresponde a cada estado. */
const FECHA_POR_ESTADO: Partial<Record<DeliveryEstado, keyof Delivery>> = {
  [DeliveryEstado.ABIERTO]: 'fechaAbierto',
  [DeliveryEstado.PARA_ENTREGA]: 'fechaParaEntrega',
  [DeliveryEstado.EN_CAMINO]: 'fechaEnCamino',
  [DeliveryEstado.ENTREGADO]: 'fechaEntregado',
};

/** Orden del avance, para saber qué timestamps quedan "por delante". */
const ORDEN_ESTADOS: DeliveryEstado[] = [
  DeliveryEstado.ABIERTO,
  DeliveryEstado.PARA_ENTREGA,
  DeliveryEstado.EN_CAMINO,
  DeliveryEstado.ENTREGADO,
];

async function getConfig(dataSource: DataSource): Promise<PdvConfig | null> {
  return await dataSource.getRepository(PdvConfig).findOne({ where: {} });
}

/**
 * Toma el lock de escritura sobre la fila del delivery, dentro de la
 * transacción del llamador.
 *
 * POR QUÉ ES UN `SELECT ... FOR UPDATE` A MANO Y NO `findOne({ lock })`
 *
 * El lock pesimista de TypeORM y las `relations` no conviven: la búsqueda con
 * relaciones arma LEFT JOINs y Postgres rechaza `FOR UPDATE` sobre el lado
 * anulable de un outer join. `delivery-cambiar-estado` puede usar
 * `findOne({ lock })` porque no carga ninguna relación; los handlers que sí
 * las necesitan usan esto y después leen normal — la fila ya está tomada.
 *
 * En SQLite no hace nada: la escritura serializa la base entera.
 */
async function lockDelivery(
  manager: EntityManager,
  dataSource: DataSource,
  id: number,
): Promise<void> {
  if (dataSource.options.type !== 'postgres') return;
  await manager.query('SELECT id FROM deliveries WHERE id = $1 FOR UPDATE', [id]);
}

/**
 * Monto del envío para una zona. Devuelve `null` para "sin cargo".
 *
 * `PrecioDelivery.valor` es `decimal`: en Postgres llega como **string** (no hay
 * `pg.types.setTypeParser(1700)` en el repo), así que el `Number()` no es
 * decorativo — sin él el monto se concatena en vez de sumarse.
 */
async function resolverCostoDelivery(
  dataSource: DataSource,
  precioDeliveryId: number | null | undefined,
): Promise<number | null> {
  if (!precioDeliveryId) return null;
  const precio = await dataSource.getRepository(PrecioDelivery).findOneBy({ id: precioDeliveryId });
  if (!precio) throw new Error(`Zona de delivery ${precioDeliveryId} no encontrada`);
  const valor = Number(precio.valor);
  return Number.isFinite(valor) ? valor : null;
}

/** Normaliza a UPPERCASE, devolviendo null para el string vacío. */
function upper(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s.toUpperCase() : null;
}

export function registerDeliveryHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
): void {
  // ─── Lectura ────────────────────────────────────────────────────────────

  /**
   * Lista para el diálogo del PdV.
   *
   * Trae los deliveries de la caja indicada MÁS los que siguen vivos en
   * cualquier otra caja (configurable). Antes se filtraba sólo por
   * `venta.caja_id`, así que un delivery EN_CAMINO sin cobrar desaparecía de la
   * pantalla al cerrar la caja: no había forma de verlo, cobrarlo ni cerrarlo.
   */
  ipcMain.handle('delivery-listar-pdv', async (_event: any, cajaId: number, filtros?: any) => {
    const config = await getConfig(dataSource);
    const pageSize = Number(filtros?.pageSize) || config?.deliveryPageSize || 20;
    const page = Number(filtros?.page) || 1;
    const incluirOtrasCajas = filtros?.incluirOtrasCajas ?? config?.deliveryMostrarPendientesOtrasCajas ?? true;

    const qb = dataSource.getRepository(Venta).createQueryBuilder('venta')
      .innerJoinAndSelect('venta.delivery', 'delivery')
      .leftJoinAndSelect('delivery.precioDelivery', 'precioDelivery')
      .leftJoinAndSelect('delivery.cliente', 'cliente')
      .leftJoinAndSelect('cliente.persona', 'persona')
      .leftJoinAndSelect('delivery.entregadoPorFuncionario', 'repartidor')
      .leftJoinAndSelect('repartidor.persona', 'repartidorPersona')
      .leftJoinAndSelect('venta.items', 'items')
      .leftJoinAndSelect('venta.pago', 'pago')
      // Sólo el id: alcanza para marcar los deliveries de otro turno y evita
      // arrastrar la caja entera por cada fila.
      .leftJoin('venta.caja', 'caja')
      .addSelect('caja.id');

    if (incluirOtrasCajas) {
      qb.where('(venta.caja_id = :cajaId OR delivery.estado IN (:...pendientes))', {
        cajaId,
        pendientes: ESTADOS_DELIVERY_PENDIENTES,
      });
    } else {
      qb.where('venta.caja_id = :cajaId', { cajaId });
    }

    if (filtros?.estado) {
      qb.andWhere('delivery.estado = :estado', { estado: filtros.estado });
    }

    // Propiedad de la entidad, no nombre de columna: con `skip`/`take` TypeORM
    // reescribe el ORDER BY contra el mapa de columnas y con el nombre crudo
    // revienta ("Cannot read properties of undefined (reading 'databaseName')").
    qb.orderBy('delivery.fechaAbierto', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [ventas, total] = await qb.getManyAndCount();

    const data = ventas.map((venta) => ({
      ...(venta.delivery as any),
      // Marca para la UI: este delivery viene de un turno anterior.
      otraCaja: Number((venta.caja as any)?.id ?? cajaId) !== Number(cajaId),
      venta: {
        id: venta.id,
        estado: venta.estado,
        items: venta.items,
        pago: venta.pago,
        costoDelivery: venta.costoDelivery == null ? null : Number(venta.costoDelivery),
        // Para el chip de canal de la lista: distingue el reparto que cargó el
        // cajero del que entró por la tienda online.
        canalOrigen: (venta as any).canalOrigen ?? 'LOCAL',
      },
    }));

    return { data, total };
  });

  /** Funcionarios elegibles como repartidor (activos, sin fecha de egreso). */
  ipcMain.handle('delivery-listar-repartidores', async () => {
    const funcionarios = await dataSource.getRepository(Funcionario).find({
      where: { activo: true },
      relations: ['persona', 'cargo'],
    });
    return funcionarios
      .filter((f) => !f.fechaEgreso)
      .map((f) => ({
        id: f.id,
        nombre: (f.persona as any)?.nombre || `FUNCIONARIO #${f.id}`,
        cargo: (f.cargo as any)?.nombre || null,
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  // ─── Alta ───────────────────────────────────────────────────────────────

  /**
   * Crea el delivery y su venta en UNA transacción.
   *
   * Antes eran dos llamadas desde el renderer (`createDelivery` y luego
   * `createVenta`). Si la segunda fallaba quedaba un `Delivery` sin venta, y
   * como la lista se arma partiendo de `Venta`, era un registro invisible e
   * inalcanzable para siempre.
   */
  ipcMain.handle('delivery-crear', async (_event: any, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const config = await getConfig(dataSource);
    const usuarioId = getCurrentUser()?.id;

    const telefono = String(payload?.telefono ?? '').trim();
    const minDigitos = config?.deliveryTelefonoMinDigitos ?? 4;
    if (telefono.length < minDigitos) {
      throw new Error(`El teléfono debe tener al menos ${minDigitos} dígitos.`);
    }
    // El cajero no sabe de antemano si el cliente va a pedir envío o pasar a
    // buscarlo, así que el alta es la misma y el modo se elige en el form.
    const esRetiro = String(payload?.modo ?? '').toUpperCase() === 'RETIRO';

    // En un retiro el nombre reemplaza a la dirección como dato imprescindible:
    // es lo que permite encontrar la bolsa entre otras cinco en el mostrador.
    if (esRetiro && !String(payload?.nombre ?? '').trim()) {
      throw new Error('El nombre del cliente es obligatorio para un retiro.');
    }

    // Dirección y costo de envío no existen en un retiro: exigir la primera
    // sería pedir un dato que nadie va a usar.
    const direccion = esRetiro ? undefined : upper(payload?.direccion);
    if (!esRetiro && config?.deliveryRequiereDireccion && !direccion) {
      throw new Error('La dirección de entrega es obligatoria.');
    }
    if (!payload?.cajaId) throw new Error('No hay una caja abierta para registrar el delivery.');

    const precioDeliveryId = esRetiro ? null : payload?.precioDeliveryId;
    const costoDelivery = esRetiro ? 0 : await resolverCostoDelivery(dataSource, precioDeliveryId);

    const resultado = await dataSource.transaction(async (manager) => {
      const deliveryGuardado = await crearDeliveryEnTx(manager, dataSource, {
        precioDeliveryId,
        clienteId: payload?.clienteId,
        nombre: payload?.nombre,
        telefono,
        direccion,
        observacion: payload?.observacion,
        modo: esRetiro ? DeliveryModo.RETIRO : DeliveryModo.DELIVERY,
        cobroAnticipado: payload?.cobroAnticipado ?? config?.deliveryCobroAnticipadoDefault,
      }, usuarioId);

      const venta = manager.getRepository(Venta).create({
        estado: VentaEstado.ABIERTA,
        caja: { id: payload.cajaId } as any,
        delivery: deliveryGuardado,
        cliente: payload?.clienteId ? ({ id: payload.clienteId } as any) : undefined,
        nombreCliente: upper(payload?.nombre) ?? undefined,
        costoDelivery,
      });
      await setEntityUserTracking(dataSource, venta, usuarioId, false);
      const ventaGuardada = await manager.save(Venta, venta);

      return { delivery: deliveryGuardado, venta: ventaGuardada };
    });

    if (config?.deliveryAutoImprimirAlCrear) {
      dispararImpresion(
        dataSource,
        resultado.delivery.id,
        'delivery-crear',
        resolveRequestDeviceId(_event) ?? undefined,
      );
    }

    return resultado;
  });

  // ─── Datos del pedido ───────────────────────────────────────────────────

  /**
   * Actualiza los datos del delivery (cliente, dirección, zona, observación).
   *
   * Si cambia la zona de entrega, **sincroniza `venta.costoDelivery`**. Antes el
   * diálogo mostraba un aviso ("el cambio de precio puede afectar el valor de
   * cobro final") que describía un comportamiento que no existía: cambiar la
   * zona no impactaba en ningún total.
   */
  ipcMain.handle('delivery-actualizar-datos', async (_event: any, id: number, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const config = await getConfig(dataSource);
    const usuarioId = getCurrentUser()?.id;

    // Todo dentro de la transacción y detrás del lock. Antes la lectura del
    // delivery vivía afuera y el `manager.save(Delivery, delivery)` de abajo
    // persistía la entidad ENTERA tal como se había leído — incluido `modo`.
    // Mientras el modo era inmutable eso no se notaba; desde que
    // `delivery-convertir-modo` existe, editar los datos en paralelo a una
    // conversión revertía la conversión en silencio y dejaba
    // `venta.costoDelivery` (que la conversión sí había cambiado) apuntando al
    // modo equivocado.
    return await dataSource.transaction(async (manager) => {
      await lockDelivery(manager, dataSource, id);

      const delivery = await manager.getRepository(Delivery).findOne({
        where: { id },
        relations: ['precioDelivery'],
      });
      if (!delivery) throw new Error(`Delivery ${id} no encontrado`);
      if (delivery.estado === DeliveryEstado.CANCELADO || delivery.estado === DeliveryEstado.ENTREGADO) {
        throw new Error(`No se pueden editar los datos de un delivery ${delivery.estado}.`);
      }

      const esRetiro = (delivery as any).modo === DeliveryModo.RETIRO;
      const direccion = upper(payload?.direccion);
      // El candado de la dirección es sobre el reparto: en un retiro no hay a
      // dónde llevar nada, y el nombre ya cumple el papel de identificar el
      // pedido. Sin este guard, una instalación con
      // `deliveryRequiereDireccion = true` no podía editar NINGÚN retiro.
      if (!esRetiro && config?.deliveryRequiereDireccion && !direccion) {
        throw new Error('La dirección de entrega es obligatoria.');
      }

      const venta = await manager.getRepository(Venta).findOne({
        where: { delivery: { id } },
      });

      const zonaCambia = Object.prototype.hasOwnProperty.call(payload ?? {}, 'precioDeliveryId')
        && Number(payload.precioDeliveryId ?? 0) !== Number(delivery.precioDelivery?.id ?? 0);

      if (zonaCambia && esRetiro) {
        throw new Error('Un pedido para retirar no tiene zona de entrega. Convertilo a delivery primero.');
      }
      if (zonaCambia && venta && venta.estado !== VentaEstado.ABIERTA) {
        throw new Error(
          `La venta de este delivery ya está ${venta.estado}: no se puede cambiar la zona de entrega sin anular el cobro.`,
        );
      }

      const costoDelivery = zonaCambia
        ? await resolverCostoDelivery(dataSource, payload.precioDeliveryId)
        : undefined;

      // `null` y no `undefined`: TypeORM no emite UPDATE para una propiedad
      // `undefined`, así que con el `?? undefined` de antes vaciar la
      // dirección (o el nombre, o la observación) desde el diálogo no hacía
      // absolutamente nada y el dato viejo quedaba pegado.
      (delivery as any).nombre = upper(payload?.nombre);
      delivery.telefono = String(payload?.telefono ?? delivery.telefono ?? '').trim();
      (delivery as any).direccion = esRetiro ? null : direccion;
      (delivery as any).observacion = upper(payload?.observacion);
      if (Object.prototype.hasOwnProperty.call(payload ?? {}, 'cobroAnticipado')) {
        delivery.cobroAnticipado = !!payload.cobroAnticipado;
      }
      if (payload?.clienteId) delivery.cliente = { id: payload.clienteId } as any;
      if (zonaCambia) {
        // Nulear una relación en TypeORM exige `null`, no `undefined`: con
        // `undefined` no se genera el UPDATE y la zona vieja queda pegada.
        (delivery as any).precioDelivery = payload.precioDeliveryId
          ? ({ id: payload.precioDeliveryId } as any)
          : null;
      }
      await setEntityUserTracking(dataSource, delivery, usuarioId, true);
      const guardado = await manager.save(Delivery, delivery);

      // El nombre y el costo se sincronizan por separado: antes el update del
      // `nombreCliente` estaba anidado dentro de la rama del costo, así que
      // corregir sólo el nombre dejaba la venta con el valor viejo.
      if (venta) {
        let ventaCambia = false;
        if (costoDelivery !== undefined) {
          (venta as any).costoDelivery = costoDelivery;
          ventaCambia = true;
        }
        const nombreNuevo = upper(payload?.nombre);
        if (nombreNuevo && nombreNuevo !== venta.nombreCliente) {
          venta.nombreCliente = nombreNuevo;
          ventaCambia = true;
        }
        if (ventaCambia) {
          await setEntityUserTracking(dataSource, venta, usuarioId, true);
          await manager.save(Venta, venta);
        }
      }

      return guardado;
    });
  });

  // ─── Máquina de estados ─────────────────────────────────────────────────

  ipcMain.handle(
    'delivery-cambiar-estado',
    async (_event: any, id: number, nuevoEstado: DeliveryEstado, opts?: { funcionarioId?: number }) => {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
      const config = await getConfig(dataSource);
      const usuarioId = getCurrentUser()?.id;

      if (!Object.values(DeliveryEstado).includes(nuevoEstado)) {
        throw new Error(`Estado de delivery inválido: ${nuevoEstado}`);
      }
      if (nuevoEstado === DeliveryEstado.CANCELADO) {
        throw new Error('Para cancelar un delivery usá la acción CANCELAR (revierte el cobro y el stock).');
      }

      // Todo el cambio de estado va en UNA transacción con lock pesimista en
      // Postgres: sin él, dos transiciones simultáneas sobre el mismo delivery
      // (dos cajeros, un doble tap) leen las dos el estado viejo, las dos pasan
      // la validación y gana la última — saltándose un estado intermedio sin
      // que la API devuelva nunca "Transición no permitida".
      const esPostgres = dataSource.options.type === 'postgres';
      return await dataSource.transaction(async (manager) => {
      const delivery = await manager.getRepository(Delivery).findOne({
        where: { id },
        ...(esPostgres ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      if (!delivery) throw new Error(`Delivery ${id} no encontrado`);

      if (delivery.estado === nuevoEstado) return delivery; // idempotente

      const permitidas = transicionesDe((delivery as any).modo)[delivery.estado] ?? [];
      if (!permitidas.includes(nuevoEstado)) {
        throw new Error(
          `Transición no permitida: ${delivery.estado} → ${nuevoEstado}.`
          + (delivery.estado === DeliveryEstado.CANCELADO
            ? ' Un delivery cancelado es definitivo; cargá uno nuevo.'
            : ` Desde ${delivery.estado} sólo se puede pasar a ${permitidas.join(', ') || '(ningún estado)'}.`),
        );
      }

      const venta = await manager.getRepository(Venta).findOne({ where: { delivery: { id } } });

      // Entregar exige que la venta esté cobrada: marcar ENTREGADO con la venta
      // ABIERTA deja un pedido en la calle que nadie va a cobrar nunca.
      if (nuevoEstado === DeliveryEstado.ENTREGADO && venta && venta.estado !== VentaEstado.CONCLUIDA) {
        throw new Error('No se puede marcar como ENTREGADO un delivery cuya venta todavía no fue cobrada.');
      }

      // El repartidor se puede registrar en cualquiera de las dos transiciones:
      // al enviar o al entregar. Si viene en el payload, se guarda siempre.
      const funcionarioId = opts?.funcionarioId;
      if (
        funcionarioId
        && (nuevoEstado === DeliveryEstado.EN_CAMINO || nuevoEstado === DeliveryEstado.ENTREGADO)
      ) {
        const funcionario = await manager.getRepository(Funcionario).findOneBy({ id: funcionarioId });
        if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);
        delivery.entregadoPorFuncionario = funcionario;
      }

      // Candado configurable: si el repartidor es bloqueante, la etapa en la que
      // bloquea la decide el local. Hay operaciones donde el pedido sale y recién
      // al volver se registra quién lo llevó — ahí el candado va en ENTREGADO.
      // El candado del repartidor es sobre quién LLEVA el pedido. En un retiro
      // nadie lo lleva: exigirlo sería pedir el nombre de una persona que no
      // participa.
      const esRetiro = (delivery as any).modo === 'RETIRO';
      if (!esRetiro && config?.deliveryRequiereRepartidor && !delivery.entregadoPorFuncionario) {
        const etapa = config.deliveryRepartidorEtapa || 'EN_CAMINO';
        if (etapa === 'EN_CAMINO' && nuevoEstado === DeliveryEstado.EN_CAMINO) {
          throw new Error('Seleccioná el repartidor antes de enviar el pedido.');
        }
        if (etapa === 'ENTREGADO' && nuevoEstado === DeliveryEstado.ENTREGADO) {
          throw new Error('Registrá quién entregó el pedido antes de finalizarlo.');
        }
      }

      aplicarTimestamps(delivery, nuevoEstado);
      delivery.estado = nuevoEstado;
      await setEntityUserTracking(dataSource, delivery, usuarioId, true);
      const guardado = await manager.save(Delivery, delivery);

      if (nuevoEstado === DeliveryEstado.EN_CAMINO && config?.deliveryAutoImprimirAlEnviar) {
        // Fuera de la transacción en la práctica: `setImmediate` corre después
        // del commit, y si la impresora falla no revierte el cambio de estado.
        dispararImpresion(
          dataSource,
          id,
          'delivery-cambiar-estado',
          resolveRequestDeviceId(_event) ?? undefined,
        );
      }

      return guardado;
      });
    },
  );

  /**
   * Reasigna el repartidor sin tocar el estado.
   *
   * Va en transacción con lock aunque toque un solo campo: el `save()` persiste
   * la entidad entera, así que corriendo en paralelo a `delivery-convertir-modo`
   * escribía de vuelta el `modo` que había leído antes y deshacía la conversión.
   */
  ipcMain.handle('delivery-asignar-repartidor', async (_event: any, id: number, funcionarioId: number | null) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    return await dataSource.transaction(async (manager) => {
      await lockDelivery(manager, dataSource, id);

      const delivery = await manager.getRepository(Delivery).findOne({ where: { id } });
      if (!delivery) throw new Error(`Delivery ${id} no encontrado`);
      if (delivery.estado === DeliveryEstado.CANCELADO) {
        throw new Error('No se puede asignar repartidor a un delivery cancelado.');
      }
      // El repartidor es quien LLEVA el pedido. En un retiro no lo lleva nadie:
      // asignarlo sería registrar a una persona que no participa, y el ticket y
      // el footer lo esconden igual. El front ya lo bloquea; acá se valida
      // porque `/api/rpc` es default-allow.
      if ((delivery as any).modo === DeliveryModo.RETIRO && funcionarioId) {
        throw new Error('Un pedido para retirar no tiene repartidor: lo pasa a buscar el cliente.');
      }

      if (funcionarioId) {
        const funcionario = await manager.getRepository(Funcionario).findOneBy({ id: funcionarioId });
        if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);
        delivery.entregadoPorFuncionario = funcionario;
      } else {
        (delivery as any).entregadoPorFuncionario = null;
      }
      await setEntityUserTracking(dataSource, delivery, getCurrentUser()?.id, true);
      return await manager.save(Delivery, delivery);
    });
  });

  // ─── Conversión de modo ─────────────────────────────────────────────────

  /**
   * Convierte un pedido de reparto en uno para retirar, y al revés.
   *
   * POR QUÉ ES UN CANAL PROPIO Y NO UN CAMPO MÁS DE `delivery-actualizar-datos`
   *
   * El modo no es un dato del cliente: es lo que decide **si existen** la
   * dirección, el costo de envío y el repartidor. Cambiarlo mueve el total de
   * la venta (el envío entra o sale del cobro), desasigna a una persona y
   * cambia la tabla de transiciones que rige el pedido. Un `merge` genérico no
   * puede hacer nada de eso, y por eso `updateDelivery` sigue teniendo `modo`
   * entre sus campos reservados.
   *
   * QUÉ SE PERMITE
   *
   * - Cualquier estado **no terminal**: ABIERTO, PARA_ENTREGA y EN_CAMINO. Un
   *   pedido ENTREGADO o CANCELADO ya no se convierte; el estado no se
   *   retrocede al convertir.
   * - Con la venta **ABIERTA**, aunque tenga cobros parciales registrados. Si
   *   lo ya cobrado supera el total nuevo, se devuelve una advertencia con el
   *   excedente: la plata no se mueve sola.
   * - Con la venta CONCLUIDA o CANCELADA se rechaza: cambiar el total de una
   *   venta cerrada es anular el cobro, y eso tiene su propio camino.
   */
  ipcMain.handle('delivery-convertir-modo', async (_event: any, id: number, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const config = await getConfig(dataSource);
    const usuarioId = getCurrentUser()?.id;

    const modoDestino = String(payload?.modo ?? '').toUpperCase();
    if (modoDestino !== DeliveryModo.DELIVERY && modoDestino !== DeliveryModo.RETIRO) {
      throw new Error(`Modo de pedido inválido: ${payload?.modo}. Usá DELIVERY o RETIRO.`);
    }
    const esRetiroDestino = modoDestino === DeliveryModo.RETIRO;

    const resultado = await dataSource.transaction(async (manager) => {
      await lockDelivery(manager, dataSource, id);

      const delivery = await manager.getRepository(Delivery).findOne({
        where: { id },
        relations: ['precioDelivery', 'entregadoPorFuncionario', 'entregadoPorFuncionario.persona'],
      });
      if (!delivery) throw new Error(`Delivery ${id} no encontrado`);

      const modoAnterior = ((delivery as any).modo ?? DeliveryModo.DELIVERY) as DeliveryModo;

      // El estado terminal se chequea ANTES que la idempotencia: convertir "al
      // mismo modo" un pedido CANCELADO tiene que fallar como cualquier otra
      // conversión sobre un cancelado, no devolver un éxito silencioso.
      if (delivery.estado === DeliveryEstado.ENTREGADO || delivery.estado === DeliveryEstado.CANCELADO) {
        throw new Error(
          `Un pedido ${delivery.estado} ya no se puede convertir.`
          + (delivery.estado === DeliveryEstado.ENTREGADO
            ? ' Si el pedido no se entregó, retrocedé el estado primero.'
            : ' Cargá uno nuevo.'),
        );
      }

      const venta = await manager.getRepository(Venta).findOne({ where: { delivery: { id } } });

      if (modoAnterior === modoDestino) {
        return { delivery, venta, modoAnterior, repartidorDesasignado: null, sinCambios: true };
      }

      if (venta && venta.estado !== VentaEstado.ABIERTA) {
        throw new Error(
          `La venta de este pedido ya está ${venta.estado}: convertirlo cambiaría el total cobrado.`
          + ' Anulá el cobro antes de convertir.',
        );
      }

      const repartidorPrevio = (delivery.entregadoPorFuncionario as any)?.persona?.nombre ?? null;
      let repartidorDesasignado: string | null = null;
      let costoDelivery = 0;

      if (esRetiroDestino) {
        // En un retiro el nombre reemplaza a la dirección como dato
        // imprescindible: es lo que permite encontrar la bolsa entre otras
        // cinco en el mostrador. Misma regla que el alta, validada acá porque
        // `/api/rpc` es default-allow.
        const nombre = upper(payload?.nombre) ?? upper(delivery.nombre);
        if (!nombre) {
          throw new Error('El nombre del cliente es obligatorio para un retiro.');
        }
        delivery.nombre = nombre;
        // `null` y no `undefined`: TypeORM no emite UPDATE para `undefined`, y
        // la dirección y la zona quedarían pegadas en un pedido que nadie
        // lleva a ningún lado.
        (delivery as any).direccion = null;
        (delivery as any).precioDelivery = null;
        if (delivery.entregadoPorFuncionario) {
          repartidorDesasignado = repartidorPrevio;
          (delivery as any).entregadoPorFuncionario = null;
        }
        costoDelivery = 0;
      } else {
        const direccion = upper(payload?.direccion) ?? upper(delivery.direccion);
        if (config?.deliveryRequiereDireccion && !direccion) {
          throw new Error('La dirección de entrega es obligatoria para convertir el pedido en delivery.');
        }
        (delivery as any).direccion = direccion;

        const precioDeliveryId = payload?.precioDeliveryId ?? null;
        (delivery as any).precioDelivery = precioDeliveryId ? ({ id: precioDeliveryId } as any) : null;
        costoDelivery = (await resolverCostoDelivery(dataSource, precioDeliveryId)) ?? 0;

        // El candado del repartidor sólo dispara EN la transición hacia
        // EN_CAMINO (o hacia ENTREGADO, según la etapa configurada). Un pedido
        // que YA está EN_CAMINO no vuelve a atravesar esa transición, así que
        // convertirlo en delivery —lo que lo deja sin repartidor— lo dejaría
        // llegar a ENTREGADO sin ninguno, con la config exigiéndolo. Es el
        // único hueco: desde ABIERTO o PARA_ENTREGA el pedido todavía tiene que
        // pasar por EN_CAMINO, y con la etapa en ENTREGADO el candado dispara
        // ahí, que la conversión no alcanza porque es terminal.
        const etapa = config?.deliveryRepartidorEtapa || 'EN_CAMINO';
        const funcionarioId = payload?.funcionarioId ?? null;
        if (
          config?.deliveryRequiereRepartidor
          && etapa === 'EN_CAMINO'
          && delivery.estado === DeliveryEstado.EN_CAMINO
          && !funcionarioId
        ) {
          throw new Error(
            'Este pedido ya está EN CAMINO: elegí el repartidor que lo lleva antes de convertirlo en delivery.',
          );
        }
        if (funcionarioId) {
          const funcionario = await manager.getRepository(Funcionario).findOneBy({ id: funcionarioId });
          if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);
          delivery.entregadoPorFuncionario = funcionario;
        }
      }

      (delivery as any).modo = modoDestino;
      await setEntityUserTracking(dataSource, delivery, usuarioId, true);
      const guardado = await manager.save(Delivery, delivery);

      let ventaGuardada = venta;
      if (venta) {
        (venta as any).costoDelivery = costoDelivery;
        if (delivery.nombre && delivery.nombre !== venta.nombreCliente) {
          venta.nombreCliente = delivery.nombre;
        }
        await setEntityUserTracking(dataSource, venta, usuarioId, true);
        ventaGuardada = await manager.save(Venta, venta);
      }

      // El pedido de la tienda tiene su propia copia de todo esto, y es la que
      // ve el cliente en el seguimiento. Sin sincronizarla, la pantalla del
      // cliente seguiría diciendo "retiro en local" con el pedido ya en la
      // calle.
      //
      // ⚠️ `zonaDelivery` es la zona de la TIENDA (polígonos) y `precioDelivery`
      // la del PdV: son entidades distintas y no hay mapa entre ellas, así que
      // al pasar a DELIVERY la zona online queda como está (normalmente nula) y
      // al pasar a RETIRO se limpia. La zona real queda igual en el delivery.
      const pedido = await manager.getRepository(PedidoOnline).findOne({ where: { deliveryId: id } });
      if (pedido) {
        pedido.tipoPedido = esRetiroDestino ? TipoPedidoOnline.PICKUP : TipoPedidoOnline.DELIVERY;
        (pedido as any).direccionEntrega = esRetiroDestino ? null : (delivery.direccion ?? null);
        if (esRetiroDestino) {
          (pedido as any).referenciaDireccion = null;
          (pedido as any).zonaDelivery = null;
        }
        // `subtotal` es `decimal`: en Postgres llega como string y sin
        // `Number()` el total se concatenaría en vez de sumarse.
        pedido.costoEnvio = costoDelivery;
        pedido.total = (Number(pedido.subtotal) || 0) + costoDelivery;
        await setEntityUserTracking(dataSource, pedido, usuarioId, true);
        await manager.save(PedidoOnline, pedido);
      }

      return {
        delivery: guardado,
        venta: ventaGuardada,
        modoAnterior,
        repartidorDesasignado,
        sinCambios: false,
      };
    });

    if (resultado.sinCambios) {
      return { ...resultado, advertencia: null };
    }

    // La advertencia se calcula DESPUÉS del commit y con la función que ya usa
    // el diálogo de cobro (`getEstadoCobroVentaInternal`): dentro de la
    // transacción leería los valores viejos, y reimplementar la cuenta acá
    // sería una segunda copia de la matemática de la plata.
    let advertencia: {
      excedente: number;
      totalCubierto: number;
      deudaBruta: number;
      tienePagoRegistrado: boolean;
    } | null = null;
    const ventaId = (resultado.venta as any)?.id;
    if (ventaId) {
      try {
        const estadoCobro = await getEstadoCobroVentaInternal(dataSource, ventaId);
        const ventaConPago = await dataSource.getRepository(Venta).findOne({
          where: { id: ventaId },
          relations: ['pago'],
        });
        const excedente = estadoCobro.totalCubierto - estadoCobro.deudaBruta;
        const tienePagoRegistrado = !!(ventaConPago as any)?.pago?.id;
        if (excedente > 0.5 || tienePagoRegistrado) {
          advertencia = {
            excedente: Math.max(0, excedente),
            totalCubierto: estadoCobro.totalCubierto,
            deudaBruta: estadoCobro.deudaBruta,
            tienePagoRegistrado,
          };
        }
      } catch (e) {
        // La conversión ya está confirmada: no poder calcular el aviso no la
        // deshace ni justifica un error al cajero.
        console.warn(`[delivery-convertir-modo] no se pudo calcular el aviso de cobro del delivery ${id}:`, e);
      }
    }

    return { ...resultado, advertencia };
  });

  // ─── Cancelación ────────────────────────────────────────────────────────

  /**
   * Cancela el delivery y revierte todo lo que su venta generó, en UNA
   * transacción: ítems, cobro (`PagoDetalle` + rondas de `CobroParcial`),
   * cuenta por cobrar y stock.
   *
   * Si la venta ya estaba CONCLUIDA se exige un permiso adicional: revertir un
   * cobro no es lo mismo que descartar un pedido que nunca se cobró.
   */
  ipcMain.handle('delivery-cancelar', async (_event: any, id: number, motivo?: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const usuarioId = getCurrentUser()?.id;

    const motivoNormalizado = upper(motivo);
    if (!motivoNormalizado) throw new Error('Indicá el motivo de la cancelación.');

    // Pre-chequeos fuera de la transacción, para poder rechazar con un mensaje
    // claro (y pedir el permiso extra) antes de tocar nada. La lectura que se
    // GUARDA es la de adentro: con `modo` mutable, persistir la entidad leída
    // acá revertiría una conversión concurrente.
    const previo = await dataSource.getRepository(Delivery).findOne({ where: { id } });
    if (!previo) throw new Error(`Delivery ${id} no encontrado`);
    if (previo.estado === DeliveryEstado.CANCELADO) return previo; // idempotente

    const ventaPrevia = await dataSource.getRepository(Venta).findOne({ where: { delivery: { id } } });

    if (ventaPrevia?.estado === VentaEstado.CONCLUIDA) {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_DELIVERY_CANCELAR_COBRADO');
    }
    if (ventaPrevia) {
      await verificarVentaCancelable(dataSource.manager, ventaPrevia.id);
    }

    const resultado = await dataSource.transaction(async (manager) => {
      await lockDelivery(manager, dataSource, id);

      const delivery = await manager.getRepository(Delivery).findOne({ where: { id } });
      if (!delivery) throw new Error(`Delivery ${id} no encontrado`);
      if (delivery.estado === DeliveryEstado.CANCELADO) return { delivery, reversa: null };

      // Se relee ya con el lock tomado: entre el pre-chequeo y acá la venta
      // pudo concluirse en otra terminal, y el permiso extra se pide sobre lo
      // que realmente se va a revertir.
      const venta = await manager.getRepository(Venta).findOne({ where: { delivery: { id } } });

      let reversa = null;
      if (venta) {
        reversa = await cancelarVentaCompletaEnTx(manager, dataSource, venta.id, {
          usuarioId,
          motivo: `CANCELACION DELIVERY #${id}: ${motivoNormalizado}`,
        });
      }

      delivery.estado = DeliveryEstado.CANCELADO;
      delivery.fechaCancelacion = new Date();
      delivery.motivoCancelacion = motivoNormalizado;
      await setEntityUserTracking(dataSource, delivery, usuarioId, true);
      const guardado = await manager.save(Delivery, delivery);

      return { delivery: guardado, reversa };
    });

    return resultado;
  });

  // ─── Impresión ──────────────────────────────────────────────────────────

  ipcMain.handle('delivery-imprimir-ticket', async (_event: any, id: number, printerId?: number) => {
    await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'DOCUMENTOS_IMPRIMIR_TICKET']);
    // Sin el dispositivo, `getPrinterByRol` no puede llegar a
    // `Dispositivo.printerTicket` y el ticket sale siempre por la impresora
    // marcada isDefault — el pedido de una caja se imprimía en la otra.
    const dispositivoId = resolveRequestDeviceId(_event) ?? undefined;
    return await printDeliveryTicketInternal(dataSource, id, { printerId, dispositivoId });
  });
}

/**
 * Ajusta los timestamps al entrar en un estado.
 *
 * Al avanzar se estampa la fecha del estado nuevo si no la tenía. Al retroceder
 * se limpian las fechas de los estados que quedan por delante, para que el
 * historial no afirme algo que no pasó. Esto vivía en el componente Angular.
 */
function aplicarTimestamps(delivery: Delivery, nuevoEstado: DeliveryEstado): void {
  const indiceNuevo = ORDEN_ESTADOS.indexOf(nuevoEstado);
  if (indiceNuevo < 0) return;

  const campo = FECHA_POR_ESTADO[nuevoEstado];
  if (campo && !(delivery as any)[campo]) {
    (delivery as any)[campo] = new Date();
  }

  // Limpiar lo que queda "por delante" del estado nuevo.
  for (let i = indiceNuevo + 1; i < ORDEN_ESTADOS.length; i++) {
    const posterior = FECHA_POR_ESTADO[ORDEN_ESTADOS[i]];
    if (posterior) (delivery as any)[posterior] = null;
  }
  (delivery as any).fechaCancelacion = null;
  (delivery as any).motivoCancelacion = null;
}

/**
 * Impresión best-effort: nunca bloquea ni revierte la operación que la disparó.
 *
 * `dispositivoId` viene resuelto por el caller: acá ya estamos dentro de un
 * `setImmediate` y no hay `_event` del que sacarlo.
 */
function dispararImpresion(
  dataSource: DataSource,
  deliveryId: number,
  origen: string,
  dispositivoId?: number,
): void {
  setImmediate(() => {
    printDeliveryTicketInternal(dataSource, deliveryId, { dispositivoId })
      .catch((e) => console.warn(`[${origen}] auto-impresión del delivery ${deliveryId} falló:`, e));
  });
}

// Expuesto para los tests E2E, que verifican la tabla de transiciones sin
// tener que levantar el IPC.
export { TRANSICIONES as TRANSICIONES_DELIVERY };
