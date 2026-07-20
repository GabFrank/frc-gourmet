import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { LiquidacionFinal, LiquidacionFinalEstado } from '../../src/app/database/entities/rrhh/liquidacion-final.entity';
import { LiquidacionFinalItem } from '../../src/app/database/entities/rrhh/liquidacion-final-item.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Vacacion } from '../../src/app/database/entities/rrhh/vacacion.entity';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { LiquidacionSueldoEstado } from '../../src/app/database/entities/rrhh/liquidacion-sueldo-estado.enum';
import { LiquidacionItemTipo } from '../../src/app/database/entities/rrhh/liquidacion-item-tipo.enum';
import { Vale } from '../../src/app/database/entities/rrhh/vale.entity';
import { ValeEstado } from '../../src/app/database/entities/rrhh/vale-estado.enum';
import { CuentaPorPagar } from '../../src/app/database/entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarCuota } from '../../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity';
import { CuentaPorPagarTipo, CuentaPorPagarEstado, CuotaEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { CuentaPorCobrar } from '../../src/app/database/entities/financiero/cuenta-por-cobrar.entity';
import { CuentaPorCobrarCuota } from '../../src/app/database/entities/financiero/cuenta-por-cobrar-cuota.entity';
import { MovimientoCliente } from '../../src/app/database/entities/financiero/movimiento-cliente.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import { CuentaPorCobrarEstado, CuentaPorCobrarCuotaEstado, MovimientoClienteTipo } from '../../src/app/database/entities/financiero/cuentas-por-cobrar-enums';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { MotivoEgreso } from '../../src/app/database/entities/rrhh/motivo-egreso.enum';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { getConfigNumber } from './configuracion-rrhh.handler';
import { ensurePermission } from '../utils/auth.utils';

function diffDias(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export function registerLiquidacionFinalHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-liquidaciones-final', async (_e, filtros: any) => {
    const repo = dataSource.getRepository(LiquidacionFinal);
    const qb = repo.createQueryBuilder('l')
      .leftJoinAndSelect('l.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .leftJoinAndSelect('l.moneda', 'mon')
      .orderBy('l.fechaEgreso', 'DESC');
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    if (filtros?.estado) qb.andWhere('l.estado = :e', { e: filtros.estado });
    return await qb.getMany();
  });

  ipcMain.handle('get-liquidacion-final', async (_e, id: number) => {
    const repo = dataSource.getRepository(LiquidacionFinal);
    const liq = await repo.findOne({
      where: { id },
      relations: ['funcionario', 'funcionario.persona', 'funcionario.cargo', 'moneda', 'aprobadoPor', 'aprobadoPor.persona'],
    });
    if (!liq) return null;
    const items = await dataSource.getRepository(LiquidacionFinalItem).find({
      where: { liquidacionFinal: { id } as any },
      order: { id: 'ASC' },
    });
    return { ...liq, items };
  });

  ipcMain.handle('generar-liquidacion-final', async (_e, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_FINAL_GENERAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const { funcionarioId, fechaEgreso, motivoEgreso } = payload;
      const funcionario = await queryRunner.manager.findOne(Funcionario, {
        where: { id: funcionarioId },
        relations: ['persona', 'monedaSalario'],
      });
      if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);

      const liqRepo = queryRunner.manager.getRepository(LiquidacionFinal);
      const itemRepo = queryRunner.manager.getRepository(LiquidacionFinalItem);

      // Verificar no exista ya
      const existing = await liqRepo.findOne({ where: { funcionario: { id: funcionarioId } as any } });
      if (existing && existing.estado !== LiquidacionFinalEstado.ANULADA) {
        throw new Error('Ya existe una liquidacion final para este funcionario');
      }

      const ingreso = new Date(funcionario.fechaIngreso);
      const egreso = new Date(fechaEgreso);
      const dias = diffDias(ingreso, egreso);
      const meses = Math.floor(dias / 30);
      const anios = Math.floor(dias / 365);

      // Salario promedio ultimos 6 meses (sumar liquidaciones aprobadas/pagadas y dividir)
      const liqsRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const seisMesesAtras = new Date(egreso);
      seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 6);
      const liqsRecientes = await liqsRepo.createQueryBuilder('l')
        .where('l.funcionario_id = :fid', { fid: funcionarioId })
        .andWhere('l.fechaInicio >= :sm', { sm: seisMesesAtras })
        .andWhere('l.estado IN (:...estados)', { estados: [LiquidacionSueldoEstado.APROBADA, LiquidacionSueldoEstado.PAGADA] })
        .getMany();
      const totalLiq = liqsRecientes.reduce((sum, l) => sum + Number(l.totalHaberes), 0);
      const salarioPromedio = liqsRecientes.length > 0 ? +(totalLiq / liqsRecientes.length).toFixed(2) : Number(funcionario.salarioBase);

      // Indemnizacion
      const minDias = await getConfigNumber(dataSource, 'INDEMNIZACION_ANTIGUEDAD_MIN_DIAS', 90);
      const diasPorAnio = await getConfigNumber(dataSource, 'INDEMNIZACION_DIAS_POR_ANIO', 15);
      let indemnizacionAplica = false;
      let indemnizacion = 0;
      if (motivoEgreso === MotivoEgreso.DESPIDO_INJUSTIFICADO && dias >= minDias) {
        indemnizacionAplica = true;
        const valorDia = salarioPromedio / 30;
        indemnizacion = +(valorDia * diasPorAnio * Math.max(1, anios)).toFixed(2);
      }

      // Vacaciones no gozadas (suma de diasGenerados - diasGozados de Vacaciones no prescritas)
      const vacRepo = queryRunner.manager.getRepository(Vacacion);
      const vacaciones = await vacRepo.find({
        where: { funcionario: { id: funcionarioId } as any, prescrita: false },
      });
      const diasNoGozados = vacaciones.reduce((sum, v) => sum + (v.diasGenerados - v.diasGozados), 0);
      const valorDia = salarioPromedio / 30;
      const montoVacaciones = +(diasNoGozados * valorDia).toFixed(2);

      // Aguinaldo proporcional (1/12 del total ganado en el anio en curso hasta el egreso)
      const anioEgreso = egreso.getFullYear();
      const liqsAnio = await liqsRepo.createQueryBuilder('l')
        .where('l.funcionario_id = :fid', { fid: funcionarioId })
        .andWhere('l.periodo LIKE :anio', { anio: `${anioEgreso}-%` })
        .andWhere('l.estado IN (:...estados)', { estados: [LiquidacionSueldoEstado.APROBADA, LiquidacionSueldoEstado.PAGADA] })
        .getMany();
      const totalAnio = liqsAnio.reduce((sum, l) => sum + Number(l.totalHaberes), 0);
      const aguinaldoProporcional = +(totalAnio / 12).toFixed(2);

      const totalHaberes = +(indemnizacion + montoVacaciones + aguinaldoProporcional).toFixed(2);

      const userId = getCurrentUser()?.id;
      const moneda = funcionario.monedaSalario;

      // ===== Deudas del funcionario a netear contra los haberes =====
      // Se descuentan en orden de prioridad hasta agotar los haberes:
      //   1) vales pendientes  2) cuotas de préstamo  3) consumo a crédito.
      // El neto se topa en 0; las deudas no cubiertas quedan abiertas (a cobrar).
      type DescuentoDef = { concepto: string; monto: number; descripcion: string; refTipo: string; refId: number };
      const descuentoDefs: DescuentoDef[] = [];
      let disponible = totalHaberes;

      // 1) Vales CONFIRMADO no enlazados a otra liquidación (atómicos: solo si caben completos)
      const valeRepo = queryRunner.manager.getRepository(Vale);
      const valesPendientes = await valeRepo.createQueryBuilder('v')
        .where('v.funcionario_id = :fid', { fid: funcionarioId })
        .andWhere('v.estado = :est', { est: ValeEstado.CONFIRMADO })
        .andWhere('v.liquidacion_id IS NULL')
        .orderBy('v.fecha', 'ASC')
        .addOrderBy('v.id', 'ASC')
        .getMany();
      for (const v of valesPendientes) {
        if (disponible <= 0.005) break;
        const saldo = +Number(v.monto).toFixed(2);
        if (saldo > 0 && saldo <= disponible + 0.005) {
          descuentoDefs.push({
            concepto: v.esAdelanto ? 'ADELANTO' : 'VALE',
            monto: saldo,
            descripcion: v.esAdelanto ? `Adelanto #${v.id}` : `Vale #${v.id}`,
            refTipo: 'VALE',
            refId: v.id,
          });
          disponible = +(disponible - saldo).toFixed(2);
        }
      }

      // 2) Cuotas de préstamo (CPP PRESTAMO_FUNCIONARIO) — parcial permitido
      const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
      const cuotaCppRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);
      const prestamos = await cppRepo.find({
        where: { funcionario: { id: funcionarioId } as any, tipo: CuentaPorPagarTipo.PRESTAMO_FUNCIONARIO, estado: CuentaPorPagarEstado.ACTIVO },
      });
      for (const p of prestamos) {
        const cuotas = await cuotaCppRepo.createQueryBuilder('c')
          .where('c.cuenta_por_pagar_id = :pid', { pid: p.id })
          .andWhere('c.estado IN (:...ests)', { ests: [CuotaEstado.PENDIENTE, CuotaEstado.PARCIAL, CuotaEstado.VENCIDA] })
          .orderBy('c.fechaVencimiento', 'ASC')
          .getMany();
        for (const c of cuotas) {
          if (disponible <= 0.005) break;
          const saldo = +(Number(c.monto) - Number(c.montoPagado)).toFixed(2);
          const net = +Math.min(saldo, disponible).toFixed(2);
          if (net > 0.005) {
            descuentoDefs.push({ concepto: 'PRESTAMO_CUOTA', monto: net, descripcion: `Cuota #${c.numero} préstamo "${p.descripcion}"`, refTipo: 'CPP_CUOTA', refId: c.id });
            disponible = +(disponible - net).toFixed(2);
          }
        }
      }

      // 3) Consumo a crédito (CPC del cliente por persona_id) — parcial permitido
      const personaId = funcionario.persona?.id;
      if (personaId && disponible > 0.005) {
        const clienteRepo = queryRunner.manager.getRepository(Cliente);
        const clienteFunc = await clienteRepo.findOne({ where: { persona: { id: personaId } as any } });
        if (clienteFunc) {
          const cpcRepo = queryRunner.manager.getRepository(CuentaPorCobrar);
          const cuotaCpcRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
          const cpcs = await cpcRepo.find({ where: { cliente: { id: clienteFunc.id } as any, estado: CuentaPorCobrarEstado.ACTIVO } });
          for (const cpc of cpcs) {
            const cuotas = await cuotaCpcRepo.createQueryBuilder('c')
              .where('c.cuenta_por_cobrar_id = :cid', { cid: cpc.id })
              .andWhere('c.estado IN (:...ests)', { ests: [CuentaPorCobrarCuotaEstado.PENDIENTE, CuentaPorCobrarCuotaEstado.PARCIAL] })
              .orderBy('c.fechaVencimiento', 'ASC')
              .getMany();
            for (const c of cuotas) {
              if (disponible <= 0.005) break;
              const saldo = +(Number(c.monto) - Number(c.montoCobrado)).toFixed(2);
              const net = +Math.min(saldo, disponible).toFixed(2);
              if (net > 0.005) {
                descuentoDefs.push({ concepto: 'CREDITO_CONSUMO', monto: net, descripcion: `Cuota #${c.numero} - ${cpc.descripcion || 'consumo a crédito'}`, refTipo: 'CPC_CUOTA', refId: c.id });
                disponible = +(disponible - net).toFixed(2);
              }
            }
          }
        }
      }

      const totalDescuentos = +descuentoDefs.reduce((s, d) => s + d.monto, 0).toFixed(2);
      const totalNeto = +(totalHaberes - totalDescuentos).toFixed(2);

      const liq = liqRepo.create({
        funcionario,
        fechaEgreso: egreso,
        motivoEgreso,
        antiguedadDias: dias,
        antiguedadMeses: meses,
        antiguedadAnios: anios,
        salarioPromedioUltimos6Meses: salarioPromedio,
        indemnizacionMonto: indemnizacion,
        indemnizacionAplica,
        vacacionesNoGozadas: diasNoGozados,
        montoVacacionesNoGozadas: montoVacaciones,
        aguinaldoProporcional,
        totalLiquidado: totalHaberes,
        totalHaberes,
        totalDescuentos,
        totalNeto,
        moneda,
        estado: LiquidacionFinalEstado.BORRADOR,
      });
      await setEntityUserTracking(dataSource, liq, userId, false);
      const savedLiq = await liqRepo.save(liq);

      const crearItem = async (concepto: string, monto: number, descripcion: string, tipo: LiquidacionItemTipo, refTipo?: string, refId?: number) => {
        const item = itemRepo.create({ liquidacionFinal: savedLiq, concepto, monto, descripcion, tipo, referenciaTipo: refTipo, referenciaId: refId });
        await setEntityUserTracking(dataSource, item, userId, false);
        await itemRepo.save(item);
      };

      // Items HABER
      if (indemnizacion > 0) {
        await crearItem('INDEMNIZACION', indemnizacion, `${diasPorAnio} jornales por ${anios} anios = ${indemnizacion}`, LiquidacionItemTipo.HABER);
      }
      if (montoVacaciones > 0) {
        await crearItem('VACACIONES_NO_GOZADAS', montoVacaciones, `${diasNoGozados} dias x ${valorDia.toFixed(2)} = ${montoVacaciones}`, LiquidacionItemTipo.HABER);
      }
      if (aguinaldoProporcional > 0) {
        await crearItem('AGUINALDO_PROPORCIONAL', aguinaldoProporcional, `1/12 del total liquidado ${anioEgreso}`, LiquidacionItemTipo.HABER);
      }
      // Items DESCUENTO (deudas neteadas)
      for (const d of descuentoDefs) {
        await crearItem(d.concepto, d.monto, d.descripcion, LiquidacionItemTipo.DESCUENTO, d.refTipo, d.refId);
      }

      // Actualizar funcionario egreso
      funcionario.fechaEgreso = egreso;
      funcionario.motivoEgreso = motivoEgreso;
      funcionario.activo = false;
      await queryRunner.manager.save(Funcionario, funcionario);

      await queryRunner.commitTransaction();
      return savedLiq;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error generar-liquidacion-final:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('aprobar-liquidacion-final', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_FINAL_GENERAR');
    const repo = dataSource.getRepository(LiquidacionFinal);
    const liq = await repo.findOne({ where: { id } });
    if (!liq) throw new Error(`Liquidacion final ${id} no encontrada`);
    if (liq.estado !== LiquidacionFinalEstado.BORRADOR) throw new Error('Solo BORRADOR puede aprobarse');
    const userId = getCurrentUser()?.id;
    const userEntity = userId ? await dataSource.getRepository(Usuario).findOne({ where: { id: userId } }) : null;
    liq.estado = LiquidacionFinalEstado.APROBADA;
    liq.aprobadoPor = userEntity || undefined;
    liq.fechaAprobacion = new Date();
    await setEntityUserTracking(dataSource, liq, userId, true);
    return await repo.save(liq);
  });

  ipcMain.handle('pagar-liquidacion-final', async (_e, id: number, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_LIQUIDACION_PAGAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const liqRepo = queryRunner.manager.getRepository(LiquidacionFinal);
      const liq = await liqRepo.findOne({ where: { id }, relations: ['funcionario', 'funcionario.persona', 'moneda'] });
      if (!liq) throw new Error(`Liquidacion final ${id} no encontrada`);
      if (liq.estado !== LiquidacionFinalEstado.APROBADA) throw new Error('Solo APROBADA puede pagarse');

      const cajaMayorId = payload?.cajaMayorId;
      const monedaId = payload?.monedaId || liq.moneda?.id;
      const formaPagoId = payload?.formaPagoId;

      const userId = getCurrentUser()?.id;
      const userEntity = userId ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } }) : null;
      // El neto ya descuenta las deudas del funcionario; es lo que sale en efectivo.
      const monto = Number(liq.totalNeto);
      if (monto > 0 && (!cajaMayorId || !monedaId || !formaPagoId)) throw new Error('Faltan datos para el pago');
      const obs = `LIQUIDACION FINAL - ${liq.funcionario.persona?.nombre || ''} ${liq.funcionario.persona?.apellido || ''}`.trim();

      // Egreso de caja solo si hay neto a pagar (puede ser 0 si las deudas
      // igualan o superan los haberes; en ese caso solo se saldan deudas).
      let movId: number | null = null;
      if (monto > 0) {
        const movimiento = queryRunner.manager.create(CajaMayorMovimiento, {
          cajaMayor: { id: cajaMayorId } as any,
          tipoMovimiento: TipoMovimiento.EGRESO_SALARIO,
          moneda: { id: monedaId } as any,
          formaPago: { id: formaPagoId } as any,
          monto,
          fecha: new Date(),
          observacion: obs,
          responsable: userEntity || undefined,
        });
        await setEntityUserTracking(dataSource, movimiento, userId, false);
        const movSaved = await queryRunner.manager.save(CajaMayorMovimiento, movimiento);
        movId = movSaved.id;
        await actualizarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, monto, TipoMovimiento.EGRESO_SALARIO);
      }

      // ===== Saldar las deudas neteadas (items DESCUENTO) =====
      // Van neteadas dentro del EGRESO_SALARIO: sin movimientos aparte de Caja Mayor.
      const items = await queryRunner.manager.getRepository(LiquidacionFinalItem).find({
        where: { liquidacionFinal: { id: liq.id } as any },
      });
      const descuentos = items.filter((i) => i.tipo === LiquidacionItemTipo.DESCUENTO && i.referenciaTipo && i.referenciaId);

      // Vales -> DESCONTADO
      const valeRepo = queryRunner.manager.getRepository(Vale);
      for (const it of descuentos.filter((d) => d.referenciaTipo === 'VALE')) {
        const vale = await valeRepo.findOne({ where: { id: it.referenciaId! } });
        if (vale && vale.estado === ValeEstado.CONFIRMADO) {
          vale.estado = ValeEstado.DESCONTADO;
          await setEntityUserTracking(dataSource, vale, userId, true);
          await valeRepo.save(vale);
        }
      }

      // Cuotas de préstamo -> montoPagado += neto (puede ser parcial)
      const cuotaCppRepo = queryRunner.manager.getRepository(CuentaPorPagarCuota);
      const cppRepo = queryRunner.manager.getRepository(CuentaPorPagar);
      for (const it of descuentos.filter((d) => d.referenciaTipo === 'CPP_CUOTA')) {
        const cuota = await cuotaCppRepo.findOne({ where: { id: it.referenciaId! }, relations: ['cuentaPorPagar'] });
        if (!cuota) continue;
        const restante = +(Number(cuota.monto) - Number(cuota.montoPagado)).toFixed(2);
        const pagar = Math.min(Number(it.monto), restante);
        if (pagar <= 0) continue;
        cuota.montoPagado = +(Number(cuota.montoPagado) + pagar).toFixed(2);
        cuota.estado = cuota.montoPagado >= Number(cuota.monto) - 0.005 ? CuotaEstado.PAGADA : CuotaEstado.PARCIAL;
        if (cuota.estado === CuotaEstado.PAGADA) cuota.fechaPago = new Date();
        await cuotaCppRepo.save(cuota);
        const cpp = await cppRepo.findOne({ where: { id: cuota.cuentaPorPagar.id }, relations: ['cuotas'] });
        if (cpp) {
          cpp.montoPagado = +(Number(cpp.montoPagado) + pagar).toFixed(2);
          const todasPagadas = (cpp.cuotas || []).every((c: any) => Number(c.montoPagado) >= Number(c.monto) - 0.005);
          if (todasPagadas) cpp.estado = CuentaPorPagarEstado.PAGADO;
          await cppRepo.save(cpp);
        }
      }

      // Cuotas de CPC -> montoCobrado += neto, baja saldoActual, MovimientoCliente PAGO
      const cuotaCpcRepo = queryRunner.manager.getRepository(CuentaPorCobrarCuota);
      const cpcRepo = queryRunner.manager.getRepository(CuentaPorCobrar);
      const clienteRepo = queryRunner.manager.getRepository(Cliente);
      const movClienteRepo = queryRunner.manager.getRepository(MovimientoCliente);
      for (const it of descuentos.filter((d) => d.referenciaTipo === 'CPC_CUOTA')) {
        const cuota = await cuotaCpcRepo.findOne({ where: { id: it.referenciaId! }, relations: ['cuentaPorCobrar'] });
        if (!cuota) continue;
        if (cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO || cuota.estado === CuentaPorCobrarCuotaEstado.CANCELADO) continue;
        const restante = +(Number(cuota.monto) - Number(cuota.montoCobrado)).toFixed(2);
        const cobrar = Math.min(Number(it.monto), restante);
        if (cobrar <= 0) continue;
        cuota.montoCobrado = +(Number(cuota.montoCobrado) + cobrar).toFixed(2);
        cuota.estado = cuota.montoCobrado >= Number(cuota.monto) - 0.005 ? CuentaPorCobrarCuotaEstado.COBRADO : CuentaPorCobrarCuotaEstado.PARCIAL;
        if (cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO) cuota.fechaCobro = new Date();
        await cuotaCpcRepo.save(cuota);
        const cpc = await cpcRepo.findOne({ where: { id: cuota.cuentaPorCobrar.id }, relations: ['cuotas', 'cliente'] });
        if (!cpc) continue;
        cpc.montoCobrado = +(Number(cpc.montoCobrado) + cobrar).toFixed(2);
        const todasCobradas = (cpc.cuotas || []).every((c: any) =>
          c.id === cuota.id ? cuota.estado === CuentaPorCobrarCuotaEstado.COBRADO : Number(c.montoCobrado) >= Number(c.monto) - 0.005);
        if (todasCobradas) cpc.estado = CuentaPorCobrarEstado.COBRADO;
        await cpcRepo.save(cpc);
        const clienteId = cpc.cliente?.id;
        if (clienteId) {
          const cliente = await clienteRepo.findOne({ where: { id: clienteId } });
          if (cliente) {
            cliente.saldoActual = +(Number(cliente.saldoActual) - cobrar).toFixed(2);
            await clienteRepo.save(cliente);
          }
          const movCliente = movClienteRepo.create({
            cliente: { id: clienteId } as any,
            tipo: MovimientoClienteTipo.PAGO,
            monto: cobrar,
            fecha: new Date(),
            cuentaPorCobrarId: cpc.id,
            cuentaPorCobrarCuotaId: cuota.id,
            observacion: `LIQUIDACION FINAL #${liq.id} - COBRO CUOTA #${cuota.numero}`,
            registradoPor: userEntity || undefined,
          });
          await setEntityUserTracking(dataSource, movCliente, userId, false);
          await movClienteRepo.save(movCliente);
        }
      }

      liq.estado = LiquidacionFinalEstado.PAGADA;
      liq.fechaPago = new Date();
      if (movId) liq.movimientoId = movId;
      await setEntityUserTracking(dataSource, liq, userId, true);
      await liqRepo.save(liq);

      await queryRunner.commitTransaction();
      return liq;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error pagar-liquidacion-final:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });
}
