import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource } from 'typeorm';
import { Categoria } from '../../src/app/database/entities/productos/categoria.entity';
import { Subcategoria } from '../../src/app/database/entities/productos/subcategoria.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Presentacion } from '../../src/app/database/entities/productos/presentacion.entity';
import { Codigo } from '../../src/app/database/entities/productos/codigo.entity';
import { Sabor } from '../../src/app/database/entities/productos/sabor.entity';
import { PresentacionSabor } from '../../src/app/database/entities/productos/presentacion-sabor.entity';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaItem } from '../../src/app/database/entities/productos/receta-item.entity';
import { Ingrediente } from '../../src/app/database/entities/productos/ingrediente.entity';
import { RecetaVariacion } from '../../src/app/database/entities/productos/receta-variacion.entity';
import { RecetaVariacionItem } from '../../src/app/database/entities/productos/receta-variacion-item.entity';
import { MovimientoStock, TipoReferencia } from '../../src/app/database/entities/productos/movimiento-stock.entity';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { Observacion } from '../../src/app/database/entities/productos/observacion.entity';
import { ObservacionProducto } from '../../src/app/database/entities/productos/observacion-producto.entity';
import { ObservacionProductoVentaItem } from '../../src/app/database/entities/productos/observacion-producto-venta-item.entity';
import { Adicional } from '../../src/app/database/entities/productos/adicional.entity';
import { ProductoAdicional } from '../../src/app/database/entities/productos/producto-adicional.entity';
import { ProductoAdicionalVentaItem } from '../../src/app/database/entities/productos/producto-adicional-venta-item.entity';

export function registerProductosHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  // Helper function to enrich products with principal presentation and price information
  async function enrichProductWithPrincipalData(producto: Producto) {
    // Find principal presentation
    const presentacionRepo = dataSource.getRepository(Presentacion);
    const principalPresentacion = await presentacionRepo.findOne({
      where: { productoId: producto.id, principal: true, activo: true }
    });
    
    if (principalPresentacion) {
      // Add principal presentation to producto
      (producto as any).principalPresentacion = principalPresentacion;
      
      // Find principal price for this presentation
      const precioVentaRepo = dataSource.getRepository(PrecioVenta);
      const principalPrecio = await precioVentaRepo.findOne({
        where: { presentacionId: principalPresentacion.id, principal: true, activo: true },
        relations: ['moneda']
      });
      
      if (principalPrecio) {
        // Add principal price to producto
        (producto as any).principalPrecio = principalPrecio;
      }
    }
  }

  async function enrichPresentacionWithPrincipalData(presentacion: Presentacion) {
    const precioVentaRepo = dataSource.getRepository(PrecioVenta);
    const principalPrecio = await precioVentaRepo.findOne({
      where: { presentacionId: presentacion.id, principal: true, activo: true },
      relations: ['moneda']
    });
    if (principalPrecio) {
      (presentacion as any).principalPrecio = principalPrecio;
    }
  }
  // --- Categoria Handlers ---
  ipcMain.handle('getCategorias', async () => {
    try {
      const repo = dataSource.getRepository(Categoria);
      return await repo.find({ order: { posicion: 'ASC', nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting categorias:', error);
      throw error;
    }
  });

  ipcMain.handle('getCategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Categoria);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createCategoria', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Categoria);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating categoria:', error);
      throw error;
    }
  });

  ipcMain.handle('updateCategoria', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Categoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Categoria ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating categoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteCategoria', async (_event: any, id: number) => {
    // Note: This is a hard delete. Consider soft delete (activo=false) if needed.
    try {
      const repo = dataSource.getRepository(Categoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Categoria ID ${id} not found`);
       // Check dependencies (Subcategorias) before deleting
       const subcategoriaRepo = dataSource.getRepository(Subcategoria);
       const subcategoriasCount = await subcategoriaRepo.count({ where: { categoriaId: id } });
       if (subcategoriasCount > 0) {
           throw new Error(`No se puede eliminar la categoría porque tiene ${subcategoriasCount} subcategorías asociadas.`);
       }
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting categoria ID ${id}:`, error);
      throw error;
    }
  });

  // --- Subcategoria Handlers ---
  ipcMain.handle('getSubcategorias', async () => {
    try {
      const repo = dataSource.getRepository(Subcategoria);
      return await repo.find({ relations: ['categoria'], order: { posicion: 'ASC', nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting subcategorias:', error);
      throw error;
    }
  });

  ipcMain.handle('getSubcategoria', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Subcategoria);
      return await repo.findOne({ where: { id }, relations: ['categoria'] });
    } catch (error) {
      console.error(`Error getting subcategoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getSubcategoriasByCategoria', async (_event: any, categoriaId: number) => {
    try {
      const repo = dataSource.getRepository(Subcategoria);
      return await repo.find({ where: { categoriaId }, order: { posicion: 'ASC', nombre: 'ASC' } });
    } catch (error) {
      console.error(`Error getting subcategorias for categoria ID ${categoriaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createSubcategoria', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Subcategoria);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating subcategoria:', error);
      throw error;
    }
  });

  ipcMain.handle('updateSubcategoria', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Subcategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Subcategoria ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating subcategoria ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteSubcategoria', async (_event: any, id: number) => {
    // Note: Hard delete. Consider soft delete.
    try {
      const repo = dataSource.getRepository(Subcategoria);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Subcategoria ID ${id} not found`);
        // Check dependencies (Productos) before deleting
        const productoRepo = dataSource.getRepository(Producto);
        const productosCount = await productoRepo.count({ where: { subcategoriaId: id } });
        if (productosCount > 0) {
            throw new Error(`No se puede eliminar la subcategoría porque tiene ${productosCount} productos asociados.`);
        }
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting subcategoria ID ${id}:`, error);
      throw error;
    }
  });

  // --- Producto Handlers ---
  ipcMain.handle('getProductos', async () => {
    try {
      const repo = dataSource.getRepository(Producto);
      const productos = await repo.find({ relations: ['subcategoria', 'subcategoria.categoria'], order: { nombre: 'ASC' } });
      
      // Enrich each product with principal data
      for (const producto of productos) {
        await enrichProductWithPrincipalData(producto);
      }
      
      return productos;
    } catch (error) {
      console.error('Error getting productos:', error);
      throw error;
    }
  });

  ipcMain.handle('getProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Producto);
      const producto = await repo.findOne({ where: { id }, relations: ['subcategoria', 'subcategoria.categoria'] });
      
      if (producto) {
        await enrichProductWithPrincipalData(producto);
      }
      
      return producto;
    } catch (error) {
      console.error(`Error getting producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getProductosBySubcategoria', async (_event: any, subcategoriaId: number) => {
    try {
      const repo = dataSource.getRepository(Producto);
      const productos = await repo.find({ where: { subcategoriaId }, order: { nombre: 'ASC' } });
      
      // Enrich each product with principal data
      for (const producto of productos) {
        await enrichProductWithPrincipalData(producto);
      }
      
      return productos;
    } catch (error) {
      console.error(`Error getting productos for subcategoria ID ${subcategoriaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createProducto', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Producto);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating producto:', error);
      throw error;
    }
  });

  ipcMain.handle('updateProducto', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Producto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Producto ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      console.log('currentUser', currentUser);
      // if currentuser is null throw error
      if (!currentUser) throw new Error('No current user found');
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Producto);
      const presentacionRepo = dataSource.getRepository(Presentacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Producto ID ${id} not found`);

      // Attempt soft delete first by setting activo = false
      entity.activo = false;
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      console.log(`Producto ID ${id} marked as inactive.`);

      // Optionally: Consider also deactivating related Presentaciones
       const presentaciones = await presentacionRepo.find({ where: { productoId: id, activo: true } });
       for (const pres of presentaciones) {
           pres.activo = false;
           await setEntityUserTracking(dataSource, pres, currentUser?.id, true);
           await presentacionRepo.save(pres);
       }
       console.log(`Marked ${presentaciones.length} related presentaciones as inactive for Producto ID ${id}.`);

      return { success: true, deleted: false, deactivated: true }; // Indicate soft delete

    } catch (error) {
      console.error(`Error deactivating producto ID ${id}:`, error);
      // Attempt hard delete only if soft delete fails and specifically allowed
      // For now, just re-throw the error from the soft delete attempt
      throw error;
    }
  });


  // --- Presentacion Handlers ---
  ipcMain.handle('getPresentacionesByProducto', async (_event: any, productoId: number) => {
    try {
      const repo = dataSource.getRepository(Presentacion);
      return await repo.find({ where: { productoId }, order: { principal: 'DESC', descripcion: 'ASC' } });
    } catch (error) {
      console.error('Error getting presentaciones by producto:', error);
      throw error;
    }
  });

  ipcMain.handle('createPresentacion', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Presentacion);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating presentacion:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePresentacion', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Presentacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Presentacion ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating presentacion ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePresentacion', async (_event: any, id: number) => {
    // Note: Hard delete. Consider soft delete.
    try {
      const repo = dataSource.getRepository(Presentacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Presentacion ID ${id} not found`);
       // Add checks for dependencies (e.g., PrecioVenta, Codigo, PresentacionSabor)
       // If dependencies exist, either prevent deletion or handle cascade/soft delete.
       // Example check (adapt as needed):
       /*
       const precioVentaRepo = dataSource.getRepository(PrecioVenta);
       const preciosCount = await precioVentaRepo.count({ where: { presentacionId: id } });
       if (preciosCount > 0) {
           throw new Error(`Cannot delete presentation with existing prices.`);
       }
       */
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting presentacion ID ${id}:`, error);
      throw error;
    }
  });

  // --- Codigo Handlers ---
  ipcMain.handle('getCodigosByPresentacion', async (_event: any, presentacionId: number) => {
    try {
      const repo = dataSource.getRepository(Codigo);
      return await repo.find({ where: { presentacionId }, order: { principal: 'DESC', codigo: 'ASC' } });
    } catch (error) {
      console.error('Error getting codigos by presentacion:', error);
      throw error;
    }
  });

  // alsos return presentacion.producto
  ipcMain.handle('getCodigos', async () => {
    try {
      const repo = dataSource.getRepository(Codigo);
      return await repo.find({ order: { principal: 'DESC', codigo: 'ASC' }, relations: ['presentacion', 'presentacion.producto'] });
    } catch (error) {
      console.error('Error getting codigos:', error);
      throw error;
    }
  });

  ipcMain.handle('createCodigo', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Codigo);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating codigo:', error);
      throw error;
    }
  });

  ipcMain.handle('updateCodigo', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Codigo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Codigo ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating codigo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteCodigo', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(Codigo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Codigo ID ${id} not found`);
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting codigo ID ${id}:`, error);
      throw error;
    }
  });

  // --- Sabor Handlers ---
  ipcMain.handle('getSabores', async () => {
    try {
      const repo = dataSource.getRepository(Sabor);
      return await repo.find({ order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting sabores:', error);
      throw error;
    }
  });

  ipcMain.handle('getSabor', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Sabor);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting sabor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createSabor', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Sabor);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating sabor:', error);
      throw error;
    }
  });

  ipcMain.handle('updateSabor', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Sabor);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Sabor ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating sabor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteSabor', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(Sabor);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Sabor ID ${id} not found`);
       // Add dependency checks (PresentacionSabor)
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting sabor ID ${id}:`, error);
      throw error;
    }
  });

  // --- PresentacionSabor Handlers ---
  ipcMain.handle('getPresentacionSaboresByPresentacion', async (_event: any, presentacionId: number) => {
    try {
      const repo = dataSource.getRepository(PresentacionSabor);
      return await repo.find({ where: { presentacionId }, relations: ['sabor', 'receta', 'variacion'], order: { id: 'ASC' } });
    } catch (error) {
      console.error(`Error getting presentacion sabores for presentacion ID ${presentacionId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getPresentacionSabor', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PresentacionSabor);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting presentacion sabor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createPresentacionSabor', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PresentacionSabor);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating presentacion sabor:', error);
      throw error;
    }
  });

  ipcMain.handle('updatePresentacionSabor', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(PresentacionSabor);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PresentacionSabor ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating presentacion sabor ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deletePresentacionSabor', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(PresentacionSabor);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PresentacionSabor ID ${id} not found`);
       // Add dependency checks (e.g., PrecioVenta specific to sabor)
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting presentacion sabor ID ${id}:`, error);
      throw error;
    }
  });

  // --- Receta Handlers ---
  ipcMain.handle('getRecetas', async () => {
    try {
      const repo = dataSource.getRepository(Receta);
      return await repo.find({ order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting recetas:', error);
      throw error;
    }
  });

  ipcMain.handle('getReceta', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Receta);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting receta ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createReceta', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Receta);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating receta:', error);
      throw error;
    }
  });

  ipcMain.handle('updateReceta', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Receta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Receta ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating receta ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteReceta', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(Receta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Receta ID ${id} not found`);
       // Add dependency checks (RecetaItem, PresentacionSabor, RecetaVariacion)
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting receta ID ${id}:`, error);
      throw error;
    }
  });

  // --- RecetaItem Handlers ---
  ipcMain.handle('getRecetaItems', async (_event: any, recetaId: number) => {
    try {
      const repo = dataSource.getRepository(RecetaItem);
      return await repo.find({ where: { recetaId }, relations: ['ingrediente'], order: { id: 'ASC' } });
    } catch (error) {
      console.error(`Error getting receta items for receta ID ${recetaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getRecetaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(RecetaItem);
      return await repo.findOne({ where: { id }, relations: ['ingrediente'] }); // Include relation
    } catch (error) {
      console.error(`Error getting receta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createRecetaItem', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(RecetaItem);
      const entity = repo.create(data);
      // No user tracking on items usually, but can be added if needed
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating receta item:', error);
      throw error;
    }
  });

  ipcMain.handle('updateRecetaItem', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(RecetaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`RecetaItem ID ${id} not found`);
      repo.merge(entity, data);
      // No user tracking on items usually
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating receta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteRecetaItem', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(RecetaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`RecetaItem ID ${id} not found`);
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting receta item ID ${id}:`, error);
      throw error;
    }
  });

  // --- Ingrediente Handlers ---
  ipcMain.handle('getIngredientes', async () => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      return await repo.find({ order: { descripcion: 'ASC' } });
    } catch (error) {
      console.error('Error getting ingredientes:', error);
      throw error;
    }
  });

  ipcMain.handle('getIngrediente', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting ingrediente ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createIngrediente', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating ingrediente:', error);
      throw error;
    }
  });

  ipcMain.handle('updateIngrediente', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Ingrediente ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating ingrediente ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteIngrediente', async (_event: any, id: number) => {
    // Note: Hard delete. Consider soft delete.
    try {
      const repo = dataSource.getRepository(Ingrediente);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Ingrediente ID ${id} not found`);
       // Add dependency checks (RecetaItem, RecetaVariacionItem, CompraDetalle etc.)
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting ingrediente ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('searchIngredientesByDescripcion', async (_event: IpcMainInvokeEvent, searchText: string) => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      if (!searchText || searchText.trim() === '') {
        return await repo.find({ order: { descripcion: 'ASC' }, take: 10 });
      }
      return await repo.createQueryBuilder('ingrediente')
        .where('LOWER(ingrediente.descripcion) LIKE LOWER(:searchText)', { searchText: `%${searchText}%` })
        .orWhere('CAST(ingrediente.id AS TEXT) LIKE :searchText', { searchText: `%${searchText}%` })
        .orderBy('ingrediente.descripcion', 'ASC')
        .getMany();
    } catch (error) {
      console.error('Error searching ingredientes:', error);
      throw error;
    }
  });

  // Search ingredientes directly from database
  ipcMain.handle('searchIngredientes', async (_event: IpcMainInvokeEvent, query: string) => {
    try {
      const ingredienteRepo = dataSource.getRepository(Ingrediente);
      const ingredients = await ingredienteRepo.createQueryBuilder('ingrediente')
        .where('LOWER(ingrediente.descripcion) LIKE LOWER(:query)', { query: `%${query}%` })
        .andWhere('ingrediente.activo = :activo', { activo: true })
        .orderBy('ingrediente.descripcion', 'ASC')
        .take(50)
        .getMany();
      
      return ingredients;
    } catch (error) {
      console.error('Error searching ingredientes:', error);
      return [];
    }
  });
  
  // Search recetas directly from database
  ipcMain.handle('searchRecetas', async (_event: IpcMainInvokeEvent, query: string) => {
    try {
      const recetaRepo = dataSource.getRepository(Receta);
      const recetas = await recetaRepo.createQueryBuilder('receta')
        .where('LOWER(receta.nombre) LIKE LOWER(:query)', { query: `%${query}%` })
        .andWhere('receta.activo = :activo', { activo: true })
        .orderBy('receta.nombre', 'ASC')
        .take(50)
        .getMany();
      
      return recetas;
    } catch (error) {
      console.error('Error searching recetas:', error);
      return [];
    }
  });

  // --- RecetaVariacion Handlers ---
  ipcMain.handle('getRecetaVariaciones', async (_event: any, recetaId: number) => {
    try {
      const repo = dataSource.getRepository(RecetaVariacion);
      return await repo.find({ where: { recetaId }, order: { nombre: 'ASC' } });
    } catch (error) {
      console.error(`Error getting variations for recipe ID ${recetaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getRecetaVariacion', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(RecetaVariacion);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting variation ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createRecetaVariacion', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(RecetaVariacion);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating recipe variation:', error);
      throw error;
    }
  });

  ipcMain.handle('updateRecetaVariacion', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(RecetaVariacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`RecetaVariacion ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating recipe variation ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteRecetaVariacion', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(RecetaVariacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`RecetaVariacion ID ${id} not found`);
      // Add dependency checks (RecetaVariacionItem, PresentacionSabor)
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting recipe variation ID ${id}:`, error);
      throw error;
    }
  });

  // --- RecetaVariacionItem Handlers ---
  ipcMain.handle('getRecetaVariacionItems', async (_event: any, variacionId: number) => {
    try {
      const repo = dataSource.getRepository(RecetaVariacionItem);
      return await repo.find({ where: { variacionId }, relations: ['ingrediente'] });
    } catch (error) {
      console.error(`Error getting items for recipe variation ID ${variacionId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getRecetaVariacionItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(RecetaVariacionItem);
      return await repo.findOne({ where: { id }, relations: ['ingrediente'] }); // Include relation
    } catch (error) {
      console.error(`Error getting recipe variation item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createRecetaVariacionItem', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(RecetaVariacionItem);
      const entity = repo.create(data);
      // No user tracking on items usually
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating recipe variation item:', error);
      throw error;
    }
  });

  ipcMain.handle('updateRecetaVariacionItem', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(RecetaVariacionItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`RecetaVariacionItem ID ${id} not found`);
      repo.merge(entity, data);
      // No user tracking on items usually
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating recipe variation item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteRecetaVariacionItem', async (_event: any, id: number) => {
    // Note: Hard delete.
    try {
      const repo = dataSource.getRepository(RecetaVariacionItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`RecetaVariacionItem ID ${id} not found`);
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting recipe variation item ID ${id}:`, error);
      throw error;
    }
  });

  // --- MovimientoStock Handlers ---
  ipcMain.handle('getMovimientosStock', async () => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      return await repo.find({ 
        relations: ['producto', 'ingrediente'],
        where: { activo: true }, 
        order: { createdAt: 'DESC' } 
      });
    } catch (error) {
      console.error('Error getting movimientos stock:', error);
      throw error;
    }
  });

  ipcMain.handle('getMovimientoStock', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      return await repo.findOne({ 
        where: { id }, 
        relations: ['producto', 'ingrediente'] 
      });
    } catch (error) {
      console.error(`Error getting movimiento stock ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getMovimientosStockByProducto', async (_event: any, productoId: number) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      return await repo.find({ 
        where: { productoId, activo: true }, 
        order: { createdAt: 'DESC' } 
      });
    } catch (error) {
      console.error(`Error getting movimientos stock for producto ID ${productoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getMovimientosStockByIngrediente', async (_event: any, ingredienteId: number) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      return await repo.find({ 
        where: { ingredienteId, activo: true }, 
        order: { createdAt: 'DESC' } 
      });
    } catch (error) {
      console.error(`Error getting movimientos stock for ingrediente ID ${ingredienteId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getMovimientosStockByTipoReferencia', async (_event: any, tipoReferencia: TipoReferencia) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      return await repo.find({ 
        where: { tipoReferencia, activo: true }, 
        relations: ['producto', 'ingrediente'],
        order: { createdAt: 'DESC' } 
      });
    } catch (error) {
      console.error(`Error getting movimientos stock for tipo referencia ${tipoReferencia}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getMovimientosStockByReferenciaAndTipo', async (_event: any, referencia: number, tipoReferencia: TipoReferencia) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      return await repo.find({ 
        where: { 
          referencia, 
          tipoReferencia,
          activo: true
        }, 
        relations: ['producto', 'ingrediente'],
        order: { createdAt: 'DESC' } 
      });
    } catch (error) {
      console.error(`Error getting movimientos stock for referencia ${referencia} and tipo ${tipoReferencia}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getCurrentStockByProducto', async (_event: any, productoId: number) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      // Get the most recent active stock movement for this product
      const movimiento = await repo.findOne({
        where: { productoId, activo: true },
        order: { createdAt: 'DESC' }
      });
      return movimiento || { cantidadActual: 0 };
    } catch (error) {
      console.error(`Error getting current stock for producto ID ${productoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getCurrentStockByIngrediente', async (_event: any, ingredienteId: number) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      // Get the most recent active stock movement for this ingredient
      const movimiento = await repo.findOne({
        where: { ingredienteId, activo: true },
        order: { createdAt: 'DESC' }
      });
      return movimiento || { cantidadActual: 0 };
    } catch (error) {
      console.error(`Error getting current stock for ingrediente ID ${ingredienteId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createMovimientoStock', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      const entity = repo.create(data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating movimiento stock:', error);
      throw error;
    }
  });

  ipcMain.handle('updateMovimientoStock', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MovimientoStock ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating movimiento stock ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteMovimientoStock', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(MovimientoStock);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`MovimientoStock ID ${id} not found`);
      
      // Attempt soft delete by setting activo = false
      entity.activo = false;
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      console.log(`MovimientoStock ID ${id} marked as inactive.`);
      
      return { success: true, deactivated: true };
    } catch (error) {
      console.error(`Error deactivating movimiento stock ID ${id}:`, error);
      throw error;
    }
  });

  // --- PrecioVenta Handlers ---
  ipcMain.handle('getPreciosVenta', async (_event: any, active: boolean) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      return await repo.find({ where: { activo: active } });
    } catch (error) {
      console.error('Error getting precios venta:', error);
      throw error;
    }
  }); 

  ipcMain.handle('getPrecioVenta', async (_event: any, id: number, active: boolean) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      return await repo.findOne({ where: { id, activo: active } });
    } catch (error) {
      console.error('Error getting precio venta:', error);
      throw error;
    }   
  });

  ipcMain.handle('getPreciosVentaByPresentacion', async (_event: any, presentacionId: number, active: boolean) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      return await repo.find({ where: { presentacionId, activo: active } });
    } catch (error) {
      console.error('Error getting precios venta por presentacion:', error);
      throw error;
    }
  });
  
  ipcMain.handle('getPreciosVentaByPresentacionSabor', async (_event: any, presentacionSaborId: number, active: boolean) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      return await repo.find({ where: { presentacionSaborId, activo: active } });
    } catch (error) {
      console.error('Error getting precios venta por presentacion sabor:', error);
      throw error;
    }
  });

  ipcMain.handle('createPrecioVenta', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const entity = repo.create(data);
      // No user tracking needed usually for prices
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
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
      const currentUser = getCurrentUser(); // Get current user at time of call
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
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
      const currentUser = getCurrentUser(); // Get current user at time of call
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting precio venta ID ${id}:`, error);
      throw error;
    }
  });
  
  // --- Search Handlers ---
  ipcMain.handle('searchProductos', async (_event: any, params: { 
    searchTerm: string, 
    page: number, 
    pageSize: number,
    exactMatch?: boolean
  }) => {
    try {
      // Add more detailed logging to help debug issues
      console.log('searchProductos called with params:', JSON.stringify(params));
      
      if (!params || typeof params !== 'object') {
        console.error('Invalid params received:', params);
        return { items: [], total: 0 };
      }
      
      // Ensure params object exists and has default values
      const page = Number(params.page || 1);
      const pageSize = Number(params.pageSize || 10);
      const exactMatch = Boolean(params.exactMatch || false);
      
      // Ensure searchTerm is a string and log what type we received
      console.log('searchTerm type:', typeof params.searchTerm);
      const searchTerm = typeof params.searchTerm === 'string' ? params.searchTerm : String(params.searchTerm || '');
      const skip = (page - 1) * pageSize;
      
      // Only uppercase if it's a non-empty string
      const searchTermUpper = searchTerm ? searchTerm.toUpperCase() : '';
      
      console.log('Using searchTerm:', searchTerm, 'Uppercase:', searchTermUpper);
      
      if (!searchTerm || searchTerm.trim() === '') {
        console.log('Empty search term, returning empty results');
        return { items: [], total: 0 };
      }

      // First try to find an exact match by código if exactMatch is true
      if (exactMatch) {
        const codigoRepo = dataSource.getRepository(Codigo);
        const matchingCodigos = await codigoRepo.find({
          where: { 
            codigo: searchTermUpper,
            activo: true 
          },
          relations: ['presentacion', 'presentacion.producto']
        });

        if (matchingCodigos.length > 0) {
          // Map to a unique list of products from the codes
          const productos = matchingCodigos
            .map(codigo => codigo.presentacion.producto)
            .filter((producto, index, self) => 
              producto.activo && 
              index === self.findIndex(p => p.id === producto.id)
            );

          // Get total count
          const total = productos.length;
          
          // Apply pagination manually since we're working with in-memory results
          const paginatedProductos = productos.slice(skip, skip + pageSize);
          
          // Enrich each product with principal data
          for (const producto of paginatedProductos) {
            await enrichProductWithPrincipalData(producto);
          }
          
          return { 
            items: paginatedProductos, 
            total,
            exactMatch: true
          };
        }
      }
      
      // If no exact codigo match or exactMatch is false, search by name
      const productoRepo = dataSource.getRepository(Producto);
      
      // Create query builder for more flexible querying
      const queryBuilder = productoRepo.createQueryBuilder('producto')
        .leftJoinAndSelect('producto.subcategoria', 'subcategoria')
        .leftJoinAndSelect('subcategoria.categoria', 'categoria')
        .where('producto.activo = :activo', { activo: true })
        .andWhere(
          '(UPPER(producto.nombre) LIKE :searchTerm OR UPPER(producto.nombreAlternativo) LIKE :searchTerm)',
          { searchTerm: `%${searchTermUpper}%` }
        )
        .orderBy('producto.nombre', 'ASC');
      
      // Get total count for pagination
      const total = await queryBuilder.getCount();
      
      // Apply pagination
      const productos = await queryBuilder
        .skip(skip)
        .take(pageSize)
        .getMany();
      
      // Enrich each product with principal data
      for (const producto of productos) {
        await enrichProductWithPrincipalData(producto);
      }
      
      return { 
        items: productos, 
        total,
        exactMatch: false
      };
    } catch (error) {
      console.error('Error searching productos:', error);
      throw error;
    }
  });

  // Also add a handler to search by codigo only (for barcode scanning)
  ipcMain.handle('searchProductosByCode', async (_event: any, code: string) => {
    try {
      // Log what we received to help debug
      if (code === undefined || code === null) {
        console.warn('searchProductosByCode received null/undefined code');
        return null;
      }
      
      // Ensure code is a string
      const searchCode = typeof code === 'string' ? code : String(code || '');
      
      if (!searchCode || searchCode.trim() === '') {
        return null;
      }

      const codigoRepo = dataSource.getRepository(Codigo);
      const matchingCodigo = await codigoRepo.findOne({
        where: { 
          codigo: searchCode.toUpperCase(),
          activo: true 
        },
        relations: ['presentacion', 'presentacion.producto']
      });

      if (matchingCodigo && matchingCodigo.presentacion.producto.activo) {
        const producto = matchingCodigo.presentacion.producto;
        await enrichPresentacionWithPrincipalData(matchingCodigo.presentacion);
        // await enrichProductWithPrincipalData(producto);
        return { 
          product: producto, 
          presentacion: matchingCodigo.presentacion 
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error searching producto by code:', error);
      throw error;
    }
  });

  // --- Observacion Handlers ---
  ipcMain.handle('getObservaciones', async () => {
    try {
      const repo = dataSource.getRepository(Observacion);
      return await repo.find({ order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting observaciones:', error);
      throw error;
    }
  });

  ipcMain.handle('getObservacion', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Observacion);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting observacion ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createObservacion', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Observacion);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating observacion:', error);
      throw error;
    }
  });

  ipcMain.handle('updateObservacion', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Observacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Observacion ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating observacion ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteObservacion', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Observacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Observacion ID ${id} not found`);
      
      // Check dependencies (ObservacionProducto) before deleting
      const obsProductoRepo = dataSource.getRepository(ObservacionProducto);
      const obsProductoCount = await obsProductoRepo.count({ where: { observacionId: id } });
      if (obsProductoCount > 0) {
        throw new Error(`No se puede eliminar la observación porque tiene ${obsProductoCount} productos asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting observacion ID ${id}:`, error);
      throw error;
    }
  });

  // --- ObservacionProducto Handlers ---
  ipcMain.handle('getObservacionesProductos', async () => {
    try {
      const repo = dataSource.getRepository(ObservacionProducto);
      return await repo.find({ 
        relations: ['producto', 'observacion'],
        order: { productoId: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting observaciones productos:', error);
      throw error;
    }
  });

  ipcMain.handle('getObservacionesProductosByProducto', async (_event: any, productoId: number) => {
    try {
      const repo = dataSource.getRepository(ObservacionProducto);
      return await repo.find({ 
        where: { productoId },
        relations: ['observacion'],
        order: { observacionId: 'ASC' } 
      });
    } catch (error) {
      console.error(`Error getting observaciones for producto ID ${productoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getObservacionProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ObservacionProducto);
      return await repo.findOne({ 
        where: { id },
        relations: ['producto', 'observacion'] 
      });
    } catch (error) {
      console.error(`Error getting observacion producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createObservacionProducto', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(ObservacionProducto);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating observacion producto:', error);
      throw error;
    }
  });

  ipcMain.handle('updateObservacionProducto', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(ObservacionProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ObservacionProducto ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating observacion producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteObservacionProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ObservacionProducto);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ObservacionProducto ID ${id} not found`);
      
      // Check dependencies (ObservacionProductoVentaItem) before deleting
      const obsProductoVentaItemRepo = dataSource.getRepository(ObservacionProductoVentaItem);
      const obsProductoVentaItemCount = await obsProductoVentaItemRepo.count({ where: { observacionProductoId: id } });
      if (obsProductoVentaItemCount > 0) {
        throw new Error(`No se puede eliminar la observación de producto porque tiene ${obsProductoVentaItemCount} items de venta asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting observacion producto ID ${id}:`, error);
      throw error;
    }
  });

  // --- ObservacionProductoVentaItem Handlers ---
  ipcMain.handle('getObservacionesProductosVentasItems', async (_event: any, ventaItemId: number) => {
    try {
      const repo = dataSource.getRepository(ObservacionProductoVentaItem);
      return await repo.find({ 
        where: { ventaItemId },
        relations: ['observacionProducto', 'observacionProducto.observacion'],
        order: { id: 'ASC' } 
      });
    } catch (error) {
      console.error(`Error getting observaciones for venta item ID ${ventaItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getObservacionProductoVentaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ObservacionProductoVentaItem);
      return await repo.findOne({ 
        where: { id },
        relations: ['observacionProducto', 'ventaItem', 'observacionProducto.observacion'] 
      });
    } catch (error) {
      console.error(`Error getting observacion producto venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createObservacionProductoVentaItem', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(ObservacionProductoVentaItem);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating observacion producto venta item:', error);
      throw error;
    }
  });

  ipcMain.handle('updateObservacionProductoVentaItem', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(ObservacionProductoVentaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ObservacionProductoVentaItem ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating observacion producto venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteObservacionProductoVentaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ObservacionProductoVentaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ObservacionProductoVentaItem ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting observacion producto venta item ID ${id}:`, error);
      throw error;
    }
  });

  // --- Adicional Handlers ---
  ipcMain.handle('getAdicionales', async () => {
    try {
      const repo = dataSource.getRepository(Adicional);
      return await repo.find({ 
        relations: ['ingrediente', 'receta'],
        order: { nombre: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting adicionales:', error);
      throw error;
    }
  });

  ipcMain.handle('getAdicionalesFiltered', async (_event: any, filters: {
    nombre?: string;
    ingredienteId?: number;
    recetaId?: number;
    activo?: boolean;
    pageIndex?: number;
    pageSize?: number;
  }) => {
    try {
      const repo = dataSource.getRepository(Adicional);
      const queryBuilder = repo.createQueryBuilder('adicional')
        .leftJoinAndSelect('adicional.ingrediente', 'ingrediente')
        .leftJoinAndSelect('adicional.receta', 'receta')
        .orderBy('adicional.nombre', 'ASC');
      
      // Apply filters
      if (filters.nombre) {
        queryBuilder.andWhere('adicional.nombre LIKE :nombre', { nombre: `%${filters.nombre}%` });
      }
      
      if (filters.ingredienteId !== undefined && filters.ingredienteId !== null) {
        queryBuilder.andWhere('adicional.ingredienteId = :ingredienteId', { ingredienteId: filters.ingredienteId });
      }
      
      if (filters.recetaId !== undefined && filters.recetaId !== null) {
        queryBuilder.andWhere('adicional.recetaId = :recetaId', { recetaId: filters.recetaId });
      }
      
      if (filters.activo !== undefined && filters.activo !== null) {
        queryBuilder.andWhere('adicional.activo = :activo', { activo: filters.activo });
      }
      
      // Get total count for pagination
      const total = await queryBuilder.getCount();
      
      // Apply pagination
      if (filters.pageIndex !== undefined && filters.pageSize !== undefined) {
        const skip = filters.pageIndex * filters.pageSize;
        queryBuilder.skip(skip).take(filters.pageSize);
      }
      
      // Execute the query
      const items = await queryBuilder.getMany();
      
      return { items, total };
    } catch (error) {
      console.error('Error getting filtered adicionales:', error);
      throw error;
    }
  });

  ipcMain.handle('getAdicional', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Adicional);
      return await repo.findOne({ 
        where: { id },
        relations: ['ingrediente', 'receta'] 
      });
    } catch (error) {
      console.error(`Error getting adicional ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createAdicional', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Adicional);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('updateAdicional', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Adicional);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Adicional ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating adicional ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteAdicional', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Adicional);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Adicional ID ${id} not found`);
      
      // Check dependencies (ProductoAdicional) before deleting
      const productoAdicionalRepo = dataSource.getRepository(ProductoAdicional);
      const productoAdicionalCount = await productoAdicionalRepo.count({ where: { adicionalId: id } });
      if (productoAdicionalCount > 0) {
        throw new Error(`No se puede eliminar el adicional porque tiene ${productoAdicionalCount} productos asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting adicional ID ${id}:`, error);
      throw error;
    }
  });

  // --- ProductoAdicional Handlers ---
  ipcMain.handle('getProductosAdicionales', async () => {
    try {
      const repo = dataSource.getRepository(ProductoAdicional);
      return await repo.find({ 
        relations: ['producto', 'adicional'],
        order: { productoId: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting productos adicionales:', error);
      throw error;
    }
  });

  ipcMain.handle('getProductosAdicionalesByProducto', async (_event: any, productoId: number) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicional);
      return await repo.find({ 
        where: { productoId },
        relations: ['adicional'],
        order: { adicionalId: 'ASC' } 
      });
    } catch (error) {
      console.error(`Error getting adicionales for producto ID ${productoId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getProductoAdicional', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicional);
      return await repo.findOne({ 
        where: { id },
        relations: ['producto', 'adicional'] 
      });
    } catch (error) {
      console.error(`Error getting producto adicional ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createProductoAdicional', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicional);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating producto adicional:', error);
      throw error;
    }
  });

  ipcMain.handle('updateProductoAdicional', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicional);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoAdicional ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating producto adicional ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteProductoAdicional', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicional);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoAdicional ID ${id} not found`);
      
      // Check dependencies (ProductoAdicionalVentaItem) before deleting
      const productoAdicionalVentaItemRepo = dataSource.getRepository(ProductoAdicionalVentaItem);
      const productoAdicionalVentaItemCount = await productoAdicionalVentaItemRepo.count({ where: { productoAdicionalId: id } });
      if (productoAdicionalVentaItemCount > 0) {
        throw new Error(`No se puede eliminar el adicional de producto porque tiene ${productoAdicionalVentaItemCount} items de venta asociados.`);
      }
      
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting producto adicional ID ${id}:`, error);
      throw error;
    }
  });

  // --- ProductoAdicionalVentaItem Handlers ---
  ipcMain.handle('getProductosAdicionalesVentasItems', async (_event: any, ventaItemId: number) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicionalVentaItem);
      return await repo.find({ 
        where: { ventaItemId },
        relations: ['productoAdicional', 'productoAdicional.adicional'],
        order: { id: 'ASC' } 
      });
    } catch (error) {
      console.error(`Error getting adicionales for venta item ID ${ventaItemId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getProductoAdicionalVentaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicionalVentaItem);
      return await repo.findOne({ 
        where: { id },
        relations: ['productoAdicional', 'ventaItem', 'productoAdicional.adicional'] 
      });
    } catch (error) {
      console.error(`Error getting producto adicional venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createProductoAdicionalVentaItem', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicionalVentaItem);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating producto adicional venta item:', error);
      throw error;
    }
  });

  ipcMain.handle('updateProductoAdicionalVentaItem', async (_event: any, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicionalVentaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoAdicionalVentaItem ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating producto adicional venta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('deleteProductoAdicionalVentaItem', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoAdicionalVentaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoAdicionalVentaItem ID ${id} not found`);
      return await repo.remove(entity);
    } catch (error) {
      console.error(`Error deleting producto adicional venta item ID ${id}:`, error);
      throw error;
    }
  });
} 