import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

/**
 * Helper function to handle user tracking for created/updated entities.
 * Sets the createdBy (on create) and updatedBy fields based on the provided user.
 *
 * @param dataSource The TypeORM DataSource instance.
 * @param entity The entity instance to update.
 * @param usuarioId The ID of the user performing the action. Can be undefined if no user context.
 * @param isUpdate Flag indicating if this is an update operation (true) or creation (false).
 */
export async function setEntityUserTracking(dataSource: DataSource, entity: any, usuarioId: number | undefined, isUpdate: boolean) {
  if (!usuarioId) {
    console.warn('setEntityUserTracking called without usuarioId for entity:', entity.constructor.name);
    return; // No user ID provided, cannot track
  }

  try {
    const usuarioRepository = dataSource.getRepository(Usuario);
    // Use findOneBy for potentially better performance when querying by ID
    const usuario = await usuarioRepository.findOneBy({ id: usuarioId });

    if (usuario) {
      if (!isUpdate) {
        entity.createdBy = usuario; // Set createdBy only on creation
      }
      entity.updatedBy = usuario; // Set updatedBy on both create and update
    } else {
      console.warn(`setEntityUserTracking: Usuario with ID ${usuarioId} not found for entity:`, entity.constructor.name);
    }
  } catch (error) {
    console.error(`Error setting user tracking (${isUpdate ? 'update' : 'create'}) for entity ${entity.constructor.name}:`, error);
    // Decide if you want to throw the error or allow the operation to continue without tracking
    // For now, log the error and continue
  }
} 