import { ipcMain } from 'electron';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
import { cancelarCuotasAbiertasDeCpc } from '../utils/cpc-cuotas.utils';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import {
  CuentaPorCobrarEstado,
  CuentaPorCobrarTipo,
  CuentaPorCobrarCuotaEstado,
  MovimientoClienteTipo,
} from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { MovimientoBancarioTipo } from '../../src/app/database/entities/financiero/movimiento-bancario.entity';
import { registrarMovimientoBancario } from '../utils/movimiento-bancario.utils';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { PdvMesa } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { Pago } from '../../src/app/database/entities/compras/pago.entity';
import { PagoEstado } from '../../src/app/database/entities/compras/estado.enum';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { ensurePermission } from '../utils/auth.utils';
import { printVentaTicketInternal, printPagareCpcTicketInternal, imprimirFichasSiCorresponde } from './documentos-tickets.handler';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';
import { PagoOrigenTipo } from '../../src/app/database/entities/financiero/pago-consolidado-enums';
import { bloquearSiPagoConsolidado } from './pago-consolidado-guard';
import { assertTerminalPuedeOperar } from '../utils/terminal-caja.utils';
import { assertCajaAbiertaSiVino } from '../utils/caja-abierta.utils';
import { ajustarSaldoCliente, ajustarSaldoCuentaBancaria } from '../utils/saldo-atomico.utils';

function calcularEstadoCuota(monto: number, montoCobrado: number): CuentaPorCobrarCuotaEstado {
  if (montoCobrado >= monto) return CuentaPorCobrarCuotaEstado.COBRADO;
  if (montoCobrado > 0) return CuentaPorCobrarCuotaEstado.PARCIAL;
  return CuentaPorCobrarCuotaEstado.PENDIENTE;
}

const round2 = (v: number) => +Number(v).toFixed(2);

/**
 * Cancela una CPC sin cobrar, dentro de la transacción del llamador: estado
 * CANCELADO, cuotas abiertas a CANCELADO (#322/#347), baja `saldoActual` del
 * cliente y deja un `MovimientoCliente` AJUSTE_NEGATIVO. No toca caja ni banco.
 * La usan `cancelar-cuenta-por-cobrar` (de a una) y `cancelar-cpc-lote`.
 * El llamador ya validó que `montoCobrado = 0`.
 */
async function cancelarCpcEnTx(manager: EntityManager, cpc: CuentaPorCobrar, motivo: string, cu: Usuario | null | undefined): Promise<void> {
  const id = cpc.id;
  const montoOriginal = Number(cpc.montoTotal);
  cpc.estado = CuentaPorCobrarEstado.CANCELADO;
  cpc.fechaCancelacion = new Date();
  cpc.motivoCancelacion = motivo;
  await setEntityUserTracking(manager.connection, cpc, cu?.id, true);
  await manager.save(CuentaPorCobrar, cpc);

  // #322: las cuotas abiertas pasan a CANCELADO para que no sigan sumando
  // en resúmenes y vencidas (no hay cobros: se validó montoCobrado = 0).
  await cancelarCuotasAbiertasDeCpc(manager, id);

  const clienteId = cpc.cliente?.id;
  if (clienteId) {
    await ajustarSaldoCliente(manager, clienteId, -montoOriginal);
    const movRepo = manager.getRepository(MovimientoCliente);
    const mov = movRepo.create({
      cliente: { id: clienteId } as any,
      tipo: MovimientoClienteTipo.AJUSTE_NEGATIVO,
      monto: montoOriginal,
      fecha: new Date(),
      cuentaPorCobrarId: id,
      observacion: `CANCELACION CPC #${id} - ${motivo}`,
      registradoPor: cu || undefined,
    });
    await setEntityUserTracking(manager.connection, mov, cu?.id, false);
    await manager.save(MovimientoCliente, mov);
  }
}

/** Saldo del cliente según sus movimientos (la fórmula de `recalcular-saldo-cliente`). */
async function saldoPorMovimientos(manager: EntityManager, clienteId: number): Promise<number> {
  const movimientos = await manager.getRepository(MovimientoCliente).find({ where: { cliente: { id: clienteId } } });
  let total = 0;
  for (const m of movimientos) {
    if (m.tipo === MovimientoClienteTipo.CARGO || m.tipo === MovimientoClienteTipo.AJUSTE_POSITIVO) {
      total += Number(m.monto);
    } else if (m.tipo === MovimientoClienteTipo.PAGO || m.tipo === MovimientoClienteTipo.AJUSTE_NEGATIVO) {
      total -= Number(m.monto);
    }
  }
  return +total.toFixed(2);
}

/** Señal interna para deshacer la transacción de una fusión simulada. */
class SimulacionFusion extends Error {
  constructor(public resultado: any) { super('SIMULACION'); }
}

const CPC_LOTE_TOPE = 2000;

/** Señal interna para deshacer la transacción de una simulación. */
class SimulacionCpcLote extends Error {
  constructor(public resultado: any) { super('SIMULACION'); }
}

/**
 * Aplica un cobro a una cuota de CPC dentro de un cobro consolidado.
 *
 * NO toca caja ni banco: el asiento fisico vive en `pago-consolidado.handler.ts`,
 * que es el punto del motor consolidado. Aca vive solo el estado de dominio de la
 * deuda: cuota, CPC, saldo del cliente y cuenta corriente.
 *
 * `montoDescuento` es la porcion de `monto` que se condono (no entro plata por
 * ella). Se registra como un `AJUSTE_NEGATIVO` aparte del `PAGO` para que el
 * estado de cuenta pueda decir cuanto pago el cliente y cuanto se le perdono: los
 * dos bajan la deuda, pero no son lo mismo.
 *
 * Las filas de cuota / CPC / cliente ya vienen lockeadas por
 * `cobroClienteAdapter.leerYBloquear` en el orden cuota -> CPC -> cliente.
 */
export async function aplicarCobroConsolidadoCpc(
  queryRunner: any,
  cuotaId: number,
  monto: number,
  montoDescuento: number,
  pagoConsolidadoId: number,
  currentUser: Usuario | null,
  dataSource: DataSource,
): Promise<void> {
  const cuota = await queryRunner.manager.findOne(CuentaPorCobrarCuota, {
    where: { id: cuotaId },
    relations: ['cuentaPorCobrar'],
  });
  if (!cuota) throw new Error(`Cuota de cobro ${cuotaId} no encontrada`);

  cuota.montoCobrado = round2(Number(cuota.montoCobrado) + monto);
  cuota.estado = calcularEstadoCuota(Number(cuota.monto), Number(cuota.montoCobrado));
  if (cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO) cuota.fechaCobro = new Date();
  await setEntityUserTracking(dataSource, cuota, currentUser?.id, true);
  await queryRunner.manager.save(CuentaPorCobrarCuota, cuota);

  const cpc = await queryRunner.manager.findOne(CuentaPorCobrar, {
    where: { id: cuota.cuentaPorCobrar.id },
    relations: ['cuotas', 'cliente'],
  });
  if (!cpc) throw new Error('CuentaPorCobrar no encontrada');
  cpc.montoCobrado = round2(Number(cpc.montoCobrado) + monto);
  const todasCobradas = (cpc.cuotas || []).every((c: any) =>
    c.id === cuota.id
      ? cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO
      : Number(c.montoCobrado) >= Number(c.monto) - 0.005,
  );
  if (todasCobradas) cpc.estado = CuentaPorCobrarEstado.COBRADO;
  await setEntityUserTracking(dataSource, cpc, currentUser?.id, true);
  await queryRunner.manager.save(CuentaPorCobrar, cpc);

  const clienteId = cpc.cliente?.id;
  if (clienteId) {
    const cliente = await queryRunner.manager.findOne(Cliente, { where: { id: clienteId } });
    if (cliente) {
      // La deuda baja por el total: lo cobrado Y lo condonado.
      cliente.saldoActual = await ajustarSaldoCliente(queryRunner.manager, cliente.id, -monto);
    }

    const efectivo = round2(monto - montoDescuento);
    const crearMov = async (tipo: MovimientoClienteTipo, m: number, obs: string) => {
      const mov = queryRunner.manager.create(MovimientoCliente, {
        cliente: { id: clienteId } as any,
        tipo,
        monto: m,
        fecha: new Date(),
        cuentaPorCobrarId: cpc.id,
        cuentaPorCobrarCuotaId: cuota.id,
        pagoConsolidadoId,
        observacion: obs.slice(0, 255),
        registradoPor: currentUser || undefined,
      } as any);
      await setEntityUserTracking(dataSource, mov, currentUser?.id, false);
      await queryRunner.manager.save(MovimientoCliente, mov);
    };
    if (efectivo > 0) {
      await crearMov(MovimientoClienteTipo.PAGO, efectivo, `COBRO #${cuota.numero} - CPC #${cpc.id}`);
    }
    if (montoDescuento > 0) {
      await crearMov(
        MovimientoClienteTipo.AJUSTE_NEGATIVO,
        montoDescuento,
        `DESCUENTO CUOTA #${cuota.numero} - CPC #${cpc.id}`,
      );
    }
  }
}

/**
 * Deshace lo que hizo `aplicarCobroConsolidadoCpc` para una cuota.
 *
 * Marca como anulados TODOS los movimientos de cuenta corriente del evento para
 * esa cuota — son dos cuando hubo descuento (PAGO + AJUSTE_NEGATIVO), y el patron
 * `findOne(order: id DESC)` que usa la anulacion vieja revertiria uno solo — y
 * agrega un `AJUSTE_POSITIVO` compensatorio, porque el estado de cuenta suma
 * movimientos sin filtrar `anulado` y tiene que cuadrar con `cliente.saldoActual`.
 */
export async function revertirCobroConsolidadoCpc(
  queryRunner: any,
  cuotaId: number,
  monto: number,
  pagoConsolidadoId: number,
  currentUser: Usuario | null,
  dataSource: DataSource,
): Promise<void> {
  const cuota = await queryRunner.manager.findOne(CuentaPorCobrarCuota, {
    where: { id: cuotaId },
    relations: ['cuentaPorCobrar'],
  });
  if (!cuota) return;

  cuota.montoCobrado = round2(Math.max(0, Number(cuota.montoCobrado) - monto));
  cuota.estado = calcularEstadoCuota(Number(cuota.monto), Number(cuota.montoCobrado));
  if (cuota.montoCobrado <= 0) (cuota as any).fechaCobro = null;
  await setEntityUserTracking(dataSource, cuota, currentUser?.id, true);
  await queryRunner.manager.save(CuentaPorCobrarCuota, cuota);

  const cpc = await queryRunner.manager.findOne(CuentaPorCobrar, {
    where: { id: cuota.cuentaPorCobrar.id },
    relations: ['cliente'],
  });
  if (!cpc) return;
  cpc.montoCobrado = round2(Math.max(0, Number(cpc.montoCobrado) - monto));
  if (cpc.estado === CuentaPorCobrarEstado.COBRADO) cpc.estado = CuentaPorCobrarEstado.ACTIVO;
  await setEntityUserTracking(dataSource, cpc, currentUser?.id, true);
  await queryRunner.manager.save(CuentaPorCobrar, cpc);

  const clienteId = cpc.cliente?.id;
  if (!clienteId) return;

  const cliente = await queryRunner.manager.findOne(Cliente, { where: { id: clienteId } });
  if (cliente) {
    cliente.saldoActual = await ajustarSaldoCliente(queryRunner.manager, cliente.id, monto);
  }

  const originales = await queryRunner.manager.find(MovimientoCliente, {
    where: { pagoConsolidadoId, cuentaPorCobrarCuotaId: cuotaId, anulado: false },
  });
  for (const mov of originales) {
    mov.anulado = true;
    await queryRunner.manager.save(MovimientoCliente, mov);
  }

  const compensacion = queryRunner.manager.create(MovimientoCliente, {
    cliente: { id: clienteId } as any,
    tipo: MovimientoClienteTipo.AJUSTE_POSITIVO,
    monto,
    fecha: new Date(),
    cuentaPorCobrarId: cpc.id,
    cuentaPorCobrarCuotaId: cuotaId,
    pagoConsolidadoId,
    observacion: `ANULACION COBRO #${pagoConsolidadoId} - CUOTA #${cuota.numero}`.slice(0, 255),
    registradoPor: currentUser || undefined,
  } as any);
  await setEntityUserTracking(dataSource, compensacion, currentUser?.id, false);
  await queryRunner.manager.save(MovimientoCliente, compensacion);
}

export function registerCuentasPorCobrarHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {

  ipcMain.handle('get-cuentas-por-cobrar', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(CuentaPorCobrar);
      const qb = repo.createQueryBuilder('cpc')
        .leftJoinAndSelect('cpc.cliente', 'cliente')
        .leftJoinAndSelect('cliente.persona', 'persona')
        .leftJoinAndSelect('cpc.moneda', 'moneda')
        .orderBy('cpc.fechaInicio', 'DESC');

      if (filtros?.estado) qb.andWhere('cpc.estado = :estado', { estado: filtros.estado });
      if (filtros?.tipo) qb.andWhere('cpc.tipo = :tipo', { tipo: filtros.tipo });
      if (filtros?.clienteId) qb.andWhere('cpc.cliente_id = :cid', { cid: filtros.clienteId });
      // Filtro por nombre de cliente: razón social (empresa) o nombre+apellido
      // de la persona. Datos guardados en MAYÚSCULAS; UPPER() por portabilidad.
      if (filtros?.cliente) {
        const term = `%${String(filtros.cliente).trim().toUpperCase()}%`;
        qb.andWhere(
          '(UPPER(cliente.razon_social) LIKE :t OR UPPER(persona.nombre) LIKE :t OR UPPER(persona.apellido) LIKE :t)',
          { t: term },
        );
      }

      if (filtros?.pageSize != null) {
        const pageSize = Number(filtros.pageSize) || 15;
        const page = Math.max(0, Number(filtros.page) || 0);
        qb.skip(page * pageSize).take(pageSize);
        const [items, total] = await qb.getManyAndCount();
        return { items, total };
      }
      return await qb.getMany();
    } catch (error) {
      console.error('Error getting cuentas por cobrar:', error);
      throw error;
    }
  });

  ipcMain.handle('get-cuenta-por-cobrar', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(CuentaPorCobrar);
      return await repo.findOne({
        where: { id },
        relations: ['cliente', 'cliente.persona', 'moneda', 'cuotas'],
      });
    } catch (error) {
      console.error(`Error getting cuenta por cobrar ${id}:`, error);
      throw error;
    }
  });

  // CPC asociada a una venta (para reimprimir el pagaré desde el historial/PdV).
  ipcMain.handle('get-cpc-by-venta', async (_event, ventaId: number) => {
    try {
      const repo = dataSource.getRepository(CuentaPorCobrar);
      return await repo.findOne({
        where: { ventaId },
        relations: ['cliente', 'cliente.persona', 'moneda', 'cuotas'],
        order: { id: 'DESC' },
      });
    } catch (error) {
      console.error(`Error getting cpc for venta ${ventaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-cuenta-por-cobrar', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CPC_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cpcRepo = queryRunner.manager.getRepository(CuentaPorCobrar);
      const cuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
      const clienteRepo = queryRunner.manager.getRepository(Cliente);
      const movRepo = queryRunner.manager.getRepository(MovimientoCliente);

      const cantidadCuotas = Math.max(1, Number(data.cantidadCuotas) || 1);
      const frecuenciaDias = Number(data.frecuenciaDias) || 30;
      const fechaInicio = parseLocalDate(data.fechaInicio) || new Date();
      const montoTotal = Number(data.montoTotal);
      const montoCuota = +(montoTotal / cantidadCuotas).toFixed(2);
      const cu = getCurrentUser();

      const entity = cpcRepo.create({
        cliente: { id: data.clienteId } as any,
        tipo: data.tipo || CuentaPorCobrarTipo.OTRO,
        descripcion: data.descripcion?.toUpperCase() || null,
        montoTotal,
        montoCobrado: 0,
        moneda: { id: data.monedaId } as any,
        fechaInicio,
        cantidadCuotas,
        estado: CuentaPorCobrarEstado.ACTIVO,
        observacion: data.observacion?.toUpperCase() || null,
        ventaId: data.ventaId || null,
      });
      await setEntityUserTracking(dataSource, entity, cu?.id, false);
      const saved = await queryRunner.manager.save(CuentaPorCobrar, entity);
      const cpcSaved = Array.isArray(saved) ? saved[0] : saved;

      // Generar cuotas (frecuencia mensual por defecto o custom)
      for (let i = 0; i < cantidadCuotas; i++) {
        const venc = new Date(fechaInicio);
        if (frecuenciaDias === 30) {
          venc.setMonth(venc.getMonth() + i);
        } else {
          venc.setDate(venc.getDate() + frecuenciaDias * i);
        }
        const monto = (i === cantidadCuotas - 1)
          ? +(montoTotal - montoCuota * (cantidadCuotas - 1)).toFixed(2)
          : montoCuota;
        const cuota = cuotaRepo.create({
          cuentaPorCobrar: { id: cpcSaved.id } as any,
          numero: i + 1,
          fechaVencimiento: venc,
          monto,
          montoCobrado: 0,
          estado: CuentaPorCobrarCuotaEstado.PENDIENTE,
        });
        await setEntityUserTracking(dataSource, cuota, cu?.id, false);
        await queryRunner.manager.save(CuentaPorCobrarCuota, cuota);
      }

      // Crear MovimientoCliente tipo CARGO
      const movCargo = movRepo.create({
        cliente: { id: data.clienteId } as any,
        tipo: MovimientoClienteTipo.CARGO,
        monto: montoTotal,
        fecha: new Date(),
        cuentaPorCobrarId: cpcSaved.id,
        observacion: `CARGO CPC #${cpcSaved.id} - ${data.descripcion?.toUpperCase() || ''}`.trim(),
        registradoPor: cu || undefined,
      });
      await setEntityUserTracking(dataSource, movCargo, cu?.id, false);
      await queryRunner.manager.save(MovimientoCliente, movCargo);

      // Actualizar saldoActual del cliente (cargo = deuda con el restaurante)
      const cliente = await clienteRepo.findOne({ where: { id: data.clienteId } });
      if (cliente) {
        cliente.saldoActual = await ajustarSaldoCliente(queryRunner.manager, cliente.id, montoTotal);
      }

      await queryRunner.commitTransaction();
      return cpcSaved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating cuenta por cobrar:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('update-cuenta-por-cobrar', async (_event, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CPC_GESTIONAR');
      const repo = dataSource.getRepository(CuentaPorCobrar);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`CuentaPorCobrar ${id} no encontrada`);
      if (existing.estado !== CuentaPorCobrarEstado.ACTIVO) throw new Error('Solo se puede editar cuentas en estado ACTIVO');
      if (Number(existing.montoCobrado) > 0) throw new Error('No se puede editar una cuenta con cobros registrados');

      if (data.descripcion) existing.descripcion = data.descripcion.toUpperCase();
      if (data.observacion !== undefined) existing.observacion = data.observacion?.toUpperCase() || undefined;

      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating cuenta por cobrar ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('cancelar-cuenta-por-cobrar', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CPC_CANCELAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const id = payload.id || payload;
      const motivo: string = (payload.motivo || 'CANCELACION').toUpperCase();
      const cu = getCurrentUser();

      const cpcRepo = queryRunner.manager.getRepository(CuentaPorCobrar);

      const cpc = await cpcRepo.findOne({ where: { id }, relations: ['cliente'] });
      if (!cpc) throw new Error(`CuentaPorCobrar ${id} no encontrada`);
      if (Number(cpc.montoCobrado) > 0) throw new Error('No se puede cancelar una cuenta con cobros registrados');

      await cancelarCpcEnTx(queryRunner.manager, cpc, motivo, cu);

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error cancelando cuenta por cobrar:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  /**
   * Cancela en lote, sin cobrar y sin mover caja ni banco, las CPC ACTIVAS de
   * los clientes o ids indicados. Una sola transacción: si falla una, no queda
   * ninguna. Con `simular: true` corre lo mismo y deshace todo al final.
   * La real exige `esperado: { cantidad, total }` igual a lo que mostró la
   * simulación (total = suma de montos de las canceladas); si no coincide, aborta.
   */
  ipcMain.handle('cancelar-cpc-lote', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CPC_CANCELAR');
    const p = payload || {};
    const motivo = String(p.motivo || '').trim().toUpperCase();
    if (!motivo) throw new Error('Falta el motivo de la cancelación');
    const aIds = (v: any): number[] => (Array.isArray(v) ? v : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const clienteIds = aIds(p.clienteIds);
    const ids = aIds(p.ids);
    if (!clienteIds.length && !ids.length) throw new Error('Indicá clienteIds o ids');
    const simular = p.simular === true;
    if (!simular) {
      const e = p.esperado;
      if (!e || !Number.isFinite(Number(e.cantidad)) || !Number.isFinite(Number(e.total))) {
        throw new Error('Falta esperado: { cantidad, total } de la simulación');
      }
    }
    const cu = getCurrentUser();

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const m = queryRunner.manager;
      const porId = new Map<number, CuentaPorCobrar>();
      if (clienteIds.length) {
        for (const c of await m.find(CuentaPorCobrar, {
          where: { cliente: { id: In(clienteIds) }, estado: CuentaPorCobrarEstado.ACTIVO },
          relations: ['cliente', 'cliente.persona', 'moneda'], order: { id: 'ASC' },
        })) porId.set(c.id, c);
      }
      const saltadas: any[] = [];
      if (ids.length) {
        const encontradas = await m.find(CuentaPorCobrar, {
          where: { id: In(ids) }, relations: ['cliente', 'cliente.persona', 'moneda'],
        });
        const mapa = new Map(encontradas.map((c) => [c.id, c]));
        for (const id of ids) {
          const c = mapa.get(id);
          if (!c) saltadas.push({ id, clienteId: null, monto: 0, razon: 'NO_EXISTE' });
          else if (c.estado !== CuentaPorCobrarEstado.ACTIVO) saltadas.push({ id, clienteId: c.cliente?.id, monto: Number(c.montoTotal), razon: 'NO_ACTIVA' });
          else porId.set(c.id, c);
        }
      }
      // En Postgres se bloquean las filas y se releen estado y cobrado: si alguien
      // cobró o canceló mientras tanto, esa CPC va a saltadas.
      if (dataSource.options.type === 'postgres' && porId.size) {
        const filas: any[] = await m.query('SELECT id, estado, monto_cobrado FROM cuentas_por_cobrar WHERE id = ANY($1) FOR UPDATE', [[...porId.keys()]]);
        for (const f of filas) {
          const c = porId.get(Number(f.id))!;
          c.montoCobrado = Number(f.monto_cobrado);
          if (f.estado !== CuentaPorCobrarEstado.ACTIVO) {
            porId.delete(c.id);
            saltadas.push({ id: c.id, clienteId: c.cliente?.id, monto: Number(c.montoTotal), razon: 'NO_ACTIVA' });
          }
        }
      }
      const candidatas: CuentaPorCobrar[] = [];
      for (const c of [...porId.values()].sort((a, b) => a.id - b.id)) {
        if (Number(c.montoCobrado) > 0) saltadas.push({ id: c.id, clienteId: c.cliente?.id, monto: Number(c.montoTotal), montoCobrado: Number(c.montoCobrado), razon: 'CON_COBROS' });
        else candidatas.push(c);
      }
      if (candidatas.length > CPC_LOTE_TOPE) throw new Error(`Son ${candidatas.length} CPC: el tope por llamada es ${CPC_LOTE_TOPE}`);

      const total = round2(candidatas.reduce((s, c) => s + Number(c.montoTotal), 0));
      if (!simular && (Number(p.esperado.cantidad) !== candidatas.length || round2(Number(p.esperado.total)) !== total)) {
        throw new Error(`No coincide con la simulación: hoy son ${candidatas.length} CPC por ${total}, se esperaba ${p.esperado.cantidad} por ${p.esperado.total}. Volvé a simular.`);
      }

      const nombre = (c: CuentaPorCobrar) => {
        const pe: any = (c.cliente as any)?.persona;
        return pe ? [pe.nombre, pe.apellido].filter(Boolean).join(' ') : null;
      };
      const saldoDe = async (clienteId: number) => Number((await m.findOne(Cliente, { where: { id: clienteId } }))?.saldoActual ?? 0);
      const porCliente = new Map<number, any>();
      for (const c of candidatas) {
        const cid = c.cliente?.id;
        if (cid && !porCliente.has(cid)) porCliente.set(cid, { clienteId: cid, cliente: nombre(c), cantidad: 0, total: 0, saldoAntes: await saldoDe(cid), saldoDespues: 0 });
      }
      const porMoneda = new Map<number, any>();
      const canceladas: any[] = [];
      for (const c of candidatas) {
        await cancelarCpcEnTx(m, c, motivo, cu);
        const monto = Number(c.montoTotal);
        const monedaId = (c.moneda as any)?.id ?? null;
        canceladas.push({ id: c.id, clienteId: c.cliente?.id, cliente: nombre(c), monedaId, monto, descripcion: c.descripcion, fechaInicio: c.fechaInicio, ventaId: c.ventaId ?? null });
        const pc = porCliente.get(c.cliente?.id);
        if (pc) { pc.cantidad++; pc.total = round2(pc.total + monto); }
        const pm = porMoneda.get(monedaId) || { monedaId, total: 0, cantidad: 0 };
        pm.cantidad++; pm.total = round2(pm.total + monto);
        porMoneda.set(monedaId, pm);
      }
      for (const pc of porCliente.values()) pc.saldoDespues = await saldoDe(pc.clienteId);

      const resultado = {
        simulado: simular, motivo, cantidadCanceladas: canceladas.length, total,
        totalPorMoneda: [...porMoneda.values()], porCliente: [...porCliente.values()],
        canceladas, saltadas,
      };
      if (simular) throw new SimulacionCpcLote(resultado);
      await queryRunner.commitTransaction();
      return resultado;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof SimulacionCpcLote) return error.resultado;
      console.error('Error en cancelar-cpc-lote:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-cuenta-por-cobrar-cuotas', async (_event, cpcId: number) => {
    try {
      const repo = dataSource.getRepository(CuentaPorCobrarCuota);
      return await repo.find({
        where: { cuentaPorCobrar: { id: cpcId } },
        order: { numero: 'ASC' },
      });
    } catch (error) {
      console.error(`Error getting cuotas de cuenta por cobrar ${cpcId}:`, error);
      throw error;
    }
  });

  // COBRAR cuota de CPC (transaccional, espejo de pagar-cpp-cuota)
  ipcMain.handle('cobrar-cpc-cuota', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CPC_COBRAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cuotaId: number = payload.cuotaId;
      const montoCobrar: number = Number(payload.montoCobrar);
      const esBanco: boolean = payload.fuente === 'CUENTA_BANCARIA';
      const cajaMayorId: number = payload.cajaMayorId;
      const monedaId: number = payload.monedaId;
      const formaPagoId: number = payload.formaPagoId;
      const cuentaBancariaId: number = payload.cuentaBancariaId;
      // Monto acreditado en la moneda de la cuenta (si difiere, viene convertido).
      const montoBanco: number = Number(payload.montoCuentaBancaria) > 0 ? Number(payload.montoCuentaBancaria) : montoCobrar;
      const cotizacionPago: number | null = payload.cotizacion ? Number(payload.cotizacion) : null;
      const observacion: string = (payload.observacion || '').toUpperCase();
      const fecha: Date = payload.fecha ? new Date(payload.fecha) : new Date();
      const cu = getCurrentUser();

      if (esBanco) {
        if (!cuentaBancariaId) throw new Error('Falta la cuenta bancaria para el cobro');
      } else if (!cajaMayorId || !monedaId || !formaPagoId) {
        throw new Error('Faltan datos para cobro desde caja mayor');
      }

      const cuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
      const cpcRepo = queryRunner.manager.getRepository(CuentaPorCobrar);
      const clienteRepo = queryRunner.manager.getRepository(Cliente);
      const movRepo = queryRunner.manager.getRepository(MovimientoCliente);

      const cuota = await cuotaRepo.findOne({
        where: { id: cuotaId },
        relations: ['cuentaPorCobrar'],
      });
      if (!cuota) throw new Error(`CuentaPorCobrarCuota ${cuotaId} no encontrada`);
      if (cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO || cuota.estado === CuentaPorCobrarCuotaEstado.CANCELADO) {
        throw new Error('Cuota ya cobrada o cancelada');
      }
      if ((cuota.cuentaPorCobrar as any)?.estado === CuentaPorCobrarEstado.CANCELADO) {
        throw new Error('La cuenta por cobrar está cancelada');
      }

      const restante = Number(cuota.monto) - Number(cuota.montoCobrado);
      if (montoCobrar <= 0 || montoCobrar > restante + 0.005) {
        throw new Error(`Monto inválido (restante: ${restante})`);
      }

      // Actualizar cuota
      cuota.montoCobrado = +(Number(cuota.montoCobrado) + montoCobrar).toFixed(2);
      cuota.estado = calcularEstadoCuota(Number(cuota.monto), Number(cuota.montoCobrado));
      if (cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO) {
        cuota.fechaCobro = new Date();
      }
      await setEntityUserTracking(dataSource, cuota, cu?.id, true);
      await queryRunner.manager.save(CuentaPorCobrarCuota, cuota);

      // Actualizar CuentaPorCobrar
      const cpc = await cpcRepo.findOne({
        where: { id: cuota.cuentaPorCobrar.id },
        relations: ['cuotas', 'cliente'],
      });
      if (!cpc) throw new Error('CuentaPorCobrar no encontrada');

      cpc.montoCobrado = +(Number(cpc.montoCobrado) + montoCobrar).toFixed(2);
      const todasCobradas = (cpc.cuotas || []).every((c: any) =>
        c.id === cuota.id
          ? cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO
          : Number(c.montoCobrado) >= Number(c.monto) - 0.005
      );
      if (todasCobradas) cpc.estado = CuentaPorCobrarEstado.COBRADO;
      await setEntityUserTracking(dataSource, cpc, cu?.id, true);
      await queryRunner.manager.save(CuentaPorCobrar, cpc);

      // Obtener razon social del cliente
      const clienteId = cpc.cliente?.id;
      const cliente = clienteId ? await clienteRepo.findOne({ where: { id: clienteId }, relations: ['persona'] }) : null;
      const clienteLabel = cliente?.razon_social || cliente?.persona?.nombre || `CLIENTE #${clienteId}`;

      const obsBase = `COBRO #${cuota.numero} - CPC #${cpc.id} - ${clienteLabel}`;

      // Registrar el ingreso: si es por banco, acredita la cuenta y NO genera
      // movimiento de Caja Mayor; si es caja mayor, crea el movimiento de caja.
      let savedMovCMId: number | undefined;
      if (esBanco) {
        const cb = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: cuentaBancariaId } });
        if (!cb) throw new Error(`Cuenta bancaria ${cuentaBancariaId} no encontrada`);
        cb.saldo = await ajustarSaldoCuentaBancaria(queryRunner.manager, cb.id, montoBanco);
        await registrarMovimientoBancario(queryRunner.manager, dataSource, {
          cuentaBancariaId,
          tipo: MovimientoBancarioTipo.ENTRADA_MANUAL,
          monto: montoBanco,
          observacion: observacion ? `${obsBase} — ${observacion}` : obsBase,
          responsable: cu,
        });
      } else {
        const movCM = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId } as any,
          tipoMovimiento: TipoMovimiento.INGRESO_COBRO_CLIENTE,
          moneda: { id: monedaId } as any,
          formaPago: { id: formaPagoId } as any,
          monto: montoCobrar,
          fecha,
          observacion: observacion ? `${obsBase} — ${observacion}` : obsBase,
          cuentaPorCobrarCuotaId: cuota.id,
          responsable: cu || undefined,
        } as any);
        await setEntityUserTracking(dataSource, movCM, cu?.id, false);
        const savedMovCM = await queryRunner.manager.save(CajaMayorMovimiento, movCM);
        savedMovCMId = savedMovCM.id;

        // Actualizar saldo caja mayor
        await actualizarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, montoCobrar, TipoMovimiento.INGRESO_COBRO_CLIENTE);
      }

      // Actualizar saldoActual del cliente (cobro reduce la deuda)
      if (cliente) {
        cliente.saldoActual = await ajustarSaldoCliente(queryRunner.manager, cliente.id, -montoCobrar);
      }

      // Crear MovimientoCliente tipo PAGO
      const movCliente = movRepo.create({
        cliente: { id: clienteId } as any,
        tipo: MovimientoClienteTipo.PAGO,
        monto: montoCobrar,
        fecha,
        cuentaPorCobrarId: cpc.id,
        cuentaPorCobrarCuotaId: cuota.id,
        cajaMayorMovimientoId: savedMovCMId,
        cuentaBancariaId: esBanco ? cuentaBancariaId : undefined,
        montoCuentaBancaria: esBanco ? montoBanco : undefined,
        cotizacion: esBanco && cotizacionPago ? cotizacionPago : undefined,
        observacion: obsBase,
        registradoPor: cu || undefined,
      });
      await setEntityUserTracking(dataSource, movCliente, cu?.id, false);
      await queryRunner.manager.save(MovimientoCliente, movCliente);

      await queryRunner.commitTransaction();
      return { success: true, cuota };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error cobrando cuota CPC:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-cobro-cpc-cuota', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CPC_CANCELAR');
    // Una cuota cobrada dentro de un cobro consolidado no se revierte por este
    // camino: la reversa tiene que deshacer el evento entero (todas las cuotas y
    // todos los movimientos). Si no, la misma plata vuelve dos veces.
    await bloquearSiPagoConsolidado(
      dataSource, PagoOrigenTipo.CPC_CUOTA, Number(payload?.cuotaId), `La cuota #${payload?.cuotaId}`,
    );
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cuotaId: number = payload.cuotaId;
      const motivo: string = (payload.motivo || 'ANULACION').toUpperCase();
      const cu = getCurrentUser();

      const cuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
      const cpcRepo = queryRunner.manager.getRepository(CuentaPorCobrar);
      const clienteRepo = queryRunner.manager.getRepository(Cliente);
      const movCMRepo = queryRunner.manager.getRepository(CajaMayorMovimiento);
      const movClienteRepo = queryRunner.manager.getRepository(MovimientoCliente);

      const cuota = await cuotaRepo.findOne({
        where: { id: cuotaId },
        relations: ['cuentaPorCobrar'],
      });
      if (!cuota) throw new Error(`Cuota ${cuotaId} no encontrada`);

      const montoCobrado = Number(cuota.montoCobrado);
      if (montoCobrado <= 0) throw new Error('La cuota no tiene cobros que anular');

      // Detectar si el último cobro fue acreditado a una cuenta bancaria.
      const ultimoPago = await movClienteRepo.findOne({
        where: { cuentaPorCobrarCuotaId: cuotaId, tipo: MovimientoClienteTipo.PAGO },
        order: { id: 'DESC' },
      });
      if (ultimoPago?.cuentaBancariaId) {
        // Idempotencia (M-01): si este cobro ya fue revertido, no volver a
        // ajustar saldos. Sin esta marca, una segunda llamada reencontraba el
        // mismo PAGO y revertía de nuevo la cuenta/cuota/cpc/cliente.
        if ((ultimoPago as any).anulado) {
          throw new Error('El cobro ya fue anulado');
        }
        // Reversión bancaria: debita la cuenta (en SU moneda) y revierte cuota/cpc/cliente
        // por el monto del cobro (en la moneda de la CPC).
        const montoAnuladoBanco = Number(ultimoPago.monto);
        const montoBancoRevertir = Number(ultimoPago.montoCuentaBancaria) > 0 ? Number(ultimoPago.montoCuentaBancaria) : montoAnuladoBanco;
        const cb = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: ultimoPago.cuentaBancariaId } });
        if (cb) {
          cb.saldo = await ajustarSaldoCuentaBancaria(queryRunner.manager, cb.id, -montoBancoRevertir);
          await registrarMovimientoBancario(queryRunner.manager, dataSource, {
            cuentaBancariaId: ultimoPago.cuentaBancariaId,
            tipo: MovimientoBancarioTipo.AJUSTE_NEGATIVO,
            monto: montoBancoRevertir,
            observacion: `ANULACION COBRO CPC CUOTA #${cuotaId} - ${motivo}`,
            responsable: cu,
          });
        }

        cuota.montoCobrado = +(Math.max(0, Number(cuota.montoCobrado) - montoAnuladoBanco)).toFixed(2);
        cuota.estado = calcularEstadoCuota(Number(cuota.monto), Number(cuota.montoCobrado));
        if (cuota.montoCobrado <= 0) cuota.fechaCobro = null as any;
        await setEntityUserTracking(dataSource, cuota, cu?.id, true);
        await queryRunner.manager.save(CuentaPorCobrarCuota, cuota);

        const cpcB = await cpcRepo.findOne({ where: { id: cuota.cuentaPorCobrar.id }, relations: ['cliente'] });
        if (cpcB) {
          cpcB.montoCobrado = +(Math.max(0, Number(cpcB.montoCobrado) - montoAnuladoBanco)).toFixed(2);
          if (cpcB.estado === CuentaPorCobrarEstado.COBRADO) cpcB.estado = CuentaPorCobrarEstado.ACTIVO;
          await setEntityUserTracking(dataSource, cpcB, cu?.id, true);
          await queryRunner.manager.save(CuentaPorCobrar, cpcB);

          const clienteIdB = cpcB.cliente?.id;
          if (clienteIdB) {
            const clienteB = await clienteRepo.findOne({ where: { id: clienteIdB } });
            if (clienteB) {
              clienteB.saldoActual = await ajustarSaldoCliente(queryRunner.manager, clienteB.id, montoAnuladoBanco);
            }
            const movAjusteB = movClienteRepo.create({
              cliente: { id: clienteIdB } as any,
              tipo: MovimientoClienteTipo.AJUSTE_NEGATIVO,
              monto: montoAnuladoBanco,
              fecha: new Date(),
              cuentaPorCobrarId: cpcB.id,
              cuentaPorCobrarCuotaId: cuotaId,
              cuentaBancariaId: ultimoPago.cuentaBancariaId,
              observacion: `ANULACION COBRO CPC #${cpcB.id} CUOTA #${cuota.numero} (BANCO) - ${motivo}`,
              registradoPor: cu || undefined,
            });
            await setEntityUserTracking(dataSource, movAjusteB, cu?.id, false);
            await queryRunner.manager.save(MovimientoCliente, movAjusteB);
          }
        }

        // Marcar el PAGO como revertido para que la anulación sea idempotente (M-01).
        (ultimoPago as any).anulado = true;
        await queryRunner.manager.save(MovimientoCliente, ultimoPago);

        await queryRunner.commitTransaction();
        return { success: true };
      }

      // Buscar el último movimiento de caja mayor vinculado a esta cuota
      const ultimoMovCM = await movCMRepo.findOne({
        where: { cuentaPorCobrarCuotaId: cuotaId },
        order: { id: 'DESC' },
      });
      if (!ultimoMovCM) throw new Error('No se encontró movimiento de caja para anular');
      if (ultimoMovCM.referenciaAnulacion) throw new Error('El cobro ya fue anulado');

      // Anular el movimiento de caja
      const movAnulacion = queryRunner.manager.create(CajaMayorMovimiento, {
        cajaMayor: { id: (ultimoMovCM as any).cajaMayor?.id || ultimoMovCM.cajaMayor } as any,
        tipoMovimiento: TipoMovimiento.ANULACION,
        moneda: { id: (ultimoMovCM as any).moneda?.id || ultimoMovCM.moneda } as any,
        formaPago: { id: (ultimoMovCM as any).formaPago?.id || ultimoMovCM.formaPago } as any,
        monto: ultimoMovCM.monto,
        fecha: new Date(),
        observacion: `ANULACION COBRO CPC #${cuota.cuentaPorCobrar?.id} CUOTA #${cuota.numero} - ${motivo}`,
        referenciaAnulacion: ultimoMovCM,
        responsable: cu || undefined,
      } as any);
      await setEntityUserTracking(dataSource, movAnulacion, cu?.id, false);
      const savedAnulacion = await queryRunner.manager.save(CajaMayorMovimiento, movAnulacion);

      // Recargar caja mayor IDs correctamente
      const cajaMayorIdAnul = (ultimoMovCM as any).cajaMayor?.id || (ultimoMovCM as any).cajaMayorId;
      const monedaIdAnul = (ultimoMovCM as any).moneda?.id || (ultimoMovCM as any).monedaId;
      const formaPagoIdAnul = (ultimoMovCM as any).formaPago?.id || (ultimoMovCM as any).formaPagoId;

      await actualizarSaldoCajaMayor(queryRunner, cajaMayorIdAnul, monedaIdAnul, formaPagoIdAnul, Number(ultimoMovCM.monto), TipoMovimiento.ANULACION);

      // Revertir cuota
      const montoAnulado = Number(ultimoMovCM.monto);
      cuota.montoCobrado = +(Math.max(0, Number(cuota.montoCobrado) - montoAnulado)).toFixed(2);
      cuota.estado = calcularEstadoCuota(Number(cuota.monto), Number(cuota.montoCobrado));
      if (cuota.montoCobrado <= 0) cuota.fechaCobro = null as any;
      await setEntityUserTracking(dataSource, cuota, cu?.id, true);
      await queryRunner.manager.save(CuentaPorCobrarCuota, cuota);

      // Revertir CPC
      const cpc = await cpcRepo.findOne({ where: { id: cuota.cuentaPorCobrar.id }, relations: ['cliente'] });
      if (cpc) {
        cpc.montoCobrado = +(Math.max(0, Number(cpc.montoCobrado) - montoAnulado)).toFixed(2);
        if (cpc.estado === CuentaPorCobrarEstado.COBRADO) cpc.estado = CuentaPorCobrarEstado.ACTIVO;
        await setEntityUserTracking(dataSource, cpc, cu?.id, true);
        await queryRunner.manager.save(CuentaPorCobrar, cpc);

        // Revertir saldo cliente
        const clienteId = cpc.cliente?.id;
        if (clienteId) {
          const cliente = await clienteRepo.findOne({ where: { id: clienteId } });
          if (cliente) {
            cliente.saldoActual = await ajustarSaldoCliente(queryRunner.manager, cliente.id, montoAnulado);
          }

          // Crear MovimientoCliente AJUSTE_NEGATIVO
          const movAjuste = movClienteRepo.create({
            cliente: { id: clienteId } as any,
            tipo: MovimientoClienteTipo.AJUSTE_NEGATIVO,
            monto: montoAnulado,
            fecha: new Date(),
            cuentaPorCobrarId: cpc.id,
            cuentaPorCobrarCuotaId: cuotaId,
            cajaMayorMovimientoId: savedAnulacion.id,
            observacion: `ANULACION COBRO CPC #${cpc.id} CUOTA #${cuota.numero} - ${motivo}`,
            registradoPor: cu || undefined,
          });
          await setEntityUserTracking(dataSource, movAjuste, cu?.id, false);
          await queryRunner.manager.save(MovimientoCliente, movAjuste);
        }
      }

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error anulando cobro CPC:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('recalcular-saldo-cliente', async (_event, clienteId: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'CPC_GESTIONAR');
      // #350: lock del cliente ANTES de sumar los movimientos, y en la misma
      // transacción que el UPDATE. Un cobro concurrente toma el mismo lock al
      // ajustar el saldo (#190), así que o entra antes (y su movimiento se
      // suma) o espera a que termine el recálculo (y su delta se aplica sobre
      // el saldo nuevo). Antes se sumaba sin lock y un `save()` escribía un
      // saldo que podía no incluir ese cobro.
      const saldo = await dataSource.transaction(async (manager) => {
        const pg = (manager.connection.options.type as string) === 'postgres';
        // SQLite: no hay FOR UPDATE; las transacciones de los cobros se serializan
        // en la única conexión (una escritura suelta podría colarse, como en el
        // resto de la app).
        const lock = pg
          ? await manager.query('SELECT id FROM clientes WHERE id = $1 FOR UPDATE', [Number(clienteId)])
          : await manager.query('SELECT id FROM clientes WHERE id = ?', [Number(clienteId)]);
        if (!lock?.length) return null;

        const total = await saldoPorMovimientos(manager, clienteId);
        // UPDATE de la columna sola (no `save()` del cliente entero).
        await manager.update(Cliente, { id: clienteId }, { saldoActual: total });
        return total;
      });
      return { success: true, saldoRecalculado: saldo ?? 0 };
    } catch (error) {
      console.error(`Error recalculando saldo cliente ${clienteId}:`, error);
      throw error;
    }
  });

  /**
   * Une dos fichas de la misma persona: pasa al destino las CPC (con sus cuotas),
   * los movimientos y las ventas del origen, lo deja en los convenios del origen,
   * recalcula los dos saldos y desactiva el origen. Una sola transacción.
   * Con `simular: true` corre todo y deshace al final; la real exige
   * `esperado: { saldoDestino }` igual al de la simulación. Devuelve `respaldo`
   * (ids movidos y estado previo) para poder volver atrás.
   */
  ipcMain.handle('fusionar-clientes', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'CPC_GESTIONAR');
    const p = payload || {};
    const origenId = Number(p.origenId);
    const destinoId = Number(p.destinoId);
    if (!Number.isInteger(origenId) || origenId <= 0 || !Number.isInteger(destinoId) || destinoId <= 0) {
      throw new Error('Indicá origenId y destinoId');
    }
    if (origenId === destinoId) throw new Error('El origen y el destino son el mismo cliente');
    const simular = p.simular === true;
    if (!simular && !Number.isFinite(Number(p.esperado?.saldoDestino))) {
      throw new Error('Falta esperado: { saldoDestino } de la simulación');
    }
    const motivo = String(p.motivo || '').trim().toUpperCase() || null;

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const m = queryRunner.manager;
      const pg = (dataSource.options.type as string) === 'postgres';
      const ph = (i: number) => (pg ? `$${i}` : '?');
      // Mismo lock que los cobros (#190/#350): un cobro concurrente espera.
      if (pg) await m.query('SELECT id FROM clientes WHERE id = ANY($1) ORDER BY id FOR UPDATE', [[origenId, destinoId]]);

      const ficha = async (id: number) => {
        const c = await m.findOne(Cliente, { where: { id }, relations: ['persona'] });
        if (!c) return null;
        const pe: any = (c as any).persona;
        return {
          id, nombre: pe ? [pe.nombre, pe.apellido].filter(Boolean).join(' ') : null,
          documento: pe?.documento ?? null, activo: !!c.activo, saldo: Number(c.saldoActual ?? 0),
        };
      };
      const origen = await ficha(origenId);
      const destino = await ficha(destinoId);
      if (!origen) throw new Error(`Cliente ${origenId} (origen) no encontrado`);
      if (!destino) throw new Error(`Cliente ${destinoId} (destino) no encontrado`);
      if (!destino.activo) throw new Error(`El cliente ${destinoId} (destino) está inactivo`);

      const ids = async (tabla: string, col = 'id') =>
        (await m.query(`SELECT ${col} AS id FROM ${tabla} WHERE cliente_id = ${ph(1)} ORDER BY ${col}`, [origenId]))
          .map((f: any) => Number(f.id));
      const cpcIds = await ids('cuentas_por_cobrar');
      const movimientoIds = await ids('movimientos_cliente');
      const ventaIds = await ids('ventas');
      const convenioIds = await ids('cliente_convenios', 'convenio_id');
      const conveniosDestino = await m.query(`SELECT convenio_id AS id FROM cliente_convenios WHERE cliente_id = ${ph(1)}`, [destinoId]);
      const yaEnDestino = new Set(conveniosDestino.map((f: any) => Number(f.id)));
      const activas = await m.find(CuentaPorCobrar, { where: { cliente: { id: origenId }, estado: CuentaPorCobrarEstado.ACTIVO } });
      const pendienteActivas = round2(activas.reduce((s, c) => s + Number(c.montoTotal) - Number(c.montoCobrado), 0));
      const cuotas = cpcIds.length
        ? await m.count(CuentaPorCobrarCuota, { where: { cuentaPorCobrar: { id: In(cpcIds) } } as any })
        : 0;

      const respaldo = {
        origenId, destinoId, cpcIds, movimientoIds, ventaIds, convenioIds,
        conveniosAgregadosAlDestino: convenioIds.filter((c: number) => !yaEnDestino.has(c)),
        origen: { activo: origen.activo, saldoActual: origen.saldo },
        destino: { activo: destino.activo, saldoActual: destino.saldo },
      };

      const mover = (ent: any) => m.createQueryBuilder().update(ent)
        .set({ cliente: { id: destinoId } } as any).where('cliente_id = :o', { o: origenId }).execute();
      await mover(CuentaPorCobrar);
      await mover(MovimientoCliente);
      await mover(Venta);
      for (const c of respaldo.conveniosAgregadosAlDestino) {
        await m.query(`INSERT INTO cliente_convenios (cliente_id, convenio_id) VALUES (${ph(1)}, ${ph(2)})`, [destinoId, c]);
      }
      await m.query(`DELETE FROM cliente_convenios WHERE cliente_id = ${ph(1)}`, [origenId]);

      const saldoOrigen = await saldoPorMovimientos(m, origenId);
      const saldoDestino = await saldoPorMovimientos(m, destinoId);
      await m.update(Cliente, { id: origenId }, { saldoActual: saldoOrigen, activo: false });
      await m.update(Cliente, { id: destinoId }, { saldoActual: saldoDestino });

      if (!simular && round2(Number(p.esperado.saldoDestino)) !== saldoDestino) {
        throw new Error(`No coincide con la simulación: el saldo del destino queda en ${saldoDestino}, se esperaba ${p.esperado.saldoDestino}. Volvé a simular.`);
      }

      const resultado = {
        simulado: simular, motivo,
        origen: { ...origen, saldoAntes: origen.saldo, saldoDespues: saldoOrigen, activoDespues: false },
        destino: { ...destino, saldoAntes: destino.saldo, saldoDespues: saldoDestino },
        movidos: {
          cpc: cpcIds.length, cpcActivas: activas.length, pendienteCpcActivas: pendienteActivas, cuotas,
          movimientos: movimientoIds.length, ventas: ventaIds.length,
          conveniosAgregadosAlDestino: respaldo.conveniosAgregadosAlDestino.length,
        },
        respaldo,
      };
      if (simular) throw new SimulacionFusion(resultado);
      await queryRunner.commitTransaction();
      console.log(`[fusionar-clientes] ${origenId} -> ${destinoId}${motivo ? ` (${motivo})` : ''}: ${JSON.stringify(resultado.movidos)}`);
      return resultado;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (error instanceof SimulacionFusion) return error.resultado;
      console.error('Error en fusionar-clientes:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // F2-extra: cerrar venta como crédito (atómico)
  // Recibe: { ventaId, clienteId, montoTotal, monedaId, cantidadCuotas?, frecuenciaDias?, fechaInicio?, descripcion?, forzar? }
  ipcMain.handle('cobrar-venta-credito', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    // Concluir una venta a crédito es un cuarto camino de finalización, así que
    // lleva el mismo gate de terminal ajena que `updateVenta`.
    //
    // Se pide sólo 'FINALIZAR' y no también 'PAGO', aunque más abajo se cree un
    // `PagoDetalle`: esa línea usa la forma de pago CREDITO, que tiene
    // `movimentaCaja: false`. Es el artefacto contable de cerrar la venta, no
    // plata entrando al cajón — que es justamente lo que el flag de pagos
    // controla.
    if (data?.__validarDispositivoCaja === true) {
      const ventaCaja = await dataSource.getRepository(Venta).findOne({
        where: { id: data?.ventaId },
        relations: ['caja'],
      });
      await assertTerminalPuedeOperar(dataSource, _event, (ventaCaja?.caja as any)?.id ?? null, 'FINALIZAR');
    }
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cu = getCurrentUser();
      const ventaRepo = queryRunner.manager.getRepository(Venta);
      const clienteRepo = queryRunner.manager.getRepository(Cliente);
      const formaPagoRepo = queryRunner.manager.getRepository(FormasPago);
      const pagoRepo = queryRunner.manager.getRepository(Pago);
      const pagoDetalleRepo = queryRunner.manager.getRepository(PagoDetalle);
      const cpcRepo = queryRunner.manager.getRepository(CuentaPorCobrar);
      const cuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
      const movRepo = queryRunner.manager.getRepository(MovimientoCliente);

      const venta = await ventaRepo.findOne({
        where: { id: data.ventaId },
        relations: ['cliente', 'caja', 'pago'],
      });
      if (!venta) throw new Error(`Venta ${data.ventaId} no encontrada`);
      if (venta.estado === VentaEstado.CONCLUIDA) throw new Error('La venta ya está concluida');
      if (venta.estado === VentaEstado.CANCELADA) throw new Error('La venta está cancelada');
      // Invariante de caja: cerrar a crédito crea el `Pago` con `caja: venta.caja`
      // (más abajo), así que esa caja tiene que estar abierta. Corre dentro de la
      // transacción del cobro, no opt-in como el gate de terminal.
      await assertCajaAbiertaSiVino(queryRunner.manager, (venta.caja as any)?.id ?? null, {
        lock: 'read',
        contexto: 'cobrar-venta-credito',
      });

      const cliente = await clienteRepo.findOne({ where: { id: data.clienteId } });
      if (!cliente) throw new Error(`Cliente ${data.clienteId} no encontrado`);
      if (!cliente.activo) throw new Error('El cliente está inactivo');
      if (!cliente.credito) throw new Error('El cliente no tiene crédito habilitado');

      const montoTotal = Number(data.montoTotal);
      if (!montoTotal || montoTotal <= 0) throw new Error('El monto debe ser mayor a cero');

      // Validar límite de crédito (warning si excede, salvo que se fuerce)
      const limite = Number(cliente.limite_credito) || 0;
      const saldoAct = Number(cliente.saldoActual) || 0;
      const saldoFinal = saldoAct + montoTotal;
      if (limite > 0 && saldoFinal > limite && !data.forzar) {
        return {
          success: false,
          requiereConfirmacion: true,
          message: `El saldo proyectado (${saldoFinal.toFixed(2)}) excede el límite de crédito (${limite.toFixed(2)})`,
          saldoActual: saldoAct,
          saldoProyectado: saldoFinal,
          limite,
        };
      }

      // Get-or-create FormaPago "CREDITO" (la venta a crédito se registra con
      // esta forma de pago; movimentaCaja:false para no impactar el arqueo).
      const NOMBRE_FP = 'CREDITO';
      let formaPago = await formaPagoRepo
        .createQueryBuilder('fp')
        .where('UPPER(fp.nombre) = :n', { n: NOMBRE_FP })
        .getOne();
      if (!formaPago) {
        formaPago = formaPagoRepo.create({
          nombre: NOMBRE_FP,
          movimentaCaja: false,
          principal: false,
          orden: 99,
          activo: true,
        });
        await setEntityUserTracking(dataSource, formaPago, cu?.id, false);
        formaPago = await queryRunner.manager.save(FormasPago, formaPago);
      }

      // Crear/actualizar Pago y registrar PagoDetalle con el monto total a crédito
      let pago = venta.pago as Pago | undefined;
      if (!pago) {
        pago = pagoRepo.create({
          estado: PagoEstado.PAGADO,
          caja: venta.caja,
          activo: true,
        });
        await setEntityUserTracking(dataSource, pago, cu?.id, false);
        pago = await queryRunner.manager.save(Pago, pago);
      } else {
        pago.estado = PagoEstado.PAGADO;
        await setEntityUserTracking(dataSource, pago, cu?.id, true);
        await queryRunner.manager.save(Pago, pago);
      }

      const pagoDetalle = pagoDetalleRepo.create({
        valor: montoTotal,
        descripcion: `VENTA #${venta.id} A CRÉDITO`.toUpperCase(),
        tipo: TipoDetalle.PAGO,
        pago,
        moneda: { id: data.monedaId } as any,
        formaPago,
        activo: true,
      });
      await setEntityUserTracking(dataSource, pagoDetalle, cu?.id, false);
      await queryRunner.manager.save(PagoDetalle, pagoDetalle);

      // Cerrar venta
      venta.estado = VentaEstado.CONCLUIDA;
      venta.formaPago = formaPago;
      venta.pago = pago;
      venta.fechaCierre = new Date();
      await setEntityUserTracking(dataSource, venta, cu?.id, true);
      await queryRunner.manager.save(Venta, venta);

      // Cerrar la cuenta de una mesa cambia su ocupacion. Este handler NO pasa
      // por `updateVenta`, asi que tiene que resincronizar el cache
      // `pdv_mesas.estado` por su cuenta — si no, la mesa queda marcada ocupada
      // para siempre en todo lector de la columna cruda. Va en la MISMA
      // transaccion; el criterio es el mismo de `mesaTieneCuentaPropia`:
      // ocupada <=> venta ABIERTA con comanda_id IS NULL.
      const mesaIdVenta = (venta as any)?.mesa?.id ?? null;
      if (mesaIdVenta) {
        const abiertas = await queryRunner.manager.count(Venta, {
          where: { mesa: { id: mesaIdVenta }, estado: VentaEstado.ABIERTA, comanda: IsNull() },
        });
        const mesaRow = await queryRunner.manager.findOneBy(PdvMesa, { id: mesaIdVenta } as any);
        const derivado = abiertas > 0 ? 'OCUPADO' : 'DISPONIBLE';
        if (mesaRow && (mesaRow as any).estado !== derivado) {
          (mesaRow as any).estado = derivado;
          await queryRunner.manager.save(PdvMesa, mesaRow);
        }
      }

      // Crear CPC + cuotas (replicando la lógica de create-cuenta-por-cobrar)
      const cantidadCuotas = Math.max(1, Number(data.cantidadCuotas) || 1);
      const frecuenciaDias = Number(data.frecuenciaDias) || 30;
      const fechaInicio = parseLocalDate(data.fechaInicio) || new Date();
      const montoCuota = +(montoTotal / cantidadCuotas).toFixed(2);
      const descripcion = (data.descripcion || `VENTA #${venta.id} A CRÉDITO`).toUpperCase();

      const cpcEntity = cpcRepo.create({
        cliente: { id: data.clienteId } as any,
        tipo: CuentaPorCobrarTipo.CREDITO_VENTA,
        descripcion,
        montoTotal,
        montoCobrado: 0,
        moneda: { id: data.monedaId } as any,
        fechaInicio,
        cantidadCuotas,
        estado: CuentaPorCobrarEstado.ACTIVO,
        ventaId: venta.id,
      });
      await setEntityUserTracking(dataSource, cpcEntity, cu?.id, false);
      const cpcSaved = await queryRunner.manager.save(CuentaPorCobrar, cpcEntity);

      for (let i = 0; i < cantidadCuotas; i++) {
        const venc = new Date(fechaInicio);
        if (frecuenciaDias === 30) {
          venc.setMonth(venc.getMonth() + i);
        } else {
          venc.setDate(venc.getDate() + frecuenciaDias * i);
        }
        const monto = (i === cantidadCuotas - 1)
          ? +(montoTotal - montoCuota * (cantidadCuotas - 1)).toFixed(2)
          : montoCuota;
        const cuota = cuotaRepo.create({
          cuentaPorCobrar: { id: cpcSaved.id } as any,
          numero: i + 1,
          fechaVencimiento: venc,
          monto,
          montoCobrado: 0,
          estado: CuentaPorCobrarCuotaEstado.PENDIENTE,
        });
        await setEntityUserTracking(dataSource, cuota, cu?.id, false);
        await queryRunner.manager.save(CuentaPorCobrarCuota, cuota);
      }

      // MovimientoCliente CARGO + actualizar saldo
      const movCargo = movRepo.create({
        cliente: { id: data.clienteId } as any,
        tipo: MovimientoClienteTipo.CARGO,
        monto: montoTotal,
        fecha: new Date(),
        ventaId: venta.id,
        cuentaPorCobrarId: cpcSaved.id,
        observacion: `CARGO POR VENTA #${venta.id} A CRÉDITO`,
        registradoPor: cu || undefined,
      });
      await setEntityUserTracking(dataSource, movCargo, cu?.id, false);
      await queryRunner.manager.save(MovimientoCliente, movCargo);

      // El límite de crédito se validó con `saldoAct` (aviso confirmable); el
      // saldo se ajusta atómico para no pisar un cobro concurrente (#190).
      cliente.saldoActual = await ajustarSaldoCliente(queryRunner.manager, cliente.id, montoTotal);

      await queryRunner.commitTransaction();

      // ─── Auto-imprimir ticket de venta + pagaré (fire-and-forget) ─────
      // El handler `cobrar-venta-credito` no pasa por `updateVenta`, así
      // que el hook de auto-print del ticket no se dispara. Lo invocamos
      // explícitamente acá, igual que el flujo de cobro normal.
      // La impresión es opt-in: solo si el usuario pidió imprimir en el diálogo
      // de cobro (por defecto NO). Si no se desea el pagaré, tampoco se imprime
      // el ticket de venta.
      //
      // Las fichas de cantina van FUERA de ese `if`: una venta directa a
      // crédito sin pagaré igual entrega fichas. Corre post-commit (estamos
      // después de `commitTransaction`), así el claim ve la venta CONCLUIDA.
      // Orden en la térmica: ticket, pagaré, fichas.
      const imprimirPagare = data?.imprimirPagare === true;
      setImmediate(async () => {
        if (imprimirPagare) {
          try {
            const pdvConfig = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
            if (pdvConfig?.autoImprimirTicketVenta) {
              await printVentaTicketInternal(dataSource, venta.id);
            }
            // Pequeña pausa para que el ticket salga primero en la térmica.
            await new Promise(r => setTimeout(r, 600));
            await printPagareCpcTicketInternal(dataSource, cpcSaved.id);
          } catch (e: any) {
            console.warn('[cobrar-venta-credito] auto-print:', e?.message || e);
          }
        }
        await imprimirFichasSiCorresponde(dataSource, venta.id);
      });

      return { success: true, ventaId: venta.id, cpcId: cpcSaved.id };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error cobrar-venta-credito:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });
}
