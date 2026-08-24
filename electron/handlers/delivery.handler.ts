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
import { DataSource } from 'typeorm';

import { Delivery, DeliveryEstado } from '../../src/app/database/entities/ventas/delivery.entity';
import { PrecioDelivery } from '../../src/app/database/entities/ventas/precio-delivery.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import {
  cancelarVentaCompletaEnTx,
  verificarVentaCancelable,
} from '../utils/venta-reversa.utils';
import { printDeliveryTicketInternal } from './documentos-tickets.handler';

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

    qb.orderBy('delivery.fecha_abierto', 'DESC')
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
    const direccion = upper(payload?.direccion);
    if (config?.deliveryRequiereDireccion && !direccion) {
      throw new Error('La dirección de entrega es obligatoria.');
    }
    if (!payload?.cajaId) throw new Error('No hay una caja abierta para registrar el delivery.');

    const costoDelivery = await resolverCostoDelivery(dataSource, payload?.precioDeliveryId);

    const resultado = await dataSource.transaction(async (manager) => {
      const delivery = manager.getRepository(Delivery).create({
        precioDelivery: payload?.precioDeliveryId ? ({ id: payload.precioDeliveryId } as any) : undefined,
        cliente: payload?.clienteId ? ({ id: payload.clienteId } as any) : undefined,
        nombre: upper(payload?.nombre) ?? undefined,
        telefono,
        direccion: direccion ?? undefined,
        observacion: upper(payload?.observacion) ?? undefined,
        estado: DeliveryEstado.ABIERTO,
        fechaAbierto: new Date(),
        cobroAnticipado: !!(payload?.cobroAnticipado ?? config?.deliveryCobroAnticipadoDefault),
      });
      await setEntityUserTracking(dataSource, delivery, usuarioId, false);
      const deliveryGuardado = await manager.save(Delivery, delivery);

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
      dispararImpresion(dataSource, resultado.delivery.id, 'delivery-crear');
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

    const delivery = await dataSource.getRepository(Delivery).findOne({
      where: { id },
      relations: ['precioDelivery'],
    });
    if (!delivery) throw new Error(`Delivery ${id} no encontrado`);
    if (delivery.estado === DeliveryEstado.CANCELADO || delivery.estado === DeliveryEstado.ENTREGADO) {
      throw new Error(`No se pueden editar los datos de un delivery ${delivery.estado}.`);
    }

    const direccion = upper(payload?.direccion);
    if (config?.deliveryRequiereDireccion && !direccion) {
      throw new Error('La dirección de entrega es obligatoria.');
    }

    const venta = await dataSource.getRepository(Venta).findOne({
      where: { delivery: { id } },
    });

    const zonaCambia = Object.prototype.hasOwnProperty.call(payload ?? {}, 'precioDeliveryId')
      && Number(payload.precioDeliveryId ?? 0) !== Number(delivery.precioDelivery?.id ?? 0);

    if (zonaCambia && venta && venta.estado !== VentaEstado.ABIERTA) {
      throw new Error(
        `La venta de este delivery ya está ${venta.estado}: no se puede cambiar la zona de entrega sin anular el cobro.`,
      );
    }

    const costoDelivery = zonaCambia
      ? await resolverCostoDelivery(dataSource, payload.precioDeliveryId)
      : undefined;

    return await dataSource.transaction(async (manager) => {
      delivery.nombre = upper(payload?.nombre) ?? undefined;
      delivery.telefono = String(payload?.telefono ?? delivery.telefono ?? '').trim();
      delivery.direccion = direccion ?? undefined;
      delivery.observacion = upper(payload?.observacion) ?? undefined;
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

      if (venta && costoDelivery !== undefined) {
        (venta as any).costoDelivery = costoDelivery;
        if (upper(payload?.nombre)) venta.nombreCliente = upper(payload?.nombre) ?? undefined;
        await setEntityUserTracking(dataSource, venta, usuarioId, true);
        await manager.save(Venta, venta);
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

      const delivery = await dataSource.getRepository(Delivery).findOne({ where: { id } });
      if (!delivery) throw new Error(`Delivery ${id} no encontrado`);

      if (delivery.estado === nuevoEstado) return delivery; // idempotente

      const permitidas = TRANSICIONES[delivery.estado] ?? [];
      if (!permitidas.includes(nuevoEstado)) {
        throw new Error(
          `Transición no permitida: ${delivery.estado} → ${nuevoEstado}.`
          + (delivery.estado === DeliveryEstado.CANCELADO
            ? ' Un delivery cancelado es definitivo; cargá uno nuevo.'
            : ` Desde ${delivery.estado} sólo se puede pasar a ${permitidas.join(', ') || '(ningún estado)'}.`),
        );
      }

      const venta = await dataSource.getRepository(Venta).findOne({ where: { delivery: { id } } });

      // Entregar exige que la venta esté cobrada: marcar ENTREGADO con la venta
      // ABIERTA deja un pedido en la calle que nadie va a cobrar nunca.
      if (nuevoEstado === DeliveryEstado.ENTREGADO && venta && venta.estado !== VentaEstado.CONCLUIDA) {
        throw new Error('No se puede marcar como ENTREGADO un delivery cuya venta todavía no fue cobrada.');
      }

      if (nuevoEstado === DeliveryEstado.EN_CAMINO) {
        const funcionarioId = opts?.funcionarioId;
        if (funcionarioId) {
          const funcionario = await dataSource.getRepository(Funcionario).findOneBy({ id: funcionarioId });
          if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);
          delivery.entregadoPorFuncionario = funcionario;
        } else if (config?.deliveryRequiereRepartidor && !delivery.entregadoPorFuncionario) {
          throw new Error('Seleccioná el repartidor antes de enviar el pedido.');
        }
      }

      aplicarTimestamps(delivery, nuevoEstado);
      delivery.estado = nuevoEstado;
      await setEntityUserTracking(dataSource, delivery, usuarioId, true);
      const guardado = await dataSource.getRepository(Delivery).save(delivery);

      if (nuevoEstado === DeliveryEstado.EN_CAMINO && config?.deliveryAutoImprimirAlEnviar) {
        dispararImpresion(dataSource, id, 'delivery-cambiar-estado');
      }

      return guardado;
    },
  );

  ipcMain.handle('delivery-asignar-repartidor', async (_event: any, id: number, funcionarioId: number | null) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const delivery = await dataSource.getRepository(Delivery).findOne({ where: { id } });
    if (!delivery) throw new Error(`Delivery ${id} no encontrado`);
    if (delivery.estado === DeliveryEstado.CANCELADO) {
      throw new Error('No se puede asignar repartidor a un delivery cancelado.');
    }

    if (funcionarioId) {
      const funcionario = await dataSource.getRepository(Funcionario).findOneBy({ id: funcionarioId });
      if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);
      delivery.entregadoPorFuncionario = funcionario;
    } else {
      (delivery as any).entregadoPorFuncionario = null;
    }
    await setEntityUserTracking(dataSource, delivery, getCurrentUser()?.id, true);
    return await dataSource.getRepository(Delivery).save(delivery);
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

    const delivery = await dataSource.getRepository(Delivery).findOne({ where: { id } });
    if (!delivery) throw new Error(`Delivery ${id} no encontrado`);
    if (delivery.estado === DeliveryEstado.CANCELADO) return delivery; // idempotente

    const motivoNormalizado = upper(motivo);
    if (!motivoNormalizado) throw new Error('Indicá el motivo de la cancelación.');

    const venta = await dataSource.getRepository(Venta).findOne({ where: { delivery: { id } } });

    if (venta?.estado === VentaEstado.CONCLUIDA) {
      await ensurePermission(dataSource, getCurrentUser, 'VENTAS_DELIVERY_CANCELAR_COBRADO');
    }
    if (venta) {
      // Pre-chequeo fuera de la transacción para poder rechazar con un mensaje
      // claro antes de tocar nada.
      await verificarVentaCancelable(dataSource.manager, venta.id);
    }

    const resultado = await dataSource.transaction(async (manager) => {
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
    return await printDeliveryTicketInternal(dataSource, id, { printerId });
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

/** Impresión best-effort: nunca bloquea ni revierte la operación que la disparó. */
function dispararImpresion(dataSource: DataSource, deliveryId: number, origen: string): void {
  setImmediate(() => {
    printDeliveryTicketInternal(dataSource, deliveryId, {})
      .catch((e) => console.warn(`[${origen}] auto-impresión del delivery ${deliveryId} falló:`, e));
  });
}

// Expuesto para los tests E2E, que verifican la tabla de transiciones sin
// tener que levantar el IPC.
export { TRANSICIONES as TRANSICIONES_DELIVERY };
