"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerFinancieroHandlers = void 0;
const electron_1 = require("electron");
const typeorm_1 = require("typeorm");
const moneda_entity_1 = require("../../src/app/database/entities/financiero/moneda.entity");
const tipo_precio_entity_1 = require("../../src/app/database/entities/financiero/tipo-precio.entity");
const moneda_billete_entity_1 = require("../../src/app/database/entities/financiero/moneda-billete.entity");
const conteo_entity_1 = require("../../src/app/database/entities/financiero/conteo.entity");
const conteo_detalle_entity_1 = require("../../src/app/database/entities/financiero/conteo-detalle.entity");
const dispositivo_entity_1 = require("../../src/app/database/entities/financiero/dispositivo.entity");
const caja_entity_1 = require("../../src/app/database/entities/financiero/caja.entity");
const caja_moneda_entity_1 = require("../../src/app/database/entities/financiero/caja-moneda.entity");
const moneda_cambio_entity_1 = require("../../src/app/database/entities/financiero/moneda-cambio.entity");
const entity_utils_1 = require("../utils/entity.utils");
function registerFinancieroHandlers(dataSource, getCurrentUser) {
    // Remove this line - get the current user in each handler instead
    // const currentUser = getCurrentUser(); // Get user for tracking
    // --- Moneda Handlers ---
    electron_1.ipcMain.handle('getMonedas', async () => {
        try {
            const repo = dataSource.getRepository(moneda_entity_1.Moneda);
            return await repo.find({ order: { principal: 'DESC', denominacion: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting monedas:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getMoneda', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(moneda_entity_1.Moneda);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting moneda ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createMoneda', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(moneda_entity_1.Moneda);
            if (data.principal) {
                await repo.update({ principal: true }, { principal: false });
            }
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating moneda:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateMoneda', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(moneda_entity_1.Moneda);
            if (data.principal) {
                await repo.update({ principal: true, id: (0, typeorm_1.Not)(id) }, { principal: false });
            }
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Moneda ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating moneda ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteMoneda', async (_event, id) => {
        // Note: Hard delete. Consider dependencies (PrecioVenta, MonedaBillete, CajaMoneda, etc.)
        try {
            const repo = dataSource.getRepository(moneda_entity_1.Moneda);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Moneda ID ${id} not found`);
            if (entity.principal) {
                throw new Error('No se puede eliminar la moneda principal. Establezca otra moneda como principal primero.');
            }
            // Add more dependency checks here before deleting
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting moneda ID ${id}:`, error);
            throw error;
        }
    });
    // --- TipoPrecio Handlers ---
    electron_1.ipcMain.handle('getTipoPrecios', async () => {
        try {
            const repo = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
            return await repo.find({ order: { descripcion: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting tipos de precio:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('getTipoPrecio', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting tipo de precio ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('createTipoPrecio', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating tipo de precio:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('updateTipoPrecio', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`TipoPrecio ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating tipo de precio ID ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('deleteTipoPrecio', async (_event, id) => {
        // Note: Hard delete. Consider dependencies (PrecioVenta)
        try {
            const repo = dataSource.getRepository(tipo_precio_entity_1.TipoPrecio);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`TipoPrecio ID ${id} not found`);
            // Add dependency checks here
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting tipo de precio ID ${id}:`, error);
            throw error;
        }
    });
    // --- MonedaBillete Handlers ---
    electron_1.ipcMain.handle('get-monedas-billetes', async () => {
        try {
            const repo = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
            return await repo.find({ relations: ['moneda'], order: { moneda: { id: 'ASC' }, valor: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting monedas billetes:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-moneda-billete', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
            return await repo.findOne({ where: { id }, relations: ['moneda'] });
        }
        catch (error) {
            console.error(`Error getting moneda billete ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-moneda-billete', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating moneda billete:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-moneda-billete', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`MonedaBillete ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating moneda billete ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-moneda-billete', async (_event, id) => {
        // Note: Hard delete. Consider dependencies (ConteoDetalle)
        try {
            const repo = dataSource.getRepository(moneda_billete_entity_1.MonedaBillete);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`MonedaBillete ID ${id} not found`);
            // Add dependency checks here
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting moneda billete ${id}:`, error);
            throw error;
        }
    });
    // --- Conteo Handlers ---
    electron_1.ipcMain.handle('get-conteos', async () => {
        try {
            const repo = dataSource.getRepository(conteo_entity_1.Conteo);
            // Adjust relations as needed for display/calculation
            return await repo.find({ relations: ['detalles', 'detalles.monedaBillete', 'detalles.monedaBillete.moneda', 'createdBy', 'updatedBy'], order: { id: 'DESC' } });
        }
        catch (error) {
            console.error('Error getting conteos:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-conteo', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(conteo_entity_1.Conteo);
            return await repo.findOne({ where: { id }, relations: ['detalles', 'detalles.monedaBillete', 'detalles.monedaBillete.moneda', 'createdBy', 'updatedBy'] });
        }
        catch (error) {
            console.error(`Error getting conteo ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-conteo', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(conteo_entity_1.Conteo);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating conteo:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-conteo', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(conteo_entity_1.Conteo);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Conteo ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating conteo ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-conteo', async (_event, id) => {
        // Note: Hard delete. Conteos might be linked to Cajas, consider implications.
        try {
            const repo = dataSource.getRepository(conteo_entity_1.Conteo);
            const entity = await repo.findOne({ where: { id }, relations: ['detalles'] }); // Load detalles to delete them first
            if (!entity)
                throw new Error(`Conteo ID ${id} not found`);
            // Manually delete details first if cascade delete is not set up
            if (entity.detalles && entity.detalles.length > 0) {
                const detalleRepo = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
                await detalleRepo.remove(entity.detalles);
            }
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting conteo ${id}:`, error);
            throw error;
        }
    });
    // --- ConteoDetalle Handlers ---
    electron_1.ipcMain.handle('get-conteo-detalles', async (_event, conteoId) => {
        try {
            const repo = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
            return await repo.find({ where: { conteo: { id: conteoId } }, relations: ['monedaBillete', 'monedaBillete.moneda'] });
        }
        catch (error) {
            console.error(`Error getting conteo detalles for conteo ${conteoId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-conteo-detalle', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
            return await repo.findOne({ where: { id }, relations: ['conteo', 'monedaBillete', 'monedaBillete.moneda'] });
        }
        catch (error) {
            console.error(`Error getting conteo detalle ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-conteo-detalle', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
            const entity = repo.create(data);
            // No user tracking needed usually for details
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating conteo detalle:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-conteo-detalle', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ConteoDetalle ID ${id} not found`);
            repo.merge(entity, data);
            // No user tracking needed usually
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating conteo detalle ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-conteo-detalle', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(conteo_detalle_entity_1.ConteoDetalle);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`ConteoDetalle ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting conteo detalle ${id}:`, error);
            throw error;
        }
    });
    // --- Dispositivo Handlers ---
    electron_1.ipcMain.handle('get-dispositivos', async () => {
        try {
            const repo = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
            return await repo.find({ order: { nombre: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting dispositivos:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-dispositivo', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
            return await repo.findOneBy({ id });
        }
        catch (error) {
            console.error(`Error getting dispositivo ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-dispositivo', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
            // Add validation for unique name/MAC here if needed
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating dispositivo:', error);
            throw error; // Let renderer handle specific messages (like duplicates)
        }
    });
    electron_1.ipcMain.handle('update-dispositivo', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
            // Add validation for unique name/MAC (excluding self) here if needed
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Dispositivo ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating dispositivo ${id}:`, error);
            throw error; // Let renderer handle specific messages
        }
    });
    electron_1.ipcMain.handle('delete-dispositivo', async (_event, id) => {
        // Note: Hard delete. Consider dependencies (Caja)
        try {
            const repo = dataSource.getRepository(dispositivo_entity_1.Dispositivo);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Dispositivo ID ${id} not found`);
            // Add dependency checks here
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting dispositivo ${id}:`, error);
            throw error;
        }
    });
    // --- Caja Handlers ---
    electron_1.ipcMain.handle('get-cajas', async () => {
        try {
            const repo = dataSource.getRepository(caja_entity_1.Caja);
            return await repo.find({
                relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona'],
                order: { fechaApertura: 'DESC' }
            });
        }
        catch (error) {
            console.error('Error getting cajas:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-caja', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(caja_entity_1.Caja);
            return await repo.findOne({
                where: { id },
                relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona']
            });
        }
        catch (error) {
            console.error(`Error getting caja ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-caja-by-dispositivo', async (_event, dispositivoId) => {
        try {
            const repo = dataSource.getRepository(caja_entity_1.Caja);
            return await repo.find({
                where: { dispositivo: { id: dispositivoId } },
                relations: ['dispositivo', 'conteoApertura', 'conteoCierre', 'revisadoPor', 'revisadoPor.persona', 'createdBy', 'createdBy.persona'],
                order: { fechaApertura: 'DESC' }
            });
        }
        catch (error) {
            console.error(`Error getting cajas for dispositivo ${dispositivoId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-caja', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(caja_entity_1.Caja);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating caja:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-caja', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(caja_entity_1.Caja);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Caja ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating caja ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-caja', async (_event, id) => {
        // Note: Hard delete. Consider implications if caja records are critical audit trails.
        try {
            const repo = dataSource.getRepository(caja_entity_1.Caja);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`Caja ID ${id} not found`);
            // Check if related conteos should also be deleted?
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting caja ${id}:`, error);
            throw error;
        }
    });
    // get-caja-abierta-por-usuario
    electron_1.ipcMain.handle('get-caja-abierta-by-usuario', async (_event, usuarioId) => {
        try {
            const repo = dataSource.getRepository(caja_entity_1.Caja);
            return await repo.findOne({ where: { createdBy: { id: usuarioId }, estado: caja_entity_1.CajaEstado.ABIERTO } });
        }
        catch (error) {
            console.error('Error getting caja abierta por usuario:', error);
            throw error;
        }
    });
    // --- CajaMoneda Handlers ---
    electron_1.ipcMain.handle('get-cajas-monedas', async () => {
        try {
            const repo = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
            return await repo.find({ relations: ['moneda'], order: { orden: 'ASC' } });
        }
        catch (error) {
            console.error('Error getting cajas monedas:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-caja-moneda', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
            return await repo.findOne({ where: { id }, relations: ['moneda'] });
        }
        catch (error) {
            console.error('Error getting caja moneda:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-caja-moneda', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
            const entity = repo.create(data);
            // No user tracking typically needed for config like this
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating caja moneda:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-caja-moneda', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`CajaMoneda ID ${id} not found`);
            repo.merge(entity, data);
            // No user tracking typically needed
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error updating caja moneda:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-caja-moneda', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(caja_moneda_entity_1.CajaMoneda);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`CajaMoneda ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error('Error deleting caja moneda:', error);
            throw error;
        }
    });
    // Bulk save for CajaMoneda settings
    electron_1.ipcMain.handle('save-cajas-monedas', async (_event, updates) => {
        const queryRunner = dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            const results = [];
            for (const update of updates) {
                const { id, monedaId, ...updateData } = update;
                const processedUpdate = { ...updateData };
                if (monedaId) {
                    processedUpdate.moneda = { id: monedaId }; // Assign relation by ID
                }
                if (id) {
                    await queryRunner.manager.update(caja_moneda_entity_1.CajaMoneda, id, processedUpdate);
                    results.push({ success: true, id, operation: 'update' });
                }
                else {
                    const result = await queryRunner.manager.insert(caja_moneda_entity_1.CajaMoneda, processedUpdate);
                    const insertedId = result.identifiers[0]?.['id'];
                    results.push({ success: true, id: insertedId, operation: 'insert' });
                }
            }
            await queryRunner.commitTransaction();
            return { success: true, results };
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            console.error('Error saving cajas monedas (transaction rolled back):', error);
            throw error;
        }
        finally {
            await queryRunner.release();
        }
    });
    // --- MonedaCambio Handlers ---
    electron_1.ipcMain.handle('get-monedas-cambio', async () => {
        try {
            const repo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
            return await repo.find({ relations: ['monedaOrigen', 'monedaDestino'], order: { createdAt: 'DESC' } });
        }
        catch (error) {
            console.error('Error getting monedas cambio:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-monedas-cambio-by-moneda-origen', async (_event, monedaOrigenId) => {
        try {
            const repo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
            return await repo.find({
                where: { monedaOrigen: { id: monedaOrigenId } },
                relations: ['monedaOrigen', 'monedaDestino'],
                order: { createdAt: 'DESC' }
            });
        }
        catch (error) {
            console.error(`Error getting monedas cambio for origen ${monedaOrigenId}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('get-moneda-cambio', async (_event, id) => {
        try {
            const repo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
            return await repo.findOne({ where: { id }, relations: ['monedaOrigen', 'monedaDestino'] });
        }
        catch (error) {
            console.error(`Error getting moneda cambio ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('create-moneda-cambio', async (_event, data) => {
        try {
            const repo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
            const entity = repo.create(data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, false);
            return await repo.save(entity);
        }
        catch (error) {
            console.error('Error creating moneda cambio:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('update-moneda-cambio', async (_event, id, data) => {
        try {
            const repo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`MonedaCambio ID ${id} not found`);
            repo.merge(entity, data);
            await (0, entity_utils_1.setEntityUserTracking)(dataSource, entity, getCurrentUser()?.id, true);
            return await repo.save(entity);
        }
        catch (error) {
            console.error(`Error updating moneda cambio ${id}:`, error);
            throw error;
        }
    });
    electron_1.ipcMain.handle('delete-moneda-cambio', async (_event, id) => {
        // Note: Hard delete.
        try {
            const repo = dataSource.getRepository(moneda_cambio_entity_1.MonedaCambio);
            const entity = await repo.findOneBy({ id });
            if (!entity)
                throw new Error(`MonedaCambio ID ${id} not found`);
            return await repo.remove(entity);
        }
        catch (error) {
            console.error(`Error deleting moneda cambio ${id}:`, error);
            throw error;
        }
    });
}
exports.registerFinancieroHandlers = registerFinancieroHandlers;
//# sourceMappingURL=financiero.handler.js.map