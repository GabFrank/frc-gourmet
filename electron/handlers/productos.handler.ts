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

export function registerProductosHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  const currentUser = getCurrentUser(); // Get user for tracking

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
      return await repo.find({ relations: ['subcategoria', 'subcategoria.categoria'], order: { nombre: 'ASC' } });
    } catch (error) {
      console.error('Error getting productos:', error);
      throw error;
    }
  });

  ipcMain.handle('getProducto', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Producto);
      return await repo.findOne({ where: { id }, relations: ['subcategoria', 'subcategoria.categoria'] });
    } catch (error) {
      console.error(`Error getting producto ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('getProductosBySubcategoria', async (_event: any, subcategoriaId: number) => {
    try {
      const repo = dataSource.getRepository(Producto);
      return await repo.find({ where: { subcategoriaId }, order: { nombre: 'ASC' } });
    } catch (error) {
      console.error(`Error getting productos for subcategoria ID ${subcategoriaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('createProducto', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Producto);
      const entity = repo.create(data);
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

  ipcMain.handle('createCodigo', async (_event: any, data: any) => {
    try {
      const repo = dataSource.getRepository(Codigo);
      const entity = repo.create(data);
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
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      console.log(`MovimientoStock ID ${id} marked as inactive.`);
      
      return { success: true, deactivated: true };
    } catch (error) {
      console.error(`Error deactivating movimiento stock ID ${id}:`, error);
      throw error;
    }
  });

} 