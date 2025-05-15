import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Producto } from './producto.entity';
import { Moneda } from '../financiero/moneda.entity';

/**
 * Origen del costo para un producto
 */
export enum OrigenCosto {
  COMPRA = 'COMPRA',
  MANUAL = 'MANUAL'
}

/**
 * Entity representing a product cost
 */
@Entity('costos_por_producto')
export class CostoPorProducto extends BaseModel {
  @Column({ name: 'producto_id' })
  productoId!: number;

  @ManyToOne(() => Producto, producto => producto.costos)
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({
    type: 'varchar',
    name: 'origen_costo',
    enum: OrigenCosto,
    default: OrigenCosto.MANUAL
  })
  origenCosto!: OrigenCosto;

  @Column({ name: 'moneda_id' })
  monedaId!: number;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor!: number;
  
  @Column({ type: 'boolean', default: true })
  principal!: boolean;
  
  /**
   * Calculated field for the value in the principal currency
   * This is not stored in the database but calculated when needed
   */
  valorMonedaPrincipal?: number;
} 