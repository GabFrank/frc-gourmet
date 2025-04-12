import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from '../financiero/moneda.entity';
import { CompraEstado } from './estado.enum';
import { TipoBoleta } from './tipo-boleta.enum';
import { FormasPago } from './forma-pago.entity';
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

  @Column({ default: false, name: 'is_recepcion_mercaderia' })
  isRecepcionMercaderia!: boolean;

  @Column({ default: true })
  activo!: boolean;

  @Column({ nullable: true, name: 'numero_nota', type: 'varchar', length: 100 })
  numeroNota?: string;

  @Column({
    nullable: true,
    type: 'text',
    enum: TipoBoleta,
    name: 'tipo_boleta'
  })
  tipoBoleta?: TipoBoleta;

  @Column({ nullable: true, name: 'fecha_compra', type: 'date' })
  fechaCompra?: Date;

  @Column({ default: false })
  credito!: boolean;

  @Column({ nullable: true, name: 'plazo_dias', type: 'int' })
  plazoDias?: number;

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

  @ManyToOne(() => FormasPago, { nullable: true })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago?: FormasPago;

  @OneToMany('CompraDetalle', 'compra')
  detalles!: CompraDetalle[];
}
