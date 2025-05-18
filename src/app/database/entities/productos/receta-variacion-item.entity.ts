import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { RecetaVariacion } from './receta-variacion.entity';
import type { Ingrediente } from './ingrediente.entity';

/**
 * Entity representing an ingredient in a recipe variation
 */
@Entity('producto_receta_variacion_items')
export class RecetaVariacionItem extends BaseModel {
  @Column({ name: 'variacion_id' })
  variacionId!: number;

  // add onDelete: 'CASCADE'
  @ManyToOne('RecetaVariacion', 'items', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variacion_id' })
  variacion!: RecetaVariacion;

  @Column({ name: 'ingrediente_id' })
  ingredienteId!: number;

  @ManyToOne('Ingrediente', 'variacionItems')
  @JoinColumn({ name: 'ingrediente_id' })
  ingrediente!: Ingrediente;

  // add porcentaje_aprovechamiento
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  porcentajeAprovechamiento!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cantidad!: number;

  @Column({ default: true })
  activo!: boolean;
}
