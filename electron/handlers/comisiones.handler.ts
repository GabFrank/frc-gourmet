import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { ReglaComision } from '../../src/app/database/entities/rrhh/regla-comision.entity';
import { ReglaComisionProducto } from '../../src/app/database/entities/rrhh/regla-comision-producto.entity';
import { ReglaComisionRequisito } from '../../src/app/database/entities/rrhh/regla-comision-requisito.entity';
import { FuncionarioReglaComision } from '../../src/app/database/entities/rrhh/funcionario-regla-comision.entity';
import { LiquidacionComision } from '../../src/app/database/entities/rrhh/liquidacion-comision.entity';
import { LiquidacionComisionItem } from '../../src/app/database/entities/rrhh/liquidacion-comision-item.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Penalizacion } from '../../src/app/database/entities/rrhh/penalizacion.entity';
import { Asistencia } from '../../src/app/database/entities/rrhh/asistencia.entity';
import { AsistenciaEstado } from '../../src/app/database/entities/rrhh/asistencia-estado.enum';
import {
  TipoReglaComision,
  ModoValidacionComision,
  LiquidacionComisionEstado,
  TipoRequisitoComision,
} from '../../src/app/database/entities/rrhh/regla-comision-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';
import { ensurePermission } from '../utils/auth.utils';

function getPeriodoBounds(periodo: string): { fechaInicio: Date; fechaFin: Date } {
  const [yStr, mStr] = periodo.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  return {
    fechaInicio: new Date(y, m - 1, 1),
    fechaFin: new Date(y, m, 0),
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Motor de evaluacion de una regla para un funcionario en un periodo.
 * Retorna { monto, observacionSnapshot }
 */
async function evaluarReglaParaFuncionario(
  dataSource: DataSource,
  queryRunner: any,
  reglaId: number,
  funcionarioId: number,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<{ monto: number; observacionSnapshot: string }> {
  const regla = await queryRunner.manager.findOne(ReglaComision, {
    where: { id: reglaId },
  });
  if (!regla) throw new Error(`Regla ${reglaId} no encontrada`);

  const productos = await queryRunner.manager.find(ReglaComisionProducto, {
    where: { reglaComision: { id: reglaId } } as any,
    relations: ['producto'],
  });

  const requisitos = await queryRunner.manager.find(ReglaComisionRequisito, {
    where: { reglaComision: { id: reglaId } } as any,
  });

  const funcionario = await queryRunner.manager.findOne(Funcionario, {
    where: { id: funcionarioId },
    relations: ['usuario'],
  });
  if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);

  const usuarioId = funcionario.usuario?.id;
  if (!usuarioId) {
    throw new Error(`Funcionario ${funcionarioId} no tiene usuario_id asignado. No puede tener reglas de comision.`);
  }

  // === METRICAS DE VENTAS ===
  let totalUnidades = 0;
  let totalMontoProductos = 0;
  let totalMontoVentaLocal = 0;

  const productoIds = productos.map((p) => p.producto?.id).filter(Boolean) as number[];
  const fdStr = isoDate(fechaInicio);
  const ffStr = isoDate(fechaFin);

  // Query venta items
  let ventaItemsQb = dataSource
    .createQueryBuilder('venta_items', 'vi')
    .innerJoin('ventas', 'v', 'vi.venta_id = v.id')
    .select([
      'vi.id as vi_id',
      'vi.cantidad as cantidad',
      'vi.precio_venta_unitario as precioUnitario',
      'vi.descuento_unitario as descuentoUnitario',
      'vi.precio_adicionales as precioAdicionales',
      'vi.producto_id as productoId',
      'v.id as ventaId',
      'v.total as ventaTotal',
    ])
    .where('v.estado = :estado', { estado: 'CONCLUIDA' })
    .andWhere(`(date(v.fecha_cierre) >= :fd OR date(v.created_at) >= :fd)`)
    .andWhere(`(date(v.fecha_cierre) <= :ff OR (v.fecha_cierre IS NULL AND date(v.created_at) <= :ff))`)
    .andWhere(`vi.estado != 'CANCELADO'`)
    .andWhere(`COALESCE(vi.vendedor_id, v.vendedor_id, v.created_by) = :uid`, { uid: usuarioId, fd: fdStr, ff: ffStr });

  if (productoIds.length > 0) {
    ventaItemsQb = ventaItemsQb.andWhere('vi.producto_id IN (:...pids)', { pids: productoIds });
  }

  const rawItems = await ventaItemsQb.getRawMany();

  // Sumar métricas
  const ventasUnicas = new Map<number, number>();
  for (const row of rawItems) {
    totalUnidades += Number(row.cantidad || 0);
    const lineaMonto = Number(row.precioUnitario || 0) * Number(row.cantidad || 0)
      - Number(row.descuentoUnitario || 0) * Number(row.cantidad || 0)
      + Number(row.precioAdicionales || 0);
    totalMontoProductos += lineaMonto;

    const vId = Number(row.ventaId);
    if (!ventasUnicas.has(vId)) {
      ventasUnicas.set(vId, Number(row.ventaTotal || 0));
    }
  }
  ventasUnicas.forEach((total) => { totalMontoVentaLocal += total; });

  // === EVALUACION DE REQUISITOS ===
  let factorRequisitos = 1;
  const resultadosRequisitos: Array<{ tipo: string; umbral: number; peso: number; valor: number; cumple: boolean }> = [];

  if (requisitos.length > 0) {
    let pesoCumplido = 0;
    let pesoTotal = 0;

    for (const req of requisitos) {
      const umbral = Number(req.umbral);
      const peso = Number(req.peso);
      pesoTotal += peso;
      let valor = 0;
      let cumple = false;

      if (req.tipo === TipoRequisitoComision.TARDANZA_MAX) {
        // Contar tardanzas del periodo
        const count = await queryRunner.manager
          .createQueryBuilder(Asistencia, 'a')
          .where('a.funcionario_id = :fid', { fid: funcionarioId })
          .andWhere('a.fecha BETWEEN :fd AND :ff', { fd: fdStr, ff: ffStr })
          .andWhere('a.estado = :est', { est: AsistenciaEstado.TARDANZA })
          .getCount();
        valor = count;
        cumple = count <= umbral;
      } else if (req.tipo === TipoRequisitoComision.QUEJA_MAX) {
        // Contar penalizaciones tipo QUEJA_CLIENTE
        const count = await queryRunner.manager
          .createQueryBuilder(Penalizacion, 'p')
          .where('p.funcionario_id = :fid', { fid: funcionarioId })
          .andWhere('p.fecha BETWEEN :fd AND :ff', { fd: fdStr, ff: ffStr })
          .andWhere("p.tipo = 'QUEJA_CLIENTE'")
          .andWhere('p.anulada = :a', { a: false })
          .getCount();
        valor = count;
        cumple = count <= umbral;
      } else if (req.tipo === TipoRequisitoComision.ASISTENCIA_MIN) {
        // Contar dias PRESENTE + JUSTIFICADO + FERIADO
        const count = await queryRunner.manager
          .createQueryBuilder(Asistencia, 'a')
          .where('a.funcionario_id = :fid', { fid: funcionarioId })
          .andWhere('a.fecha BETWEEN :fd AND :ff', { fd: fdStr, ff: ffStr })
          .andWhere('a.estado IN (:...ests)', { ests: [AsistenciaEstado.PRESENTE, AsistenciaEstado.JUSTIFICADO, AsistenciaEstado.FERIADO] })
          .getCount();
        valor = count;
        cumple = count >= umbral;
      } else {
        // CUSTOM - no se puede evaluar automáticamente, asumir cumplido
        valor = 0;
        cumple = true;
      }

      if (cumple) pesoCumplido += peso;
      resultadosRequisitos.push({ tipo: req.tipo, umbral, peso, valor, cumple });
    }

    if (regla.modoValidacion === ModoValidacionComision.TODO_O_NADA) {
      factorRequisitos = resultadosRequisitos.every((r) => r.cumple) ? 1 : 0;
    } else {
      factorRequisitos = pesoTotal > 0 ? pesoCumplido / pesoTotal : 1;
    }
  }

  // === CALCULO MONTO BASE ===
  let montoBase = 0;
  const montoBaseConfig = Number(regla.montoBase);
  const porcentaje = Number(regla.porcentaje || 0);
  const metaUnidades = Number(regla.metaUnidades || 0);
  const metaMontoLocal = Number(regla.metaMontoLocal || 0);

  switch (regla.tipo) {
    case TipoReglaComision.META_UNIDADES:
      if (metaUnidades > 0) {
        if (regla.modoValidacion === ModoValidacionComision.PROPORCIONAL) {
          montoBase = (totalUnidades / metaUnidades) * montoBaseConfig;
          if (totalUnidades >= metaUnidades) montoBase = montoBaseConfig;
        } else {
          montoBase = totalUnidades >= metaUnidades ? montoBaseConfig : 0;
        }
      }
      break;
    case TipoReglaComision.PORCENTAJE_VENTA:
      montoBase = totalMontoProductos * porcentaje / 100;
      break;
    case TipoReglaComision.META_VENTA_LOCAL:
      if (metaMontoLocal > 0) {
        montoBase = totalMontoVentaLocal >= metaMontoLocal ? montoBaseConfig : 0;
      }
      break;
    case TipoReglaComision.EXTRA_MANUAL:
    case TipoReglaComision.PENALIZACION_MANUAL:
    case TipoReglaComision.EQUIPO_PORCENTAJE:
      // Solo via items manuales o flujo equipo
      montoBase = 0;
      break;
    default:
      montoBase = 0;
  }

  const montoFinal = +(montoBase * factorRequisitos).toFixed(2);

  const snapshot = {
    regla: {
      id: regla.id,
      nombre: regla.nombre,
      tipo: regla.tipo,
      modoValidacion: regla.modoValidacion,
      montoBase: regla.montoBase,
      porcentaje: regla.porcentaje,
      metaUnidades: regla.metaUnidades,
      metaMontoLocal: regla.metaMontoLocal,
    },
    metricas: {
      totalUnidades,
      totalMontoProductos: +totalMontoProductos.toFixed(2),
      totalMontoVentaLocal: +totalMontoVentaLocal.toFixed(2),
    },
    requisitos: resultadosRequisitos,
    factorRequisitos,
    montoBase: +montoBase.toFixed(2),
    montoFinal,
  };

  return { monto: montoFinal, observacionSnapshot: JSON.stringify(snapshot) };
}

export function registerComisionesHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ===================== REGLAS COMISION =====================

  ipcMain.handle('get-reglas-comision', async (_e, filtros?: any) => {
    const repo = dataSource.getRepository(ReglaComision);
    const qb = repo.createQueryBuilder('r').orderBy('r.nombre', 'ASC');
    if (filtros?.activo !== undefined && filtros.activo !== null) {
      qb.andWhere('r.activo = :a', { a: filtros.activo });
    }
    return await qb.getMany();
  });

  ipcMain.handle('get-regla-comision', async (_e, id: number) => {
    const regla = await dataSource.getRepository(ReglaComision).findOne({ where: { id } });
    if (!regla) return null;
    const productos = await dataSource.getRepository(ReglaComisionProducto).find({
      where: { reglaComision: { id } } as any,
      relations: ['producto'],
    });
    const requisitos = await dataSource.getRepository(ReglaComisionRequisito).find({
      where: { reglaComision: { id } } as any,
    });
    return { ...regla, productos, requisitos };
  });

  ipcMain.handle('create-regla-comision', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMISION_REGLA_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const repo = queryRunner.manager.getRepository(ReglaComision);
      const regla = repo.create({
        nombre: (data.nombre || '').toUpperCase(),
        descripcion: data.descripcion,
        tipo: data.tipo,
        montoBase: data.montoBase || 0,
        porcentaje: data.porcentaje,
        metaUnidades: data.metaUnidades,
        metaMontoLocal: data.metaMontoLocal,
        modoValidacion: data.modoValidacion || ModoValidacionComision.TODO_O_NADA,
        recurrencia: data.recurrencia,
        fechaInicio: parseLocalDate(data.fechaInicio),
        fechaFin: parseLocalDate(data.fechaFin),
        esEquipo: data.esEquipo || false,
        activo: data.activo !== undefined ? data.activo : true,
      });
      await setEntityUserTracking(dataSource, regla, userId, false);
      const saved = await repo.save(regla);

      // Guardar productos
      if (data.productoIds?.length) {
        for (const pid of data.productoIds) {
          const rcp = queryRunner.manager.getRepository(ReglaComisionProducto).create({
            reglaComision: saved,
            producto: { id: pid } as any,
          });
          await setEntityUserTracking(dataSource, rcp, userId, false);
          await queryRunner.manager.getRepository(ReglaComisionProducto).save(rcp);
        }
      }

      // Guardar requisitos
      if (data.requisitos?.length) {
        for (const req of data.requisitos) {
          const rcr = queryRunner.manager.getRepository(ReglaComisionRequisito).create({
            reglaComision: saved,
            tipo: req.tipo,
            umbral: req.umbral,
            peso: req.peso || 1,
            descripcion: req.descripcion,
          });
          await setEntityUserTracking(dataSource, rcr, userId, false);
          await queryRunner.manager.getRepository(ReglaComisionRequisito).save(rcr);
        }
      }

      await queryRunner.commitTransaction();
      return saved;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('update-regla-comision', async (_e, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMISION_REGLA_GESTIONAR');
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const repo = queryRunner.manager.getRepository(ReglaComision);
      const regla = await repo.findOne({ where: { id } });
      if (!regla) throw new Error(`Regla ${id} no encontrada`);

      if (data.nombre !== undefined) regla.nombre = (data.nombre).toUpperCase();
      if (data.descripcion !== undefined) regla.descripcion = data.descripcion;
      if (data.tipo !== undefined) regla.tipo = data.tipo;
      if (data.montoBase !== undefined) regla.montoBase = data.montoBase;
      if (data.porcentaje !== undefined) regla.porcentaje = data.porcentaje;
      if (data.metaUnidades !== undefined) regla.metaUnidades = data.metaUnidades;
      if (data.metaMontoLocal !== undefined) regla.metaMontoLocal = data.metaMontoLocal;
      if (data.modoValidacion !== undefined) regla.modoValidacion = data.modoValidacion;
      if (data.recurrencia !== undefined) regla.recurrencia = data.recurrencia;
      if (data.fechaInicio !== undefined) regla.fechaInicio = parseLocalDate(data.fechaInicio);
      if (data.fechaFin !== undefined) regla.fechaFin = parseLocalDate(data.fechaFin);
      if (data.esEquipo !== undefined) regla.esEquipo = data.esEquipo;
      if (data.activo !== undefined) regla.activo = data.activo;

      await setEntityUserTracking(dataSource, regla, userId, true);
      const saved = await repo.save(regla);

      // Reemplazar productos si viene en payload
      if (data.productoIds !== undefined) {
        await queryRunner.manager.getRepository(ReglaComisionProducto)
          .createQueryBuilder().delete().where('regla_comision_id = :id', { id }).execute();
        for (const pid of (data.productoIds || [])) {
          const rcp = queryRunner.manager.getRepository(ReglaComisionProducto).create({
            reglaComision: { id } as any,
            producto: { id: pid } as any,
          });
          await setEntityUserTracking(dataSource, rcp, userId, false);
          await queryRunner.manager.getRepository(ReglaComisionProducto).save(rcp);
        }
      }

      // Reemplazar requisitos si viene en payload
      if (data.requisitos !== undefined) {
        await queryRunner.manager.getRepository(ReglaComisionRequisito)
          .createQueryBuilder().delete().where('regla_comision_id = :id', { id }).execute();
        for (const req of (data.requisitos || [])) {
          const rcr = queryRunner.manager.getRepository(ReglaComisionRequisito).create({
            reglaComision: { id } as any,
            tipo: req.tipo,
            umbral: req.umbral,
            peso: req.peso || 1,
            descripcion: req.descripcion,
          });
          await setEntityUserTracking(dataSource, rcr, userId, false);
          await queryRunner.manager.getRepository(ReglaComisionRequisito).save(rcr);
        }
      }

      await queryRunner.commitTransaction();
      return saved;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('delete-regla-comision', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMISION_REGLA_GESTIONAR');
    await dataSource.getRepository(ReglaComision).delete(id);
    return { success: true };
  });

  // ===================== ASIGNACION FUNCIONARIO-REGLA =====================

  ipcMain.handle('get-funcionarios-regla', async (_e, reglaId: number) => {
    return await dataSource.getRepository(FuncionarioReglaComision).find({
      where: { reglaComision: { id: reglaId } } as any,
      relations: ['funcionario', 'funcionario.persona'],
    });
  });

  ipcMain.handle('asignar-funcionario-regla', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMISION_REGLA_GESTIONAR');
    const { funcionarioId, reglaId, fechaDesde, fechaHasta } = data;
    const userId = getCurrentUser()?.id;

    // Verificar que funcionario tiene usuario_id
    const func = await dataSource.getRepository(Funcionario).findOne({
      where: { id: funcionarioId },
      relations: ['usuario'],
    });
    if (!func) throw new Error(`Funcionario ${funcionarioId} no encontrado`);
    if (!func.usuario) throw new Error(`El funcionario no tiene usuario_id asignado. Es obligatorio para comisiones.`);

    const repo = dataSource.getRepository(FuncionarioReglaComision);
    const asig = repo.create({
      funcionario: { id: funcionarioId } as any,
      reglaComision: { id: reglaId } as any,
      fechaDesde,
      fechaHasta,
      activo: true,
    });
    await setEntityUserTracking(dataSource, asig, userId, false);
    return await repo.save(asig);
  });

  ipcMain.handle('desasignar-funcionario-regla', async (_e, asignacionId: number) => {
    await dataSource.getRepository(FuncionarioReglaComision).delete(asignacionId);
    return { success: true };
  });

  // ===================== LIQUIDACIONES COMISION =====================

  ipcMain.handle('get-liquidaciones-comision', async (_e, filtros?: any) => {
    const repo = dataSource.getRepository(LiquidacionComision);
    const qb = repo.createQueryBuilder('l')
      .leftJoinAndSelect('l.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .leftJoinAndSelect('l.aprobadoPor', 'ap')
      .leftJoinAndSelect('ap.persona', 'app')
      .orderBy('l.periodo', 'DESC')
      .addOrderBy('l.id', 'DESC');
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    if (filtros?.periodo) qb.andWhere('l.periodo = :pe', { pe: filtros.periodo });
    if (filtros?.estado) qb.andWhere('l.estado = :e', { e: filtros.estado });
    return await qb.getMany();
  });

  ipcMain.handle('get-liquidacion-comision', async (_e, id: number) => {
    const liq = await dataSource.getRepository(LiquidacionComision).findOne({
      where: { id },
      relations: ['funcionario', 'funcionario.persona', 'aprobadoPor', 'aprobadoPor.persona'],
    });
    if (!liq) return null;
    const items = await dataSource.getRepository(LiquidacionComisionItem).find({
      where: { liquidacion: { id } } as any,
      relations: ['reglaComision'],
      order: { id: 'ASC' },
    });
    return { ...liq, items };
  });

  ipcMain.handle('generar-liquidacion-comision', async (_e, payload: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMISION_LIQUIDACION_GENERAR');
    const { funcionarioId, periodo } = payload;
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const liqRepo = queryRunner.manager.getRepository(LiquidacionComision);
      const itemRepo = queryRunner.manager.getRepository(LiquidacionComisionItem);

      // Verificar si ya existe
      let liq = await liqRepo.findOne({
        where: { funcionario: { id: funcionarioId } as any, periodo },
      });

      if (liq && (liq.estado === LiquidacionComisionEstado.APROBADA || liq.estado === LiquidacionComisionEstado.INTEGRADA)) {
        throw new Error('La liquidacion de comision ya está APROBADA o INTEGRADA, no se puede regenerar');
      }

      const { fechaInicio, fechaFin } = getPeriodoBounds(periodo);

      if (!liq) {
        liq = liqRepo.create({
          funcionario: { id: funcionarioId } as any,
          periodo,
          fechaInicio,
          fechaFin,
          totalCalculado: 0,
          estado: LiquidacionComisionEstado.BORRADOR,
        });
        await setEntityUserTracking(dataSource, liq, userId, false);
        liq = await liqRepo.save(liq);
      }

      // Borrar items NO manuales para regenerar
      await itemRepo.createQueryBuilder().delete()
        .where('liquidacion_comision_id = :lid AND es_manual = :m', { lid: liq.id, m: false })
        .execute();

      // Buscar reglas activas para este funcionario en el periodo
      const asignaciones = await queryRunner.manager.getRepository(FuncionarioReglaComision).find({
        where: { funcionario: { id: funcionarioId } as any, activo: true } as any,
        relations: ['reglaComision'],
      });

      let total = 0;
      for (const asig of asignaciones) {
        if (!asig.reglaComision?.activo) continue;
        // Verificar vigencia de la asignacion
        const desde = asig.fechaDesde ? new Date(asig.fechaDesde) : null;
        const hasta = asig.fechaHasta ? new Date(asig.fechaHasta) : null;
        if (desde && fechaFin < desde) continue;
        if (hasta && fechaInicio > hasta) continue;

        // Solo evaluar reglas que NO son de equipo ni manuales
        const tiposAutoEval = [
          TipoReglaComision.META_UNIDADES,
          TipoReglaComision.PORCENTAJE_VENTA,
          TipoReglaComision.META_VENTA_LOCAL,
        ];
        if (!tiposAutoEval.includes(asig.reglaComision.tipo)) continue;

        try {
          const { monto, observacionSnapshot } = await evaluarReglaParaFuncionario(
            dataSource,
            queryRunner,
            asig.reglaComision.id,
            funcionarioId,
            fechaInicio,
            fechaFin,
          );

          if (monto !== 0) {
            const item = itemRepo.create({
              liquidacion: liq,
              reglaComision: asig.reglaComision,
              concepto: asig.reglaComision.nombre,
              monto,
              esManual: false,
              observacion: observacionSnapshot,
            });
            await setEntityUserTracking(dataSource, item, userId, false);
            await itemRepo.save(item);
            total += monto;
          }
        } catch (err: any) {
          console.warn(`Error evaluando regla ${asig.reglaComision.id} para funcionario ${funcionarioId}:`, err.message);
        }
      }

      // Sumar items manuales que quedaron
      const manualItems = await itemRepo.find({
        where: { liquidacion: { id: liq.id } as any, esManual: true } as any,
      });
      for (const mi of manualItems) {
        total += Number(mi.monto);
      }

      liq.totalCalculado = +total.toFixed(2);
      await setEntityUserTracking(dataSource, liq, userId, true);
      await liqRepo.save(liq);

      await queryRunner.commitTransaction();
      return liq;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error generar-liquidacion-comision:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('generar-liquidaciones-comision-mes', async (_e, periodo: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMISION_LIQUIDACION_GENERAR');
    // Buscar todos los funcionarios con reglas activas
    const asignaciones = await dataSource.getRepository(FuncionarioReglaComision).find({
      where: { activo: true } as any,
      relations: ['funcionario'],
    });

    const funcionarioIds = [...new Set(asignaciones.map((a) => a.funcionario?.id).filter(Boolean))] as number[];

    const resultados: any[] = [];
    for (const fid of funcionarioIds) {
      try {
        // Llamar de forma recursiva via IPC no funciona en main process; invocar directo la lógica
        const result = await (ipcMain as any).listeners('generar-liquidacion-comision')[0]?.(null, { funcionarioId: fid, periodo });
        resultados.push({ funcionarioId: fid, ok: true });
      } catch (err: any) {
        resultados.push({ funcionarioId: fid, ok: false, error: err.message });
      }
    }
    return resultados;
  });

  ipcMain.handle('aprobar-liquidacion-comision', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'COMISION_LIQUIDACION_APROBAR');
    const repo = dataSource.getRepository(LiquidacionComision);
    const liq = await repo.findOne({ where: { id } });
    if (!liq) throw new Error(`Liquidacion comision ${id} no encontrada`);
    if (liq.estado !== LiquidacionComisionEstado.BORRADOR) throw new Error('Solo BORRADOR puede ser aprobado');
    const userId = getCurrentUser()?.id;
    const userEntity = userId
      ? await dataSource.getRepository(Usuario).findOne({ where: { id: userId } })
      : null;
    liq.estado = LiquidacionComisionEstado.APROBADA;
    liq.aprobadoPor = userEntity || undefined;
    liq.fechaAprobacion = new Date();
    await setEntityUserTracking(dataSource, liq, userId, true);
    return await repo.save(liq);
  });

  ipcMain.handle('agregar-item-manual-liquidacion-comision', async (_e, payload: any) => {
    const { liquidacionId, concepto, monto, esDescuento } = payload;
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const liqRepo = queryRunner.manager.getRepository(LiquidacionComision);
      const itemRepo = queryRunner.manager.getRepository(LiquidacionComisionItem);

      const liq = await liqRepo.findOne({ where: { id: liquidacionId } });
      if (!liq) throw new Error(`Liquidacion comision ${liquidacionId} no encontrada`);
      if (liq.estado !== LiquidacionComisionEstado.BORRADOR) throw new Error('Solo se pueden agregar items en BORRADOR');

      const montoReal = esDescuento ? -Math.abs(Number(monto)) : Math.abs(Number(monto));
      const item = itemRepo.create({
        liquidacion: liq,
        concepto: (concepto || '').toUpperCase(),
        monto: montoReal,
        esManual: true,
        observacion: payload.observacion,
      });
      await setEntityUserTracking(dataSource, item, userId, false);
      await itemRepo.save(item);

      // Recalcular total
      const allItems = await itemRepo.find({ where: { liquidacion: { id: liquidacionId } } as any });
      liq.totalCalculado = +allItems.reduce((s, i) => s + Number(i.monto), 0).toFixed(2);
      await setEntityUserTracking(dataSource, liq, userId, true);
      await liqRepo.save(liq);

      await queryRunner.commitTransaction();
      return item;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('eliminar-item-liquidacion-comision', async (_e, itemId: number) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const itemRepo = queryRunner.manager.getRepository(LiquidacionComisionItem);
      const liqRepo = queryRunner.manager.getRepository(LiquidacionComision);
      const item = await itemRepo.findOne({ where: { id: itemId }, relations: ['liquidacion'] });
      if (!item) throw new Error(`Item ${itemId} no encontrado`);
      const liq = await liqRepo.findOne({ where: { id: item.liquidacion.id } });
      if (!liq || liq.estado !== LiquidacionComisionEstado.BORRADOR) throw new Error('Solo BORRADOR permite eliminar items');
      await itemRepo.delete(itemId);

      const allItems = await itemRepo.find({ where: { liquidacion: { id: liq.id } } as any });
      liq.totalCalculado = +allItems.reduce((s, i) => s + Number(i.monto), 0).toFixed(2);
      await setEntityUserTracking(dataSource, liq, userId, true);
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

  ipcMain.handle('anular-liquidacion-comision', async (_e, id: number) => {
    const repo = dataSource.getRepository(LiquidacionComision);
    const liq = await repo.findOne({ where: { id } });
    if (!liq) throw new Error(`Liquidacion comision ${id} no encontrada`);
    if (liq.estado === LiquidacionComisionEstado.INTEGRADA) {
      throw new Error('No se puede anular una liquidacion INTEGRADA. Debe anularse via la liquidacion de sueldo.');
    }
    liq.estado = LiquidacionComisionEstado.ANULADA;
    await setEntityUserTracking(dataSource, liq, getCurrentUser()?.id, true);
    return await repo.save(liq);
  });
}
