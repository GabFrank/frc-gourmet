import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Caja } from '../financiero/caja.entity';
import { PagoEstado } from './estado.enum';
import { Compra } from './compra.entity';
import type { PagoDetalle } from './pago-detalle.entity';

/**
 * Entity representing a payment to suppliers
 */
@Entity('pagos')
export class Pago extends BaseModel {
  @Column({
    type: 'text',
    enum: PagoEstado,
    default: PagoEstado.ABIERTO
  })
  estado!: PagoEstado;

  @Column({ default: true })
  activo!: boolean;

  // Relationships
  @ManyToOne(() => Caja)
  @JoinColumn({ name: 'caja_id' })
  caja!: Caja;

  @OneToMany('PagoDetalle', 'pago')
  detalles!: PagoDetalle[];

  @OneToMany(() => Compra, compra => compra.pago)
  compras!: Compra[];
}
