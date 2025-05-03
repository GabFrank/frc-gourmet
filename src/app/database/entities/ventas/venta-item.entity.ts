import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Venta } from './venta.entity';
import { PrecioVenta } from '../productos/precio-venta.entity';
import { Producto } from '../productos/producto.entity';
import { Presentacion, TipoMedida } from '../productos/presentacion.entity';

/**
 * Entity representing a sale item
 */
@Entity('venta_items')
export class VentaItem extends BaseModel {
  @ManyToOne('Venta', 'items')
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta;

  @Column({
    type: 'varchar',
    name: 'tipo_medida',
    enum: TipoMedida,
    default: TipoMedida.UNIDAD
  })
  tipoMedida!: TipoMedida;

  @Column({ 
    name: 'precio_costo_total', 
    type: 'decimal', 
    precision: 10, 
    scale: 2 
  })
  precioCostoTotal!: number;

  @Column({ 
    name: 'precio_venta_total', 
    type: 'decimal', 
    precision: 10, 
    scale: 2 
  })
  precioVentaTotal!: number;

  @ManyToOne(() => PrecioVenta)
  @JoinColumn({ name: 'precio_venta_presentacion_id' })
  precioVentaPresentacion!: PrecioVenta;

  @ManyToOne(() => Producto)
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @ManyToOne(() => Presentacion)
  @JoinColumn({ name: 'presentacion_id' })
  presentacion!: Presentacion;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cantidad!: number;

  @Column({ 
    type: 'decimal', 
    precision: 10, 
    scale: 2, 
    default: 0 
  })
  descuento!: number;
} 