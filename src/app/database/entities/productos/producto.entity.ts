import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { Subcategoria } from './subcategoria.entity';
import { BaseModel } from '../base.entity';
import { ProductoImage } from './producto-image.entity';
import { Presentacion } from './presentacion.entity';

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

  @ManyToOne(() => Subcategoria, subcategoria => subcategoria.productos)
  @JoinColumn({ name: 'subcategoria_id' })
  subcategoria!: Subcategoria;

  @OneToMany(() => ProductoImage, productoImage => productoImage.producto)
  images!: ProductoImage[];
  
  @OneToMany(() => Presentacion, presentacion => presentacion.producto)
  presentaciones!: Presentacion[];
} 