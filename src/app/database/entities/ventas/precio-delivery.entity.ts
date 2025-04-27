import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing delivery price options
 */
@Entity('precios_delivery')
export class PrecioDelivery extends BaseModel {
  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor!: number;

  @Column({ default: true })
  activo!: boolean;
} 