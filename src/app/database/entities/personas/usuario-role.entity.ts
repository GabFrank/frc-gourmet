import { Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from './usuario.entity';
import { Role } from './role.entity';

/**
 * Entity representing the many-to-many relationship between users and roles
 */
@Entity('usuario_roles')
export class UsuarioRole extends BaseModel {
  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role!: Role;
} 