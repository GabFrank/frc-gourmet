import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { LiquidacionFinal, LiquidacionFinalEstado } from '../../src/app/database/entities/rrhh/liquidacion-final.entity';
import { LiquidacionFinalItem } from '../../src/app/database/entities/rrhh/liquidacion-final-item.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Vacacion } from '../../src/app/database/entities/rrhh/vacacion.entity';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { LiquidacionSueldoEstado } from '../../src/app/database/entities/rrhh/liquidacion-sueldo-estado.enum';
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

      const totalLiquidado = +(indemnizacion + montoVacaciones + aguinaldoProporcional).toFixed(2);

      const userId = getCurrentUser()?.id;
      const moneda = funcionario.monedaSalario;

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
        totalLiquidado,
        moneda,
        estado: LiquidacionFinalEstado.BORRADOR,
      });
      await setEntityUserTracking(dataSource, liq, userId, false);
      const savedLiq = await liqRepo.save(liq);

      // Items
      if (indemnizacion > 0) {
        const item = itemRepo.create({
          liquidacionFinal: savedLiq,
          concepto: 'INDEMNIZACION',
          monto: indemnizacion,
          descripcion: `${diasPorAnio} jornales por ${anios} anios = ${indemnizacion}`,
        });
        await setEntityUserTracking(dataSource, item, userId, false);
        await itemRepo.save(item);
      }
      if (montoVacaciones > 0) {
        const item = itemRepo.create({
          liquidacionFinal: savedLiq,
          concepto: 'VACACIONES_NO_GOZADAS',
          monto: montoVacaciones,
          descripcion: `${diasNoGozados} dias x ${valorDia.toFixed(2)} = ${montoVacaciones}`,
        });
        await setEntityUserTracking(dataSource, item, userId, false);
        await itemRepo.save(item);
      }
      if (aguinaldoProporcional > 0) {
        const item = itemRepo.create({
          liquidacionFinal: savedLiq,
          concepto: 'AGUINALDO_PROPORCIONAL',
          monto: aguinaldoProporcional,
          descripcion: `1/12 del total liquidado ${anioEgreso}`,
        });
        await setEntityUserTracking(dataSource, item, userId, false);
        await itemRepo.save(item);
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
      if (!cajaMayorId || !monedaId || !formaPagoId) throw new Error('Faltan datos para el pago');

      const userId = getCurrentUser()?.id;
      const userEntity = userId ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } }) : null;
      const monto = Number(liq.totalLiquidado);
      const obs = `LIQUIDACION FINAL - ${liq.funcionario.persona?.nombre || ''} ${liq.funcionario.persona?.apellido || ''}`.trim();

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
      await actualizarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, monto, TipoMovimiento.EGRESO_SALARIO);

      liq.estado = LiquidacionFinalEstado.PAGADA;
      liq.fechaPago = new Date();
      liq.movimientoId = movSaved.id;
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
