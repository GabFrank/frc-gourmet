"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProductosHandlers = void 0;
const electron_1 = require("electron");
const categoria_entity_1 = require("../../src/app/database/entities/productos/categoria.entity");
const subcategoria_entity_1 = require("../../src/app/database/entities/productos/subcategoria.entity");
const producto_entity_1 = require("../../src/app/database/entities/productos/producto.entity");
const presentacion_entity_1 = require("../../src/app/database/entities/productos/presentacion.entity");
const codigo_entity_1 = require("../../src/app/database/entities/productos/codigo.entity");
const sabor_entity_1 = require("../../src/app/database/entities/productos/sabor.entity");
const presentacion_sabor_entity_1 = require("../../src/app/database/entities/productos/presentacion-sabor.entity");
const receta_entity_1 = require("../../src/app/database/entities/productos/receta.entity");
const receta_item_entity_1 = require("../../src/app/database/entities/productos/receta-item.entity");
const ingrediente_entity_1 = require("../../src/app/database/entities/productos/ingrediente.entity");
const receta_variacion_entity_1 = require("../../src/app/database/entities/productos/receta-variacion.entity");
const receta_variacion_item_entity_1 = require("../../src/app/database/entities/productos/receta-variacion-item.entity");
const movimiento_stock_entity_1 = require("../../src/app/database/entities/productos/movimiento-stock.entity");
const entity_utils_1 = require("../utils/entity.utils");
function registerProductosHandlers(dataSource, getCurrentUser) {
    const currentUser = getCurrentUser(); // Get user for tracking
    // --- Categoria Handlers ---
    electron_1.ipcMain.handle('getCategorias', async () => {
        try {
            const repo = dataSource.getRepository(categoria_entity_1.Categoria);
            return await repo.find({ order: { posicion: 'ASC', nombre: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting categorias:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getCategoria', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(categoria_entity_1.Categoria);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting categoria ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createCategoria', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(categoria_entity_1.Categoria);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating categoria:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateCategoria', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(categoria_entity_1.Categoria);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Categoria ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating categoria ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteCategoria', async (_event, id) => {
        // Note: This is a hard delete. Consider soft delete (activo=false) if needed.
        try {
            const repo = dataSource.getRepository(categoria_entity_1.Categoria);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Categoria ID ${id} not found`);
            // Check dependencies (Subcategorias) before deleting
            const subcategoriaRepo = dataSource.getRepository(subcategoria_entity_1.Subcategoria);
            const subcategoriasCount = await subcategoriaRepo.count({ where: { categoriaId: id } });
            if (subcategoriasCount > 0) {
                throw new Error(`No se puede eliminar la categoría porque tiene ${subcategoriasCount} subcategorías asociadas.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting categoria ID ${id}:`, error);
            throw error;
        }
    });
    // --- Subcategoria Handlers ---
    electron_1.ipcMain.handle('getSubcategorias', async () => {
        try {
            const repo = dataSource.getRepository(subcategoria_entity_1.Subcategoria);
            return await repo.find({ relations: ['categoria'], order: { posicion: 'ASC', nombre: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting subcategorias:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getSubcategoria', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(subcategoria_entity_1.Subcategoria);
            return await repo.findOne({ where: { id }, relations: ['categoria'] });
        }
        catch (error) {
            console.error(`Error getting subcategoria ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getSubcategoriasByCategoria', async (_event, categoriaId) => {
        try {
            const repo = dataSource.getRepository(subcategoria_entity_1.Subcategoria);
            return await repo.find({ where: { categoriaId }, order: { posicion: 'ASC', nombre: 'ASC' } });
        }
        catch (error) {
            console.error(`Error getting subcategorias for categoria ID ${categoriaId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createSubcategoria', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(subcategoria_entity_1.Subcategoria);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating subcategoria:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateSubcategoria', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(subcategoria_entity_1.Subcategoria);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Subcategoria ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating subcategoria ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteSubcategoria', async (_event, id) => {
        // Note: Hard delete. Consider soft delete.
        try {
            const repo = dataSource.getRepository(subcategoria_entity_1.Subcategoria);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Subcategoria ID ${id} not found`);
            // Check dependencies (Productos) before deleting
            const productoRepo = dataSource.getRepository(producto_entity_1.Producto);
            const productosCount = await productoRepo.count({ where: { subcategoriaId: id } });
            if (productosCount > 0) {
                throw new Error(`No se puede eliminar la subcategoría porque tiene ${productosCount} productos asociados.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting subcategoria ID ${id}:`, error);
            throw error;
        }
    });
    // --- Producto Handlers ---
    electron_1.ipcMain.handle('getProductos', async () => {
        try {
            const repo = dataSource.getRepository(producto_entity_1.Producto);
            return await repo.find({ relations: ['subcategoria', 'subcategoria.categoria'], order: { nombre: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting productos:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getProducto', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(producto_entity_1.Producto);
            return await repo.findOne({ where: { id }, relations: ['subcategoria', 'subcategoria.categoria'] });
        }
        catch (error) {
            console.error(`Error getting producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getProductosBySubcategoria', async (_event, subcategoriaId) => {
        try {
            const repo = dataSource.getRepository(producto_entity_1.Producto);
            return await repo.find({ where: { subcategoriaId }, order: { nombre: 'ASC' } });
        }
        catch (error) {
            console.error(`Error getting productos for subcategoria ID ${subcategoriaId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createProducto', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(producto_entity_1.Producto);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating producto:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateProducto', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(producto_entity_1.Producto);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Producto ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteProducto', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(producto_entity_1.Producto);
            const presentacionRepo = dataSource.getRepository(presentacion_entity_1.Presentacion);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Producto ID ${id} not found`);
            // Attempt soft delete first by setting activo = false
            entity.activo = false;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            await repo.save(entity);
            console.log(`Producto ID ${id} marked as inactive.`);
            // Optionally: Consider also deactivating related Presentaciones
            const presentaciones = await presentacionRepo.find({ where: { productoId: id, activo: true } });
            for (const pres of presentaciones) {
                pres.activo = false;
                await (0, entity_utils_1.setEntityUserTracking)(dataSource, pres, currentUser?.id, true);
                await presentacionRepo.save(pres);
            }
            console.log(`Marked ${presentaciones.length} related presentaciones as inactive for Producto ID ${id}.`);
            return { success: true, deleted: false, deactivated: true }; // Indicate soft delete
        }
        catch (error) {
            console.error(`Error deactivating producto ID ${id}:`, error);
            // Attempt hard delete only if soft delete fails and specifically allowed
            // For now, just re-throw the error from the soft delete attempt
            throw error;
        }
    });
    // --- Presentacion Handlers ---
    electron_1.ipcMain.handle('getPresentacionesByProducto', async (_event, productoId) => {
        try {
            const repo = dataSource.getRepository(presentacion_entity_1.Presentacion);
            return await repo.find({ where: { productoId }, order: { principal: 'DESC', descripcion: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting presentaciones by producto:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPresentacion', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(presentacion_entity_1.Presentacion);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating presentacion:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePresentacion', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(presentacion_entity_1.Presentacion);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Presentacion ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating presentacion ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePresentacion', async (_event, id) => {
        // Note: Hard delete. Consider soft delete.
        try {
            const repo = dataSource.getRepository(presentacion_entity_1.Presentacion);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Presentacion ID ${id} not found`);
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
        }
        catch (error) {
            console.error(`Error deleting presentacion ID ${id}:`, error);
            throw error;
        }
    });
    // --- Codigo Handlers ---
    electron_1.ipcMain.handle('getCodigosByPresentacion', async (_event, presentacionId) => {
        try {
            const repo = dataSource.getRepository(codigo_entity_1.Codigo);
            return await repo.find({ where: { presentacionId }, order: { principal: 'DESC', codigo: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting codigos by presentacion:', error);
            throw error;
        }
    });
    // alsos return presentacion.producto
    electron_1.ipcMain.handle('getCodigos', async () => {
        try {
            const repo = dataSource.getRepository(codigo_entity_1.Codigo);
            return await repo.find({ order: { principal: 'DESC', codigo: 'ASC' }, relations: ['presentacion', 'presentacion.producto'] });
        }
        catch (error) {
            console.error('Error getting codigos:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createCodigo', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(codigo_entity_1.Codigo);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating codigo:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateCodigo', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(codigo_entity_1.Codigo);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Codigo ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating codigo ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteCodigo', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(codigo_entity_1.Codigo);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Codigo ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting codigo ID ${id}:`, error);
            throw error;
        }
    });
    // --- Sabor Handlers ---
    electron_1.ipcMain.handle('getSabores', async () => {
        try {
            const repo = dataSource.getRepository(sabor_entity_1.Sabor);
            return await repo.find({ order: { nombre: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting sabores:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getSabor', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(sabor_entity_1.Sabor);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting sabor ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createSabor', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(sabor_entity_1.Sabor);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating sabor:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateSabor', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(sabor_entity_1.Sabor);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Sabor ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating sabor ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteSabor', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(sabor_entity_1.Sabor);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Sabor ID ${id} not found`);
            // Add dependency checks (PresentacionSabor)
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting sabor ID ${id}:`, error);
            throw error;
        }
    });
    // --- PresentacionSabor Handlers ---
    electron_1.ipcMain.handle('getPresentacionSaboresByPresentacion', async (_event, presentacionId) => {
        try {
            const repo = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
            return await repo.find({ where: { presentacionId }, relations: ['sabor', 'receta', 'variacion'], order: { id: 'ASC' } });
        }
        catch (error) {
            console.error(`Error getting presentacion sabores for presentacion ID ${presentacionId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPresentacionSabor', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting presentacion sabor ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPresentacionSabor', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating presentacion sabor:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePresentacionSabor', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PresentacionSabor ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating presentacion sabor ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePresentacionSabor', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PresentacionSabor ID ${id} not found`);
            // Add dependency checks (e.g., PrecioVenta specific to sabor)
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting presentacion sabor ID ${id}:`, error);
            throw error;
        }
    });
    // --- Receta Handlers ---
    electron_1.ipcMain.handle('getRecetas', async () => {
        try {
            const repo = dataSource.getRepository(receta_entity_1.Receta);
            return await repo.find({ order: { nombre: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting recetas:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getReceta', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(receta_entity_1.Receta);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting receta ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createReceta', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(receta_entity_1.Receta);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating receta:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateReceta', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(receta_entity_1.Receta);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Receta ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating receta ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteReceta', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(receta_entity_1.Receta);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Receta ID ${id} not found`);
            // Add dependency checks (RecetaItem, PresentacionSabor, RecetaVariacion)
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting receta ID ${id}:`, error);
            throw error;
        }
    });
    // --- RecetaItem Handlers ---
    electron_1.ipcMain.handle('getRecetaItems', async (_event, recetaId) => {
        try {
            const repo = dataSource.getRepository(receta_item_entity_1.RecetaItem);
            return await repo.find({ where: { recetaId }, relations: ['ingrediente'], order: { id: 'ASC' } });
        }
        catch (error) {
            console.error(`Error getting receta items for receta ID ${recetaId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getRecetaItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(receta_item_entity_1.RecetaItem);
            return await repo.findOne({ where: { id }, relations: ['ingrediente'] }); // Include relation
        }
        catch (error) {
            console.error(`Error getting receta item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createRecetaItem', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(receta_item_entity_1.RecetaItem);
            const entity = repo.create(data);
            // No user tracking on items usually, but can be added if needed
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating receta item:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateRecetaItem', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(receta_item_entity_1.RecetaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`RecetaItem ID ${id} not found`);
            repo.merge(entity, data);
            // No user tracking on items usually
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating receta item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteRecetaItem', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(receta_item_entity_1.RecetaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`RecetaItem ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting receta item ID ${id}:`, error);
            throw error;
        }
    });
    // --- Ingrediente Handlers ---
    electron_1.ipcMain.handle('getIngredientes', async () => {
        try {
            const repo = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
            return await repo.find({ order: { descripcion: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting ingredientes:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getIngrediente', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting ingrediente ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createIngrediente', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating ingrediente:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateIngrediente', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Ingrediente ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating ingrediente ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteIngrediente', async (_event, id) => {
        // Note: Hard delete. Consider soft delete.
        try {
            const repo = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Ingrediente ID ${id} not found`);
            // Add dependency checks (RecetaItem, RecetaVariacionItem, CompraDetalle etc.)
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting ingrediente ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('searchIngredientesByDescripcion', async (_event, searchText) => {
        try {
            const repo = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
            if (!searchText || searchText.trim() === '') {
                return await repo.find({ order: { descripcion: 'ASC' }, take: 10 });
            }
            return await repo.createQueryBuilder('ingrediente')
                .where('LOWER(ingrediente.descripcion) LIKE LOWER(:searchText)', { searchText: `%${searchText}%` })
                .orWhere('CAST(ingrediente.id AS TEXT) LIKE :searchText', { searchText: `%${searchText}%` })
                .orderBy('ingrediente.descripcion', 'ASC')
                .getMany();
        }
        catch (error) {
            console.error('Error searching ingredientes:', error);
            throw error;
        }
    });
    // --- RecetaVariacion Handlers ---
    electron_1.ipcMain.handle('getRecetaVariaciones', async (_event, recetaId) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
            return await repo.find({ where: { recetaId }, order: { nombre: 'ASC' } });
        }
        catch (error) {
            console.error(`Error getting variations for recipe ID ${recetaId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getRecetaVariacion', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting variation ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createRecetaVariacion', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating recipe variation:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateRecetaVariacion', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`RecetaVariacion ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating recipe variation ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteRecetaVariacion', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`RecetaVariacion ID ${id} not found`);
            // Add dependency checks (RecetaVariacionItem, PresentacionSabor)
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting recipe variation ID ${id}:`, error);
            throw error;
        }
    });
    // --- RecetaVariacionItem Handlers ---
    electron_1.ipcMain.handle('getRecetaVariacionItems', async (_event, variacionId) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
            return await repo.find({ where: { variacionId }, relations: ['ingrediente'] });
        }
        catch (error) {
            console.error(`Error getting items for recipe variation ID ${variacionId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getRecetaVariacionItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
            return await repo.findOne({ where: { id }, relations: ['ingrediente'] }); // Include relation
        }
        catch (error) {
            console.error(`Error getting recipe variation item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createRecetaVariacionItem', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
            const entity = repo.create(data);
            // No user tracking on items usually
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating recipe variation item:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateRecetaVariacionItem', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`RecetaVariacionItem ID ${id} not found`);
            repo.merge(entity, data);
            // No user tracking on items usually
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating recipe variation item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteRecetaVariacionItem', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`RecetaVariacionItem ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting recipe variation item ID ${id}:`, error);
            throw error;
        }
    });
    // --- MovimientoStock Handlers ---
    electron_1.ipcMain.handle('getMovimientosStock', async () => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            return await repo.find({
                relations: ['producto', 'ingrediente'],
                where: { activo: true },
                order: { createdAt: 'DESC' }
            });
        }
        catch (error) {
            console.error('Error getting movimientos stock:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getMovimientoStock', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            return await repo.findOne({
                where: { id },
                relations: ['producto', 'ingrediente']
            });
        }
        catch (error) {
            console.error(`Error getting movimiento stock ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getMovimientosStockByProducto', async (_event, productoId) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            return await repo.find({
                where: { productoId, activo: true },
                order: { createdAt: 'DESC' }
            });
        }
        catch (error) {
            console.error(`Error getting movimientos stock for producto ID ${productoId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getMovimientosStockByIngrediente', async (_event, ingredienteId) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            return await repo.find({
                where: { ingredienteId, activo: true },
                order: { createdAt: 'DESC' }
            });
        }
        catch (error) {
            console.error(`Error getting movimientos stock for ingrediente ID ${ingredienteId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getMovimientosStockByTipoReferencia', async (_event, tipoReferencia) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            return await repo.find({
                where: { tipoReferencia, activo: true },
                relations: ['producto', 'ingrediente'],
                order: { createdAt: 'DESC' }
            });
        }
        catch (error) {
            console.error(`Error getting movimientos stock for tipo referencia ${tipoReferencia}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getMovimientosStockByReferenciaAndTipo', async (_event, referencia, tipoReferencia) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            return await repo.find({
                where: {
                    referencia,
                    tipoReferencia,
                    activo: true
                },
                relations: ['producto', 'ingrediente'],
                order: { createdAt: 'DESC' }
            });
        }
        catch (error) {
            console.error(`Error getting movimientos stock for referencia ${referencia} and tipo ${tipoReferencia}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getCurrentStockByProducto', async (_event, productoId) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            // Get the most recent active stock movement for this product
            const movimiento = await repo.findOne({
                where: { productoId, activo: true },
                order: { createdAt: 'DESC' }
            });
            return movimiento || { cantidadActual: 0 };
        }
        catch (error) {
            console.error(`Error getting current stock for producto ID ${productoId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getCurrentStockByIngrediente', async (_event, ingredienteId) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            // Get the most recent active stock movement for this ingredient
            const movimiento = await repo.findOne({
                where: { ingredienteId, activo: true },
                order: { createdAt: 'DESC' }
            });
            return movimiento || { cantidadActual: 0 };
        }
        catch (error) {
            console.error(`Error getting current stock for ingrediente ID ${ingredienteId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createMovimientoStock', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating movimiento stock:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateMovimientoStock', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`MovimientoStock ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating movimiento stock ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteMovimientoStock', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(movimiento_stock_entity_1.MovimientoStock);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`MovimientoStock ID ${id} not found`);
            // Attempt soft delete by setting activo = false
            entity.activo = false;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            await repo.save(entity);
            console.log(`MovimientoStock ID ${id} marked as inactive.`);
            return { success: true, deactivated: true };
        }
        catch (error) {
            console.error(`Error deactivating movimiento stock ID ${id}:`, error);
            throw error;
        }
    });
}
exports.registerProductosHandlers = registerProductosHandlers;
//# sourceMappingURL=productos.handler.js.map