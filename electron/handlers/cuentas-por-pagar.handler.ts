import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CompraCategoria } from '../../src/app/database/entities/compras/compra-categoria.entity';
import { CompraCuota } from '../../src/app/database/entities/compras/compra-cuota.entity';
import { CuentaPorPagar } from '../../src/app/database/entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarCuota } from '../../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity';
import {
  CuotaEstado,
  CuentaPorPagarEstado,
  CuentaPorPagarTipo,
} from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { CajaMayorSaldo } from '../../src/app/database/entities/financiero/caja-mayor-saldo.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { MovimientoBancarioTipo } from '../../src/app/database/entities/financiero/movimiento-bancario.entity';
import { registrarMovimientoBancario } from '../utils/movimiento-bancario.utils';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { PagoCuotaCppDetalle } from '../../src/app/database/entities/financiero/pago-cuota-cpp-detalle.entity';
import { getCotizacionCompraLocal } from '../utils/moneda.utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';

// Helper: actualiza/crea saldo cajaMayor restando un monto (para egresos de cuotas)
async function descontarSaldoCajaMayor(
  queryRunner: any,
  cajaMayorId: number,
  monedaId: number,
  formaPagoId: number,
  monto: number,
): Promise<void> {
  const saldoRepo = queryRunner.manager.getRepository(CajaMayorSaldo);
  let saldo = await saldoRepo.findOne({
    where: {
      cajaMayor: { id: cajaMayorId },
      moneda: { id: monedaId },
      formaPago: { id: formaPagoId },
    },
    relations: ['cajaMayor', 'moneda', 'formaPago'],
  });
  if (!saldo) {
    saldo = saldoRepo.create({
      cajaMayor: { id: cajaMayorId } as any,
      moneda: { id: monedaId } as any,
      formaPago: { id: formaPagoId } as any,
      saldo: 0,
    });
  }
  saldo.saldo = Number(saldo.saldo) - Number(monto);
  await queryRunner.manager.save(CajaMayorSaldo, saldo);
}

// Helper: actualiza/crea saldo cajaMayor sumando un monto (para ingresos)
async function sumarSaldoCajaMayor(
  queryRunner: any,
  cajaMayorId: number,
  monedaId: number,
  formaPagoId: number,
  monto: number,
): Promise<void> {
  const saldoRepo = queryRunner.manager.getRepository(CajaMayorSaldo);
  let saldo = await saldoRepo.findOne({
    where: {
      cajaMayor: { id: cajaMayorId },
      moneda: { id: monedaId },
      formaPago: { id: formaPagoId },
    },
    relations: ['cajaMayor', 'moneda', 'formaPago'],
  });
  if (!saldo) {
    saldo = saldoRepo.create({
      cajaMayor: { id: cajaMayorId } as any,
      moneda: { id: monedaId } as any,
      formaPago: { id: formaPagoId } as any,
      saldo: 0,
    });
  }
  saldo.saldo = Number(saldo.saldo) + Number(monto);
  await queryRunner.manager.save(CajaMayorSaldo, saldo);
}

function calcularEstadoCuota(monto: number, montoPagado: number): CuotaEstado {
  if (montoPagado >= monto) return CuotaEstado.PAGADA;
  if (montoPagado > 0) return CuotaEstado.PARCIAL;
  return CuotaEstado.PENDIENTE;
}

// Aplica SOLO el estado de dominio del pago de una cuota (cuota + CPP), sin
// asentar en Caja Mayor ni banco. Lo usan `aplicarPagoCpoCuota` (que luego
// asienta el egreso en Caja Mayor / banco) y el pago desde el cajón del PdV
// (que asienta un EgresoCaja). NO commitea la transacción.
export async function aplicarEstadoPagoCuota(
  queryRunner: any,
  cuotaId: number,
  monto: number,
  currentUser: Usuario | null,
  dataSource: DataSource,
): Promise<{ cuota: CuentaPorPagarCuota; cpp: CuentaPorPagar | null }> {
  const cuotaRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);
  const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
  const cuota = await cuotaRepo.findOne({
    where: { id: cuotaId },
    relations: ['cuentaPorPagar'],
  });
  if (!cuota) throw new Error(`CuentaPorPagarCuota ${cuotaId} no encontrada`);
  if (cuota.estado === CuotaEstado.PAGADA) throw new Error(`Cuota #${cuota.numero} ya pagada`);
  if (cuota.estado === CuotaEstado.CANCELADA) throw new Error(`Cuota #${cuota.numero} esta anulada`);

  const restante = Number(cuota.monto) - Number(cuota.montoPagado);
  if (monto <= 0 || monto > restante + 0.005) {
    throw new Error(`Monto invalido para cuota #${cuota.numero} (restante: ${restante})`);
  }

  cuota.montoPagado = +(Number(cuota.montoPagado) + monto).toFixed(2);
  cuota.estado = calcularEstadoCuota(Number(cuota.monto), Number(cuota.montoPagado));
  if (cuota.estado === CuotaEstado.PAGADA) {
    cuota.fechaPago = new Date();
  }
  await setEntityUserTracking(dataSource, cuota, currentUser?.id, true);
  await queryRunner.manager.save(CuentaPorPagarCuota, cuota);

  const cpp = await cppRepo.findOne({ where: { id: cuota.cuentaPorPagar.id }, relations: ['cuotas'] });
  if (cpp) {
    // A-05: recomputar montoPagado como la SUMA de las cuotas, no acumular +monto.
    // La acumulación se sobre-sumaba (un pago reintentado, o una anulación que
    // reducía la cuota pero no el cpp, dejaban el cpp "más pagado" de lo real).
    // cpp.cuotas se lee recién ahora, después de guardar la cuota actual, así que
    // la suma ya incluye este pago y es la fuente de verdad. Idempotente.
    cpp.montoPagado = +(cpp.cuotas || []).reduce((s: number, c: any) => s + Number(c.montoPagado), 0).toFixed(2);
    const todasPagadas = (cpp.cuotas || []).every((c: any) => Number(c.montoPagado) >= Number(c.monto) - 0.005);
    if (todasPagadas) cpp.estado = CuentaPorPagarEstado.PAGADO;
    await queryRunner.manager.save(CuentaPorPagar, cpp);
  }

  return { cuota, cpp };
}

// Revierte SOLO el estado de dominio de un pago de cuota: resta `monto` (el monto
// exacto de ese pago, para no pisar otros pagos parciales que la cuota pueda tener)
// y recalcula estados. Lo usa la anulación de un EgresoCaja tipo COMPRA. NO commitea.
export async function revertirEstadoPagoCuota(
  queryRunner: any,
  cuotaId: number,
  monto: number,
  currentUser: Usuario | null,
  dataSource: DataSource,
): Promise<{ cuota: CuentaPorPagarCuota; cpp: CuentaPorPagar | null }> {
  const cuotaRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);
  const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
  const cuota = await cuotaRepo.findOne({
    where: { id: cuotaId },
    relations: ['cuentaPorPagar'],
  });
  if (!cuota) throw new Error(`CuentaPorPagarCuota ${cuotaId} no encontrada`);
  if (cuota.estado === CuotaEstado.CANCELADA) throw new Error(`Cuota #${cuota.numero} esta anulada`);

  const nuevoPagado = +(Number(cuota.montoPagado) - Number(monto)).toFixed(2);
  cuota.montoPagado = nuevoPagado < 0 ? 0 : nuevoPagado;
  cuota.estado = calcularEstadoCuota(Number(cuota.monto), Number(cuota.montoPagado));
  if (cuota.estado !== CuotaEstado.PAGADA) {
    cuota.fechaPago = null as any;
  }
  await setEntityUserTracking(dataSource, cuota, currentUser?.id, true);
  await queryRunner.manager.save(CuentaPorPagarCuota, cuota);

  const cpp = await cppRepo.findOne({ where: { id: cuota.cuentaPorPagar.id }, relations: ['cuotas'] });
  if (cpp) {
    cpp.montoPagado = +(cpp.cuotas || []).reduce((s: number, c: any) => s + Number(c.montoPagado), 0).toFixed(2);
    const todasPagadas = (cpp.cuotas || []).length > 0
      && (cpp.cuotas || []).every((c: any) => Number(c.montoPagado) >= Number(c.monto) - 0.005);
    cpp.estado = todasPagadas ? CuentaPorPagarEstado.PAGADO : CuentaPorPagarEstado.ACTIVO;
    await queryRunner.manager.save(CuentaPorPagar, cpp);
  }

  return { cuota, cpp };
}

// Aplica el pago de una cuota CPP dentro de una transaccion existente.
// Reutilizado por `pagar-cpp-cuota` (1 cuota) y `pagar-cuotas-compras-lote` (N cuotas).
// NO commitea la transaccion: el caller maneja commit/rollback.
export async function aplicarPagoCpoCuota(
  queryRunner: any,
  payload: {
    cuotaId: number;
    monto: number;
    fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA';
    cajaMayorId?: number;
    monedaId?: number;
    formaPagoId?: number;
    cuentaBancariaId?: number;
    observacion?: string;
  },
  currentUser: Usuario | null,
  dataSource: DataSource,
): Promise<{ cuota: CuentaPorPagarCuota; cpp: CuentaPorPagar | null; tipoMov: TipoMovimiento }> {
  const monto = Number(payload.monto);
  const fuente = payload.fuente;
  const observacion: string = (payload.observacion || '').toUpperCase();

  // Estado de dominio (cuota + CPP). Extraído para poder reutilizarlo desde el
  // pago del cajón del PdV (que asienta un EgresoCaja en vez de un movimiento
  // de Caja Mayor).
  const { cuota, cpp } = await aplicarEstadoPagoCuota(queryRunner, payload.cuotaId, monto, currentUser, dataSource);

  const esPrestamoFuncionario = cpp?.tipo === CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO;
  const obsPrefix = esPrestamoFuncionario ? 'COBRO' : 'PAGO';
  const obsBase = `${obsPrefix} CUOTA #${cuota.numero} CPP #${cuota.cuentaPorPagar?.id || '?'}`;
  let tipoMov: TipoMovimiento;
  if (esPrestamoFuncionario) {
    tipoMov = TipoMovimiento.INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO;
  } else if (cpp?.tipo === CuentaPorPagarTipo.PRESTAMO) {
    tipoMov = TipoMovimiento.EGRESO_CUOTA_PRESTAMO;
  } else {
    tipoMov = TipoMovimiento.EGRESO_CUOTA_COMPRA;
  }

  if (fuente === 'CAJA_MAYOR') {
    const cajaMayorId = payload.cajaMayorId;
    const monedaId = payload.monedaId;
    const formaPagoId = payload.formaPagoId;
    if (!cajaMayorId || !monedaId || !formaPagoId) {
      throw new Error('Faltan datos para pago desde caja mayor');
    }
    const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
      cajaMayor: { id: cajaMayorId } as any,
      tipoMovimiento: tipoMov,
      moneda: { id: monedaId } as any,
      formaPago: { id: formaPagoId } as any,
      monto,
      fecha: new Date(),
      observacion: observacion ? `${obsBase} — ${observacion}` : obsBase,
      cuentaPorPagarCuotaId: cuota.id,
    });
    if (currentUser) {
      movimiento.responsable = currentUser;
    }
    await setEntityUserTracking(dataSource, movimiento, currentUser?.id, false);
    await queryRunner.manager.save(CajaMayorMovimiento, movimiento);
    if (esPrestamoFuncionario) {
      await sumarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, monto);
    } else {
      await descontarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, monto);
    }
  } else if (fuente === 'CUENTA_BANCARIA') {
    const cuentaBancariaId = payload.cuentaBancariaId;
    if (!cuentaBancariaId) throw new Error('Falta cuentaBancariaId');
    const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
    const cb = await cbRepo.findOne({ where: { id: cuentaBancariaId } });
    if (!cb) throw new Error('Cuenta bancaria no encontrada');
    cb.saldo = esPrestamoFuncionario
      ? Number(cb.saldo) + monto
      : Number(cb.saldo) - monto;
    await queryRunner.manager.save(CuentaBancaria, cb);

    // Registrar el movimiento bancario (antes solo se ajustaba el saldo).
    await registrarMovimientoBancario(queryRunner.manager, dataSource, {
      cuentaBancariaId,
      tipo: esPrestamoFuncionario
        ? MovimientoBancarioTipo.ENTRADA_MANUAL
        : MovimientoBancarioTipo.SALIDA_MANUAL,
      monto,
      observacion: observacion ? `${obsBase} — ${observacion}` : obsBase,
      responsable: currentUser,
    });
  } else {
    throw new Error('Fuente de pago no valida');
  }

  return { cuota, cpp, tipoMov };
}

export interface PagoMixtoLinea {
  monedaId: number;
  formaPagoId?: number;       // requerido si fuente = CAJA_MAYOR
  monto: number;              // en la moneda de la linea (monedaId)
  cotizacion?: number;        // override; si falta se busca de MonedaCambio.compraLocal
  fuente?: 'CAJA_MAYOR' | 'CUENTA_BANCARIA';
  cajaMayorId?: number;       // requerido si CAJA_MAYOR
  cuentaBancariaId?: number;  // requerido si CUENTA_BANCARIA
}

// Aplica un pago MIXTO a una cuota de CuentaPorPagar: N lineas, cada una con su
// moneda + forma de pago. Convierte cada linea a la moneda del CPP (cotizacion
// manual u obtenida de MonedaCambio.compraLocal), crea el movimiento (Caja Mayor
// o banco) por linea, guarda un PagoCuotaCppDetalle, y aplica el estado de dominio
// (cuota + CPP) UNA sola vez con la suma convertida. NO commitea: el caller maneja
// commit/rollback. Reutiliza `aplicarEstadoPagoCuota` para no duplicar la logica
// de estado (idempotente, recomputa cpp.montoPagado como suma de cuotas).
export async function aplicarPagoMixtoCuota(
  queryRunner: any,
  payload: { cuotaId: number; lineas: PagoMixtoLinea[]; observacion?: string },
  currentUser: Usuario | null,
  dataSource: DataSource,
): Promise<{ cuotaId: number; totalCpp: number; lineas: number }> {
  const lineas = payload.lineas || [];
  if (!lineas.length) throw new Error('El pago mixto requiere al menos una linea.');

  const cuota = await queryRunner.manager.getRepository(CuentaPorPagarCuota).findOne({
    where: { id: payload.cuotaId },
    relations: ['cuentaPorPagar', 'cuentaPorPagar.moneda'],
  });
  if (!cuota) throw new Error(`CuentaPorPagarCuota ${payload.cuotaId} no encontrada`);
  if (cuota.estado === CuotaEstado.PAGADA) throw new Error(`Cuota #${cuota.numero} ya pagada`);
  if (cuota.estado === CuotaEstado.CANCELADA) throw new Error(`Cuota #${cuota.numero} esta anulada`);
  const cppMonedaId: number | undefined = cuota.cuentaPorPagar?.moneda?.id;
  if (!cppMonedaId) throw new Error('La cuenta por pagar no tiene moneda definida.');

  const observacion = (payload.observacion || '').toUpperCase();
  const obsBase = `PAGO MIXTO CUOTA #${cuota.numero} CPP #${cuota.cuentaPorPagar?.id || '?'}`;
  const cu = currentUser;

  // 1) Validar cada linea y calcular su conversion a la moneda del CPP (antes de mover dinero).
  const preparadas: Array<{ l: PagoMixtoLinea; fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA'; cotizacion: number; montoCpp: number }> = [];
  let totalCpp = 0;
  for (const l of lineas) {
    const monto = Number(l.monto);
    if (!(monto > 0)) throw new Error('Cada linea de pago debe tener un monto mayor a 0.');
    const fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA' = l.fuente === 'CUENTA_BANCARIA' ? 'CUENTA_BANCARIA' : 'CAJA_MAYOR';
    if (fuente === 'CAJA_MAYOR' && (!l.cajaMayorId || !l.formaPagoId)) {
      throw new Error('Una linea de Caja Mayor requiere caja y forma de pago.');
    }
    if (fuente === 'CUENTA_BANCARIA' && !l.cuentaBancariaId) {
      throw new Error('Una linea de cuenta bancaria requiere la cuenta.');
    }
    let cotizacion: number | null = l.cotizacion != null ? Number(l.cotizacion) : null;
    if (cotizacion == null) {
      cotizacion = await getCotizacionCompraLocal(dataSource, Number(l.monedaId), cppMonedaId);
    }
    if (cotizacion == null || !(cotizacion > 0)) {
      throw new Error('Falta la cotizacion para convertir una linea a la moneda de la deuda.');
    }
    const montoCpp = +(monto * cotizacion).toFixed(2);
    totalCpp += montoCpp;
    preparadas.push({ l, fuente, cotizacion, montoCpp });
  }
  totalCpp = +totalCpp.toFixed(2);

  const restante = +(Number(cuota.monto) - Number(cuota.montoPagado)).toFixed(2);
  if (totalCpp > restante + 0.005) {
    throw new Error(`El total del pago (${totalCpp}) supera el saldo de la cuota (${restante}).`);
  }

  // 2) Ejecutar cada linea: movimiento (caja o banco) + fila de detalle.
  for (const p of preparadas) {
    const l = p.l;
    let cajaMayorMovimientoId: number | undefined;
    let cuentaBancariaId: number | undefined;
    if (p.fuente === 'CAJA_MAYOR') {
      const mov = queryRunner.manager.create(CajaMayorMovimiento, {
        cajaMayor: { id: l.cajaMayorId } as any,
        tipoMovimiento: TipoMovimiento.EGRESO_CUOTA_COMPRA,
        moneda: { id: l.monedaId } as any,
        formaPago: { id: l.formaPagoId } as any,
        monto: Number(l.monto),
        fecha: new Date(),
        observacion: observacion ? `${obsBase} — ${observacion}` : obsBase,
        cuentaPorPagarCuotaId: cuota.id,
      });
      if (cu) mov.responsable = cu;
      await setEntityUserTracking(dataSource, mov, cu?.id, false);
      const saved = await queryRunner.manager.save(CajaMayorMovimiento, mov);
      cajaMayorMovimientoId = saved.id;
      await descontarSaldoCajaMayor(queryRunner, Number(l.cajaMayorId), Number(l.monedaId), Number(l.formaPagoId), Number(l.monto));
    } else {
      const cb = await queryRunner.manager.getRepository(CuentaBancaria).findOne({ where: { id: Number(l.cuentaBancariaId) } });
      if (!cb) throw new Error('Cuenta bancaria no encontrada');
      cb.saldo = +(Number(cb.saldo) - Number(l.monto)).toFixed(2);
      await queryRunner.manager.save(CuentaBancaria, cb);
      await registrarMovimientoBancario(queryRunner.manager, dataSource, {
        cuentaBancariaId: Number(l.cuentaBancariaId),
        tipo: MovimientoBancarioTipo.SALIDA_MANUAL,
        monto: Number(l.monto),
        observacion: observacion ? `${obsBase} — ${observacion}` : obsBase,
        responsable: cu,
      });
      cuentaBancariaId = Number(l.cuentaBancariaId);
    }

    const det = queryRunner.manager.create(PagoCuotaCppDetalle, {
      cuentaPorPagarCuotaId: cuota.id,
      moneda: { id: l.monedaId } as any,
      formaPago: l.formaPagoId ? ({ id: l.formaPagoId } as any) : null,
      fuente: p.fuente,
      montoOrigen: Number(l.monto),
      cotizacion: p.cotizacion,
      montoCpp: p.montoCpp,
      cajaMayorMovimientoId: cajaMayorMovimientoId ?? null,
      cuentaBancariaId: cuentaBancariaId ?? null,
      observacion: observacion || null,
    } as any);
    await setEntityUserTracking(dataSource, det, cu?.id, false);
    await queryRunner.manager.save(PagoCuotaCppDetalle, det);
  }

  // 3) Estado de dominio (cuota + CPP) una sola vez con la suma convertida.
  await aplicarEstadoPagoCuota(queryRunner, cuota.id, totalCpp, cu, dataSource);

  return { cuotaId: cuota.id, totalCpp, lineas: preparadas.length };
}

export function registerCuentasPorPagarHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ===================== COMPRA CATEGORIA =====================

  ipcMain.handle('get-compra-categorias', async () => {
    try {
      const repo = dataSource.getRepository(CompraCategoria);
      return await repo.find({
        relations: ['padre'],
        order: { nombre: 'ASC' },
      });
    } catch (error) {
      console.error('Error getting compra categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('create-compra-categoria', async (_event, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
      const repo = dataSource.getRepository(CompraCategoria);
      const entity = repo.create({
        nombre: data.nombre?.toUpperCase(),
        padre: data.padreId ? { id: data.padreId } : null,
        icono: data.icono?.toUpperCase(),
        activo: data.activo !== undefined ? data.activo : true,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const result = await repo.save(entity);
      return Array.isArray(result) ? result[0] : result;
    } catch (error) {
      console.error('Error creating compra categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('update-compra-categoria', async (_event, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
      const repo = dataSource.getRepository(CompraCategoria);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`CompraCategoria ${id} no encontrada`);

      if (data.nombre) existing.nombre = data.nombre.toUpperCase();
      if (data.padreId !== undefined) existing.padre = data.padreId ? ({ id: data.padreId } as any) : null;
      if (data.icono !== undefined) existing.icono = data.icono?.toUpperCase();
      if (data.activo !== undefined) existing.activo = data.activo;

      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating compra categoria ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-compra-categoria', async (_event, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
      const repo = dataSource.getRepository(CompraCategoria);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`CompraCategoria ${id} no encontrada`);
      existing.activo = false;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      await repo.save(existing);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting compra categoria ${id}:`, error);
      throw error;
    }
  });

  // ===================== COMPRA CUOTAS =====================

  ipcMain.handle('get-compra-cuotas', async (_event, compraId: number) => {
    try {
      const repo = dataSource.getRepository(CompraCuota);
      return await repo.find({
        where: { compra: { id: compraId } },
        order: { numero: 'ASC' },
      });
    } catch (error) {
      console.error(`Error getting cuotas de compra ${compraId}:`, error);
      throw error;
    }
  });

  // Crea o reemplaza el set de cuotas de una compra
  ipcMain.handle('set-compra-cuotas', async (_event, compraId: number, cuotas: any[]) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const repo = queryRunner.manager.getRepository(CompraCuota);
      // Borrar cuotas anteriores que no fueron pagadas
      const existentes = await repo.find({ where: { compra: { id: compraId } } });
      for (const c of existentes) {
        if (Number(c.montoPagado) === 0 && c.estado === CuotaEstado.PENDIENTE) {
          await repo.remove(c);
        }
      }

      const creadas: any[] = [];
      for (const c of cuotas) {
        const entity = repo.create({
          compra: { id: compraId } as any,
          numero: c.numero,
          fechaVencimiento: c.fechaVencimiento,
          monto: c.monto,
          montoPagado: 0,
          estado: CuotaEstado.PENDIENTE,
        });
        await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
        const saved = await queryRunner.manager.save(CompraCuota, entity);
        creadas.push(saved);
      }

      await queryRunner.commitTransaction();
      return creadas;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error setting cuotas compra ${compraId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Pagar una cuota de compra (transaccional). Soporta pago desde cajaMayor o cuentaBancaria.
  // Si fuente=CAJA_MAYOR: crea CajaMayorMovimiento EGRESO_CUOTA_COMPRA y descuenta saldo.
  // Si fuente=CUENTA_BANCARIA: descuenta saldo bancario.
  ipcMain.handle('pagar-compra-cuota', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cuotaId: number = payload.cuotaId;
      const monto: number = Number(payload.monto);
      const fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA' = payload.fuente;
      const observacion: string = (payload.observacion || '').toUpperCase();

      const cuotaRepo = queryRunner.manager.getRepository(CompraCuota);
      const cuota = await cuotaRepo.findOne({
        where: { id: cuotaId },
        relations: ['compra', 'compra.proveedor'],
      });
      if (!cuota) throw new Error(`CompraCuota ${cuotaId} no encontrada`);
      if (cuota.estado === CuotaEstado.PAGADA) throw new Error('Cuota ya pagada');

      const restante = Number(cuota.monto) - Number(cuota.montoPagado);
      if (monto <= 0 || monto > restante + 0.005) {
        throw new Error(`Monto inválido (restante: ${restante})`);
      }

      cuota.montoPagado = +(Number(cuota.montoPagado) + monto).toFixed(2);
      cuota.estado = calcularEstadoCuota(Number(cuota.monto), Number(cuota.montoPagado));
      if (cuota.estado === CuotaEstado.PAGADA) {
        cuota.fechaPago = new Date();
      }
      await setEntityUserTracking(dataSource, cuota, getCurrentUser()?.id, true);
      await queryRunner.manager.save(CompraCuota, cuota);

      const obsBase = `CUOTA #${cuota.numero} COMPRA #${cuota.compra?.id || '?'}`;

      if (fuente === 'CAJA_MAYOR') {
        const cajaMayorId = payload.cajaMayorId;
        const monedaId = payload.monedaId;
        const formaPagoId = payload.formaPagoId;
        if (!cajaMayorId || !monedaId || !formaPagoId) {
          throw new Error('Faltan datos para pago desde caja mayor');
        }
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId } as any,
          tipoMovimiento: TipoMovimiento.EGRESO_CUOTA_COMPRA,
          moneda: { id: monedaId } as any,
          formaPago: { id: formaPagoId } as any,
          monto,
          fecha: new Date(),
          observacion: observacion ? `${obsBase} — ${observacion}` : obsBase,
          compraCuotaId: cuota.id,
        });
        const cu = getCurrentUser();
        if (cu) {
          movimiento.responsable = cu;
        }
        await setEntityUserTracking(dataSource, movimiento, cu?.id, false);
        await queryRunner.manager.save(CajaMayorMovimiento, movimiento);

        await descontarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, monto);
      } else if (fuente === 'CUENTA_BANCARIA') {
        const cuentaBancariaId = payload.cuentaBancariaId;
        if (!cuentaBancariaId) throw new Error('Falta cuentaBancariaId');
        const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
        const cb = await cbRepo.findOne({ where: { id: cuentaBancariaId } });
        if (!cb) throw new Error('Cuenta bancaria no encontrada');
        cb.saldo = Number(cb.saldo) - monto;
        await queryRunner.manager.save(CuentaBancaria, cb);

        // Registrar el movimiento bancario (antes solo se ajustaba el saldo).
        await registrarMovimientoBancario(queryRunner.manager, dataSource, {
          cuentaBancariaId,
          tipo: MovimientoBancarioTipo.SALIDA_MANUAL,
          monto,
          observacion: observacion ? `${obsBase} — ${observacion}` : obsBase,
          responsable: getCurrentUser(),
        });
      } else {
        throw new Error('Fuente de pago no valida');
      }

      await queryRunner.commitTransaction();
      return { success: true, cuota };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error pagando cuota compra:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // ===================== CUENTAS POR PAGAR =====================

  ipcMain.handle('get-cuentas-por-pagar', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(CuentaPorPagar);
      const qb = repo.createQueryBuilder('cpp')
        .leftJoinAndSelect('cpp.proveedor', 'proveedor')
        .leftJoinAndSelect('cpp.funcionario', 'funcionario')
        .leftJoinAndSelect('funcionario.persona', 'funcionarioPersona')
        .leftJoinAndSelect('cpp.moneda', 'moneda')
        // CPP solo tiene `compraId` como columna plana (no relacion). JOIN raw a la tabla.
        .leftJoin('compras', 'compra', 'compra.id = cpp.compra_id')
        .orderBy('cpp.fechaInicio', 'DESC');

      if (filtros?.estado) qb.andWhere('cpp.estado = :estado', { estado: filtros.estado });
      if (filtros?.tipo) qb.andWhere('cpp.tipo = :tipo', { tipo: filtros.tipo });
      if (filtros?.proveedorId) qb.andWhere('cpp.proveedor_id = :pid', { pid: filtros.proveedorId });
      if (filtros?.funcionarioId) qb.andWhere('cpp.funcionario_id = :fid', { fid: filtros.funcionarioId });
      if (filtros?.soloPrestamosFuncionario) qb.andWhere('cpp.tipo = :tpf', { tpf: CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO });
      // Cuentas por Pagar = deudas a proveedores. Los prestamos a funcionarios son
      // "a cobrar" y viven en su propia pantalla (RRHH); se excluyen de esta lista.
      if (filtros?.excluirPrestamosFuncionario) qb.andWhere('cpp.tipo <> :tpfx', { tpfx: CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO });
      // Oculta solo las compras al contado YA pagadas/canceladas (tickets diarios liquidados).
      // Las compras al contado PENDIENTES de pago (estado ACTIVO) si son deuda real y se muestran,
      // igual que las a credito y las CPPs sin compra (prestamos, etc.). Default: false (lista todo).
      if (filtros?.excluirContadoCompras === true) {
        qb.andWhere("(cpp.compra_id IS NULL OR compra.credito = true OR cpp.estado = 'ACTIVO')");
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
      console.error('Error getting cuentas por pagar:', error);
      throw error;
    }
  });

  ipcMain.handle('get-cuenta-por-pagar', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(CuentaPorPagar);
      return await repo.findOne({
        where: { id },
        relations: ['proveedor', 'funcionario', 'funcionario.persona', 'moneda', 'cuotas'],
      });
    } catch (error) {
      console.error(`Error getting cuenta por pagar ${id}:`, error);
      throw error;
    }
  });

  // Crea CuentaPorPagar + auto-genera cuotas (mensuales por defecto)
  ipcMain.handle('create-cuenta-por-pagar', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
      const cuotaRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);

      const cantidadCuotas = Math.max(1, Number(data.cantidadCuotas) || 1);
      const fechaInicio = parseLocalDate(data.fechaInicio) || new Date();
      const montoTotal = Number(data.montoTotal);
      const montoCuota = +(montoTotal / cantidadCuotas).toFixed(2);

      const entity = cppRepo.create({
        descripcion: data.descripcion?.toUpperCase(),
        tipo: data.tipo || CuentaPorPagarTipo.OTRO,
        proveedor: data.proveedorId ? { id: data.proveedorId } as any : null,
        funcionario: data.funcionarioId ? { id: data.funcionarioId } as any : null,
        montoTotal,
        montoPagado: 0,
        moneda: { id: data.monedaId } as any,
        fechaInicio,
        cantidadCuotas,
        estado: CuentaPorPagarEstado.ACTIVO,
        observacion: data.observacion?.toUpperCase() || null,
        compraId: data.compraId ?? undefined,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const saved = await queryRunner.manager.save(CuentaPorPagar, entity);
      const cppSaved = Array.isArray(saved) ? saved[0] : saved;

      // Generar cuotas mensuales
      for (let i = 0; i < cantidadCuotas; i++) {
        const venc = new Date(fechaInicio);
        venc.setMonth(venc.getMonth() + i);
        // Ultima cuota ajusta diferencia por redondeo
        const monto = (i === cantidadCuotas - 1)
          ? +(montoTotal - montoCuota * (cantidadCuotas - 1)).toFixed(2)
          : montoCuota;
        const cuota = cuotaRepo.create({
          cuentaPorPagar: { id: cppSaved.id } as any,
          numero: i + 1,
          fechaVencimiento: venc,
          monto,
          montoPagado: 0,
          estado: CuotaEstado.PENDIENTE,
        });
        await setEntityUserTracking(dataSource, cuota, getCurrentUser()?.id, false);
        await queryRunner.manager.save(CuentaPorPagarCuota, cuota);
      }

      // Si es PRESTAMO_FUNCIONARIO, desembolsar segun la fuente elegida.
      if (entity.tipo === CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO) {
        if (data.cuentaBancariaId) {
          // Desembolso desde cuenta bancaria: debita el saldo y registra el
          // movimiento bancario (no impacta caja mayor).
          const cbRepo = queryRunner.manager.getRepository(CuentaBancaria);
          const cb = await cbRepo.findOne({ where: { id: Number(data.cuentaBancariaId) } });
          if (!cb) throw new Error('Cuenta bancaria no encontrada');
          cb.saldo = Number(cb.saldo) - montoTotal;
          await queryRunner.manager.save(CuentaBancaria, cb);

          await registrarMovimientoBancario(queryRunner.manager, dataSource, {
            cuentaBancariaId: Number(data.cuentaBancariaId),
            tipo: MovimientoBancarioTipo.SALIDA_MANUAL,
            monto: montoTotal,
            observacion: `DESEMBOLSO PRESTAMO FUNCIONARIO #${cppSaved.id} - ${entity.descripcion}`,
            responsable: getCurrentUser(),
          });
        } else if (data.cajaMayorId) {
          // Desembolso desde Caja Mayor: genera EGRESO y descuenta saldo.
          const cajaMayorId = Number(data.cajaMayorId);
          const monedaIdMov = Number(data.monedaId);
          const formaPagoId = Number(data.formaPagoId);
          if (!cajaMayorId || !monedaIdMov || !formaPagoId) {
            throw new Error('Para PRESTAMO_FUNCIONARIO se requiere cajaMayorId, monedaId y formaPagoId');
          }
          const userIdMov = getCurrentUser()?.id;
          const userEntity = userIdMov
            ? await queryRunner.manager.findOne(Usuario, { where: { id: userIdMov } })
            : null;
          const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
            cajaMayor: { id: cajaMayorId } as any,
            tipoMovimiento: TipoMovimiento.EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO,
            moneda: { id: monedaIdMov } as any,
            formaPago: { id: formaPagoId } as any,
            monto: montoTotal,
            fecha: new Date(),
            observacion: `DESEMBOLSO PRESTAMO FUNCIONARIO #${cppSaved.id} - ${entity.descripcion}`,
            cuentaPorPagarId: cppSaved.id,
            responsable: userEntity || undefined,
          });
          await setEntityUserTracking(dataSource, movimiento, userIdMov, false);
          await queryRunner.manager.save(CajaMayorMovimiento, movimiento);
          await descontarSaldoCajaMayor(queryRunner, cajaMayorId, monedaIdMov, formaPagoId, montoTotal);
        }
      }

      await queryRunner.commitTransaction();
      return cppSaved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error creating cuenta por pagar:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('update-cuenta-por-pagar', async (_event, id: number, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
      const repo = dataSource.getRepository(CuentaPorPagar);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`CuentaPorPagar ${id} no encontrada`);

      if (data.descripcion) existing.descripcion = data.descripcion.toUpperCase();
      if (data.observacion !== undefined) existing.observacion = data.observacion?.toUpperCase() || undefined;
      if (data.estado) existing.estado = data.estado;

      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating cuenta por pagar ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('cancelar-cuenta-por-pagar', async (_event, id: number) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
      const repo = dataSource.getRepository(CuentaPorPagar);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`CuentaPorPagar ${id} no encontrada`);
      existing.estado = CuentaPorPagarEstado.CANCELADO;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      await repo.save(existing);
      return { success: true };
    } catch (error) {
      console.error(`Error cancelando cuenta por pagar ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-cuenta-por-pagar-cuotas', async (_event, cppId: number) => {
    try {
      const repo = dataSource.getRepository(CuentaPorPagarCuota);
      return await repo.find({
        where: { cuentaPorPagar: { id: cppId } },
        order: { numero: 'ASC' },
      });
    } catch (error) {
      console.error(`Error getting cuotas de cuenta por pagar ${cppId}:`, error);
      throw error;
    }
  });

  // Pagar cuota de cuenta por pagar (1 cuota). Wrapper sobre `aplicarPagoCpoCuota`.
  ipcMain.handle('pagar-cpp-cuota', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await aplicarPagoCpoCuota(queryRunner, payload, getCurrentUser(), dataSource);
      await queryRunner.commitTransaction();
      return { success: true, cuota: result.cuota };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error pagando cuota CPP:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Pago MIXTO de una cuota CPP (compra): varias formas de pago y/o monedas en una
  // sola operacion. Payload: { cuotaId, lineas: [{ monedaId, formaPagoId?, monto,
  // cotizacion?, fuente?, cajaMayorId?, cuentaBancariaId? }], observacion? }.
  // Cada linea se convierte a la moneda del CPP; la suma reduce la cuota.
  ipcMain.handle('pagar-cpp-cuota-mixto', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const res = await aplicarPagoMixtoCuota(
        queryRunner,
        {
          cuotaId: Number(payload.cuotaId),
          lineas: payload.lineas || payload.detalles || [],
          observacion: payload.observacion,
        },
        getCurrentUser(),
        dataSource,
      );
      await queryRunner.commitTransaction();
      return { success: true, ...res };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error en pago mixto de cuota CPP:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Pagar varias cuotas CPP tipo COMPRA en una sola transaccion (lote).
  // Reutiliza el helper aplicarPagoCpoCuota por cada cuota.
  // Payload: {
  //   pagos: Array<{ cuotaId, monto, observacion? }>,
  //   fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA',
  //   cajaMayorId?, monedaId?, formaPagoId?, cuentaBancariaId?
  // }
  ipcMain.handle('pagar-cuotas-compras-lote', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const pagos: Array<{ cuotaId: number; monto: number; observacion?: string }> = payload?.pagos || [];
      if (!Array.isArray(pagos) || pagos.length === 0) {
        throw new Error('No hay cuotas para pagar.');
      }
      const fuente = payload?.fuente;
      if (fuente !== 'CAJA_MAYOR' && fuente !== 'CUENTA_BANCARIA') {
        throw new Error('Fuente de pago invalida.');
      }

      const currentUser = getCurrentUser();
      let totalPagado = 0;
      let cuotasActualizadas = 0;
      let movimientosCreados = 0;

      for (const pago of pagos) {
        await aplicarPagoCpoCuota(
          queryRunner,
          {
            cuotaId: Number(pago.cuotaId),
            monto: Number(pago.monto),
            fuente,
            cajaMayorId: payload.cajaMayorId,
            monedaId: payload.monedaId,
            formaPagoId: payload.formaPagoId,
            cuentaBancariaId: payload.cuentaBancariaId,
            observacion: pago.observacion,
          },
          currentUser,
          dataSource,
        );
        totalPagado += Number(pago.monto);
        cuotasActualizadas++;
        if (fuente === 'CAJA_MAYOR') movimientosCreados++;
      }

      await queryRunner.commitTransaction();
      return {
        success: true,
        totalPagado: +totalPagado.toFixed(2),
        cuotasActualizadas,
        movimientosCreados,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error en pago lote de cuotas:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Lista cuotas pendientes de CPP tipo COMPRA. Para el dialog "Pagar compras".
  ipcMain.handle('get-cuotas-pendientes-compras', async (_event, filtros?: any) => {
    try {
      const repo = dataSource.getRepository(CuentaPorPagarCuota);
      const qb = repo.createQueryBuilder('cuota')
        .leftJoin('cuota.cuentaPorPagar', 'cpp')
        .leftJoin('cpp.proveedor', 'pv')
        .leftJoin('cpp.moneda', 'mon')
        // CPP solo tiene `compraId` como columna plana (no relacion). JOIN raw a la tabla.
        .leftJoin('compras', 'compra', 'compra.id = cpp.compra_id')
        .where('cpp.tipo = :tipo', { tipo: CuentaPorPagarTipo.COMPRA })
        .andWhere('cuota.estado IN (:...estados)', {
          estados: [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL],
        })
        .andWhere('cpp.estado = :cppEstado', { cppEstado: CuentaPorPagarEstado.ACTIVO });

      if (filtros?.proveedorId) qb.andWhere('pv.id = :pid', { pid: filtros.proveedorId });
      if (filtros?.monedaId) qb.andWhere('mon.id = :mid', { mid: filtros.monedaId });
      if (filtros?.fechaVencHasta) qb.andWhere('cuota.fechaVencimiento <= :fh', { fh: filtros.fechaVencHasta });

      // NOTA: aliases quoteados. Postgres pliega identificadores sin comillas a
      // minuscula (cppId -> cppid), rompiendo el acceso por propiedad en getRawMany.
      qb.select([
        'cuota.id AS "id"',
        'cpp.id AS "cppId"',
        'compra.id AS "compraId"',
        'compra.numero_nota AS "compraNumeroNota"',
        'compra.fecha_compra AS "compraFechaCompra"',
        'compra.credito AS "compraCredito"',
        'cuota.numero AS "numero"',
        'cpp.cantidadCuotas AS "cantidadCuotas"',
        'cuota.fechaVencimiento AS "fechaVencimiento"',
        'cuota.monto AS "monto"',
        'cuota.montoPagado AS "montoPagado"',
        'cuota.estado AS "estado"',
        'pv.id AS "proveedorId"',
        'pv.nombre AS "proveedorNombre"',
        'mon.id AS "monedaId"',
        'mon.simbolo AS "monedaSimbolo"',
        'mon.denominacion AS "monedaDenominacion"',
      ])
        .orderBy('pv.nombre', 'ASC')
        .addOrderBy('cuota.fechaVencimiento', 'ASC')
        .addOrderBy('cuota.id', 'ASC');

      const itemsRaw = await qb.getRawMany();
      const items = itemsRaw.map((r: any) => ({
        id: Number(r.id),
        cppId: Number(r.cppId),
        compraId: r.compraId != null ? Number(r.compraId) : null,
        compraNumeroNota: r.compraNumeroNota || null,
        compraFechaCompra: r.compraFechaCompra || null,
        compraCredito: !!r.compraCredito,
        numero: Number(r.numero),
        cantidadCuotas: Number(r.cantidadCuotas) || 1,
        fechaVencimiento: r.fechaVencimiento,
        monto: Number(r.monto) || 0,
        montoPagado: Number(r.montoPagado) || 0,
        saldoPendiente: +(Number(r.monto) - Number(r.montoPagado)).toFixed(2),
        estado: r.estado,
        proveedorId: r.proveedorId != null ? Number(r.proveedorId) : null,
        proveedorNombre: r.proveedorNombre || null,
        monedaId: r.monedaId != null ? Number(r.monedaId) : null,
        monedaSimbolo: r.monedaSimbolo || null,
        monedaDenominacion: r.monedaDenominacion || null,
      }));
      return items;
    } catch (error) {
      console.error('Error getting cuotas pendientes compras:', error);
      throw error;
    }
  });

  // Anular cuota pendiente (sin pago) — descuenta el saldo no pagado del CPP
  ipcMain.handle('cancelar-cpp-cuota', async (_event, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMPRAS_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cuotaId: number = payload.cuotaId;
      const motivo: string = (payload.motivo || '').toUpperCase();
      const cuotaRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);
      const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
      const cuota = await cuotaRepo.findOne({
        where: { id: cuotaId },
        relations: ['cuentaPorPagar'],
      });
      if (!cuota) throw new Error(`CuentaPorPagarCuota ${cuotaId} no encontrada`);
      if (cuota.estado === CuotaEstado.PAGADA) throw new Error('No se puede anular una cuota ya pagada');
      if (cuota.estado === CuotaEstado.CANCELADA) throw new Error('La cuota ya esta anulada');

      const restante = +(Number(cuota.monto) - Number(cuota.montoPagado)).toFixed(2);
      cuota.estado = CuotaEstado.CANCELADA;
      cuota.observacion = motivo
        ? `${cuota.observacion ? cuota.observacion + ' | ' : ''}ANULADA: ${motivo}`
        : (cuota.observacion ? `${cuota.observacion} | ANULADA` : 'ANULADA');
      await setEntityUserTracking(dataSource, cuota, getCurrentUser()?.id, true);
      await queryRunner.manager.save(CuentaPorPagarCuota, cuota);

      const cpp = await cppRepo.findOne({ where: { id: cuota.cuentaPorPagar.id }, relations: ['cuotas'] });
      if (cpp) {
        cpp.montoTotal = +(Number(cpp.montoTotal) - restante).toFixed(2);
        const cuotasActivas = (cpp.cuotas || []).filter((c: any) => c.estado !== CuotaEstado.CANCELADA);
        const todasPagadas = cuotasActivas.length > 0 && cuotasActivas.every((c: any) => Number(c.montoPagado) >= Number(c.monto) - 0.005);
        if (todasPagadas) cpp.estado = CuentaPorPagarEstado.PAGADO;
        await queryRunner.manager.save(CuentaPorPagar, cpp);
      }

      await queryRunner.commitTransaction();
      return { success: true, cuota };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error anulando cuota CPP:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });
}
