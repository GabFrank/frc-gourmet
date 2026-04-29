import { Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

/**
 * Many-to-many entre Role y Permission.
 */
@Entity('role_permissions')
export class RolePermission extends BaseModel {
  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Permission)
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission;
}
