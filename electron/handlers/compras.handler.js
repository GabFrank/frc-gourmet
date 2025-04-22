"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerComprasHandlers = void 0;
const electron_1 = require("electron");
const proveedor_entity_1 = require("../../src/app/database/entities/compras/proveedor.entity");
const compra_entity_1 = require("../../src/app/database/entities/compras/compra.entity");
const compra_detalle_entity_1 = require("../../src/app/database/entities/compras/compra-detalle.entity");
const pago_entity_1 = require("../../src/app/database/entities/compras/pago.entity");
const pago_detalle_entity_1 = require("../../src/app/database/entities/compras/pago-detalle.entity");
const proveedor_producto_entity_1 = require("../../src/app/database/entities/compras/proveedor-producto.entity");
const forma_pago_entity_1 = require("../../src/app/database/entities/compras/forma-pago.entity");
const entity_utils_1 = require("../utils/entity.utils");
function registerComprasHandlers(dataSource, getCurrentUser) {
    const currentUser = getCurrentUser(); // Get user for tracking
    // --- Proveedor Handlers ---
    electron_1.ipcMain.handle('getProveedores', async () => {
        try {
            const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
            return await proveedorRepository.find({
                relations: ['persona'],
                order: { persona: { nombre: 'ASC' } } // Order by persona name
            });
        }
        catch (error) {
            console.error('Error getting proveedores:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getProveedor', async (_event, id) => {
        try {
            const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
            return await proveedorRepository.findOne({
                where: { id },
                relations: ['persona']
            });
        }
        catch (error) {
            console.error(`Error getting proveedor ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createProveedor', async (_event, data) => {
        try {
            const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
            const entity = proveedorRepository.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            // Fix: Cast the result of save via unknown as suggested by linter
            const savedEntity = await proveedorRepository.save(entity);
            // Check if savedEntity and its id exist before using it
            if (!savedEntity || !savedEntity.id) {
                console.error('Failed to save proveedor or get ID', savedEntity);
                throw new Error('Failed to save proveedor or retrieve its ID.');
            }
            // Fetch again with relations to return complete data
            return await proveedorRepository.findOne({ where: { id: savedEntity.id }, relations: ['persona'] });
        }
        catch (error) {
            console.error('Error creating proveedor:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateProveedor', async (_event, id, data) => {
        try {
            const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
            const entity = await proveedorRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`Proveedor ID ${id} not found`);
            proveedorRepository.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            await proveedorRepository.save(entity);
            // Fetch again with relations to return complete data
            return await proveedorRepository.findOne({ where: { id: id }, relations: ['persona'] });
        }
        catch (error) {
            console.error(`Error updating proveedor ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteProveedor', async (_event, id) => {
        try {
            const proveedorRepository = dataSource.getRepository(proveedor_entity_1.Proveedor);
            const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
            const entity = await proveedorRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`Proveedor ID ${id} not found`);
            // Check dependencies (Compras)
            const comprasCount = await compraRepository.count({ where: { proveedor: { id } } });
            if (comprasCount > 0) {
                throw new Error('No se puede eliminar el proveedor porque tiene compras asociadas. Considere desactivarlo.');
            }
            // If no dependencies, proceed with hard delete
            const result = await proveedorRepository.remove(entity);
            return { success: true, affected: 1 }; // Mimic delete result
        }
        catch (error) {
            console.error(`Error deleting proveedor ID ${id}:`, error);
            throw error;
        }
    });
    // --- Compra Handlers ---
    electron_1.ipcMain.handle('getCompras', async () => {
        try {
            const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
            return await compraRepository.find({
                relations: ['proveedor', 'proveedor.persona', 'moneda', 'pago', 'detalles', 'formaPago', 'detalles.producto', 'detalles.ingrediente', 'detalles.presentacion'],
            });
        }
        catch (error) {
            console.error('Error getting compras:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getCompra', async (_event, id) => {
        try {
            const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
            const compra = await compraRepository.findOne({
                where: { id },
                relations: ['proveedor', 'proveedor.persona', 'pago', 'moneda', 'formaPago', 'detalles', 'detalles.producto', 'detalles.ingrediente', 'detalles.presentacion']
            });
            if (!compra)
                throw new Error(`Compra ID ${id} not found`);
            // Calculation of total should be frontend/service layer
            return compra;
        }
        catch (error) {
            console.error(`Error getting compra ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createCompra', async (_event, data) => {
        try {
            const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
            const { detalles, ...compraOnly } = data; // Separate details
            const entity = compraRepository.create(compraOnly);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await compraRepository.save(entity);
            // Details should be saved separately after the Compra is created
        }
        catch (error) {
            console.error('Error creating compra:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateCompra', async (_event, id, data) => {
        try {
            const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
            const { detalles, ...compraOnly } = data;
            const entity = await compraRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`Compra ID ${id} not found`);
            compraRepository.merge(entity, compraOnly);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await compraRepository.save(entity);
            // Details update should be handled separately
        }
        catch (error) {
            console.error(`Error updating compra ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteCompra', async (_event, id) => {
        // Note: Hard delete. Consider soft delete or implications for related entities (Detalles, Pago)
        try {
            const compraRepository = dataSource.getRepository(compra_entity_1.Compra);
            const compraDetalleRepository = dataSource.getRepository(compra_detalle_entity_1.CompraDetalle);
            const entity = await compraRepository.findOne({ where: { id }, relations: ['detalles'] });
            if (!entity)
                throw new Error(`Compra ID ${id} not found`);
            // Manually delete details first if cascade is not set up
            if (entity.detalles && entity.detalles.length > 0) {
                await compraDetalleRepository.remove(entity.detalles);
            }
            // Delete the compra
            await compraRepository.remove(entity);
            return { success: true, affected: 1 };
        }
        catch (error) {
            console.error(`Error deleting compra ID ${id}:`, error);
            throw error;
        }
    });
    // --- CompraDetalle Handlers ---
    electron_1.ipcMain.handle('getCompraDetalles', async (_event, compraId) => {
        try {
            const compraDetalleRepository = dataSource.getRepository(compra_detalle_entity_1.CompraDetalle);
            return await compraDetalleRepository.find({
                where: { compra: { id: compraId } },
                relations: ['producto', 'ingrediente', 'presentacion'],
                order: { id: 'ASC' }
            });
        }
        catch (error) {
            console.error(`Error getting compra detalles for compra ${compraId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createCompraDetalle', async (_event, data) => {
        try {
            const compraDetalleRepository = dataSource.getRepository(compra_detalle_entity_1.CompraDetalle);
            const entity = compraDetalleRepository.create(data);
            // No user tracking usually for details
            return await compraDetalleRepository.save(entity);
        }
        catch (error) {
            console.error('Error creating compra detalle:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateCompraDetalle', async (_event, id, data) => {
        try {
            const compraDetalleRepository = dataSource.getRepository(compra_detalle_entity_1.CompraDetalle);
            const entity = await compraDetalleRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`CompraDetalle ID ${id} not found`);
            compraDetalleRepository.merge(entity, data);
            // No user tracking usually
            return await compraDetalleRepository.save(entity);
        }
        catch (error) {
            console.error(`Error updating compra detalle ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteCompraDetalle', async (_event, id) => {
        // Note: Hard delete.
        try {
            const compraDetalleRepository = dataSource.getRepository(compra_detalle_entity_1.CompraDetalle);
            const entity = await compraDetalleRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`CompraDetalle ID ${id} not found`);
            await compraDetalleRepository.remove(entity);
            return { success: true, affected: 1 };
        }
        catch (error) {
            console.error(`Error deleting compra detalle ID ${id}:`, error);
            throw error;
        }
    });
    // --- Pago Handlers ---
    electron_1.ipcMain.handle('getPagos', async () => {
        try {
            const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
            return await pagoRepository.find({
                relations: ['caja', 'detalles', 'compras', 'createdBy', 'updatedBy'], // Include tracking relations
            });
        }
        catch (error) {
            console.error('Error getting pagos:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getPago', async (_event, id) => {
        try {
            const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
            return await pagoRepository.findOne({
                where: { id },
                relations: ['caja', 'detalles', 'compras', 'createdBy', 'updatedBy'] // Include tracking relations
            });
        }
        catch (error) {
            console.error(`Error getting pago ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPago', async (_event, data) => {
        try {
            const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
            const entity = pagoRepository.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await pagoRepository.save(entity);
            // Details and Compra associations should be handled separately
        }
        catch (error) {
            console.error('Error creating pago:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePago', async (_event, id, data) => {
        try {
            const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
            const entity = await pagoRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`Pago ID ${id} not found`);
            pagoRepository.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await pagoRepository.save(entity);
            // Details and Compra associations update should be handled separately
        }
        catch (error) {
            console.error(`Error updating pago ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePago', async (_event, id) => {
        // Note: Hard delete. Consider soft delete.
        try {
            const pagoRepository = dataSource.getRepository(pago_entity_1.Pago);
            const pagoDetalleRepository = dataSource.getRepository(pago_detalle_entity_1.PagoDetalle);
            const entity = await pagoRepository.findOne({ where: { id }, relations: ['detalles'] });
            if (!entity)
                throw new Error(`Pago ID ${id} not found`);
            // Manually delete details first if cascade is not set up
            if (entity.detalles && entity.detalles.length > 0) {
                await pagoDetalleRepository.remove(entity.detalles);
            }
            await pagoRepository.remove(entity);
            return { success: true, affected: 1 };
        }
        catch (error) {
            console.error(`Error deleting pago ID ${id}:`, error);
            throw error;
        }
    });
    // --- PagoDetalle Handlers ---
    electron_1.ipcMain.handle('getPagoDetalles', async (_event, pagoId) => {
        try {
            const pagoDetalleRepository = dataSource.getRepository(pago_detalle_entity_1.PagoDetalle);
            return await pagoDetalleRepository.find({
                where: { pago: { id: pagoId } },
                relations: ['moneda', 'formaPago'],
                order: { id: 'ASC' }
            });
        }
        catch (error) {
            console.error(`Error getting pago detalles for pago ${pagoId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createPagoDetalle', async (_event, data) => {
        try {
            const pagoDetalleRepository = dataSource.getRepository(pago_detalle_entity_1.PagoDetalle);
            const entity = pagoDetalleRepository.create(data);
            // No user tracking usually
            return await pagoDetalleRepository.save(entity);
        }
        catch (error) {
            console.error('Error creating pago detalle:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updatePagoDetalle', async (_event, id, data) => {
        try {
            const pagoDetalleRepository = dataSource.getRepository(pago_detalle_entity_1.PagoDetalle);
            const entity = await pagoDetalleRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`PagoDetalle ID ${id} not found`);
            pagoDetalleRepository.merge(entity, data);
            // No user tracking usually
            return await pagoDetalleRepository.save(entity);
        }
        catch (error) {
            console.error(`Error updating pago detalle ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deletePagoDetalle', async (_event, id) => {
        // Note: Hard delete.
        try {
            const pagoDetalleRepository = dataSource.getRepository(pago_detalle_entity_1.PagoDetalle);
            const entity = await pagoDetalleRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`PagoDetalle ID ${id} not found`);
            await pagoDetalleRepository.remove(entity);
            return { success: true, affected: 1 };
        }
        catch (error) {
            console.error(`Error deleting pago detalle ID ${id}:`, error);
            throw error;
        }
    });
    // --- ProveedorProducto Handlers ---
    electron_1.ipcMain.handle('getProveedorProductos', async (_event, proveedorId) => {
        try {
            const proveedorProductoRepository = dataSource.getRepository(proveedor_producto_entity_1.ProveedorProducto);
            return await proveedorProductoRepository.find({
                where: { proveedor: { id: proveedorId }, activo: true },
                relations: ['producto', 'ingrediente', 'compra'],
                order: { id: 'ASC' } // Added default ordering
            });
        }
        catch (error) {
            console.error(`Error getting proveedor productos for proveedor ${proveedorId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getProveedorProducto', async (_event, id) => {
        try {
            const proveedorProductoRepository = dataSource.getRepository(proveedor_producto_entity_1.ProveedorProducto);
            return await proveedorProductoRepository.findOne({
                where: { id },
                relations: ['producto', 'ingrediente', 'compra', 'proveedor']
            });
        }
        catch (error) {
            console.error(`Error getting proveedor producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createProveedorProducto', async (_event, data) => {
        try {
            const proveedorProductoRepository = dataSource.getRepository(proveedor_producto_entity_1.ProveedorProducto);
            const entity = proveedorProductoRepository.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await proveedorProductoRepository.save(entity);
        }
        catch (error) {
            console.error('Error creating proveedor producto:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateProveedorProducto', async (_event, id, data) => {
        try {
            const proveedorProductoRepository = dataSource.getRepository(proveedor_producto_entity_1.ProveedorProducto);
            const entity = await proveedorProductoRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`ProveedorProducto ID ${id} not found`);
            proveedorProductoRepository.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await proveedorProductoRepository.save(entity);
        }
        catch (error) {
            console.error(`Error updating proveedor producto ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteProveedorProducto', async (_event, id) => {
        // Using soft delete
        try {
            const proveedorProductoRepository = dataSource.getRepository(proveedor_producto_entity_1.ProveedorProducto);
            const entity = await proveedorProductoRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`ProveedorProducto ID ${id} not found`);
            entity.activo = false;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true); // Track soft delete
            await proveedorProductoRepository.save(entity);
            return { success: true, affected: 1 };
        }
        catch (error) {
            console.error(`Error soft deleting proveedor producto ID ${id}:`, error);
            throw error;
        }
    });
    // --- FormasPago Handlers ---
    electron_1.ipcMain.handle('getFormasPago', async () => {
        try {
            const formasPagoRepository = dataSource.getRepository(forma_pago_entity_1.FormasPago);
            return await formasPagoRepository.find({
                where: { activo: true },
            });
        }
        catch (error) {
            console.error('Error getting formas de pago:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getFormaPago', async (_event, id) => {
        try {
            const formasPagoRepository = dataSource.getRepository(forma_pago_entity_1.FormasPago);
            return await formasPagoRepository.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting forma de pago ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createFormaPago', async (_event, data) => {
        try {
            const formasPagoRepository = dataSource.getRepository(forma_pago_entity_1.FormasPago);
            const entity = formasPagoRepository.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, false);
            return await formasPagoRepository.save(entity);
        }
        catch (error) {
            console.error('Error creating forma de pago:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateFormaPago', async (_event, id, data) => {
        try {
            const formasPagoRepository = dataSource.getRepository(forma_pago_entity_1.FormasPago);
            const entity = await formasPagoRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`FormaPago ID ${id} not found`);
            formasPagoRepository.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true);
            return await formasPagoRepository.save(entity);
        }
        catch (error) {
            console.error(`Error updating forma de pago ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteFormaPago', async (_event, id) => {
        // Using soft delete
        try {
            const formasPagoRepository = dataSource.getRepository(forma_pago_entity_1.FormasPago);
            const entity = await formasPagoRepository.findOneBy({ id });
            if (!entity)
                throw new Error(`FormaPago ID ${id} not found`);
            entity.activo = false;
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, currentUser?.id, true); // Track soft delete
            await formasPagoRepository.save(entity);
            return { success: true, affected: 1 };
        }
        catch (error) {
            console.error(`Error soft deleting forma de pago ID ${id}:`, error);
            throw error;
        }
    });
}
exports.registerComprasHandlers = registerComprasHandlers;
//# sourceMappingURL=compras.handler.js.map