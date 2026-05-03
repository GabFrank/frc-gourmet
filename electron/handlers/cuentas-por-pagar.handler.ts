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
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

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
        .orderBy('cpp.fechaInicio', 'DESC');

      if (filtros?.estado) qb.andWhere('cpp.estado = :estado', { estado: filtros.estado });
      if (filtros?.tipo) qb.andWhere('cpp.tipo = :tipo', { tipo: filtros.tipo });
      if (filtros?.proveedorId) qb.andWhere('cpp.proveedor_id = :pid', { pid: filtros.proveedorId });
      if (filtros?.funcionarioId) qb.andWhere('cpp.funcionario_id = :fid', { fid: filtros.funcionarioId });
      if (filtros?.soloPrestamosFuncionario) qb.andWhere('cpp.tipo = :tpf', { tpf: CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO });

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
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
      const cuotaRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);

      const cantidadCuotas = Math.max(1, Number(data.cantidadCuotas) || 1);
      const fechaInicio = data.fechaInicio ? new Date(data.fechaInicio) : new Date();
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

      // Si es PRESTAMO_FUNCIONARIO y se especifico fuente de desembolso, generar EGRESO en Caja Mayor
      if (entity.tipo === CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO && data.cajaMayorId) {
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

  // Pagar cuota de cuenta por pagar (similar a pagar compra cuota)
  ipcMain.handle('pagar-cpp-cuota', async (_event, payload: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const cuotaId: number = payload.cuotaId;
      const monto: number = Number(payload.monto);
      const fuente: 'CAJA_MAYOR' | 'CUENTA_BANCARIA' = payload.fuente;
      const observacion: string = (payload.observacion || '').toUpperCase();

      const cuotaRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);
      const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
      const cuota = await cuotaRepo.findOne({
        where: { id: cuotaId },
        relations: ['cuentaPorPagar'],
      });
      if (!cuota) throw new Error(`CuentaPorPagarCuota ${cuotaId} no encontrada`);
      if (cuota.estado === CuotaEstado.PAGADA) throw new Error('Cuota ya pagada');
      if (cuota.estado === CuotaEstado.CANCELADA) throw new Error('La cuota esta anulada');

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
      await queryRunner.manager.save(CuentaPorPagarCuota, cuota);

      // Actualizar montoPagado en CuentaPorPagar y eventualmente marcarla como PAGADO
      const cpp = await cppRepo.findOne({ where: { id: cuota.cuentaPorPagar.id }, relations: ['cuotas'] });
      if (cpp) {
        cpp.montoPagado = +(Number(cpp.montoPagado) + monto).toFixed(2);
        const todasPagadas = (cpp.cuotas || []).every((c: any) => Number(c.montoPagado) >= Number(c.monto) - 0.005);
        if (todasPagadas) cpp.estado = CuentaPorPagarEstado.PAGADO;
        await queryRunner.manager.save(CuentaPorPagar, cpp);
      }

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
        const cu = getCurrentUser();
        if (cu) {
          movimiento.responsable = cu;
        }
        await setEntityUserTracking(dataSource, movimiento, cu?.id, false);
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
      } else {
        throw new Error('Fuente de pago no valida');
      }

      await queryRunner.commitTransaction();
      return { success: true, cuota };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error pagando cuota CPP:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // Anular cuota pendiente (sin pago) — descuenta el saldo no pagado del CPP
  ipcMain.handle('cancelar-cpp-cuota', async (_event, payload: any) => {
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
