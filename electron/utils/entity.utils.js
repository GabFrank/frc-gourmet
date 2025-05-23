"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setEntityUserTracking = void 0;
const usuario_entity_1 = require("../../src/app/database/entities/personas/usuario.entity");
/**
 * Helper function to handle user tracking for created/updated entities.
 * Sets the createdBy (on create) and updatedBy fields based on the provided user.
 *
 * @param dataSource The TypeORM DataSource instance.
 * @param entity The entity instance to update.
 * @param usuarioId The ID of the user performing the action. Can be undefined if no user context.
 * @param isUpdate Flag indicating if this is an update operation (true) or creation (false).
 */
async function setEntityUserTracking(dataSource, entity, usuarioId, isUpdate) {
    if (!usuarioId) {
        console.warn('setEntityUserTracking called without usuarioId for entity:', entity.constructor.name);
        // Proceed without setting tracking, but don't exit early
    }
    else {
        try {
            const usuarioRepository = dataSource.getRepository(usuario_entity_1.Usuario);
            // Use findOneBy for potentially better performance when querying by ID
            const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
            if (usuario) {
                if (!isUpdate) {
                    entity.createdBy = usuario; // Set createdBy only on creation
                }
                entity.updatedBy = usuario; // Set updatedBy on both create and update
            }
            else {
                console.warn(`setEntityUserTracking: Usuario with ID ${usuarioId} not found for entity:`, entity.constructor.name);
            }
        }
        catch (error) {
            console.error(`Error setting user tracking (${isUpdate ? 'update' : 'create'}) for entity ${entity.constructor.name}:`, error);
            // Log the error and continue
        }
    }
}
exports.setEntityUserTracking = setEntityUserTracking;
//# sourceMappingURL=entity.utils.js.map