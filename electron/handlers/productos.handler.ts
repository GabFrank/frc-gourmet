import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { DataSource, Like, Not } from 'typeorm';
import { setEntityUserTracking } from '../utils/entity.utils';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

// Import new product entities
import { ProductoBase } from '../../src/app/database/entities/productos/core/producto-base.entity';
import { UnidadMedida } from '../../src/app/database/entities/productos/core/unidad-medida.entity';
import { Ingrediente } from '../../src/app/database/entities/productos/core/ingrediente.entity';
import { ProductoVariacion } from '../../src/app/database/entities/productos/variaciones/producto-variacion.entity';
import { Receta } from '../../src/app/database/entities/productos/recetas/receta.entity';
import { RecetaItem } from '../../src/app/database/entities/productos/recetas/receta-item.entity';
import { ProductoPresentacion } from '../../src/app/database/entities/productos/comercial/producto-presentacion.entity';
import { PrecioVenta } from '../../src/app/database/entities/productos/comercial/precio-venta.entity';
import { Combo } from '../../src/app/database/entities/productos/comercial/combo.entity';
import { ComboItem } from '../../src/app/database/entities/productos/comercial/combo-item.entity';
import { Observacion } from '../../src/app/database/entities/productos/observaciones/observacion.entity';

export function registerProductosHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  
  // === UnidadMedida Handlers ===
  
  ipcMain.handle('productos:getUnidadesMedida', async () => {
    try {
      const repo = dataSource.getRepository(UnidadMedida);
      return await repo.find({ 
        where: { activo: true },
        order: { categoria: 'ASC', nombre: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting unidades medida:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:getUnidadMedida', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(UnidadMedida);
      return await repo.findOneBy({ id });
    } catch (error) {
      console.error(`Error getting unidad medida ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createUnidadMedida', async (_event: any, data: Partial<UnidadMedida>) => {
    try {
      const repo = dataSource.getRepository(UnidadMedida);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating unidad medida:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateUnidadMedida', async (_event: any, id: number, data: Partial<UnidadMedida>) => {
    try {
      const repo = dataSource.getRepository(UnidadMedida);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`UnidadMedida ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating unidad medida ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteUnidadMedida', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(UnidadMedida);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`UnidadMedida ID ${id} not found`);
      
      // Check dependencies before deleting
      const ingredienteRepo = dataSource.getRepository(Ingrediente);
      const ingredientesCount = await ingredienteRepo.count({ where: { unidadMedidaId: id } });
      if (ingredientesCount > 0) {
        throw new Error(`No se puede eliminar la unidad de medida porque tiene ${ingredientesCount} ingredientes asociados.`);
      }
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting unidad medida ID ${id}:`, error);
      throw error;
    }
  });

  // === ProductoBase Handlers ===
  
  ipcMain.handle('productos:getProductosBase', async () => {
    try {
      const repo = dataSource.getRepository(ProductoBase);
      return await repo.find({ 
        where: { activo: true },
        relations: ['subcategoria', 'images'],
        order: { nombre: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting productos base:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:getProductoBase', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoBase);
      return await repo.findOne({ 
        where: { id },
        relations: ['subcategoria', 'images']
      });
    } catch (error) {
      console.error(`Error getting producto base ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createProductoBase', async (_event: any, data: Partial<ProductoBase>) => {
    try {
      const repo = dataSource.getRepository(ProductoBase);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating producto base:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateProductoBase', async (_event: any, id: number, data: Partial<ProductoBase>) => {
    try {
      const repo = dataSource.getRepository(ProductoBase);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoBase ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating producto base ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteProductoBase', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoBase);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoBase ID ${id} not found`);
      
      // Check dependencies before deleting
      const presentacionRepo = dataSource.getRepository(ProductoPresentacion);
      const presentacionesCount = await presentacionRepo.count({ where: { productoBaseId: id } });
      if (presentacionesCount > 0) {
        throw new Error(`No se puede eliminar el producto porque tiene ${presentacionesCount} presentaciones asociadas.`);
      }
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting producto base ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:searchProductosBaseByDescripcion', async (_event: any, searchTerm: string, page: number, pageSize: number, exactMatch: boolean) => {
    try {
      const repo = dataSource.getRepository(ProductoBase);
      const query = repo.createQueryBuilder('productoBase');
      query.where('productoBase.activo = :activo', { activo: true });
      if (exactMatch) {
        query.andWhere('productoBase.descripcion = :descripcion', { descripcion: searchTerm });
      } else {
        query.andWhere('productoBase.descripcion LIKE :searchTerm', { searchTerm: `%${searchTerm}%` });
      }
      query.orderBy('productoBase.nombre', 'ASC');
      query.skip((page - 1) * pageSize);
      query.take(pageSize);
      const [items, total] = await query.getManyAndCount();
      return { items, total };
    } catch (error) {
      console.error(`Error searching productos base by descripcion:`, error);
      throw error;
    }
  });

  // === Ingrediente (Nuevo) Handlers ===
  
  ipcMain.handle('productos:getIngredientesNuevo', async () => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      return await repo.find({ 
        where: { activo: true },
        relations: ['productoBase', 'unidadMedida', 'moneda', 'recetaElaboracion'],
        order: { productoBase: { nombre: 'ASC' } } 
      });
    } catch (error) {
      console.error('Error getting ingredientes nuevo:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:getIngredienteNuevo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      return await repo.findOne({ 
        where: { id },
        relations: ['productoBase', 'unidadMedida', 'moneda', 'recetaElaboracion']
      });
    } catch (error) {
      console.error(`Error getting ingrediente nuevo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createIngredienteNuevo', async (_event: any, data: Partial<Ingrediente>) => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating ingrediente nuevo:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateIngredienteNuevo', async (_event: any, id: number, data: Partial<Ingrediente>) => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Ingrediente ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating ingrediente nuevo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteIngredienteNuevo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Ingrediente);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Ingrediente ID ${id} not found`);
      
      // Check dependencies before deleting
      const recetaItemRepo = dataSource.getRepository(RecetaItem);
      const recetaItemsCount = await recetaItemRepo.count({ where: { ingredienteId: id } });
      if (recetaItemsCount > 0) {
        throw new Error(`No se puede eliminar el ingrediente porque está siendo usado en ${recetaItemsCount} recetas.`);
      }
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting ingrediente nuevo ID ${id}:`, error);
      throw error;
    }
  });

  // === ProductoVariacion Handlers ===
  
  ipcMain.handle('productos:getProductosVariaciones', async () => {
    try {
      const repo = dataSource.getRepository(ProductoVariacion);
      return await repo.find({ 
        where: { activo: true },
        relations: ['productoBase', 'receta'],
        order: { productoBase: { nombre: 'ASC' }, orden: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting productos variaciones:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:getProductoVariacion', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoVariacion);
      return await repo.findOne({ 
        where: { id },
        relations: ['productoBase', 'receta']
      });
    } catch (error) {
      console.error(`Error getting producto variacion ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:getProductosVariacionesByProductoBase', async (_event: any, productoBaseId: number) => {
    try {
      const repo = dataSource.getRepository(ProductoVariacion);
      return await repo.find({ 
        where: { productoBaseId, activo: true },
        relations: ['receta'],
        order: { orden: 'ASC', nombre: 'ASC' } 
      });
    } catch (error) {
      console.error(`Error getting variaciones for producto base ID ${productoBaseId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createProductoVariacion', async (_event: any, data: Partial<ProductoVariacion>) => {
    try {
      const repo = dataSource.getRepository(ProductoVariacion);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating producto variacion:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateProductoVariacion', async (_event: any, id: number, data: Partial<ProductoVariacion>) => {
    try {
      const repo = dataSource.getRepository(ProductoVariacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoVariacion ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating producto variacion ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteProductoVariacion', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoVariacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoVariacion ID ${id} not found`);
      
      // Check dependencies before deleting
      const presentacionRepo = dataSource.getRepository(ProductoPresentacion);
      const presentacionesCount = await presentacionRepo.count({ 
        where: [
          { variacionTamañoId: id },
          { variacionSaborId: id }
        ]
      });
      if (presentacionesCount > 0) {
        throw new Error(`No se puede eliminar la variación porque está siendo usada en ${presentacionesCount} presentaciones.`);
      }
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting producto variacion ID ${id}:`, error);
      throw error;
    }
  });

  // === Receta (Nueva) Handlers ===
  
  ipcMain.handle('productos:getRecetasNueva', async () => {
    try {
      const repo = dataSource.getRepository(Receta);
      return await repo.find({ 
        where: { activo: true },
        relations: ['productoBase', 'unidadMedidaSalida', 'items'],
        order: { nombre: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting recetas nueva:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:getRecetaNueva', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Receta);
      return await repo.findOne({ 
        where: { id },
        relations: ['productoBase', 'unidadMedidaSalida', 'items', 'items.ingrediente', 'items.unidadMedida']
      });
    } catch (error) {
      console.error(`Error getting receta nueva ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createRecetaNueva', async (_event: any, data: Partial<Receta>) => {
    try {
      const repo = dataSource.getRepository(Receta);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating receta nueva:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateRecetaNueva', async (_event: any, id: number, data: Partial<Receta>) => {
    try {
      const repo = dataSource.getRepository(Receta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Receta ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating receta nueva ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteRecetaNueva', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Receta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Receta ID ${id} not found`);
      
      // Check dependencies before deleting
      const presentacionRepo = dataSource.getRepository(ProductoPresentacion);
      const presentacionesCount = await presentacionRepo.count({ 
        where: [
          { recetaId: id },
          { recetaPackagingId: id }
        ]
      });
      if (presentacionesCount > 0) {
        throw new Error(`No se puede eliminar la receta porque está siendo usada en ${presentacionesCount} presentaciones.`);
      }
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting receta nueva ID ${id}:`, error);
      throw error;
    }
  });

  // === RecetaItem (Nueva) Handlers ===
  
  ipcMain.handle('productos:getRecetaItemsNueva', async (_event: any, recetaId: number) => {
    try {
      const repo = dataSource.getRepository(RecetaItem);
      return await repo.find({ 
        where: { recetaId, activo: true },
        relations: ['ingrediente', 'ingrediente.productoBase', 'unidadMedida'],
        order: { orden: 'ASC' } 
      });
    } catch (error) {
      console.error(`Error getting receta items for receta ID ${recetaId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:getRecetaItemNueva', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(RecetaItem);
      return await repo.findOne({ 
        where: { id },
        relations: ['receta', 'ingrediente', 'ingrediente.productoBase', 'unidadMedida']
      });
    } catch (error) {
      console.error(`Error getting receta item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createRecetaItemNueva', async (_event: any, data: Partial<RecetaItem>) => {
    try {
      const repo = dataSource.getRepository(RecetaItem);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating receta item nueva:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateRecetaItemNueva', async (_event: any, id: number, data: Partial<RecetaItem>) => {
    try {
      const repo = dataSource.getRepository(RecetaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`RecetaItem ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating receta item nueva ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteRecetaItemNueva', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(RecetaItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`RecetaItem ID ${id} not found`);
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting receta item nueva ID ${id}:`, error);
      throw error;
    }
  });

  // === ProductoPresentacion Handlers ===
  
  ipcMain.handle('productos:getProductosPresentaciones', async () => {
    try {
      const repo = dataSource.getRepository(ProductoPresentacion);
      return await repo.find({ 
        where: { activo: true },
        relations: ['productoBase', 'variacionTamaño', 'variacionSabor', 'unidadMedida', 'receta', 'recetaPackaging', 'precios'],
        order: { productoBase: { nombre: 'ASC' } } 
      });
    } catch (error) {
      console.error('Error getting productos presentaciones:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:getProductoPresentacion', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoPresentacion);
      return await repo.findOne({ 
        where: { id },
        relations: ['productoBase', 'variacionTamaño', 'variacionSabor', 'unidadMedida', 'receta', 'recetaPackaging', 'precios', 'codigos']
      });
    } catch (error) {
      console.error(`Error getting producto presentacion ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:getProductosPresentacionesByProductoBase', async (_event: any, productoBaseId: number) => {
    try {
      const repo = dataSource.getRepository(ProductoPresentacion);
      return await repo.find({ 
        where: { productoBaseId, activo: true },
        relations: ['variacionTamaño', 'variacionSabor', 'unidadMedida', 'precios'],
        order: { principal: 'DESC', nombre: 'ASC' } 
      });
    } catch (error) {
      console.error(`Error getting presentaciones for producto base ID ${productoBaseId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createProductoPresentacion', async (_event: any, data: Partial<ProductoPresentacion>) => {
    try {
      const repo = dataSource.getRepository(ProductoPresentacion);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating producto presentacion:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateProductoPresentacion', async (_event: any, id: number, data: Partial<ProductoPresentacion>) => {
    try {
      const repo = dataSource.getRepository(ProductoPresentacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoPresentacion ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating producto presentacion ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteProductoPresentacion', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ProductoPresentacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ProductoPresentacion ID ${id} not found`);
      
      // Check dependencies before deleting
      const comboItemRepo = dataSource.getRepository(ComboItem);
      const comboItemsCount = await comboItemRepo.count({ where: { productoPresentacionId: id } });
      if (comboItemsCount > 0) {
        throw new Error(`No se puede eliminar la presentación porque está siendo usada en ${comboItemsCount} combos.`);
      }
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting producto presentacion ID ${id}:`, error);
      throw error;
    }
  });

  // === Combo (Nuevo) Handlers ===
  
  ipcMain.handle('productos:getCombosNuevo', async () => {
    try {
      const repo = dataSource.getRepository(Combo);
      return await repo.find({ 
        where: { activo: true },
        relations: ['productoBase', 'items', 'items.presentacion'],
        order: { nombre: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting combos nuevo:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:getComboNuevo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Combo);
      return await repo.findOne({ 
        where: { id },
        relations: ['productoBase', 'items', 'items.presentacion', 'items.presentacion.productoBase']
      });
    } catch (error) {
      console.error(`Error getting combo nuevo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createComboNuevo', async (_event: any, data: Partial<Combo>) => {
    try {
      const repo = dataSource.getRepository(Combo);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating combo nuevo:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateComboNuevo', async (_event: any, id: number, data: Partial<Combo>) => {
    try {
      const repo = dataSource.getRepository(Combo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Combo ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating combo nuevo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteComboNuevo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Combo);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Combo ID ${id} not found`);
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting combo nuevo ID ${id}:`, error);
      throw error;
    }
  });

  // === ComboItem (Nuevo) Handlers ===
  
  ipcMain.handle('productos:getComboItemsNuevo', async (_event: any, comboId: number) => {
    try {
      const repo = dataSource.getRepository(ComboItem);
      return await repo.find({ 
        where: { comboId, activo: true },
        relations: ['presentacion', 'presentacion.productoBase'],
        order: { orden: 'ASC' } 
      });
    } catch (error) {
      console.error(`Error getting combo items for combo ID ${comboId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:getComboItemNuevo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ComboItem);
      return await repo.findOne({ 
        where: { id: id },
        relations: ['combo', 'presentacion', 'presentacion.productoBase']
      });
    } catch (error) {
      console.error(`Error getting combo item ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createComboItemNuevo', async (_event: any, data: Partial<ComboItem>) => {
    try {
      const repo = dataSource.getRepository(ComboItem);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating combo item nuevo:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateComboItemNuevo', async (_event: any, id: number, data: Partial<ComboItem>) => {
    try {
      const repo = dataSource.getRepository(ComboItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ComboItem ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating combo item nuevo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteComboItemNuevo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(ComboItem);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`ComboItem ID ${id} not found`);
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting combo item nuevo ID ${id}:`, error);
      throw error;
    }
  });

  // === Observacion (Nueva) Handlers ===
  
  ipcMain.handle('productos:getObservacionesNueva', async () => {
    try {
      const repo = dataSource.getRepository(Observacion);
      return await repo.find({ 
        where: { activo: true },
        relations: ['moneda', 'receta'],
        order: { orden: 'ASC', nombre: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting observaciones nueva:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:getObservacionNueva', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Observacion);
      return await repo.findOne({ 
        where: { id },
        relations: ['moneda', 'receta']
      });
    } catch (error) {
      console.error(`Error getting observacion nueva ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createObservacionNueva', async (_event: any, data: Partial<Observacion>) => {
    try {
      const repo = dataSource.getRepository(Observacion);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating observacion nueva:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updateObservacionNueva', async (_event: any, id: number, data: Partial<Observacion>) => {
    try {
      const repo = dataSource.getRepository(Observacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Observacion ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating observacion nueva ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deleteObservacionNueva', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(Observacion);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`Observacion ID ${id} not found`);
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting observacion nueva ID ${id}:`, error);
      throw error;
    }
  });

  // === PrecioVenta (Nuevo) Handlers ===
  
  ipcMain.handle('productos:getPreciosVentaNuevo', async () => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      return await repo.find({ 
        where: { activo: true },
        relations: ['presentacion', 'combo', 'moneda', 'tipoPrecio'],
        order: { valor: 'ASC' } 
      });
    } catch (error) {
      console.error('Error getting precios venta nuevo:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:getPrecioVentaNuevo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      return await repo.findOne({ 
        where: { id },
        relations: ['presentacion', 'combo', 'moneda', 'tipoPrecio']
      });
    } catch (error) {
      console.error(`Error getting precio venta nuevo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:createPrecioVentaNuevo', async (_event: any, data: Partial<PrecioVenta>) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const entity = repo.create(data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating precio venta nuevo:', error);
      throw error;
    }
  });

  ipcMain.handle('productos:updatePrecioVentaNuevo', async (_event: any, id: number, data: Partial<PrecioVenta>) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PrecioVenta ID ${id} not found`);
      repo.merge(entity, data);
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      return await repo.save(entity);
    } catch (error) {
      console.error(`Error updating precio venta nuevo ID ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('productos:deletePrecioVentaNuevo', async (_event: any, id: number) => {
    try {
      const repo = dataSource.getRepository(PrecioVenta);
      const entity = await repo.findOneBy({ id });
      if (!entity) throw new Error(`PrecioVenta ID ${id} not found`);
      
      // Soft delete
      entity.activo = false;
      const currentUser = getCurrentUser();
      await setEntityUserTracking(dataSource, entity, currentUser?.id, true);
      await repo.save(entity);
      return true;
    } catch (error) {
      console.error(`Error deleting precio venta nuevo ID ${id}:`, error);
      throw error;
    }
  });

  console.log('Productos handlers (Nueva Arquitectura) registered successfully');
} 