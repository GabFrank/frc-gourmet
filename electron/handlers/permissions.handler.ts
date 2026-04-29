import { ipcMain } from 'electron';
import { DataSource, In } from 'typeorm';
import { Permission } from '../../src/app/database/entities/personas/permission.entity';
import { RolePermission } from '../../src/app/database/entities/personas/role-permission.entity';
import { UsuarioRole } from '../../src/app/database/entities/personas/usuario-role.entity';
import { Role } from '../../src/app/database/entities/personas/role.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { setEntityUserTracking } from '../utils/entity.utils';

const SEED_PERMISOS: Array<{ codigo: string; descripcion: string; modulo: string }> = [
  // RRHH - Funcionarios
  { codigo: 'RRHH_FUNCIONARIO_VER', descripcion: 'Ver funcionarios', modulo: 'RRHH' },
  { codigo: 'RRHH_FUNCIONARIO_EDITAR', descripcion: 'Crear/editar funcionarios', modulo: 'RRHH' },
  { codigo: 'RRHH_FUNCIONARIO_EGRESAR', descripcion: 'Registrar egreso de funcionario', modulo: 'RRHH' },
  // RRHH - Asistencias
  { codigo: 'RRHH_ASISTENCIA_REGISTRAR', descripcion: 'Registrar asistencias', modulo: 'RRHH' },
  { codigo: 'RRHH_ASISTENCIA_JUSTIFICAR', descripcion: 'Justificar asistencias', modulo: 'RRHH' },
  // RRHH - Vales / Adelantos / Préstamos
  { codigo: 'RRHH_VALE_CREAR', descripcion: 'Crear vales/adelantos', modulo: 'RRHH' },
  { codigo: 'RRHH_VALE_CONFIRMAR', descripcion: 'Confirmar vales/adelantos', modulo: 'RRHH' },
  { codigo: 'RRHH_VALE_ANULAR', descripcion: 'Anular vales/adelantos', modulo: 'RRHH' },
  { codigo: 'RRHH_PRESTAMO_OTORGAR', descripcion: 'Otorgar préstamos a funcionarios', modulo: 'RRHH' },
  // RRHH - Liquidaciones
  { codigo: 'RRHH_LIQUIDACION_GENERAR', descripcion: 'Generar liquidaciones de sueldo', modulo: 'RRHH' },
  { codigo: 'RRHH_LIQUIDACION_APROBAR', descripcion: 'Aprobar liquidaciones de sueldo', modulo: 'RRHH' },
  { codigo: 'RRHH_LIQUIDACION_PAGAR', descripcion: 'Pagar liquidaciones desde caja mayor', modulo: 'RRHH' },
  { codigo: 'RRHH_LIQUIDACION_ANULAR', descripcion: 'Anular liquidaciones pagadas', modulo: 'RRHH' },
  // RRHH - Vacaciones / Liquidación final
  { codigo: 'RRHH_VACACION_GESTIONAR', descripcion: 'Gestionar vacaciones', modulo: 'RRHH' },
  { codigo: 'RRHH_LIQUIDACION_FINAL_GENERAR', descripcion: 'Generar liquidaciones finales', modulo: 'RRHH' },
  // RRHH - Penalizaciones / Bonos
  { codigo: 'RRHH_PENALIZACION_REGISTRAR', descripcion: 'Registrar penalizaciones', modulo: 'RRHH' },
  { codigo: 'RRHH_BONO_OTORGAR', descripcion: 'Otorgar bonos manuales', modulo: 'RRHH' },
  // RRHH - Configuración
  { codigo: 'RRHH_CONFIG_EDITAR', descripcion: 'Editar configuración RRHH (IPS, vacaciones, etc.)', modulo: 'RRHH' },
  // Comisiones
  { codigo: 'COMISION_REGLA_VER', descripcion: 'Ver reglas de comisión', modulo: 'COMISIONES' },
  { codigo: 'COMISION_REGLA_EDITAR', descripcion: 'Crear/editar reglas de comisión', modulo: 'COMISIONES' },
  { codigo: 'COMISION_LIQUIDACION_GENERAR', descripcion: 'Generar liquidaciones de comisión', modulo: 'COMISIONES' },
  { codigo: 'COMISION_LIQUIDACION_APROBAR', descripcion: 'Aprobar liquidaciones de comisión', modulo: 'COMISIONES' },
  // Permisos sistema
  { codigo: 'SISTEMA_PERMISO_GESTIONAR', descripcion: 'Gestionar permisos y asignación a roles', modulo: 'SISTEMA' },
  { codigo: 'SISTEMA_ROL_GESTIONAR', descripcion: 'Gestionar roles del sistema', modulo: 'SISTEMA' },
];

export async function seedPermissions(dataSource: DataSource) {
  const repo = dataSource.getRepository(Permission);
  for (const seed of SEED_PERMISOS) {
    const existing = await repo.findOne({ where: { codigo: seed.codigo } });
    if (!existing) {
      const entity = repo.create({
        codigo: seed.codigo,
        descripcion: seed.descripcion,
        modulo: seed.modulo,
        activo: true,
      });
      await repo.save(entity);
    }
  }
}

export function registerPermissionsHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('get-permissions', async (_event, modulo?: string) => {
    try {
      const repo = dataSource.getRepository(Permission);
      const where: any = { activo: true };
      if (modulo) where.modulo = modulo.toUpperCase();
      return await repo.find({ where, order: { modulo: 'ASC', codigo: 'ASC' } });
    } catch (error) {
      console.error('Error getting permissions:', error);
      throw error;
    }
  });

  ipcMain.handle('get-all-permissions', async () => {
    try {
      const repo = dataSource.getRepository(Permission);
      return await repo.find({ order: { modulo: 'ASC', codigo: 'ASC' } });
    } catch (error) {
      console.error('Error getting all permissions:', error);
      throw error;
    }
  });

  ipcMain.handle('create-permission', async (_event, data: any) => {
    try {
      const repo = dataSource.getRepository(Permission);
      const entity = repo.create({
        codigo: (data.codigo || '').toUpperCase(),
        descripcion: data.descripcion,
        modulo: (data.modulo || '').toUpperCase(),
        activo: data.activo !== false,
      });
      await setEntityUserTracking(dataSource, entity, getCurrentUser()?.id, false);
      return await repo.save(entity);
    } catch (error) {
      console.error('Error creating permission:', error);
      throw error;
    }
  });

  ipcMain.handle('update-permission', async (_event, id: number, data: any) => {
    try {
      const repo = dataSource.getRepository(Permission);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new Error(`Permission ${id} no encontrado`);
      if (data.descripcion !== undefined) existing.descripcion = data.descripcion;
      if (data.modulo !== undefined) existing.modulo = (data.modulo || '').toUpperCase();
      if (data.activo !== undefined) existing.activo = data.activo;
      await setEntityUserTracking(dataSource, existing, getCurrentUser()?.id, true);
      return await repo.save(existing);
    } catch (error) {
      console.error(`Error updating permission ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('delete-permission', async (_event, id: number) => {
    try {
      const repo = dataSource.getRepository(Permission);
      await repo.delete(id);
      return { success: true };
    } catch (error) {
      console.error(`Error deleting permission ${id}:`, error);
      throw error;
    }
  });

  ipcMain.handle('get-role-permissions', async (_event, roleId: number) => {
    try {
      const repo = dataSource.getRepository(RolePermission);
      return await repo.find({
        where: { role: { id: roleId } as any },
        relations: ['permission', 'role'],
      });
    } catch (error) {
      console.error(`Error getting role permissions for role ${roleId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('set-role-permissions', async (_event, roleId: number, permissionIds: number[]) => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const rpRepo = queryRunner.manager.getRepository(RolePermission);
      const roleRepo = queryRunner.manager.getRepository(Role);
      const permRepo = queryRunner.manager.getRepository(Permission);

      const role = await roleRepo.findOne({ where: { id: roleId } });
      if (!role) throw new Error(`Role ${roleId} no encontrado`);

      // Borrar asignaciones existentes
      await rpRepo
        .createQueryBuilder()
        .delete()
        .where('role_id = :roleId', { roleId })
        .execute();

      // Crear nuevas asignaciones
      const permissions = permissionIds.length
        ? await permRepo.find({ where: { id: In(permissionIds) } })
        : [];
      const userId = getCurrentUser()?.id;
      for (const p of permissions) {
        const rp = rpRepo.create({ role, permission: p });
        await setEntityUserTracking(dataSource, rp, userId, false);
        await rpRepo.save(rp);
      }
      await queryRunner.commitTransaction();
      return { success: true, count: permissions.length };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error(`Error setting role permissions for role ${roleId}:`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  });

  ipcMain.handle('get-permissions-by-user', async (_event, userId: number) => {
    try {
      // Obtener roles del usuario
      const usuarioRoleRepo = dataSource.getRepository(UsuarioRole);
      const usuarioRoles = await usuarioRoleRepo.find({
        where: { usuario: { id: userId } as any },
        relations: ['role'],
      });
      if (!usuarioRoles.length) return [];

      const roleIds = usuarioRoles.map((ur) => ur.role.id);

      // Obtener permisos asociados a esos roles
      const rpRepo = dataSource.getRepository(RolePermission);
      const rolePerms = await rpRepo.find({
        where: { role: { id: In(roleIds) } as any },
        relations: ['permission'],
      });

      // Deduplicar por código
      const seen = new Set<string>();
      const result: Permission[] = [];
      for (const rp of rolePerms) {
        if (rp.permission && rp.permission.activo && !seen.has(rp.permission.codigo)) {
          seen.add(rp.permission.codigo);
          result.push(rp.permission);
        }
      }
      return result;
    } catch (error) {
      console.error(`Error getting permissions for user ${userId}:`, error);
      throw error;
    }
  });

  ipcMain.handle('seed-permissions', async () => {
    try {
      await seedPermissions(dataSource);
      return { success: true };
    } catch (error) {
      console.error('Error seeding permissions:', error);
      throw error;
    }
  });
}
