import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Vacacion } from '../../src/app/database/entities/rrhh/vacacion.entity';
import { VacacionPeriodo, VacacionPeriodoEstado } from '../../src/app/database/entities/rrhh/vacacion-periodo.entity';
import { Asistencia } from '../../src/app/database/entities/rrhh/asistencia.entity';
import { AsistenciaEstado } from '../../src/app/database/entities/rrhh/asistencia-estado.enum';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';
import { getConfigNumber } from './configuracion-rrhh.handler';

function diffDias(d1: Date, d2: Date): number {
  const ms = d2.getTime() - d1.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

async function diasVacacionesPorAntiguedad(dataSource: DataSource, anios: number): Promise<number> {
  if (anios < 5) return await getConfigNumber(dataSource, 'DIAS_VACACIONES_HASTA_5A', 12);
  if (anios < 10) return await getConfigNumber(dataSource, 'DIAS_VACACIONES_5_10A', 18);
  return await getConfigNumber(dataSource, 'DIAS_VACACIONES_MAS_10A', 30);
}

export function registerVacacionesHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-vacaciones', async (_e, filtros: any) => {
    const repo = dataSource.getRepository(Vacacion);
    const qb = repo.createQueryBuilder('v')
      .leftJoinAndSelect('v.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .orderBy('v.anioServicio', 'DESC');
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    if (filtros?.anio) qb.andWhere('v.anio_servicio = :a', { a: filtros.anio });
    return await qb.getMany();
  });

  ipcMain.handle('get-vacacion', async (_e, id: number) => {
    const repo = dataSource.getRepository(Vacacion);
    const v = await repo.findOne({
      where: { id },
      relations: ['funcionario', 'funcionario.persona'],
    });
    if (!v) return null;
    const periodos = await dataSource.getRepository(VacacionPeriodo).find({
      where: { vacacion: { id } as any },
      order: { fechaDesde: 'DESC' },
    });
    return { ...v, periodos };
  });

  ipcMain.handle('generar-vacaciones-funcionario', async (_e, funcionarioId: number) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const funcionario = await queryRunner.manager.findOne(Funcionario, { where: { id: funcionarioId } });
      if (!funcionario) throw new Error(`Funcionario ${funcionarioId} no encontrado`);

      const repo = queryRunner.manager.getRepository(Vacacion);
      const userId = getCurrentUser()?.id;
      const ingreso = new Date(funcionario.fechaIngreso);
      const hoy = new Date();
      const aniosTrabajados = Math.floor(diffDias(ingreso, hoy) / 365);
      const generadas: Vacacion[] = [];

      for (let n = 1; n <= aniosTrabajados; n++) {
        const fechaCorte = new Date(ingreso);
        fechaCorte.setFullYear(fechaCorte.getFullYear() + n);
        const anioServicio = n;

        let existing = await repo.findOne({
          where: { funcionario: { id: funcionarioId } as any, anioServicio },
        });
        if (!existing) {
          const dias = await diasVacacionesPorAntiguedad(dataSource, n);
          existing = repo.create({
            funcionario,
            anioServicio,
            diasGenerados: dias,
            diasGozados: 0,
            fechaCorte,
          });
          // Verificar prescripcion (24 meses)
          const mesesPrescripcion = await getConfigNumber(dataSource, 'PRESCRIPCION_VACACIONES_MESES', 24);
          const prescripcionLimite = new Date(fechaCorte);
          prescripcionLimite.setMonth(prescripcionLimite.getMonth() + mesesPrescripcion);
          if (hoy > prescripcionLimite) existing.prescrita = true;

          await setEntityUserTracking(dataSource, existing, userId, false);
          existing = await repo.save(existing);
        }
        generadas.push(existing);
      }

      await queryRunner.commitTransaction();
      return generadas;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error generar-vacaciones-funcionario:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('programar-vacacion-periodo', async (_e, payload: any) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const { vacacionId, fechaDesde, fechaHasta } = payload;
      const vacRepo = queryRunner.manager.getRepository(Vacacion);
      const periodoRepo = queryRunner.manager.getRepository(VacacionPeriodo);
      const vacacion = await vacRepo.findOne({ where: { id: vacacionId } });
      if (!vacacion) throw new Error(`Vacacion ${vacacionId} no encontrada`);

      const desde = parseLocalDate(fechaDesde) || new Date();
      const hasta = parseLocalDate(fechaHasta) || new Date();
      const dias = diffDias(desde, hasta) + 1;
      if (dias <= 0) throw new Error('Rango de fechas invalido');
      if (vacacion.diasGozados + dias > vacacion.diasGenerados) {
        throw new Error('Excede dias disponibles');
      }

      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;

      const periodo = periodoRepo.create({
        vacacion,
        fechaDesde: desde,
        fechaHasta: hasta,
        diasUsados: dias,
        estado: VacacionPeriodoEstado.PROGRAMADA,
        autorizadoPor: userEntity || undefined,
        observacion: payload.observacion,
      });
      await setEntityUserTracking(dataSource, periodo, userId, false);
      await periodoRepo.save(periodo);

      await queryRunner.commitTransaction();
      return periodo;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error programar-vacacion-periodo:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('marcar-periodo-gozado', async (_e, periodoId: number) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const periodoRepo = queryRunner.manager.getRepository(VacacionPeriodo);
      const vacRepo = queryRunner.manager.getRepository(Vacacion);
      const asisRepo = queryRunner.manager.getRepository(Asistencia);

      const periodo = await periodoRepo.findOne({ where: { id: periodoId }, relations: ['vacacion', 'vacacion.funcionario'] });
      if (!periodo) throw new Error(`Periodo ${periodoId} no encontrado`);
      if (periodo.estado === VacacionPeriodoEstado.GOZADA) return periodo;

      const userId = getCurrentUser()?.id;
      const userEntity = userId
        ? await queryRunner.manager.findOne(Usuario, { where: { id: userId } })
        : null;

      // Generar asistencias VACACION para los dias del rango si no existen
      if (!periodo.asistenciasGeneradas) {
        const desde = parseLocalDate(periodo.fechaDesde) || new Date();
        const hasta = parseLocalDate(periodo.fechaHasta) || new Date();
        for (let d = new Date(desde); d <= hasta; d.setDate(d.getDate() + 1)) {
          const fechaIso = d.toISOString().slice(0, 10);
          const existing = await asisRepo.findOne({
            where: {
              funcionario: { id: periodo.vacacion.funcionario.id } as any,
              fecha: fechaIso as any,
            },
          });
          if (!existing) {
            const a = asisRepo.create({
              funcionario: periodo.vacacion.funcionario,
              fecha: fechaIso as any,
              estado: AsistenciaEstado.VACACION,
              minutosTardanza: 0,
              justificada: true,
              registradoPor: userEntity || undefined,
              observacion: `Vacacion (periodo #${periodo.id})`,
            });
            await setEntityUserTracking(dataSource, a, userId, false);
            await asisRepo.save(a);
          }
        }
        periodo.asistenciasGeneradas = true;
      }

      periodo.estado = VacacionPeriodoEstado.GOZADA;
      await setEntityUserTracking(dataSource, periodo, userId, true);
      await periodoRepo.save(periodo);

      // Actualizar diasGozados de la Vacacion
      const todos = await periodoRepo.find({ where: { vacacion: { id: periodo.vacacion.id } as any, estado: VacacionPeriodoEstado.GOZADA } });
      const totalGozados = todos.reduce((sum, p) => sum + p.diasUsados, 0);
      periodo.vacacion.diasGozados = totalGozados;
      await vacRepo.save(periodo.vacacion);

      await queryRunner.commitTransaction();
      return periodo;
    } catch (e) {
      await queryRunner.rollbackTransaction();
      console.error('Error marcar-periodo-gozado:', e);
      throw e;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('cancelar-vacacion-periodo', async (_e, periodoId: number) => {
    const repo = dataSource.getRepository(VacacionPeriodo);
    const periodo = await repo.findOne({ where: { id: periodoId } });
    if (!periodo) throw new Error(`Periodo ${periodoId} no encontrado`);
    if (periodo.estado === VacacionPeriodoEstado.GOZADA) throw new Error('No se puede cancelar un periodo ya gozado');
    periodo.estado = VacacionPeriodoEstado.CANCELADA;
    await setEntityUserTracking(dataSource, periodo, getCurrentUser()?.id, true);
    return await repo.save(periodo);
  });
}
