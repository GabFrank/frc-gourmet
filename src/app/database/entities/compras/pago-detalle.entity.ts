import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from '../financiero/moneda.entity';
import { FormasPago } from './forma-pago.entity';
// Import type reference to avoid circular dependency
import type { Pago } from './pago.entity';

/**
 * Enum for payment detail types
 */
export enum TipoDetalle {
  PAGO = 'PAGO',            // Regular payment
  VUELTO = 'VUELTO',        // Change given back
  DESCUENTO = 'DESCUENTO',  // Discount applied 
  AUMENTO = 'AUMENTO'       // Additional amount paid
}

/**
 * Entity representing payment details for supplier payments
 */
@Entity('pagos_detalles')
export class PagoDetalle extends BaseModel {
  @Column('decimal', { precision: 10, scale: 2 })
  valor!: number;

  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({
    type: 'text',
    enum: TipoDetalle,
    default: TipoDetalle.PAGO
  })
  tipo!: TipoDetalle;

  // Relationships
  @ManyToOne('Pago', 'detalles', {
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'pago_id' })
  pago!: Pago; // Use type import for type checking

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @ManyToOne(() => FormasPago)
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago!: FormasPago;
}
