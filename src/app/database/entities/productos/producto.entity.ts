import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import type { Subcategoria } from './subcategoria.entity';
import { BaseModel } from '../base.entity';
import type { ProductoImage } from './producto-image.entity';
import type { Presentacion } from './presentacion.entity';
import type { Receta } from './receta.entity';
import type { IntercambioIngrediente } from './intercambio-ingrediente.entity';
import type { ObservacionProducto } from './observacion-producto.entity';
import type { ProductoAdicional } from './producto-adicional.entity';
import type { CostoPorProducto } from './costo-por-producto.entity';
import { RecetaVariacion } from './receta-variacion.entity';

/**
 * Entity representing a product
 */
@Entity('productos')
export class Producto extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true, name: 'nombre_alternativo' })
  nombreAlternativo?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 10 })
  iva!: number;

  @Column({ default: false, name: 'is_pesable' })
  isPesable!: boolean;

  @Column({ default: false, name: 'is_combo' })
  isCombo!: boolean;

  @Column({ default: false, name: 'is_compuesto' })
  isCompuesto!: boolean;

  @Column({ default: false, name: 'is_ingrediente' })
  isIngrediente!: boolean;

  @Column({ default: false, name: 'is_promocion' })
  isPromocion!: boolean;

  @Column({ default: true, name: 'is_vendible' })
  isVendible!: boolean;

  @Column({ default: false, name: 'has_vencimiento' })
  hasVencimiento!: boolean;

  @Column({ default: false, name: 'has_stock' })
  hasStock!: boolean;

  @Column({ default: false, name: 'has_variaciones' })
  hasVariaciones!: boolean;

  @Column({ nullable: true, type: 'text' })
  observacion?: string;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ nullable: true, name: 'alertar_vencimiento_dias' })
  alertarVencimientoDias?: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ name: 'subcategoria_id' })
  subcategoriaId!: number;

  @ManyToOne('Subcategoria', 'productos', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subcategoria_id' })
  subcategoria!: Subcategoria;

  // replace receta with recetaVariacion
  @ManyToOne('RecetaVariacion', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receta_variacion_id' })
  recetaVariacion?: RecetaVariacion;

  @Column({ name: 'receta_variacion_id', nullable: true })
  recetaVariacionId?: number;

  @OneToMany('ProductoImage', 'producto', { onDelete: 'CASCADE' })
  images!: ProductoImage[];

  @OneToMany('Presentacion', 'producto', { onDelete: 'CASCADE' })
  presentaciones!: Presentacion[];

  @OneToMany('IntercambioIngrediente', 'producto', { onDelete: 'CASCADE' })
  intercambioIngredientes!: IntercambioIngrediente[];
  
  @OneToMany('ObservacionProducto', 'producto', { onDelete: 'CASCADE' })
  observacionesProductos!: ObservacionProducto[];
  
  @OneToMany('ProductoAdicional', 'producto', { onDelete: 'CASCADE' })
  productosAdicionales!: ProductoAdicional[];

  @OneToMany('CostoPorProducto', 'producto', { onDelete: 'CASCADE' })
  costos!: CostoPorProducto[];
}
