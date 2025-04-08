import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Receta } from './receta.entity';
import type { RecetaVariacionItem } from './receta-variacion-item.entity';

/**
 * Entity representing a variation of a recipe
 */
@Entity('producto_receta_variaciones')
export class RecetaVariacion extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  principal!: boolean;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ name: 'receta_id' })
  recetaId!: number;

  @ManyToOne('Receta', 'variaciones')
  @JoinColumn({ name: 'receta_id' })
  receta!: Receta;

  /**
   * Total cost of the variation, calculated from the sum of all ingredients' costs
   * This field is stored in the database for reference but should be updated whenever
   * ingredients or their quantities change
   */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costo!: number;

  @OneToMany('RecetaVariacionItem', 'variacion')
  items!: RecetaVariacionItem[];
}
