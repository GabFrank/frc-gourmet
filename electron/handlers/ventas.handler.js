"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVentasHandlers = void 0;
const electron_1 = require("electron");
const precio_delivery_entity_1 = require("../../src/app/database/entities/ventas/precio-delivery.entity");
const delivery_entity_1 = require("../../src/app/database/entities/ventas/delivery.entity");
const venta_entity_1 = require("../../src/app/database/entities/ventas/venta.entity");
const venta_item_entity_1 = require("../../src/app/database/entities/ventas/venta-item.entity");
const pdv_grupo_categoria_entity_1 = require("../../src/app/database/entities/ventas/pdv-grupo-categoria.entity");
const pdv_categoria_entity_1 = require("../../src/app/database/entities/ventas/pdv-categoria.entity");
const pdv_categoria_item_entity_1 = require("../../src/app/database/entities/ventas/pdv-categoria-item.entity");
const pdv_item_producto_entity_1 = require("../../src/app/database/entities/ventas/pdv-item-producto.entity");
const entity_utils_1 = require("../utils/entity.utils");
function registerVentasHandlers(dataSource, getCurrentUser) {
    const currentUser = getCurrentUser(); // Get user for tracking
    // --- PrecioDelivery Handlers ---
    electron_1.ipcMain.handle('getPreciosDelivery', async () => {
        try {
            const repo = dataSource.getRepository(precio_delivery_entity_1.PrecioDelivery);
            return await repo.find({ order: { descripcion: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting precios delivery:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPrecioDelivery', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(precio_delivery_entity_1.PrecioDelivery);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting precio delivery ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPrecioDelivery', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(precio_delivery_entity_1.PrecioDelivery);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating precio delivery:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePrecioDelivery', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(precio_delivery_entity_1.PrecioDelivery);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Precio Delivery ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating precio delivery ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePrecioDelivery', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(precio_delivery_entity_1.PrecioDelivery);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Precio Delivery ID ${id} not found`);
            // Check dependencies (Deliveries) before deleting
            const deliveryRepo = dataSource.getRepository(delivery_entity_1.Delivery);
            const deliveriesCount = await deliveryRepo.count({
                where: { precioDelivery: { id } }
            });
            if (deliveriesCount > 0) {
                throw new Error(`No se puede eliminar el precio de delivery porque está asociado a ${deliveriesCount} deliveries.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting precio delivery ID ${id}:`, error);
            throw error;
        }
    });
    // --- Delivery Handlers ---
    electron_1.ipcMain.handle('getDeliveries', async () => {
        try {
            const repo = dataSource.getRepository(delivery_entity_1.Delivery);
            return await repo.find({
                relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'],
                order: { fechaAbierto: 'DESC' }
            });
        }
        catch (error) {
            console.error('Error getting deliveries:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getDeliveriesByEstado', async (_event, estado) => {
        try {
            const repo = dataSource.getRepository(delivery_entity_1.Delivery);
            return await repo.find({
                where: { estado },
                relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor'],
                order: { fechaAbierto: 'DESC' }
            });
        }
        catch (error) {
            console.error(`Error getting deliveries with estado ${estado}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getDelivery', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(delivery_entity_1.Delivery);
            return await repo.findOne({
                where: { id },
                relations: ['precioDelivery', 'cliente', 'cliente.persona', 'entregadoPor']
            });
        }
        catch (error) {
            console.error(`Error getting delivery ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createDelivery', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(delivery_entity_1.Delivery);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating delivery:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateDelivery', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(delivery_entity_1.Delivery);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Delivery ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating delivery ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteDelivery', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(delivery_entity_1.Delivery);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Delivery ID ${id} not found`);
            // Check dependencies (Ventas) before deleting
            const ventaRepo = dataSource.getRepository(venta_entity_1.Venta);
            const ventasCount = await ventaRepo.count({
                where: { delivery: { id } }
            });
            if (ventasCount > 0) {
                throw new Error(`No se puede eliminar el delivery porque está asociado a ${ventasCount} ventas.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting delivery ID ${id}:`, error);
            throw error;
        }
    });
    // --- Venta Handlers ---
    electron_1.ipcMain.handle('getVentas', async () => {
        try {
            const repo = dataSource.getRepository(venta_entity_1.Venta);
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
        }
        catch (error) {
            console.error('Error getting ventas:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getVentasByEstado', async (_event, estado) => {
        try {
            const repo = dataSource.getRepository(venta_entity_1.Venta);
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
        }
        catch (error) {
            console.error(`Error getting ventas with estado ${estado}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getVenta', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(venta_entity_1.Venta);
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
        }
        catch (error) {
            console.error(`Error getting venta ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createVenta', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(venta_entity_1.Venta);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating venta:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateVenta', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(venta_entity_1.Venta);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Venta ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating venta ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteVenta', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(venta_entity_1.Venta);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Venta ID ${id} not found`);
            // Check if there are venta items before deleting
            const ventaItemRepo = dataSource.getRepository(venta_item_entity_1.VentaItem);
            const itemsCount = await ventaItemRepo.count({
                where: { venta: { id } }
            });
            if (itemsCount > 0) {
                throw new Error(`No se puede eliminar la venta porque tiene ${itemsCount} items asociados. Elimine primero los items.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting venta ID ${id}:`, error);
            throw error;
        }
    });
    // --- VentaItem Handlers ---
    electron_1.ipcMain.handle('getVentaItems', async (_event, ventaId) => {
        try {
            const repo = dataSource.getRepository(venta_item_entity_1.VentaItem);
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
        }
        catch (error) {
            console.error(`Error getting venta items for venta ID ${ventaId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getVentaItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(venta_item_entity_1.VentaItem);
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
        }
        catch (error) {
            console.error(`Error getting venta item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createVentaItem', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(venta_item_entity_1.VentaItem);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating venta item:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateVentaItem', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(venta_item_entity_1.VentaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Venta Item ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating venta item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteVentaItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(venta_item_entity_1.VentaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Venta Item ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting venta item ID ${id}:`, error);
            throw error;
        }
    });
    // --- PdvGrupoCategoria Handlers ---
    electron_1.ipcMain.handle('getPdvGrupoCategorias', async () => {
        try {
            const repo = dataSource.getRepository(pdv_grupo_categoria_entity_1.PdvGrupoCategoria);
            return await repo.find({
                relations: ['categorias'],
                order: { nombre: 'ASC' }
            });
        }
        catch (error) {
            console.error('Error getting PDV Grupo Categorias:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPdvGrupoCategoria', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(pdv_grupo_categoria_entity_1.PdvGrupoCategoria);
            return await repo.findOne({
                where: { id },
                relations: ['categorias']
            });
        }
        catch (error) {
            console.error(`Error getting PDV Grupo Categoria ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPdvGrupoCategoria', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(pdv_grupo_categoria_entity_1.PdvGrupoCategoria);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating PDV Grupo Categoria:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePdvGrupoCategoria', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(pdv_grupo_categoria_entity_1.PdvGrupoCategoria);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PDV Grupo Categoria ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating PDV Grupo Categoria ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePdvGrupoCategoria', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(pdv_grupo_categoria_entity_1.PdvGrupoCategoria);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PDV Grupo Categoria ID ${id} not found`);
            // Check dependencies before deleting
            const categoriaRepo = dataSource.getRepository(pdv_categoria_entity_1.PdvCategoria);
            const categoriasCount = await categoriaRepo.count({
                where: { grupoCategoria: { id } }
            });
            if (categoriasCount > 0) {
                throw new Error(`No se puede eliminar el grupo de categoría porque tiene ${categoriasCount} categorías asociadas.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting PDV Grupo Categoria ID ${id}:`, error);
            throw error;
        }
    });
    // --- PdvCategoria Handlers ---
    electron_1.ipcMain.handle('getPdvCategorias', async () => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_entity_1.PdvCategoria);
            return await repo.find({
                relations: ['grupoCategoria', 'items'],
                order: { nombre: 'ASC' }
            });
        }
        catch (error) {
            console.error('Error getting PDV Categorias:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPdvCategoriasByGrupo', async (_event, grupoId) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_entity_1.PdvCategoria);
            return await repo.find({
                where: { grupoCategoria: { id: grupoId } },
                relations: ['grupoCategoria', 'items'],
                order: { nombre: 'ASC' }
            });
        }
        catch (error) {
            console.error(`Error getting PDV Categorias for Grupo ID ${grupoId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPdvCategoria', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_entity_1.PdvCategoria);
            return await repo.findOne({
                where: { id },
                relations: ['grupoCategoria', 'items']
            });
        }
        catch (error) {
            console.error(`Error getting PDV Categoria ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPdvCategoria', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_entity_1.PdvCategoria);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating PDV Categoria:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePdvCategoria', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_entity_1.PdvCategoria);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PDV Categoria ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating PDV Categoria ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePdvCategoria', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_entity_1.PdvCategoria);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PDV Categoria ID ${id} not found`);
            // Check dependencies before deleting
            const itemRepo = dataSource.getRepository(pdv_categoria_item_entity_1.PdvCategoriaItem);
            const itemsCount = await itemRepo.count({
                where: { categoria: { id } }
            });
            if (itemsCount > 0) {
                throw new Error(`No se puede eliminar la categoría porque tiene ${itemsCount} items asociados.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting PDV Categoria ID ${id}:`, error);
            throw error;
        }
    });
    // --- PdvCategoriaItem Handlers ---
    electron_1.ipcMain.handle('getPdvCategoriaItems', async () => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_item_entity_1.PdvCategoriaItem);
            return await repo.find({
                relations: ['categoria', 'productos', 'productos.producto'],
                order: { nombre: 'ASC' }
            });
        }
        catch (error) {
            console.error('Error getting PDV Categoria Items:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPdvCategoriaItemsByCategoria', async (_event, categoriaId) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_item_entity_1.PdvCategoriaItem);
            return await repo.find({
                where: { categoria: { id: categoriaId } },
                relations: ['categoria', 'productos', 'productos.producto'],
                order: { nombre: 'ASC' }
            });
        }
        catch (error) {
            console.error(`Error getting PDV Categoria Items for Categoria ID ${categoriaId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPdvCategoriaItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_item_entity_1.PdvCategoriaItem);
            return await repo.findOne({
                where: { id },
                relations: ['categoria', 'productos', 'productos.producto']
            });
        }
        catch (error) {
            console.error(`Error getting PDV Categoria Item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPdvCategoriaItem', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_item_entity_1.PdvCategoriaItem);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating PDV Categoria Item:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePdvCategoriaItem', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_item_entity_1.PdvCategoriaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PDV Categoria Item ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating PDV Categoria Item ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePdvCategoriaItem', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(pdv_categoria_item_entity_1.PdvCategoriaItem);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PDV Categoria Item ID ${id} not found`);
            // Check dependencies before deleting
            const itemProductoRepo = dataSource.getRepository(pdv_item_producto_entity_1.PdvItemProducto);
            const productosCount = await itemProductoRepo.count({
                where: { categoriaItem: { id } }
            });
            if (productosCount > 0) {
                throw new Error(`No se puede eliminar el item de categoría porque tiene ${productosCount} productos asociados.`);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting PDV Categoria Item ID ${id}:`, error);
            throw error;
        }
    });
    // --- PdvItemProducto Handlers ---
    electron_1.ipcMain.handle('getPdvItemProductos', async () => {
        try {
            const repo = dataSource.getRepository(pdv_item_producto_entity_1.PdvItemProducto);
            return await repo.find({
                relations: ['categoriaItem', 'producto'],
                order: { nombre_alternativo: 'ASC' }
            });
        }
        catch (error) {
            console.error('Error getting PDV Item Productos:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPdvItemProductosByItem', async (_event, itemId) => {
        try {
            const repo = dataSource.getRepository(pdv_item_producto_entity_1.PdvItemProducto);
            return await repo.find({
                where: { categoriaItem: { id: itemId } },
                relations: ['categoriaItem', 'producto'],
                order: { nombre_alternativo: 'ASC' }
            });
        }
        catch (error) {
            console.error(`Error getting PDV Item Productos for Item ID ${itemId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPdvItemProducto', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(pdv_item_producto_entity_1.PdvItemProducto);
            return await repo.findOne({
                where: { id },
                relations: ['categoriaItem', 'producto']
            });
        }
        catch (error) {
            console.error(`Error getting PDV Item Producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPdvItemProducto', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(pdv_item_producto_entity_1.PdvItemProducto);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating PDV Item Producto:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePdvItemProducto', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(pdv_item_producto_entity_1.PdvItemProducto);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PDV Item Producto ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating PDV Item Producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePdvItemProducto', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(pdv_item_producto_entity_1.PdvItemProducto);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`PDV Item Producto ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting PDV Item Producto ID ${id}:`, error);
            throw error;
        }
    });
}
exports.registerVentasHandlers = registerVentasHandlers;
//# sourceMappingURL=ventas.handler.js.map