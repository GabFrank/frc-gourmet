import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Permiso granular del sistema. Codigo UPPERCASE unico.
 * Ejemplos: RRHH_VALE_CREAR, RRHH_LIQUIDACION_APROBAR, COMISION_REGLA_EDITAR.
 */
@Entity('permissions')
export class Permission extends BaseModel {
  @Index({ unique: true })
  @Column()
  codigo!: string;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ nullable: true })
  modulo?: string;

  @Column({ default: true })
  activo!: boolean;
}
