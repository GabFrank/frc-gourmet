import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import type { ProductoBase } from '../core/producto-base.entity';
import type { ProductoVariacion } from '../variaciones/producto-variacion.entity';
import type { UnidadMedida } from '../core/unidad-medida.entity';
import type { Receta } from '../recetas/receta.entity';
import type { PrecioVenta } from './precio-venta.entity';
import type { Codigo } from './codigo.entity';

/**
 * Entity representing a product presentation
 * Handles retail products, elaborated products with variations, and combos
 */
@Entity('producto_presentaciones')
export class ProductoPresentacion extends BaseModel {
  @Column({ name: 'producto_base_id' })
  productoBaseId!: number;

  @ManyToOne('ProductoBase', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_base_id' })
  productoBase!: ProductoBase;

  @Column()
  nombre!: string; // Ej: "Coca Cola 500ml", "Pizza Grande Pepperoni", "Combo Hamburguesa"

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  // Para productos con variaciones de tamaño
  @Column({ name: 'variacion_tamaño_id', nullable: true })
  variacionTamañoId?: number;

  @ManyToOne('ProductoVariacion', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variacion_tamaño_id' })
  variacionTamaño?: ProductoVariacion;

  // Para productos con variaciones de sabor
  @Column({ name: 'variacion_sabor_id', nullable: true })
  variacionSaborId?: number;

  @ManyToOne('ProductoVariacion', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'variacion_sabor_id' })
  variacionSabor?: ProductoVariacion;

  // Unidad de medida y cantidad para esta presentación
  @Column({ name: 'unidad_medida_id' })
  unidadMedidaId!: number;

  @ManyToOne('UnidadMedida', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_medida_id' })
  unidadMedida!: UnidadMedida;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  cantidad!: number;

  // Receta específica para esta presentación (para casos especiales)
  @Column({ name: 'receta_id', nullable: true })
  recetaId?: number;

  @ManyToOne('Receta', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receta_id' })
  receta?: Receta;

  // Receta de packaging para delivery (si aplica)
  @Column({ name: 'receta_packaging_id', nullable: true })
  recetaPackagingId?: number;

  @ManyToOne('Receta', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receta_packaging_id' })
  recetaPackaging?: Receta;

  // Indicadores
  @Column({ default: false })
  principal!: boolean; // Presentación principal del producto

  @Column({ default: true })
  disponibleVenta!: boolean;

  @Column({ default: false })
  disponibleDelivery!: boolean;

  @Column({ default: true })
  activo!: boolean;

  // URL de imagen específica para esta presentación
  @Column({ nullable: true, name: 'image_url' })
  imageUrl?: string;

  @OneToMany('PrecioVenta', 'presentacion', { onDelete: 'CASCADE' })
  precios!: PrecioVenta[];

  @OneToMany('Codigo', 'presentacion', { onDelete: 'CASCADE' })
  codigos!: Codigo[];

  // Campo calculado para el costo total (incluye producto + packaging)
  costoTotal?: number;
} 