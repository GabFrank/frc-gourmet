import { bloquearSiEsDr, PERMISOS_LECTURA_BONOS } from '../utils/disciplina-proteccion';
import { ipcMain } from 'electron';
import { Between, DataSource, Not } from 'typeorm';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { LiquidacionItem } from '../../src/app/database/entities/rrhh/liquidacion-item.entity';
import { LiquidacionConcepto } from '../../src/app/database/entities/rrhh/liquidacion-concepto.entity';
import { LiquidacionComision } from '../../src/app/database/entities/rrhh/liquidacion-comision.entity';
import { LiquidacionComisionEstado } from '../../src/app/database/entities/rrhh/regla-comision-enums';
import { LiquidacionSueldoEstado } from '../../src/app/database/entities/rrhh/liquidacion-sueldo-estado.enum';
import { LiquidacionItemTipo } from '../../src/app/database/entities/rrhh/liquidacion-item-tipo.enum';
import { Bono } from '../../src/app/database/entities/rrhh/bono.entity';
import { Aguinaldo, AguinaldoEstado } from '../../src/app/database/entities/rrhh/aguinaldo.entity';
import { VacacionVenta, VacacionVentaEstado } from '../../src/app/database/entities/rrhh/vacacion-venta.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Vale } from '../../src/app/database/entities/rrhh/vale.entity';
import { ValeEstado } from '../../src/app/database/entities/rrhh/vale-estado.enum';
import { Penalizacion } from '../../src/app/database/entities/rrhh/penalizacion.entity';
import { HoraExtra } from '../../src/app/database/entities/rrhh/hora-extra.entity';
import { CuentaPorPagar } from '../../src/app/database/entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarTipo, CuentaPorPagarEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { CuentaPorPagarCuota } from '../../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity';
import { CuotaEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { DrLiquidacionPendiente } from '../../src/app/database/entities/rrhh/disciplina/dr-liquidacion-pendiente.entity';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import {
  CuentaPorCobrarEstado,
  CuentaPorCobrarCuotaEstado,
  MovimientoClienteTipo,
} from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { MovimientoBancarioTipo } from '../../src/app/database/entities/financiero/movimiento-bancario.entity';
import { registrarMovimientoBancario } from '../utils/movimiento-bancario.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { getConfigNumber } from './configuracion-rrhh.handler';
import { ensurePermission } from '../utils/auth.utils';
import { bloquearSiPagoConsolidado } from './pago-consolidado-guard';
import { PagoOrigenTipo } from '../../src/app/database/entities/financiero/pago-consolidado-enums';
import { ajustarSaldoCliente, ajustarSaldoCuentaBancaria } from '../utils/saldo-atomico.utils';

const SEED_CONCEPTOS: Array<{ codigo: string; descripcion: string; esHaber: boolean; esCalculadoAuto: boolean }> = [
  { codigo: 'SALARIO_BASE', descripcion: 'Salario base', esHaber: true, esCalculadoAuto: true },
  { codigo: 'IPS_DESCUENTO', descripcion: 'Aporte IPS funcionario', esHaber: false, esCalculadoAuto: true },
  { codigo: 'ADELANTO_DESCUENTO', descripcion: 'Adelanto de salario', esHaber: false, esCalculadoAuto: true },
  { codigo: 'VALE_DESCUENTO', descripcion: 'Descuento de vale', esHaber: false, esCalculadoAuto: true },
  { codigo: 'HORA_EXTRA', descripcion: 'Hora extra', esHaber: true, esCalculadoAuto: true },
  { codigo: 'PENALIZACION', descripcion: 'Penalizacion', esHaber: false, esCalculadoAuto: true },
  { codigo: 'BONO_MANUAL', descripcion: 'Bono manual', esHaber: true, esCalculadoAuto: true },
  { codigo: 'AGUINALDO', descripcion: 'Aguinaldo', esHaber: true, esCalculadoAuto: true },
  { codigo: 'COMISION', descripcion: 'Comision por ventas', esHaber: true, esCalculadoAuto: true },
  { codigo: 'PRESTAMO_CUOTA', descripcion: 'Cuota de prestamo', esHaber: false, esCalculadoAuto: true },
  { codigo: 'CREDITO_CONSUMO', descripcion: 'Consumo a credito (cliente)', esHaber: false, esCalculadoAuto: true },
];

export async function seedLiquidacionConceptos(dataSource: DataSource) {
  const repo = dataSource.getRepository(LiquidacionConcepto);
  for (const seed of SEED_CONCEPTOS) {
    const existing = await repo.findOne({ where: { codigo: seed.codigo } });
    if (!existing) {
      const entity = repo.create({
        codigo: seed.codigo,
        descripcion: seed.descripcion,
        esHaber: seed.esHaber,
        esCalculadoAuto: seed.esCalculadoAuto,
        activo: true,
      });
      await repo.save(entity);
    }
  }
}

function getPeriodoBounds(periodo: string): { fechaInicio: Date; fechaFin: Date } {
  // periodo formato 'YYYY-MM'
  const [yStr, mStr] = periodo.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const fechaInicio = new Date(y, m - 1, 1);
  const fechaFin = new Date(y, m, 0);
  return { fechaInicio, fechaFin };
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

/** 'YYYY-MM-DD' de un valor de columna date: string (entidad / SQLite) o Date (raw en Postgres). */
function fechaTexto(v: any): string {
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  return String(v).slice(0, 10);
}

async function recalcularTotales(items: LiquidacionItem[]): Promise<{ haberes: number; descuentos: number; neto: number }> {
  let haberes = 0;
  let descuentos = 0;
  for (const it of items) {
    if (it.tipo === LiquidacionItemTipo.HABER) haberes += Number(it.monto);
    else descuentos += Math.abs(Number(it.monto));
  }
  return { haberes, descuentos, neto: haberes - descuentos };
}

/** Ids de todas las fichas de cliente de una persona (un funcionario puede tener varias). */
async function clienteIdsDePersona(manager: any, personaId: number | undefined): Promise<number[]> {
  if (!personaId) return [];
  const clientes = await manager.getRepository(Cliente).find({ where: { persona: { id: personaId } as any } });
  return clientes.map((c: Cliente) => c.id);
}

/**
 * Cobra (total o parcial) una cuota de CPC contra una liquidación de sueldo, sin
 * mover caja: el dinero ya va neteado en el EGRESO_SALARIO de esa liquidación.
 * Actualiza cuota, CPC y `Cliente.saldoActual`, y deja un MovimientoCliente PAGO
 * con `liquidacionItemId` (el ítem que lo descontó).
 *
 * Enlace: si la cuota queda COBRADO, `cuota.liquidacionId = liq.id`. Si queda
 * PARCIAL se libera (null) para que el resto lo tome la próxima liquidación.
 *
 * No commitea: el caller maneja la transaccion.
 */
export async function cobrarCuotaCpcEnLiquidacion(
  queryRunner: any,
  dataSource: DataSource,
  p: { cuotaId: number; monto: number; liq: LiquidacionSueldo; itemId: number; observacion: string; userId?: number; userEntity: Usuario | null },
): Promise<{ cobrado: number; estado?: CuentaPorCobrarCuotaEstado; montoCobrado?: number; movimientoId?: number }> {
  const cpcCuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
  const cpcRepo = queryRunner.manager.getRepository(CuentaPorCobrar);
  const movClienteRepo = queryRunner.manager.getRepository(MovimientoCliente);
  const cuota = await cpcCuotaRepo.findOne({ where: { id: p.cuotaId }, relations: ['cuentaPorCobrar'] });
  if (!cuota) return { cobrado: 0 };
  if (cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO || cuota.estado === CuentaPorCobrarCuotaEstado.CANCELADO) {
    return { cobrado: 0, estado: cuota.estado, montoCobrado: Number(cuota.montoCobrado) };
  }
  const restante = +(Number(cuota.monto) - Number(cuota.montoCobrado)).toFixed(2);
  const montoCobrar = +Math.min(Number(p.monto), restante).toFixed(2);
  if (montoCobrar <= 0) return { cobrado: 0, estado: cuota.estado, montoCobrado: Number(cuota.montoCobrado) };
  cuota.montoCobrado = +(Number(cuota.montoCobrado) + montoCobrar).toFixed(2);
  cuota.estado = cuota.montoCobrado >= Number(cuota.monto) - 0.005
    ? CuentaPorCobrarCuotaEstado.COBRADO
    : CuentaPorCobrarCuotaEstado.PARCIAL;
  if (cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO) {
    cuota.fechaCobro = new Date();
    cuota.liquidacionId = p.liq.id;
  } else {
    (cuota as any).liquidacionId = null;
  }
  await cpcCuotaRepo.save(cuota);

  const cpc = await cpcRepo.findOne({ where: { id: cuota.cuentaPorCobrar.id }, relations: ['cuotas', 'cliente'] });
  if (!cpc) return { cobrado: montoCobrar, estado: cuota.estado, montoCobrado: cuota.montoCobrado };
  cpc.montoCobrado = +(Number(cpc.montoCobrado) + montoCobrar).toFixed(2);
  const todasCobradas = (cpc.cuotas || []).every((c: any) =>
    c.id === cuota.id
      ? cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO
      : Number(c.montoCobrado) >= Number(c.monto) - 0.005);
  if (todasCobradas) cpc.estado = CuentaPorCobrarEstado.COBRADO;
  await cpcRepo.save(cpc);

  let movimientoId: number | undefined;
  const clienteId = cpc.cliente?.id;
  if (clienteId) {
    await ajustarSaldoCliente(queryRunner.manager, clienteId, -montoCobrar);
    const movCliente = movClienteRepo.create({
      cliente: { id: clienteId } as any,
      tipo: MovimientoClienteTipo.PAGO,
      monto: montoCobrar,
      fecha: new Date(),
      cuentaPorCobrarId: cpc.id,
      cuentaPorCobrarCuotaId: cuota.id,
      liquidacionItemId: p.itemId,
      observacion: `${p.observacion} #${cuota.numero}`,
      registradoPor: p.userEntity || undefined,
    });
    await setEntityUserTracking(dataSource, movCliente, p.userId, false);
    movimientoId = (await movClienteRepo.save(movCliente)).id;
  }
  return { cobrado: montoCobrar, estado: cuota.estado, montoCobrado: cuota.montoCobrado, movimientoId };
}

/**
 * Deshace un MovimientoCliente PAGO de liquidación: devuelve la cuota a
 * PENDIENTE/PARCIAL, resta el cobro del CPC, restituye `Cliente.saldoActual` y
 * borra el movimiento. `montoOverride` solo para cobros viejos sin enlace.
 */
async function revertirMovimientoCobroCpc(
  queryRunner: any,
  dataSource: DataSource,
  mov: MovimientoCliente,
  liqId: number,
  userId: number | undefined,
  montoOverride?: number,
): Promise<number> {
  const cpcCuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
  const cpcRepo = queryRunner.manager.getRepository(CuentaPorCobrar);
  const movClienteRepo = queryRunner.manager.getRepository(MovimientoCliente);
  let montoRevertir = montoOverride ?? Number(mov.monto);
  const cuota = mov.cuentaPorCobrarCuotaId
    ? await cpcCuotaRepo.findOne({ where: { id: mov.cuentaPorCobrarCuotaId }, relations: ['cuentaPorCobrar'] })
    : null;
  if (cuota) {
    montoRevertir = Math.min(montoRevertir, Number(cuota.montoCobrado));
    cuota.montoCobrado = Math.max(0, +(Number(cuota.montoCobrado) - montoRevertir).toFixed(2));
    cuota.estado = cuota.montoCobrado <= 0
      ? CuentaPorCobrarCuotaEstado.PENDIENTE
      : CuentaPorCobrarCuotaEstado.PARCIAL;
    if (cuota.montoCobrado <= 0) (cuota as any).fechaCobro = null;
    if (cuota.liquidacionId === liqId) (cuota as any).liquidacionId = null;
    await setEntityUserTracking(dataSource, cuota, userId, true);
    await cpcCuotaRepo.save(cuota);

    const cpc = await cpcRepo.findOne({ where: { id: cuota.cuentaPorCobrar.id }, relations: ['cliente'] });
    if (cpc) {
      cpc.montoCobrado = Math.max(0, +(Number(cpc.montoCobrado) - montoRevertir).toFixed(2));
      if (cpc.estado === CuentaPorCobrarEstado.COBRADO) cpc.estado = CuentaPorCobrarEstado.ACTIVO;
      await setEntityUserTracking(dataSource, cpc, userId, true);
      await cpcRepo.save(cpc);
    }
  }
  const clienteId = (mov as any).cliente?.id ?? (await movClienteRepo.findOne({ where: { id: mov.id }, relations: ['cliente'] }))?.cliente?.id;
  if (clienteId && montoRevertir > 0) {
    await ajustarSaldoCliente(queryRunner.manager, clienteId, montoRevertir);
  }
  await movClienteRepo.remove(mov);
  return montoRevertir;
}

/**
 * Aplica el ESTADO DE DOMINIO del pago de una liquidacion de sueldo: todo lo que
 * la liquidacion salda ademas de entregar el neto.
 *
 * Una liquidacion no es un pago simple. En la misma transaccion netea vales
 * (-> DESCONTADO), cuotas de prestamo (CPP), cuotas de consumo a credito (CPC,
 * bajando `Cliente.saldoActual` y dejando un `MovimientoCliente`), aguinaldos,
 * comisiones y venta de vacaciones. Nada de eso genera movimiento propio de Caja
 * Mayor: va neteado dentro del EGRESO_SALARIO.
 *
 * Extraido de `pagar-liquidacion-sueldo` SIN cambios de comportamiento, para que
 * el pago consolidado pueda reusarlo. Deliberadamente NO toca caja ni banco: el
 * asiento (y el `liq.movimientoId` / `liq.cuentaBancariaId` que de el se derivan)
 * es responsabilidad del caller, porque cada camino asienta distinto — el pago
 * consolidado puede generar N movimientos y por eso deja esos campos en null y
 * revierte por su propio evento.
 *
 * No commitea: el caller maneja la transaccion.
 */
export async function aplicarEstadoPagoLiquidacion(
  queryRunner: any,
  liq: LiquidacionSueldo,
  userId: number | undefined,
  userEntity: Usuario | null,
  dataSource: DataSource,
): Promise<void> {
  const itemRepo = queryRunner.manager.getRepository(LiquidacionItem);
  // Marcar vales asociados como DESCONTADO
  const items = await itemRepo.find({ where: { liquidacion: { id: liq.id } as any } });
  const valesIds = items
    .filter((i) => i.referenciaTipo === 'VALE' && i.referenciaId)
    .map((i) => i.referenciaId!) as number[];
  if (valesIds.length) {
    const valeRepo = queryRunner.manager.getRepository(Vale);
    for (const vId of valesIds) {
      const vale = await valeRepo.findOne({ where: { id: vId } });
      if (vale && vale.estado === ValeEstado.CONFIRMADO) {
        vale.estado = ValeEstado.DESCONTADO;
        vale.liquidacionId = liq.id;
        await valeRepo.save(vale);
      }
    }
  }

  // Marcar cuotas de prestamo asociadas como pagadas
  const cuotasIds = items
    .filter((i) => i.referenciaTipo === 'CPP_CUOTA' && i.referenciaId)
    .map((i) => i.referenciaId!) as number[];
  if (cuotasIds.length) {
    const cuotaRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);
    const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
    for (const cId of cuotasIds) {
      const cuota = await cuotaRepo.findOne({ where: { id: cId }, relations: ['cuentaPorPagar'] });
      if (cuota) {
        cuota.montoPagado = Number(cuota.monto);
        cuota.estado = CuotaEstado.PAGADA;
        cuota.fechaPago = new Date();
        await cuotaRepo.save(cuota);
        const cpp = await cppRepo.findOne({ where: { id: cuota.cuentaPorPagar.id }, relations: ['cuotas'] });
        if (cpp) {
          cpp.montoPagado = +(Number(cpp.montoPagado) + Number(cuota.monto)).toFixed(2);
          const todasPagadas = (cpp.cuotas || []).every((c: any) => Number(c.montoPagado) >= Number(c.monto) - 0.005);
          if (todasPagadas) {
            cpp.estado = 'PAGADO' as any;
          }
          await cppRepo.save(cpp);
        }
      }
    }
  }

  // Cobrar cuotas de CPC (consumo a crédito del funcionario-cliente).
  // Va neteado dentro del EGRESO_SALARIO: NO se crea INGRESO_COBRO_CLIENTE
  // en Caja Mayor (mismo criterio que las cuotas de préstamo).
  const cpcItems = items.filter((i) => i.referenciaTipo === 'CPC_CUOTA' && i.referenciaId);
  for (const it of cpcItems) {
    await cobrarCuotaCpcEnLiquidacion(queryRunner, dataSource, {
      cuotaId: it.referenciaId!,
      monto: Number(it.monto),
      liq,
      itemId: it.id,
      observacion: `LIQUIDACION ${liq.periodo} #${liq.id} - COBRO CUOTA`,
      userId,
      userEntity,
    });
  }

  // Marcar aguinaldo asociado como PAGADO
  const aguiIds = items
    .filter((i) => i.referenciaTipo === 'AGUINALDO' && i.referenciaId)
    .map((i) => i.referenciaId!) as number[];
  if (aguiIds.length) {
    const aguiRepo = queryRunner.manager.getRepository(Aguinaldo);
    for (const aId of aguiIds) {
      const agui = await aguiRepo.findOne({ where: { id: aId } });
      if (agui) {
        agui.estado = AguinaldoEstado.PAGADO;
        agui.fechaPago = new Date();
        agui.liquidacionId = liq.id;
        await aguiRepo.save(agui);
      }
    }
  }

  // Marcar LiquidacionComision como INTEGRADA si existe
  const comIds = items
    .filter((i) => i.referenciaTipo === 'LIQUIDACION_COMISION' && i.referenciaId)
    .map((i) => i.referenciaId!) as number[];
  if (comIds.length) {
    const liqComRepo = queryRunner.manager.getRepository(LiquidacionComision);
    for (const cId of comIds) {
      const liqCom = await liqComRepo.findOne({ where: { id: cId } });
      if (liqCom && liqCom.estado === LiquidacionComisionEstado.APROBADA) {
        liqCom.estado = LiquidacionComisionEstado.INTEGRADA;
        await liqComRepo.save(liqCom);
      }
    }
  }

  // Marcar ventas de vacaciones como PAGADO
  const ventaVacIds = items
    .filter((i) => i.referenciaTipo === 'VACACION_VENTA' && i.referenciaId)
    .map((i) => i.referenciaId!) as number[];
  if (ventaVacIds.length) {
    const vvRepo = queryRunner.manager.getRepository(VacacionVenta);
    for (const vvId of ventaVacIds) {
      const vv = await vvRepo.findOne({ where: { id: vvId } });
      if (vv && vv.estado === VacacionVentaEstado.PENDIENTE) {
        vv.estado = VacacionVentaEstado.PAGADO;
        vv.liquidacionId = liq.id;
        await setEntityUserTracking(dataSource, vv, userId, true);
        await vvRepo.save(vv);
      }
    }
  }
}

/**
 * Revierte el ESTADO DE DOMINIO del pago de una liquidacion: deshace el neteo que
 * hizo `aplicarEstadoPagoLiquidacion`.
 *
 * Vales DESCONTADO -> CONFIRMADO, cuotas de prestamo (CPP) y de consumo (CPC)
 * devueltas a PENDIENTE/PARCIAL con `Cliente.saldoActual` restituido, aguinaldos
 * de vuelta a APROBADO, comisiones a APROBADA, venta de vacaciones a PENDIENTE.
 *
 * Extraido de `anular-liquidacion-sueldo` SIN cambios de comportamiento. Igual
 * que su contraparte, NO toca caja ni banco: esa reversa la hace cada caller
 * (el handler viejo por `liq.movimientoId`, el pago consolidado por su evento).
 *
 * No commitea: el caller maneja la transaccion.
 */
export async function revertirEstadoPagoLiquidacion(
  queryRunner: any,
  liq: LiquidacionSueldo,
  userId: number | undefined,
  dataSource: DataSource,
): Promise<void> {
  const itemRepo = queryRunner.manager.getRepository(LiquidacionItem);
  const items = await itemRepo.find({ where: { liquidacion: { id: liq.id } as any } });

  // Vales: DESCONTADO -> CONFIRMADO, limpiar liquidacionId
  const valesIds = items
    .filter((i) => i.referenciaTipo === 'VALE' && i.referenciaId)
    .map((i) => i.referenciaId!) as number[];
  if (valesIds.length) {
    const valeRepo = queryRunner.manager.getRepository(Vale);
    for (const vId of valesIds) {
      const vale = await valeRepo.findOne({ where: { id: vId } });
      if (vale && vale.estado === ValeEstado.DESCONTADO && vale.liquidacionId === liq.id) {
        vale.estado = ValeEstado.CONFIRMADO;
        (vale as any).liquidacionId = null;
        await setEntityUserTracking(dataSource, vale, userId, true);
        await valeRepo.save(vale);
      }
    }
  }

  // Cuotas de prestamo: PAGADA -> PENDIENTE/PARCIAL, restar montoPagado del CPP, revertir CPP a ACTIVO
  const cuotasItems = items.filter((i) => i.referenciaTipo === 'CPP_CUOTA' && i.referenciaId);
  if (cuotasItems.length) {
    const cuotaRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);
    const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
    for (const it of cuotasItems) {
      const cuota = await cuotaRepo.findOne({ where: { id: it.referenciaId! }, relations: ['cuentaPorPagar'] });
      if (!cuota) continue;
      const montoRevertir = Number(it.monto);
      const nuevoPagado = Math.max(0, +(Number(cuota.montoPagado) - montoRevertir).toFixed(2));
      cuota.montoPagado = nuevoPagado;
      cuota.estado = nuevoPagado <= 0 ? CuotaEstado.PENDIENTE : CuotaEstado.PARCIAL;
      if (nuevoPagado <= 0) (cuota as any).fechaPago = null;
      await setEntityUserTracking(dataSource, cuota, userId, true);
      await cuotaRepo.save(cuota);

      const cpp = await cppRepo.findOne({ where: { id: cuota.cuentaPorPagar.id } });
      if (cpp) {
        cpp.montoPagado = Math.max(0, +(Number(cpp.montoPagado) - montoRevertir).toFixed(2));
        if (cpp.estado === CuentaPorPagarEstado.PAGADO) cpp.estado = CuentaPorPagarEstado.ACTIVO;
        await setEntityUserTracking(dataSource, cpp, userId, true);
        await cppRepo.save(cpp);
      }
    }
  }

  // CPC cuotas: revertir el cobro hecho por esta liquidación. La cuota
  // vuelve a PENDIENTE/PARCIAL, se restaura el saldo del cliente y se borra
  // el MovimientoCliente PAGO generado. Incluye los cierres hechos con
  // `cobrar-cpc-por-liquidacion` contra sus descuentos manuales.
  const movClienteRepo = queryRunner.manager.getRepository(MovimientoCliente);
  const cpcCuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
  const itemIds = items.map((i) => i.id);
  const movsEnlazados: MovimientoCliente[] = itemIds.length
    ? await movClienteRepo.createQueryBuilder('m')
      .where('m.liquidacion_item_id IN (:...ids)', { ids: itemIds })
      .andWhere('m.tipo = :t', { t: MovimientoClienteTipo.PAGO })
      .getMany()
    : [];
  for (const m of movsEnlazados) {
    await revertirMovimientoCobroCpc(queryRunner, dataSource, m, liq.id, userId);
  }
  // Cobros viejos (antes de `liquidacion_item_id`): se ubican por la observación.
  const itemsConMov = new Set(movsEnlazados.map((m) => m.liquidacionItemId));
  const cpcItemsAnular = items.filter((i) => i.referenciaTipo === 'CPC_CUOTA' && i.referenciaId && !itemsConMov.has(i.id));
  for (const it of cpcItemsAnular) {
    const cuota = await cpcCuotaRepo.findOne({ where: { id: it.referenciaId! } });
    if (!cuota || cuota.liquidacionId !== liq.id) continue;
    const movsPago = await movClienteRepo.find({
      where: { cuentaPorCobrarCuotaId: cuota.id, tipo: MovimientoClienteTipo.PAGO },
    });
    const movLegacy = movsPago.find((m) => !m.liquidacionItemId && (m.observacion || '').includes(`#${liq.id} `));
    if (movLegacy) {
      await revertirMovimientoCobroCpc(queryRunner, dataSource, movLegacy, liq.id, userId, Math.min(Number(it.monto), Number(cuota.montoCobrado)));
    }
  }

  // Aguinaldos: PAGADO -> APROBADO, limpiar liquidacionId y fechaPago
  const aguiIds = items
    .filter((i) => i.referenciaTipo === 'AGUINALDO' && i.referenciaId)
    .map((i) => i.referenciaId!) as number[];
  if (aguiIds.length) {
    const aguiRepo = queryRunner.manager.getRepository(Aguinaldo);
    for (const aId of aguiIds) {
      const agui = await aguiRepo.findOne({ where: { id: aId } });
      if (agui && agui.estado === AguinaldoEstado.PAGADO && agui.liquidacionId === liq.id) {
        agui.estado = AguinaldoEstado.APROBADO;
        (agui as any).liquidacionId = null;
        (agui as any).fechaPago = null;
        await setEntityUserTracking(dataSource, agui, userId, true);
        await aguiRepo.save(agui);
      }
    }
  }

  // Liquidaciones de comision: INTEGRADA -> APROBADA
  const comIds = items
    .filter((i) => i.referenciaTipo === 'LIQUIDACION_COMISION' && i.referenciaId)
    .map((i) => i.referenciaId!) as number[];
  if (comIds.length) {
    const liqComRepo = queryRunner.manager.getRepository(LiquidacionComision);
    for (const cId of comIds) {
      const liqCom = await liqComRepo.findOne({ where: { id: cId } });
      if (liqCom && liqCom.estado === LiquidacionComisionEstado.INTEGRADA) {
        liqCom.estado = LiquidacionComisionEstado.APROBADA;
        await setEntityUserTracking(dataSource, liqCom, userId, true);
        await liqComRepo.save(liqCom);
      }
    }
  }

  // Ventas de vacaciones: PAGADO -> PENDIENTE (vuelven a estar por cobrar)
  const ventaVacIds = items
    .filter((i) => i.referenciaTipo === 'VACACION_VENTA' && i.referenciaId)
    .map((i) => i.referenciaId!) as number[];
  if (ventaVacIds.length) {
    const vvRepo = queryRunner.manager.getRepository(VacacionVenta);
    for (const vvId of ventaVacIds) {
      const vv = await vvRepo.findOne({ where: { id: vvId } });
      if (vv && vv.estado === VacacionVentaEstado.PAGADO && vv.liquidacionId === liq.id) {
        vv.estado = VacacionVentaEstado.PENDIENTE;
        (vv as any).liquidacionId = null;
        await setEntityUserTracking(dataSource, vv, userId, true);
        await vvRepo.save(vv);
      }
    }
  }
}

export function registerLiquidacionSueldoHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ============= CONCEPTOS =============
  ipcMain.handle('get-liquidacion-conceptos', async () => {
    return await dataSource.getRepository(LiquidacionConcepto).find({ order: { codigo: 'ASC' } });
  });

  ipcMain.handle('seed-liquidacion-conceptos', async () => {
    await seedLiquidacionConceptos(dataSource);
    return { success: true };
  });

  ipcMain.handle('update-liquidacion-concepto', async (_e, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(LiquidacionConcepto);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Concepto ${id} no encontrado`);
    if (data.descripcion !== undefined) existing.descripcion = data.descripcion;
    if (data.esHaber !== undefined) existing.esHaber = data.esHaber;
    if (data.activo !== undefined) existing.activo = data.activo;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  // ============= LIQUIDACIONES =============
  ipcMain.handle('get-liquidaciones-sueldo', async (_e, filtros: any) => {
    const repo = dataSource.getRepository(LiquidacionSueldo);
    const qb = repo.createQueryBuilder('l')
      .leftJoinAndSelect('l.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .leftJoinAndSelect('l.monedaPago', 'mon')
      .leftJoinAndSelect('l.aprobadoPor', 'ap')
      .leftJoinAndSelect('ap.persona', 'app')
      .orderBy('l.periodo', 'DESC')
      .addOrderBy('l.id', 'DESC');
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    if (filtros?.periodo) qb.andWhere('l.periodo = :pe', { pe: filtros.periodo });
    if (filtros?.estado) qb.andWhere('l.estado = :e', { e: filtros.estado });
    return await qb.getMany();
  });

  ipcMain.handle('get-liquidacion-sueldo', async (_e, id: number) => {
    const repo = dataSource.getRepository(LiquidacionSueldo);
    const liq = await repo.findOne({
      where: { id },
      relations: ['funcionario', 'funcionario.persona', 'funcionario.cargo', 'monedaPago', 'aprobadoPor', 'aprobadoPor.persona'],
    });
    if (!liq) return null;
    const itemRepo = dataSource.getRepository(LiquidacionItem);
    const items = await itemRepo.find({
      where: { liquidacion: { id } as any },
      relations: ['concepto'],
      order: { tipo: 'ASC', id: 'ASC' },
    });
    return { ...liq, items };
  });

  /**
   * Genera o regenera una liquidacion en BORRADOR para un funcionario y periodo.
   * Items auto: SALARIO_BASE, IPS_DESCUENTO, vales pendientes (CONFIRMADO),
   * adelantos pendientes, cuotas de prestamo del periodo, horas extra del
   * periodo, penalizaciones del periodo, bonos del periodo, aguinaldo si
   * corresponde (diciembre o config MES_AGUINALDO).
   * Si ya existe BORRADOR la regenera (preserva items manuales).
   */
  ipcMain.handle('generar-liquidacion-borrador', async (_e, payload: any) => {
    const { funcionarioId, periodo, monedaPagoId } = payload;
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_GENERAR');
      const funcionario = await queryRunner.manager.findOne(Funcionario, {
        where: { id: funcionarioId },
        relations: ['persona', 'monedaSalario'],
      });
      if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);

      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const itemRepo = queryRunner.manager.getRepository(LiquidacionItem);
      const conceptoRepo = queryRunner.manager.getRepository(LiquidacionConcepto);

      // Buscar liquidacion existente del periodo, EXCLUYENDO las ANULADAS:
      // una liquidacion anulada quedó histórica y no debe reutilizarse; en ese
      // caso generamos un borrador nuevo.
      let liq = await liqRepo.findOne({
        where: {
          funcionario: { id: funcionarioId } as any,
          periodo,
          estado: Not(LiquidacionSueldoEstado.ANULADA),
        },
      });

      if (liq && (liq.estado === LiquidacionSueldoEstado.APROBADA || liq.estado === LiquidacionSueldoEstado.PAGADA)) {
        throw new Error('La liquidacion ya esta APROBADA o PAGADA, no se puede regenerar');
      }

      const { fechaInicio, fechaFin } = getPeriodoBounds(periodo);
      const monedaPago = monedaPagoId
        ? await queryRunner.manager.findOne(Moneda, { where: { id: monedaPagoId } })
        : funcionario.monedaSalario;
      if (!monedaPago) throw new Error('Moneda de pago invalida');

      const userId = getCurrentUser()?.id;
      if (!liq) {
        liq = liqRepo.create({
          funcionario,
          periodo,
          fechaInicio,
          fechaFin,
          salarioBase: funcionario.salarioBase,
          totalHaberes: 0,
          totalDescuentos: 0,
          totalNeto: 0,
          monedaPago,
          estado: LiquidacionSueldoEstado.BORRADOR,
        });
        await setEntityUserTracking(dataSource, liq, userId, false);
        liq = await liqRepo.save(liq);
      }

      // Borrar items NO manuales para regenerar
      await itemRepo
        .createQueryBuilder()
        .delete()
        .where('liquidacion_id = :lid AND manual = :m', { lid: liq.id, m: false })
        .execute();

      // C-04: liberar vales / ventas de vacaciones enlazados a ESTA liquidación
      // (aún no pagados) antes de regenerar, para que la regeneración pueda volver
      // a tomarlos sin fugarlos. El enlace se re-crea abajo al insertar cada item.
      await queryRunner.manager.getRepository(Vale)
        .createQueryBuilder()
        .update(Vale)
        .set({ liquidacionId: null as any })
        .where('liquidacion_id = :lid AND estado = :est', { lid: liq.id, est: ValeEstado.CONFIRMADO })
        .execute();
      await queryRunner.manager.getRepository(VacacionVenta)
        .createQueryBuilder()
        .update(VacacionVenta)
        .set({ liquidacionId: null as any })
        .where('liquidacion_id = :lid AND estado = :est', { lid: liq.id, est: VacacionVentaEstado.PENDIENTE })
        .execute();
      // C-04 (CPC): liberar cuotas de consumo a crédito enlazadas a ESTA
      // liquidación (aún no cobradas) para que la regeneración pueda re-tomarlas.
      await queryRunner.manager.getRepository(CuentaPorCobrarCuota)
        .createQueryBuilder()
        .update(CuentaPorCobrarCuota)
        .set({ liquidacionId: null as any })
        .where('liquidacion_id = :lid AND estado IN (:...ests)', {
          lid: liq.id,
          ests: [CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL],
        })
        .execute();

      // Helpers para crear items
      const conceptoMap = new Map<string, LiquidacionConcepto>();
      const conceptos = await conceptoRepo.find();
      conceptos.forEach((c) => conceptoMap.set(c.codigo, c));

      const crearItem = async (codigo: string, descripcion: string, monto: number, tipo: LiquidacionItemTipo, refId?: number, refTipo?: string, observacion?: string) => {
        if (!monto || monto === 0) return;
        const concepto = conceptoMap.get(codigo);
        const item = itemRepo.create({
          liquidacion: liq!,
          concepto: concepto || undefined,
          descripcion,
          monto: Math.abs(Number(monto)),
          tipo,
          referenciaId: refId,
          referenciaTipo: refTipo,
          manual: false,
          observacion,
        });
        await setEntityUserTracking(dataSource, item, userId, false);
        await itemRepo.save(item);
      };

      // 1) SALARIO_BASE
      await crearItem('SALARIO_BASE', 'Salario base mensual', Number(funcionario.salarioBase), LiquidacionItemTipo.HABER);

      // 2) IPS funcionario
      const ipsPct = await getConfigNumber(dataSource, 'IPS_PORCENTAJE_FUNCIONARIO', 9);
      if (funcionario.ipsActivo && ipsPct > 0) {
        const ipsMonto = +(Number(funcionario.salarioBase) * ipsPct / 100).toFixed(2);
        await crearItem('IPS_DESCUENTO', `Aporte IPS ${ipsPct}%`, ipsMonto, LiquidacionItemTipo.DESCUENTO);
      }

      // 3) Horas extra del periodo (no anuladas)
      const heRepo = queryRunner.manager.getRepository(HoraExtra);
      const horasExtra = await heRepo.createQueryBuilder('he')
        .where('he.funcionario_id = :fid', { fid: funcionarioId })
        .andWhere('he.fecha BETWEEN :fd AND :ff', { fd: isoDate(fechaInicio), ff: isoDate(fechaFin) })
        .andWhere('he.anulada = :a', { a: false })
        .getMany();
      for (const he of horasExtra) {
        await crearItem('HORA_EXTRA', `HE ${he.tipo} ${he.horas}hrs ${he.fecha}`, Number(he.montoCalculado), LiquidacionItemTipo.HABER, he.id, 'HORA_EXTRA');
      }

      // 4) Bonos del periodo (no anulados)
      const bonoRepo = queryRunner.manager.getRepository(Bono);
      const bonos = await bonoRepo.createQueryBuilder('b')
        .where('b.funcionario_id = :fid', { fid: funcionarioId })
        .andWhere('b.fecha BETWEEN :fd AND :ff', { fd: isoDate(fechaInicio), ff: isoDate(fechaFin) })
        .andWhere('b.anulado = :a', { a: false })
        .getMany();
      for (const b of bonos) {
        await crearItem('BONO_MANUAL', `Bono ${b.tipo}: ${b.motivo || ''}`, Number(b.monto), LiquidacionItemTipo.HABER, b.id, 'BONO');
      }

      // 5) Vales y adelantos pendientes (CONFIRMADO + (esAdelanto || vale))
      const valeRepo = queryRunner.manager.getRepository(Vale);
      // C-04: además del estado, exigir que el vale no esté ya enlazado a OTRA
      // liquidación (liquidacion_id NULL o = esta). Antes se tomaban todos los
      // CONFIRMADO sin importar el periodo, así que un vale podía descontarse en
      // dos liquidaciones distintas (una por periodo) hasta que se pagara.
      const valesPendientes = await valeRepo.createQueryBuilder('v')
        .where('v.funcionario_id = :fid', { fid: funcionarioId })
        .andWhere('v.estado = :est', { est: ValeEstado.CONFIRMADO })
        .andWhere('(v.liquidacion_id IS NULL OR v.liquidacion_id = :lid)', { lid: liq.id })
        .getMany();
      for (const v of valesPendientes) {
        if (!(Number(v.monto) > 0)) continue;
        const concepto = v.esAdelanto ? 'ADELANTO_DESCUENTO' : 'VALE_DESCUENTO';
        const desc = v.esAdelanto ? `Adelanto #${v.id}` : `Vale #${v.id}`;
        await crearItem(concepto, desc, Number(v.monto), LiquidacionItemTipo.DESCUENTO, v.id, 'VALE');
        // Enlazar el vale a esta liquidación para que otro periodo no lo tome.
        v.liquidacionId = liq.id;
        await valeRepo.save(v);
      }

      // 6) Cuotas de prestamo (PRESTAMO_FUNCIONARIO + cuotas pendientes/parciales vencidas hasta el fin del periodo)
      const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
      const cuotaRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);
      const prestamosActivos = await cppRepo.find({
        where: {
          funcionario: { id: funcionarioId } as any,
          tipo: CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO,
        },
      });
      for (const p of prestamosActivos) {
        const cuotasPeriodo = await cuotaRepo.createQueryBuilder('c')
          .where('c.cuenta_por_pagar_id = :pid', { pid: p.id })
          .andWhere('c.estado IN (:...estados)', { estados: [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, CuotaEstado.VENCIDA] })
          // Vencidas hasta el fin del periodo (sin piso): una cuota de un mes
          // anterior que no se descontó no queda olvidada.
          .andWhere('c.fechaVencimiento <= :ff', { ff: isoDate(fechaFin) })
          // CPP cuota no tiene liquidacion_id: no tomar la que ya está en otra
          // liquidación sin pagar (una PAGADA ya la dejó PAGADA).
          .andWhere(`NOT EXISTS (SELECT 1 FROM liquidacion_items li INNER JOIN liquidaciones_sueldo l2 ON l2.id = li.liquidacion_id
            WHERE li.referencia_tipo = 'CPP_CUOTA' AND li.referencia_id = c.id AND l2.id <> :lid AND l2.estado IN (:...estLiq))`,
            { lid: liq.id, estLiq: [LiquidacionSueldoEstado.BORRADOR, LiquidacionSueldoEstado.APROBADA] })
          .orderBy('c.fechaVencimiento', 'ASC')
          .getMany();
        for (const c of cuotasPeriodo) {
          const saldo = Number(c.monto) - Number(c.montoPagado);
          if (saldo > 0) {
            await crearItem('PRESTAMO_CUOTA', `Cuota #${c.numero} prestamo "${p.descripcion}"`, saldo, LiquidacionItemTipo.DESCUENTO, c.id, 'CPP_CUOTA');
          }
        }
      }

      // 7) Penalizaciones del periodo (no anuladas)
      const penRepo = queryRunner.manager.getRepository(Penalizacion);
      const penalizaciones = await penRepo.createQueryBuilder('p')
        .where('p.funcionario_id = :fid', { fid: funcionarioId })
        .andWhere('p.fecha BETWEEN :fd AND :ff', { fd: isoDate(fechaInicio), ff: isoDate(fechaFin) })
        .andWhere('p.anulada = :a', { a: false })
        .getMany();
      for (const p of penalizaciones) {
        if (Number(p.monto) > 0) {
          await crearItem('PENALIZACION', `${p.tipo}: ${p.descripcion || ''}`, Number(p.monto), LiquidacionItemTipo.DESCUENTO, p.id, 'PENALIZACION');
        }
      }

      // 8) Aguinaldo si periodo es diciembre
      if (periodo.endsWith('-12')) {
        const aguiRepo = queryRunner.manager.getRepository(Aguinaldo);
        let agui = await aguiRepo.findOne({
          where: {
            funcionario: { id: funcionarioId } as any,
            anio: parseInt(periodo.slice(0, 4), 10),
          },
        });
        // Si no existe, calcular ahora
        if (!agui) {
          // Total ganado en el anio (sumar liquidaciones APROBADA/PAGADA del anio)
          const liqsAnio = await liqRepo.createQueryBuilder('l')
            .where('l.funcionario_id = :fid', { fid: funcionarioId })
            .andWhere('l.periodo LIKE :anio', { anio: `${periodo.slice(0, 4)}-%` })
            .andWhere('l.estado IN (:...estados)', { estados: [LiquidacionSueldoEstado.APROBADA, LiquidacionSueldoEstado.PAGADA] })
            .getMany();
          const totalAnio = liqsAnio.reduce((sum, l) => sum + Number(l.totalHaberes), 0);
          const monto = +(totalAnio / 12).toFixed(2);
          agui = aguiRepo.create({
            funcionario,
            anio: parseInt(periodo.slice(0, 4), 10),
            montoCalculado: monto,
            mesesTrabajados: liqsAnio.length,
            estado: AguinaldoEstado.CALCULADO,
          });
          await setEntityUserTracking(dataSource, agui, userId, false);
          await aguiRepo.save(agui);
        }
        if (Number(agui.montoCalculado) > 0 && agui.estado !== AguinaldoEstado.PAGADO) {
          await crearItem('AGUINALDO', `Aguinaldo ${agui.anio}`, Number(agui.montoCalculado), LiquidacionItemTipo.HABER, agui.id, 'AGUINALDO');
        }
      }

      // 9) Comision APROBADA del periodo
      const liqComRepo = queryRunner.manager.getRepository(LiquidacionComision);
      const liqComAprobada = await liqComRepo.findOne({
        where: {
          funcionario: { id: funcionarioId } as any,
          periodo,
          estado: LiquidacionComisionEstado.APROBADA,
        },
      });
      if (liqComAprobada && Number(liqComAprobada.totalCalculado) > 0) {
        await crearItem(
          'COMISION',
          `Comision periodo ${periodo}`,
          Number(liqComAprobada.totalCalculado),
          LiquidacionItemTipo.HABER,
          liqComAprobada.id,
          'LIQUIDACION_COMISION',
        );
      }

      // 10) Ventas de vacaciones pendientes (pago al funcionario como HABER)
      const ventaVacRepo = queryRunner.manager.getRepository(VacacionVenta);
      // C-04: mismo guard que los vales — no tomar una venta de vacaciones ya
      // enlazada a otra liquidación (evita el doble crédito entre periodos).
      const ventasVacPend = await ventaVacRepo.createQueryBuilder('vv')
        .leftJoin('vv.vacacion', 'vac')
        .leftJoin('vac.funcionario', 'vf')
        .where('vf.id = :fid', { fid: funcionarioId })
        .andWhere('vv.estado = :est', { est: VacacionVentaEstado.PENDIENTE })
        .andWhere('(vv.liquidacion_id IS NULL OR vv.liquidacion_id = :lid)', { lid: liq.id })
        .getMany();
      for (const vv of ventasVacPend) {
        if (Number(vv.monto) > 0) {
          await crearItem('VACACION_VENTA', `Venta de ${vv.dias} dia(s) de vacaciones`, Number(vv.monto), LiquidacionItemTipo.HABER, vv.id, 'VACACION_VENTA');
          // Enlazar a esta liquidación para que otro periodo no la tome.
          vv.liquidacionId = liq.id;
          await ventaVacRepo.save(vv);
        }
      }

      // 11) Consumo a crédito (CPC de TODAS las fichas de cliente de la misma
      // persona del funcionario). Se descuentan las cuotas abiertas vencidas hasta
      // el fin del periodo y no tomadas por otra liquidación: en Don Franco cada
      // consumo es una cuota que vence el mismo día y la liquidación se genera
      // después del mes, así que con BETWEEN nunca entraban. El cobro efectivo
      // ocurre al pagar la liquidación (neteado dentro del EGRESO_SALARIO).
      // Tope: el descuento no deja el neto en negativo (la cuota que no entra
      // entera va por lo que alcanza y el resto queda para la próxima).
      const advertencias: string[] = [];
      const cpcCuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
      // Cuotas elegidas a mano (ítems manuales CPC_CUOTA que sobreviven a la
      // regeneración): re-enlazarlas y no duplicarlas.
      const manualesCpc = await itemRepo.find({ where: { liquidacion: { id: liq.id } as any, manual: true, referenciaTipo: 'CPC_CUOTA' } });
      const cuotasManuales = new Set<number>();
      for (const it of manualesCpc) {
        if (!it.referenciaId) continue;
        cuotasManuales.add(it.referenciaId);
        await cpcCuotaRepo.createQueryBuilder().update(CuentaPorCobrarCuota)
          .set({ liquidacionId: liq.id })
          .where('id = :id AND liquidacion_id IS NULL AND estado IN (:...ests)', {
            id: it.referenciaId,
            ests: [CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL],
          })
          .execute();
      }
      const clienteIds = await clienteIdsDePersona(queryRunner.manager, funcionario.persona?.id);
      if (clienteIds.length) {
        const parciales = await itemRepo.find({ where: { liquidacion: { id: liq.id } as any } });
        let netoDisponible = (await recalcularTotales(parciales)).neto;
        const cpcCuotas = await cpcCuotaRepo.createQueryBuilder('c')
          .innerJoinAndSelect('c.cuentaPorCobrar', 'cpc')
          .where('cpc.cliente_id IN (:...cids)', { cids: clienteIds })
          .andWhere('cpc.estado = :cest', { cest: CuentaPorCobrarEstado.ACTIVO })
          .andWhere('c.estado IN (:...ests)', {
            ests: [CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL],
          })
          .andWhere('c.fechaVencimiento <= :ff', { ff: isoDate(fechaFin) })
          .andWhere('(c.liquidacion_id IS NULL OR c.liquidacion_id = :lid)', { lid: liq.id })
          .orderBy('c.fechaVencimiento', 'ASC')
          .addOrderBy('c.id', 'ASC')
          .getMany();
        let sinLugar = 0;
        for (const c of cpcCuotas) {
          if (cuotasManuales.has(c.id)) continue;
          const saldo = +(Number(c.monto) - Number(c.montoCobrado)).toFixed(2);
          if (!(saldo > 0)) continue;
          const monto = +Math.min(saldo, Math.max(0, netoDisponible)).toFixed(2);
          if (monto <= 0) { sinLugar++; continue; }
          const venc = fechaTexto(c.fechaVencimiento);
          await crearItem('CREDITO_CONSUMO', `Consumo ${venc} - ${c.cuentaPorCobrar?.descripcion || 'consumo a crédito'}`, monto, LiquidacionItemTipo.DESCUENTO, c.id, 'CPC_CUOTA');
          netoDisponible = +(netoDisponible - monto).toFixed(2);
          c.liquidacionId = liq.id;
          await cpcCuotaRepo.save(c);
        }
        if (sinLugar) advertencias.push(`${sinLugar} consumo(s) a crédito no entraron porque el neto llegó a 0: quedan para la próxima liquidación.`);
      }

      // Freno contra el doble descuento: una liquidación PAGADA de este
      // funcionario con consumos a crédito cargados a mano (sin enlace a la
      // cuota y sin cerrar) puede haber cobrado ya
      // (a mano) consumos que este borrador vuelve a tomar.
      const tomados = await itemRepo.createQueryBuilder('it')
        .innerJoin(CuentaPorCobrarCuota, 'c', 'c.id = it.referencia_id')
        .select(['MIN(c.fecha_vencimiento) AS desde', 'MAX(c.fecha_vencimiento) AS hasta', 'COUNT(*) AS n'])
        .where('it.liquidacion_id = :lid AND it.referencia_tipo = :rt', { lid: liq.id, rt: 'CPC_CUOTA' })
        .getRawOne();
      if (tomados && Number(tomados.n) > 0) {
        const pagadasConManual = await liqRepo.createQueryBuilder('l')
          .innerJoin(LiquidacionItem, 'li', 'li.liquidacion_id = l.id')
          .where('l.funcionario_id = :fid', { fid: funcionarioId })
          .andWhere('l.estado = :est', { est: LiquidacionSueldoEstado.PAGADA })
          .innerJoin(LiquidacionConcepto, 'lc', 'lc.id = li.concepto_id AND lc.codigo = :cc', { cc: 'CREDITO_CONSUMO' })
          .andWhere('li.manual = :m AND li.tipo = :t AND li.referencia_id IS NULL', { m: true, t: LiquidacionItemTipo.DESCUENTO })
          // Farmacia se cargó con el mismo concepto pero no es consumo del local.
          .andWhere("UPPER(li.descripcion) NOT LIKE '%FARM%' AND UPPER(li.descripcion) NOT LIKE '%FARN%'")
          // ...que todavía no cerró todo su monto contra cuotas (cobrar-cpc-por-liquidacion).
          .andWhere(`li.monto - COALESCE((SELECT SUM(mc.monto) FROM movimientos_cliente mc
            WHERE mc.liquidacion_item_id = li.id AND mc.tipo = :pago), 0) > 0.005`, { pago: MovimientoClienteTipo.PAGO })
          .andWhere('l.fecha_pago >= :desde', { desde: fechaTexto(tomados.desde) })
          .select(['l.id AS id', 'l.periodo AS periodo'])
          .groupBy('l.id').addGroupBy('l.periodo')
          .getRawMany();
        if (pagadasConManual.length) {
          const lista = pagadasConManual.map((r: any) => `#${r.id} (${r.periodo})`).join(', ');
          advertencias.push(`Revisá los consumos a crédito: las liquidaciones pagadas ${lista} tienen descuentos manuales y pueden haber cobrado ya algunos de estos consumos. Si es así, cerralos contra esa liquidación (cobrar-cpc-por-liquidacion) y regenerá el borrador antes de aprobar.`);
        }
      }

      // Recalcular totales
      const allItems = await itemRepo.find({ where: { liquidacion: { id: liq.id } as any } });
      const tot = await recalcularTotales(allItems);
      liq.totalHaberes = tot.haberes;
      liq.totalDescuentos = tot.descuentos;
      liq.totalNeto = tot.neto;
      await setEntityUserTracking(dataSource, liq, userId, true);
      await liqRepo.save(liq);
      // DR: el borrador regenerado ya refleja las multas/premios aprobados o anulados.
      await queryRunner.manager.getRepository(DrLiquidacionPendiente).update(
        { funcionario: { id: funcionarioId }, mes: periodo, estado: 'PENDIENTE' } as any,
        { estado: 'RESUELTO', resueltoEn: new Date() } as any,
      );

      await queryRunner.commitTransaction();
      return Object.assign(liq, { advertencias });
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error generar-liquidacion-borrador:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  /**
   * Cuotas de consumo a crédito abiertas de un funcionario (todas sus fichas de
   * cliente): PENDIENTE/PARCIAL, CPC ACTIVO y libres (o ya en `liquidacionId`).
   * Para el selector de «Agregar consumos a crédito» y para cerrar lo descontado
   * a mano con `cobrar-cpc-por-liquidacion`.
   */
  ipcMain.handle('get-cpc-cuotas-abiertas-funcionario', async (_e, funcionarioId: number, liquidacionId?: number) => {
    const funcionario = await dataSource.getRepository(Funcionario).findOne({ where: { id: funcionarioId }, relations: ['persona'] });
    if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);
    const clienteIds = await clienteIdsDePersona(dataSource.manager, funcionario.persona?.id);
    if (!clienteIds.length) return [];
    const qb = dataSource.getRepository(CuentaPorCobrarCuota).createQueryBuilder('c')
      .innerJoinAndSelect('c.cuentaPorCobrar', 'cpc')
      .leftJoinAndSelect('cpc.cliente', 'cli')
      .where('cpc.cliente_id IN (:...cids)', { cids: clienteIds })
      .andWhere('cpc.estado = :cest', { cest: CuentaPorCobrarEstado.ACTIVO })
      .andWhere('c.estado IN (:...ests)', { ests: [CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL] })
      .orderBy('c.fechaVencimiento', 'ASC')
      .addOrderBy('c.id', 'ASC');
    if (liquidacionId) qb.andWhere('(c.liquidacion_id IS NULL OR c.liquidacion_id = :lid)', { lid: liquidacionId });
    else qb.andWhere('c.liquidacion_id IS NULL');
    const cuotas = await qb.getMany();
    return cuotas.map((c: any) => ({
      cuotaId: c.id,
      cuentaPorCobrarId: c.cuentaPorCobrar.id,
      clienteId: c.cuentaPorCobrar.cliente?.id,
      numero: c.numero,
      fechaVencimiento: fechaTexto(c.fechaVencimiento),
      descripcion: c.cuentaPorCobrar.descripcion,
      monto: Number(c.monto),
      montoCobrado: Number(c.montoCobrado),
      saldo: +(Number(c.monto) - Number(c.montoCobrado)).toFixed(2),
      liquidacionId: c.liquidacionId ?? null,
    }));
  });

  ipcMain.handle('agregar-item-liquidacion', async (_e, liquidacionId: number, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_GENERAR');
      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const itemRepo = queryRunner.manager.getRepository(LiquidacionItem);
      const liq = await liqRepo.findOne({ where: { id: liquidacionId }, relations: ['funcionario', 'funcionario.persona'] });
      if (!liq) throw new Error(`Liquidacion ${liquidacionId} no encontrada`);
      if (liq.estado !== LiquidacionSueldoEstado.BORRADOR) throw new Error('Solo se pueden agregar items en BORRADOR');

      const userId = getCurrentUser()?.id;
      const conceptoRepo = queryRunner.manager.getRepository(LiquidacionConcepto);
      const conceptoCredito = await conceptoRepo.findOne({ where: { codigo: 'CREDITO_CONSUMO' } });
      const cpcCuotaIds: number[] = Array.isArray(data?.cpcCuotaIds) ? data.cpcCuotaIds.map(Number).filter((n: number) => n > 0) : [];
      const esCredito = cpcCuotaIds.length > 0 || (!!conceptoCredito && Number(data?.conceptoId) === conceptoCredito.id);
      const creados: LiquidacionItem[] = [];

      if (esCredito) {
        // Un consumo a crédito cargado a mano sin la cuota no la cobra: queda
        // abierta y se vuelve a descontar después (así se desfasó sep-nov 2026).
        if (!cpcCuotaIds.length) throw new Error('Los consumos a crédito se agregan eligiendo las cuotas abiertas (no a mano)');
        const clienteIds = await clienteIdsDePersona(queryRunner.manager, liq.funcionario?.persona?.id);
        const cpcCuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
        const yaEnItems = new Set((await itemRepo.find({ where: { liquidacion: { id: liq.id } as any, referenciaTipo: 'CPC_CUOTA' } }))
          .map((i) => i.referenciaId));
        for (const cuotaId of Array.from(new Set(cpcCuotaIds))) {
          const cuota: any = await cpcCuotaRepo.findOne({ where: { id: cuotaId }, relations: ['cuentaPorCobrar', 'cuentaPorCobrar.cliente'] });
          if (!cuota) throw new Error(`Cuota ${cuotaId} no encontrada`);
          if (!clienteIds.includes(cuota.cuentaPorCobrar?.cliente?.id)) throw new Error(`La cuota ${cuotaId} no es de este funcionario`);
          if (cuota.cuentaPorCobrar.estado !== CuentaPorCobrarEstado.ACTIVO
            || ![CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL].includes(cuota.estado)) {
            throw new Error(`La cuota ${cuotaId} no está abierta`);
          }
          if (cuota.liquidacionId && cuota.liquidacionId !== liq.id) throw new Error(`La cuota ${cuotaId} ya está en la liquidación #${cuota.liquidacionId}`);
          if (yaEnItems.has(cuotaId)) throw new Error(`La cuota ${cuotaId} ya está en esta liquidación`);
          const saldo = +(Number(cuota.monto) - Number(cuota.montoCobrado)).toFixed(2);
          if (!(saldo > 0)) continue;
          const venc = fechaTexto(cuota.fechaVencimiento);
          const item = itemRepo.create({
            liquidacion: liq,
            concepto: conceptoCredito || undefined,
            descripcion: `Consumo ${venc} - ${cuota.cuentaPorCobrar.descripcion || 'consumo a crédito'}`,
            monto: saldo,
            tipo: LiquidacionItemTipo.DESCUENTO,
            referenciaId: cuota.id,
            referenciaTipo: 'CPC_CUOTA',
            manual: true,
            observacion: data?.observacion,
          });
          await setEntityUserTracking(dataSource, item, userId, false);
          creados.push(await itemRepo.save(item));
          cuota.liquidacionId = liq.id;
          await cpcCuotaRepo.save(cuota);
        }
      } else {
        const item = itemRepo.create({
          liquidacion: liq,
          concepto: data.conceptoId ? { id: data.conceptoId } as any : undefined,
          descripcion: data.descripcion,
          monto: Math.abs(Number(data.monto)),
          tipo: data.tipo || LiquidacionItemTipo.HABER,
          manual: true,
          observacion: data.observacion,
        });
        await setEntityUserTracking(dataSource, item, userId, false);
        creados.push(await itemRepo.save(item));
      }

      const allItems = await itemRepo.find({ where: { liquidacion: { id: liq.id } as any } });
      const tot = await recalcularTotales(allItems);
      if (esCredito && tot.neto < 0) throw new Error(`Los consumos elegidos dejan el neto en negativo (${tot.neto}): elegí menos cuotas`);
      liq.totalHaberes = tot.haberes;
      liq.totalDescuentos = tot.descuentos;
      liq.totalNeto = tot.neto;
      await setEntityUserTracking(dataSource, liq, userId, true);
      await liqRepo.save(liq);

      await queryRunner.commitTransaction();
      return esCredito ? creados : creados[0];
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error agregar-item-liquidacion:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('eliminar-item-liquidacion', async (_e, itemId: number) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_GENERAR');
      const itemRepo = queryRunner.manager.getRepository(LiquidacionItem);
      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const item = await itemRepo.findOne({ where: { id: itemId }, relations: ['liquidacion'] });
      if (!item) throw new Error(`Item ${itemId} no encontrado`);
      const liq = await liqRepo.findOne({ where: { id: item.liquidacion.id } });
      if (!liq || liq.estado !== LiquidacionSueldoEstado.BORRADOR) throw new Error('Solo BORRADOR permite eliminar items');
      if (item.referenciaTipo === 'CPC_CUOTA' && item.referenciaId) {
        // Liberar la cuota para que la tome otra liquidación (o la próxima).
        await queryRunner.manager.getRepository(CuentaPorCobrarCuota).createQueryBuilder()
          .update(CuentaPorCobrarCuota)
          .set({ liquidacionId: null as any })
          .where('id = :id AND liquidacion_id = :lid', { id: item.referenciaId, lid: liq.id })
          .execute();
      }
      await itemRepo.delete(itemId);

      const allItems = await itemRepo.find({ where: { liquidacion: { id: liq.id } as any } });
      const tot = await recalcularTotales(allItems);
      liq.totalHaberes = tot.haberes;
      liq.totalDescuentos = tot.descuentos;
      liq.totalNeto = tot.neto;
      await setEntityUserTracking(dataSource, liq, getCurrentUser()?.id, true);
      await liqRepo.save(liq);

      await queryRunner.commitTransaction();
      return { success: true };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  /**
   * Cierra cuotas de consumo a crédito que RRHH ya descontó A MANO en una
   * liquidación PAGADA (un ítem DESCUENTO manual sin referencia, el «convenio»).
   * Cobra cada cuota contra ese ítem sin mover caja (el dinero ya quedó neteado
   * en el EGRESO_SALARIO de esa liquidación) y deja el cobro enlazado al ítem.
   * Tope: lo cobrado contra el ítem no supera su monto.
   *
   * params: [{ liquidacionId, itemId, cuotas: [{ cuotaId, monto? }], observacion? }]
   * (monto por defecto = saldo de la cuota).
   */
  ipcMain.handle('cobrar-cpc-por-liquidacion', async (_e, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_PAGAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const liquidacionId = Number(payload?.liquidacionId);
      const itemId = Number(payload?.itemId);
      const cuotasIn: Array<{ cuotaId: number; monto?: number }> = Array.isArray(payload?.cuotas) ? payload.cuotas : [];
      if (!liquidacionId || !itemId || !cuotasIn.length) throw new Error('Faltan liquidacionId, itemId o cuotas');
      const liq = await queryRunner.manager.findOne(LiquidacionSueldo, { where: { id: liquidacionId }, relations: ['funcionario', 'funcionario.persona'] });
      if (!liq) throw new Error(`Liquidacion ${liquidacionId} no encontrada`);
      if (liq.estado !== LiquidacionSueldoEstado.PAGADA) throw new Error('Solo se cierran consumos contra una liquidación PAGADA');
      const item = await queryRunner.manager.findOne(LiquidacionItem, { where: { id: itemId }, relations: ['liquidacion'] });
      if (!item || item.liquidacion?.id !== liq.id) throw new Error(`El ítem ${itemId} no es de la liquidación #${liq.id}`);
      if (!item.manual || item.tipo !== LiquidacionItemTipo.DESCUENTO || item.referenciaId || item.referenciaTipo) {
        throw new Error('El ítem tiene que ser un descuento cargado a mano, sin enlace');
      }
      const yaCobrado = Number((await queryRunner.manager.getRepository(MovimientoCliente).createQueryBuilder('m')
        .select('COALESCE(SUM(m.monto), 0)', 's')
        .where('m.liquidacion_item_id = :iid AND m.tipo = :t', { iid: item.id, t: MovimientoClienteTipo.PAGO })
        .getRawOne())?.s || 0);
      let disponible = +(Number(item.monto) - yaCobrado).toFixed(2);

      const clienteIds = await clienteIdsDePersona(queryRunner.manager, liq.funcionario?.persona?.id);
      const cpcCuotaRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
      const userId = getCurrentUser()?.id;
      const userEntity = userId ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } }) : null;
      const vistos = new Set<number>();
      const plan: Array<{ cuotaId: number; monto: number }> = [];
      for (const c of cuotasIn) {
        const cuotaId = Number(c?.cuotaId);
        if (vistos.has(cuotaId)) throw new Error(`La cuota ${cuotaId} está repetida`);
        vistos.add(cuotaId);
        const cuota: any = await cpcCuotaRepo.findOne({ where: { id: cuotaId }, relations: ['cuentaPorCobrar', 'cuentaPorCobrar.cliente'] });
        if (!cuota) throw new Error(`Cuota ${cuotaId} no encontrada`);
        if (!clienteIds.includes(cuota.cuentaPorCobrar?.cliente?.id)) throw new Error(`La cuota ${cuotaId} no es de este funcionario`);
        if (cuota.cuentaPorCobrar.estado !== CuentaPorCobrarEstado.ACTIVO
          || ![CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL].includes(cuota.estado)) {
          throw new Error(`La cuota ${cuotaId} no está abierta`);
        }
        if (cuota.liquidacionId && cuota.liquidacionId !== liq.id) throw new Error(`La cuota ${cuotaId} está tomada por la liquidación #${cuota.liquidacionId}`);
        const saldo = +(Number(cuota.monto) - Number(cuota.montoCobrado)).toFixed(2);
        const monto = c?.monto === undefined || c?.monto === null ? saldo : +Number(c.monto).toFixed(2);
        if (!(monto > 0)) throw new Error(`Monto inválido para la cuota ${cuotaId}`);
        if (monto > saldo + 0.005) throw new Error(`La cuota ${cuotaId} tiene saldo ${saldo}: no se puede cobrar ${monto}`);
        plan.push({ cuotaId, monto });
      }
      const total = +plan.reduce((a, p) => a + p.monto, 0).toFixed(2);
      if (total > disponible + 0.005) {
        throw new Error(`Se pasa del descuento: el ítem «${item.descripcion}» tiene ${disponible} disponible y se quieren cobrar ${total}`);
      }
      const obsExtra = payload?.observacion ? ` - ${String(payload.observacion).slice(0, 200)}` : '';
      const resultado: any[] = [];
      for (const p of plan) {
        const r = await cobrarCuotaCpcEnLiquidacion(queryRunner, dataSource, {
          cuotaId: p.cuotaId,
          monto: p.monto,
          liq,
          itemId: item.id,
          observacion: `LIQUIDACION ${liq.periodo} #${liq.id} - DESCUENTO MANUAL ITEM #${item.id}${obsExtra} - COBRO CUOTA`,
          userId,
          userEntity,
        });
        disponible = +(disponible - r.cobrado).toFixed(2);
        resultado.push({ cuotaId: p.cuotaId, cobrado: r.cobrado, estado: r.estado, montoCobrado: r.montoCobrado, movimientoClienteId: r.movimientoId });
      }
      await queryRunner.commitTransaction();
      return { liquidacionId: liq.id, itemId: item.id, cobrado: total, disponibleItem: disponible, cuotas: resultado };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error cobrar-cpc-por-liquidacion:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  /**
   * Deshace un cobro hecho con `cobrar-cpc-por-liquidacion` (un MovimientoCliente
   * enlazado a un descuento manual): la cuota vuelve a abrirse y el saldo del
   * cliente se restituye. params: [{ movimientoClienteId }]
   */
  ipcMain.handle('revertir-cobro-cpc-por-liquidacion', async (_e, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_PAGAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const movId = Number(payload?.movimientoClienteId);
      const mov = await queryRunner.manager.findOne(MovimientoCliente, { where: { id: movId }, relations: ['cliente'] });
      if (!mov) throw new Error(`Movimiento ${movId} no encontrado`);
      if (mov.tipo !== MovimientoClienteTipo.PAGO || !mov.liquidacionItemId) throw new Error('No es un cobro de liquidación');
      const item = await queryRunner.manager.findOne(LiquidacionItem, { where: { id: mov.liquidacionItemId }, relations: ['liquidacion'] });
      if (!item || item.referenciaTipo || !item.manual) {
        throw new Error('Solo se revierten acá los cierres contra un descuento manual; el resto se revierte anulando la liquidación');
      }
      const monto = await revertirMovimientoCobroCpc(queryRunner, dataSource, mov, item.liquidacion.id, getCurrentUser()?.id);
      await queryRunner.commitTransaction();
      return { success: true, movimientoClienteId: movId, revertido: monto };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('aprobar-liquidacion-sueldo', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_APROBAR');
    const repo = dataSource.getRepository(LiquidacionSueldo);
    const liq = await repo.findOne({ where: { id } });
    if (!liq) throw new Error(`Liquidacion ${id} no encontrada`);
    if (liq.estado !== LiquidacionSueldoEstado.BORRADOR) throw new Error('Solo BORRADOR puede ser aprobado');
    const liqFull: any = await repo.findOne({ where: { id }, relations: ['funcionario'] });
    const drPend = await dataSource.getRepository(DrLiquidacionPendiente).count({
      where: { funcionario: { id: liqFull?.funcionario?.id }, mes: liq.periodo, estado: 'PENDIENTE' } as any,
    });
    if (drPend) throw new Error('LIQUIDACIÓN DESACTUALIZADA POR CAMBIOS DE DISCIPLINA: REGENERÁ EL BORRADOR ANTES DE APROBAR');
    const userId = getCurrentUser()?.id;
    const userEntity = userId
      ? await dataSource.getRepository(Usuario).findOne({ where: { id: userId } })
      : null;
    liq.estado = LiquidacionSueldoEstado.APROBADA;
    liq.aprobadoPor = userEntity || undefined;
    liq.fechaAprobacion = new Date();
    await setEntityUserTracking(dataSource, liq, userId, true);
    return await repo.save(liq);
  });

  ipcMain.handle('volver-borrador-liquidacion-sueldo', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_APROBAR');
    const repo = dataSource.getRepository(LiquidacionSueldo);
    const liq = await repo.findOne({ where: { id } });
    if (!liq) throw new Error(`Liquidacion ${id} no encontrada`);
    if (liq.estado !== LiquidacionSueldoEstado.APROBADA) throw new Error('Solo APROBADA puede volver a BORRADOR');
    liq.estado = LiquidacionSueldoEstado.BORRADOR;
    liq.aprobadoPor = undefined;
    liq.fechaAprobacion = undefined;
    await setEntityUserTracking(dataSource, liq, getCurrentUser()?.id, true);
    return await repo.save(liq);
  });

  ipcMain.handle('pagar-liquidacion-sueldo', async (_e, id: number, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_PAGAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const itemRepo = queryRunner.manager.getRepository(LiquidacionItem);
      const liq = await liqRepo.findOne({
        where: { id },
        relations: ['funcionario', 'funcionario.persona', 'monedaPago'],
      });
      if (!liq) throw new Error(`Liquidacion ${id} no encontrada`);
      if (liq.estado !== LiquidacionSueldoEstado.APROBADA) throw new Error('Solo APROBADA puede ser pagada');

      const fuente = payload?.fuente || 'CAJA_MAYOR';
      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;
      const monto = Number(liq.totalNeto);
      let movId: number | null = null;

      if (fuente === 'CUENTA_BANCARIA') {
        // Pago desde cuenta bancaria: debita el saldo, sin movimiento de Caja Mayor.
        const cuentaBancariaId = payload?.cuentaBancariaId;
        if (!cuentaBancariaId) throw new Error('Falta cuentaBancariaId');
        const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
        const cb = await cbRepo.findOne({ where: { id: cuentaBancariaId } });
        if (!cb) throw new Error('Cuenta bancaria no encontrada');
        cb.saldo = await ajustarSaldoCuentaBancaria(queryRunner.manager, cb.id, -monto);
        await registrarMovimientoBancario(queryRunner.manager, dataSource, {
          cuentaBancariaId,
          tipo: MovimientoBancarioTipo.SALIDA_MANUAL,
          monto,
          observacion: `LIQUIDACION ${liq.periodo} - ${liq.funcionario.persona?.nombre || ''} ${liq.funcionario.persona?.apellido || ''}`.trim(),
          responsable: userEntity,
        });
        liq.cuentaBancariaId = cuentaBancariaId;
      } else {
        const cajaMayorId = payload?.cajaMayorId;
        const monedaId = payload?.monedaId || liq.monedaPago?.id;
        const formaPagoId = payload?.formaPagoId;
        if (!cajaMayorId || !monedaId || !formaPagoId) throw new Error('Faltan datos para el pago');

        const obs = `LIQUIDACION ${liq.periodo} - ${liq.funcionario.persona?.nombre || ''} ${liq.funcionario.persona?.apellido || ''}`.trim();
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId } as any,
          tipoMovimiento: TipoMovimiento.EGRESO_SALARIO,
          moneda: { id: monedaId } as any,
          formaPago: { id: formaPagoId } as any,
          monto,
          fecha: new Date(),
          observacion: obs,
          liquidacionSueldoId: liq.id,
          responsable: userEntity || undefined,
        });
        await setEntityUserTracking(dataSource, movimiento, userId, false);
        const movSaved = await queryRunner.manager.save(CajaMayorMovimiento, movimiento);
        movId = movSaved.id;

        await actualizarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, monto, TipoMovimiento.EGRESO_SALARIO);
      }

      await aplicarEstadoPagoLiquidacion(queryRunner, liq, userId, userEntity, dataSource);

      liq.estado = LiquidacionSueldoEstado.PAGADA;
      liq.fechaPago = new Date();
      if (movId) liq.movimientoId = movId;
      await setEntityUserTracking(dataSource, liq, userId, true);
      await liqRepo.save(liq);

      await queryRunner.commitTransaction();
      return liq;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error pagar-liquidacion-sueldo:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('anular-liquidacion-sueldo', async (_e, id: number, motivo: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_PAGAR');
    // La reversa de caja de este handler va por `liq.movimientoId`, que queda en
    // null cuando el pago fue consolidado (puede haber N movimientos).
    await bloquearSiPagoConsolidado(dataSource, PagoOrigenTipo.LIQUIDACION_SUELDO, id, `La liquidación #${id}`);
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const liq = await liqRepo.findOne({ where: { id }, relations: ['monedaPago'] });
      if (!liq) throw new Error(`Liquidacion ${id} no encontrada`);
      if (liq.estado === LiquidacionSueldoEstado.ANULADA) throw new Error('La liquidacion ya esta anulada');

      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;

      const eraPagada = liq.estado === LiquidacionSueldoEstado.PAGADA;

      // Revertir efectos sobre entidades referenciadas (sólo si estaba PAGADA)
      if (eraPagada) {
        await revertirEstadoPagoLiquidacion(queryRunner, liq, userId, dataSource);

        // Contra-movimiento en Caja Mayor por el total neto pagado
        if (liq.movimientoId) {
          const movOriginal = await queryRunner.manager.findOne(CajaMayorMovimiento, {
            where: { id: liq.movimientoId },
            relations: ['cajaMayor', 'moneda', 'formaPago'],
          });
          if (movOriginal) {
            const cajaMayorId = movOriginal.cajaMayor?.id;
            const monedaId = movOriginal.moneda?.id;
            const formaPagoId = movOriginal.formaPago?.id;
            if (cajaMayorId && monedaId && formaPagoId) {
              const contra = queryRunner.manager.create(CajaMayorMovimiento, {
                cajaMayor: { id: cajaMayorId } as any,
                tipoMovimiento: TipoMovimiento.AJUSTE_POSITIVO,
                moneda: { id: monedaId } as any,
                formaPago: { id: formaPagoId } as any,
                monto: movOriginal.monto,
                fecha: new Date(),
                observacion: `ANULACION LIQ #${liq.id}` + (motivo ? ` - ${motivo}` : ''),
                referenciaAnulacion: movOriginal,
                liquidacionSueldoId: liq.id,
                responsable: userEntity || undefined,
              });
              await setEntityUserTracking(dataSource, contra, userId, false);
              await queryRunner.manager.save(CajaMayorMovimiento, contra);
              await actualizarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, Number(movOriginal.monto), TipoMovimiento.AJUSTE_POSITIVO);
            }
          }
        }

        // Si el pago fue desde una cuenta bancaria, revertir el saldo debitado.
        if (liq.cuentaBancariaId) {
          const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
          const cb = await cbRepo.findOne({ where: { id: liq.cuentaBancariaId } });
          if (cb) {
            cb.saldo = await ajustarSaldoCuentaBancaria(queryRunner.manager, cb.id, Number(liq.totalNeto));
            await registrarMovimientoBancario(queryRunner.manager, dataSource, {
              cuentaBancariaId: liq.cuentaBancariaId,
              tipo: MovimientoBancarioTipo.AJUSTE_POSITIVO,
              monto: Number(liq.totalNeto),
              observacion: `ANULACION LIQ #${liq.id}` + (motivo ? ` - ${motivo}` : ''),
              responsable: userEntity,
            });
          }
        }
      }

      liq.estado = LiquidacionSueldoEstado.ANULADA;
      liq.observacion = (liq.observacion ? liq.observacion + ' | ' : '') + 'ANULADA: ' + (motivo || '');
      await setEntityUserTracking(dataSource, liq, userId, true);
      await liqRepo.save(liq);

      await queryRunner.commitTransaction();
      return liq;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  // ============= BONOS =============
  ipcMain.handle('get-bonos', async (_e, filtros: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERMISOS_LECTURA_BONOS);
    const repo = dataSource.getRepository(Bono);
    const qb = repo.createQueryBuilder('b')
      .leftJoinAndSelect('b.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .orderBy('b.fecha', 'DESC');
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    if (filtros?.fechaDesde && filtros?.fechaHasta) {
      qb.andWhere('b.fecha BETWEEN :fd AND :ff', { fd: filtros.fechaDesde, ff: filtros.fechaHasta });
    }
    if (filtros?.soloVigentes) qb.andWhere('b.anulado = :a', { a: false });
    return await qb.getMany();
  });

  ipcMain.handle('create-bono', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_BONO_OTORGAR');
    const repo = dataSource.getRepository(Bono);
    const funcionario = await dataSource.getRepository(Funcionario).findOne({ where: { id: data.funcionarioId } });
    if (!funcionario) throw new Error(`Funcionario ${data.funcionarioId} no encontrado`);
    bloquearSiEsDr(data.motivo, 'BONO');
    const entity = repo.create({
      funcionario,
      tipo: data.tipo,
      monto: data.monto,
      fecha: parseLocalDate(data.fecha)!,
      motivo: data.motivo,
      esRecurrente: data.esRecurrente === true,
      frecuencia: data.frecuencia,
      anulado: false,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('anular-bono', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_BONO_OTORGAR');
    const repo = dataSource.getRepository(Bono);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Bono ${id} no encontrado`);
    bloquearSiEsDr(existing.motivo, 'BONO');
    existing.anulado = true;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  // ============= AGUINALDOS =============
  ipcMain.handle('get-aguinaldos', async (_e, filtros: any) => {
    const repo = dataSource.getRepository(Aguinaldo);
    const qb = repo.createQueryBuilder('a')
      .leftJoinAndSelect('a.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .orderBy('a.anio', 'DESC');
    if (filtros?.anio) qb.andWhere('a.anio = :anio', { anio: filtros.anio });
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    return await qb.getMany();
  });

  ipcMain.handle('calcular-aguinaldos-anio', async (_e, anio: number) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_GENERAR');
      const aguiRepo = queryRunner.manager.getRepository(Aguinaldo);
      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const funcRepo = queryRunner.manager.getRepository(Funcionario);
      const funcionarios = await funcRepo.find();
      const userId = getCurrentUser()?.id;
      const results = [];
      for (const f of funcionarios) {
        const liqsAnio = await liqRepo.createQueryBuilder('l')
          .where('l.funcionario_id = :fid', { fid: f.id })
          .andWhere('l.periodo LIKE :anio', { anio: `${anio}-%` })
          .andWhere('l.estado IN (:...estados)', { estados: [LiquidacionSueldoEstado.APROBADA, LiquidacionSueldoEstado.PAGADA] })
          .getMany();
        const totalAnio = liqsAnio.reduce((sum, l) => sum + Number(l.totalHaberes), 0);
        const monto = +(totalAnio / 12).toFixed(2);
        let agui = await aguiRepo.findOne({ where: { funcionario: { id: f.id } as any, anio } });
        if (agui) {
          if (agui.estado !== AguinaldoEstado.PAGADO) {
            agui.montoCalculado = monto;
            agui.mesesTrabajados = liqsAnio.length;
            await aguiRepo.save(agui);
          }
        } else if (monto > 0) {
          agui = aguiRepo.create({
            funcionario: f,
            anio,
            montoCalculado: monto,
            mesesTrabajados: liqsAnio.length,
            estado: AguinaldoEstado.CALCULADO,
          });
          await setEntityUserTracking(dataSource, agui, userId, false);
          await aguiRepo.save(agui);
        }
        if (agui) results.push(agui);
      }
      await queryRunner.commitTransaction();
      return results;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error calcular-aguinaldos-anio:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });
}
