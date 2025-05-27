import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Presentacion } from './presentacion.entity';
import type { Sabor } from './sabor.entity';
import type { Receta } from './receta.entity';

/**
 * Entity representing the relationship between a presentation and a flavor
 */
@Entity('presentacion_sabores')
export class PresentacionSabor extends BaseModel {
  @Column({ name: 'presentacion_id' })
  presentacionId!: number;

  @ManyToOne('Presentacion', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion!: Presentacion;

  @Column({ name: 'sabor_id' })
  saborId!: number;

  @ManyToOne('Sabor', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sabor_id' })
  sabor!: Sabor;

  @Column({ name: 'receta_id', nullable: true })
  recetaId?: number;

  @ManyToOne('Receta', { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receta_id' })
  receta?: Receta;

  @Column({ default: true })
  activo!: boolean;
}
