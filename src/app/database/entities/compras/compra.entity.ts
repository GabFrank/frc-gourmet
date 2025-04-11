import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from '../financiero/moneda.entity';
import { CompraEstado } from './estado.enum';
// Import type references to avoid circular dependencies
import type { CompraDetalle } from './compra-detalle.entity';
import type { Pago } from './pago.entity';
import type { Proveedor } from './proveedor.entity';

/**
 * Entity representing a purchase from suppliers
 */
@Entity('compras')
export class Compra extends BaseModel {
  @Column({
    type: 'text',
    enum: CompraEstado,
    default: CompraEstado.ABIERTO
  })
  estado!: CompraEstado;

  @Column('decimal', { precision: 10, scale: 2 })
  total!: number;

  @Column({ default: false, name: 'is_recepcion_mercaderia' })
  isRecepcionMercaderia!: boolean;

  @Column({ default: true })
  activo!: boolean;

  // Relationships - Use string references to avoid circular dependencies
  @ManyToOne('Proveedor', 'compras', {
    nullable: true,
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: Proveedor;

  @ManyToOne('Pago', 'compras', {
    nullable: true,
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'pago_id' })
  pago?: Pago;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @OneToMany('CompraDetalle', 'compra')
  detalles!: CompraDetalle[];
}
