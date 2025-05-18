"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerProductosHandlers = void 0;
const electron_1 = require("electron");
const typeorm_1 = require("typeorm");
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
const precio_venta_entity_1 = require("../../src/app/database/entities/productos/precio-venta.entity");
const observacion_entity_1 = require("../../src/app/database/entities/productos/observacion.entity");
const observacion_producto_entity_1 = require("../../src/app/database/entities/productos/observacion-producto.entity");
const observacion_producto_venta_item_entity_1 = require("../../src/app/database/entities/productos/observacion-producto-venta-item.entity");
const adicional_entity_1 = require("../../src/app/database/entities/productos/adicional.entity");
const producto_adicional_entity_1 = require("../../src/app/database/entities/productos/producto-adicional.entity");
const producto_adicional_venta_item_entity_1 = require("../../src/app/database/entities/productos/producto-adicional-venta-item.entity");
const costo_por_producto_entity_1 = require("../../src/app/database/entities/productos/costo-por-producto.entity");
const moneda_entity_1 = require("../../src/app/database/entities/financiero/moneda.entity");
const moneda_cambio_entity_1 = require("../../src/app/database/entities/financiero/moneda-cambio.entity");
function registerProductosHandlers(dataSource, getCurrentUser) {
    // Helper function to enrich products with principal presentation and price information
    async function enrichProductWithPrincipalData(producto) {
        // Find principal presentation
        const presentacionRepo = dataSource.getRepository(presentacion_entity_1.Presentacion);
        const principalPresentacion = await presentacionRepo.findOne({
            where: { productoId: producto.id, principal: true, activo: true }
        });
        if (principalPresentacion) {
            // Add principal presentation to producto
            producto.principalPresentacion = principalPresentacion;
            // Find principal price for this presentation
            const precioVentaRepo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
            const principalPrecio = await precioVentaRepo.findOne({
                where: { presentacionId: principalPresentacion.id, principal: true, activo: true },
                relations: ['moneda']
            });
            if (principalPrecio) {
                // Add principal price to producto
                producto.principalPrecio = principalPrecio;
            }
        }
    }
    async function enrichPresentacionWithPrincipalData(presentacion) {
        const precioVentaRepo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
        const principalPrecio = await precioVentaRepo.findOne({
            where: { presentacionId: presentacion.id, principal: true, activo: true },
            relations: ['moneda']
        });
        if (principalPrecio) {
            presentacion.principalPrecio = principalPrecio;
        }
    }
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const productos = await repo.find({ relations: ['subcategoria', 'subcategoria.categoria', 'recetaVariacion', 'recetaVariacion.receta'], order: { nombre: 'ASC' } });
            // Enrich each product with principal data
            for (const producto of productos) {
                await enrichProductWithPrincipalData(producto);
            }
            return productos;
        }
        catch (error) {
            console.error('Error getting productos:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getProducto', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(producto_entity_1.Producto);
            const producto = await repo.findOne({ where: { id }, relations: ['subcategoria', 'subcategoria.categoria', 'recetaVariacion', 'recetaVariacion.receta'] });
            if (producto) {
                await enrichProductWithPrincipalData(producto);
            }
            return producto;
        }
        catch (error) {
            console.error(`Error getting producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getProductosBySubcategoria', async (_event, subcategoriaId) => {
        try {
            const repo = dataSource.getRepository(producto_entity_1.Producto);
            const productos = await repo.find({ where: { subcategoriaId }, order: { nombre: 'ASC' } });
            // Enrich each product with principal data
            for (const producto of productos) {
                await enrichProductWithPrincipalData(producto);
            }
            return productos;
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
            console.log('currentUser', currentUser);
            // if currentuser is null throw error
            if (!currentUser)
                throw new Error('No current user found');
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating presentacion ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePresentacion', async (_event, id) => {
        try {
            // Get repositories
            const presentacionRepo = dataSource.getRepository(presentacion_entity_1.Presentacion);
            const precioVentaRepo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
            const codigoRepo = dataSource.getRepository(codigo_entity_1.Codigo);
            const presentacionSaborRepo = dataSource.getRepository(presentacion_sabor_entity_1.PresentacionSabor);
            const productoAdicionalRepo = dataSource.getRepository(producto_adicional_entity_1.ProductoAdicional);
            // Find the presentacion
            const entity = await presentacionRepo.findOneBy({ id });
            if (!entity)
                throw new Error(`Presentacion ID ${id} not found`);
            // Start a transaction to ensure atomicity
            await dataSource.transaction(async (transactionalEntityManager) => {
                console.log(`Starting cascade deletion for Presentacion ID ${id}`);
                // 1. Delete all related PrecioVenta records
                const preciosVenta = await precioVentaRepo.find({ where: { presentacionId: id } });
                if (preciosVenta.length > 0) {
                    console.log(`Deleting ${preciosVenta.length} related PrecioVenta records`);
                    await transactionalEntityManager.remove(preciosVenta);
                }
                // 2. Delete all related Codigo records
                const codigos = await codigoRepo.find({ where: { presentacionId: id } });
                if (codigos.length > 0) {
                    console.log(`Deleting ${codigos.length} related Codigo records`);
                    await transactionalEntityManager.remove(codigos);
                }
                // 3. Delete all related PresentacionSabor records
                const presentacionSabores = await presentacionSaborRepo.find({ where: { presentacionId: id } });
                if (presentacionSabores.length > 0) {
                    console.log(`Deleting ${presentacionSabores.length} related PresentacionSabor records`);
                    await transactionalEntityManager.remove(presentacionSabores);
                }
                // 4. Delete all related ProductoAdicional records
                const productosAdicionales = await productoAdicionalRepo.find({ where: { presentacionId: id } });
                if (productosAdicionales.length > 0) {
                    console.log(`Deleting ${productosAdicionales.length} related ProductoAdicional records`);
                    await transactionalEntityManager.remove(productosAdicionales);
                }
                // 5. Finally delete the Presentacion
                console.log(`Deleting Presentacion ID ${id}`);
                await transactionalEntityManager.remove(entity);
            });
            return { success: true, message: `Presentación eliminada correctamente junto con ${entity.id ? 1 : 0} registros relacionados` };
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
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
            const currentUser = getCurrentUser(); // Get current user at time of call
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
    // Search ingredientes directly from database
    electron_1.ipcMain.handle('searchIngredientes', async (_event, query) => {
        try {
            const ingredienteRepo = dataSource.getRepository(ingrediente_entity_1.Ingrediente);
            const ingredients = await ingredienteRepo.createQueryBuilder('ingrediente')
                .where('LOWER(ingrediente.descripcion) LIKE LOWER(:query)', { query: `%${query}%` })
                .andWhere('ingrediente.activo = :activo', { activo: true })
                .orderBy('ingrediente.descripcion', 'ASC')
                .take(50)
                .getMany();
            return ingredients;
        }
        catch (error) {
            console.error('Error searching ingredientes:', error);
            return [];
        }
    });
    // Search recetas directly from database
    electron_1.ipcMain.handle('searchRecetasByNombre', async (_event, query) => {
        try {
            const recetaRepo = dataSource.getRepository(receta_entity_1.Receta);
            const recetas = await recetaRepo.createQueryBuilder('receta')
                .where('LOWER(receta.nombre) LIKE LOWER(:query)', { query: `%${query}%` })
                .andWhere('receta.activo = :activo', { activo: true })
                .orderBy('receta.nombre', 'ASC')
                .take(50)
                .getMany();
            return recetas;
        }
        catch (error) {
            console.error('Error searching recetas:', error);
            return [];
        }
    });
    async function getRecetaVariacionCosto(variacionId) {
        // remove all console.log
        try {
            const repoRecetaVariacion = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
            const repoRecetaVariacionItem = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
            const repoMoneda = dataSource.getRepository(moneda_entity_1.Moneda);
            const repoMonedaCambio = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
            const variacion = await repoRecetaVariacion.findOneBy({ id: variacionId });
            // to find costo, we need to find all receta variacionItems.ingrediente, and then get the costo from the ingrediente
            const variacionItems = await repoRecetaVariacionItem.find({ where: { variacionId: variacionId }, relations: ['ingrediente'] });
            const costo = variacionItems.reduce((acc, item) => acc + item.ingrediente.costo, 0);
            // each ingrediente can has different moneda, so we need to get the costo in moneda principal using moneda cambio
            // first get the moneda principal
            const monedaPrincipal = await repoMoneda.findOneBy({ principal: true });
            if (!monedaPrincipal)
                throw new Error('Moneda principal not found');
            // if monedaPrincipal is same as ingrediente.monedaId, sum the costo in a variable
            let costoEnMonedaPrincipal = 0;
            for (const item of variacionItems) {
                if (item.ingrediente.monedaId === monedaPrincipal.id) {
                    costoEnMonedaPrincipal += item.ingrediente.costo * item.cantidad;
                }
                else {
                    // if monedaPrincipal is not same as ingrediente.monedaId, we need to convert the costo to the moneda principal using moneda cambio
                    const monedaCambio = await repoMonedaCambio.findOne({ where: { monedaOrigen: { id: monedaPrincipal.id }, monedaDestino: { id: item.ingrediente.monedaId } } });
                    if (!monedaCambio)
                        throw new Error('Moneda cambio not found');
                    costoEnMonedaPrincipal += item.ingrediente.costo * item.cantidad * monedaCambio.compraOficial;
                }
            }
            return costoEnMonedaPrincipal;
        }
        catch (error) {
            console.error(`Error getting receta variacion costo for ID ${variacionId}:`, error);
            throw error;
        }
    }
    // --- RecetaVariacion Handlers ---
    electron_1.ipcMain.handle('getRecetaVariaciones', async (_event, recetaId) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
            const variaciones = await repo.find({ where: { recetaId }, relations: ['receta'], order: { nombre: 'ASC' } });
            // before returning, lets find costo based on the recetavariacionitem.ingrediente.costo
            for (const variacion of variaciones) {
                variacion.costo = await getRecetaVariacionCosto(variacion.id);
            }
            return variaciones;
        }
        catch (error) {
            console.error(`Error getting variations for recipe ID ${recetaId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getRecetaVariacion', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_entity_1.RecetaVariacion);
            const variacion = await repo.findOne({ where: { id }, relations: ['receta'] });
            if (!variacion)
                throw new Error(`RecetaVariacion ID ${id} not found`);
            variacion.costo = await getRecetaVariacionCosto(variacion.id);
            return variacion;
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const entity = await repo.findOne({ where: { id }, relations: ['receta'] });
            if (!entity)
                throw new Error(`RecetaVariacion ID ${id} not found`);
            repo.merge(entity, data);
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting recipe variation ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getRecetaVariacionCosto', async (_event, variacionId) => {
        try {
            return await getRecetaVariacionCosto(variacionId);
        }
        catch (error) {
            console.error(`Error getting recipe variation cost for ID ${variacionId}:`, error);
            throw error;
        }
    });
    // --- RecetaVariacionItem Handlers ---
    electron_1.ipcMain.handle('getRecetaVariacionItems', async (_event, variacionId) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
            return await repo.find({ where: { variacionId }, relations: ['ingrediente', 'ingrediente.moneda'] });
        }
        catch (error) {
            console.error(`Error getting items for recipe variation ID ${variacionId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getRecetaVariacionItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(receta_variacion_item_entity_1.RecetaVariacionItem);
            return await repo.findOne({ where: { id }, relations: ['ingrediente', 'ingrediente.moneda'] }); // Include relation
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
            const currentUser = getCurrentUser(); // Get current user at time of call
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
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
            const currentUser = getCurrentUser(); // Get current user at time of call
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
            const currentUser = getCurrentUser(); // Get current user at time of call
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
    // --- PrecioVenta Handlers ---
    electron_1.ipcMain.handle('getPreciosVenta', async (_event, active) => {
        try {
            const repo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
            return await repo.find({ where: { activo: active } });
        }
        catch (error) {
            console.error('Error getting precios venta:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPrecioVenta', async (_event, id, active) => {
        try {
            const repo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
            return await repo.findOne({ where: { id, activo: active } });
        }
        catch (error) {
            console.error('Error getting precio venta:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPreciosVentaByPresentacion', async (_event, presentacionId, active) => {
        try {
            const repo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
            const preciosVenta = await repo.find({ where: { presentacionId, activo: active }, relations: ['moneda', 'tipoPrecio'] });
            // Get the principal moneda
            const monedaRepo = dataSource.getRepository(moneda_entity_1.Moneda);
            const monedaPrincipal = await monedaRepo.findOneBy({ principal: true });
            if (monedaPrincipal) {
                // Get all exchange rates
                const monedaCambioRepo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
                const monedasCambio = await monedaCambioRepo.find({
                    relations: ['monedaOrigen', 'monedaDestino'],
                    where: { activo: true }
                });
                // Calculate valorMonedaPrincipal for each PrecioVenta
                for (const precioVenta of preciosVenta) {
                    if (precioVenta.monedaId === monedaPrincipal.id) {
                        // If the moneda is already the principal one, use the original value
                        precioVenta.valorMonedaPrincipal = precioVenta.valor;
                    }
                    else {
                        // Find the exchange rate from this moneda to the principal moneda
                        const cambio = monedasCambio.find(c => c.monedaOrigen && c.monedaDestino &&
                            c.monedaDestino.id === precioVenta.monedaId &&
                            c.monedaOrigen.id === monedaPrincipal.id);
                        if (cambio && cambio.compraOficial) {
                            // Use compraOficial to calculate the equivalent in principal currency
                            precioVenta.valorMonedaPrincipal = precioVenta.valor * cambio.compraOficial;
                        }
                    }
                }
            }
            return preciosVenta;
        }
        catch (error) {
            console.error('Error getting precios venta por presentacion:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPreciosVentaByPresentacionSabor', async (_event, presentacionSaborId, active) => {
        try {
            const repo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
            const preciosVenta = await repo.find({
                where: { presentacionSaborId, activo: active },
                relations: ['moneda', 'tipoPrecio']
            });
            // Get the principal moneda
            const monedaRepo = dataSource.getRepository(moneda_entity_1.Moneda);
            const monedaPrincipal = await monedaRepo.findOneBy({ principal: true });
            if (monedaPrincipal) {
                // Get all exchange rates
                const monedaCambioRepo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
                const monedasCambio = await monedaCambioRepo.find({
                    relations: ['monedaOrigen', 'monedaDestino'],
                    where: { activo: true }
                });
                // Calculate valorMonedaPrincipal for each PrecioVenta
                for (const precioVenta of preciosVenta) {
                    if (precioVenta.monedaId === monedaPrincipal.id) {
                        // If the moneda is already the principal one, use the original value
                        precioVenta.valorMonedaPrincipal = precioVenta.valor;
                    }
                    else {
                        // Find the exchange rate from this moneda to the principal moneda
                        const cambio = monedasCambio.find(c => c.monedaOrigen && c.monedaDestino &&
                            c.monedaDestino.id === precioVenta.monedaId &&
                            c.monedaOrigen.id === monedaPrincipal.id);
                        if (cambio && cambio.compraOficial) {
                            // Use compraOficial to calculate the equivalent in principal currency
                            precioVenta.valorMonedaPrincipal = precioVenta.valor * cambio.compraOficial;
                        }
                    }
                }
            }
            return preciosVenta;
        }
        catch (error) {
            console.error('Error getting precios venta por presentacion sabor:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPrecioVenta', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
            const entity = repo.create(data);
            // No user tracking needed usually for prices
            const currentUser = getCurrentUser(); // Get current user at time of call
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating precio venta:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePrecioVenta', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PrecioVenta ID ${id} not found`);
            repo.merge(entity, data);
            // No user tracking needed usually
            const currentUser = getCurrentUser(); // Get current user at time of call
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating precio venta ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePrecioVenta', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(precio_venta_entity_1.PrecioVenta);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PrecioVenta ID ${id} not found`);
            const currentUser = getCurrentUser(); // Get current user at time of call
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting precio venta ID ${id}:`, error);
            throw error;
        }
    });
    // --- Search Handlers ---
    electron_1.ipcMain.handle('searchProductos', async (_event, params) => {
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
                const codigoRepo = dataSource.getRepository(codigo_entity_1.Codigo);
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
                        .filter((producto, index, self) => producto.activo &&
                        index === self.findIndex(p => p.id === producto.id));
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
            const productoRepo = dataSource.getRepository(producto_entity_1.Producto);
            // Create query builder for more flexible querying
            const queryBuilder = productoRepo.createQueryBuilder('producto')
                .leftJoinAndSelect('producto.subcategoria', 'subcategoria')
                .leftJoinAndSelect('subcategoria.categoria', 'categoria')
                .where('producto.activo = :activo', { activo: true })
                .andWhere('(UPPER(producto.nombre) LIKE :searchTerm OR UPPER(producto.nombreAlternativo) LIKE :searchTerm)', { searchTerm: `%${searchTermUpper}%` })
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
        }
        catch (error) {
            console.error('Error searching productos:', error);
            throw error;
        }
    });
    // Also add a handler to search by codigo only (for barcode scanning)
    electron_1.ipcMain.handle('searchProductosByCode', async (_event, code) => {
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
            const codigoRepo = dataSource.getRepository(codigo_entity_1.Codigo);
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
        }
        catch (error) {
            console.error('Error searching producto by code:', error);
            throw error;
        }
    });
    // --- Observacion Handlers ---
    electron_1.ipcMain.handle('getObservaciones', async () => {
        try {
            const repo = dataSource.getRepository(observacion_entity_1.Observacion);
            return await repo.find({ order: { nombre: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting observaciones:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getObservacion', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(observacion_entity_1.Observacion);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting observacion ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createObservacion', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(observacion_entity_1.Observacion);
            const entity = repo.create(data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating observacion:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateObservacion', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(observacion_entity_1.Observacion);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Observacion ID ${id} not found`);
            repo.merge(entity, data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating observacion ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteObservacion', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(observacion_entity_1.Observacion);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Observacion ID ${id} not found`);
            // Check dependencies (ObservacionProducto) before deleting
            const obsProductoRepo = dataSource.getRepository(observacion_producto_entity_1.ObservacionProducto);
            const obsProductoCount = await obsProductoRepo.count({ where: { observacionId: id } });
            if (obsProductoCount > 0) {
                throw new Error(`No se puede eliminar la observación porque tiene ${obsProductoCount} productos asociados.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting observacion ID ${id}:`, error);
            throw error;
        }
    });
    // search observaciones by nombre, add pagination
    electron_1.ipcMain.handle('searchObservaciones', async (_event, searchTerm, page, pageSize) => {
        try {
            const repo = dataSource.getRepository(observacion_entity_1.Observacion);
            const skip = (page - 1) * pageSize;
            // improve the search query using like and wildcard, order by nombre
            const observaciones = await repo.find({
                where: { nombre: (0, typeorm_1.Like)(`%${searchTerm}%`) },
                order: { nombre: 'ASC' },
                skip,
                take: pageSize
            });
            return observaciones;
        }
        catch (error) {
            console.error('Error searching observaciones:', error);
            throw error;
        }
    });
    // --- ObservacionProducto Handlers ---
    electron_1.ipcMain.handle('getObservacionesProductos', async () => {
        try {
            const repo = dataSource.getRepository(observacion_producto_entity_1.ObservacionProducto);
            return await repo.find({
                relations: ['producto', 'observacion'],
                order: { productoId: 'ASC' }
            });
        }
        catch (error) {
            console.error('Error getting observaciones productos:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getObservacionesProductosByProducto', async (_event, productoId) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_entity_1.ObservacionProducto);
            return await repo.find({
                where: { productoId },
                relations: ['observacion'],
                order: { observacionId: 'ASC' }
            });
        }
        catch (error) {
            console.error(`Error getting observaciones for producto ID ${productoId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getObservacionProducto', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_entity_1.ObservacionProducto);
            return await repo.findOne({
                where: { id },
                relations: ['producto', 'observacion']
            });
        }
        catch (error) {
            console.error(`Error getting observacion producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createObservacionProducto', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_entity_1.ObservacionProducto);
            // Check if an observation with the same productoId and observacionId already exists
            const existingObservacionProducto = await repo.findOne({
                where: {
                    productoId: data.productoId,
                    observacionId: data.observacionId
                }
            });
            if (existingObservacionProducto) {
                // Return a specific error to be handled by the client
                return {
                    success: false,
                    error: 'duplicate',
                    message: 'Ya existe una observación asociada a este producto con el mismo nombre. No se permiten observaciones duplicadas.'
                };
            }
            const entity = repo.create(data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            const savedEntity = await repo.save(entity);
            return {
                success: true,
                data: savedEntity
            };
        }
        catch (error) {
            console.error('Error creating observacion producto:', error);
            return {
                success: false,
                error: 'unknown',
                message: error.message || 'Error al crear la observación para este producto'
            };
        }
    });
    electron_1.ipcMain.handle('updateObservacionProducto', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_entity_1.ObservacionProducto);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ObservacionProducto ID ${id} not found`);
            repo.merge(entity, data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating observacion producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteObservacionProducto', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_entity_1.ObservacionProducto);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ObservacionProducto ID ${id} not found`);
            // Check dependencies (ObservacionProductoVentaItem) before deleting
            const obsProductoVentaItemRepo = dataSource.getRepository(observacion_producto_venta_item_entity_1.ObservacionProductoVentaItem);
            const obsProductoVentaItemCount = await obsProductoVentaItemRepo.count({ where: { observacionProductoId: id } });
            if (obsProductoVentaItemCount > 0) {
                throw new Error(`No se puede eliminar la observación de producto porque tiene ${obsProductoVentaItemCount} items de venta asociados.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting observacion producto ID ${id}:`, error);
            throw error;
        }
    });
    // --- ObservacionProductoVentaItem Handlers ---
    electron_1.ipcMain.handle('getObservacionesProductosVentasItems', async (_event, ventaItemId) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_venta_item_entity_1.ObservacionProductoVentaItem);
            return await repo.find({
                where: { ventaItemId },
                relations: ['observacionProducto', 'observacionProducto.observacion'],
                order: { id: 'ASC' }
            });
        }
        catch (error) {
            console.error(`Error getting observaciones for venta item ID ${ventaItemId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getObservacionProductoVentaItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_venta_item_entity_1.ObservacionProductoVentaItem);
            return await repo.findOne({
                where: { id },
                relations: ['observacionProducto', 'ventaItem', 'observacionProducto.observacion']
            });
        }
        catch (error) {
            console.error(`Error getting observacion producto venta item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createObservacionProductoVentaItem', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_venta_item_entity_1.ObservacionProductoVentaItem);
            const entity = repo.create(data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating observacion producto venta item:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateObservacionProductoVentaItem', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_venta_item_entity_1.ObservacionProductoVentaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ObservacionProductoVentaItem ID ${id} not found`);
            repo.merge(entity, data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating observacion producto venta item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteObservacionProductoVentaItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(observacion_producto_venta_item_entity_1.ObservacionProductoVentaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ObservacionProductoVentaItem ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting observacion producto venta item ID ${id}:`, error);
            throw error;
        }
    });
    // --- Adicional Handlers ---
    electron_1.ipcMain.handle('getAdicionales', async () => {
        try {
            const repo = dataSource.getRepository(adicional_entity_1.Adicional);
            return await repo.find({
                relations: ['ingrediente', 'receta', 'moneda'],
                order: { nombre: 'ASC' }
            });
        }
        catch (error) {
            console.error('Error getting adicionales:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getAdicionalesFiltered', async (_event, filters) => {
        try {
            const repo = dataSource.getRepository(adicional_entity_1.Adicional);
            const queryBuilder = repo.createQueryBuilder('adicional')
                .leftJoinAndSelect('adicional.ingrediente', 'ingrediente')
                .leftJoinAndSelect('adicional.receta', 'receta')
                .leftJoinAndSelect('adicional.moneda', 'moneda')
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
            if (filters.monedaId !== undefined && filters.monedaId !== null) {
                queryBuilder.andWhere('adicional.monedaId = :monedaId', { monedaId: filters.monedaId });
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
        }
        catch (error) {
            console.error('Error getting filtered adicionales:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getAdicional', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(adicional_entity_1.Adicional);
            return await repo.findOne({
                where: { id },
                relations: ['ingrediente', 'receta', 'moneda']
            });
        }
        catch (error) {
            console.error(`Error getting adicional ID ${id}:`, error);
            throw error;
        }
    });
    // add error handling like in createObservacionProducto
    electron_1.ipcMain.handle('createAdicional', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(adicional_entity_1.Adicional);
            const entity = repo.create(data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating adicional:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateAdicional', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(adicional_entity_1.Adicional);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Adicional ID ${id} not found`);
            repo.merge(entity, data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating adicional ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteAdicional', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(adicional_entity_1.Adicional);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Adicional ID ${id} not found`);
            // Check dependencies (ProductoAdicional) before deleting
            const productoAdicionalRepo = dataSource.getRepository(producto_adicional_entity_1.ProductoAdicional);
            const productoAdicionalCount = await productoAdicionalRepo.count({ where: { adicionalId: id } });
            if (productoAdicionalCount > 0) {
                throw new Error(`No se puede eliminar el adicional porque tiene ${productoAdicionalCount} productos asociados.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting adicional ID ${id}:`, error);
            throw error;
        }
    });
    // --- ProductoAdicional Handlers ---
    electron_1.ipcMain.handle('getProductosAdicionales', async () => {
        try {
            const repo = dataSource.getRepository(producto_adicional_entity_1.ProductoAdicional);
            return await repo.find({
                relations: ['producto', 'adicional'],
                order: { productoId: 'ASC' }
            });
        }
        catch (error) {
            console.error('Error getting productos adicionales:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getProductosAdicionalesByProducto', async (_event, productoId) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_entity_1.ProductoAdicional);
            return await repo.find({
                where: { productoId },
                relations: ['adicional', 'presentacion', 'adicional.ingrediente'],
                order: { adicionalId: 'ASC' }
            });
        }
        catch (error) {
            console.error(`Error getting adicionales for producto ID ${productoId}:`, error);
            throw error;
        }
    });
    // get by presentacion id
    electron_1.ipcMain.handle('getProductosAdicionalesByPresentacion', async (_event, presentacionId) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_entity_1.ProductoAdicional);
            return await repo.find({
                where: { presentacionId },
                relations: ['producto', 'adicional', 'presentacion', 'adicional.ingrediente']
            });
        }
        catch (error) {
            console.error(`Error getting producto adicionales by presentacion ID ${presentacionId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getProductoAdicional', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_entity_1.ProductoAdicional);
            return await repo.findOne({
                where: { id },
                relations: ['producto', 'adicional', 'presentacion', 'adicional.ingrediente']
            });
        }
        catch (error) {
            console.error(`Error getting producto adicional ID ${id}:`, error);
            throw error;
        }
    });
    // add error handling like in createObservacionProducto
    electron_1.ipcMain.handle('createProductoAdicional', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_entity_1.ProductoAdicional);
            // check if already exists a producto adicional with the same productoId and adicionalId and presentacionId
            const existing = await repo.findOne({ where: { productoId: data.productoId, adicionalId: data.adicionalId, presentacionId: data.presentacionId } });
            if (existing) {
                return {
                    success: false,
                    error: 'ProductoAdicional ya existe',
                    message: 'Ya existe un producto adicional con el mismo producto, adicional y presentación.'
                };
            }
            const entity = repo.create(data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            return {
                success: false,
                error: 'unknown',
                message: error || 'Error al crear el producto adicional.'
            };
        }
    });
    electron_1.ipcMain.handle('updateProductoAdicional', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_entity_1.ProductoAdicional);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ProductoAdicional ID ${id} not found`);
            repo.merge(entity, data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating producto adicional ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteProductoAdicional', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_entity_1.ProductoAdicional);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ProductoAdicional ID ${id} not found`);
            // Check dependencies (ProductoAdicionalVentaItem) before deleting
            const productoAdicionalVentaItemRepo = dataSource.getRepository(producto_adicional_venta_item_entity_1.ProductoAdicionalVentaItem);
            const productoAdicionalVentaItemCount = await productoAdicionalVentaItemRepo.count({ where: { productoAdicionalId: id } });
            if (productoAdicionalVentaItemCount > 0) {
                throw new Error(`No se puede eliminar el adicional de producto porque tiene ${productoAdicionalVentaItemCount} items de venta asociados.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting producto adicional ID ${id}:`, error);
            throw error;
        }
    });
    // --- ProductoAdicionalVentaItem Handlers ---
    electron_1.ipcMain.handle('getProductosAdicionalesVentasItems', async (_event, ventaItemId) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_venta_item_entity_1.ProductoAdicionalVentaItem);
            return await repo.find({
                where: { ventaItemId },
                relations: ['productoAdicional', 'productoAdicional.adicional'],
                order: { id: 'ASC' }
            });
        }
        catch (error) {
            console.error(`Error getting adicionales for venta item ID ${ventaItemId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getProductoAdicionalVentaItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_venta_item_entity_1.ProductoAdicionalVentaItem);
            return await repo.findOne({
                where: { id },
                relations: ['productoAdicional', 'ventaItem', 'productoAdicional.adicional']
            });
        }
        catch (error) {
            console.error(`Error getting producto adicional venta item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createProductoAdicionalVentaItem', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_venta_item_entity_1.ProductoAdicionalVentaItem);
            const entity = repo.create(data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating producto adicional venta item:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateProductoAdicionalVentaItem', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_venta_item_entity_1.ProductoAdicionalVentaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ProductoAdicionalVentaItem ID ${id} not found`);
            repo.merge(entity, data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating producto adicional venta item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteProductoAdicionalVentaItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(producto_adicional_venta_item_entity_1.ProductoAdicionalVentaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ProductoAdicionalVentaItem ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting producto adicional venta item ID ${id}:`, error);
            throw error;
        }
    });
    // --- CostoPorProducto Handlers ---
    electron_1.ipcMain.handle('getCostosPorProducto', async () => {
        try {
            const repo = dataSource.getRepository(costo_por_producto_entity_1.CostoPorProducto);
            const costos = await repo.find({
                relations: ['producto', 'moneda'],
                order: {
                    productoId: 'ASC',
                    createdAt: 'DESC'
                }
            });
            // Get the principal moneda
            const monedaRepo = dataSource.getRepository(moneda_entity_1.Moneda);
            const monedaPrincipal = await monedaRepo.findOneBy({ principal: true });
            if (monedaPrincipal) {
                // Get all exchange rates
                const monedaCambioRepo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
                const monedasCambio = await monedaCambioRepo.find({
                    relations: ['monedaOrigen', 'monedaDestino'],
                    where: { activo: true }
                });
                // Calculate valorMonedaPrincipal for each CostoPorProducto
                for (const costo of costos) {
                    if (costo.monedaId === monedaPrincipal.id) {
                        // If the moneda is already the principal one, use the original value
                        costo.valorMonedaPrincipal = costo.valor;
                    }
                    else {
                        // Find the exchange rate from this moneda to the principal moneda
                        const cambio = monedasCambio.find(c => c.monedaOrigen && c.monedaDestino &&
                            c.monedaDestino.id === costo.monedaId &&
                            c.monedaOrigen.id === monedaPrincipal.id);
                        if (cambio && cambio.compraOficial) {
                            // Use compraOficial to calculate the equivalent in principal currency
                            costo.valorMonedaPrincipal = costo.valor * cambio.compraOficial;
                        }
                    }
                }
            }
            return costos;
        }
        catch (error) {
            console.error('Error getting costos por producto:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getCostosPorProductoByProducto', async (_event, productoId) => {
        try {
            const repo = dataSource.getRepository(costo_por_producto_entity_1.CostoPorProducto);
            const costos = await repo.find({
                where: { productoId },
                relations: ['moneda'],
                order: { createdAt: 'DESC' }
            });
            // Get the principal moneda
            const monedaRepo = dataSource.getRepository(moneda_entity_1.Moneda);
            const monedaPrincipal = await monedaRepo.findOneBy({ principal: true });
            if (monedaPrincipal) {
                // Get all exchange rates
                const monedaCambioRepo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
                const monedasCambio = await monedaCambioRepo.find({
                    relations: ['monedaOrigen', 'monedaDestino'],
                    where: { activo: true }
                });
                // Calculate valorMonedaPrincipal for each CostoPorProducto
                for (const costo of costos) {
                    if (costo.monedaId === monedaPrincipal.id) {
                        // If the moneda is already the principal one, use the original value
                        costo.valorMonedaPrincipal = costo.valor;
                    }
                    else {
                        // Find the exchange rate from this moneda to the principal moneda
                        const cambio = monedasCambio.find(c => c.monedaOrigen && c.monedaDestino &&
                            c.monedaDestino.id === costo.monedaId &&
                            c.monedaOrigen.id === monedaPrincipal.id);
                        if (cambio && cambio.compraOficial) {
                            // Use compraOficial to calculate the equivalent in principal currency
                            costo.valorMonedaPrincipal = costo.valor * cambio.compraOficial;
                        }
                    }
                }
            }
            return costos;
        }
        catch (error) {
            console.error(`Error getting costos por producto for producto ID ${productoId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getCostoPorProducto', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(costo_por_producto_entity_1.CostoPorProducto);
            const costo = await repo.findOne({
                where: { id },
                relations: ['producto', 'moneda']
            });
            if (costo) {
                // Get the principal moneda
                const monedaRepo = dataSource.getRepository(moneda_entity_1.Moneda);
                const monedaPrincipal = await monedaRepo.findOneBy({ principal: true });
                if (monedaPrincipal) {
                    if (costo.monedaId === monedaPrincipal.id) {
                        // If the moneda is already the principal one, use the original value
                        costo.valorMonedaPrincipal = costo.valor;
                    }
                    else {
                        // Get exchange rates
                        const monedaCambioRepo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
                        const monedasCambio = await monedaCambioRepo.find({
                            where: { activo: true },
                            relations: ['monedaOrigen', 'monedaDestino']
                        });
                        // Find the exchange rate from this moneda to the principal moneda
                        const cambio = monedasCambio.find(c => c.monedaOrigen && c.monedaDestino &&
                            c.monedaDestino.id === costo.monedaId &&
                            c.monedaOrigen.id === monedaPrincipal.id);
                        if (cambio && cambio.compraOficial) {
                            // Use compraOficial to calculate the equivalent in principal currency
                            costo.valorMonedaPrincipal = costo.valor * cambio.compraOficial;
                        }
                    }
                }
            }
            return costo;
        }
        catch (error) {
            console.error(`Error getting costo por producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createCostoPorProducto', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(costo_por_producto_entity_1.CostoPorProducto);
            // If principal is true, update other costs to not be principal
            if (data.principal === true) {
                await repo.update({
                    productoId: data.productoId,
                    principal: true
                }, { principal: false });
            }
            // Create the entity after potentially updating other costs
            const entity = repo.create(data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating costo por producto:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateCostoPorProducto', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(costo_por_producto_entity_1.CostoPorProducto);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Costo por producto ID ${id} not found`);
            // If setting to principal, update others first
            if (data.principal === true) {
                await repo.update({
                    productoId: entity.productoId,
                    principal: true,
                    id: (0, typeorm_1.Not)(id) // Exclude this entity by ID directly
                }, { principal: false });
            }
            repo.merge(entity, data);
            const currentUser = getCurrentUser();
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating costo por producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteCostoPorProducto', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(costo_por_producto_entity_1.CostoPorProducto);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Costo por producto ID ${id} not found`);
            await repo.remove(entity);
            return true;
        }
        catch (error) {
            console.error(`Error deleting costo por producto ID ${id}:`, error);
            throw error;
        }
    });
}
exports.registerProductosHandlers = registerProductosHandlers;
//# sourceMappingURL=productos.handler.js.map