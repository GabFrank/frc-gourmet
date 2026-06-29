import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Factura } from './factura.entity';
import { VentaItem } from '../ventas/venta-item.entity';
import { Producto } from '../productos/producto.entity';

/**
 * Linea/detalle de una factura. Puede originarse en un `VentaItem` o cargarse
 * manualmente. `ivaTipo` indica la tasa aplicada (0=exenta, 5, 10).
 */
@Entity('factura_items')
export class FacturaItem extends BaseModel {
  @ManyToOne(() => Factura, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'factura_id' })
  factura!: Factura;

  @ManyToOne(() => VentaItem, { nullable: true })
  @JoinColumn({ name: 'venta_item_id' })
  ventaItem?: VentaItem;

  @ManyToOne(() => Producto, { nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @Column()
  descripcion!: string;

  @Column({ type: 'decimal', precision: 18, scale: 3, default: 1 })
  cantidad!: number;

  @Column({ nullable: true, name: 'unidad_medida' })
  unidadMedida?: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, name: 'precio_unitario' })
  precioUnitario!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  descuento!: number;

  /** Tasa de IVA aplicada: 0 (exenta), 5 o 10. */
  @Column({ type: 'int', default: 10, name: 'iva_tipo' })
  ivaTipo!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  total!: number;
}
