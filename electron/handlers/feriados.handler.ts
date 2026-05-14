import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Feriado } from '../../src/app/database/entities/rrhh/feriado.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { parseLocalDate } from '../utils/date.utils';
import { ensurePermission } from '../utils/auth.utils';

export function registerFeriadosHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-feriados', async (_e, anio?: number) => {
    const repo = dataSource.getRepository(Feriado);
    const qb = repo.createQueryBuilder('f').orderBy('f.fecha', 'ASC');
    if (anio) {
      qb.andWhere("strftime('%Y', f.fecha) = :a", { a: String(anio) });
    }
    return await qb.getMany();
  });

  ipcMain.handle('create-feriado', async (_e, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(Feriado);
    const entity = repo.create({
      fecha: parseLocalDate(data.fecha)!,
      descripcion: (data.descripcion || '').toUpperCase(),
      esNacional: data.esNacional !== false,
      recargoPorcentaje: data.recargoPorcentaje ?? 100,
      activo: data.activo !== false,
    });
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
    return await repo.save(entity);
  });

  ipcMain.handle('update-feriado', async (_e, id: number, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(Feriado);
    const existing = await repo.findOne({ where: { id } });
    if (!existing) throw new Error(`Feriado ${id} no encontrado`);
    if (data.fecha !== undefined) existing.fecha = parseLocalDate(data.fecha)!;
    if (data.descripcion !== undefined) existing.descripcion = (data.descripcion || '').toUpperCase();
    if (data.esNacional !== undefined) existing.esNacional = data.esNacional;
    if (data.recargoPorcentaje !== undefined) existing.recargoPorcentaje = data.recargoPorcentaje;
    if (data.activo !== undefined) existing.activo = data.activo;
    await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
    return await repo.save(existing);
  });

  ipcMain.handle('delete-feriado', async (_e, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, 'RRHH_CONFIG_EDITAR');
    const repo = dataSource.getRepository(Feriado);
    await repo.delete(id);
    return { success: true };
  });
}
