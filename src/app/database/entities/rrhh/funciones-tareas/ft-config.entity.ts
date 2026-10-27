import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../../base.entity';

/**
 * Configuración clave/valor del módulo (intervalo del motor, activo global, grupo ADM destino,
 * umbral de reincidencia) y el lock del motor (`motor_lock`: dueño + expiración).
 */
@Entity('ft_config')
@Index('UQ_ft_config_clave', ['clave'], { unique: true })
export class FtConfig extends BaseModel {
  @Column({ type: 'varchar', length: 60 })
  clave!: string;

  @Column({ type: 'text', nullable: true })
  valor?: string | null;
}
