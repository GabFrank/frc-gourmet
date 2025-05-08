import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { ProductoAdicional } from './producto-adicional.entity';
import type { VentaItem } from '../ventas/venta-item.entity';

/**
 * Entity representing a relationship between product additional and sale item
 */
@Entity('productos_adicionales_ventas_items')
export class ProductoAdicionalVentaItem extends BaseModel {
  @Column({ name: 'producto_adicional_id' })
  productoAdicionalId!: number;

  @ManyToOne('ProductoAdicional')
  @JoinColumn({ name: 'producto_adicional_id' })
  productoAdicional!: ProductoAdicional;

  @Column({ name: 'venta_item_id' })
  ventaItemId!: number;

  @ManyToOne('VentaItem')
  @JoinColumn({ name: 'venta_item_id' })
  ventaItem!: VentaItem;

  @Column({ type: 'int' })
  cantidad!: number;
} 