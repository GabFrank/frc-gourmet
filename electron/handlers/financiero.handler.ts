import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource, Not } from 'typeorm';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { TipoPrecio } from '../../src/app/database/entities/financiero/tipo-precio.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { MonedaBillete } from '../../src/app/database/entities/financiero/moneda-billete.entity';
import { Conteo } from '../../src/app/database/entities/financiero/conteo.entity';
import { ConteoDetalle } from '../../src/app/database/entities/financiero/conteo-detalle.entity';
import { Dispositivo } from '../../src/app/database/entities/financiero/dispositivo.entity';
import { Caja } from '../../src/app/database/entities/financiero/caja.entity';
import { CajaMoneda } from '../../src/app/database/entities/financiero/caja-moneda.entity';
import { MonedaCambio } from '../../src/app/database/entities/financiero/moneda-cambio.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

export function registerFinancieroHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  const currentUser = getCurrentUser(); // Get user for tracking

  // --- Moneda Handlers ---
  ipcMain.handle('getMonedas', async () => {
    try {
      const repo = dataSource.getRepository(Moneda);
      return await repo.find({ order: { principal: 'DESC', denominacion: 'ASC' } });
    } catch (error) {
      console.error('Error getting monedas:', error);
      throw error;
    }
  });

  ipcMain.handle('getMoneda', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Moneda);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting moneda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createMoneda', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Moneda);
      if (data.principal) {
        await repo.update({ principal: true }, { principal: false });
      }
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating moneda:', error);
      throw error;
    }
  });

  ipcMain.handle('updateMoneda', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Moneda);
      if (data.principal) {
        await repo.update({ principal: true, id: Not(id) }, { principal: false });
      }
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Moneda ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating moneda ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteMoneda', async (_event: any, id: number) => {
    // Note: Hard delete. Consider dependencies (PrecioVenta, MonedaBillete, CajaMoneda, etc.)
    try {
      const repo = dataSource.getRepository(Moneda);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Moneda ID ${id} not found`);
      if (entity.principal) {
        throw new Error('No se puede eliminar la moneda principal. Establezca otra moneda como principal primero.');
      }
      // Add more dependency checks here before deleting
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting moneda ID ${id}:`, error);
      throw error;
    }
  });

  // --- TipoPrecio Handlers ---
  ipcMain.handle('getTipoPrecios', async () => {
    try {
      const repo = dataSource.getRepository(TipoPrecio);
      return await repo.find({ order: { descripcion: 'ASC' } });
    } catch (error) {
      console.error('Error getting tipos de precio:', error);
      throw error;
    }
  });

  ipcMain.handle('getTipoPrecio', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(TipoPrecio);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting tipo de precio ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createTipoPrecio', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(TipoPrecio);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating tipo de precio:', error);
      throw error;
    }
  });

  ipcMain.handle('updateTipoPrecio', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(TipoPrecio);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`TipoPrecio ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating tipo de precio ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteTipoPrecio', async (_event: any, id: number) => {
    // Note: Hard delete. Consider dependencies (PrecioVenta)
    try {
      const repo = dataSource.getRepository(TipoPrecio);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`TipoPrecio ID ${id} not found`);
      // Add dependency checks here
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting tipo de precio ID ${id}:`, error);
      throw error;
    }
  });

  // --- PrecioVenta Handlers ---
  ipcMain.handle('getPreciosVentaByPresentacion', async (_event: any, presentacionId: number) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      return await repo.find({ where: { presentacionId }, relations: ['moneda'], order: { principal: 'DESC', valor: 'ASC' } });
    } catch (error) {
      console.error('Error getting precios venta by presentacion:', error);
      throw error;
    }
  });

   ipcMain.handle('getPreciosVentaByPresentacionSabor', async (_event: any, presentacionSaborId: number) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      return await repo.find({ where: { presentacionSaborId }, relations: ['moneda'], order: { principal: 'DESC', valor: 'ASC' } });
    } catch (error) {
      console.error('Error getting precios venta by presentacion sabor:', error);
      throw error;
    }
  });

  ipcMain.handle('createPrecioVenta', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const entity = repo.create(data);
      // No user tracking needed usually for prices
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating precio venta:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePrecioVenta', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PrecioVenta ID ${id} not found`);
      repo.merge(entity, data);
      // No user tracking needed usually
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating precio venta ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePrecioVenta', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PrecioVenta ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting precio venta ID ${id}:`, error);
      throw error;
    }
  });

  // --- MonedaBillete Handlers ---
  ipcMain.handle('get-monedas-billetes', async () => {
    try {
      const repo = dataSource.getRepository(MonedaBillete);
      return await repo.find({ relations: ['moneda'], order: { moneda: { id: 'ASC' }, valor: 'ASC' } });
    } catch (error) {
      console.error('Error getting monedas billetes:', error);
      throw error;
    }
  });

  ipcMain.handle('get-moneda-billete', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(MonedaBillete);
      return await repo.findOne({ where: { id }, relations: ['moneda'] });
    } catch (error) {
      console.error(`Error getting moneda billete ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-moneda-billete', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      const repo = dataSource.getRepository(MonedaBillete);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating moneda billete:', error);
      throw error;
    }
  });

  ipcMain.handle('update-moneda-billete', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(MonedaBillete);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MonedaBillete ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating moneda billete ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-moneda-billete', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete. Consider dependencies (ConteoDetalle)
    try {
      const repo = dataSource.getRepository(MonedaBillete);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MonedaBillete ID ${id} not found`);
      // Add dependency checks here
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting moneda billete ${id}:`, error);
      throw error;
    }
  });

  // --- Conteo Handlers ---
  ipcMain.handle('get-conteos', async () => {
    try {
      const repo = dataSource.getRepository(Conteo);
      // Adjust relations as needed for display/calculation
      return await repo.find({ relations: ['detalles', 'detalles.monedaBillete', 'detalles.monedaBillete.moneda', 'createdBy', 'updatedBy'], order: { id: 'DESC' } });
    } catch (error) {
      console.error('Error getting conteos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-conteo', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(Conteo);
      return await repo.findOne({ where: { id }, relations: ['detalles', 'detalles.monedaBillete', 'detalles.monedaBillete.moneda', 'createdBy', 'updatedBy'] });
    } catch (error) {
      console.error(`Error getting conteo ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-conteo', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      const repo = dataSource.getRepository(Conteo);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating conteo:', error);
      throw error;
    }
  });

  ipcMain.handle('update-conteo', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Conteo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Conteo ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating conteo ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-conteo', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete. Conteos might be linked to Cajas, consider implications.
    try {
      const repo = dataSource.getRepository(Conteo);
      const entity = await repo.findOne({ where: { id }, relations: ['detalles'] }); // Load detalles to delete them first
      if (!entity) throw new Error(`Conteo ID ${id} not found`);

      // Manually delete details first if cascade delete is not set up
      if (entity.detalles && entity.detalles.length > 0) {
        const detalleRepo = dataSource.getRepository(ConteoDetalle);
        await detalleRepo.remove(entity.detalles);
      }
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting conteo ${id}:`, error);
      throw error;
    }
  });

  // --- ConteoDetalle Handlers ---
  ipcMain.handle('get-conteo-detalles', async (_event: IpcMainInvokeEvent, conteoId: number) => {
    try {
      const repo = dataSource.getRepository(ConteoDetalle);
      return await repo.find({ where: { conteo: { id: conteoId } }, relations: ['monedaBillete', 'monedaBillete.moneda'] });
    } catch (error) {
      console.error(`Error getting conteo detalles for conteo ${conteoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-conteo-detalle', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(ConteoDetalle);
      return await repo.findOne({ where: { id }, relations: ['conteo', 'monedaBillete', 'monedaBillete.moneda'] });
    } catch (error) {
      console.error(`Error getting conteo detalle ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-conteo-detalle', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      const repo = dataSource.getRepository(ConteoDetalle);
      const entity = repo.create(data);
      // No user tracking needed usually for details
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating conteo detalle:', error);
      throw error;
    }
  });

  ipcMain.handle('update-conteo-detalle', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(ConteoDetalle);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ConteoDetalle ID ${id} not found`);
      repo.merge(entity, data);
      // No user tracking needed usually
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating conteo detalle ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-conteo-detalle', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(ConteoDetalle);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ConteoDetalle ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting conteo detalle ${id}:`, error);
      throw error;
    }
  });

  // --- Dispositivo Handlers ---
  ipcMain.handle('get-dispositivos', async () => {
    try {
      const repo = dataSource.getRepository(Dispositivo);
      return await repo.find({ order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting dispositivos:', error);
      throw error;
    }
  });

  ipcMain.handle('get-dispositivo', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(Dispositivo);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting dispositivo ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-dispositivo', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      const repo = dataSource.getRepository(Dispositivo);
       // Add validation for unique name/MAC here if needed
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating dispositivo:', error);
      throw error; // Let renderer handle specific messages (like duplicates)
    }
  });

  ipcMain.handle('update-dispositivo', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Dispositivo);
      // Add validation for unique name/MAC (excluding self) here if needed
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Dispositivo ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating dispositivo ${id}:`, error);
      throw error; // Let renderer handle specific messages
    }
  });

  ipcMain.handle('delete-dispositivo', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete. Consider dependencies (Caja)
    try {
      const repo = dataSource.getRepository(Dispositivo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Dispositivo ID ${id} not found`);
      // Add dependency checks here
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting dispositivo ${id}:`, error);
      throw error;
    }
  });

  // --- Caja Handlers ---
  ipcMain.handle('get-cajas', async () => {
    try {
      const repo = dataSource.getRepository(Caja);
      return await repo.find({
        relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona'],
        order: { fechaApertura: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting cajas:', error);
      throw error;
    }
  });

  ipcMain.handle('get-caja', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(Caja);
      return await repo.findOne({
        where: { id },
        relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona']
      });
    } catch (error) {
      console.error(`Error getting caja ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-caja-by-dispositivo', async (_event: IpcMainInvokeEvent, dispositivoId: number) => {
    try {
      const repo = dataSource.getRepository(Caja);
      return await repo.find({
        where: { dispositivo: { id: dispositivoId } },
        relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona'],
        order: { fechaApertura: 'DESC' }
      });
    } catch (error) {
      console.error(`Error getting cajas for dispositivo ${dispositivoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-caja', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      const repo = dataSource.getRepository(Caja);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating caja:', error);
      throw error;
    }
  });

  ipcMain.handle('update-caja', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Caja);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Caja ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating caja ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-caja', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete. Consider implications if caja records are critical audit trails.
    try {
      const repo = dataSource.getRepository(Caja);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Caja ID ${id} not found`);
      // Check if related conteos should also be deleted?
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting caja ${id}:`, error);
      throw error;
    }
  });

  // --- CajaMoneda Handlers ---
  ipcMain.handle('get-cajas-monedas', async () => {
    try {
      const repo = dataSource.getRepository(CajaMoneda);
      return await repo.find({ relations: ['moneda'], order: { orden: 'ASC' } });
    } catch (error) {
      console.error('Error getting cajas monedas:', error);
      throw error;
    }
  });

  ipcMain.handle('get-caja-moneda', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(CajaMoneda);
      return await repo.findOne({ where: { id }, relations: ['moneda'] });
    } catch (error) {
      console.error('Error getting caja moneda:', error);
      throw error;
    }
  });

  ipcMain.handle('create-caja-moneda', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      const repo = dataSource.getRepository(CajaMoneda);
      const entity = repo.create(data);
      // No user tracking typically needed for config like this
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating caja moneda:', error);
      throw error;
    }
  });

  ipcMain.handle('update-caja-moneda', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(CajaMoneda);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`CajaMoneda ID ${id} not found`);
      repo.merge(entity, data);
      // No user tracking typically needed
      return await repo.save(entity);
    } catch (error) {
      console.error('Error updating caja moneda:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-caja-moneda', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(CajaMoneda);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`CajaMoneda ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error('Error deleting caja moneda:', error);
      throw error;
    }
  });

  // Bulk save for CajaMoneda settings
  ipcMain.handle('save-cajas-monedas', async (_event: IpcMainInvokeEvent, updates: any[]) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const results = [];
      for (const update of updates) {
        const { id, monedaId, ...updateData } = update;
        const processedUpdate: Partial<CajaMoneda> = { ...updateData };
        if (monedaId) {
          processedUpdate.moneda = { id: monedaId } as Moneda; // Assign relation by ID
        }

        if (id) {
          await queryRunner.manager.update(CajaMoneda, id, processedUpdate);
          results.push({ success: true, id, operation: 'update' });
        } else {
          const result = await queryRunner.manager.insert(CajaMoneda, processedUpdate);
          const insertedId = result.identifiers[0]?.['id'];
          results.push({ success: true, id: insertedId, operation: 'insert' });
        }
      }
      await queryRunner.commitTransaction();
      return { success: true, results };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('Error saving cajas monedas (transaction rolled back):', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  // --- MonedaCambio Handlers ---
  ipcMain.handle('get-monedas-cambio', async () => {
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      return await repo.find({ relations: ['monedaOrigen', 'monedaDestino'], order: { createdAt: 'DESC' } });
    } catch (error) {
      console.error('Error getting monedas cambio:', error);
      throw error;
    }
  });

   ipcMain.handle('get-monedas-cambio-by-moneda-origen', async (_event: IpcMainInvokeEvent, monedaOrigenId: number) => {
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      return await repo.find({
        where: { monedaOrigen: { id: monedaOrigenId } },
        relations: ['monedaOrigen', 'monedaDestino'],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error(`Error getting monedas cambio for origen ${monedaOrigenId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-moneda-cambio', async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      return await repo.findOne({ where: { id }, relations: ['monedaOrigen', 'monedaDestino'] });
    } catch (error) {
      console.error(`Error getting moneda cambio ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('create-moneda-cambio', async (_event: IpcMainInvokeEvent, data: any) => {
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating moneda cambio:', error);
      throw error;
    }
  });

  ipcMain.handle('update-moneda-cambio', async (_event: IpcMainInvokeEvent, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MonedaCambio ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating moneda cambio ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-moneda-cambio', async (_event: IpcMainInvokeEvent, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(MonedaCambio);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MonedaCambio ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting moneda cambio ${id}:`, error);
      throw error;
    }
  });

} 