import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing a user role for access control
 */
@Entity('roles')
export class Role extends BaseModel {
  @Column()
  descripcion!: string;

  @Column({ default: true })
  activo!: boolean;
} 