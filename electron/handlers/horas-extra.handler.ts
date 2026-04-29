import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { HoraExtra } from '../../src/app/database/entities/rrhh/hora-extra.entity';
import { HoraExtraTipo } from '../../src/app/database/entities/rrhh/hora-extra-tipo.enum';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { getConfigNumber } from './configuracion-rrhh.handler';

export function registerHorasExtraHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-horas-extra', async (_e, filtros: any) => {
    const repo = dataSource.getRepository(HoraExtra);
    const qb = repo.createQueryBuilder('he')
      .leftJoinAndSelect('he.funcionario', 'f')
      .leftJoinAndSelect('f.persona', 'p')
      .orderBy('he.fecha', 'DESC');
    if (filtros?.funcionarioId) qb.andWhere('f.id = :fid', { fid: filtros.funcionarioId });
    if (filtros?.fechaDesde && filtros?.fechaHasta) {
      qb.andWhere('he.fecha BETWEEN :fd AND :fh', { fd: filtros.fechaDesde, fh: filtros.fechaHasta });
    }
    if (filtros?.tipo) qb.andWhere('he.tipo = :t', { t: filtros.tipo });
    if (filtros?.soloVigentes) qb.andWhere('he.anulada = :a', { a: false });
    return await qb.getMany();
  });

  ipcMain.handle('create-hora-extra', async (_e, data: any) => {
    const repo = dataSource.getRepository(HoraExtra);
    const funcionario = await dataSource.getRepository(Funcionario).findOne({
      where: { id: data.funcionarioId },
      relations: ['monedaSalario'],
    });
    if (!funcionario) throw new Error(`Funcionario ${data.funcionarioId} no encontrado`);

    // Recargo default segun tipo si no se paso
    let recargo = data.recargoPorcentaje;
    if (recargo === undefined || recargo === null) {
      switch (data.tipo) {
        case HoraExtraTipo.NOCTURNA:
          recargo = await getConfigNumber(dataSource, 'RECARGO_HE_NOCTURNA', 100);
          break;
        case HoraExtraTipo.FERIADO:
          recargo = await getConfigNumber(dataSource, 'RECARGO_HE_FERIADO', 100);
          break;
        default:
          recargo = await getConfigNumber(dataSource, 'RECARGO_HE_DIURNA', 50);
      }
    }

    // Monto sugerido si no viene: salarioBase / 200 (jornada 200 hrs/mes) * (1 + recargo/100) * horas
    let monto = data.montoCalculado;
    if ((monto === undefined || monto === null) && funcionario.salarioBase && data.horas) {
      const valorHora = Number(funcionario.salarioBase) / 200;
      monto = valorHora * (1 + Number(recargo) / 100) * Number(data.horas);
    }

    const userId = getCurrentUser()?.id;
    const userEntity = userId
      ? await dataSource.getRepository(Usuario).findOne({ where: { id: userId } })
      : null;

    const entity = repo.create({
      funcionario,
      fecha: data.fecha,
      horas: data.horas,
      tipo: data.tipo || HoraExtraTipo.DIURNA,
      recargoPorcentaje: recargo,
      montoCalculado: monto || 0,
      observacion: data.observacion,
      autorizadoPor: userEntity || undefined,
      anulada: false,
    });
    await setEntityUserTracking(dataSource, entity, userId, false);
    return await repo.save(entity);
  });

  ipcMain.handle('anular-hora-extra', async (_e, id: number) => {
    const repo = dataSource.getRepository(HoraExtra);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`HoraExtra ${id} no encontrada`);
    existing.anulada = true;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });
}
