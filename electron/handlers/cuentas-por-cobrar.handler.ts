import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
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
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { Pago } from '../../src/app/database/entities/compras/pago.entity';
import { PagoEstado } from '../../src/app/database/entities/compras/estado.enum';
import { PagoDetalle, TipoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { ensurePermission } from '../utils/auth.utils';
import { printVentaTicketInternal, printPagareCpcTicketInternal } from './documentos-tickets.handler';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';

function calcularEstadoCuota(monto: number, montoCobrado: number): CuentaPorCobrarCuotaEstado {
  if (montoCobrado >= monto) return CuentaPorCobrarCuotaEstado.COBRADO;
  if (montoCobrado > 0) return CuentaPorCobrarCuotaEstado.PARCIAL;
  return CuentaPorCobrarCuotaEstado.PENDIENTE;
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
        cliente.saldoActual = +(Number(cliente.saldoActual) + montoTotal).toFixed(2);
        await queryRunner.manager.save(Cliente, cliente);
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
      const clienteRepo = queryRunner.manager.getRepository(Cliente);
      const movRepo = queryRunner.manager.getRepository(MovimientoCliente);

      const cpc = await cpcRepo.findOne({ where: { id }, relations: ['cliente'] });
      if (!cpc) throw new Error(`CuentaPorCobrar ${id} no encontrada`);
      if (Number(cpc.montoCobrado) > 0) throw new Error('No se puede cancelar una cuenta con cobros registrados');

      const montoOriginal = Number(cpc.montoTotal);
      cpc.estado = CuentaPorCobrarEstado.CANCELADO;
      cpc.fechaCancelacion = new Date();
      cpc.motivoCancelacion = motivo;
      await setEntityUserTracking(dataSource, cpc, cu?.id, true);
      await queryRunner.manager.save(CuentaPorCobrar, cpc);

      // Revertir saldoActual del cliente
      const clienteId = cpc.cliente?.id;
      if (clienteId) {
        const cliente = await clienteRepo.findOne({ where: { id: clienteId } });
        if (cliente) {
          cliente.saldoActual = +(Number(cliente.saldoActual) - montoOriginal).toFixed(2);
          await queryRunner.manager.save(Cliente, cliente);
        }

        // Crear MovimientoCliente AJUSTE_NEGATIVO
        const mov = movRepo.create({
          cliente: { id: clienteId } as any,
          tipo: MovimientoClienteTipo.AJUSTE_NEGATIVO,
          monto: montoOriginal,
          fecha: new Date(),
          cuentaPorCobrarId: id,
          observacion: `CANCELACION CPC #${id} - ${motivo}`,
          registradoPor: cu || undefined,
        });
        await setEntityUserTracking(dataSource, mov, cu?.id, false);
        await queryRunner.manager.save(MovimientoCliente, mov);
      }

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
        cb.saldo = +(Number(cb.saldo) + montoBanco).toFixed(2);
        await queryRunner.manager.save(CuentaBancaria, cb);
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
        cliente.saldoActual = +(Number(cliente.saldoActual) - montoCobrar).toFixed(2);
        await queryRunner.manager.save(Cliente, cliente);
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
        // Reversión bancaria: debita la cuenta (en SU moneda) y revierte cuota/cpc/cliente
        // por el monto del cobro (en la moneda de la CPC).
        const montoAnuladoBanco = Number(ultimoPago.monto);
        const montoBancoRevertir = Number(ultimoPago.montoCuentaBancaria) > 0 ? Number(ultimoPago.montoCuentaBancaria) : montoAnuladoBanco;
        const cb = await queryRunner.manager.findOne(CuentaBancaria, { where: { id: ultimoPago.cuentaBancariaId } });
        if (cb) {
          cb.saldo = +(Number(cb.saldo) - montoBancoRevertir).toFixed(2);
          await queryRunner.manager.save(CuentaBancaria, cb);
        }

        cuota.montoCobrado = +(Math.max(0, Number(cuota.montoCobrado) - montoAnuladoBanco)).toFixed(2);
        cuota.estado = calcularEstadoCuota(Number(cuota.monto), Number(cuota.montoCobrado));
        cuota.fechaCobro = undefined;
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
              clienteB.saldoActual = +(Number(clienteB.saldoActual) + montoAnuladoBanco).toFixed(2);
              await queryRunner.manager.save(Cliente, clienteB);
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
      cuota.fechaCobro = undefined;
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
            cliente.saldoActual = +(Number(cliente.saldoActual) + montoAnulado).toFixed(2);
            await queryRunner.manager.save(Cliente, cliente);
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
      const movRepo = dataSource.getRepository(MovimientoCliente);
      const clienteRepo = dataSource.getRepository(Cliente);

      const movimientos = await movRepo.find({ where: { cliente: { id: clienteId } } });
      let saldo = 0;
      for (const m of movimientos) {
        if (m.tipo === MovimientoClienteTipo.CARGO || m.tipo === MovimientoClienteTipo.AJUSTE_POSITIVO) {
          saldo += Number(m.monto);
        } else if (m.tipo === MovimientoClienteTipo.PAGO || m.tipo === MovimientoClienteTipo.AJUSTE_NEGATIVO) {
          saldo -= Number(m.monto);
        }
      }

      const cliente = await clienteRepo.findOne({ where: { id: clienteId } });
      if (cliente) {
        cliente.saldoActual = +saldo.toFixed(2);
        await clienteRepo.save(cliente);
      }
      return { success: true, saldoRecalculado: +saldo.toFixed(2) };
    } catch (error) {
      console.error(`Error recalculando saldo cliente ${clienteId}:`, error);
      throw error;
    }
  });

  // F2-extra: cerrar venta como crédito (atómico)
  // Recibe: { ventaId, clienteId, montoTotal, monedaId, cantidadCuotas?, frecuenciaDias?, fechaInicio?, descripcion?, forzar? }
  ipcMain.handle('cobrar-venta-credito', async (_event, data: any) => {
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

      // Get-or-create FormaPago "CUENTA CORRIENTE"
      const NOMBRE_FP = 'CUENTA CORRIENTE';
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

      cliente.saldoActual = +(saldoAct + montoTotal).toFixed(2);
      await queryRunner.manager.save(Cliente, cliente);

      await queryRunner.commitTransaction();

      // ─── Auto-imprimir ticket de venta + pagaré (fire-and-forget) ─────
      // El handler `cobrar-venta-credito` no pasa por `updateVenta`, así
      // que el hook de auto-print del ticket no se dispara. Lo invocamos
      // explícitamente acá, igual que el flujo de cobro normal.
      setImmediate(async () => {
        try {
          const pdvConfig = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
          if (pdvConfig?.autoImprimirTicketVenta) {
            await printVentaTicketInternal(dataSource, venta.id);
          }
          // Pagaré siempre — es requerido para venta a crédito. Pequeña
          // pausa para que el ticket salga primero en la térmica.
          await new Promise(r => setTimeout(r, 600));
          await printPagareCpcTicketInternal(dataSource, cpcSaved.id);
        } catch (e: any) {
          console.warn('[cobrar-venta-credito] auto-print:', e?.message || e);
        }
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
