import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Cliente } from '../personas/cliente.entity';
import { FormasPago } from '../compras/forma-pago.entity';
import { Caja } from '../financiero/caja.entity';
import { Pago } from '../compras/pago.entity';
import { Delivery } from './delivery.entity';
import type { PdvMesa } from './pdv-mesa.entity';

/**
 * Enum for sale states
 */
export enum VentaEstado {
  ABIERTA = 'ABIERTA',
  CONCLUIDA = 'CONCLUIDA',
  CANCELADA = 'CANCELADA'
}

/**
 * Entity representing a sale
 */
@Entity('ventas')
export class Venta extends BaseModel {
  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente;

  @Column({
    type: 'varchar',
    enum: VentaEstado,
    default: VentaEstado.ABIERTA
  })
  estado!: VentaEstado;

  @Column({ type: 'varchar', nullable: true })
  nombre_cliente?: string;

  @ManyToOne(() => FormasPago)
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago!: FormasPago;

  @ManyToOne(() => Caja)
  @JoinColumn({ name: 'caja_id' })
  caja!: Caja;

  @ManyToOne(() => Pago, { nullable: true })
  @JoinColumn({ name: 'pago_id' })
  pago?: Pago;

  @ManyToOne(() => Delivery, { nullable: true })
  @JoinColumn({ name: 'delivery_id' })
  delivery?: Delivery;

  @ManyToOne('PdvMesa', { nullable: true })
  @JoinColumn({ name: 'mesa_id' })
  mesa?: PdvMesa;

  @OneToMany('VentaItem', 'venta')
  items!: any[];

} 