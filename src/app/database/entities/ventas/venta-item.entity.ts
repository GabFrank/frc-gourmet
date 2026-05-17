import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Venta } from './venta.entity';
import { Usuario } from '../personas/usuario.entity';
import type { Producto } from '../productos/producto.entity';
import type { Presentacion } from '../productos/presentacion.entity';
import type { PrecioVenta } from '../productos/precio-venta.entity';
import type { RecetaPresentacion } from '../productos/receta-presentacion.entity';
import type { VentaItemSabor } from './venta-item-sabor.entity';

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

  // add onDelete: 'CASCADE'
  @ManyToOne('Venta', 'items', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta;

  // @Column({
  //   type: 'varchar',
  //   name: 'tipo_medida',
  //   enum: TipoMedida,
  //   default: TipoMedida.UNIDAD
  // })
  // tipoMedida!: TipoMedida;

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

  @ManyToOne('PrecioVenta', { nullable: true })
  @JoinColumn({ name: 'precio_venta_presentacion_id' })
  precioVentaPresentacion!: PrecioVenta;

  @ManyToOne('Producto')
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @ManyToOne('Presentacion')
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

  @Column({ name: 'historial_cambios', type: 'text', nullable: true })
  historialCambios?: string;

  @Column({ name: 'precio_adicionales', type: 'decimal', precision: 10, scale: 2, default: 0 })
  precioAdicionales!: number;

  // Campos para productos ELABORADO_CON_VARIACION (pizzas, etc.)
  @ManyToOne('RecetaPresentacion', { nullable: true })
  @JoinColumn({ name: 'receta_presentacion_id' })
  recetaPresentacion?: RecetaPresentacion;

  @Column({ name: 'ensamblado_descripcion', type: 'varchar', length: 500, nullable: true })
  ensambladoDescripcion?: string;

  @Column({ name: 'cantidad_sabores', type: 'int', default: 0 })
  cantidadSabores!: number;

  @OneToMany('VentaItemSabor', 'ventaItem')
  saboresVenta?: VentaItemSabor[];

  // Vendedor explícito por ítem (para split de comisiones)
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'vendedor_id' })
  vendedor?: Usuario;

  // ─── Impresión de comanda de cocina (sistema documentos) ────────────────
  // `impreso` queda en true SOLO cuando todas las impresiones del item se
  // completaron (todos sus sectores recibieron el ticket). Para detalle
  // por-sector ver `impresiones`.
  @Column({ default: false })
  impreso!: boolean;

  @Column({ nullable: true, name: 'fecha_impresion' })
  fechaImpresion?: Date;

  // JSON serializado: `[{sectorId, printerId, ts, ok, error?}]` con el log
  // de cada intento de impresión. Permite reimprimir solo lo que falló por
  // sector y auditar quién imprimió qué cuándo.
  @Column({ type: 'text', nullable: true })
  impresiones?: string;
}
