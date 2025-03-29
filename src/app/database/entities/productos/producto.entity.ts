import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import type { Subcategoria } from './subcategoria.entity';
import { BaseModel } from '../base.entity';
import type { ProductoImage } from './producto-image.entity';
import type { Presentacion } from './presentacion.entity';
import type { Receta } from './receta.entity';
import type { IntercambioIngrediente } from './intercambio-ingrediente.entity';

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

  @ManyToOne('Subcategoria', 'productos')
  @JoinColumn({ name: 'subcategoria_id' })
  subcategoria!: Subcategoria;

  @Column({ name: 'receta_id', nullable: true })
  recetaId?: number;

  @ManyToOne('Receta', { nullable: true })
  @JoinColumn({ name: 'receta_id' })
  receta?: Receta;

  @OneToMany('ProductoImage', 'producto')
  images!: ProductoImage[];

  @OneToMany('Presentacion', 'producto')
  presentaciones!: Presentacion[];

  @OneToMany('IntercambioIngrediente', 'producto')
  intercambioIngredientes!: IntercambioIngrediente[];
}
