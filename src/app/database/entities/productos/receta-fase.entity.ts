import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Receta } from './receta.entity';

/**
 * Fase del modo de preparo de una receta (ej. "FASE 1 - SOFRITO"). Lista ordenada
 * por `orden`. Cada fase puede vincular cuáles ítems de la receta (RecetaIngrediente)
 * participan en ella, vía RecetaFaseIngrediente.
 */
@Entity('receta_fase')
export class RecetaFase extends BaseModel {
  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  titulo?: string;

  @Column({ type: 'text' })
  descripcion!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @ManyToOne('Receta', 'fases', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receta_id' })
  receta!: Receta;

  @OneToMany('RecetaFaseIngrediente', 'fase')
  ingredientes?: any[];
}
