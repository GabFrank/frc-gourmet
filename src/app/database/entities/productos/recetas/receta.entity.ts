import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import type { ProductoBase } from '../core/producto-base.entity';
import type { UnidadMedida } from '../core/unidad-medida.entity';
import type { RecetaItem } from './receta-item.entity';

/**
 * Tipos de receta en el sistema
 */
export enum TipoReceta {
  PRODUCTO = 'PRODUCTO',        // Receta para un producto elaborado
  INGREDIENTE = 'INGREDIENTE',  // Receta para elaborar un ingrediente
  PACKAGING = 'PACKAGING'       // Receta para packaging de delivery
}

/**
 * Entity representing a recipe
 */
@Entity('recetas')
export class Receta extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'text', nullable: true })
  instruccionesPreparacion?: string;

  @Column({
    type: 'varchar',
    name: 'tipo_receta',
    enum: TipoReceta
  })
  tipoReceta!: TipoReceta;

  // Producto base al que pertenece esta receta (puede ser null para recetas base)
  @Column({ name: 'producto_base_id', nullable: true })
  productoBaseId?: number;

  @ManyToOne('ProductoBase', { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_base_id' })
  productoBase?: ProductoBase;

  // Unidad de medida de salida de la receta
  @Column({ name: 'unidad_medida_salida_id' })
  unidadMedidaSalidaId!: number;

  @ManyToOne('UnidadMedida', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_medida_salida_id' })
  unidadMedidaSalida!: UnidadMedida;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  cantidadSalida!: number; // Cantidad que produce esta receta

  // Tiempo de preparación en minutos
  @Column({ type: 'int', nullable: true })
  tiempoPreparacionMinutos?: number;

  @Column({ default: true })
  activo!: boolean;

  // Costo calculado de la receta (se calcula automáticamente)
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  costoCalculado!: number;

  @OneToMany('RecetaItem', 'receta', { onDelete: 'CASCADE' })
  items!: RecetaItem[];
} 