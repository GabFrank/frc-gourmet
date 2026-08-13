import { Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { RecetaFase } from './receta-fase.entity';
import type { RecetaIngrediente } from './receta-ingrediente.entity';

/**
 * Vincula una fase de preparo con un ítem de la receta (RecetaIngrediente) que
 * participa en ella. Se referencia el ítem de receta (no el Producto) para soportar
 * también ítems solo-descripción sin ingrediente vinculado.
 */
@Entity('receta_fase_ingrediente')
export class RecetaFaseIngrediente extends BaseModel {
  @ManyToOne('RecetaFase', 'ingredientes', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fase_id' })
  fase!: RecetaFase;

  @ManyToOne('RecetaIngrediente', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receta_ingrediente_id' })
  recetaIngrediente!: RecetaIngrediente;
}
