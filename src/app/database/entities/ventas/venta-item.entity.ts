import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Venta } from './venta.entity';
import { PrecioVenta } from '../productos/precio-venta.entity';
import { Producto } from '../productos/producto.entity';
import { Presentacion, TipoMedida } from '../productos/presentacion.entity';
import { Usuario } from '../personas/usuario.entity';

export enum EstadoVentaItem {
  ACTIVO = 'ACTIVO',
  MODIFICADO = 'MODIFICADO',
  CANCELADO = 'CANCELADO'
}

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
    name: 'precio_costo_unitario', 
    type: 'decimal', 
    precision: 10, 
    scale: 2 
  })
  precioCostoUnitario!: number;

  @Column({ 
    name: 'precio_venta_unitario', 
    type: 'decimal', 
    precision: 10, 
    scale: 2 
  })
  precioVentaUnitario!: number;

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
    name: 'descuento_unitario',
    precision: 10, 
    scale: 2, 
    default: 0 
  })
  descuentoUnitario!: number;

  @Column({
    type: 'varchar',
    name: 'estado',
    enum: EstadoVentaItem,
    default: EstadoVentaItem.ACTIVO
  })
  estado!: EstadoVentaItem;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'cancelado_por_id' })
  canceladoPor: Usuario | null = null;

  @Column({ name: 'hora_cancelado', nullable: true })
  horaCancelado!: Date;

  @Column({ name: 'modificado', default: false })
  modificado!: boolean;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'modificado_por_id' })
  modificadoPor: Usuario | null = null;

  @Column({ name: 'hora_modificacion', nullable: true })
  horaModificacion!: Date;

  @ManyToOne(() => VentaItem, { nullable: true })
  @JoinColumn({ name: 'nueva_version_venta_item_id' })
  nuevaVersionVentaItem!: VentaItem;
} 