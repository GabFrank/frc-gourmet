import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { PrecioDelivery } from '../../src/app/database/entities/ventas/precio-delivery.entity';
import { Delivery, DeliveryEstado } from '../../src/app/database/entities/ventas/delivery.entity';
import { Venta, VentaEstado } from '../../src/app/database/entities/ventas/venta.entity';
import { VentaItem } from '../../src/app/database/entities/ventas/venta-item.entity';
import { PdvGrupoCategoria } from '../../src/app/database/entities/ventas/pdv-grupo-categoria.entity';
import { PdvCategoria } from '../../src/app/database/entities/ventas/pdv-categoria.entity';
import { PdvCategoriaItem } from '../../src/app/database/entities/ventas/pdv-categoria-item.entity';
import { PdvItemProducto } from '../../src/app/database/entities/ventas/pdv-item-producto.entity';
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

  // --- PdvGrupoCategoria Handlers ---
  ipcMain.handle('getPdvGrupoCategorias', async () => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      return await repo.find({
        relations: ['categorias'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Grupo Categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvGrupoCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      return await repo.findOne({
        where: { id },
        relations: ['categorias']
      });
    } catch (error) {
      console.error(`Error getting PDV Grupo Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvGrupoCategoria', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Grupo Categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvGrupoCategoria', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Grupo Categoria ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Grupo Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvGrupoCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvGrupoCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Grupo Categoria ID ${id} not found`);
      
      // Check dependencies before deleting
      const categoriaRepo = dataSource.getRepository(PdvCategoria);
      const categoriasCount = await categoriaRepo.count({ 
        where: { grupoCategoria: { id } }
      });
      
      if (categoriasCount > 0) {
        throw new Error(`No se puede eliminar el grupo de categoría porque tiene ${categoriasCount} categorías asociadas.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Grupo Categoria ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvCategoria Handlers ---
  ipcMain.handle('getPdvCategorias', async () => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      return await repo.find({
        relations: ['grupoCategoria', 'items'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoriasByGrupo', async (_event: any, grupoId: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      return await repo.find({
        where: { grupoCategoria: { id: grupoId } },
        relations: ['grupoCategoria', 'items'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting PDV Categorias for Grupo ID ${grupoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      return await repo.findOne({
        where: { id },
        relations: ['grupoCategoria', 'items']
      });
    } catch (error) {
      console.error(`Error getting PDV Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvCategoria', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvCategoria', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria ID ${id} not found`);
      
      // Check dependencies before deleting
      const itemRepo = dataSource.getRepository(PdvCategoriaItem);
      const itemsCount = await itemRepo.count({ 
        where: { categoria: { id } }
      });
      
      if (itemsCount > 0) {
        throw new Error(`No se puede eliminar la categoría porque tiene ${itemsCount} items asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Categoria ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvCategoriaItem Handlers ---
  ipcMain.handle('getPdvCategoriaItems', async () => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      return await repo.find({
        relations: ['categoria', 'productos', 'productos.producto'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Categoria Items:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoriaItemsByCategoria', async (_event: any, categoriaId: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      return await repo.find({
        where: { categoria: { id: categoriaId } },
        relations: ['categoria', 'productos', 'productos.producto'],
        order: { nombre: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting PDV Categoria Items for Categoria ID ${categoriaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvCategoriaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      return await repo.findOne({
        where: { id },
        relations: ['categoria', 'productos', 'productos.producto']
      });
    } catch (error) {
      console.error(`Error getting PDV Categoria Item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvCategoriaItem', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Categoria Item:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvCategoriaItem', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria Item ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Categoria Item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvCategoriaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvCategoriaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Categoria Item ID ${id} not found`);
      
      // Check dependencies before deleting
      const itemProductoRepo = dataSource.getRepository(PdvItemProducto);
      const productosCount = await itemProductoRepo.count({ 
        where: { categoriaItem: { id } }
      });
      
      if (productosCount > 0) {
        throw new Error(`No se puede eliminar el item de categoría porque tiene ${productosCount} productos asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Categoria Item ID ${id}:`, error);
      throw error;
    }
  });

  // --- PdvItemProducto Handlers ---
  ipcMain.handle('getPdvItemProductos', async () => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      return await repo.find({
        relations: ['categoriaItem', 'producto'],
        order: { nombre_alternativo: 'ASC' }
      });
    } catch (error) {
      console.error('Error getting PDV Item Productos:', error);
      throw error;
    }
  });

  ipcMain.handle('getPdvItemProductosByItem', async (_event: any, itemId: number) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      return await repo.find({
        where: { categoriaItem: { id: itemId } },
        relations: ['categoriaItem', 'producto'],
        order: { nombre_alternativo: 'ASC' }
      });
    } catch (error) {
      console.error(`Error getting PDV Item Productos for Item ID ${itemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPdvItemProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      return await repo.findOne({
        where: { id },
        relations: ['categoriaItem', 'producto']
      });
    } catch (error) {
      console.error(`Error getting PDV Item Producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPdvItemProducto', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      const entity = repo.create(data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating PDV Item Producto:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePdvItemProducto', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Item Producto ID ${id} not found`);
      repo.merge(entity, data);
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating PDV Item Producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePdvItemProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PdvItemProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PDV Item Producto ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting PDV Item Producto ID ${id}:`, error);
      throw error;
    }
  });
} 