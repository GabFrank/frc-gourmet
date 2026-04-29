import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { EquipoComision } from '../../src/app/database/entities/rrhh/equipo-comision.entity';
import { EquipoComisionMiembro } from '../../src/app/database/entities/rrhh/equipo-comision-miembro.entity';
import { EquipoComisionRegla } from '../../src/app/database/entities/rrhh/equipo-comision-regla.entity';
import { ReglaComision } from '../../src/app/database/entities/rrhh/regla-comision.entity';
import { ReglaComisionProducto } from '../../src/app/database/entities/rrhh/regla-comision-producto.entity';
import { LiquidacionComision } from '../../src/app/database/entities/rrhh/liquidacion-comision.entity';
import { LiquidacionComisionItem } from '../../src/app/database/entities/rrhh/liquidacion-comision-item.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { TipoReglaComision, LiquidacionComisionEstado } from '../../src/app/database/entities/rrhh/regla-comision-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';

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

export function registerEquiposComisionHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ===================== EQUIPOS =====================

  ipcMain.handle('get-equipos-comision', async (_e, filtros?: any) => {
    const repo = dataSource.getRepository(EquipoComision);
    const qb = repo.createQueryBuilder('e').orderBy('e.nombre', 'ASC');
    if (filtros?.activo !== undefined && filtros.activo !== null) {
      qb.andWhere('e.activo = :a', { a: filtros.activo });
    }
    return await qb.getMany();
  });

  ipcMain.handle('get-equipo-comision', async (_e, id: number) => {
    const equipo = await dataSource.getRepository(EquipoComision).findOne({ where: { id } });
    if (!equipo) return null;
    const miembros = await dataSource.getRepository(EquipoComisionMiembro).find({
      where: { equipo: { id } } as any,
      relations: ['funcionario', 'funcionario.persona'],
    });
    const reglas = await dataSource.getRepository(EquipoComisionRegla).find({
      where: { equipo: { id } } as any,
      relations: ['reglaComision'],
    });
    return { ...equipo, miembros, reglas };
  });

  ipcMain.handle('create-equipo-comision', async (_e, data: any) => {
    const userId = getCurrentUser()?.id;
    const repo = dataSource.getRepository(EquipoComision);
    const equipo = repo.create({
      nombre: (data.nombre || '').toUpperCase(),
      descripcion: data.descripcion,
      activo: data.activo !== undefined ? data.activo : true,
    });
    await setEntityUserTracking(dataSource, equipo, userId, false);
    return await repo.save(equipo);
  });

  ipcMain.handle('update-equipo-comision', async (_e, id: number, data: any) => {
    const userId = getCurrentUser()?.id;
    const repo = dataSource.getRepository(EquipoComision);
    const equipo = await repo.findOne({ where: { id } });
    if (!equipo) throw new Error(`Equipo ${id} no encontrado`);
    if (data.nombre !== undefined) equipo.nombre = (data.nombre).toUpperCase();
    if (data.descripcion !== undefined) equipo.descripcion = data.descripcion;
    if (data.activo !== undefined) equipo.activo = data.activo;
    await setEntityUserTracking(dataSource, equipo, userId, true);
    return await repo.save(equipo);
  });

  ipcMain.handle('delete-equipo-comision', async (_e, id: number) => {
    await dataSource.getRepository(EquipoComision).delete(id);
    return { success: true };
  });

  // ===================== MIEMBROS =====================

  ipcMain.handle('agregar-miembro-equipo', async (_e, payload: any) => {
    const { equipoId, funcionarioId, porcentajeReparto } = payload;
    const userId = getCurrentUser()?.id;

    // Validar suma porcentajes <= 100
    const miembrosActuales = await dataSource.getRepository(EquipoComisionMiembro).find({
      where: { equipo: { id: equipoId } } as any,
    });
    const sumaActual = miembrosActuales.reduce((s, m) => s + Number(m.porcentajeReparto), 0);
    if (sumaActual + Number(porcentajeReparto) > 100.001) {
      throw new Error(`La suma de porcentajes excederia 100%. Suma actual: ${sumaActual.toFixed(2)}%`);
    }

    const repo = dataSource.getRepository(EquipoComisionMiembro);
    const miembro = repo.create({
      equipo: { id: equipoId } as any,
      funcionario: { id: funcionarioId } as any,
      porcentajeReparto: Number(porcentajeReparto),
    });
    await setEntityUserTracking(dataSource, miembro, userId, false);
    return await repo.save(miembro);
  });

  ipcMain.handle('eliminar-miembro-equipo', async (_e, miembroId: number) => {
    await dataSource.getRepository(EquipoComisionMiembro).delete(miembroId);
    return { success: true };
  });

  ipcMain.handle('actualizar-porcentaje-miembro', async (_e, payload: any) => {
    const { miembroId, porcentaje } = payload;
    const userId = getCurrentUser()?.id;
    const repo = dataSource.getRepository(EquipoComisionMiembro);
    const miembro = await repo.findOne({ where: { id: miembroId }, relations: ['equipo'] });
    if (!miembro) throw new Error(`Miembro ${miembroId} no encontrado`);

    // Validar suma
    const miembrosActuales = await repo.find({
      where: { equipo: { id: miembro.equipo.id } } as any,
    });
    const sumaOtros = miembrosActuales
      .filter((m) => m.id !== miembroId)
      .reduce((s, m) => s + Number(m.porcentajeReparto), 0);
    if (sumaOtros + Number(porcentaje) > 100.001) {
      throw new Error(`La suma de porcentajes excederia 100%. Suma de otros: ${sumaOtros.toFixed(2)}%`);
    }

    miembro.porcentajeReparto = Number(porcentaje);
    await setEntityUserTracking(dataSource, miembro, userId, true);
    return await repo.save(miembro);
  });

  // ===================== REGLAS DE EQUIPO =====================

  ipcMain.handle('asignar-regla-equipo', async (_e, payload: any) => {
    const { equipoId, reglaId, fechaDesde, fechaHasta } = payload;
    const userId = getCurrentUser()?.id;

    // Validar que la regla sea de tipo EQUIPO_PORCENTAJE
    const regla = await dataSource.getRepository(ReglaComision).findOne({ where: { id: reglaId } });
    if (!regla) throw new Error(`Regla ${reglaId} no encontrada`);
    if (regla.tipo !== TipoReglaComision.EQUIPO_PORCENTAJE) {
      throw new Error(`Solo se pueden asignar reglas de tipo EQUIPO_PORCENTAJE a equipos. Tipo actual: ${regla.tipo}`);
    }

    const repo = dataSource.getRepository(EquipoComisionRegla);
    const asig = repo.create({
      equipo: { id: equipoId } as any,
      reglaComision: { id: reglaId } as any,
      fechaDesde,
      fechaHasta,
      activo: true,
    });
    await setEntityUserTracking(dataSource, asig, userId, false);
    return await repo.save(asig);
  });

  ipcMain.handle('desasignar-regla-equipo', async (_e, asignacionId: number) => {
    await dataSource.getRepository(EquipoComisionRegla).delete(asignacionId);
    return { success: true };
  });

  // ===================== EVALUAR EQUIPO EN PERIODO =====================

  ipcMain.handle('evaluar-equipo-periodo', async (_e, payload: any) => {
    const { equipoId, periodo } = payload;
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const userId = getCurrentUser()?.id;
      const { fechaInicio, fechaFin } = getPeriodoBounds(periodo);
      const fdStr = isoDate(fechaInicio);
      const ffStr = isoDate(fechaFin);

      const miembros = await queryRunner.manager.getRepository(EquipoComisionMiembro).find({
        where: { equipo: { id: equipoId } } as any,
        relations: ['funcionario', 'funcionario.usuario', 'funcionario.persona'],
      });
      if (!miembros.length) throw new Error('El equipo no tiene miembros');

      // Verificar que la suma de porcentajes es 100
      const sumaPorc = miembros.reduce((s, m) => s + Number(m.porcentajeReparto), 0);

      // Obtener reglas del equipo activas en el periodo
      const reglasEquipo = await queryRunner.manager.getRepository(EquipoComisionRegla).find({
        where: { equipo: { id: equipoId }, activo: true } as any,
        relations: ['reglaComision'],
      });

      let totalEquipo = 0;
      const snapshots: any[] = [];

      for (const reglaSig of reglasEquipo) {
        const regla = reglaSig.reglaComision;
        if (!regla?.activo) continue;
        if (regla.tipo !== TipoReglaComision.EQUIPO_PORCENTAJE) continue;

        // Verificar vigencia
        if (reglaSig.fechaDesde && fechaFin < new Date(reglaSig.fechaDesde)) continue;
        if (reglaSig.fechaHasta && fechaInicio > new Date(reglaSig.fechaHasta)) continue;

        // Para EQUIPO_PORCENTAJE: sumar ventas de todos los miembros
        const productoIds = (await queryRunner.manager.getRepository(ReglaComisionProducto).find({
          where: { reglaComision: { id: regla.id } } as any,
          relations: ['producto'],
        })).map((p) => p.producto?.id).filter(Boolean) as number[];

        // Construir lista de usuario_ids de miembros
        const uids = miembros
          .map((m) => m.funcionario?.usuario?.id)
          .filter(Boolean) as number[];
        if (!uids.length) continue;

        // Query ventas del equipo
        let qb = dataSource.createQueryBuilder('venta_items', 'vi')
          .innerJoin('ventas', 'v', 'vi.venta_id = v.id')
          .select([
            'SUM(vi.cantidad) as totalUnidades',
            `SUM((vi.precio_venta_unitario - vi.descuento_unitario) * vi.cantidad + vi.precio_adicionales) as totalMonto`,
          ])
          .where('v.estado = :estado', { estado: 'CONCLUIDA' })
          .andWhere(`(date(v.fecha_cierre) >= :fd OR date(v.created_at) >= :fd)`)
          .andWhere(`(date(v.fecha_cierre) <= :ff OR (v.fecha_cierre IS NULL AND date(v.created_at) <= :ff))`)
          .andWhere(`vi.estado != 'CANCELADO'`)
          .andWhere(`COALESCE(vi.vendedor_id, v.vendedor_id, v.created_by) IN (:...uids)`, { uids, fd: fdStr, ff: ffStr });

        if (productoIds.length > 0) {
          qb = qb.andWhere('vi.producto_id IN (:...pids)', { pids: productoIds });
        }

        const raw = await qb.getRawOne();
        const totalUnidadesEquipo = Number(raw?.totalUnidades || 0);
        const totalMontoEquipo = Number(raw?.totalMonto || 0);

        // Calcular monto base equipo (solo PORCENTAJE para EQUIPO_PORCENTAJE)
        const porcentaje = Number(regla.porcentaje || 0);
        const montoEquipo = +(totalMontoEquipo * porcentaje / 100).toFixed(2);
        totalEquipo += montoEquipo;

        snapshots.push({
          reglaId: regla.id,
          nombre: regla.nombre,
          totalUnidadesEquipo,
          totalMontoEquipo: +totalMontoEquipo.toFixed(2),
          porcentaje,
          montoEquipo,
        });
      }

      if (totalEquipo === 0) {
        await queryRunner.commitTransaction();
        return { equipoId, periodo, totalEquipo: 0, miembrosActualizados: [] };
      }

      // Distribuir por porcentaje de reparto a cada miembro
      const liqRepo = queryRunner.manager.getRepository(LiquidacionComision);
      const itemRepo = queryRunner.manager.getRepository(LiquidacionComisionItem);
      const miembrosActualizados: any[] = [];

      for (const miembro of miembros) {
        const funcionarioId = miembro.funcionario?.id;
        if (!funcionarioId) continue;

        const proporcion = Number(miembro.porcentajeReparto) / 100;
        const montoMiembro = +(totalEquipo * proporcion).toFixed(2);
        if (montoMiembro === 0) continue;

        // Buscar o crear LiquidacionComision del miembro
        let liq = await liqRepo.findOne({
          where: { funcionario: { id: funcionarioId } as any, periodo },
        });

        if (liq && (liq.estado === LiquidacionComisionEstado.APROBADA || liq.estado === LiquidacionComisionEstado.INTEGRADA)) {
          miembrosActualizados.push({ funcionarioId, skip: true, razon: 'APROBADA o INTEGRADA' });
          continue;
        }

        const { fechaInicio: fi, fechaFin: ff2 } = getPeriodoBounds(periodo);
        if (!liq) {
          liq = liqRepo.create({
            funcionario: { id: funcionarioId } as any,
            periodo,
            fechaInicio: fi,
            fechaFin: ff2,
            totalCalculado: 0,
            estado: LiquidacionComisionEstado.BORRADOR,
          });
          await setEntityUserTracking(dataSource, liq, userId, false);
          liq = await liqRepo.save(liq);
        }

        const item = itemRepo.create({
          liquidacion: liq,
          concepto: `COMISION EQUIPO - ${miembro.funcionario?.persona?.nombre || funcionarioId} - ${proporcion * 100}%`,
          monto: montoMiembro,
          esManual: false,
          observacion: JSON.stringify({ equipoId, periodo, snapshots, proporcion }),
        });
        await setEntityUserTracking(dataSource, item, userId, false);
        await itemRepo.save(item);

        // Recalcular total
        const allItems = await itemRepo.find({ where: { liquidacion: { id: liq.id } } as any });
        liq.totalCalculado = +allItems.reduce((s, i) => s + Number(i.monto), 0).toFixed(2);
        await setEntityUserTracking(dataSource, liq, userId, true);
        await liqRepo.save(liq);

        miembrosActualizados.push({ funcionarioId, montoMiembro });
      }

      await queryRunner.commitTransaction();
      return { equipoId, periodo, totalEquipo, miembrosActualizados };
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error evaluar-equipo-periodo:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });
}
