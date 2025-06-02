import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import type { Receta } from './receta.entity';
import type { Ingrediente } from '../core/ingrediente.entity';
import type { UnidadMedida } from '../core/unidad-medida.entity';

/**
 * Entity representing an item (ingredient) within a recipe
 */
@Entity('receta_items')
export class RecetaItem extends BaseModel {
  @Column({ name: 'receta_id' })
  recetaId!: number;

  @ManyToOne('Receta', 'items', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receta_id' })
  receta!: Receta;

  @Column({ name: 'ingrediente_id' })
  ingredienteId!: number;

  @ManyToOne('Ingrediente', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ingrediente_id' })
  ingrediente!: Ingrediente;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  cantidad!: number;

  @Column({ name: 'unidad_medida_id' })
  unidadMedidaId!: number;

  @ManyToOne('UnidadMedida', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_medida_id' })
  unidadMedida!: UnidadMedida;

  @Column({ default: 0 })
  orden!: number; // Orden en la receta

  @Column({ default: true })
  activo!: boolean;

  // Campo calculado
  costoItem?: number; // Costo de este item en la receta
}
