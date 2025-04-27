import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { PrecioDelivery } from '../../src/app/database/entities/ventas/precio-delivery.entity';
import { Delivery, DeliveryEstado } from '../../src/app/database/entities/ventas/delivery.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { VentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

export function registerVentasHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  const currentUser = getCurrentUser(); // Get user for tracking

  // --- PrecioDelivery Handlers ---
  ipcMain.handle('getPreciosDelivery', async () => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      return await repo.find({ order: { descripcion: 'ASC' } });
    } catch (error) {
      console.error('Error getting precios delivery:', error);
      throw error;
    }
  });

  ipcMain.handle('getPrecioDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting precio delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPrecioDelivery', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating precio delivery:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePrecioDelivery', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Precio Delivery ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating precio delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePrecioDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PrecioDelivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Precio Delivery ID ${id} not found`);
      
      // Check dependencies (Deliveries) before deleting
      const deliveryRepo = dataSource.getRepository(Delivery);
      const deliveriesCount = await deliveryRepo.count({ 
        where: { precioDelivery: { id } }
      });
      
      if (deliveriesCount > 0) {
        throw new Error(`No se puede eliminar el precio de delivery porque está asociado a ${deliveriesCount} deliveries.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting precio delivery ID ${id}:`, error);
      throw error;
    }
  });

  // --- Delivery Handlers ---
  ipcMain.handle('getDeliveries', async () => {
    try {
      const repo = dataSource.getRepository(Delivery);
      return await repo.find({ 
        relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'],
        order: { fechaAbierto: 'DESC' } 
      });
    } catch (error) {
      console.error('Error getting deliveries:', error);
      throw error;
    }
  });

  ipcMain.handle('getDeliveriesByEstado', async (_event: any, estado: DeliveryEstado) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      return await repo.find({ 
        where: { estado },
        relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'],
        order: { fechaAbierto: 'DESC' } 
      });
    } catch (error) {
      console.error(`Error getting deliveries with estado ${estado}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      return await repo.findOne({ 
        where: { id },
        relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'] 
      });
    } catch (error) {
      console.error(`Error getting delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createDelivery', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating delivery:', error);
      throw error;
    }
  });

  ipcMain.handle('updateDelivery', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Delivery ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating delivery ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteDelivery', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Delivery);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Delivery ID ${id} not found`);
      
      // Check dependencies (Ventas) before deleting
      const ventaRepo = dataSource.getRepository(Venta);
      const ventasCount = await ventaRepo.count({ 
        where: { delivery: { id } }
      });
      
      if (ventasCount > 0) {
        throw new Error(`No se puede eliminar el delivery porque está asociado a ${ventasCount} ventas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting delivery ID ${id}:`, error);
      throw error;
    }
  });

  // --- Venta Handlers ---
  ipcMain.handle('getVentas', async () => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.find({
        relations: [
          'cliente', 
          'cliente.persona', 
          'formaPago', 
          'caja', 
          'pago', 
          'delivery'
        ],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error('Error getting ventas:', error);
      throw error;
    }
  });

  ipcMain.handle('getVentasByEstado', async (_event: any, estado: VentaEstado) => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.find({
        where: { estado },
        relations: [
          'cliente', 
          'cliente.persona', 
          'formaPago', 
          'caja', 
          'pago', 
          'delivery'
        ],
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      console.error(`Error getting ventas with estado ${estado}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getVenta', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Venta);
      return await repo.findOne({
        where: { id },
        relations: [
          'cliente', 
          'cliente.persona', 
          'formaPago', 
          'caja', 
          'pago', 
          'delivery'
        ]
      });
    } catch (error) {
      console.error(`Error getting venta ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVenta', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Venta);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating venta:', error);
      throw error;
    }
  });

  ipcMain.handle('updateVenta', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Venta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating venta ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteVenta', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Venta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta ID ${id} not found`);
      
      // Check if there are venta items before deleting
      const ventaItemRepo = dataSource.getRepository(VentaItem);
      const itemsCount = await ventaItemRepo.count({ 
        where: { venta: { id } }
      });
      
      if (itemsCount > 0) {
        throw new Error(`No se puede eliminar la venta porque tiene ${itemsCount} items asociados. Elimine primero los items.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting venta ID ${id}:`, error);
      throw error;
    }
  });

  // --- VentaItem Handlers ---
  ipcMain.handle('getVentaItems', async (_event: any, ventaId: number) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      return await repo.find({
        where: { venta: { id: ventaId } },
        relations: [
          'producto', 
          'presentacion', 
          'precioVentaPresentacion',
          'precioVentaPresentacion.moneda'
        ],
        order: { createdAt: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting venta items for venta ID ${ventaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getVentaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      return await repo.findOne({
        where: { id },
        relations: [
          'venta',
          'producto', 
          'presentacion', 
          'precioVentaPresentacion',
          'precioVentaPresentacion.moneda'
        ]
      });
    } catch (error) {
      console.error(`Error getting venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createVentaItem', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating venta item:', error);
      throw error;
    }
  });

  ipcMain.handle('updateVentaItem', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta Item ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteVentaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(VentaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Venta Item ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting venta item ID ${id}:`, error);
      throw error;
    }
  });
} 