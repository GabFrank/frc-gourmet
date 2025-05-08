import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { ObservacionProducto } from './observacion-producto.entity';
import type { VentaItem } from '../ventas/venta-item.entity';

/**
 * Entity representing a relationship between product observation and sale item
 */
@Entity('observaciones_productos_ventas_items')
export class ObservacionProductoVentaItem extends BaseModel {
  @Column({ name: 'observacion_producto_id' })
  observacionProductoId!: number;

  @ManyToOne('ObservacionProducto')
  @JoinColumn({ name: 'observacion_producto_id' })
  observacionProducto!: ObservacionProducto;

  @Column({ name: 'venta_item_id' })
  ventaItemId!: number;

  @ManyToOne('VentaItem')
  @JoinColumn({ name: 'venta_item_id' })
  ventaItem!: VentaItem;

  @Column({ type: 'int' })
  cantidad!: number;
} 