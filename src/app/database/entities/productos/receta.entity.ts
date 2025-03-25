import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { RecetaItem } from './receta-item.entity';

/**
 * Entity representing a product recipe
 */
@Entity('producto_recetas')
export class Receta extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  modo_preparo?: string;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('RecetaItem', 'receta')
  items!: RecetaItem[];
}
