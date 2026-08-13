import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { GastoCaja } from '../../src/app/database/entities/financiero/gasto-caja.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { setEntityUserTracking } from '../utils/entity.utils';

/**
 * Handlers de gastos pagados con el efectivo de la caja de venta (PdV).
 * Modelo simple (una fila por gasto); descuenta del cajón y se lista en el
 * resumen de cierre. No pasa por Caja Mayor.
 */
export function registerGastosCajaHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  // Crear un gasto de caja de venta
  ipcMain.handle('create-gasto-caja', async (_event, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const repo = dataSource.getRepository(GastoCaja);
    const cu = getCurrentUser();

    const monto = Number(data.monto);
    if (!data.cajaId) throw new Error('Falta la caja');
    if (!monto || monto <= 0) throw new Error('El monto debe ser mayor a cero');
    if (!data.descripcion?.trim()) throw new Error('La descripción es obligatoria');

    const entity = repo.create({
      caja: { id: data.cajaId } as any,
      gastoCategoria: data.gastoCategoriaId ? ({ id: data.gastoCategoriaId } as any) : null,
      descripcion: String(data.descripcion).toUpperCase().trim(),
      monto,
      moneda: data.monedaId ? ({ id: data.monedaId } as any) : null,
      formaPago: data.formaPagoId ? ({ id: data.formaPagoId } as any) : null,
      fecha: data.fecha ? new Date(data.fecha) : new Date(),
      estado: 'ACTIVO',
    });
    await setEntityUserTracking(dataSource, entity, cu?.id, false);
    return await repo.save(entity);
  });

  // Listar gastos de una caja (por defecto solo ACTIVOS)
  ipcMain.handle('get-gastos-caja', async (_event, cajaId: number, incluirAnulados?: boolean) => {
    await ensurePermission(dataSource, getCurrentUser, ['VENTAS_PDV', 'FINANCIERO_CAJA_VER']);
    const repo = dataSource.getRepository(GastoCaja);
    const where: any = { caja: { id: cajaId } };
    if (!incluirAnulados) where.estado = 'ACTIVO';
    return await repo.find({
      where,
      relations: ['gastoCategoria', 'moneda', 'formaPago', 'createdBy', 'createdBy.persona'],
      order: { fecha: 'DESC', id: 'DESC' },
    });
  });

  // Anular un gasto (no se borra; queda registro)
  ipcMain.handle('anular-gasto-caja', async (_event, gastoId: number, motivo?: string) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_PDV');
    const repo = dataSource.getRepository(GastoCaja);
    const entity = await repo.findOneBy({ id: gastoId });
    if (!entity) throw new Error(`Gasto de caja ${gastoId} no encontrado`);
    entity.estado = 'ANULADO';
    entity.motivoAnulacion = (motivo || '').toUpperCase().trim() || undefined;
    await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
    return await repo.save(entity);
  });
}
