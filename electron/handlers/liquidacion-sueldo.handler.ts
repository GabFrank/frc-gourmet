import { ipcMain } from 'electron';
import { Between, DataSource } from 'typeorm';
import { LiquidacionSueldo } from '../../src/app/database/entities/rrhh/liquidacion-sueldo.entity';
import { LiquidacionItem } from '../../src/app/database/entities/rrhh/liquidacion-item.entity';
import { LiquidacionConcepto } from '../../src/app/database/entities/rrhh/liquidacion-concepto.entity';
import { LiquidacionComision } from '../../src/app/database/entities/rrhh/liquidacion-comision.entity';
import { LiquidacionComisionEstado } from '../../src/app/database/entities/rrhh/regla-comision-enums';
import { LiquidacionSueldoEstado } from '../../src/app/database/entities/rrhh/liquidacion-sueldo-estado.enum';
import { LiquidacionItemTipo } from '../../src/app/database/entities/rrhh/liquidacion-item-tipo.enum';
import { Bono } from '../../src/app/database/entities/rrhh/bono.entity';
import { Aguinaldo, AguinaldoEstado } from '../../src/app/database/entities/rrhh/aguinaldo.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Vale } from '../../src/app/database/entities/rrhh/vale.entity';
import { ValeEstado } from '../../src/app/database/entities/rrhh/vale-estado.enum';
import { Penalizacion } from '../../src/app/database/entities/rrhh/penalizacion.entity';
import { HoraExtra } from '../../src/app/database/entities/rrhh/hora-extra.entity';
import { CuentaPorPagar } from '../../src/app/database/entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarTipo } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { CuentaPorPagarCuota } from '../../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity';
import { CuotaEstado } from '../../src/app/database/entities/financiero/cuentas-por-pagar-enums';
import { CajaMayorMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-movimiento.entity';
import { TipoMovimiento } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { actualizarSaldoCajaMayor } from './caja-mayor-utils';
import { getConfigNumber } from './configuracion-rrhh.handler';

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

async function recalcularTotales(items: LiquidacionItem[]): Promise<{ haberes: number; descuentos: number; neto: number }> {
  let haberes = 0;
  let descuentos = 0;
  for (const it of items) {
    if (it.tipo === LiquidacionItemTipo.HABER) haberes += Number(it.monto);
    else descuentos += Math.abs(Number(it.monto));
  }
  return { haberes, descuentos, neto: haberes - descuentos };
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
      const funcionario = await queryRunner.manager.findOne(Funcionario, {
        where: { id: funcionarioId },
        relations: ['persona', 'monedaSalario'],
      });
      if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);

      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const itemRepo = queryRunner.manager.getRepository(LiquidacionItem);
      const conceptoRepo = queryRunner.manager.getRepository(LiquidacionConcepto);

      // Buscar liquidacion existente
      let liq = await liqRepo.findOne({
        where: {
          funcionario: { id: funcionarioId } as any,
          periodo,
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
      const valesPendientes = await valeRepo.find({
        where: {
          funcionario: { id: funcionarioId } as any,
          estado: ValeEstado.CONFIRMADO,
        },
      });
      for (const v of valesPendientes) {
        const concepto = v.esAdelanto ? 'ADELANTO_DESCUENTO' : 'VALE_DESCUENTO';
        const desc = v.esAdelanto ? `Adelanto #${v.id}` : `Vale #${v.id}`;
        await crearItem(concepto, desc, Number(v.monto), LiquidacionItemTipo.DESCUENTO, v.id, 'VALE');
      }

      // 6) Cuotas de prestamo del periodo (PRESTAMO_FUNCIONARIO + cuotas pendientes/parciales con vencimiento dentro del periodo)
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
          .andWhere('c.fechaVencimiento BETWEEN :fd AND :ff', { fd: isoDate(fechaInicio), ff: isoDate(fechaFin) })
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

      // Recalcular totales
      const allItems = await itemRepo.find({ where: { liquidacion: { id: liq.id } as any } });
      const tot = await recalcularTotales(allItems);
      liq.totalHaberes = tot.haberes;
      liq.totalDescuentos = tot.descuentos;
      liq.totalNeto = tot.neto;
      await setEntityUserTracking(dataSource, liq, userId, true);
      await liqRepo.save(liq);

      await queryRunner.commitTransaction();
      return liq;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error generar-liquidacion-borrador:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('agregar-item-liquidacion', async (_e, liquidacionId: number, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const itemRepo = queryRunner.manager.getRepository(LiquidacionItem);
      const liq = await liqRepo.findOne({ where: { id: liquidacionId } });
      if (!liq) throw new Error(`Liquidacion ${liquidacionId} no encontrada`);
      if (liq.estado !== LiquidacionSueldoEstado.BORRADOR) throw new Error('Solo se pueden agregar items en BORRADOR');

      const userId = getCurrentUser()?.id;
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
      await itemRepo.save(item);

      const allItems = await itemRepo.find({ where: { liquidacion: { id: liq.id } as any } });
      const tot = await recalcularTotales(allItems);
      liq.totalHaberes = tot.haberes;
      liq.totalDescuentos = tot.descuentos;
      liq.totalNeto = tot.neto;
      await setEntityUserTracking(dataSource, liq, userId, true);
      await liqRepo.save(liq);

      await queryRunner.commitTransaction();
      return item;
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
      const itemRepo = queryRunner.manager.getRepository(LiquidacionItem);
      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const item = await itemRepo.findOne({ where: { id: itemId }, relations: ['liquidacion'] });
      if (!item) throw new Error(`Item ${itemId} no encontrado`);
      const liq = await liqRepo.findOne({ where: { id: item.liquidacion.id } });
      if (!liq || liq.estado !== LiquidacionSueldoEstado.BORRADOR) throw new Error('Solo BORRADOR permite eliminar items');
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

  ipcMain.handle('aprobar-liquidacion-sueldo', async (_e, id: number) => {
    const repo = dataSource.getRepository(LiquidacionSueldo);
    const liq = await repo.findOne({ where: { id } });
    if (!liq) throw new Error(`Liquidacion ${id} no encontrada`);
    if (liq.estado !== LiquidacionSueldoEstado.BORRADOR) throw new Error('Solo BORRADOR puede ser aprobado');
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

      const cajaMayorId = payload?.cajaMayorId;
      const monedaId = payload?.monedaId || liq.monedaPago?.id;
      const formaPagoId = payload?.formaPagoId;
      if (!cajaMayorId || !monedaId || !formaPagoId) throw new Error('Faltan datos para el pago');

      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;

      const monto = Number(liq.totalNeto);
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

      await actualizarSaldoCajaMayor(queryRunner, cajaMayorId, monedaId, formaPagoId, monto, TipoMovimiento.EGRESO_SALARIO);

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

      liq.estado = LiquidacionSueldoEstado.PAGADA;
      liq.fechaPago = new Date();
      liq.movimientoId = movSaved.id;
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
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const liqRepo = queryRunner.manager.getRepository(LiquidacionSueldo);
      const liq = await liqRepo.findOne({ where: { id }, relations: ['monedaPago'] });
      if (!liq) throw new Error(`Liquidacion ${id} no encontrada`);

      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;

      // Si fue PAGADA, contra-movimiento
      if (liq.estado === LiquidacionSueldoEstado.PAGADA && liq.movimientoId) {
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
    const repo = dataSource.getRepository(Bono);
    const funcionario = await dataSource.getRepository(Funcionario).findOne({ where: { id: data.funcionarioId } });
    if (!funcionario) throw new Error(`Funcionario ${data.funcionarioId} no encontrado`);
    const entity = repo.create({
      funcionario,
      tipo: data.tipo,
      monto: data.monto,
      fecha: data.fecha,
      motivo: data.motivo,
      esRecurrente: data.esRecurrente === true,
      frecuencia: data.frecuencia,
      anulado: false,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('anular-bono', async (_e, id: number) => {
    const repo = dataSource.getRepository(Bono);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Bono ${id} no encontrado`);
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
