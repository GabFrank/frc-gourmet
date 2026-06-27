import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Receta } from './receta.entity';

/**
 * Material / utensilio necesario para preparar una receta (ej. "OLLA A PRESIÓN DE
 * 20 LITROS"). Solo texto + orden.
 */
@Entity('receta_material')
export class RecetaMaterial extends BaseModel {
  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @ManyToOne('Receta', 'materiales', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receta_id' })
  receta!: Receta;
}
