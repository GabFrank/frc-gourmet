import { ipcMain } from 'electron';
import { Between, DataSource } from 'typeorm';
import { Turno } from '../../src/app/database/entities/rrhh/turno.entity';
import { FuncionarioTurno } from '../../src/app/database/entities/rrhh/funcionario-turno.entity';
import { Asistencia } from '../../src/app/database/entities/rrhh/asistencia.entity';
import { AsistenciaEstado } from '../../src/app/database/entities/rrhh/asistencia-estado.enum';
import { Penalizacion } from '../../src/app/database/entities/rrhh/penalizacion.entity';
import { PenalizacionTipo } from '../../src/app/database/entities/rrhh/penalizacion-tipo.enum';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';
import { getConfigBoolean, getConfigNumber } from './configuracion-rrhh.handler';
import { ensurePermission } from '../utils/auth.utils';

function diffMinutos(horaA: string | undefined, horaB: string | undefined): number {
  if (!horaA || !horaB) return 0;
  const [hA, mA] = horaA.split(':').map(Number);
  const [hB, mB] = horaB.split(':').map(Number);
  return (hA * 60 + mA) - (hB * 60 + mB);
}

async function crearAsistenciaInterno(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
  data: any,
): Promise<Asistencia> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    const repo = queryRunner.manager.getRepository(Asistencia);
    const funcionario = await queryRunner.manager.findOne(Funcionario, { where: { id: data.funcionarioId } });
    if (!funcionario) throw new Error(`Funcionario ${data.funcionarioId} no encontrado`);

    let turno: Turno | null = null;
    if (data.turnoId) {
      turno = await queryRunner.manager.findOne(Turno, { where: { id: data.turnoId } });
    }

    let minutosTardanza = data.minutosTardanza ?? 0;
    let estado: AsistenciaEstado = data.estado || AsistenciaEstado.PRESENTE;
    if (turno && data.horaEntrada && estado === AsistenciaEstado.PRESENTE) {
      const diff = diffMinutos(data.horaEntrada, turno.horaEntrada);
      if (diff > turno.toleranciaTardanzaMinutos) {
        minutosTardanza = diff;
        estado = AsistenciaEstado.TARDANZA;
      }
    }

    const userId = getCurrentUser()?.id;
    const userEntity = userId
      ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
      : null;

    const asistencia = repo.create({
      funcionario,
      turno: turno || undefined,
      fecha: parseLocalDate(data.fecha)!,
      horaEntrada: data.horaEntrada,
      horaSalida: data.horaSalida,
      estado,
      minutosTardanza,
      horasTrabajadas: data.horasTrabajadas,
      justificada: data.justificada === true,
      observacion: data.observacion,
      registradoPor: userEntity || undefined,
    });
    await setEntityUserTracking(dataSource, asistencia, userId, false);
    const saved = await repo.save(asistencia);

    if (estado === AsistenciaEstado.TARDANZA && !data.justificada) {
      const autoPenalizar = await getConfigBoolean(dataSource, 'PENALIZACION_AUTO_TARDANZA', true);
      if (autoPenalizar) {
        const penRepo = queryRunner.manager.getRepository(Penalizacion);
        const montoFijo = await getConfigNumber(dataSource, 'PENALIZACION_MONTO_TARDANZA', 0);
        const montoPorMinuto = await getConfigNumber(dataSource, 'PENALIZACION_MONTO_POR_MINUTO_TARDANZA', 0);
        const monto = +(montoFijo + montoPorMinuto * (minutosTardanza || 0)).toFixed(2);
        const pen = penRepo.create({
          funcionario,
          asistencia: saved,
          tipo: PenalizacionTipo.TARDANZA,
          descripcion: `Tardanza ${minutosTardanza} min (${data.fecha})`,
          monto,
          fecha: parseLocalDate(data.fecha)!,
          registradoPor: userEntity || undefined,
          autoGenerada: true,
        });
        await setEntityUserTracking(dataSource, pen, userId, false);
        await penRepo.save(pen);
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
}

export function registerAsistenciasHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // ==================== TURNOS ====================
  ipcMain.handle('get-turnos', async () => {
    try {
      return await dataSource.getRepository(Turno).find({ order: { nombre: 'ASC' } });
    } catch (e) {
      console.error('Error get-turnos:', e);
      throw e;
    }
  });

  ipcMain.handle('get-turno', async (_e, id: number) => {
    return await dataSource.getRepository(Turno).findOne({ where: { id } });
  });

  ipcMain.handle('create-turno', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(Turno);
    const entity = repo.create({
      nombre: (data.nombre || '').toUpperCase(),
      horaEntrada: data.horaEntrada,
      horaSalida: data.horaSalida,
      toleranciaTardanzaMinutos: data.toleranciaTardanzaMinutos ?? 5,
      descripcion: data.descripcion,
      activo: data.activo !== false,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('update-turno', async (_e, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(Turno);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Turno ${id} no encontrado`);
    if (data.nombre !== undefined) existing.nombre = (data.nombre || '').toUpperCase();
    if (data.horaEntrada !== undefined) existing.horaEntrada = data.horaEntrada;
    if (data.horaSalida !== undefined) existing.horaSalida = data.horaSalida;
    if (data.toleranciaTardanzaMinutos !== undefined) existing.toleranciaTardanzaMinutos = data.toleranciaTardanzaMinutos;
    if (data.descripcion !== undefined) existing.descripcion = data.descripcion;
    if (data.activo !== undefined) existing.activo = data.activo;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  ipcMain.handle('delete-turno', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(Turno);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) return { success: false };
    existing.activo = false;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    await repo.save(existing);
    return { success: true };
  });

  ipcMain.handle('asignar-turno-funcionario', async (_e, data: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const repo = queryRunner.manager.getRepository(FuncionarioTurno);
      const funcionario = await queryRunner.manager.findOne(Funcionario, { where: { id: data.funcionarioId } });
      const turno = await queryRunner.manager.findOne(Turno, { where: { id: data.turnoId } });
      if (!funcionario || !turno) throw new Error('Funcionario o turno no encontrado');
      // Cerrar turno activo previo
      const activo = await repo
        .createQueryBuilder('ft')
        .where('ft.funcionario_id = :fid', { fid: data.funcionarioId })
        .andWhere('ft.fecha_hasta IS NULL')
        .getOne();
      if (activo) {
        activo.fechaHasta = parseLocalDate(data.fechaDesde) ?? new Date();
        await repo.save(activo);
      }
      const entity = repo.create({
        funcionario,
        turno,
        fechaDesde: parseLocalDate(data.fechaDesde) ?? new Date(),
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      const saved = await repo.save(entity);
      await queryRunner.commitTransaction();
      return saved;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error asignar-turno-funcionario:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-funcionario-turnos', async (_e, funcionarioId: number) => {
    return await dataSource.getRepository(FuncionarioTurno).find({
      where: { funcionario: { id: funcionarioId } as any },
      relations: ['turno'],
      order: { fechaDesde: 'DESC' },
    });
  });

  ipcMain.handle('cerrar-funcionario-turno', async (_e, id: number, fechaHasta?: Date) => {
    const repo = dataSource.getRepository(FuncionarioTurno);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Asignacion de turno ${id} no encontrada`);
    if (existing.fechaHasta) throw new Error('La asignacion ya esta cerrada');
    existing.fechaHasta = fechaHasta ?? new Date();
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  ipcMain.handle('update-funcionario-turno', async (_e, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_ASISTENCIA_REGISTRAR');
    const repo = dataSource.getRepository(FuncionarioTurno);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Asignacion de turno ${id} no encontrada`);
    if (data.fechaDesde !== undefined) existing.fechaDesde = parseLocalDate(data.fechaDesde)!;
    if (data.fechaHasta !== undefined) existing.fechaHasta = parseLocalDate(data.fechaHasta);
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  // ==================== ASISTENCIAS ====================
  ipcMain.handle('get-asistencias', async (_e, filtros: any) => {
    const repo = dataSource.getRepository(Asistencia);
    const qb = repo.createQueryBuilder('a')
      .leftJoinAndSelect('a.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .leftJoinAndSelect('a.turno', 't')
      .orderBy('a.fecha', 'DESC');
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    if (filtros?.fechaDesde && filtros?.fechaHasta) {
      qb.andWhere('a.fecha BETWEEN :fd AND :fh', { fd: filtros.fechaDesde, fh: filtros.fechaHasta });
    } else if (filtros?.fecha) {
      qb.andWhere('a.fecha = :f', { f: filtros.fecha });
    }
    if (filtros?.estado) qb.andWhere('a.estado = :e', { e: filtros.estado });
    return await qb.getMany();
  });

  ipcMain.handle('get-asistencia', async (_e, id: number) => {
    return await dataSource.getRepository(Asistencia).findOne({
      where: { id },
      relations: ['funcionario', 'funcionario.persona', 'turno', 'registradoPor'],
    });
  });

  ipcMain.handle('create-asistencia', async (_e, data: any) => {
    try {
      await ensurePermission(dataSource, getCurrentUser, 'RRHH_ASISTENCIA_REGISTRAR');
      return await crearAsistenciaInterno(dataSource, getCurrentUser, data);
    } catch (e) {
      console.error('Error create-asistencia:', e);
      throw e;
    }
  });

  ipcMain.handle('update-asistencia', async (_e, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_ASISTENCIA_REGISTRAR');
    const repo = dataSource.getRepository(Asistencia);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Asistencia ${id} no encontrada`);
    if (data.estado !== undefined) existing.estado = data.estado;
    if (data.horaEntrada !== undefined) existing.horaEntrada = data.horaEntrada;
    if (data.horaSalida !== undefined) existing.horaSalida = data.horaSalida;
    if (data.minutosTardanza !== undefined) existing.minutosTardanza = data.minutosTardanza;
    if (data.horasTrabajadas !== undefined) existing.horasTrabajadas = data.horasTrabajadas;
    if (data.justificada !== undefined) existing.justificada = data.justificada;
    if (data.observacion !== undefined) existing.observacion = data.observacion;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  ipcMain.handle('justificar-asistencia', async (_e, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_ASISTENCIA_JUSTIFICAR');
    const repo = dataSource.getRepository(Asistencia);
    const existing = await repo.findOne({ where: { id }, relations: ['funcionario'] });
    if (!existing) throw new Error(`Asistencia ${id} no encontrada`);
    existing.justificada = true;
    existing.estado = AsistenciaEstado.JUSTIFICADO;
    existing.observacion = data?.motivo || existing.observacion;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    const saved = await repo.save(existing);

    // Anular penalizaciones auto generadas asociadas
    const penRepo = dataSource.getRepository(Penalizacion);
    const pens = await penRepo.find({
      where: { asistencia: { id } as any, anulada: false, autoGenerada: true },
    });
    for (const p of pens) {
      p.anulada = true;
      await setEntityUserTracking(dataSource, p, getCurrentUser()?.id, true);
      await penRepo.save(p);
    }
    return saved;
  });

  ipcMain.handle('marcar-asistencia-masiva', async (_e, payload: any) => {
    const results: any[] = [];
    for (const item of payload?.items || []) {
      try {
        const r = await crearAsistenciaInterno(dataSource, getCurrentUser, {
          ...item,
          fecha: payload.fecha,
        });
        results.push({ ok: true, item: r });
      } catch (e: any) {
        results.push({ ok: false, error: e?.message || String(e) });
      }
    }
    return results;
  });

  // ==================== PENALIZACIONES ====================
  ipcMain.handle('get-penalizaciones', async (_e, filtros: any) => {
    const repo = dataSource.getRepository(Penalizacion);
    const qb = repo.createQueryBuilder('p')
      .leftJoinAndSelect('p.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'persona')
      .leftJoinAndSelect('p.asistencia', 'a')
      .orderBy('p.fecha', 'DESC');
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    if (filtros?.fechaDesde && filtros?.fechaHasta) {
      qb.andWhere('p.fecha BETWEEN :fd AND :fh', { fd: filtros.fechaDesde, fh: filtros.fechaHasta });
    }
    if (filtros?.tipo) qb.andWhere('p.tipo = :t', { t: filtros.tipo });
    if (filtros?.soloVigentes) qb.andWhere('p.anulada = :a', { a: false });
    return await qb.getMany();
  });

  ipcMain.handle('create-penalizacion', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_PENALIZACION_REGISTRAR');
    const repo = dataSource.getRepository(Penalizacion);
    const funcionario = await dataSource.getRepository(Funcionario).findOne({ where: { id: data.funcionarioId } });
    if (!funcionario) throw new Error(`Funcionario ${data.funcionarioId} no encontrado`);
    const entity = repo.create({
      funcionario,
      tipo: data.tipo,
      descripcion: data.descripcion,
      monto: data.monto,
      fecha: parseLocalDate(data.fecha)!,
      autoGenerada: false,
      anulada: false,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('update-penalizacion', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_PENALIZACION_REGISTRAR');
    const repo = dataSource.getRepository(Penalizacion);
    const existing = await repo.findOne({ where: { id: data.id } });
    if (!existing) throw new Error(`Penalizacion ${data.id} no encontrada`);
    if (existing.anulada) throw new Error('No se puede editar una penalizacion anulada');
    if (data.tipo !== undefined) existing.tipo = data.tipo;
    if (data.descripcion !== undefined) existing.descripcion = data.descripcion;
    if (data.monto !== undefined) existing.monto = data.monto;
    if (data.fecha !== undefined) existing.fecha = parseLocalDate(data.fecha)!;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  ipcMain.handle('anular-penalizacion', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_PENALIZACION_REGISTRAR');
    const repo = dataSource.getRepository(Penalizacion);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Penalizacion ${id} no encontrada`);
    existing.anulada = true;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });
}
