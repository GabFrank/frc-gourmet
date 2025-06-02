import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import type { Subcategoria } from '../categorias/subcategoria.entity';
import type { ProductoImage } from '../gestion/producto-image.entity';

/**
 * Tipos de productos en el sistema
 */
export enum TipoProducto {
  RETAIL = 'RETAIL',              // Productos simples de venta directa (gaseosas, chocolates)
  ELABORADO = 'ELABORADO',        // Productos que requieren receta (hamburguesas, pizzas)
  INGREDIENTE = 'INGREDIENTE',    // Ingredientes que pueden ser comprados o elaborados
  COMBO = 'COMBO',               // Combinaciones de productos
  PACKAGING = 'PACKAGING'        // Elementos de empaque para delivery
}

/**
 * Entity representing the base product information
 */
@Entity('productos_base')
export class ProductoBase extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true, name: 'nombre_alternativo' })
  nombreAlternativo?: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({
    type: 'varchar',
    name: 'tipo_producto',
    enum: TipoProducto
  })
  tipoProducto!: TipoProducto;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 10 })
  iva!: number;

  @Column({ default: false, name: 'is_pesable' })
  isPesable!: boolean;

  @Column({ default: false, name: 'has_vencimiento' })
  hasVencimiento!: boolean;

  @Column({ default: false, name: 'has_stock' })
  hasStock!: boolean;

  @Column({ default: false, name: 'has_variaciones' })
  hasVariaciones!: boolean; // Para productos con sabores/tamaños

  @Column({ default: false, name: 'requiere_packaging' })
  requierePackaging!: boolean; // Para delivery

  @Column({ nullable: true, name: 'alertar_vencimiento_dias' })
  alertarVencimientoDias?: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ name: 'subcategoria_id' })
  subcategoriaId!: number;

  @ManyToOne('Subcategoria', 'productos', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subcategoria_id' })
  subcategoria!: Subcategoria;

  @OneToMany('ProductoImage', 'producto', { onDelete: 'CASCADE' })
  images!: ProductoImage[];
} 