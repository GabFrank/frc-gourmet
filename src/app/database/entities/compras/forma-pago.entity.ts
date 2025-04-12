import { Entity, Column } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing payment methods
 */
@Entity('formas_pago')
export class FormasPago extends BaseModel {
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({ name: 'movimenta_caja', default: false })
  movimentaCaja!: boolean;
} 