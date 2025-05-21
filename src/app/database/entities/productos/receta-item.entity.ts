import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Receta } from './receta.entity';
import type { Ingrediente } from './ingrediente.entity';

/**
 * Entity representing a recipe item/ingredient
 */
@Entity('producto_receta_items')
export class RecetaItem extends BaseModel {
  @Column({ name: 'receta_id' })
  recetaId!: number;

  @ManyToOne('Receta', 'items', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receta_id' })
  receta!: Receta;

  @Column({ name: 'ingrediente_id' })
  ingredienteId!: number;

  // add onDelete: 'CASCADE'
  @ManyToOne('Ingrediente', 'recetaItems', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ingrediente_id' })
  ingrediente!: Ingrediente;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cantidad!: number;

  @Column({ default: true })
  activo!: boolean;
}
