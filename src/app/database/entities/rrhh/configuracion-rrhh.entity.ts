import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { ConfiguracionRrhhTipo } from './configuracion-rrhh-tipo.enum';

/**
 * Configuracion key/value para parametros del modulo RRHH (IPS%, vacaciones, etc.).
 */
@Entity('configuraciones_rrhh')
export class ConfiguracionRrhh extends BaseModel {
  @Index({ unique: true })
  @Column()
  clave!: string;

  @Column({ nullable: true })
  valor?: string;

  @Column({
    type: 'text',
    enum: ConfiguracionRrhhTipo,
    default: ConfiguracionRrhhTipo.STRING
  })
  tipo!: ConfiguracionRrhhTipo;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ default: true })
  activo!: boolean;
}
