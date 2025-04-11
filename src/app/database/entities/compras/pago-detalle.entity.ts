import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from '../financiero/moneda.entity';
// Import type reference to avoid circular dependency
import type { Pago } from './pago.entity';

/**
 * Entity representing payment details for supplier payments
 */
@Entity('pagos_detalles')
export class PagoDetalle extends BaseModel {
  @Column('decimal', { precision: 10, scale: 2 })
  valor!: number;

  @Column({ default: true })
  activo!: boolean;

  // Relationships
  @ManyToOne('Pago', 'detalles', {
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'pago_id' })
  pago!: Pago; // Use type import for type checking

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;
}
