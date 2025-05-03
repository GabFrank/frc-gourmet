import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource } from 'typeorm';
import { Proveedor } from '../../src/app/database/entities/compras/proveedor.entity';
import { Compra } from '../../src/app/database/entities/compras/compra.entity';
import { CompraDetalle } from '../../src/app/database/entities/compras/compra-detalle.entity';
import { Pago } from '../../src/app/database/entities/compras/pago.entity';
import { PagoDetalle } from '../../src/app/database/entities/compras/pago-detalle.entity';
import { ProveedorProducto } from '../../src/app/database/entities/compras/proveedor-producto.entity';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

export function registerComprasHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  // Remove this line - get the current user in each handler instead
  // const currentUser = getCurrentUser(); // Get user for tracking

  // --- Proveedor Handlers ---
  ipcMain.handle('getProveedores', async () => {
    try {
      const proveedorRepository = dataSource.getRepository(Proveedor);
      return await proveedorRepository.find({
        relations: ['persona'],
        order: { persona: { nombre: 'ASC' } } // Order by persona name
      });
    } catch (error) {
      console.error('Error getting proveedores:', error);
      throw error;
    }
  });

  ipcMain.handle('getProveedor', async (_event: any, id: number) => {
    try {
      const proveedorRepository = dataSource.getRepository(Proveedor);
      return await proveedorRepository.findOne({
        where: { id },
        relations: ['persona']
      });
    } catch (error) {
      console.error(`Error getting proveedor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createProveedor', async (_event: any, data: any) => {
    try {
      const proveedorRepository = dataSource.getRepository(Proveedor);
      const entity = proveedorRepository.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);

      // Fix: Cast the result of save via unknown as suggested by linter
      const savedEntity = await proveedorRepository.save(entity) as unknown as Proveedor;

      // Check if savedEntity and its id exist before using it
      if (!savedEntity || !savedEntity.id) {
        console.error('Failed to save proveedor or get ID', savedEntity);
        throw new Error('Failed to save proveedor or retrieve its ID.');
      }

      // Fetch again with relations to return complete data
      return await proveedorRepository.findOne({ where: { id: savedEntity.id }, relations: ['persona'] });
    } catch (error) {
      console.error('Error creating proveedor:', error);
      throw error;
    }
  });

  ipcMain.handle('updateProveedor', async (_event: any, id: number, data: any) => {
    try {
      const proveedorRepository = dataSource.getRepository(Proveedor);
      const entity = await proveedorRepository.findOneBy({ id });
      if (!entity) throw new Error(`Proveedor ID ${id} not found`);
      proveedorRepository.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      await proveedorRepository.save(entity);
       // Fetch again with relations to return complete data
      return await proveedorRepository.findOne({ where: { id: id }, relations: ['persona'] });
    } catch (error) {
      console.error(`Error updating proveedor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteProveedor', async (_event: any, id: number) => {
    try {
      const proveedorRepository = dataSource.getRepository(Proveedor);
      const compraRepository = dataSource.getRepository(Compra);
      const entity = await proveedorRepository.findOneBy({ id });
      if (!entity) throw new Error(`Proveedor ID ${id} not found`);

      // Check dependencies (Compras)
      const comprasCount = await compraRepository.count({ where: { proveedor: { id } } });
      if (comprasCount > 0) {
          throw new Error('No se puede eliminar el proveedor porque tiene compras asociadas. Considere desactivarlo.');
      }

      // If no dependencies, proceed with hard delete
      const result = await proveedorRepository.remove(entity);
      return { success: true, affected: 1 }; // Mimic delete result
    } catch (error) {
      console.error(`Error deleting proveedor ID ${id}:`, error);
      throw error;
    }
  });

  // --- Compra Handlers ---
  ipcMain.handle('getCompras', async () => {
    try {
      const compraRepository = dataSource.getRepository(Compra);
      return await compraRepository.find({
        relations: ['proveedor', 'proveedor.persona', 'moneda', 'pago', 'detalles', 'formaPago', 'detalles.producto', 'detalles.ingrediente', 'detalles.presentacion'],
      });
    } catch (error) {
      console.error('Error getting compras:', error);
      throw error;
    }
  });

  ipcMain.handle('getCompra', async (_event: any, id: number) => {
    try {
      const compraRepository = dataSource.getRepository(Compra);
      const compra = await compraRepository.findOne({
        where: { id },
        relations: ['proveedor', 'proveedor.persona', 'pago', 'moneda', 'formaPago', 'detalles', 'detalles.producto', 'detalles.ingrediente', 'detalles.presentacion']
      });
      if (!compra) throw new Error(`Compra ID ${id} not found`);
      // Calculation of total should be frontend/service layer
      return compra;
    } catch (error) {
      console.error(`Error getting compra ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createCompra', async (_event: any, data: any) => {
    try {
      const compraRepository = dataSource.getRepository(Compra);
      const { detalles, ...compraOnly } = data; // Separate details
      const entity = compraRepository.create(compraOnly);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await compraRepository.save(entity);
      // Details should be saved separately after the Compra is created
    } catch (error) {
      console.error('Error creating compra:', error);
      throw error;
    }
  });

  ipcMain.handle('updateCompra', async (_event: any, id: number, data: any) => {
    try {
      const compraRepository = dataSource.getRepository(Compra);
      const { detalles, ...compraOnly } = data;
      const entity = await compraRepository.findOneBy({ id });
      if (!entity) throw new Error(`Compra ID ${id} not found`);
      compraRepository.merge(entity, compraOnly);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await compraRepository.save(entity);
      // Details update should be handled separately
    } catch (error) {
      console.error(`Error updating compra ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteCompra', async (_event: any, id: number) => {
    // Note: Hard delete. Consider soft delete or implications for related entities (Detalles, Pago)
    try {
      const compraRepository = dataSource.getRepository(Compra);
      const compraDetalleRepository = dataSource.getRepository(CompraDetalle);
      const entity = await compraRepository.findOne({ where: { id }, relations: ['detalles'] });
      if (!entity) throw new Error(`Compra ID ${id} not found`);

      // Manually delete details first if cascade is not set up
      if (entity.detalles && entity.detalles.length > 0) {
        await compraDetalleRepository.remove(entity.detalles);
      }

      // Delete the compra
      await compraRepository.remove(entity);
      return { success: true, affected: 1 };
    } catch (error) {
      console.error(`Error deleting compra ID ${id}:`, error);
      throw error;
    }
  });

  // --- CompraDetalle Handlers ---
  ipcMain.handle('getCompraDetalles', async (_event: any, compraId: number) => {
    try {
      const compraDetalleRepository = dataSource.getRepository(CompraDetalle);
      return await compraDetalleRepository.find({
        where: { compra: { id: compraId } },
        relations: ['producto', 'ingrediente', 'presentacion'],
        order: { id: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting compra detalles for compra ${compraId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createCompraDetalle', async (_event: any, data: any) => {
    try {
      const compraDetalleRepository = dataSource.getRepository(CompraDetalle);
      const entity = compraDetalleRepository.create(data);
      // No user tracking usually for details
      return await compraDetalleRepository.save(entity);
    } catch (error) {
      console.error('Error creating compra detalle:', error);
      throw error;
    }
  });

  ipcMain.handle('updateCompraDetalle', async (_event: any, id: number, data: any) => {
    try {
      const compraDetalleRepository = dataSource.getRepository(CompraDetalle);
      const entity = await compraDetalleRepository.findOneBy({ id });
      if (!entity) throw new Error(`CompraDetalle ID ${id} not found`);
      compraDetalleRepository.merge(entity, data);
      // No user tracking usually
      return await compraDetalleRepository.save(entity);
    } catch (error) {
      console.error(`Error updating compra detalle ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteCompraDetalle', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const compraDetalleRepository = dataSource.getRepository(CompraDetalle);
      const entity = await compraDetalleRepository.findOneBy({ id });
      if (!entity) throw new Error(`CompraDetalle ID ${id} not found`);
      await compraDetalleRepository.remove(entity);
      return { success: true, affected: 1 };
    } catch (error) {
      console.error(`Error deleting compra detalle ID ${id}:`, error);
      throw error;
    }
  });

  // --- Pago Handlers ---
  ipcMain.handle('getPagos', async () => {
    try {
      const pagoRepository = dataSource.getRepository(Pago);
      return await pagoRepository.find({
        relations: ['caja', 'detalles', 'compras', 'createdBy', 'updatedBy'], // Include tracking relations
      });
    } catch (error) {
      console.error('Error getting pagos:', error);
      throw error;
    }
  });

  ipcMain.handle('getPago', async (_event: any, id: number) => {
    try {
      const pagoRepository = dataSource.getRepository(Pago);
      return await pagoRepository.findOne({
        where: { id },
        relations: ['caja', 'detalles', 'compras', 'createdBy', 'updatedBy'] // Include tracking relations
      });
    } catch (error) {
      console.error(`Error getting pago ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPago', async (_event: any, data: any) => {
    try {
      const pagoRepository = dataSource.getRepository(Pago);
      const entity = pagoRepository.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await pagoRepository.save(entity);
      // Details and Compra associations should be handled separately
    } catch (error) {
      console.error('Error creating pago:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePago', async (_event: any, id: number, data: any) => {
    try {
      const pagoRepository = dataSource.getRepository(Pago);
      const entity = await pagoRepository.findOneBy({ id });
      if (!entity) throw new Error(`Pago ID ${id} not found`);
      pagoRepository.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await pagoRepository.save(entity);
      // Details and Compra associations update should be handled separately
    } catch (error) {
      console.error(`Error updating pago ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePago', async (_event: any, id: number) => {
    // Note: Hard delete. Consider soft delete.
    try {
      const pagoRepository = dataSource.getRepository(Pago);
      const pagoDetalleRepository = dataSource.getRepository(PagoDetalle);
      const entity = await pagoRepository.findOne({ where: { id }, relations: ['detalles'] });
      if (!entity) throw new Error(`Pago ID ${id} not found`);

       // Manually delete details first if cascade is not set up
       if (entity.detalles && entity.detalles.length > 0) {
         await pagoDetalleRepository.remove(entity.detalles);
       }

      await pagoRepository.remove(entity);
      return { success: true, affected: 1 };
    } catch (error) {
      console.error(`Error deleting pago ID ${id}:`, error);
      throw error;
    }
  });

  // --- PagoDetalle Handlers ---
  ipcMain.handle('getPagoDetalles', async (_event: any, pagoId: number) => {
    try {
      const pagoDetalleRepository = dataSource.getRepository(PagoDetalle);
      return await pagoDetalleRepository.find({
        where: { pago: { id: pagoId } },
        relations: ['moneda', 'formaPago'],
        order: { id: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting pago detalles for pago ${pagoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPagoDetalle', async (_event: any, data: any) => {
    try {
      const pagoDetalleRepository = dataSource.getRepository(PagoDetalle);
      const entity = pagoDetalleRepository.create(data);
      // No user tracking usually
      return await pagoDetalleRepository.save(entity);
    } catch (error) {
      console.error('Error creating pago detalle:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePagoDetalle', async (_event: any, id: number, data: any) => {
    try {
      const pagoDetalleRepository = dataSource.getRepository(PagoDetalle);
      const entity = await pagoDetalleRepository.findOneBy({ id });
      if (!entity) throw new Error(`PagoDetalle ID ${id} not found`);
      pagoDetalleRepository.merge(entity, data);
      // No user tracking usually
      return await pagoDetalleRepository.save(entity);
    } catch (error) {
      console.error(`Error updating pago detalle ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePagoDetalle', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const pagoDetalleRepository = dataSource.getRepository(PagoDetalle);
      const entity = await pagoDetalleRepository.findOneBy({ id });
      if (!entity) throw new Error(`PagoDetalle ID ${id} not found`);
      await pagoDetalleRepository.remove(entity);
      return { success: true, affected: 1 };
    } catch (error) {
      console.error(`Error deleting pago detalle ID ${id}:`, error);
      throw error;
    }
  });

  // --- ProveedorProducto Handlers ---
  ipcMain.handle('getProveedorProductos', async (_event: any, proveedorId: number) => {
    try {
      const proveedorProductoRepository = dataSource.getRepository(ProveedorProducto);
      return await proveedorProductoRepository.find({
        where: { proveedor: { id: proveedorId }, activo: true }, // Added activo filter
        relations: ['producto', 'ingrediente', 'compra'],
        order: { id: 'ASC' } // Added default ordering
      });
    } catch (error) {
      console.error(`Error getting proveedor productos for proveedor ${proveedorId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getProveedorProducto', async (_event: any, id: number) => {
    try {
      const proveedorProductoRepository = dataSource.getRepository(ProveedorProducto);
      return await proveedorProductoRepository.findOne({
        where: { id },
        relations: ['producto', 'ingrediente', 'compra', 'proveedor']
      });
    } catch (error) {
      console.error(`Error getting proveedor producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createProveedorProducto', async (_event: any, data: any) => {
    try {
      const proveedorProductoRepository = dataSource.getRepository(ProveedorProducto);
      const entity = proveedorProductoRepository.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await proveedorProductoRepository.save(entity);
    } catch (error) {
      console.error('Error creating proveedor producto:', error);
      throw error;
    }
  });

  ipcMain.handle('updateProveedorProducto', async (_event: any, id: number, data: any) => {
    try {
      const proveedorProductoRepository = dataSource.getRepository(ProveedorProducto);
      const entity = await proveedorProductoRepository.findOneBy({ id });
      if (!entity) throw new Error(`ProveedorProducto ID ${id} not found`);
      proveedorProductoRepository.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await proveedorProductoRepository.save(entity);
    } catch (error) {
      console.error(`Error updating proveedor producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteProveedorProducto', async (_event: any, id: number) => {
    // Using soft delete
    try {
      const proveedorProductoRepository = dataSource.getRepository(ProveedorProducto);
      const entity = await proveedorProductoRepository.findOneBy({ id });
      if (!entity) throw new Error(`ProveedorProducto ID ${id} not found`);
      entity.activo = false;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true); // Track soft delete
      await proveedorProductoRepository.save(entity);
      return { success: true, affected: 1 };
    } catch (error) {
      console.error(`Error soft deleting proveedor producto ID ${id}:`, error);
      throw error;
    }
  });

  // --- FormasPago Handlers ---
  ipcMain.handle('getFormasPago', async () => {
    try {
      const formasPagoRepository = dataSource.getRepository(FormasPago);
      return await formasPagoRepository.find({
        where: { activo: true },
      });
    } catch (error) {
      console.error('Error getting formas de pago:', error);
      throw error;
    }
  });

  ipcMain.handle('getFormaPago', async (_event: any, id: number) => {
    try {
      const formasPagoRepository = dataSource.getRepository(FormasPago);
      return await formasPagoRepository.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting forma de pago ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createFormaPago', async (_event: any, data: any) => {
    try {
      const formasPagoRepository = dataSource.getRepository(FormasPago);
      const entity = formasPagoRepository.create(data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await formasPagoRepository.save(entity);
    } catch (error) {
      console.error('Error creating forma de pago:', error);
      throw error;
    }
  });

  ipcMain.handle('updateFormaPago', async (_event: any, id: number, data: any) => {
    try {
      const formasPagoRepository = dataSource.getRepository(FormasPago);
      const entity = await formasPagoRepository.findOneBy({ id });
      if (!entity) throw new Error(`FormaPago ID ${id} not found`);
      formasPagoRepository.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true);
      return await formasPagoRepository.save(entity);
    } catch (error) {
      console.error(`Error updating forma de pago ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteFormaPago', async (_event: any, id: number) => {
    // Using soft delete
    try {
      const formasPagoRepository = dataSource.getRepository(FormasPago);
      const entity = await formasPagoRepository.findOneBy({ id });
      if (!entity) throw new Error(`FormaPago ID ${id} not found`);
      entity.activo = false;
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, true); // Track soft delete
      await formasPagoRepository.save(entity);
      return { success: true, affected: 1 };
    } catch (error) {
      console.error(`Error soft deleting forma de pago ID ${id}:`, error);
      throw error;
    }
  });

} 