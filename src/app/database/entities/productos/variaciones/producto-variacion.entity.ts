import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import type { ProductoBase } from '../core/producto-base.entity';
import type { Receta } from '../recetas/receta.entity';
import type { ProductoPresentacion } from '../comercial/producto-presentacion.entity';

/**
 * Tipos de variación de productos
 */
export enum TipoVariacion {
  TAMAÑO = 'TAMAÑO',      // Grande, Mediano, Chico
  SABOR = 'SABOR',        // Calabresa, Pepperoni, etc.
  OTRO = 'OTRO'           // Otros tipos de variaciones
}

/**
 * Entity representing product variations (sizes, flavors, etc.)
 */
@Entity('producto_variaciones')
export class ProductoVariacion extends BaseModel {
  @Column({ name: 'producto_base_id' })
  productoBaseId!: number;

  @ManyToOne('ProductoBase', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_base_id' })
  productoBase!: ProductoBase;

  @Column()
  nombre!: string; // Ej: "Grande", "Mediano", "Calabresa", "Pepperoni"

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({
    type: 'varchar',
    name: 'tipo_variacion',
    enum: TipoVariacion
  })
  tipoVariacion!: TipoVariacion;

  // Receta específica para esta variación
  @Column({ name: 'receta_id', nullable: true })
  recetaId?: number;

  @ManyToOne('Receta', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receta_id' })
  receta?: Receta;

  // Orden de visualización
  @Column({ default: 0 })
  orden!: number;

  // Para pizzas: máximo de sabores que se pueden combinar
  @Column({ type: 'int', nullable: true, name: 'max_sabores_combinados' })
  maxSaboresCombinados?: number;

  // URL de imagen específica para esta variación
  @Column({ nullable: true, name: 'image_url' })
  imageUrl?: string;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('ProductoPresentacion', 'variacionTamaño', { nullable: true })
  presentacionesTamaño!: ProductoPresentacion[];

  @OneToMany('ProductoPresentacion', 'variacionSabor', { nullable: true })
  presentacionesSabor!: ProductoPresentacion[];
} 